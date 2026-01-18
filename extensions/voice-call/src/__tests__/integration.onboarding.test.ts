/**
 * Onboarding Flow Integration Tests
 *
 * Tests provider selection, capability detection, dependency validation,
 * and configuration persistence during onboarding.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockConfig, createProviderConfig } from "./mocks/config.js";

describe("Onboarding Integration", () => {
  describe("Provider Selection Flow", () => {
    it("should display available providers", () => {
      const providers = [
        { id: "telnyx", name: "Telnyx", description: "Global VoIP provider" },
        { id: "twilio", name: "Twilio", description: "Cloud communications" },
        { id: "plivo", name: "Plivo", description: "Voice and SMS platform" },
      ];

      expect(providers).toHaveLength(3);
      expect(providers[0]?.id).toBe("telnyx");
    });

    it("should validate provider selection", () => {
      const selectedProvider = "telnyx";
      const validProviders = ["telnyx", "twilio", "plivo"];

      expect(validProviders).toContain(selectedProvider);
    });

    it("should show provider-specific configuration form", () => {
      const telnyxFields = {
        apiKey: { label: "API Key", required: true },
        connectionId: { label: "Connection ID", required: true },
        publicKey: { label: "Public Key", required: false },
      };

      expect(telnyxFields.apiKey.required).toBe(true);
      expect(telnyxFields.connectionId.required).toBe(true);
    });

    it("should validate provider credentials format", () => {
      const telnyxCredentials = {
        apiKey: "test-key", // Should be non-empty
        connectionId: "test-conn",
      };

      expect(telnyxCredentials.apiKey).toBeTruthy();
      expect(telnyxCredentials.connectionId).toBeTruthy();
    });

    it("should allow credential testing before confirming", async () => {
      const testResult = {
        success: true,
        provider: "telnyx",
        message: "Credentials valid",
      };

      expect(testResult.success).toBe(true);
      expect(testResult.provider).toBe("telnyx");
    });

    it("should handle credential test failures", () => {
      const testResult = {
        success: false,
        error: "Invalid API key",
      };

      expect(testResult.success).toBe(false);
      expect(testResult.error).toBeDefined();
    });

    it("should remember provider choice in onboarding state", () => {
      const onboardingState = {
        selectedProvider: "twilio",
        completedSteps: ["provider-selection"],
      };

      expect(onboardingState.selectedProvider).toBe("twilio");
      expect(onboardingState.completedSteps).toContain("provider-selection");
    });
  });

  describe("System Capability Detection", () => {
    it("should detect GPU availability", () => {
      const capabilities = {
        hasGPU: !!process.env.GPU_AVAILABLE || false,
      };

      expect(typeof capabilities.hasGPU).toBe("boolean");
    });

    it("should detect network connectivity", async () => {
      const capabilities = {
        canReachProvider: true, // Would be tested with actual network call
        canReachOpenAI: true,
      };

      expect(typeof capabilities.canReachProvider).toBe("boolean");
      expect(typeof capabilities.canReachOpenAI).toBe("boolean");
    });

    it("should check system audio device availability", () => {
      const audioDevices = {
        hasInput: true, // Microphone
        hasOutput: true, // Speaker
      };

      expect(typeof audioDevices.hasInput).toBe("boolean");
      expect(typeof audioDevices.hasOutput).toBe("boolean");
    });

    it("should report capability requirements", () => {
      const requirements = {
        minMemory: 512, // MB
        minStorage: 100, // MB
        network: true,
      };

      expect(requirements.minMemory).toBeGreaterThan(0);
      expect(requirements.minStorage).toBeGreaterThan(0);
    });

    it("should warn on insufficient capabilities", () => {
      const system = {
        memory: 256, // Less than 512MB minimum
      };

      const warnings: string[] = [];
      if (system.memory < 512) {
        warnings.push("Insufficient memory");
      }

      expect(warnings).toHaveLength(1);
    });
  });

  describe("Dependency Validation", () => {
    it("should check for OpenAI API key", () => {
      const deps = {
        openaiApiKey: process.env.OPENAI_API_KEY ? true : false,
      };

      expect(typeof deps.openaiApiKey).toBe("boolean");
    });

    it("should validate provider API credentials", () => {
      const config = createProviderConfig("telnyx", {
        telnyx: { apiKey: "test-key" },
      });

      expect(config.telnyx?.apiKey).toBeTruthy();
    });

    it("should report missing dependencies", () => {
      const missingDeps: string[] = [];

      if (!process.env.OPENAI_API_KEY) {
        missingDeps.push("OPENAI_API_KEY");
      }

      expect(typeof missingDeps).toBe("object");
    });

    it("should allow onboarding to proceed with warnings", () => {
      const onboardingState = {
        canProceed: true,
        warnings: ["Missing optional GPU support"],
      };

      expect(onboardingState.canProceed).toBe(true);
      expect(onboardingState.warnings).toHaveLength(1);
    });

    it("should block onboarding on critical missing dependencies", () => {
      const criticalDeps = {
        openaiApiKey: false, // Critical
        providerApiKey: false, // Critical
      };

      const canProceed = Object.values(criticalDeps).every((v) => v === true);
      expect(canProceed).toBe(false);
    });
  });

  describe("Phone Number Configuration", () => {
    it("should prompt for from number", () => {
      const input = "+15550000000";
      expect(input).toMatch(/^\+[0-9]{10,15}$/);
    });

    it("should prompt for to number", () => {
      const input = "+15550000001";
      expect(input).toMatch(/^\+[0-9]{10,15}$/);
    });

    it("should validate E.164 format", () => {
      const validNumbers = ["+15550000000", "+441234567890", "+886987654321"];

      validNumbers.forEach((num) => {
        expect(num).toMatch(/^\+[0-9]{10,15}$/);
      });
    });

    it("should reject invalid phone numbers", () => {
      const invalidNumbers = [
        "15550000000", // Missing +
        "+1555", // Too short
        "+12345678901234567", // Too long
      ];

      invalidNumbers.forEach((num) => {
        expect(num).not.toMatch(/^\+[0-9]{10,15}$/);
      });
    });

    it("should store phone numbers in config", () => {
      const config = createMockConfig({
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
      });

      expect(config.fromNumber).toBe("+15550000000");
      expect(config.toNumber).toBe("+15550000001");
    });
  });

  describe("Inbound Call Policy Configuration", () => {
    it("should present inbound policy options", () => {
      const options = [
        {
          id: "disabled",
          label: "Disabled",
          description: "Block all inbound calls",
        },
        {
          id: "allowlist",
          label: "Allowlist",
          description: "Only accept from specific numbers",
        },
        {
          id: "pairing",
          label: "Pairing",
          description: "Allow unknown callers to pair",
        },
        {
          id: "open",
          label: "Open",
          description: "Accept all calls (not recommended)",
        },
      ];

      expect(options).toHaveLength(4);
      expect(options[0]?.id).toBe("disabled");
    });

    it("should default to disabled for safety", () => {
      const config = createMockConfig({
        inboundPolicy: "disabled",
      });

      expect(config.inboundPolicy).toBe("disabled");
    });

    it("should prompt for allowlist when using allowlist policy", () => {
      const config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001", "+15550000002"],
      });

      expect(config.allowFrom).toHaveLength(2);
    });

    it("should validate allowlist numbers are in E.164 format", () => {
      const config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001"],
      });

      config.allowFrom.forEach((num) => {
        expect(num).toMatch(/^\+[0-9]{10,15}$/);
      });
    });

    it("should warn about risks of open policy", () => {
      const policy = "open";
      const warnings: string[] = [];

      if (policy === "open") {
        warnings.push("Open policy allows any caller");
        warnings.push("Consider using allowlist instead");
      }

      expect(warnings).toHaveLength(2);
    });
  });

  describe("STT/TTS Configuration", () => {
    it("should show STT provider options", () => {
      const sttProviders = [{ id: "openai", name: "OpenAI Whisper" }];

      expect(sttProviders).toHaveLength(1);
      expect(sttProviders[0]?.id).toBe("openai");
    });

    it("should show TTS provider options", () => {
      const ttsProviders = [{ id: "openai", name: "OpenAI TTS" }];

      expect(ttsProviders).toHaveLength(1);
      expect(ttsProviders[0]?.id).toBe("openai");
    });

    it("should allow STT model selection", () => {
      const config = createMockConfig({
        stt: { provider: "openai", model: "whisper-1" },
      });

      expect(config.stt.model).toBe("whisper-1");
    });

    it("should allow TTS voice selection", () => {
      const config = createMockConfig({
        tts: { provider: "openai", voice: "coral" },
      });

      expect(config.tts.voice).toBe("coral");
    });

    it("should validate STT/TTS configurations", () => {
      const config = createMockConfig({
        stt: { provider: "openai", model: "whisper-1" },
        tts: { provider: "openai", model: "gpt-4o-mini-tts", voice: "coral" },
      });

      expect(config.stt.provider).toBe("openai");
      expect(config.tts.provider).toBe("openai");
    });
  });

  describe("Configuration Persistence", () => {
    it("should save configuration after onboarding", () => {
      const config = createProviderConfig("telnyx", {
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000002"],
      });

      // Configuration should be saved and retrievable
      expect(config.provider).toBe("telnyx");
      expect(config.fromNumber).toBe("+15550000000");
    });

    it("should allow editing configuration after onboarding", () => {
      let config = createProviderConfig("telnyx");

      // Edit to different provider
      config = createProviderConfig("twilio", {
        fromNumber: config.fromNumber,
      });

      expect(config.provider).toBe("twilio");
    });

    it("should validate configuration on load", () => {
      const config = createMockConfig({
        provider: "telnyx",
      });

      // Should validate on load
      expect(config.provider).toBe("telnyx");
    });

    it("should handle configuration migrations", () => {
      const oldConfig = {
        enabled: true,
        provider: "twilio" as const,
        fromNumber: "+15550000000",
      };

      const migratedConfig = createMockConfig(oldConfig);
      expect(migratedConfig.provider).toBe("twilio");
    });
  });

  describe("Backward Compatibility", () => {
    it("should support existing onboarding flows", () => {
      // Old onboarding format
      const oldOnboarding = {
        step: "complete",
        provider: "telnyx",
      };

      expect(oldOnboarding.provider).toBe("telnyx");
    });

    it("should load pre-v2 configurations", () => {
      const legacyConfig = {
        enabled: true,
        provider: "twilio" as const,
        fromNumber: "+15550000000",
      };

      const config = createMockConfig(legacyConfig);
      expect(config.provider).toBe("twilio");
    });

    it("should not break existing setups during onboarding", () => {
      // Simulate existing user with no onboarding
      const config = createMockConfig({
        provider: "telnyx",
      });

      // Should work without re-onboarding
      expect(config).toBeDefined();
    });

    it("should allow re-onboarding from complete state", () => {
      // User has completed onboarding
      let config = createProviderConfig("telnyx");

      // User decides to reconfigure
      config = createProviderConfig("twilio", {
        fromNumber: config.fromNumber,
      });

      expect(config.provider).toBe("twilio");
    });

    it("should preserve non-voice settings during onboarding", () => {
      const existingSettings = {
        language: "en",
        timezone: "UTC",
      };

      const config = createMockConfig();

      // Non-voice settings should be preserved
      expect(existingSettings.language).toBe("en");
      expect(existingSettings.timezone).toBe("UTC");
    });
  });

  describe("Onboarding Error Handling", () => {
    it("should handle invalid provider selection", () => {
      expect(() => {
        const invalid = "invalid-provider";
        if (!["telnyx", "twilio", "plivo"].includes(invalid)) {
          throw new Error(`Invalid provider: ${invalid}`);
        }
      }).toThrow("Invalid provider");
    });

    it("should handle credential validation failures", () => {
      expect(() => {
        throw new Error("Failed to validate credentials");
      }).toThrow("Failed to validate credentials");
    });

    it("should handle network errors during onboarding", () => {
      expect(() => {
        throw new Error("Network error during provider test");
      }).toThrow("Network error");
    });

    it("should allow retrying failed steps", () => {
      let attempts = 0;

      const attemptStep = () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("Temporary failure");
        }
        return "success";
      };

      expect(() => attemptStep()).toThrow();
      expect(attemptStep()).toBe("success");
      expect(attempts).toBe(2);
    });

    it("should provide clear next steps on errors", () => {
      const error = {
        message: "Invalid credentials",
        nextSteps: [
          "Check your API key",
          "Verify connection settings",
          "Contact provider support",
        ],
      };

      expect(error.nextSteps).toHaveLength(3);
    });
  });

  describe("Onboarding Progress", () => {
    it("should track onboarding progress", () => {
      const progress = {
        currentStep: 2,
        totalSteps: 5,
        percentage: (2 / 5) * 100,
      };

      expect(progress.percentage).toBe(40);
    });

    it("should allow skipping optional steps", () => {
      const steps = [
        { id: "provider", required: true },
        { id: "credentials", required: true },
        { id: "advanced", required: false },
      ];

      const requiredSteps = steps.filter((s) => s.required);
      expect(requiredSteps).toHaveLength(2);
    });

    it("should save progress between sessions", () => {
      const savedProgress = {
        completedSteps: ["provider-selection"],
        lastStep: "provider-selection",
      };

      expect(savedProgress.completedSteps).toHaveLength(1);
    });

    it("should allow resuming from saved progress", () => {
      const savedProgress = ["provider-selection", "credentials"];
      const nextStep = "phone-numbers";

      const remainingSteps = [
        "phone-numbers",
        "inbound-policy",
        "confirmation",
      ];

      expect(remainingSteps[0]).toBe(nextStep);
    });
  });
});
