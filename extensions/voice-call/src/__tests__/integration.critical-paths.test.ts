/**
 * Critical Untested Paths Integration Tests
 *
 * Comprehensive tests for code paths with 0% coverage:
 * - Event idempotency (processedEventIds tracking)
 * - Real file I/O persistence (not mocked)
 * - Corrupted JSON recovery and filtering
 * - Terminal call filtering during recovery
 * - Error paths in core operations
 * - Inbound call support and policy enforcement
 * - Transcript waiter timeout and replacement
 * - Max duration timers
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig } from "./mocks/config.js";
import { SyncCallCleanupScheduler } from "./mocks/index.js";
import type { NormalizedEvent, CallRecord } from "../types.js";

describe("Critical Untested Paths", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;
  let scheduler: SyncCallCleanupScheduler;
  const webhookUrl = "https://example.com/webhook";

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-critical-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    mockProvider = new MockVoiceProvider();
    scheduler = new SyncCallCleanupScheduler();
  });

  afterEach(async () => {
    mockProvider.reset();
    scheduler.reset();
    if (fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("Event Idempotency - processedEventIds", () => {
    it("should ignore duplicate events with same event ID", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      // Send same event twice with identical ID
      const eventId = "evt-duplicate-123";
      const event: NormalizedEvent = {
        id: eventId,
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      };

      manager.processEvent(event);
      const stateAfterFirst = manager.getCall(callId)?.state;

      // Send exact same event again
      manager.processEvent(event);
      const stateAfterSecond = manager.getCall(callId)?.state;

      // State should NOT have changed (idempotent)
      expect(stateAfterFirst).toBe("answered");
      expect(stateAfterSecond).toBe("answered");

      // Both should be identical - no state change
      const callRecord = manager.getCall(callId);
      expect(callRecord?.processedEventIds).toContain(eventId);
      // Only one copy of the event ID should be tracked
      const eventIdCount = callRecord?.processedEventIds.filter((id) => id === eventId).length;
      expect(eventIdCount).toBe(1);
    });

    it("should process different events with different IDs", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000002");

      manager.processEvent({
        id: "evt-1",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      expect(manager.getCall(callId)?.state).toBe("answered");

      manager.processEvent({
        id: "evt-2", // Different ID
        type: "call.active",
        callId,
        timestamp: Date.now(),
      });

      expect(manager.getCall(callId)?.state).toBe("active");

      // Both event IDs should be tracked
      const callRecord = manager.getCall(callId);
      expect(callRecord?.processedEventIds).toContain("evt-1");
      expect(callRecord?.processedEventIds).toContain("evt-2");
      expect(callRecord?.processedEventIds.length).toBe(2);
    });

    it("should restore processedEventIds on manager restart", async () => {
      const config = createMockConfig({ provider: "mock" });

      // First manager: process events and persist
      const manager1 = new CallManager(config, tempDir);
      manager1.initialize(mockProvider, webhookUrl);

      const { callId } = await manager1.initiateCall("+15550000003");

      manager1.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      manager1.processEvent({
        id: "evt-active",
        type: "call.active",
        callId,
        timestamp: Date.now(),
      });

      // Wait for persistence (sync write is now used so timing less critical, but keep small delay for cleanup)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second manager: should recover processedEventIds
      const manager2 = new CallManager(config, tempDir);
      manager2.initialize(mockProvider, webhookUrl);

      const recoveredCall = manager2.getCall(callId);
      expect(recoveredCall).toBeDefined();
      expect(recoveredCall?.processedEventIds).toContain("evt-answered");
      expect(recoveredCall?.processedEventIds).toContain("evt-active");
    });

    it("should prevent double-processing of same event after restart", async () => {
      const config = createMockConfig({ provider: "mock" });

      // First manager: process event
      const manager1 = new CallManager(config, tempDir);
      manager1.initialize(mockProvider, webhookUrl);

      const { callId } = await manager1.initiateCall("+15550000004");

      manager1.processEvent({
        id: "evt-unique-1",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      expect(manager1.getCall(callId)?.state).toBe("answered");
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second manager: should have processedEventIds restored
      const manager2 = new CallManager(config, tempDir);
      manager2.initialize(mockProvider, webhookUrl);

      const initialState = manager2.getCall(callId)?.state;

      // Try to process same event again
      manager2.processEvent({
        id: "evt-unique-1", // Same ID
        type: "call.active", // Different event type
        callId,
        timestamp: Date.now(),
      });

      // State should NOT change (idempotent - event is ignored due to duplicate ID)
      const finalState = manager2.getCall(callId)?.state;
      expect(finalState).toBe(initialState);
      // The processedEventIds should contain both the restored and new state transitions
      const call = manager2.getCall(callId);
      expect(call?.processedEventIds).toContain("evt-unique-1");
    });
  });

  describe("Persistence - Real File I/O", () => {
    it("should persist call records to JSONL file on disk", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000005");

      // Wait for fire-and-forget persistence
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check that calls.jsonl exists and has content
      const logPath = path.join(tempDir, "calls.jsonl");
      expect(fs.existsSync(logPath)).toBe(true);

      const content = fs.readFileSync(logPath, "utf-8");
      expect(content).toBeTruthy();
      expect(content).toContain(callId);
      expect(content).toContain("initiated");

      // Parse and validate JSON
      const lines = content.trim().split("\n");
      expect(lines.length).toBeGreaterThan(0);
      const firstRecord = JSON.parse(lines[0]);
      expect(firstRecord.callId).toBe(callId);
    });

    it("should append records to JSONL file (fire-and-forget async writes)", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId: callId1 } = await manager.initiateCall("+15550000006");

      // Wait for persistence
      await new Promise((resolve) => setTimeout(resolve, 300));

      const logPath = path.join(tempDir, "calls.jsonl");
      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n").filter((line) => line.trim());

      // Should have at least 1 line (one for the call initiated event)
      expect(lines.length).toBeGreaterThanOrEqual(1);

      // The call should be in the log
      const callIds = lines.map((line) => JSON.parse(line).callId);
      expect(callIds).toContain(callId1);
    });

    it("should recover persisted calls on manager restart", async () => {
      const config = createMockConfig({ provider: "mock" });

      // First manager: create and persist call
      const manager1 = new CallManager(config, tempDir);
      manager1.initialize(mockProvider, webhookUrl);

      const { callId } = await manager1.initiateCall("+15550000008");

      manager1.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // Wait longer for persistence
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Second manager: should recover the persisted call
      const manager2 = new CallManager(config, tempDir);
      manager2.initialize(mockProvider, webhookUrl);

      const recoveredCall = manager2.getCall(callId);
      expect(recoveredCall).toBeDefined();
      // The recovered call should be in initiated or answered state (or later)
      expect(["initiated", "answered", "active", "speaking", "listening"]).toContain(recoveredCall?.state);
      expect(recoveredCall?.callId).toBe(callId);
    });

    it("should only recover non-terminal calls", async () => {
      const config = createMockConfig({ provider: "mock" });
      const logPath = path.join(tempDir, "calls.jsonl");

      // Write mix of terminal and non-terminal calls
      const nonTerminal: CallRecord = {
        callId: "active-call-1",
        provider: "mock",
        direction: "outbound",
        state: "answered",
        from: "+15550000000",
        to: "+15550000001",
        startedAt: Date.now(),
        transcript: [],
        processedEventIds: [],
      };

      const terminal: CallRecord = {
        callId: "completed-call-1",
        provider: "mock",
        direction: "outbound",
        state: "completed",
        from: "+15550000000",
        to: "+15550000002",
        startedAt: Date.now(),
        endedAt: Date.now() + 1000,
        endReason: "completed",
        transcript: [],
        processedEventIds: [],
      };

      const lines = [
        JSON.stringify(nonTerminal),
        JSON.stringify(terminal),
      ].join("\n");

      fs.writeFileSync(logPath, lines);

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Should recover non-terminal but NOT terminal
      expect(manager.getCall("active-call-1")).toBeDefined();
      expect(manager.getCall("completed-call-1")).toBeUndefined();
    });

    it("should track providerCallId mapping during recovery", async () => {
      const config = createMockConfig({ provider: "mock" });
      const logPath = path.join(tempDir, "calls.jsonl");

      const callWithProvider: CallRecord = {
        callId: "internal-call-123",
        providerCallId: "provider-call-xyz",
        provider: "mock",
        direction: "outbound",
        state: "answered",
        from: "+15550000000",
        to: "+15550000001",
        startedAt: Date.now(),
        transcript: [],
        processedEventIds: [],
      };

      fs.writeFileSync(logPath, JSON.stringify(callWithProvider));

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Should be able to look up by provider call ID
      const recovered = manager.getCallByProviderCallId("provider-call-xyz");
      expect(recovered).toBeDefined();
      expect(recovered?.callId).toBe("internal-call-123");
    });
  });

  describe("Corrupted Log Recovery", () => {
    it("should skip corrupted JSON lines and continue recovery", async () => {
      const config = createMockConfig({ provider: "mock" });
      const logPath = path.join(tempDir, "calls.jsonl");

      const validRecord: CallRecord = {
        callId: "valid-call-1",
        provider: "mock",
        direction: "outbound",
        state: "answered",
        from: "+15550000000",
        to: "+15550000001",
        startedAt: Date.now(),
        transcript: [],
        processedEventIds: [],
      };

      const lines = [
        "{invalid json",
        JSON.stringify(validRecord),
        "{another broken",
        "",
        "   not json   ",
      ].join("\n");

      fs.writeFileSync(logPath, lines);

      // Manager should load and skip corrupted lines without crashing
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const recovered = manager.getCall("valid-call-1");
      expect(recovered).toBeDefined();
      expect(recovered?.state).toBe("answered");
    });

    it("should handle entire file being corrupted", async () => {
      const config = createMockConfig({ provider: "mock" });
      const logPath = path.join(tempDir, "calls.jsonl");

      const corruptedContent = "not json at all\ninvalid\ngarbage\n{{{";
      fs.writeFileSync(logPath, corruptedContent);

      // Should not crash, just skip all lines
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toEqual([]);
    });

    it("should handle empty log file gracefully", async () => {
      const config = createMockConfig({ provider: "mock" });
      const logPath = path.join(tempDir, "calls.jsonl");

      fs.writeFileSync(logPath, "");

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toEqual([]);
    });

    it("should keep latest version of each call ID", async () => {
      const config = createMockConfig({ provider: "mock" });
      const logPath = path.join(tempDir, "calls.jsonl");

      // Same call ID with multiple state updates
      const v1: CallRecord = {
        callId: "call-123",
        provider: "mock",
        direction: "outbound",
        state: "initiated",
        from: "+15550000000",
        to: "+15550000001",
        startedAt: Date.now(),
        transcript: [],
        processedEventIds: [],
      };

      const v2: CallRecord = {
        ...v1,
        state: "ringing",
      };

      const v3: CallRecord = {
        ...v1,
        state: "answered",
      };

      const lines = [
        JSON.stringify(v1),
        JSON.stringify(v2),
        JSON.stringify(v3),
      ].join("\n");

      fs.writeFileSync(logPath, lines);

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Should keep the latest version
      const recovered = manager.getCall("call-123");
      expect(recovered?.state).toBe("answered");
    });
  });

  describe("Error Path Coverage", () => {
    it("should handle speak() on non-existent call", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.speak("nonexistent-call-id", "Hello");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Call not found");
    });

    it("should handle speak() on call without provider connection", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000009");

      // Manually clear provider to simulate disconnection
      const call = manager.getCall(callId);
      if (call) {
        call.providerCallId = undefined;
      }

      const result = await manager.speak(callId, "Hello");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Call not connected");
    });

    it("should handle speak() on ended call", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000010");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      manager.processEvent({
        id: "evt-ended",
        type: "call.ended",
        callId,
        reason: "completed",
        timestamp: Date.now(),
      });

      const result = await manager.speak(callId, "Hello");

      // When a call ends via processEvent, it's deleted from activeCalls
      // So speak() will return "Call not found"
      expect(result.success).toBe(false);
      expect(result.error).toContain("Call not found");
    });

    it("should handle continueCall() on non-existent call", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.continueCall("nonexistent-call-id", "What is your name?");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Call not found");
    });

    it("should handle endCall() on non-existent call", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const result = await manager.endCall("nonexistent-call-id");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Call not found");
    });

    it("should handle endCall() on already-ended call", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000011");

      manager.processEvent({
        id: "evt-ended",
        type: "call.ended",
        callId,
        reason: "completed",
        timestamp: Date.now(),
      });

      // When call ends via processEvent, it's deleted from activeCalls
      // So endCall will return "Call not found"
      const result = await manager.endCall(callId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Call not found");
    });
  });

  describe("Inbound Call Support", () => {
    it("should accept inbound calls when policy is open", async () => {
      const config = createMockConfig({
        provider: "mock",
        inboundPolicy: "open",
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      manager.processEvent({
        id: "evt-inbound-1",
        type: "call.initiated",
        callId: "inbound-call-1",
        providerCallId: "provider-inbound-1",
        direction: "inbound",
        from: "+15550000099",
        to: "+15550000000",
        timestamp: Date.now(),
      });

      // Should have created a call record
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls.length).toBe(1);
      expect(activeCalls[0]?.direction).toBe("inbound");
      expect(activeCalls[0]?.from).toBe("+15550000099");
    });

    it("should reject inbound calls when policy is disabled", async () => {
      const config = createMockConfig({
        provider: "mock",
        inboundPolicy: "disabled",
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      manager.processEvent({
        id: "evt-inbound-2",
        type: "call.initiated",
        callId: "inbound-call-2",
        providerCallId: "provider-inbound-2",
        direction: "inbound",
        from: "+15550000099",
        to: "+15550000000",
        timestamp: Date.now(),
      });

      // Should NOT have created a call record
      const activeCalls = manager.getActiveCalls();
      expect(activeCalls.length).toBe(0);
    });

    it("should check allowlist for inbound calls", async () => {
      const config = createMockConfig({
        provider: "mock",
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000099"],
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Allowed number
      manager.processEvent({
        id: "evt-inbound-allowed",
        type: "call.initiated",
        callId: "inbound-allowed",
        providerCallId: "provider-inbound-allowed",
        direction: "inbound",
        from: "+15550000099",
        to: "+15550000000",
        timestamp: Date.now(),
      });

      let activeCalls = manager.getActiveCalls();
      expect(activeCalls.length).toBe(1);

      // Blocked number
      manager.processEvent({
        id: "evt-inbound-blocked",
        type: "call.initiated",
        callId: "inbound-blocked",
        providerCallId: "provider-inbound-blocked",
        direction: "inbound",
        from: "+15550000001",
        to: "+15550000000",
        timestamp: Date.now(),
      });

      activeCalls = manager.getActiveCalls();
      expect(activeCalls.length).toBe(1); // Still only 1, blocked call not added
    });

    it("should set initial greeting for inbound calls", async () => {
      const customGreeting = "Welcome to our service!";
      const config = createMockConfig({
        provider: "mock",
        inboundPolicy: "open",
        inboundGreeting: customGreeting,
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      manager.processEvent({
        id: "evt-inbound-3",
        type: "call.initiated",
        callId: "inbound-call-3",
        providerCallId: "provider-inbound-3",
        direction: "inbound",
        from: "+15550000099",
        to: "+15550000000",
        timestamp: Date.now(),
      });

      const activeCalls = manager.getActiveCalls();
      const call = activeCalls[0];
      expect(call?.metadata?.initialMessage).toBe(customGreeting);
    });
  });

  describe("Transcript Waiter Management", () => {
    it("should timeout waiting for transcript", async () => {
      const config = createMockConfig({
        provider: "mock",
        transcriptTimeoutMs: 200,
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000012");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // Start continueCall which will wait for transcript
      const continuePromise = manager.continueCall(
        callId,
        "What is your name?",
      );

      // Wait for timeout
      const result = await continuePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Timed out");
    });

    it("should handle multiple continueCall attempts", { timeout: 10000 }, async () => {
      const config = createMockConfig({
        provider: "mock",
        transcriptTimeoutMs: 300,
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000013");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // First continueCall - will timeout
      const firstResult = await manager.continueCall(
        callId,
        "First prompt",
      );

      expect(firstResult.success).toBe(false);
      expect(firstResult.error).toContain("Timed out");

      // Second continueCall - should work independently
      const secondResult = await manager.continueCall(
        callId,
        "Second prompt",
      );

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain("Timed out");
    });

    it("should resolve transcript waiter on speech event", async () => {
      const config = createMockConfig({
        provider: "mock",
        transcriptTimeoutMs: 5000,
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000014");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // Start continueCall
      const continuePromise = manager.continueCall(
        callId,
        "What is your name?",
      );

      // Send speech event after a delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      manager.processEvent({
        id: "evt-speech",
        type: "call.speech",
        callId,
        transcript: "John",
        isFinal: true,
        timestamp: Date.now(),
      });

      const result = await continuePromise;

      expect(result.success).toBe(true);
      expect(result.transcript).toBe("John");
    });

    it("should reject transcript waiter when call ends", async () => {
      const config = createMockConfig({
        provider: "mock",
        transcriptTimeoutMs: 5000,
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000015");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // Start continueCall
      const continuePromise = manager.continueCall(
        callId,
        "What is your name?",
      );

      // End the call
      await new Promise((resolve) => setTimeout(resolve, 50));

      manager.processEvent({
        id: "evt-ended",
        type: "call.ended",
        callId,
        reason: "hangup-user",
        timestamp: Date.now(),
      });

      const result = await continuePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Call ended");
    });
  });

  describe("Max Duration Timer", () => {
    it("should auto-hangup call after max duration", async () => {
      const config = createMockConfig({
        provider: "mock",
        maxDurationSeconds: 1,
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000016");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      const callBefore = manager.getCall(callId);
      expect(callBefore?.state).toBe("answered");

      // Wait for max duration timer to fire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const callAfter = manager.getCall(callId);
      // Call should be removed (ended)
      expect(callAfter).toBeUndefined();
    });

    it("should set timeout reason on auto-hangup", async () => {
      const config = createMockConfig({
        provider: "mock",
        maxDurationSeconds: 1,
      });
      const logPath = path.join(tempDir, "calls.jsonl");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000017");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // Wait for max duration timer to fire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Check persisted record - find the call record with timeout reason
      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n").filter((line) => line.trim());

      // Find the record with endReason: timeout
      let foundTimeout = false;
      for (const line of lines) {
        const record = JSON.parse(line);
        if (record.callId === callId && record.endReason === "timeout") {
          foundTimeout = true;
          break;
        }
      }

      expect(foundTimeout).toBe(true);
    });

    it("should clear timer when call ends naturally", async () => {
      const config = createMockConfig({
        provider: "mock",
        maxDurationSeconds: 5,
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000018");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // End call before max duration
      const result = await manager.endCall(callId);
      expect(result.success).toBe(true);

      // Wait a bit - should not auto-hangup
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Call should be gone (ended, not auto-hung up)
      const call = manager.getCall(callId);
      expect(call).toBeUndefined();
    });
  });

  describe("Call History Retrieval", () => {
    it("should retrieve call history from JSONL log", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Create a call
      const { callId: callId1 } = await manager.initiateCall("+15550000019");

      // Wait for it to be persisted
      await new Promise((resolve) => setTimeout(resolve, 200));

      const history = await manager.getCallHistory(10);

      expect(history.length).toBeGreaterThan(0);
      const callIds = history.map((call) => call.callId);
      expect(callIds).toContain(callId1);
    });

    it("should respect history limit", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      // Create 5 calls
      for (let i = 0; i < 5; i++) {
        await manager.initiateCall(`+1555000${String(i).padStart(4, "0")}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Request history with limit of 2
      const history = await manager.getCallHistory(2);

      expect(history.length).toBeLessThanOrEqual(2);
    });

    it("should return empty history when no log exists", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const history = await manager.getCallHistory();

      expect(history).toEqual([]);
    });

    it("should skip invalid records in history", async () => {
      const config = createMockConfig({ provider: "mock" });
      const logPath = path.join(tempDir, "calls.jsonl");

      const validRecord: CallRecord = {
        callId: "valid-history-call",
        provider: "mock",
        direction: "outbound",
        state: "completed",
        from: "+15550000000",
        to: "+15550000001",
        startedAt: Date.now(),
        endedAt: Date.now() + 1000,
        endReason: "completed",
        transcript: [],
        processedEventIds: [],
      };

      const lines = [
        "{invalid",
        JSON.stringify(validRecord),
        "more invalid",
      ].join("\n");

      fs.writeFileSync(logPath, lines);

      const manager = new CallManager(config, tempDir);
      const history = await manager.getCallHistory();

      expect(history.length).toBe(1);
      expect(history[0]?.callId).toBe("valid-history-call");
    });
  });

  describe("Provider Call ID Mapping", () => {
    it("should map and lookup calls by provider call ID", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000021");

      // The manager should have set up the provider call ID mapping
      // Get the call and check its providerCallId
      const call = manager.getCall(callId);
      const providerCallId = call?.providerCallId;

      expect(providerCallId).toBeDefined();

      // Should be able to lookup by provider call ID
      const lookedUp = manager.getCallByProviderCallId(providerCallId || "");
      expect(lookedUp?.callId).toBe(callId);
    });

    it("should update provider call ID if changed in event", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000022");

      const oldProviderId = "old-provider-id";
      const newProviderId = "new-provider-id";

      // Manually set old provider ID for testing
      const call = manager.getCall(callId);
      if (call) {
        call.providerCallId = oldProviderId;
      }

      // Process event with new provider ID
      manager.processEvent({
        id: "evt-with-new-id",
        type: "call.answered",
        callId,
        providerCallId: newProviderId,
        timestamp: Date.now(),
      });

      // Should be able to lookup by new provider ID
      const lookedUp = manager.getCallByProviderCallId(newProviderId);
      expect(lookedUp?.callId).toBe(callId);
    });
  });

  describe("Notify Mode", () => {
    it("should generate TwiML for notify mode", async () => {
      const config = createMockConfig({
        provider: "mock",
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, webhookUrl);

      const initialMessage = "This is a notification!";
      const { callId, success } = await manager.initiateCall("+15550000023", undefined, {
        message: initialMessage,
        mode: "notify",
      });

      expect(success).toBe(true);

      // Check that provider was called with inlineTwiml
      const lastCall = mockProvider.getLastInitiateCall();
      expect(lastCall?.inlineTwiml).toBeDefined();
      expect(lastCall?.inlineTwiml).toContain("Say");
      expect(lastCall?.inlineTwiml).toContain(initialMessage);
    });

    it("should auto-hangup in notify mode after speaking (sync test)", async () => {
      const config = createMockConfig({
        provider: "mock",
        outbound: {
          defaultMode: "conversation",
          notifyHangupDelaySec: 1,
        },
      });
      const manager = new CallManager(config, tempDir, scheduler);
      manager.initialize(mockProvider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000024", undefined, {
        message: "Goodbye!",
        mode: "notify",
      });

      // Simulate call answered (this triggers speakInitialMessage for non-twilio providers)
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      // Give the initial message time to be "spoken" (async speakInitialMessage)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify the call still exists
      let call = manager.getCall(callId);
      expect(call).toBeDefined();

      // Verify cleanup scheduler has the notify mode hangup scheduled
      expect(scheduler.getScheduled()).toContain(callId);

      // Trigger the notify mode hangup and await async operations
      await scheduler.triggerTimeoutAsync(callId);

      // Call should be ended
      call = manager.getCall(callId);
      expect(call).toBeUndefined();
    });
  });
});
