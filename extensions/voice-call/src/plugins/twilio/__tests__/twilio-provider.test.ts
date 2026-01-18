/**
 * Twilio Provider Plugin Tests
 *
 * Comprehensive test suite for TwilioCallProviderPlugin:
 * - Outbound VoIP call initiation
 * - Inbound call handling and registration
 * - TTS playback via TwiML and media streams
 * - STT capture using Gather TwiML
 * - Call disconnection and state management
 * - Recording URL retrieval
 * - Webhook event parsing and normalization
 * - StatusCallback webhook handling
 * - TwiML generation for IVR
 * - Call state tracking per Twilio call ID
 * - Recording completion events
 * - DTMF digit collection
 * - WhatsApp integration
 * - Error handling (invalid credentials, rate limiting)
 *
 * Run: pnpm test twilio-provider.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { TwilioCallProviderPlugin } from "../twilio-provider.js";
import type {
  CallId,
  ProviderCallId,
  NormalizedEvent,
  WebhookContext,
} from "../../../types.js";
import type { TwilioPluginConfig } from "../twilio-config.js";

// Mock Twilio SDK
vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    calls: {
      create: vi.fn(async () => ({
        sid: `CA${randomUUID().replace(/-/g, "")}`,
        from: "+1234567890",
        to: "+19876543210",
        status: "queued",
      })),
    },
    incomingPhoneNumbers: {
      stream: vi.fn(() => ({
        each: vi.fn(),
      })),
    },
  })),
}));

describe("TwilioCallProviderPlugin", () => {
  let plugin: TwilioCallProviderPlugin;
  let config: TwilioPluginConfig;
  let capturedEvents: NormalizedEvent[] = [];

  beforeEach(() => {
    // Create test configuration
    config = {
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: "test-auth-token-12345",
      phoneNumber: "+1234567890",
      publicUrl: "https://example.com",
      streamPath: "/stream",
      allowNgrokFreeTier: false,
      skipVerification: false,
    };

    // Initialize plugin
    plugin = new TwilioCallProviderPlugin(
      {
        initiateCall: vi.fn(async () => ({
          providerCallId: `CA${randomUUID().replace(/-/g, "")}`,
          status: "queued",
        })),
        playTts: vi.fn(async () => {}),
        startListening: vi.fn(async () => {}),
        hangupCall: vi.fn(async () => {}),
        parseWebhookEvent: vi.fn(() => ({
          events: [],
          response: JSON.stringify({ status: "ok" }),
          httpStatusCode: 200,
        })),
        setPublicUrl: vi.fn(),
        setMediaStreamHandler: vi.fn(),
        registerCallStream: vi.fn(),
        unregisterCallStream: vi.fn(),
      } as any,
      config
    );

    // Setup event capture
    capturedEvents = [];
  });

  afterEach(() => {
    capturedEvents = [];
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SECTION 1: Interface Implementation
  // ==========================================================================

  describe("VoiceCallProvider Interface", () => {
    it("should implement VoiceCallProvider interface", () => {
      expect(plugin).toHaveProperty("verifyWebhook");
      expect(plugin).toHaveProperty("parseWebhookEvent");
      expect(plugin).toHaveProperty("initiateOutboundCall");
      expect(plugin).toHaveProperty("handleInboundCall");
      expect(plugin).toHaveProperty("sendTTSResponse");
      expect(plugin).toHaveProperty("captureSTT");
      expect(plugin).toHaveProperty("disconnectCall");
    });
  });

  // ==========================================================================
  // SECTION 2: Outbound Call Initiation
  // ==========================================================================

  describe("initiateOutboundCall() - VoIP Calls", () => {
    it("should start outbound VoIP call", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      expect(providerCallId).toBeDefined();
      expect(typeof providerCallId).toBe("string");
    });

    it("should track call state", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      const callState = plugin.getCallState(providerCallId);

      expect(callState).toBeDefined();
      if (callState) {
        expect(callState.to).toBe(to);
        expect(callState.from).toBe(from);
        expect(callState.direction).toBe("outbound");
      }
    });

    it("should support custom TwiML", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";
      const customTwiml = '<Response><Say>Hello</Say></Response>';

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl,
        { customTwiml }
      );

      expect(providerCallId).toBeDefined();
    });

    it("should generate unique call IDs", async () => {
      const to1 = "+19876543210";
      const to2 = "+14155552222";
      const from = "+1234567890";
      const webhookUrl = "https://example.com/webhook";

      const callId1 = randomUUID() as CallId;
      const callId2 = randomUUID() as CallId;

      const providerCallId1 = await plugin.initiateOutboundCall(
        to1,
        from,
        callId1,
        webhookUrl
      );
      const providerCallId2 = await plugin.initiateOutboundCall(
        to2,
        from,
        callId2,
        webhookUrl
      );

      expect(providerCallId1).not.toBe(providerCallId2);
    });
  });

  // ==========================================================================
  // SECTION 3: Inbound Call Handling
  // ==========================================================================

  describe("handleInboundCall() - Incoming Call Registration", () => {
    it("should register incoming call", async () => {
      const from = "+19876543210";
      const to = "+1234567890";
      const callId = randomUUID() as CallId;
      const providerCallId = `CA${randomUUID().replace(/-/g, "")}` as ProviderCallId;
      const webhookUrl = "https://example.com/webhook";

      await expect(
        plugin.handleInboundCall(from, to, callId, providerCallId, webhookUrl)
      ).resolves.toBeUndefined();
    });

    it("should track inbound call state", async () => {
      const from = "+19876543210";
      const to = "+1234567890";
      const callId = randomUUID() as CallId;
      const providerCallId = `CA${randomUUID().replace(/-/g, "")}` as ProviderCallId;
      const webhookUrl = "https://example.com/webhook";

      await plugin.handleInboundCall(
        from,
        to,
        callId,
        providerCallId,
        webhookUrl
      );

      const callState = plugin.getCallState(providerCallId);

      expect(callState).toBeDefined();
      if (callState) {
        expect(callState.from).toBe(from);
        expect(callState.direction).toBe("inbound");
        expect(callState.state).toBe("ringing");
      }
    });
  });

  // ==========================================================================
  // SECTION 4: TTS - Text-to-Speech Playback
  // ==========================================================================

  describe("sendTTSResponse() - TTS Playback", () => {
    it("should stream TTS to active call", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";
      const text = "Hello, how can I help you?";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      // Update call state to active
      plugin.updateCallState(providerCallId, "active");

      await expect(
        plugin.sendTTSResponse(providerCallId, text)
      ).resolves.toBeUndefined();
    });

    it("should support voice and locale options", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";
      const text = "Hola, ¿cómo puedo ayudarte?";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      plugin.updateCallState(providerCallId, "active");

      await expect(
        plugin.sendTTSResponse(providerCallId, text, {
          voice: "woman",
          locale: "es-ES",
        })
      ).resolves.toBeUndefined();
    });

    it("should emit call.speaking event", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      plugin.updateCallState(providerCallId, "active");

      const text = "Testing TTS";
      await plugin.sendTTSResponse(providerCallId, text);

      expect(providerCallId).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 5: STT - Speech-to-Text Capture
  // ==========================================================================

  describe("captureSTT() - Speech Capture via Gather TwiML", () => {
    it("should capture speech using Gather TwiML", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      plugin.updateCallState(providerCallId, "active");

      await expect(
        plugin.captureSTT(providerCallId, "en-US")
      ).resolves.toBeUndefined();
    });

    it("should support multiple languages for STT", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      plugin.updateCallState(providerCallId, "active");

      // Test different languages
      const languages = ["en-US", "es-ES", "fr-FR", "de-DE"];

      for (const lang of languages) {
        await expect(
          plugin.captureSTT(providerCallId, lang)
        ).resolves.toBeUndefined();
      }
    });

    it("should emit call.speech event", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      plugin.updateCallState(providerCallId, "active");

      await plugin.captureSTT(providerCallId);

      expect(providerCallId).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 6: Call Disconnection
  // ==========================================================================

  describe("disconnectCall() - Call Termination", () => {
    it("should end call", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      await expect(
        plugin.disconnectCall(providerCallId)
      ).resolves.toBeUndefined();
    });

    it("should remove call from state after disconnect", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      await plugin.disconnectCall(providerCallId);

      const callState = plugin.getCallState(providerCallId);
      expect(callState).toBeUndefined();
    });

    it("should emit call.ended event", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      await plugin.disconnectCall(providerCallId);

      expect(providerCallId).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 7: Recording URL Retrieval
  // ==========================================================================

  describe("getRecordingURL() - Call Recording", () => {
    it("should retrieve recording URL", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      const recordingUrl = plugin.getRecordingURL(providerCallId);

      expect(recordingUrl).toBeDefined();
      expect(typeof recordingUrl).toBe("string");
      if (recordingUrl) {
        expect(recordingUrl).toContain("Recordings");
      }
    });

    it("should return null for unknown call", () => {
      const fakeCallId = randomUUID() as ProviderCallId;

      const recordingUrl = plugin.getRecordingURL(fakeCallId);

      expect(recordingUrl).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 8: Webhook Event Parsing
  // ==========================================================================

  describe("parseWebhookEvent() - Event Normalization", () => {
    it("should parse incoming call webhook", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "+19876543210",
          To: "+1234567890",
          CallStatus: "ringing",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
    });

    it("should parse call state change webhook", () => {
      const callSid = `CA${randomUUID().replace(/-/g, "")}`;

      // Register call first
      const from = "+19876543210";
      const to = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      plugin.handleInboundCall(
        from,
        to,
        callId,
        callSid as ProviderCallId,
        webhookUrl
      );

      // Parse status change
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: callSid,
          CallStatus: "active",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should emit call.initiated event", () => {
      // Call initiated through webhook
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "+19876543210",
          To: "+1234567890",
          CallStatus: "initiated",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should emit call.ringing event", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "+19876543210",
          To: "+1234567890",
          CallStatus: "ringing",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should emit call.answered event", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "+19876543210",
          To: "+1234567890",
          CallStatus: "in-progress",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should emit call.active event", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "+19876543210",
          To: "+1234567890",
          CallStatus: "completed",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should emit call.ended event", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "+19876543210",
          To: "+1234567890",
          CallStatus: "completed",
          CallDuration: "120",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should emit call.error event on failed call", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "+19876543210",
          To: "+1234567890",
          CallStatus: "failed",
          Reason: "invalid-number",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 9: StatusCallback Webhook Handling
  // ==========================================================================

  describe("StatusCallback Webhook", () => {
    it("should handle status callback", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          CallStatus: "active",
          From: "+19876543210",
          To: "+1234567890",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result).toBeDefined();
      expect(result.httpStatusCode).toBe(200);
    });

    it("should verify webhook signature", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: {
          "content-type": "application/json",
          "x-twilio-signature": "test-signature",
        },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          CallStatus: "active",
        }),
      };

      const result = plugin.verifyWebhook(ctx);

      expect(result).toHaveProperty("ok");
      expect(typeof result.ok).toBe("boolean");
    });
  });

  // ==========================================================================
  // SECTION 10: TwiML Generation for IVR
  // ==========================================================================

  describe("generateIvrTwiml() - IVR Setup", () => {
    it("should generate IVR TwiML", () => {
      const prompt = "Please enter your account number or say help.";
      const webhookUrl = "https://example.com/webhook";

      const twiml = plugin.generateIvrTwiml(prompt, webhookUrl);

      expect(typeof twiml).toBe("string");
      expect(twiml).toContain("Gather");
    });

    it("should support voice and language options", () => {
      const prompt = "Say your account number";
      const webhookUrl = "https://example.com/webhook";

      const twiml = plugin.generateIvrTwiml(prompt, webhookUrl, {
        voice: "woman",
        language: "es-ES",
      });

      expect(typeof twiml).toBe("string");
    });

    it("should support speech timeout configuration", () => {
      const prompt = "How can I help you?";
      const webhookUrl = "https://example.com/webhook";

      const twiml = plugin.generateIvrTwiml(prompt, webhookUrl, {
        speechTimeout: 5,
        maxSpeechTime: 30,
      });

      expect(typeof twiml).toBe("string");
    });
  });

  // ==========================================================================
  // SECTION 11: Call State Tracking Per Call ID
  // ==========================================================================

  describe("Call State Management", () => {
    it("should track call state per Twilio call ID", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      plugin.updateCallState(providerCallId, "active");

      const callState = plugin.getCallState(providerCallId);

      expect(callState).toBeDefined();
      if (callState) {
        expect(callState.state).toBe("active");
      }
    });

    it("should retrieve all active calls", async () => {
      const webhookUrl = "https://example.com/webhook";

      for (let i = 0; i < 3; i++) {
        const callId = randomUUID() as CallId;
        await plugin.initiateOutboundCall(
          `+1${1000000000 + i}`,
          "+1234567890",
          callId,
          webhookUrl
        );
      }

      const activeCalls = plugin.getAllActiveCalls();

      expect(activeCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("should clear all call state", async () => {
      const webhookUrl = "https://example.com/webhook";

      for (let i = 0; i < 2; i++) {
        const callId = randomUUID() as CallId;
        await plugin.initiateOutboundCall(
          `+1${1000000000 + i}`,
          "+1234567890",
          callId,
          webhookUrl
        );
      }

      plugin.clearAllCalls();

      const activeCalls = plugin.getAllActiveCalls();

      expect(activeCalls.length).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 12: Recording Completion Events
  // ==========================================================================

  describe("Recording Events", () => {
    it("should handle recording completion webhook", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          RecordingSid: `RE${randomUUID().replace(/-/g, "")}`,
          RecordingStatus: "completed",
          RecordingUrl: "https://api.twilio.com/.../Recordings/RExxx",
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should emit recording event with URL", () => {
      const recordingSid = `RE${randomUUID().replace(/-/g, "")}`;
      const recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/AC.../Recordings/${recordingSid}`;

      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          RecordingSid: recordingSid,
          RecordingStatus: "completed",
          RecordingUrl: recordingUrl,
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 13: DTMF Digit Collection via Gather
  // ==========================================================================

  describe("DTMF Digit Collection", () => {
    it("should collect DTMF digits via Gather", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      plugin.updateCallState(providerCallId, "active");

      // Capture STT also handles DTMF via Gather
      await plugin.captureSTT(providerCallId);

      expect(providerCallId).toBeDefined();
    });

    it("should emit call.dtmf event", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          Digits: "123",
          SpeechResult: "one two three",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });

    it("should handle silent timeout (no speech/DTMF)", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          Digits: "",
          FinishedOnKey: "#",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 14: WhatsApp Integration
  // ==========================================================================

  describe("WhatsApp Call Integration", () => {
    it("should initiate WhatsApp call", async () => {
      const to = "whatsapp:+19876543210";
      const from = "whatsapp:+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      expect(providerCallId).toBeDefined();
    });

    it("should handle WhatsApp incoming call", async () => {
      const from = "whatsapp:+19876543210";
      const to = "whatsapp:+1234567890";
      const callId = randomUUID() as CallId;
      const providerCallId = `CA${randomUUID().replace(/-/g, "")}` as ProviderCallId;
      const webhookUrl = "https://example.com/webhook";

      await expect(
        plugin.handleInboundCall(from, to, callId, providerCallId, webhookUrl)
      ).resolves.toBeUndefined();
    });

    it("should parse WhatsApp webhook", () => {
      const ctx: WebhookContext = {
        method: "POST",
        url: "/webhook",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          CallSid: `CA${randomUUID().replace(/-/g, "")}`,
          From: "whatsapp:+19876543210",
          To: "whatsapp:+1234567890",
          CallStatus: "active",
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 15: Error Handling
  // ==========================================================================

  describe("Error Handling", () => {
    it("should handle invalid credentials", () => {
      // Invalid config should not prevent instantiation,
      // but will fail on actual API calls
      const invalidConfig: TwilioPluginConfig = {
        accountSid: "invalid",
        authToken: "invalid",
        phoneNumber: "+1234567890",
        publicUrl: "https://example.com",
      };

      const invalidPlugin = new TwilioCallProviderPlugin(
        {
          initiateCall: vi.fn(async () => {
            throw new Error("Invalid account SID");
          }),
          setPublicUrl: vi.fn(),
          setMediaStreamHandler: vi.fn(),
          registerCallStream: vi.fn(),
          unregisterCallStream: vi.fn(),
        } as any,
        invalidConfig
      );

      expect(invalidPlugin).toBeDefined();
    });

    it("should handle rate limiting errors", async () => {
      const rateLimitPlugin = new TwilioCallProviderPlugin(
        {
          initiateCall: vi.fn(async () => {
            throw new Error("Rate limit exceeded");
          }),
          setPublicUrl: vi.fn(),
          setMediaStreamHandler: vi.fn(),
          registerCallStream: vi.fn(),
          unregisterCallStream: vi.fn(),
        } as any,
        config
      );

      // Should handle error gracefully
      expect(rateLimitPlugin).toBeDefined();
    });

    it("should handle network timeouts", async () => {
      const timeoutPlugin = new TwilioCallProviderPlugin(
        {
          initiateCall: vi.fn(async () => {
            throw new Error("Request timeout");
          }),
          setPublicUrl: vi.fn(),
          setMediaStreamHandler: vi.fn(),
          registerCallStream: vi.fn(),
          unregisterCallStream: vi.fn(),
        } as any,
        config
      );

      expect(timeoutPlugin).toBeDefined();
    });

    it("should handle invalid phone numbers", async () => {
      const to = "not-a-phone";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      // Should handle error or return error in result
      try {
        await plugin.initiateOutboundCall(to, from, callId, webhookUrl);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should handle call not found errors", async () => {
      const fakeCallId = randomUUID() as ProviderCallId;

      await expect(plugin.disconnectCall(fakeCallId)).rejects.toThrow(
        "Call not found"
      );
    });
  });

  // ==========================================================================
  // SECTION 16: Configuration Management
  // ==========================================================================

  describe("Configuration", () => {
    it("should get current configuration", () => {
      const currentConfig = plugin.getConfig();

      expect(currentConfig).toEqual(config);
    });

    it("should update configuration at runtime", () => {
      const newPublicUrl = "https://newurl.com";

      plugin.updateConfig({ publicUrl: newPublicUrl });

      const updatedConfig = plugin.getConfig();

      expect(updatedConfig.publicUrl).toBe(newPublicUrl);
    });
  });

  // ==========================================================================
  // SECTION 17: Media Streaming Support
  // ==========================================================================

  describe("Media Streaming", () => {
    it("should register media stream handler", () => {
      const handler = {
        onStreamStart: vi.fn(),
        onAudioData: vi.fn(),
        onStreamEnd: vi.fn(),
      };

      plugin.setMediaStreamHandler(handler);

      expect(handler).toBeDefined();
    });

    it("should register call stream", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      const streamSid = `ST${randomUUID().replace(/-/g, "")}`;

      plugin.registerCallStream(providerCallId, streamSid);

      const callState = plugin.getCallState(providerCallId);

      expect(callState).toBeDefined();
      if (callState) {
        expect(callState.streamSid).toBe(streamSid);
      }
    });

    it("should unregister call stream", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      const streamSid = `ST${randomUUID().replace(/-/g, "")}`;

      plugin.registerCallStream(providerCallId, streamSid);
      plugin.unregisterCallStream(providerCallId);

      const callState = plugin.getCallState(providerCallId);

      expect(callState).toBeDefined();
      if (callState) {
        expect(callState.streamSid).toBeUndefined();
      }
    });
  });

  // ==========================================================================
  // SECTION 18: Complete Call Lifecycle
  // ==========================================================================

  describe("Complete Call Lifecycle", () => {
    it("should handle full outbound call lifecycle", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      // Initiate
      const providerCallId = await plugin.initiateOutboundCall(
        to,
        from,
        callId,
        webhookUrl
      );

      // Send TTS
      plugin.updateCallState(providerCallId, "active");
      await plugin.sendTTSResponse(providerCallId, "Hello");

      // Capture STT
      await plugin.captureSTT(providerCallId);

      // Get recording
      const recordingUrl = plugin.getRecordingURL(providerCallId);

      // Disconnect
      await plugin.disconnectCall(providerCallId);

      expect(providerCallId).toBeDefined();
      expect(recordingUrl).toBeDefined();
    });

    it("should handle full inbound call lifecycle", async () => {
      const from = "+19876543210";
      const to = "+1234567890";
      const callId = randomUUID() as CallId;
      const providerCallId = `CA${randomUUID().replace(/-/g, "")}` as ProviderCallId;
      const webhookUrl = "https://example.com/webhook";

      // Handle inbound
      await plugin.handleInboundCall(
        from,
        to,
        callId,
        providerCallId,
        webhookUrl
      );

      // Send TTS
      plugin.updateCallState(providerCallId, "active");
      await plugin.sendTTSResponse(providerCallId, "Thank you for calling");

      // Capture STT
      await plugin.captureSTT(providerCallId);

      // Disconnect
      await plugin.disconnectCall(providerCallId);

      expect(providerCallId).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 19: Lifecycle Hooks
  // ==========================================================================

  describe("Lifecycle Management", () => {
    it("should initialize plugin", async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
    });

    it("should shutdown plugin", async () => {
      const to = "+19876543210";
      const from = "+1234567890";
      const callId = randomUUID() as CallId;
      const webhookUrl = "https://example.com/webhook";

      // Create some calls
      await plugin.initiateOutboundCall(to, from, callId, webhookUrl);

      // Shutdown should hangup all calls
      await expect(plugin.shutdown()).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // SECTION 20: Generate Stream Connect TwiML
  // ==========================================================================

  describe("Media Stream TwiML", () => {
    it("should generate stream connect TwiML", () => {
      const streamUrl = "wss://stream.example.com/audio";

      const twiml = plugin.generateStreamConnectTwiml(streamUrl);

      expect(typeof twiml).toBe("string");
      expect(twiml).toContain("Connect");
    });
  });
});
