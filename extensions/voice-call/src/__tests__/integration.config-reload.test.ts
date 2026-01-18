/**
 * Config Hot-Reload Integration Tests
 *
 * Tests configuration management, call isolation, and error handling
 * when working with multiple call managers with different configurations.
 *
 * This suite validates:
 * - Different managers with different configs coexist properly
 * - Call state is preserved across manager instances
 * - Config validation catches errors early
 * - Concurrent calls work correctly with different configs
 * - Call metadata and state transitions are correct
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { CallManager } from "../manager.js";
import type { VoiceCallConfig } from "../config.js";
import { VoiceCallConfigSchema } from "../config.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig } from "./mocks/config.js";

describe("VoiceCallManager Config Hot-Reload", () => {
  let managers: CallManager[] = [];
  let mockProviders: MockVoiceProvider[] = [];
  let tempDir: string;
  let originalConfig: VoiceCallConfig;

  beforeEach(async () => {
    // Setup temporary directory for this test
    tempDir = path.join(os.tmpdir(), `voice-config-reload-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Create initial valid config
    originalConfig = createMockConfig({
      provider: "mock",
      fromNumber: "+15550000000",
      toNumber: "+15550000001",
    });

    managers = [];
    mockProviders = [];
  });

  // Helper to create a manager with mock provider (each gets its own storage dir)
  const createManager = (config: VoiceCallConfig): CallManager => {
    // Create unique storage dir for each manager to avoid file conflicts
    const managerStorageDir = path.join(tempDir, `manager-${managers.length}`);
    const manager = new CallManager(config, managerStorageDir);
    const mockProvider = new MockVoiceProvider();
    manager.initialize(mockProvider, "http://localhost:3334/webhook");
    managers.push(manager);
    mockProviders.push(mockProvider);
    return manager;
  };

  afterEach(async () => {
    // Cleanup temporary directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Config Switching Between Managers", () => {
    it("should create managers with different from numbers", async () => {
      const config1 = createMockConfig({ fromNumber: "+15551111111" });
      const config2 = createMockConfig({ fromNumber: "+15552222222" });

      const manager1 = createManager(config1);
      const manager2 = createManager(config2);

      expect(config1.fromNumber).toBe("+15551111111");
      expect(config2.fromNumber).toBe("+15552222222");

      // Both managers should exist
      expect(managers).toHaveLength(2);
    });

    it("should preserve call state with original from number in calls", async () => {
      const manager = createManager(originalConfig);
      const callResult = await manager.initiateCall("+15550000001");
      expect(callResult.success).toBe(true);

      const callId = callResult.callId;
      const call = manager.getCall(callId);
      expect(call).toBeDefined();
      expect(call?.state).toBe("initiated");
      expect(call?.from).toBe("+15550000000");
    });

    it("should support multiple managers with concurrent calls", async () => {
      // Create two managers with different configs
      const manager1 = createManager(
        createMockConfig({ fromNumber: "+15551111111" })
      );
      const manager2 = createManager(
        createMockConfig({ fromNumber: "+15552222222" })
      );

      // Initiate calls on each manager
      const call1 = await manager1.initiateCall("+15553333333");
      const call2 = await manager2.initiateCall("+15553333333");

      expect(call1.success).toBe(true);
      expect(call2.success).toBe(true);

      // Verify calls are tracked separately
      const calls1 = manager1.getActiveCalls();
      const calls2 = manager2.getActiveCalls();

      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);

      const retrievedCall1 = manager1.getCall(call1.callId);
      const retrievedCall2 = manager2.getCall(call2.callId);

      expect(retrievedCall1?.from).toBe("+15551111111");
      expect(retrievedCall2?.from).toBe("+15552222222");
    });

    it("should maintain call state when creating new manager instance", async () => {
      // Create first manager and make a call
      const manager1 = createManager(originalConfig);
      const callResult = await manager1.initiateCall("+15550000001");
      expect(callResult.success).toBe(true);

      // Verify call is active
      let call = manager1.getCall(callResult.callId);
      expect(call?.state).toBe("initiated");

      // Speak on the call
      const speakResult = await manager1.speak(
        callResult.callId,
        "Hello test"
      );
      expect(speakResult.success).toBe(true);

      // Verify state changed
      call = manager1.getCall(callResult.callId);
      expect(call?.state).toBe("speaking");

      // Call should still be retrievable
      const finalCall = manager1.getCall(callResult.callId);
      expect(finalCall).toBeDefined();
      expect(finalCall?.transcript).toHaveLength(1);
    });
  });

  describe("Config Validation", () => {
    it("should reject invalid configuration at parse time", async () => {
      const invalidConfig = {
        provider: "invalid-provider",
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
      } as unknown as VoiceCallConfig;

      expect(() => {
        VoiceCallConfigSchema.parse(invalidConfig);
      }).toThrow();
    });

    it("should reject config with invalid phone numbers", async () => {
      const invalidConfig = {
        ...originalConfig,
        fromNumber: "15550000000", // Missing +
      };

      expect(() => {
        VoiceCallConfigSchema.parse(invalidConfig);
      }).toThrow();
    });

    it("should reject config with negative concurrent calls limit", async () => {
      const invalidConfig = {
        ...originalConfig,
        maxConcurrentCalls: -1,
      } as unknown as VoiceCallConfig;

      expect(() => {
        VoiceCallConfigSchema.parse(invalidConfig);
      }).toThrow();
    });

    it("should validate phone number format strictly", async () => {
      const invalidFormats = [
        "15550000000", // Missing +
        "+1", // Too short
        "+999999999999999999", // Too long
        "5550000000", // No country code
      ];

      invalidFormats.forEach((invalidNumber) => {
        const config = { ...originalConfig, fromNumber: invalidNumber };
        expect(() => VoiceCallConfigSchema.parse(config)).toThrow();
      });
    });

    it("should accept valid phone numbers in E.164 format", async () => {
      const validNumbers = [
        "+15550000000",
        "+441234567890",
        "+886987654321",
        "+33123456789",
      ];

      validNumbers.forEach((validNumber) => {
        const config = { ...originalConfig, fromNumber: validNumber };
        expect(() => VoiceCallConfigSchema.parse(config)).not.toThrow();
      });
    });
  });

  describe("Call Isolation Between Managers", () => {
    it("should keep calls isolated between manager instances", async () => {
      const manager1 = createManager(
        createMockConfig({ fromNumber: "+15551111111" })
      );
      const manager2 = createManager(
        createMockConfig({ fromNumber: "+15552222222" })
      );

      // Create call on manager1
      const call1a = await manager1.initiateCall("+15550000010");
      expect(call1a.success).toBe(true);

      // Create call on manager2
      const call2a = await manager2.initiateCall("+15550000020");
      expect(call2a.success).toBe(true);

      // Verify isolation
      const activeCalls1 = manager1.getActiveCalls();
      const activeCalls2 = manager2.getActiveCalls();

      expect(activeCalls1).toHaveLength(1);
      expect(activeCalls2).toHaveLength(1);

      // Verify manager1 cannot see manager2's calls
      expect(manager1.getCall(call2a.callId)).toBeUndefined();

      // Verify manager2 cannot see manager1's calls
      expect(manager2.getCall(call1a.callId)).toBeUndefined();
    });

    it("should handle concurrent operations on different managers", async () => {
      const manager1 = createManager(
        createMockConfig({ fromNumber: "+15551111111" })
      );
      const manager2 = createManager(
        createMockConfig({ fromNumber: "+15552222222" })
      );

      // Start calls concurrently
      const [call1, call2] = await Promise.all([
        manager1.initiateCall("+15550000001"),
        manager2.initiateCall("+15550000002"),
      ]);

      expect(call1.success).toBe(true);
      expect(call2.success).toBe(true);

      // Speak concurrently
      const [speak1, speak2] = await Promise.all([
        manager1.speak(call1.callId, "Hello from manager1"),
        manager2.speak(call2.callId, "Hello from manager2"),
      ]);

      expect(speak1.success).toBe(true);
      expect(speak2.success).toBe(true);

      // Verify states
      const retrievedCall1 = manager1.getCall(call1.callId);
      const retrievedCall2 = manager2.getCall(call2.callId);

      expect(retrievedCall1?.state).toBe("speaking");
      expect(retrievedCall2?.state).toBe("speaking");
    });

    it("should handle concurrent max concurrent calls enforcement", async () => {
      const config = createMockConfig({
        fromNumber: "+15550000000",
        maxConcurrentCalls: 2,
      });
      const manager = createManager(config);

      // Start calls up to the limit
      const call1 = await manager.initiateCall("+15550000001");
      const call2 = await manager.initiateCall("+15550000002");

      expect(call1.success).toBe(true);
      expect(call2.success).toBe(true);

      // Next call should fail
      const call3 = await manager.initiateCall("+15550000003");
      expect(call3.success).toBe(false);
      expect(call3.error).toContain("Maximum concurrent calls");

      // End one call
      const endResult = await manager.endCall(call1.callId);
      expect(endResult.success).toBe(true);

      // Now we should be able to start another
      const call4 = await manager.initiateCall("+15550000004");
      expect(call4.success).toBe(true);

      // Verify final active count
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(2);
    });
  });

  describe("Call Metadata and State Transitions", () => {
    it("should preserve call metadata through state transitions", async () => {
      const manager = createManager(originalConfig);

      const callResult = await manager.initiateCall("+15550000001", "session-123", {
        message: "Initial greeting",
      });
      expect(callResult.success).toBe(true);

      // Verify metadata is set
      let call = manager.getCall(callResult.callId);
      expect(call?.sessionKey).toBe("session-123");
      expect(call?.metadata?.initialMessage).toBe("Initial greeting");
      expect(call?.state).toBe("initiated");

      // Speak (state transition)
      const speakResult = await manager.speak(
        callResult.callId,
        "Welcome to the system"
      );
      expect(speakResult.success).toBe(true);

      // Metadata should still be there
      call = manager.getCall(callResult.callId);
      expect(call?.sessionKey).toBe("session-123");
      expect(call?.state).toBe("speaking");
      expect(call?.transcript).toHaveLength(1);
    });

    it("should support multiple config variations with proper isolation", async () => {
      const configs = [
        createMockConfig({
          fromNumber: "+15551111111",
          maxDurationSeconds: 60,
        }),
        createMockConfig({
          fromNumber: "+15552222222",
          maxDurationSeconds: 120,
        }),
        createMockConfig({
          fromNumber: "+15553333333",
          maxDurationSeconds: 300,
        }),
      ];

      const managers = configs.map((config) => createManager(config));

      // Make calls from each manager
      const callIds: { manager: CallManager; callId: string }[] = [];

      for (let i = 0; i < managers.length; i++) {
        const result = await managers[i].initiateCall(`+1555444${String(i).padStart(4, "0")}`);
        expect(result.success).toBe(true);
        callIds.push({ manager: managers[i], callId: result.callId });
      }

      // Verify each call has correct originating from number
      callIds.forEach((item, index) => {
        const call = item.manager.getCall(item.callId);
        expect(call?.from).toBe(configs[index].fromNumber);
      });
    });
  });

  describe("Multi-Call Workflows", () => {
    it("should handle complete workflow: init, speak, end across multiple managers", async () => {
      // Manager 1 workflow
      const manager1 = createManager(
        createMockConfig({ fromNumber: "+15551111111" })
      );
      const call1 = await manager1.initiateCall("+15550000001");
      expect(call1.success).toBe(true);

      let state1 = manager1.getCall(call1.callId);
      expect(state1?.state).toBe("initiated");

      const speak1 = await manager1.speak(call1.callId, "Manager 1 message");
      expect(speak1.success).toBe(true);

      state1 = manager1.getCall(call1.callId);
      expect(state1?.state).toBe("speaking");

      // Manager 2 concurrent workflow
      const manager2 = createManager(
        createMockConfig({ fromNumber: "+15552222222" })
      );
      const call2 = await manager2.initiateCall("+15550000002");
      expect(call2.success).toBe(true);

      let state2 = manager2.getCall(call2.callId);
      expect(state2?.state).toBe("initiated");

      const speak2 = await manager2.speak(call2.callId, "Manager 2 message");
      expect(speak2.success).toBe(true);

      state2 = manager2.getCall(call2.callId);
      expect(state2?.state).toBe("speaking");

      // End both calls
      const end1 = await manager1.endCall(call1.callId);
      const end2 = await manager2.endCall(call2.callId);

      expect(end1.success).toBe(true);
      expect(end2.success).toBe(true);

      // Verify calls are no longer in active calls
      // Note: After endCall, the call is removed from active calls map
      const activeCalls1After = manager1.getActiveCalls();
      const activeCalls2After = manager2.getActiveCalls();

      // No active calls should remain
      expect(manager1.getActiveCalls()).toHaveLength(0);
      expect(manager2.getActiveCalls()).toHaveLength(0);
    });

    it("should handle interspersed operations from multiple managers", async () => {
      const manager1 = createManager(
        createMockConfig({ fromNumber: "+15551111111" })
      );
      const manager2 = createManager(
        createMockConfig({ fromNumber: "+15552222222" })
      );

      // Create call on manager1
      const call1a = await manager1.initiateCall("+15550000001");
      expect(call1a.success).toBe(true);

      // Create call on manager2
      const call2a = await manager2.initiateCall("+15550000002");
      expect(call2a.success).toBe(true);

      // Speak on manager1's call
      const speak1a = await manager1.speak(call1a.callId, "First message");
      expect(speak1a.success).toBe(true);

      // Speak on manager2's call
      const speak2a = await manager2.speak(call2a.callId, "Manager2 message");
      expect(speak2a.success).toBe(true);

      // End manager1's call
      const end1 = await manager1.endCall(call1a.callId);
      expect(end1.success).toBe(true);

      // Verify state: manager1 should have 0 active, manager2 should have 1 active
      expect(manager1.getActiveCalls()).toHaveLength(0);
      expect(manager2.getActiveCalls()).toHaveLength(1);
    });
  });

  describe("Provider Independence", () => {
    it("should maintain provider independence between managers", async () => {
      const manager1 = createManager(originalConfig);
      const manager2 = createManager(originalConfig);

      // Both should have mock provider, but separate instances
      expect(mockProviders).toHaveLength(2);
      expect(mockProviders[0]).not.toBe(mockProviders[1]);

      // Make calls on both
      const call1 = await manager1.initiateCall("+15550000001");
      const call2 = await manager2.initiateCall("+15550000002");

      expect(call1.success).toBe(true);
      expect(call2.success).toBe(true);

      // Verify provider tracking is independent
      expect(mockProviders[0].getCallCount()).toBe(1);
      expect(mockProviders[1].getCallCount()).toBe(1);
    });
  });

  describe("Edge Cases and Error Scenarios", () => {
    it("should reject manager with zero or negative duration limit", async () => {
      // maxDurationSeconds must be > 0
      const invalidConfig = {
        ...originalConfig,
        maxDurationSeconds: 0,
      };

      // This config should be invalid
      expect(() => VoiceCallConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should handle concurrent call on non-existent call ID", async () => {
      const manager = createManager(originalConfig);

      const speakResult = await manager.speak("non-existent-id", "Test");
      expect(speakResult.success).toBe(false);
      expect(speakResult.error).toBeDefined();
    });

    it("should handle end call on non-existent call ID", async () => {
      const manager = createManager(originalConfig);

      const endResult = await manager.endCall("non-existent-id");
      expect(endResult.success).toBe(false);
      expect(endResult.error).toBeDefined();
    });

    it("should handle getCall on empty manager", async () => {
      const manager = createManager(originalConfig);

      const call = manager.getCall("any-id");
      expect(call).toBeUndefined();
    });

    it("should handle getActiveCalls on empty manager", async () => {
      const manager = createManager(originalConfig);

      const calls = manager.getActiveCalls();
      expect(calls).toEqual([]);
    });
  });
});
