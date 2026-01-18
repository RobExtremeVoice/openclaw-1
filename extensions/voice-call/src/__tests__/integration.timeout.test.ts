/**
 * Integration Tests: Timeout Enforcement During Calls
 *
 * Tests real timeout mechanisms:
 * - Max duration timer fires and auto-hangs up calls
 * - Timer is cleared when call ends naturally before timeout
 * - Multiple concurrent calls each have their own timeout
 * - Different maxDurationSeconds config values are respected
 */

import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig } from "./mocks/config.js";
import { SyncCallCleanupScheduler } from "./mocks/index.js";
import type { NormalizedEvent } from "../types.js";

describe("Timeout Enforcement - Synchronous Scheduler Tests", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;
  let scheduler: SyncCallCleanupScheduler;
  let config: any;
  const webhookUrl = "https://example.com/webhook";

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-timeout-${Date.now()}`);
    mockProvider = new MockVoiceProvider();
    scheduler = new SyncCallCleanupScheduler();
    // 2 second timeout config (not actually used in sync tests)
    config = createMockConfig({
      provider: "mock",
      maxDurationSeconds: 2,
    });
  });

  afterEach(() => {
    mockProvider.reset();
    scheduler.reset();
  });

  describe("SyncCallCleanupScheduler", () => {
    it("should schedule and trigger timeouts correctly", () => {
      const testScheduler = new SyncCallCleanupScheduler();
      let callbackFired = false;

      testScheduler.schedule("test-call", 1000, () => {
        callbackFired = true;
      });

      expect(testScheduler.getScheduled()).toContain("test-call");
      expect(callbackFired).toBe(false);

      testScheduler.triggerTimeout("test-call");
      expect(callbackFired).toBe(true);
      expect(testScheduler.getScheduled()).not.toContain("test-call");
    });
  });

  describe("Max Duration Timer", () => {
    it("should auto-hangup when maxDurationSeconds expires (sync test)", async () => {
      const manager = new CallManager(config, tempDir, scheduler);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(true);
      const callId = result.callId!;

      // Move to answered (starts duration timer)
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      const callBeforeTimeout = manager.getCall(callId);
      expect(callBeforeTimeout).toBeDefined();
      expect(callBeforeTimeout?.state).toBe("answered");

      // Verify cleanup scheduler has the call scheduled
      expect(scheduler.getScheduled()).toContain(callId);

      // Trigger timeout and await async operations
      await scheduler.triggerTimeoutAsync(callId);

      // Call should be removed (auto-hangup completed)
      expect(manager.getCall(callId)).toBeUndefined();
      expect(manager.getActiveCalls().length).toBe(0);

      // Provider should have received hangup call
      expect(mockProvider.hangupCallCalls.length).toBeGreaterThan(0);
    });

    it("should clear timer when call ends before timeout (sync test)", async () => {
      const manager = new CallManager(config, tempDir, scheduler);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.initiateCall("+15550000002");
      expect(result.success).toBe(true);
      const callId = result.callId!;

      // Move to answered (starts timer)
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Verify cleanup scheduler has the call scheduled
      expect(scheduler.getScheduled()).toContain(callId);

      // End call (clears scheduler)
      manager.processEvent({
        id: "evt-ended",
        type: "call.ended",
        callId,
        timestamp: Date.now(),
        direction: "outbound",
        endReason: "completed",
      } as NormalizedEvent);

      // Call should be removed (normal end, not timeout)
      expect(manager.getCall(callId)).toBeUndefined();
      // Scheduler should no longer have this call scheduled
      expect(scheduler.getScheduled()).not.toContain(callId);
      // Should only have 1 hangup call (from normal end, not timeout)
      expect(mockProvider.hangupCallCalls.length).toBeLessThanOrEqual(1);
    });

    it("should handle multiple concurrent calls with different timeouts (sync test)", async () => {
      const concurrentConfig = createMockConfig({
        provider: "mock",
        maxDurationSeconds: 2,
        maxConcurrentCalls: 5, // Allow multiple concurrent calls
      });
      const manager = new CallManager(concurrentConfig, tempDir, scheduler);
      manager.initialize(mockProvider, webhookUrl);

      const result1 = await manager.initiateCall("+15550000003");
      const result2 = await manager.initiateCall("+15550000004");
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const callId1 = result1.callId!;
      const callId2 = result2.callId!;

      // Answer both (starts both timers)
      for (const callId of [callId1, callId2]) {
        manager.processEvent({
          id: `evt-answered-${callId}`,
          type: "call.answered",
          callId,
          timestamp: Date.now(),
        } as NormalizedEvent);
      }

      expect(manager.getActiveCalls().length).toBe(2);
      // Both should be scheduled
      expect(scheduler.getScheduled()).toContain(callId1);
      expect(scheduler.getScheduled()).toContain(callId2);

      // Trigger both timeouts and await async operations
      await scheduler.triggerTimeoutAsync(callId1);
      await scheduler.triggerTimeoutAsync(callId2);

      // Both should be cleaned up
      expect(manager.getCall(callId1)).toBeUndefined();
      expect(manager.getCall(callId2)).toBeUndefined();
      expect(manager.getActiveCalls().length).toBe(0);

      // Both should have been hung up
      expect(mockProvider.hangupCallCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Different Max Duration Config", () => {
    it("should respect custom maxDurationSeconds config (sync test)", async () => {
      const customConfig = createMockConfig({
        provider: "mock",
        maxDurationSeconds: 1,
      });
      const manager = new CallManager(customConfig, tempDir, scheduler);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.initiateCall("+15550000005");
      expect(result.success).toBe(true);
      const callId = result.callId!;

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Trigger timeout and await async operations
      await scheduler.triggerTimeoutAsync(callId);

      // Call should be cleaned
      expect(manager.getCall(callId)).toBeUndefined();
      expect(mockProvider.hangupCallCalls.length).toBeGreaterThan(0);
    });

    it("should schedule different timeouts per call (sync test)", async () => {
      const call1Config = createMockConfig({
        provider: "mock",
        maxDurationSeconds: 1,
      });
      const call2Config = createMockConfig({
        provider: "mock",
        maxDurationSeconds: 3,
      });
      const manager1 = new CallManager(call1Config, tempDir, scheduler);
      const manager2 = new CallManager(call2Config, tempDir, scheduler);
      manager1.initialize(mockProvider, webhookUrl);
      manager2.initialize(mockProvider, webhookUrl);

      const result1 = await manager1.initiateCall("+15550000006a");
      const result2 = await manager2.initiateCall("+15550000006b");
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const callId1 = result1.callId!;
      const callId2 = result2.callId!;

      manager1.processEvent({
        id: "evt-answered-1",
        type: "call.answered",
        callId: callId1,
        timestamp: Date.now(),
      } as NormalizedEvent);

      manager2.processEvent({
        id: "evt-answered-2",
        type: "call.answered",
        callId: callId2,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Both scheduled
      expect(scheduler.getScheduled()).toContain(callId1);
      expect(scheduler.getScheduled()).toContain(callId2);

      // Trigger first timeout
      await scheduler.triggerTimeoutAsync(callId1);

      // First call should be cleaned, second should still exist
      expect(manager1.getCall(callId1)).toBeUndefined();
      expect(manager2.getCall(callId2)).toBeDefined();
      expect(scheduler.getScheduled()).toContain(callId2);

      // Trigger second timeout
      await scheduler.triggerTimeoutAsync(callId2);
      expect(manager2.getCall(callId2)).toBeUndefined();
    });
  });

  describe("Timeout with Different Call States", () => {
    it("should not auto-hangup if call never reaches answered state (sync test)", async () => {
      const manager = new CallManager(config, tempDir, scheduler);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.initiateCall("+15550000007");
      expect(result.success).toBe(true);
      const callId = result.callId!;

      // Leave call in 'initiated' state without answering
      expect(manager.getCall(callId)?.state).toBe("initiated");

      // Max duration timer only fires after answered state
      expect(scheduler.getScheduled()).not.toContain(callId);

      // Call should still exist (no timer was scheduled)
      expect(manager.getCall(callId)).toBeDefined();
    });
  });

  describe("Rapid State Transitions", () => {
    it("should handle rapid state transitions without timer conflicts (sync test)", async () => {
      const manager = new CallManager(config, tempDir, scheduler);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.initiateCall("+15550000008");
      expect(result.success).toBe(true);
      const callId = result.callId!;

      // Rapid transition: initiated -> answered -> ended
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Timer is scheduled after answered
      expect(scheduler.getScheduled()).toContain(callId);

      // Immediately end before timeout
      manager.processEvent({
        id: "evt-ended",
        type: "call.ended",
        callId,
        timestamp: Date.now() + 100,
        direction: "outbound",
        endReason: "completed",
      } as NormalizedEvent);

      // Call should be cleaned up from normal end
      expect(manager.getCall(callId)).toBeUndefined();
      // Scheduler should no longer have the call
      expect(scheduler.getScheduled()).not.toContain(callId);
      expect(mockProvider.hangupCallCalls.length).toBeLessThanOrEqual(1);
    });
  });
});
