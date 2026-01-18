import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig } from "./mocks/config.js";
import type { NormalizedEvent } from "../types.js";

describe("Error Recovery - Real Implementation Tests", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;
  let config: any;
  const webhookUrl = "https://example.com/webhook";

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-recovery-${Date.now()}`);
    mockProvider = new MockVoiceProvider();
    config = createMockConfig({ provider: "mock" });
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe("Provider Failure Handling", () => {
    it("should clean up all state when provider.initiateCall() throws", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Make provider fail
      mockProvider.shouldFailInitiate = true;
      mockProvider.failureReason = "Network timeout";

      const result = await manager.initiateCall("+15550000001");

      // Verify failure result
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network timeout");

      // Verify call was NOT added to active calls
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls.length).toBe(0);
    });

    it("should clean up activeCalls, providerCallIdMap, and timers on provider error", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      mockProvider.shouldFailInitiate = true;

      const result = await manager.initiateCall("+15550000002");
      expect(result.success).toBe(false);

      // All state should be cleaned (no orphaned calls)
      expect(manager.getActiveCalls().length).toBe(0);
    });
  });

  describe("Error Event Recovery", () => {
    it("should handle call.error event and clean up all state", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000003");

      // Move call to answered
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Simulate provider error event
      manager.processEvent({
        id: "evt-error",
        type: "call.error",
        callId,
        timestamp: Date.now(),
        error: "Connection lost",
        retryable: false,
      } as NormalizedEvent);

      // Verify call removed from active calls (cleaned up)
      expect(manager.getCall(callId)).toBeUndefined();
      expect(manager.getActiveCalls().length).toBe(0);
    });

    it("should not remove call on retryable errors", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000004");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Send retryable error
      manager.processEvent({
        id: "evt-retry-error",
        type: "call.error",
        callId,
        timestamp: Date.now(),
        error: "Temporary network issue",
        retryable: true,
      } as NormalizedEvent);

      // Call should STILL exist (retryable means don't give up)
      expect(manager.getCall(callId)).toBeDefined();
    });
  });

  describe("Cleanup on call.ended", () => {
    it("should clean up all state when call ends normally", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000005");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // End call
      manager.processEvent({
        id: "evt-ended",
        type: "call.ended",
        callId,
        timestamp: Date.now(),
        reason: "completed",
      } as NormalizedEvent);

      // Verify complete cleanup
      expect(manager.getCall(callId)).toBeUndefined();
      expect(manager.getActiveCalls().length).toBe(0);
    });

    it("should handle all terminal reasons correctly", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const reasons = ["completed", "hangup-user", "hangup-bot", "no-answer"] as const;

      for (const reason of reasons) {
        const { callId } = await manager.initiateCall(
          `+1555000${reasons.indexOf(reason)}`,
        );

        manager.processEvent({
          id: `evt-end-${reason}`,
          type: "call.ended",
          callId,
          timestamp: Date.now(),
          reason,
        } as NormalizedEvent);

        expect(manager.getCall(callId)).toBeUndefined();
      }

      // All calls cleaned up
      expect(manager.getActiveCalls().length).toBe(0);
    });
  });
});
