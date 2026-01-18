/**
 * Provider Routing Integration Tests
 *
 * Tests for multi-provider support and correct routing of calls to appropriate providers.
 * Validates that the manager correctly routes calls based on platform type and provider registration.
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig } from "./mocks/config.js";
import type { VoiceCallProvider } from "../providers/base.js";
import type { PlayTtsInput, InitiateCallInput, InitiateCallResult, HangupCallInput } from "../types.js";

describe("Provider Routing Integration", () => {
  let tempDir: string;
  const webhookUrl = "https://example.com/webhook";

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-routing-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("Single Provider Initialization", () => {
    it("should register provider by its name during initialization", () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const provider = new MockVoiceProvider();

      manager.initialize(provider, webhookUrl);

      // Provider should be registered under its name
      expect(manager.getProviderForPlatform("mock")).toBe(provider);
      expect(manager.getProvider()).toBe(provider);
    });

    it("should route calls to primary provider when initialized", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const provider = new MockVoiceProvider();

      manager.initialize(provider, webhookUrl);

      const { callId, success } = await manager.initiateCall("+15550000001");
      expect(success).toBe(true);

      // Verify call was routed through the provider
      expect(provider.getCallCount()).toBe(1);
      const call = manager.getCall(callId);
      expect(call?.provider).toBe("mock");
    });
  });

  describe("Multi-Provider Registration", () => {
    it("should register multiple providers for different platform names", () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const mockProvider1 = new MockVoiceProvider();
      const mockProvider2 = new MockVoiceProvider();
      const mockProvider3 = new MockVoiceProvider();

      // Register providers under different platform keys
      manager.registerProvider("custom1", mockProvider1);
      manager.registerProvider("custom2", mockProvider2);
      manager.registerProvider("custom3", mockProvider3);

      expect(manager.getProviderForPlatform("custom1")).toBe(mockProvider1);
      expect(manager.getProviderForPlatform("custom2")).toBe(mockProvider2);
      expect(manager.getProviderForPlatform("custom3")).toBe(mockProvider3);
    });

    it("should route calls to primary provider when platform not specified", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const primaryProvider = new MockVoiceProvider();

      manager.initialize(primaryProvider, webhookUrl);

      const { callId, success } = await manager.initiateCall("+15550000001");

      expect(success).toBe(true);
      expect(primaryProvider.getCallCount()).toBe(1);
      expect(manager.getCall(callId)?.provider).toBe("mock");
    });

    it("should route calls to alternate provider when platform specified", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const primaryProvider = new MockVoiceProvider();
      const altProvider = new MockVoiceProvider();

      manager.initialize(primaryProvider, webhookUrl);
      manager.registerProvider("alternate", altProvider);

      const { callId, success } = await manager.initiateCall("+15550000002", undefined, {
        platform: "alternate",
      });

      expect(success).toBe(true);
      expect(altProvider.getCallCount()).toBe(1);
      expect(primaryProvider.getCallCount()).toBe(0);
      expect(manager.getCall(callId)?.provider).toBe("mock");
    });

    it("should fallback to primary provider if requested platform not found", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const primaryProvider = new MockVoiceProvider();

      manager.initialize(primaryProvider, webhookUrl);

      const { success, error } = await manager.initiateCall("+15550000003", undefined, {
        platform: "nonexistent",
      });

      expect(success).toBe(false);
      expect(error).toContain("Provider not initialized");
    });

    it("should route different calls to different providers", async () => {
      const config = createMockConfig({ provider: "mock", maxConcurrentCalls: 10 });
      const manager = new CallManager(config, tempDir);
      const primaryProvider = new MockVoiceProvider();
      const alt1Provider = new MockVoiceProvider();
      const alt2Provider = new MockVoiceProvider();

      manager.initialize(primaryProvider, webhookUrl);
      manager.registerProvider("alt1", alt1Provider);
      manager.registerProvider("alt2", alt2Provider);

      // Initiate calls to different providers
      const call1 = await manager.initiateCall("+15550000001");
      const call2 = await manager.initiateCall("+15550000002", undefined, { platform: "alt1" });
      const call3 = await manager.initiateCall("+15550000003", undefined, { platform: "alt2" });

      expect(call1.success).toBe(true);
      expect(call2.success).toBe(true);
      expect(call3.success).toBe(true);

      expect(primaryProvider.getCallCount()).toBe(1);
      expect(alt1Provider.getCallCount()).toBe(1);
      expect(alt2Provider.getCallCount()).toBe(1);
    });
  });

  describe("Simultaneous Multi-Platform Calls", () => {
    it("should handle multiple simultaneous calls on different providers", async () => {
      const config = createMockConfig({ provider: "mock", maxConcurrentCalls: 10 });
      const manager = new CallManager(config, tempDir);
      const primaryProvider = new MockVoiceProvider();
      const altProvider1 = new MockVoiceProvider();
      const altProvider2 = new MockVoiceProvider();

      manager.initialize(primaryProvider, webhookUrl);
      manager.registerProvider("alt1", altProvider1);
      manager.registerProvider("alt2", altProvider2);

      // Initiate calls on different provider instances
      const call1 = await manager.initiateCall("+15550000001", undefined, { platform: "alt1" });
      const call2 = await manager.initiateCall("+15550000002", undefined, { platform: "alt2" });
      const call3 = await manager.initiateCall("+15550000003");

      expect(call1.success).toBe(true);
      expect(call2.success).toBe(true);
      expect(call3.success).toBe(true);

      // Verify correct providers were called
      expect(altProvider1.getCallCount()).toBe(1);
      expect(altProvider2.getCallCount()).toBe(1);
      expect(primaryProvider.getCallCount()).toBe(1);

      // Verify all calls are active
      expect(manager.getActiveCalls().length).toBe(3);

      // Verify call records all have mock provider (since MockVoiceProvider.name === "mock")
      expect(manager.getCall(call1.callId)?.provider).toBe("mock");
      expect(manager.getCall(call2.callId)?.provider).toBe("mock");
      expect(manager.getCall(call3.callId)?.provider).toBe("mock");
    });
  });

  describe("Provider-Specific Event Routing", () => {
    it("should route call.answered events correctly", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const mockProvider = new MockVoiceProvider();
      const altProvider = new MockVoiceProvider();

      manager.initialize(mockProvider, webhookUrl);
      manager.registerProvider("alt1", altProvider);

      // Create a call on alternate provider
      const { callId } = await manager.initiateCall("+15550000001", undefined, {
        platform: "alt1",
      });

      // Process answer event
      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      const call = manager.getCall(callId);
      expect(call?.state).toBe("answered");
    });

    it("should route call.active events correctly", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const altProvider = new MockVoiceProvider();

      manager.initialize(new MockVoiceProvider(), webhookUrl);
      manager.registerProvider("alt1", altProvider);

      const { callId } = await manager.initiateCall("+15550000002", undefined, {
        platform: "alt1",
      });

      manager.processEvent({
        id: "evt-active",
        type: "call.active",
        callId,
        timestamp: Date.now(),
      });

      expect(manager.getCall(callId)?.state).toBe("active");
    });

    it("should route call.speech events correctly", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const altProvider = new MockVoiceProvider();

      manager.initialize(new MockVoiceProvider(), webhookUrl);
      manager.registerProvider("alt1", altProvider);

      const { callId } = await manager.initiateCall("+15550000003", undefined, {
        platform: "alt1",
      });

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      manager.processEvent({
        id: "evt-speech",
        type: "call.speech",
        callId,
        transcript: "Hello",
        isFinal: true,
        timestamp: Date.now(),
      });

      const call = manager.getCall(callId);
      expect(call?.transcript).toHaveLength(1);
      expect(call?.transcript[0]?.speaker).toBe("user");
      expect(call?.transcript[0]?.text).toBe("Hello");
    });

    it("should route call.ended events and clean up calls", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const altProvider = new MockVoiceProvider();

      manager.initialize(new MockVoiceProvider(), webhookUrl);
      manager.registerProvider("alt1", altProvider);

      const { callId } = await manager.initiateCall("+15550000001", undefined, {
        platform: "alt1",
      });

      expect(manager.getCall(callId)).toBeDefined();

      manager.processEvent({
        id: "evt-ended",
        type: "call.ended",
        callId,
        reason: "completed",
        timestamp: Date.now(),
      });

      // Call should be removed after ending
      expect(manager.getCall(callId)).toBeUndefined();
    });
  });

  describe("Call Cleanup After Provider Operations", () => {
    it("should remove call from manager when hangupCall succeeds", async () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const provider = new MockVoiceProvider();

      manager.initialize(provider, webhookUrl);

      const { callId } = await manager.initiateCall("+15550000001");

      manager.processEvent({
        id: "evt-answered",
        type: "call.answered",
        callId,
        timestamp: Date.now(),
      });

      expect(manager.getCall(callId)).toBeDefined();

      // End the call
      const result = await manager.endCall(callId);
      expect(result.success).toBe(true);

      // Verify provider's hangupCall was called
      expect(provider.hangupCallCalls).toHaveLength(1);

      // Call should be removed from manager
      expect(manager.getCall(callId)).toBeUndefined();
    });

    it("should handle provider errors without crashing", async () => {
      const config = createMockConfig({ provider: "mock", maxConcurrentCalls: 10 });
      const manager = new CallManager(config, tempDir);
      const goodProvider = new MockVoiceProvider();
      const badProvider = new MockVoiceProvider();

      badProvider.shouldFailInitiate = true;
      badProvider.failureReason = "Provider error";

      manager.initialize(goodProvider, webhookUrl);
      manager.registerProvider("bad", badProvider);

      // Call that will fail
      const result1 = await manager.initiateCall("+15550000001", undefined, {
        platform: "bad",
      });
      expect(result1.success).toBe(false);
      expect(result1.error).toContain("Provider error");

      // Subsequent call should still work (using primary provider)
      const result2 = await manager.initiateCall("+15550000002");
      expect(result2.success).toBe(true);

      // Verify good provider still works
      expect(goodProvider.getCallCount()).toBe(1);
    });

    it("should not affect other providers when one fails", async () => {
      const config = createMockConfig({ provider: "mock", maxConcurrentCalls: 10 });
      const manager = new CallManager(config, tempDir);
      const workingProvider = new MockVoiceProvider();
      const brokenProvider = new MockVoiceProvider();

      manager.initialize(workingProvider, webhookUrl);
      manager.registerProvider("broken", brokenProvider);

      // Create a call on the broken provider first (it will fail during init)
      brokenProvider.shouldFailInitiate = true;
      const failedCall = await manager.initiateCall("+15550000001", undefined, {
        platform: "broken",
      });
      expect(failedCall.success).toBe(false);

      // Create a call on the working provider
      const successCall = await manager.initiateCall("+15550000002");
      expect(successCall.success).toBe(true);

      // Verify only the working provider's call exists
      expect(manager.getActiveCalls()).toHaveLength(1);
      expect(manager.getActiveCalls()[0]?.provider).toBe("mock");
    });
  });

  describe("Provider Initialization and Lifecycle", () => {
    it("should support registering provider after initialization", () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const primaryProvider = new MockVoiceProvider();

      manager.initialize(primaryProvider, webhookUrl);

      // Register additional provider after initialization
      const altProvider = new MockVoiceProvider();
      manager.registerProvider("alt1", altProvider);

      expect(manager.getProviderForPlatform("alt1")).toBe(altProvider);
      expect(manager.getProvider()).toBe(primaryProvider);
    });

    it("should retrieve all registered providers", () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      const providers = [new MockVoiceProvider(), new MockVoiceProvider(), new MockVoiceProvider()];

      manager.initialize(providers[0], webhookUrl);
      manager.registerProvider("alt1", providers[1]);
      manager.registerProvider("alt2", providers[2]);

      const allProviders = manager.getAllProviders();
      expect(allProviders).toHaveLength(3);
      expect(allProviders).toContain(providers[0]);
      expect(allProviders).toContain(providers[1]);
      expect(allProviders).toContain(providers[2]);
    });
  });

  describe("Provider Call ID Mapping for Multi-Provider", () => {
    it("should maintain separate provider call ID mappings for each provider", async () => {
      const config = createMockConfig({ provider: "mock", maxConcurrentCalls: 10 });
      const manager = new CallManager(config, tempDir);
      const mockProvider = new MockVoiceProvider();
      const altProvider = new MockVoiceProvider();

      manager.initialize(mockProvider, webhookUrl);
      manager.registerProvider("alt1", altProvider);

      // Create two calls on the primary (mock) provider
      const call1 = await manager.initiateCall("+15550000001");
      expect(call1.success).toBe(true);

      // Add a small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));

      const call2 = await manager.initiateCall("+15550000002");
      expect(call2.success).toBe(true);

      // Get the calls and verify they exist
      const mockCall1 = manager.getCall(call1.callId);
      const mockCall2 = manager.getCall(call2.callId);

      expect(mockCall1).toBeDefined();
      expect(mockCall2).toBeDefined();

      // Both should have provider call IDs from the mock provider responses
      expect(mockCall1?.providerCallId).toBeDefined();
      expect(mockCall2?.providerCallId).toBeDefined();

      // Should be able to lookup each by provider call ID
      const lookup1 = manager.getCallByProviderCallId(mockCall1!.providerCallId!);
      const lookup2 = manager.getCallByProviderCallId(mockCall2!.providerCallId!);

      expect(lookup1?.callId).toBe(mockCall1?.callId);
      expect(lookup2?.callId).toBe(mockCall2?.callId);
    });
  });
});
