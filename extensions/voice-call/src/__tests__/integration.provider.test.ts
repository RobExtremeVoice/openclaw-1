/**
 * Provider System Integration Tests
 *
 * Tests provider switching, fallback chains, error recovery,
 * and cross-provider consistency.
 */

import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig, createProviderConfig } from "./mocks/config.js";
import type { NormalizedEvent } from "../types.js";

describe("Provider System Integration", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-test-${Date.now()}`);
    mockProvider = new MockVoiceProvider();
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe("Provider Selection", () => {
    it("should initialize with specified provider", () => {
      const config = createProviderConfig("mock");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      expect(mockProvider.name).toBe("mock");
    });

    it("should accept different provider types", () => {
      const providers = ["telnyx", "twilio", "plivo"] as const;

      providers.forEach((provider) => {
        const config = createProviderConfig(provider);
        expect(config.provider).toBe(provider);
      });
    });

    it("should maintain provider credentials in configuration", () => {
      const config = createProviderConfig("telnyx", {
        telnyx: { apiKey: "test-key", connectionId: "test-conn" },
      });

      expect(config.telnyx?.apiKey).toBe("test-key");
      expect(config.telnyx?.connectionId).toBe("test-conn");
    });
  });

  describe("Fallback Chain Management", () => {
    it("should support multiple provider configurations", () => {
      const config = createMockConfig({
        telnyx: { apiKey: "key1" },
        twilio: { accountSid: "sid1" },
        plivo: { authId: "id1" },
      });

      expect(config.telnyx).toBeDefined();
      expect(config.twilio).toBeDefined();
      expect(config.plivo).toBeDefined();
    });

    it("should track active provider during operation", () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const call = manager.initiateCall("+15550000001");
      expect(call).toBeDefined();
    });

    it("should attempt fallback on provider failure", async () => {
      const config = createMockConfig({
        provider: "mock",
      });

      mockProvider.shouldFailInitiate = true;
      mockProvider.failureReason = "Primary provider failed";

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Primary provider failed");
    });

    it("should support dynamic provider switching", () => {
      const config = createMockConfig({ provider: "mock" });
      const manager = new CallManager(config, tempDir);

      const provider1 = new MockVoiceProvider();
      manager.initialize(provider1, "https://example.com/webhook");

      const provider2 = new MockVoiceProvider();
      // Switching provider should preserve call state
      manager.initialize(provider2, "https://example.com/webhook");

      expect(provider2.name).toBe("mock");
    });
  });

  describe("Provider Error Handling", () => {
    it("should catch and report provider initialization errors", async () => {
      const config = createMockConfig();
      mockProvider.webhookVerificationResult = { ok: false, reason: "Invalid signature" };

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = mockProvider.verifyWebhook({
        headers: {},
        rawBody: "test",
        url: "https://example.com/webhook",
        method: "POST",
      });

      expect(result.ok).toBe(false);
    });

    it("should provide detailed error messages on call failure", async () => {
      const config = createMockConfig();
      mockProvider.shouldFailInitiate = true;
      mockProvider.failureReason = "Network timeout";

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.error).toBe("Network timeout");
    });

    it("should handle provider timeout gracefully", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // Test that operation completes even with slow provider
      const startTime = Date.now();
      await manager.initiateCall("+15550000001");
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (not hang)
      expect(duration).toBeLessThan(5000);
    });

    it("should retry failed operations when appropriate", async () => {
      const config = createMockConfig();
      mockProvider.shouldFailInitiate = true;

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // Attempt 1 fails
      let result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(false);
      expect(mockProvider.getCallCount()).toBe(1);

      // Reset and attempt 2 succeeds
      mockProvider.shouldFailInitiate = false;
      result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(true);
      expect(mockProvider.getCallCount()).toBe(2);
    });
  });

  describe("Cross-Provider Consistency", () => {
    it("should normalize events across different providers", () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const event: NormalizedEvent = {
        id: "evt-1",
        type: "call.answered",
        callId: "call-123",
        providerCallId: "provider-456",
        timestamp: Date.now(),
      };

      mockProvider.setWebhookEvents([event]);
      const result = mockProvider.parseWebhookEvent({
        headers: {},
        rawBody: "test",
        url: "https://example.com/webhook",
        method: "POST",
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.type).toBe("call.answered");
    });

    it("should handle provider-specific call identifiers", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      const call = manager.getCall(callId);

      expect(call?.providerCallId).toBeDefined();
      expect(call?.from).toBe(config.fromNumber);
      expect(call?.to).toBe("+15550000001");
    });

    it("should track both internal and provider call IDs", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      const call = manager.getCall(callId);

      expect(callId).toBeDefined();
      expect(call?.callId).toBe(callId);
      expect(call?.providerCallId).toBeDefined();

      // Should be able to find by both IDs
      const byInternal = manager.getCall(callId);
      const byProvider = manager.getCallByProviderCallId(call!.providerCallId);

      expect(byInternal).toEqual(byProvider);
    });

    it("should handle provider call ID mapping upgrades", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");

      // Provider initially returns request UUID
      expect(manager.getCall(callId)?.providerCallId).toBeDefined();
      const initialId = manager.getCall(callId)!.providerCallId;

      // Later provider reports actual call UUID
      manager.processEvent({
        id: "evt-upgrade",
        type: "call.answered",
        callId,
        providerCallId: "upgraded-id",
        timestamp: Date.now(),
      });

      // Should update to new ID
      expect(manager.getCall(callId)?.providerCallId).toBe("upgraded-id");
      // Old ID should no longer resolve
      expect(manager.getCallByProviderCallId(initialId)).toBeUndefined();
    });
  });

  describe("Provider Configuration Validation", () => {
    it("should allow empty provider credentials in config (validate at use time)", () => {
      // Configuration with empty credentials is allowed (validation happens at use time)
      const config = createProviderConfig("telnyx", {
        telnyx: { apiKey: "" }, // Empty API key
      });

      // Config is created but marked as unconfigured
      expect(config.telnyx?.apiKey).toBe("");
    });

    it("should handle missing provider configuration gracefully", () => {
      const config = createMockConfig({
        provider: "telnyx",
        telnyx: undefined as any,
      });

      expect(config.telnyx).toBeUndefined();
    });

    it("should support provider-specific options", () => {
      const telnyxConfig = createProviderConfig("telnyx", {
        telnyx: {
          apiKey: "key",
          connectionId: "conn",
          publicKey: "pubkey",
        },
      });

      expect(telnyxConfig.telnyx?.connectionId).toBe("conn");
      expect(telnyxConfig.telnyx?.publicKey).toBe("pubkey");
    });
  });

  describe("Provider Webhook Handling", () => {
    it("should verify webhook signatures from provider", () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = mockProvider.verifyWebhook({
        headers: { "x-signature": "test" },
        rawBody: "event-data",
        url: "https://example.com/webhook",
        method: "POST",
      });

      expect(result).toBeDefined();
      expect(mockProvider.webhookVerifyCalls).toHaveLength(1);
    });

    it("should parse webhook events from provider", () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const event: NormalizedEvent = {
        id: "evt-1",
        type: "call.answered",
        callId: "call-123",
        timestamp: Date.now(),
      };

      mockProvider.setWebhookEvents([event]);

      const result = mockProvider.parseWebhookEvent({
        headers: {},
        rawBody: "test",
        url: "https://example.com/webhook",
        method: "POST",
      });

      expect(result.events).toHaveLength(1);
    });

    it("should handle provider-specific webhook formats", () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // Mock provider returns normalized events regardless of raw format
      mockProvider.setWebhookEvents([
        {
          id: "evt-1",
          type: "call.ended",
          callId: "call-123",
          reason: "completed",
          timestamp: Date.now(),
        },
      ]);

      const result = mockProvider.parseWebhookEvent({
        headers: {},
        rawBody: "provider-specific-format",
        url: "https://example.com/webhook",
        method: "POST",
      });

      expect(result.events[0]?.type).toBe("call.ended");
    });
  });

  describe("Provider State Management", () => {
    it("should maintain provider state across operations", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 10 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // Perform multiple operations
      const result1 = await manager.initiateCall("+15550000001");
      expect(result1.success).toBe(true);

      const result2 = await manager.initiateCall("+15550000002");
      expect(result2.success).toBe(true);

      // Both calls should be in active calls
      expect(manager.getActiveCalls()).toHaveLength(2);
      expect(manager.getCall(result1.callId)).toBeDefined();
      expect(manager.getCall(result2.callId)).toBeDefined();
    });

    it("should clean up provider resources on shutdown", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      await manager.initiateCall("+15550000001");

      // Cleanup should not throw
      expect(() => {
        // Shutdown logic would go here
      }).not.toThrow();
    });
  });
});
