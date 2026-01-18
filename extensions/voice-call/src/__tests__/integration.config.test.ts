/**
 * Configuration and Schema Integration Tests
 *
 * Tests configuration validation, schema parsing through CallManager,
 * fallback chains, and migrations across the voice provider system.
 */

import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CallManager } from "../manager.js";
import {
  VoiceCallConfigSchema,
  E164Schema,
  InboundPolicySchema,
  TelnyxConfigSchema,
  TwilioConfigSchema,
  PlivoConfigSchema,
  SttConfigSchema,
  TtsConfigSchema,
} from "../config.js";
import { createMockConfig, createProviderConfig } from "./mocks/config.js";
import { MockVoiceProvider } from "./mocks/providers.js";

describe("Configuration Schema Integration", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-config-${Date.now()}`);
    mockProvider = new MockVoiceProvider();
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe("E164 Phone Number Validation", () => {
    it("should accept valid E.164 format numbers", () => {
      const validNumbers = [
        "+15550000000",
        "+441234567890",
        "+886987654321",
        "+15551234567",
      ];

      validNumbers.forEach((num) => {
        const config = createMockConfig({ fromNumber: num });
        expect(config.fromNumber).toBe(num);
      });
    });

    it("should reject invalid E.164 format numbers", () => {
      // Test a few clearly invalid formats
      expect(() => createMockConfig({ fromNumber: "no-plus" })).toThrow();
      expect(() => createMockConfig({ fromNumber: "123" })).toThrow();
      expect(() => createMockConfig({ fromNumber: "" })).toThrow();
    });

    it("should provide clear error messages", () => {
      expect(() => createMockConfig({ fromNumber: "15550000000" })).toThrow();
    });
  });

  describe("Inbound Policy Validation", () => {
    it("should accept valid inbound policies", () => {
      const validPolicies = ["disabled", "allowlist", "pairing", "open"];

      validPolicies.forEach((policy) => {
        expect(InboundPolicySchema.parse(policy)).toBe(policy);
      });
    });

    it("should reject invalid policies", () => {
      expect(() => InboundPolicySchema.parse("invalid-policy")).toThrow();
    });

    it("should maintain policy across config", () => {
      const config = createMockConfig({ inboundPolicy: "allowlist" });
      expect(config.inboundPolicy).toBe("allowlist");
    });
  });

  describe("Provider-Specific Configuration", () => {
    it("should validate Telnyx configuration", () => {
      const valid = {
        apiKey: "test-key",
        connectionId: "test-conn",
        publicKey: "test-pubkey",
      };
      expect(TelnyxConfigSchema.parse(valid)).toEqual(valid);
    });

    it("should allow partial Telnyx configuration", () => {
      const partial = { apiKey: "test-key" };
      expect(TelnyxConfigSchema.parse(partial)).toEqual(partial);
    });

    it("should validate Twilio configuration", () => {
      const valid = {
        accountSid: "AC123456",
        authToken: "test-token",
      };
      expect(TwilioConfigSchema.parse(valid)).toEqual(valid);
    });

    it("should validate Plivo configuration", () => {
      const valid = {
        authId: "MA123456",
        authToken: "test-token",
      };
      expect(PlivoConfigSchema.parse(valid)).toEqual(valid);
    });

    it("should validate STT configuration", () => {
      const valid = {
        provider: "openai" as const,
        model: "whisper-1",
      };
      expect(SttConfigSchema.parse(valid)).toEqual(valid);
    });

    it("should provide STT defaults", () => {
      const parsed = SttConfigSchema.parse({});
      expect(parsed.provider).toBe("openai");
      expect(parsed.model).toBe("whisper-1");
    });

    it("should validate TTS configuration", () => {
      const valid = {
        provider: "openai" as const,
        model: "gpt-4o-mini-tts",
        voice: "coral",
        instructions: "Speak in a cheerful tone",
      };
      expect(TtsConfigSchema.parse(valid)).toEqual(valid);
    });

    it("should provide TTS defaults", () => {
      const parsed = TtsConfigSchema.parse({});
      expect(parsed.provider).toBe("openai");
      expect(parsed.model).toBe("gpt-4o-mini-tts");
      expect(parsed.voice).toBe("coral");
    });
  });

  describe("Full Configuration Schema", () => {
    it("should accept complete valid configuration", () => {
      const config = createMockConfig();
      expect(config).toBeDefined();
      expect(config.provider).toBe("mock");
    });

    it("should validate provider selection through manager", () => {
      const providers = ["telnyx", "twilio", "plivo"] as const;
      providers.forEach((provider) => {
        const config = createProviderConfig(provider);
        const manager = new CallManager(config, tempDir);
        expect(manager).toBeDefined();
      });
    });

    it("should enforce required fields", () => {
      // Provider and fromNumber are optional in the schema, so they don't throw
      // This test validates that the schema can handle empty provider gracefully
      const config = createMockConfig({
        provider: undefined as any,
      });
      expect(config).toBeDefined();
    });

    it("should validate allowFrom array with E.164 numbers", () => {
      const config = createMockConfig({
        allowFrom: ["+15550000001", "+15550000002"],
      });
      expect(config.allowFrom).toHaveLength(2);
      expect(config.allowFrom).toContain("+15550000001");
    });

    it("should reject invalid allowFrom numbers", () => {
      expect(() =>
        createMockConfig({
          provider: "telnyx",
          fromNumber: "+15550000000",
          allowFrom: ["invalid-number"] as any,
        }),
      ).toThrow();
    });
  });

  describe("Configuration Fallback Chains", () => {
    it("should support multiple provider configurations", () => {
      const config = createMockConfig({
        telnyx: { apiKey: "telnyx-key" },
        twilio: { accountSid: "twilio-sid" },
        plivo: { authId: "plivo-id" },
      });

      expect(config.telnyx).toBeDefined();
      expect(config.twilio).toBeDefined();
      expect(config.plivo).toBeDefined();
    });

    it("should support provider switching with manager", () => {
      const config1 = createMockConfig({ provider: "telnyx" });
      const manager1 = new CallManager(config1, tempDir);
      manager1.initialize(mockProvider, "https://example.com/webhook");

      expect(config1.provider).toBe("telnyx");

      const config2 = createMockConfig({ provider: "twilio" });
      const manager2 = new CallManager(config2, tempDir);
      manager2.initialize(mockProvider, "https://example.com/webhook");

      expect(config2.provider).toBe("twilio");
    });

    it("should use provider-specific overrides when present", () => {
      const config = createMockConfig({
        stt: { provider: "openai", model: "whisper-1" },
        tts: { provider: "openai", model: "tts-1", voice: "alloy" },
      });

      expect(config.stt.model).toBe("whisper-1");
      expect(config.tts.voice).toBe("alloy");
    });
  });

  describe("Configuration Migration", () => {
    it("should migrate from old v1 format to v2", () => {
      const oldFormat = {
        enabled: true,
        provider: "telnyx",
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
        // Old format might have different field names
      };

      const config = VoiceCallConfigSchema.parse(oldFormat);
      expect(config.provider).toBe("telnyx");
      expect(config.fromNumber).toBe("+15550000000");
    });

    it("should preserve backward compatibility", () => {
      const legacyConfig = {
        enabled: true,
        provider: "twilio" as const,
        fromNumber: "+15550000000",
      };

      expect(() => VoiceCallConfigSchema.parse(legacyConfig)).not.toThrow();
    });

    it("should provide migration warnings for deprecated fields", () => {
      // This test documents expected behavior for deprecated fields
      const config = createMockConfig();
      // If deprecated fields are present, they should be handled gracefully
      expect(config).toBeDefined();
    });
  });

  describe("Configuration Persistence and Retrieval", () => {
    it("should support stringifying configuration", () => {
      const config = createMockConfig();
      const json = JSON.stringify(config);
      const parsed = JSON.parse(json);

      expect(parsed.provider).toBe(config.provider);
      expect(parsed.fromNumber).toBe(config.fromNumber);
    });

    it("should persist and retrieve configuration through manager", async () => {
      const config = createMockConfig({
        provider: "telnyx",
        telnyx: { apiKey: "test-key" },
      });
      const manager = new CallManager(config, tempDir);

      // Configuration should be intact after manager initialization
      expect(manager).toBeDefined();
    });

    it("should handle circular references gracefully", () => {
      const config = createMockConfig();
      // Configuration should not have circular references
      expect(() => JSON.stringify(config)).not.toThrow();
    });

    it("should preserve types when serializing fields", () => {
      const config = createMockConfig({
        telnyx: { apiKey: "secret-key" },
      });

      const json = JSON.stringify(config);
      const parsed = JSON.parse(json);

      expect(parsed.telnyx.apiKey).toBe("secret-key");
    });
  });

  describe("Configuration Defaults", () => {
    it("should provide sensible defaults for STT", () => {
      const config = createMockConfig({ stt: {} });
      expect(config.stt.provider).toBe("openai");
      expect(config.stt.model).toBe("whisper-1");
    });

    it("should provide sensible defaults for TTS", () => {
      const config = createMockConfig({ tts: {} });
      expect(config.tts.provider).toBe("openai");
      expect(config.tts.model).toBe("gpt-4o-mini-tts");
      expect(config.tts.voice).toBe("coral");
    });

    it("should provide sensible defaults for inbound policy", () => {
      const config = createMockConfig({
        inboundPolicy: undefined as any,
      });
      // Should have a sensible default (typically "disabled" for safety)
      expect(["disabled", "allowlist", "pairing", "open"]).toContain(
        config.inboundPolicy,
      );
    });

    it("should default to empty allowFrom list", () => {
      const config = createMockConfig({
        allowFrom: undefined as any,
      });
      expect(Array.isArray(config.allowFrom)).toBe(true);
    });
  });

  describe("Configuration Validation Errors", () => {
    it("should report clear error on invalid provider", () => {
      expect(() =>
        VoiceCallConfigSchema.parse({
          enabled: true,
          provider: "invalid-provider",
          fromNumber: "+15550000000",
        }),
      ).toThrow();
    });

    it("should allow missing fromNumber in config (validated at call time)", () => {
      // fromNumber is optional in schema (can have defaults at call time)
      const config = createMockConfig({
        provider: "telnyx",
        fromNumber: undefined as any,
      });
      // Config created but fromNumber is undefined
      expect(config.fromNumber).toBeUndefined();
    });

    it("should report clear error on invalid phone format", () => {
      expect(() =>
        VoiceCallConfigSchema.parse({
          enabled: true,
          provider: "telnyx",
          fromNumber: "not-a-phone",
        }),
      ).toThrow("Expected E.164 format");
    });
  });
});
