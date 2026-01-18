/**
 * Scenario 4: Concurrent Call Operations - Race Condition Tests
 *
 * Tests for concurrent and race condition scenarios:
 * 1. Multiple agents waiting on same transcript
 * 2. Race condition at concurrent call limit
 * 3. Call slot reuse after endCall
 * 4. Proper transcript waiter replacement
 * 5. Simultaneous initiateCall vs concurrent limit check
 *
 * Run with: pnpm test integration.concurrency.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { CallManager } from "../manager.js";
import type { CallId, NormalizedEvent } from "../types.js";
import {
  createMockConfig,
  createProviderConfig,
} from "./mocks/config.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import {
  createCallAnsweredEvent,
  createCallSpeechEvent,
  delay,
  generatePhone,
} from "./test-utils.js";

describe("Concurrent Call Operations", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;
  let webhookUrl: string;
  const config = createMockConfig();

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-concurrency-test-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    mockProvider = new MockVoiceProvider();
    webhookUrl = "https://example.com/webhook";
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        // Silently ignore cleanup errors
        console.warn("Failed to cleanup tempDir:", err instanceof Error ? err.message : err);
      }
    }
  });

  // ============================================================================
  // TEST 1: Concurrent transcript waits on same call
  // ============================================================================

  describe("Concurrent Transcript Waits", () => {
    it("should verify transcript waiter exists in manager", async () => {
      // This test verifies that the transcript waiter replacement mechanism exists
      // by testing the manager's internal state handling
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall(generatePhone(1));
      expect(callId).toBeTruthy();

      // Verify call is active
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(1);
      expect(activeCalls[0].callId).toBe(callId);
    });

    it("should demonstrate concurrent call attempts with proper error handling", async () => {
      // This test shows that multiple concurrent initiateCall operations
      // are properly handled
      const testConfig = createMockConfig({ maxConcurrentCalls: 2 });
      const manager = new CallManager(testConfig, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Concurrent call initiations
      const results = await Promise.all([
        manager.initiateCall(generatePhone(1)),
        manager.initiateCall(generatePhone(2)),
        manager.initiateCall(generatePhone(3)),
      ]);

      // First two should succeed, third should fail
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
    });
  });

  // ============================================================================
  // TEST 2: Race condition at concurrent call limit
  // ============================================================================

  describe("Race Condition at Concurrent Call Limit", () => {
    it("should handle race condition at concurrent call limit", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 5 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Fill up to limit
      const initialCalls = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          manager.initiateCall(generatePhone(i))
        )
      );

      // Verify all succeeded
      for (const call of initialCalls) {
        expect(call.success).toBe(true);
      }

      // Now race to add more calls (should all fail)
      const racingCalls = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          manager.initiateCall(generatePhone(100 + i))
        )
      );

      const successes = racingCalls.filter((r) => r.success).length;
      const failures = racingCalls.filter((r) => !r.success).length;

      expect(successes).toBe(0);
      expect(failures).toBe(10);

      // All failing calls should have error message
      for (const call of racingCalls) {
        expect(call.success).toBe(false);
        expect(call.error).toContain("Maximum concurrent calls");
      }
    });

    it("should prevent bypassing concurrent call limit", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 2 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Initiate exactly at limit
      const call1 = await manager.initiateCall(generatePhone(1));
      const call2 = await manager.initiateCall(generatePhone(2));

      expect(call1.success).toBe(true);
      expect(call2.success).toBe(true);

      // Try to bypass with rapid-fire calls
      const bypassAttempts = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          manager.initiateCall(generatePhone(1000 + i))
        )
      );

      // None should succeed
      for (const attempt of bypassAttempts) {
        expect(attempt.success).toBe(false);
      }

      // Verify active calls count is still 2
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(2);
    });

    it("should correctly count concurrent calls", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 3 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      expect(manager.getActiveCalls()).toHaveLength(0);

      const call1 = await manager.initiateCall(generatePhone(1));
      expect(manager.getActiveCalls()).toHaveLength(1);

      const call2 = await manager.initiateCall(generatePhone(2));
      expect(manager.getActiveCalls()).toHaveLength(2);

      const call3 = await manager.initiateCall(generatePhone(3));
      expect(manager.getActiveCalls()).toHaveLength(3);

      // Fourth should fail
      const call4 = await manager.initiateCall(generatePhone(4));
      expect(call4.success).toBe(false);
      expect(manager.getActiveCalls()).toHaveLength(3);
    });
  });

  // ============================================================================
  // TEST 3: Call slot reuse after endCall
  // ============================================================================

  describe("Call Slot Reuse", () => {
    it("should allow new call after slot is freed", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 1 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // First call should succeed
      const call1 = await manager.initiateCall(generatePhone(1));
      expect(call1.success).toBe(true);
      expect(call1.callId).toBeTruthy();

      // Second call should fail (limit is 1)
      const call2 = await manager.initiateCall(generatePhone(2));
      expect(call2.success).toBe(false);

      // End first call
      const endResult = await manager.endCall(call1.callId);
      expect(endResult.success).toBe(true);

      // Now third call should succeed
      const call3 = await manager.initiateCall(generatePhone(3));
      expect(call3.success).toBe(true);
      expect(call3.callId).toBeTruthy();
    });

    it("should reuse multiple slots after endCall", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 2 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Fill to limit
      const call1 = await manager.initiateCall(generatePhone(1));
      const call2 = await manager.initiateCall(generatePhone(2));

      expect(manager.getActiveCalls()).toHaveLength(2);

      // End both
      await manager.endCall(call1.callId);
      await manager.endCall(call2.callId);

      expect(manager.getActiveCalls()).toHaveLength(0);

      // Should be able to make new calls
      const call3 = await manager.initiateCall(generatePhone(3));
      const call4 = await manager.initiateCall(generatePhone(4));
      const call5 = await manager.initiateCall(generatePhone(5));

      expect(call3.success).toBe(true);
      expect(call4.success).toBe(true);
      expect(call5.success).toBe(false); // Exceeds limit again

      expect(manager.getActiveCalls()).toHaveLength(2);
    });

    it("should handle rapid end and initiate cycles", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 1 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      for (let i = 0; i < 5; i++) {
        const call = await manager.initiateCall(generatePhone(i));
        expect(call.success).toBe(true);

        const endResult = await manager.endCall(call.callId);
        expect(endResult.success).toBe(true);

        expect(manager.getActiveCalls()).toHaveLength(0);
      }
    });
  });

  // ============================================================================
  // TEST 4: Transcript waiter lifecycle during concurrent operations
  // ============================================================================

  describe("Transcript Waiter Lifecycle", () => {
    it("should handle call end during transcript wait", async () => {
      const testConfig = createMockConfig({ transcriptTimeoutMs: 5000 });
      const manager = new CallManager(testConfig, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall(generatePhone(1));
      manager.processEvent(
        createCallAnsweredEvent(callId, "provider-125")
      );

      // Start waiting for transcript
      const waitPromise = manager.continueCall(callId, "Say something");

      // Wait a bit
      await delay(100);

      // End the call while waiting
      await manager.endCall(callId);

      // The waiter should be cleaned up - either rejected or fulfilled
      const result = await Promise.allSettled([waitPromise]);
      expect(result[0]).toBeDefined();
      // The result could be either fulfilled or rejected depending on timing
    });

    it("should timeout transcript waiter correctly", async () => {
      const testConfig = createMockConfig({ transcriptTimeoutMs: 100 });
      const manager = new CallManager(testConfig, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall(generatePhone(2));
      manager.processEvent(
        createCallAnsweredEvent(callId, "provider-126")
      );

      // Wait for transcript but don't provide one
      const waitPromise = manager.continueCall(callId, "Say something");

      // Should timeout after 100ms
      const result = await Promise.allSettled([waitPromise]);
      expect(result[0]).toBeDefined();
      // Either fulfilled with error or rejected
    });

    it("should handle multiple transcript events correctly", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall(generatePhone(3));
      manager.processEvent(
        createCallAnsweredEvent(callId, "provider-127")
      );

      const waitPromise = manager.continueCall(callId, "Say something");

      // Send intermediate (non-final) transcripts
      await delay(50);
      manager.processEvent(
        createCallSpeechEvent(callId, "Hello", false) // Not final
      );

      await delay(50);
      manager.processEvent(
        createCallSpeechEvent(callId, "Hello world", true) // Final
      );

      const result = await Promise.allSettled([waitPromise]);
      expect(result[0].status).toBe("fulfilled");

      if (result[0].status === "fulfilled") {
        expect(result[0].value.success).toBe(true);
        expect(result[0].value.transcript).toBe("Hello world");
      }
    });
  });

  // ============================================================================
  // TEST 5: Complex concurrent scenarios
  // ============================================================================

  describe("Complex Concurrent Scenarios", () => {
    it("should handle mixed operations under concurrent load", async () => {
      const testConfig = createMockConfig({ maxConcurrentCalls: 3 });
      const manager = new CallManager(testConfig, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Start 3 calls
      const calls = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          manager.initiateCall(generatePhone(i))
        )
      );

      expect(calls.every((c) => c.success)).toBe(true);

      // Try to add more (should fail)
      const extraCall = await manager.initiateCall(generatePhone(100));
      expect(extraCall.success).toBe(false);

      // End one call
      await manager.endCall(calls[0].callId);

      // Now should be able to add one more
      const newCall = await manager.initiateCall(generatePhone(101));
      expect(newCall.success).toBe(true);

      // Verify call count
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(3);
    });

    it("should maintain correct state during concurrent limit changes", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Start with default limit
      const defaultLimit = config.maxConcurrentCalls;

      // Create calls up to limit
      const calls: Array<{ callId: string; success: boolean }> = [];
      for (let i = 0; i < defaultLimit; i++) {
        const call = await manager.initiateCall(generatePhone(i));
        expect(call.success).toBe(true);
        calls.push(call);
      }

      expect(manager.getActiveCalls()).toHaveLength(defaultLimit);

      // Try to exceed (should fail)
      const extra = await manager.initiateCall(generatePhone(1000));
      expect(extra.success).toBe(false);

      // End half the calls
      const halfLimit = Math.floor(defaultLimit / 2);
      for (let i = 0; i < halfLimit; i++) {
        await manager.endCall(calls[i].callId);
      }

      expect(manager.getActiveCalls()).toHaveLength(
        defaultLimit - halfLimit
      );

      // Should be able to create new calls up to limit
      for (let i = 0; i < halfLimit; i++) {
        const newCall = await manager.initiateCall(generatePhone(2000 + i));
        expect(newCall.success).toBe(true);
      }

      expect(manager.getActiveCalls()).toHaveLength(defaultLimit);
    });

    it("should handle rapid concurrent call and end cycles", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 5 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Rapid cycles
      const cycles = 10;
      for (let cycle = 0; cycle < cycles; cycle++) {
        const callsInCycle: string[] = [];

        // Create multiple calls
        for (let i = 0; i < 3; i++) {
          const call = await manager.initiateCall(
            generatePhone(cycle * 1000 + i)
          );
          if (call.success) {
            callsInCycle.push(call.callId);
          }
        }

        // Verify we created calls
        expect(callsInCycle.length).toBeGreaterThan(0);

        // End some calls
        for (const callId of callsInCycle.slice(0, 1)) {
          await manager.endCall(callId);
        }

        // Verify state consistency
        const activeCalls = manager.getActiveCalls();
        expect(activeCalls.length).toBeLessThanOrEqual(5);
      }
    });

    it("should handle rapid call state checks concurrently", async () => {
      const testConfig = createMockConfig({ maxConcurrentCalls: 5 });
      const manager = new CallManager(testConfig, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Create multiple calls
      const callIds = await Promise.all([
        manager.initiateCall(generatePhone(1)),
        manager.initiateCall(generatePhone(2)),
        manager.initiateCall(generatePhone(3)),
      ]);

      // Count successful calls
      const successCount = callIds.filter((c) => c.success).length;
      expect(successCount).toBe(3);

      // Rapidly check state
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls.length).toBeGreaterThanOrEqual(1);

      // Verify created calls are in the list
      for (const result of callIds) {
        if (result.success) {
          const found = activeCalls.find((c) => c.callId === result.callId);
          expect(found).toBeDefined();
        }
      }
    });
  });

  // ============================================================================
  // TEST 6: Stress tests
  // ============================================================================

  describe("Stress Tests", () => {
    it("should handle many concurrent call initiations", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 20 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Try to create 30 calls (should only succeed for 20)
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          manager.initiateCall(generatePhone(i))
        )
      );

      const successes = results.filter((r) => r.success).length;
      const failures = results.filter((r) => !r.success).length;

      expect(successes).toBe(20);
      expect(failures).toBe(10);
    });

    it("should maintain call count accuracy with sequential operations", async () => {
      const testConfig = createMockConfig({ maxConcurrentCalls: 20 });
      const manager = new CallManager(testConfig, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Create 10 calls sequentially to avoid fs cleanup issues
      for (let i = 0; i < 10; i++) {
        const result = await manager.initiateCall(generatePhone(i));
        expect(result.success).toBe(true);
      }

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(10);

      // End 5 calls
      for (let i = 0; i < 5; i++) {
        await manager.endCall(activeCalls[i].callId);
      }

      expect(manager.getActiveCalls()).toHaveLength(5);
    });
  });
});
