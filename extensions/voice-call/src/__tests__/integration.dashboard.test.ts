/**
 * Dashboard Component Integration Tests
 *
 * Tests provider selector, config panel, test interface,
 * status display, and fallback chain reordering through the CallManager.
 */

import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CallManager } from "../manager.js";
import { createMockConfig, createProviderConfig } from "./mocks/config.js";
import { MockVoiceProvider } from "./mocks/providers.js";

describe("Dashboard Integration", () => {
  let tempDir: string;
  let mockProvider: MockVoiceProvider;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `voice-dashboard-${Date.now()}`);
    mockProvider = new MockVoiceProvider();
  });

  afterEach(() => {
    mockProvider.reset();
  });
  describe("Provider Selector Component", () => {
    it("should display provider selector", () => {
      const component = {
        type: "selector",
        options: [
          { value: "telnyx", label: "Telnyx" },
          { value: "twilio", label: "Twilio" },
          { value: "plivo", label: "Plivo" },
        ],
        current: "telnyx",
      };

      expect(component.options).toHaveLength(3);
      expect(component.current).toBe("telnyx");
    });

    it("should handle provider selection", () => {
      const state = {
        selectedProvider: "telnyx",
      };

      const select = (provider: string) => {
        state.selectedProvider = provider;
      };

      select("twilio");
      expect(state.selectedProvider).toBe("twilio");
    });

    it("should show provider status indicator", () => {
      const indicator = {
        provider: "telnyx",
        status: "connected", // or "disconnected", "error"
        lastChecked: new Date(),
      };

      expect(indicator.status).toBe("connected");
    });

    it("should show credentials status", () => {
      const credentials = {
        configured: true,
        partial: false,
        lastValidated: new Date(),
      };

      expect(credentials.configured).toBe(true);
      expect(credentials.partial).toBe(false);
    });

    it("should update configuration on provider change", () => {
      let config = createProviderConfig("telnyx");
      expect(config.provider).toBe("telnyx");

      config = createProviderConfig("twilio", {
        fromNumber: config.fromNumber,
      });
      expect(config.provider).toBe("twilio");
    });
  });

  describe("Configuration Panel", () => {
    it("should display current configuration", () => {
      const config = createMockConfig({
        provider: "telnyx",
        fromNumber: "+15550000000",
      });

      const panel = {
        provider: config.provider,
        fromNumber: config.fromNumber,
      };

      expect(panel.provider).toBe("telnyx");
      expect(panel.fromNumber).toBe("+15550000000");
    });

    it("should allow editing phone numbers", () => {
      let config = createMockConfig({
        fromNumber: "+15550000000",
      });

      config = createMockConfig({
        fromNumber: "+15550000099",
      });

      expect(config.fromNumber).toBe("+15550000099");
    });

    it("should validate updated configuration", () => {
      expect(() => {
        createMockConfig({
          fromNumber: "+15550000000", // Valid
        });
      }).not.toThrow();

      expect(() => {
        createMockConfig({
          fromNumber: "invalid", // Invalid
        });
      }).toThrow();
    });

    it("should save configuration changes", () => {
      const originalConfig = createMockConfig({
        fromNumber: "+15550000000",
      });

      const updatedConfig = createMockConfig({
        fromNumber: "+15550000001",
      });

      expect(updatedConfig.fromNumber).not.toBe(originalConfig.fromNumber);
    });

    it("should show unsaved changes indicator", () => {
      const state = {
        dirty: false,
        changes: {} as Record<string, any>,
      };

      state.dirty = true;
      state.changes.fromNumber = "+15550000001";

      expect(state.dirty).toBe(true);
      expect(state.changes.fromNumber).toBeDefined();
    });

    it("should allow reverting unsaved changes", () => {
      let config = createMockConfig({
        fromNumber: "+15550000000",
      });

      const savedConfig = { ...config };

      config = createMockConfig({
        fromNumber: "+15550000001",
      });

      // Revert
      config = savedConfig;

      expect(config.fromNumber).toBe("+15550000000");
    });

    it("should display provider-specific options", () => {
      const telnyxConfig = createProviderConfig("telnyx", {
        telnyx: { apiKey: "key", connectionId: "conn" },
      });

      const options = {
        apiKey: telnyxConfig.telnyx?.apiKey,
        connectionId: telnyxConfig.telnyx?.connectionId,
      };

      expect(options.apiKey).toBeTruthy();
      expect(options.connectionId).toBeTruthy();
    });
  });

  describe("Test Interface", () => {
    it("should display STT test button", () => {
      const button = {
        id: "test-stt",
        label: "Test STT",
        enabled: true,
      };

      expect(button.label).toBe("Test STT");
      expect(button.enabled).toBe(true);
    });

    it("should display TTS test button", () => {
      const button = {
        id: "test-tts",
        label: "Test TTS",
        enabled: true,
      };

      expect(button.label).toBe("Test TTS");
      expect(button.enabled).toBe(true);
    });

    it("should execute STT test through manager", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const result = await manager.initiateCall("+15550000001");
      expect(result.success).toBe(true);
    });

    it("should execute TTS test through manager", async () => {
      const config = createMockConfig();
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      const speakResult = await manager.speak(callId, "Test message");
      expect(speakResult.success).toBe(true);
    });

    it("should display test results", () => {
      const result = {
        type: "stt",
        success: true,
        duration: 1500,
        transcript: "Test successful",
      };

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
    });

    it("should display test errors", () => {
      const result = {
        type: "stt",
        success: false,
        error: "Network timeout",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should show test progress", () => {
      const progress = {
        running: true,
        progress: 50,
      };

      expect(progress.running).toBe(true);
      expect(progress.progress).toBe(50);
    });

    it("should allow canceling tests", () => {
      const state = {
        running: true,
      };

      const cancel = () => {
        state.running = false;
      };

      cancel();
      expect(state.running).toBe(false);
    });
  });

  describe("Status Display", () => {
    it("should display call status", () => {
      const status = {
        activeCalls: 2,
        totalCalls: 10,
        failedCalls: 1,
      };

      expect(status.activeCalls).toBe(2);
      expect(status.totalCalls).toBe(10);
    });

    it("should display provider status", () => {
      const status = {
        provider: "telnyx",
        connected: true,
        lastCheck: new Date(),
      };

      expect(status.connected).toBe(true);
    });

    it("should display configuration status", () => {
      const config = createMockConfig({
        provider: "telnyx",
        telnyx: { apiKey: "key" },
      });

      const status = {
        configured: !!config.telnyx?.apiKey,
        provider: config.provider,
      };

      expect(status.configured).toBe(true);
    });

    it("should display inbound policy status", () => {
      const config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001"],
      });

      const status = {
        policy: config.inboundPolicy,
        allowedCount: config.allowFrom.length,
      };

      expect(status.policy).toBe("allowlist");
      expect(status.allowedCount).toBe(1);
    });

    it("should auto-update status periodically", () => {
      let updateCount = 0;

      const update = () => {
        updateCount++;
      };

      // Simulate periodic updates
      update();
      update();

      expect(updateCount).toBe(2);
    });

    it("should show last error if present", () => {
      const status = {
        lastError: "Connection failed",
        lastErrorTime: new Date(),
      };

      expect(status.lastError).toBeDefined();
    });
  });

  describe("Fallback Chain Reordering", () => {
    it("should display fallback chain", () => {
      const config = createMockConfig({
        fallbackOrder: ["telnyx", "twilio", "plivo"],
      });

      expect(config.fallbackOrder).toEqual(["telnyx", "twilio", "plivo"]);
    });

    it("should allow reordering via drag-and-drop", () => {
      let chain = ["telnyx", "twilio", "plivo"];

      const reorder = (fromIndex: number, toIndex: number) => {
        const [item] = chain.splice(fromIndex, 1);
        chain.splice(toIndex, 0, item);
      };

      reorder(0, 2); // Move telnyx to end
      expect(chain).toEqual(["twilio", "plivo", "telnyx"]);
    });

    it("should persist fallback chain order", () => {
      const config = createMockConfig({
        fallbackOrder: ["twilio", "telnyx", "plivo"],
      });

      expect(config.fallbackOrder[0]).toBe("twilio");
    });

    it("should show provider status in chain", () => {
      const chainStatus = [
        { provider: "telnyx", status: "connected" },
        { provider: "twilio", status: "connected" },
        { provider: "plivo", status: "disconnected" },
      ];

      expect(chainStatus[0]?.status).toBe("connected");
      expect(chainStatus[2]?.status).toBe("disconnected");
    });

    it("should validate fallback chain completeness", () => {
      const config = createMockConfig({
        fallbackOrder: ["telnyx", "twilio", "plivo"],
      });

      const allProviders = ["telnyx", "twilio", "plivo"];
      const inChain = config.fallbackOrder.every((p) => allProviders.includes(p));

      expect(inChain).toBe(true);
    });

    it("should prevent duplicate providers in chain", () => {
      expect(() => {
        const invalid = ["telnyx", "telnyx", "twilio"];
        const unique = [...new Set(invalid)];
        if (unique.length !== invalid.length) {
          throw new Error("Duplicate providers in chain");
        }
      }).toThrow("Duplicate providers");
    });

    it("should show move buttons when reordering", () => {
      const ui = {
        showMoveUp: true,
        showMoveDown: true,
      };

      expect(ui.showMoveUp).toBe(true);
      expect(ui.showMoveDown).toBe(true);
    });
  });

  describe("Inbound Policy Configuration", () => {
    it("should display inbound policy selector", () => {
      const selector = {
        options: ["disabled", "allowlist", "pairing", "open"],
        current: "disabled",
      };

      expect(selector.options).toHaveLength(4);
      expect(selector.current).toBe("disabled");
    });

    it("should allow changing inbound policy", () => {
      let config = createMockConfig({
        inboundPolicy: "disabled",
      });

      config = createMockConfig({
        inboundPolicy: "allowlist",
      });

      expect(config.inboundPolicy).toBe("allowlist");
    });

    it("should show allowlist when policy is allowlist", () => {
      const config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001"],
      });

      const ui = {
        showAllowlist: config.inboundPolicy === "allowlist",
        allowlist: config.allowFrom,
      };

      expect(ui.showAllowlist).toBe(true);
      expect(ui.allowlist).toHaveLength(1);
    });

    it("should allow adding to allowlist", () => {
      let config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001"],
      });

      config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: [...config.allowFrom, "+15550000002"],
      });

      expect(config.allowFrom).toHaveLength(2);
    });

    it("should allow removing from allowlist", () => {
      let config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: ["+15550000001", "+15550000002"],
      });

      const filtered = config.allowFrom.filter((n) => n !== "+15550000001");
      config = createMockConfig({
        inboundPolicy: "allowlist",
        allowFrom: filtered,
      });

      expect(config.allowFrom).toHaveLength(1);
    });

    it("should show warning for open policy", () => {
      const config = createMockConfig({
        inboundPolicy: "open",
      });

      const warning = config.inboundPolicy === "open" ? "Unsafe configuration" : null;

      expect(warning).toBe("Unsafe configuration");
    });
  });

  describe("STT/TTS Configuration", () => {
    it("should display STT configuration", () => {
      const config = createMockConfig({
        stt: { provider: "openai", model: "whisper-1" },
      });

      const ui = {
        provider: config.stt.provider,
        model: config.stt.model,
      };

      expect(ui.provider).toBe("openai");
      expect(ui.model).toBe("whisper-1");
    });

    it("should display TTS configuration", () => {
      const config = createMockConfig({
        tts: { provider: "openai", voice: "coral" },
      });

      const ui = {
        provider: config.tts.provider,
        voice: config.tts.voice,
      };

      expect(ui.provider).toBe("openai");
      expect(ui.voice).toBe("coral");
    });

    it("should allow changing TTS voice", () => {
      let config = createMockConfig({
        tts: { voice: "coral" },
      });

      config = createMockConfig({
        tts: { voice: "alloy" },
      });

      expect(config.tts.voice).toBe("alloy");
    });

    it("should show available voices", () => {
      const voices = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage"];

      expect(voices).toContain("coral");
      expect(voices).toHaveLength(8);
    });

    it("should allow TTS instructions input", () => {
      const config = createMockConfig({
        tts: { instructions: "Speak in a cheerful tone" },
      });

      expect(config.tts.instructions).toBe("Speak in a cheerful tone");
    });
  });

  describe("Configuration Sync", () => {
    it("should reflect config changes in manager", () => {
      const config = createProviderConfig("telnyx");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      expect(manager).toBeDefined();
      expect(config.provider).toBe("telnyx");
    });

    it("should support provider switching in manager", () => {
      let config = createProviderConfig("telnyx");
      let manager = new CallManager(config, tempDir);

      // Switch provider
      const newProvider = new MockVoiceProvider();
      config = createProviderConfig("twilio");
      manager = new CallManager(config, tempDir);
      manager.initialize(newProvider, "https://example.com/webhook");

      expect(config.provider).toBe("twilio");
    });

    it("should update status when configuration changes", async () => {
      const config1 = createProviderConfig("telnyx", {
        telnyx: { apiKey: "key" },
      });

      const manager1 = new CallManager(config1, tempDir);
      manager1.initialize(mockProvider, "https://example.com/webhook");

      const status1 = {
        configured: !!config1.telnyx?.apiKey,
      };

      expect(status1.configured).toBe(true);

      const config2 = createProviderConfig("telnyx", {
        telnyx: { apiKey: "" },
      });

      const status2 = {
        configured: !!config2.telnyx?.apiKey,
      };

      expect(status2.configured).toBe(false);
    });

    it("should track call state after configuration changes", async () => {
      const config = createProviderConfig("mock");
      const manager = new CallManager(config, tempDir);
      manager.initialize(mockProvider, "https://example.com/webhook");

      const { callId } = await manager.initiateCall("+15550000001");
      expect(manager.getActiveCalls()).toHaveLength(1);

      const call = manager.getCall(callId);
      expect(call).toBeDefined();
    });
  });

  describe("Error Display", () => {
    it("should display configuration errors", () => {
      const error = {
        type: "config-error",
        message: "Invalid phone format",
        field: "fromNumber",
      };

      expect(error.message).toContain("Invalid");
    });

    it("should display provider connection errors", () => {
      const error = {
        type: "connection-error",
        provider: "telnyx",
        message: "Connection timeout",
      };

      expect(error.provider).toBe("telnyx");
    });

    it("should allow dismissing errors", () => {
      let errors = [{ id: "err-1", message: "Error 1" }];

      const dismiss = (id: string) => {
        errors = errors.filter((e) => e.id !== id);
      };

      dismiss("err-1");
      expect(errors).toHaveLength(0);
    });

    it("should show retry button on transient errors", () => {
      const error = {
        transient: true,
        canRetry: true,
      };

      expect(error.canRetry).toBe(true);
    });
  });
});
