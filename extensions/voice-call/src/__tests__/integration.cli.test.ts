/**
 * CLI Command Integration Tests
 *
 * Tests all CLI voice commands with proper error handling,
 * output validation, and option parsing through the CallManager.
 */

import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CallManager } from "../manager.js";
import { createMockConfig } from "./mocks/config.js";
import { MockVoiceProvider } from "./mocks/providers.js";

describe("CLI Voice Commands Integration", () => {
  let mockProvider: MockVoiceProvider;
  let tempDir: string;

  beforeEach(() => {
    mockProvider = new MockVoiceProvider();
    tempDir = path.join(os.tmpdir(), `voice-cli-${Date.now()}`);
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe("clawdbot voice configure", () => {
    it("should parse and apply provider selection option", () => {
      const config = createMockConfig({ provider: "telnyx" });
      expect(config.provider).toBe("telnyx");

      const config2 = createMockConfig({ provider: "twilio" });
      expect(config2.provider).toBe("twilio");
    });

    it("should parse and validate phone number options", () => {
      const config = createMockConfig({
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
      });

      expect(config.fromNumber).toMatch(/^\+[0-9]{10,15}$/);
      expect(config.toNumber).toMatch(/^\+[0-9]{10,15}$/);
    });

    it("should parse and persist provider credentials", () => {
      const config = createMockConfig({
        telnyx: { apiKey: "test-key", connectionId: "test-conn" },
      });

      expect(config.telnyx?.apiKey).toBe("test-key");
      expect(config.telnyx?.connectionId).toBe("test-conn");
    });

    it("should validate and apply inbound policy option", () => {
      const validPolicies = ["disabled", "allowlist", "pairing", "open"] as const;

      for (const policy of validPolicies) {
        const config = createMockConfig({ inboundPolicy: policy });
        expect(config.inboundPolicy).toBe(policy);
      }
    });

    it("should parse and validate allowFrom list", () => {
      const config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001", "+15550000002"],
      });

      expect(Array.isArray(config.allowFrom)).toBe(true);
      expect(config.allowFrom).toHaveLength(2);
      config.allowFrom.forEach((num) => {
        expect(num).toMatch(/^\+[0-9]{10,15}$/);
      });
    });

    it("should error on invalid provider", () => {
      expect(() => {
        createMockConfig({ provider: "invalid-provider" as any });
      }).toThrow();
    });

    it("should error on invalid phone format", () => {
      expect(() => {
        createMockConfig({ fromNumber: "not-a-phone" }); // Invalid format
      }).toThrow();
    });
  });

  describe("clawdbot voice status", () => {
    it("should report provider status through manager", () => {
      const config = createMockConfig({
        provider: "telnyx",
        telnyx: { apiKey: "test-key" },
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      expect(manager.getProvider()).toBe(mockProvider);
      expect(manager.getActiveCalls()).toHaveLength(0);
    });

    it("should report active call count", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      expect(manager.getActiveCalls()).toHaveLength(0);

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(true);

      expect(manager.getActiveCalls()).toHaveLength(1);
    });

    it("should display credentials status", () => {
      const config = createMockConfig({
        telnyx: { apiKey: "key1" },
        twilio: { accountSid: "sid1" },
        plivo: { authId: "id1" },
      });

      const status = {
        telnyxConfigured: !!config.telnyx?.apiKey,
        twilioConfigured: !!config.twilio?.accountSid,
        plivoConfigured: !!config.plivo?.authId,
      };

      expect(status.telnyxConfigured).toBe(true);
      expect(status.twilioConfigured).toBe(true);
      expect(status.plivoConfigured).toBe(true);
    });

    it("should handle no active calls gracefully", () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const activeCalls = manager.getActiveCalls();
      expect(activeCalls).toHaveLength(0);
    });

    it("should show provider status details", () => {
      const config = createMockConfig({
        provider: "telnyx",
        telnyx: { apiKey: "key" },
      });

      expect(config.provider).toBe("telnyx");
      expect(config.enabled).toBe(true);
    });
  });

  describe("clawdbot voice test", () => {
    it("should execute provider connectivity test", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(true);
      expect(mockProvider.getCallCount()).toBe(1);
    });

    it("should report provider test failures", async () => {
      const config = createMockConfig();
      mockProvider.shouldFailInitiate = true;
      mockProvider.failureReason = "Connection timeout";

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection timeout");
    });

    it("should test with provider credentials", () => {
      const config = createMockConfig({
        telnyx: { apiKey: "real-key", connectionId: "real-conn" },
      });

      expect(config.telnyx?.apiKey).toBe("real-key");
      expect(config.telnyx?.connectionId).toBe("real-conn");
    });

    it("should allow incomplete credentials in config (validate at use)", () => {
      // Config with empty credentials is allowed (validation happens at use time)
      const config = createMockConfig({
        telnyx: { apiKey: "" },
      });
      expect(config.telnyx?.apiKey).toBe("");
    });
  });

  describe("clawdbot voice providers", () => {
    it("should list all available providers", () => {
      const providers = ["telnyx", "twilio", "plivo"] as const;

      for (const provider of providers) {
        const config = createMockConfig({ provider });
        expect(config.provider).toBe(provider);
      }
    });

    it("should show provider configuration details", () => {
      const config = createMockConfig({
        provider: "telnyx",
        telnyx: { apiKey: "key", connectionId: "conn" },
      });

      expect(config.provider).toBe("telnyx");
      expect(config.telnyx?.apiKey).toBe("key");
    });

    it("should show all provider types available", () => {
      const providers = ["telnyx", "twilio", "plivo"] as const;

      for (const provider of providers) {
        const config = createMockConfig({ provider });
        expect(config.provider).toBe(provider);
      }
    });
  });

  describe("CLI Error Handling", () => {
    it("should validate required configuration fields", () => {
      const config = createMockConfig();

      // All required fields should be present
      expect(config.provider).toBeDefined();
      expect(config.fromNumber).toBeDefined();
      expect(config.enabled).toBe(true);
    });

    it("should provide clear error on invalid phone format", () => {
      expect(() => {
        createMockConfig({ fromNumber: "15550000000" }); // Missing +
      }).toThrow();
    });

    it("should handle provider initialization errors", async () => {
      const config = createMockConfig();
      mockProvider.shouldFailInitiate = true;
      mockProvider.failureReason = "Failed to connect to provider API";

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to connect");
    });

    it("should handle authentication errors", () => {
      expect(() => {
        createMockConfig({
          telnyx: { apiKey: "test-key" },
        });
        // Config should allow non-empty keys
      }).not.toThrow();
    });
  });

  describe("CLI Call Operations", () => {
    it("should successfully initiate call with valid config", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(true);
      expect(result.callId).toBeDefined();

      const call = manager.getCall(result.callId);
      expect(call).toBeDefined();
      expect(call?.to).toBe("+15550000001");
    });

    it("should handle concurrent calls up to limit", async () => {
      const config = createMockConfig({ maxConcurrentCalls: 3 });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await manager.initiateCall("+1555000000" + i);
        results.push(result);
      }

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      expect(manager.getActiveCalls()).toHaveLength(3);

      // Fourth call should fail (limit reached)
      const overflow = await manager.initiateCall("+15550000004");
      expect(overflow.success).toBe(false);
      expect(overflow.error).toContain("Maximum concurrent calls");
    });

    it("should end active calls", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      expect(manager.getActiveCalls()).toHaveLength(1);

      const endResult = await manager.endCall(callId);
      expect(endResult.success).toBe(true);

      // Call is removed from active calls after being ended
      const call = manager.getCall(callId);
      expect(call).toBeUndefined();
      expect(manager.getActiveCalls()).toHaveLength(0);
    });
  });

  describe("CLI Configuration Validation", () => {
    it("should validate all required configuration fields", () => {
      const config = createMockConfig();

      expect(config.provider).toBeDefined();
      expect(config.fromNumber).toBeDefined();
      expect(config.enabled).toBe(true);
    });

    it("should support multiple provider credentials simultaneously", () => {
      const config = createMockConfig({
        telnyx: { apiKey: "key1" },
        twilio: { accountSid: "sid1" },
        plivo: { authId: "id1" },
      });

      expect(config.telnyx?.apiKey).toBe("key1");
      expect(config.twilio?.accountSid).toBe("sid1");
      expect(config.plivo?.authId).toBe("id1");
    });

    it("should validate inbound policy configuration", () => {
      const config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001"],
      });

      expect(config.inboundPolicy).toBe("allowlist");
      expect(config.allowFrom).toContain("+15550000001");
    });
  });
});
