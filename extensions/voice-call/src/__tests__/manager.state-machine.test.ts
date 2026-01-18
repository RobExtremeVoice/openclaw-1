/**
 * Call Manager State Machine Violation Tests
 *
 * Tests for state machine enforcement:
 * - Terminal state enforcement (no transitions from terminal states)
 * - Monotonic state progression (no backward transitions)
 * - Conversation state cycling (allowed speaking/listening cycles)
 */

import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig } from "./mocks/config.js";
import type { NormalizedEvent } from "../types.js";

describe("CallManager State Machine", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;
  let config: any;
  const webhookUrl = "https://example.com/webhook";

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-test-${Date.now()}`);
    mockProvider = new MockVoiceProvider();
    config = createMockConfig({ provider: "mock" });
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe("Terminal State Enforcement", () => {
    it("should not allow transitions from terminal states", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // Process call.answered to move past initiated/ringing
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Move call to terminal state (completed)
      manager.processEvent({
        id: "evt-end",
        type: "call.ended",
        callId,
        timestamp: Date.now(),
        reason: "completed",
      } as NormalizedEvent);

      // Verify call is removed from active calls (terminal state behavior)
      const callAfterEnd = manager.getCall(callId);
      expect(callAfterEnd).toBeUndefined();

      // Try to process another event after terminal state
      // This should be ignored - call should remain undefined
      manager.processEvent({
        id: "evt-after-end",
        type: "call.speaking",
        callId,
        timestamp: Date.now(),
        text: "This should be ignored",
      } as NormalizedEvent);

      // Verify call is still not in active calls
      expect(manager.getCall(callId)).toBeUndefined();
    });

    it("should handle multiple terminal states correctly", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const testCases = [
        { reason: "completed" as const, type: "normal completion" },
        { reason: "hangup-user" as const, type: "user hangup" },
        { reason: "hangup-bot" as const, type: "bot hangup" },
        { reason: "timeout" as const, type: "timeout" },
      ];

      for (const testCase of testCases) {
        const { callId } = await manager.initiateCall("+15550000002");

        // Move to answered first
        manager.processEvent({
          id: `evt-answered-${testCase.reason}`,
          type: "call.answered",
          callId,
          timestamp: Date.now(),
        } as NormalizedEvent);

        // End with specific reason
        manager.processEvent({
          id: `evt-end-${testCase.reason}`,
          type: "call.ended",
          callId,
          timestamp: Date.now(),
          reason: testCase.reason,
        } as NormalizedEvent);

        const callAfterTerminal = manager.getCall(callId);
        expect(callAfterTerminal).toBeUndefined();

        // Try speaking after terminal - should be ignored
        manager.processEvent({
          id: `evt-speak-after-${testCase.reason}`,
          type: "call.speaking",
          callId,
          timestamp: Date.now(),
          text: "Should not work",
        } as NormalizedEvent);

        expect(manager.getCall(callId)).toBeUndefined();
      }
    });
  });

  describe("Monotonic State Progression", () => {
    it("should not allow backward transitions", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // Move to answered state
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      const callAfterAnswered = manager.getCall(callId);
      expect(callAfterAnswered?.state).toBe("answered");

      // Try to go backward to ringing (should be ignored)
      manager.processEvent({
        id: "evt-backward",
        type: "call.ringing",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // State should remain "answered" - backward transition rejected
      const callAfterBackward = manager.getCall(callId);
      expect(callAfterBackward?.state).toBe("answered");
    });

    it("should enforce state order: initiated -> ringing -> answered", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // After initiate, state should be "initiated"
      let call = manager.getCall(callId);
      expect(call?.state).toBe("initiated");

      // Try to jump to answered (skipping ringing) - should be ignored
      manager.processEvent({
        id: "evt-skip-to-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Since we're skipping ringing, this should still work (it's forward)
      // but check the actual progression
      call = manager.getCall(callId);
      expect(call?.state).toBe("answered");

      // Now move to active
      manager.processEvent({
        id: "evt-active",
        type: "call.active",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      call = manager.getCall(callId);
      expect(call?.state).toBe("active");

      // Try backward to answered - should be rejected
      manager.processEvent({
        id: "evt-backward-to-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      call = manager.getCall(callId);
      expect(call?.state).toBe("active"); // Still at active
    });

    it("should reject backward transitions from speaking", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // Move through states to speaking
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      manager.processEvent({
        id: "evt-active",
        type: "call.active",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      manager.processEvent({
        id: "evt-speak",
        type: "call.speaking",
        callId,
        timestamp: Date.now(),
        text: "Hello",
      } as NormalizedEvent);

      let call = manager.getCall(callId);
      expect(call?.state).toBe("speaking");

      // Try to go backward to active - should be rejected
      manager.processEvent({
        id: "evt-back-to-active",
        type: "call.active",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      call = manager.getCall(callId);
      expect(call?.state).toBe("speaking"); // Should still be speaking
    });
  });

  describe("Conversation State Cycling", () => {
    it("should allow cycling between speaking and listening", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // Move to answered
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // First speaking cycle
      manager.processEvent({
        id: "evt-speak1",
        type: "call.speaking",
        callId,
        timestamp: Date.now(),
        text: "Hello",
      } as NormalizedEvent);

      let call = manager.getCall(callId);
      expect(call?.state).toBe("speaking");

      // Transition to listening
      manager.processEvent({
        id: "evt-listen1",
        type: "call.speech",
        callId,
        timestamp: Date.now(),
        transcript: "Hi",
        isFinal: true,
      } as NormalizedEvent);

      call = manager.getCall(callId);
      expect(call?.state).toBe("listening");

      // Back to speaking
      manager.processEvent({
        id: "evt-speak2",
        type: "call.speaking",
        callId,
        timestamp: Date.now(),
        text: "How are you?",
      } as NormalizedEvent);

      call = manager.getCall(callId);
      expect(call?.state).toBe("speaking");

      // Back to listening again
      manager.processEvent({
        id: "evt-listen2",
        type: "call.speech",
        callId,
        timestamp: Date.now(),
        transcript: "I am good",
        isFinal: true,
      } as NormalizedEvent);

      call = manager.getCall(callId);
      expect(call?.state).toBe("listening");
    });

    it("should support multiple turn cycles", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      const turns = 5;
      for (let i = 0; i < turns; i++) {
        // Speaking turn
        manager.processEvent({
          id: `evt-speak-${i}`,
          type: "call.speaking",
          callId,
          timestamp: Date.now(),
          text: `Turn ${i} - Speaking`,
        } as NormalizedEvent);

        let call = manager.getCall(callId);
        expect(call?.state).toBe("speaking");

        // Listening turn
        manager.processEvent({
          id: `evt-listen-${i}`,
          type: "call.speech",
          callId,
          timestamp: Date.now(),
          transcript: `Turn ${i} - Response`,
          isFinal: true,
        } as NormalizedEvent);

        call = manager.getCall(callId);
        expect(call?.state).toBe("listening");
      }

      // After multiple cycles, should still be in listening state
      const finalCall = manager.getCall(callId);
      expect(finalCall?.state).toBe("listening");
    });

    it("should not allow transitioning from listening directly to non-conversation states", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // Setup: move to listening
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      manager.processEvent({
        id: "evt-speak",
        type: "call.speaking",
        callId,
        timestamp: Date.now(),
        text: "Hello",
      } as NormalizedEvent);

      manager.processEvent({
        id: "evt-listen",
        type: "call.speech",
        callId,
        timestamp: Date.now(),
        transcript: "Hi",
        isFinal: true,
      } as NormalizedEvent);

      let call = manager.getCall(callId);
      expect(call?.state).toBe("listening");

      // Try to transition to a non-conversation state like "active"
      // This should be rejected since it's not speaking/listening
      manager.processEvent({
        id: "evt-invalid-transition",
        type: "call.active",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Should still be in listening state
      call = manager.getCall(callId);
      expect(call?.state).toBe("listening");
    });
  });

  describe("Terminal State Edge Cases", () => {
    it("should handle non-retryable error state as terminal", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Trigger non-retryable error state (only non-retryable errors move to terminal)
      manager.processEvent({
        id: "evt-error",
        type: "call.error",
        callId,
        timestamp: Date.now(),
        error: "Connection lost",
        retryable: false,
      } as NormalizedEvent);

      // Call should be removed (terminal state)
      expect(manager.getCall(callId)).toBeUndefined();

      // Try to process another event
      manager.processEvent({
        id: "evt-speak-after-error",
        type: "call.speaking",
        callId,
        timestamp: Date.now(),
        text: "Should not work",
      } as NormalizedEvent);

      expect(manager.getCall(callId)).toBeUndefined();
    });

    it("should keep retryable errors in active calls", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Trigger retryable error (should NOT remove from active calls)
      manager.processEvent({
        id: "evt-retryable-error",
        type: "call.error",
        callId,
        timestamp: Date.now(),
        error: "Temporary connection issue",
        retryable: true,
      } as NormalizedEvent);

      // Call should STILL be in active calls (retryable errors are not terminal)
      const call = manager.getCall(callId);
      expect(call).toBeDefined();
      expect(call?.state).toBe("answered"); // State doesn't change for retryable errors
    });

    it("should not allow any transitions to non-terminal states after terminal reached", async () => {
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      } as NormalizedEvent);

      // Move to terminal state
      manager.processEvent({
        id: "evt-completed",
        type: "call.ended",
        callId,
        timestamp: Date.now(),
        reason: "completed",
      } as NormalizedEvent);

      expect(manager.getCall(callId)).toBeUndefined();

      // Try various transitions - all should fail silently
      const eventSequence: NormalizedEvent[] = [
        {
          id: "evt-retry-ringing",
          type: "call.ringing",
          callId,
          timestamp: Date.now(),
        },
        {
          id: "evt-retry-answered",
          type: "call.answered",
          callId,
          timestamp: Date.now(),
        },
        {
          id: "evt-retry-active",
          type: "call.active",
          callId,
          timestamp: Date.now(),
        },
        {
          id: "evt-retry-speaking",
          type: "call.speaking",
          callId,
          timestamp: Date.now(),
          text: "Retry speaking",
        },
      ];

      eventSequence.forEach((event) => {
        manager.processEvent(event);
        // Call should remain undefined (not added back to active calls)
        expect(manager.getCall(callId)).toBeUndefined();
      });
    });
  });

  describe("State Order Validation", () => {
    it("should maintain StateOrder array correctly", () => {
      // Verify StateOrder is set up in CallManager
      expect(CallManager.StateOrder).toBeDefined();
      expect(CallManager.StateOrder.length).toBeGreaterThan(0);

      // Check that states are in expected order
      const expectedOrder = [
        "initiated",
        "ringing",
        "answered",
        "active",
        "speaking",
        "listening",
      ];

      expectedOrder.forEach((state, index) => {
        const stateIndex = CallManager.StateOrder.indexOf(state as any);
        expect(stateIndex).toBe(index);
      });
    });

    it("should have ConversationStates defined", () => {
      expect(CallManager.ConversationStates).toBeDefined();
      expect(CallManager.ConversationStates.has("speaking")).toBe(true);
      expect(CallManager.ConversationStates.has("listening")).toBe(true);
    });
  });
});
