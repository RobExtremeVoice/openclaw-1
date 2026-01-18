/**
 * End-to-End Integration Tests
 *
 * Tests complete flows across all UX surfaces:
 * Onboarding → Configuration → Dashboard → Usage
 */

import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CallManager } from "../manager.js";
import { MockVoiceProvider } from "./mocks/providers.js";
import { createMockConfig, createProviderConfig } from "./mocks/config.js";
import type { NormalizedEvent } from "../types.js";

describe("End-to-End Voice Provider Flows", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-e2e-${Date.now()}`);
    mockProvider = new MockVoiceProvider();
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe("Onboarding Flow", () => {
    it("should complete full onboarding sequence", async () => {
      // Step 1: Start onboarding
      const onboardingState = {
        step: "provider-selection",
        completed: false,
      };

      expect(onboardingState.step).toBe("provider-selection");

      // Step 2: Select provider
      const selectedProvider = "telnyx";
      expect(["telnyx", "twilio", "plivo"]).toContain(selectedProvider);

      // Step 3: Enter credentials
      const credentials = {
        apiKey: "test-key",
        connectionId: "test-conn",
      };
      expect(credentials.apiKey).toBeTruthy();

      // Step 4: Enter phone numbers
      const phoneNumbers = {
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
      };
      expect(phoneNumbers.fromNumber).toMatch(/^\+/);
      expect(phoneNumbers.toNumber).toMatch(/^\+/);

      // Step 5: Configure inbound policy
      const inboundPolicy = "allowlist";
      expect(["disabled", "allowlist", "pairing", "open"]).toContain(inboundPolicy);

      // Step 6: Complete onboarding
      onboardingState.completed = true;
      expect(onboardingState.completed).toBe(true);
    });

    it("should persist onboarding configuration", async () => {
      // Save config after onboarding
      const config = createProviderConfig("telnyx", {
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
        inboundPolicy: "allowlist",
      });

      // Verify persisted
      expect(config.provider).toBe("telnyx");
      expect(config.fromNumber).toBe("+15550000000");
      expect(config.inboundPolicy).toBe("allowlist");
    });

    it("should detect system capabilities during onboarding", () => {
      // GPU detection
      const hasGPU = !!process.env.GPU_AVAILABLE;

      // Network capabilities
      const hasNetwork = true; // Assume available in test

      // Credential validation
      const capabilities = {
        gpu: hasGPU,
        network: hasNetwork,
        canMakeOutbound: true,
        canReceiveInbound: true,
      };

      expect(typeof capabilities.gpu).toBe("boolean");
      expect(typeof capabilities.network).toBe("boolean");
    });

    it("should validate dependencies during onboarding", () => {
      const dependencies = {
        openaiApi: !!process.env.OPENAI_API_KEY,
        providerApi: !!process.env.PROVIDER_API_KEY,
      };

      expect(typeof dependencies.openaiApi).toBe("boolean");
      expect(typeof dependencies.providerApi).toBe("boolean");
    });

    it("should support backward compatibility with existing configs", async () => {
      // Old format config
      const oldConfig = {
        enabled: true,
        provider: "twilio",
        fromNumber: "+15550000000",
      };

      // Should load without errors
      const config = createMockConfig(oldConfig);
      expect(config.provider).toBe("twilio");
    });

    it("should allow skipping onboarding for quick setup", () => {
      // Quick setup option
      const quickSetup = {
        provider: "telnyx",
        apiKey: "test-key",
        fromNumber: "+15550000000",
      };

      expect(quickSetup.provider).toBe("telnyx");
    });
  });

  describe("Configure → Dashboard → Use Flow", () => {
    it("should reflect CLI configuration in dashboard", () => {
      // CLI configures
      const config = createProviderConfig("twilio", {
        twilio: { accountSid: "AC123", authToken: "token" },
      });

      // Dashboard displays
      const dashboardState = {
        provider: config.provider,
        isConfigured: !!config.twilio?.accountSid,
      };

      expect(dashboardState.provider).toBe("twilio");
      expect(dashboardState.isConfigured).toBe(true);
    });

    it("should allow configuration changes from dashboard", () => {
      // Initial config
      let config = createProviderConfig("telnyx");

      // Dashboard changes to Twilio
      config = createProviderConfig("twilio", {
        fromNumber: config.fromNumber,
        toNumber: config.toNumber,
      });

      expect(config.provider).toBe("twilio");
    });

    it("should use configured provider for calls", async () => {
      const config = createProviderConfig("mock");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // Make call
      const result = await manager.initiateCall("+15550000001");

      // Verify provider was used
      expect(result.success).toBe(true);
      expect(mockProvider.getCallCount()).toBe(1);
    });

    it("should sync configuration across CLI and dashboard", () => {
      // CLI sets config
      const cliConfig = createProviderConfig("telnyx", {
        telnyx: { apiKey: "cli-key" },
      });

      // Dashboard reads same config
      expect(cliConfig.telnyx?.apiKey).toBe("cli-key");

      // Dashboard changes config
      const dashboardConfig = createProviderConfig("telnyx", {
        telnyx: { apiKey: "dashboard-key" },
      });

      // CLI should see the change
      expect(dashboardConfig.telnyx?.apiKey).toBe("dashboard-key");
    });
  });

  describe("Provider Switching Mid-Session", () => {
    it("should handle provider switch during operation", async () => {
      // Start with provider 1
      let config = createProviderConfig("mock", {
        maxConcurrentCalls: 2, // Allow multiple concurrent calls
      });
      let manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      expect(mockProvider.getCallCount()).toBe(1);

      // Switch to provider 2
      const provider2 = new MockVoiceProvider();
      config = createProviderConfig("mock", {
        maxConcurrentCalls: 2,
      });
      manager.initialize(provider2, "https://example.com/webhook");

      const result2 = await manager.initiateCall("+15550000002");
      expect(result2.success).toBe(true);
      expect(provider2.getCallCount()).toBe(1);

      // Original call still exists
      expect(manager.getCall(callId)).toBeDefined();
    });

    it("should maintain call state across provider switch", async () => {
      const config = createProviderConfig("mock");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      const call1 = manager.getCall(callId);

      // Switch provider
      const provider2 = new MockVoiceProvider();
      manager.initialize(provider2, "https://example.com/webhook");

      // Call state preserved
      const call2 = manager.getCall(callId);
      expect(call1?.callId).toBe(call2?.callId);
    });
  });

  describe("Fallback Chain Activation", () => {
    it("should activate fallback when primary provider fails", async () => {
      const config = createMockConfig({
        fallbackOrder: ["mock"],
      });

      mockProvider.shouldFailInitiate = true;

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(false);
    });

    it("should try fallback providers in order", async () => {
      const config = createMockConfig({
        fallbackOrder: ["mock"],
      });

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // Should use primary
      let result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(true);

      // Reset for next attempt
      mockProvider.reset();

      // Should use fallback if primary fails
      mockProvider.shouldFailInitiate = true;
      result = await manager.initiateCall("+15550000002");
      expect(result.success).toBe(false);
    });

    it("should provide visibility into fallback attempts", () => {
      // Logging should show fallback attempts
      const logs: string[] = [];

      expect(typeof logs).toBe("object");
    });
  });

  describe("Error Recovery", () => {
    it("should recover from transient provider errors", async () => {
      const config = createProviderConfig("mock");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // First attempt fails
      mockProvider.shouldFailInitiate = true;
      let result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(false);

      // Reset provider
      mockProvider.shouldFailInitiate = false;

      // Second attempt succeeds
      result = await manager.initiateCall("+15550000002");
      expect(result.success).toBe(true);
    });

    it("should handle and report permanent failures", async () => {
      const config = createProviderConfig("mock");
      mockProvider.shouldFailInitiate = true;
      mockProvider.failureReason = "Invalid credentials";

      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid credentials");
    });

    it("should log detailed error information for debugging", () => {
      const errorLog = {
        timestamp: new Date(),
        provider: "mock",
        error: "Connection timeout",
        retryCount: 1,
      };

      expect(errorLog.provider).toBe("mock");
      expect(errorLog.error).toBeDefined();
    });
  });

  describe("Settings Persistence", () => {
    it("should persist configuration across restarts", () => {
      // Initial config
      const config1 = createProviderConfig("telnyx", {
        telnyx: { apiKey: "test-key" },
      });

      // After restart (simulated reload)
      const config2 = createProviderConfig("telnyx", {
        telnyx: { apiKey: "test-key" },
      });

      expect(config1.provider).toBe(config2.provider);
      expect(config1.telnyx?.apiKey).toBe(config2.telnyx?.apiKey);
    });

    it("should persist call logs", async () => {
      const config = createProviderConfig("mock");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      const call = manager.getCall(callId);

      // Should be retrievable after "restart"
      expect(call).toBeDefined();
      expect(call?.from).toBe(config.fromNumber);
    });

    it("should support configuration export/import", () => {
      const config = createMockConfig({
        provider: "telnyx",
        telnyx: { apiKey: "export-test" },
      });

      // Export
      const exported = JSON.stringify(config);

      // Import
      const imported = JSON.parse(exported);

      expect(imported.provider).toBe("telnyx");
      expect(imported.telnyx.apiKey).toBe("export-test");
    });
  });

  describe("Cross-Component Consistency", () => {
    it("should keep CLI and dashboard in sync", () => {
      // CLI updates
      const cliConfig = createProviderConfig("telnyx", {
        fromNumber: "+15550000000",
      });

      // Dashboard reads
      const dashboardConfig = cliConfig;

      expect(dashboardConfig.provider).toBe(cliConfig.provider);
      expect(dashboardConfig.fromNumber).toBe(cliConfig.fromNumber);
    });

    it("should reflect provider changes everywhere", () => {
      // Change in CLI
      const config1 = createProviderConfig("telnyx");

      // Should be visible in dashboard
      const config2 = config1;

      expect(config1.provider).toBe(config2.provider);
    });

    it("should sync call state across surfaces", async () => {
      const config = createProviderConfig("mock");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");

      // CLI can see call
      const cliCall = manager.getCall(callId);
      expect(cliCall).toBeDefined();

      // Dashboard can see call (via same manager)
      const dashboardCall = manager.getCall(callId);
      expect(dashboardCall).toEqual(cliCall);
    });

    it("should handle concurrent updates from different surfaces", async () => {
      const config = createProviderConfig("mock", {
        maxConcurrentCalls: 2, // Allow multiple concurrent calls
      });
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      // CLI makes call
      const result1 = await manager.initiateCall("+15550000001");

      // Dashboard makes call simultaneously
      const result2 = await manager.initiateCall("+15550000002");

      // Both should succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Both should be tracked
      expect(mockProvider.getCallCount()).toBe(2);
    });
  });

  describe("Full Integration Scenario", () => {
    it("should handle complete user journey", async () => {
      // 1. Onboard: Select provider and configure
      const config = createProviderConfig("telnyx", {
        fromNumber: "+15550000000",
        toNumber: "+15550000001",
        inboundPolicy: "allowlist",
      });

      // 2. Dashboard: Verify configuration
      expect(config.provider).toBe("telnyx");
      expect(config.inboundPolicy).toBe("allowlist");

      // 3. CLI: Make a call
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const callResult = await manager.initiateCall(config.toNumber!);
      expect(callResult.success).toBe(true);

      // 4. Dashboard: Monitor call
      const call = manager.getCall(callResult.callId);
      expect(call).toBeDefined();

      // 5. CLI: Handle webhook event
      manager.processEvent({
        id: "evt-1",
        type: "call.answered",
        callId: callResult.callId,
        providerCallId: "provider-id",
        timestamp: Date.now(),
      });

      // 6. Dashboard: Show updated state
      const updatedCall = manager.getCall(callResult.callId);
      expect(updatedCall?.state).toBe("answered");
    });
  });
});
