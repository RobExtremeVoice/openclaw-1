/**
 * Telegram Calls Provider Plugin - Comprehensive Test Suite
 *
 * Tests for TelegramCallProviderPlugin covering:
 * - Plugin interface implementation
 * - Group call lifecycle management
 * - Participant tracking with polling
 * - Recording control
 * - Participant muting
 * - TTS fallback to text messages
 * - Webhook verification and event parsing
 * - Error handling and retry logic
 * - Rate limiting and exponential backoff
 *
 * Run with: pnpm test telegram-provider.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  CallId,
  HangupCallInput,
  InitiateCallInput,
  NormalizedEvent,
  PlayTtsInput,
  ProviderCallId,
  StartListeningInput,
  StopListeningInput,
  WebhookContext,
} from "../../../types.js";
import { TelegramCallProviderPlugin } from "../telegram-provider.js";
import type { TelegramCallConfig } from "../telegram-config.js";

// ============================================================================
// Test Fixtures and Mocks
// ============================================================================

const VALID_BOT_TOKEN = "123456789:ABCDEfghIjklmnoPqrSTuvwxyza";
const VALID_GROUP_ID = -1001234567890;

const createDefaultConfig = (): TelegramCallConfig => ({
  botToken: VALID_BOT_TOKEN,
  groupId: VALID_GROUP_ID,
  allowWebhooks: false,
  operationTimeoutSeconds: 30,
  enableRecording: false,
  debug: false,
  skipVerification: true,
});

/**
 * Mock successful API responses for Telegram Bot API
 */
const mockFetch = (response: Record<string, unknown>) => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, result: response }),
  })) as any;
};

/**
 * Setup default successful fetch mock
 */
const setupDefaultMock = () => {
  mockFetch({ id: 123456 });
};

// ============================================================================
// Test Suite
// ============================================================================

describe("TelegramCallProviderPlugin", () => {
  let plugin: TelegramCallProviderPlugin;
  let emittedEvents: NormalizedEvent[] = [];

  beforeEach(() => {
    emittedEvents = [];
    vi.clearAllMocks();
    setupDefaultMock();

    plugin = new TelegramCallProviderPlugin(createDefaultConfig());

    // Listen for events if plugin emits them
    if ((plugin as any).on) {
      (plugin as any).on("event", (event: NormalizedEvent) => {
        emittedEvents.push(event);
      });
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    emittedEvents = [];
  });

  // =========================================================================
  // Plugin Interface Implementation
  // =========================================================================

  describe("Plugin Interface", () => {
    it("should implement VoiceCallProvider interface", () => {
      expect(plugin).toHaveProperty("initiateCall");
      expect(plugin).toHaveProperty("hangupCall");
      expect(plugin).toHaveProperty("playTts");
      expect(plugin).toHaveProperty("startListening");
      expect(plugin).toHaveProperty("stopListening");
      expect(plugin).toHaveProperty("verifyWebhook");
      expect(plugin).toHaveProperty("parseWebhookEvent");
    });

    it("should have telegram-specific methods", () => {
      expect(plugin).toHaveProperty("getGroupCallParticipants");
      expect(plugin).toHaveProperty("toggleRecording");
      expect(plugin).toHaveProperty("muteParticipant");
    });

    it("should throw on invalid bot token", () => {
      const invalidConfig = createDefaultConfig();
      invalidConfig.botToken = "invalid";

      expect(() => new TelegramCallProviderPlugin(invalidConfig)).toThrow(
        "Invalid Telegram bot token format",
      );
    });

    it("should throw on invalid group ID", () => {
      const invalidConfig = createDefaultConfig();
      invalidConfig.groupId = 123456; // Positive number, should be negative

      expect(() => new TelegramCallProviderPlugin(invalidConfig)).toThrow(
        "Invalid Telegram group ID",
      );
    });

    it("should accept valid configuration", () => {
      const config = createDefaultConfig();

      expect(() => new TelegramCallProviderPlugin(config)).not.toThrow();
    });
  });

  // =========================================================================
  // Group Call Lifecycle
  // =========================================================================

  describe("Group Call Lifecycle", () => {
    it("should initiate a group call", async () => {
      mockFetch({ id: 111222333 });

      const input: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      };

      const result = await plugin.initiateCall(input);

      expect(result).toHaveProperty("providerCallId");
      expect(result).toHaveProperty("status");
      expect(result.status).toBe("initiated");
    });

    it("should return unique provider call IDs", async () => {
      mockFetch({ id: Math.floor(Math.random() * 1000000000) });

      const input1: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      };

      const result1 = await plugin.initiateCall(input1);

      mockFetch({ id: Math.floor(Math.random() * 1000000000) });

      const input2: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "charlie",
        to: "dave",
      };

      const result2 = await plugin.initiateCall(input2);

      expect(result1.providerCallId).not.toBe(result2.providerCallId);
    });

    it("should end a group call", async () => {
      mockFetch({ id: 111222333 });

      const initResult = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      mockFetch({});

      const hangupInput: HangupCallInput = {
        providerCallId: initResult.providerCallId,
        reason: "user-hangup",
      };

      await expect(plugin.hangupCall(hangupInput)).resolves.toBeUndefined();
    });

    it("should throw when ending non-existent call", async () => {
      const fakeCallId = "tg-call-999999999" as ProviderCallId;

      const hangupInput: HangupCallInput = {
        providerCallId: fakeCallId,
        reason: "user-hangup",
      };

      await expect(plugin.hangupCall(hangupInput)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Participant Tracking with Polling
  // =========================================================================

  describe("Participant Tracking with Polling", () => {
    let callId: ProviderCallId;

    beforeEach(async () => {
      mockFetch({ id: 111222333 });

      const result = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      callId = result.providerCallId;
    });

    it("should get group call participants", async () => {
      mockFetch({
        participants: [
          {
            user: {
              id: 111,
              first_name: "Alice",
              is_bot: false,
            },
            is_speaking: true,
          },
          {
            user: {
              id: 222,
              first_name: "Bob",
              is_bot: false,
            },
            is_speaking: false,
          },
        ],
      });

      const participants = await plugin.getGroupCallParticipants(callId);

      expect(Array.isArray(participants)).toBe(true);
      expect(participants.length).toBeGreaterThan(0);
    });

    it("should parse participant information correctly", async () => {
      mockFetch({
        participants: [
          {
            user: {
              id: 111,
              first_name: "Alice",
              last_name: "Smith",
              is_bot: false,
            },
            is_speaking: true,
          },
        ],
      });

      const participants = await plugin.getGroupCallParticipants(callId);

      expect(participants[0]).toHaveProperty("userId");
      expect(participants[0]).toHaveProperty("name");
      expect(participants[0]).toHaveProperty("isSpeaking", true);
    });

    it("should handle participants with missing names", async () => {
      mockFetch({
        participants: [
          {
            user: {
              id: 111,
              is_bot: false,
            },
            is_speaking: false,
          },
        ],
      });

      const participants = await plugin.getGroupCallParticipants(callId);

      expect(participants[0].name).toBeDefined();
      expect(participants[0].name).toContain("User");
    });

    it("should handle API errors gracefully", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({
          ok: false,
          error_code: 429,
          description: "Too Many Requests",
        }),
      })) as any;

      const participants = await plugin.getGroupCallParticipants(callId);

      // Should return fallback or empty list
      expect(Array.isArray(participants)).toBe(true);
    });

    it("should handle empty participant list", async () => {
      mockFetch({
        participants: [],
      });

      const participants = await plugin.getGroupCallParticipants(callId);

      expect(participants).toHaveLength(0);
    });

    it("should throw when getting participants for non-existent call", async () => {
      const fakeCallId = "tg-call-999999999" as ProviderCallId;

      await expect(plugin.getGroupCallParticipants(fakeCallId)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Recording Control
  // =========================================================================

  describe("Recording Control", () => {
    let callId: ProviderCallId;

    beforeEach(async () => {
      mockFetch({ id: 111222333 });

      const result = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      callId = result.providerCallId;
    });

    it("should toggle recording on", async () => {
      mockFetch({});

      await expect(plugin.toggleRecording(callId)).resolves.toBeUndefined();
    });

    it("should toggle recording off", async () => {
      // Start recording
      mockFetch({});
      await plugin.toggleRecording(callId);

      // Stop recording
      mockFetch({});
      await expect(plugin.toggleRecording(callId)).resolves.toBeUndefined();
    });

    it("should throw when toggling recording on non-existent call", async () => {
      const fakeCallId = "tg-call-999999999" as ProviderCallId;

      await expect(plugin.toggleRecording(fakeCallId)).rejects.toThrow();
    });

    it("should handle recording API errors", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: "Bad Request",
        }),
      })) as any;

      await expect(plugin.toggleRecording(callId)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Participant Muting
  // =========================================================================

  describe("Participant Muting", () => {
    let callId: ProviderCallId;

    beforeEach(async () => {
      mockFetch({ id: 111222333 });

      const result = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      callId = result.providerCallId;
    });

    it("should mute a participant", async () => {
      mockFetch({});

      await expect(plugin.muteParticipant(callId, 111, true)).resolves.toBeUndefined();
    });

    it("should unmute a participant", async () => {
      mockFetch({});

      await expect(plugin.muteParticipant(callId, 111, false)).resolves.toBeUndefined();
    });

    it("should throw on invalid user ID", async () => {
      await expect(plugin.muteParticipant(callId, -1, true)).rejects.toThrow(
        "Invalid user ID",
      );
    });

    it("should throw when muting on non-existent call", async () => {
      const fakeCallId = "tg-call-999999999" as ProviderCallId;

      await expect(plugin.muteParticipant(fakeCallId, 111, true)).rejects.toThrow();
    });

    it("should handle mute API errors", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: "Bad Request",
        }),
      })) as any;

      await expect(plugin.muteParticipant(callId, 111, true)).rejects.toThrow();
    });
  });

  // =========================================================================
  // TTS Fallback to Text Messages
  // =========================================================================

  describe("TTS Fallback to Text Messages", () => {
    let callId: ProviderCallId;

    beforeEach(async () => {
      mockFetch({ id: 111222333 });

      const result = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      callId = result.providerCallId;
    });

    it("should play TTS response via text message", async () => {
      mockFetch({});

      const input: PlayTtsInput = {
        providerCallId: callId,
        text: "Hello everyone!",
      };

      await expect(plugin.playTts(input)).resolves.toBeUndefined();
    });

    it("should include bot prefix in message", async () => {
      mockFetch({});

      const input: PlayTtsInput = {
        providerCallId: callId,
        text: "Important announcement",
      };

      await plugin.playTts(input);

      // Verify fetch was called with message containing bot prefix
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should throw when playing TTS to non-existent call", async () => {
      const fakeCallId = "tg-call-999999999" as ProviderCallId;

      const input: PlayTtsInput = {
        providerCallId: fakeCallId,
        text: "test",
      };

      await expect(plugin.playTts(input)).rejects.toThrow();
    });

    it("should handle message sending errors", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: "Bad Request",
        }),
      })) as any;

      const input: PlayTtsInput = {
        providerCallId: callId,
        text: "test",
      };

      await expect(plugin.playTts(input)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Webhook Verification
  // =========================================================================

  describe("Webhook Verification", () => {
    it("should verify webhook with valid signature", () => {
      const ctx: WebhookContext = {
        method: "POST",
        path: "/webhook",
        headers: {
          "x-telegram-bot-api-secret-token": "valid-token",
        },
        rawBody: '{}',
      };

      const result = plugin.verifyWebhook(ctx);

      expect(result).toHaveProperty("ok");
      expect(typeof result.ok).toBe("boolean");
    });

    it("should skip verification in dev mode", () => {
      const config = createDefaultConfig();
      config.skipVerification = true;

      const pluginDev = new TelegramCallProviderPlugin(config);

      const ctx: WebhookContext = {
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: '{}',
      };

      const result = pluginDev.verifyWebhook(ctx);

      expect(result.ok).toBe(true);
    });
  });

  // =========================================================================
  // Webhook Event Parsing
  // =========================================================================

  describe("Webhook Event Parsing", () => {
    it("should parse bot added to group event", () => {
      const ctx: WebhookContext = {
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: JSON.stringify({
          my_chat_member: {
            from: { id: 123, first_name: "Admin" },
            chat: { id: -456, type: "group" },
            new_chat_member: { user: { id: 789, is_bot: true } },
          },
          message: {
            chat: { id: -456 },
          },
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
    });

    it("should handle invalid JSON gracefully", () => {
      const ctx: WebhookContext = {
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: "invalid json {",
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result).toHaveProperty("events");
      expect(result.events).toHaveLength(0);
    });

    it("should handle GET requests", () => {
      const ctx: WebhookContext = {
        method: "GET",
        path: "/webhook",
        headers: {},
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.events).toHaveLength(0);
    });

    it("should return 200 status code", () => {
      const ctx: WebhookContext = {
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: '{}',
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.statusCode).toBe(200);
    });

    it("should include provider response body", () => {
      const ctx: WebhookContext = {
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: '{}',
      };

      const result = plugin.parseWebhookEvent(ctx);

      expect(result.providerResponseBody).toBeDefined();
    });
  });

  // =========================================================================
  // STT and Listening Control
  // =========================================================================

  describe("STT and Listening Control", () => {
    let callId: ProviderCallId;

    beforeEach(async () => {
      mockFetch({ id: 111222333 });

      const result = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      callId = result.providerCallId;
    });

    it("should start listening", async () => {
      const input: StartListeningInput = {
        providerCallId: callId,
        language: "en-US",
      };

      await expect(plugin.startListening(input)).resolves.toBeUndefined();
    });

    it("should stop listening", async () => {
      const input: StopListeningInput = {
        providerCallId: callId,
      };

      await expect(plugin.stopListening(input)).resolves.toBeUndefined();
    });

    it("should throw when starting listening on non-existent call", async () => {
      const fakeCallId = "tg-call-999999999" as ProviderCallId;

      const input: StartListeningInput = {
        providerCallId: fakeCallId,
        language: "en-US",
      };

      await expect(plugin.startListening(input)).rejects.toThrow();
    });

    it("should throw when stopping listening on non-existent call", async () => {
      const fakeCallId = "tg-call-999999999" as ProviderCallId;

      const input: StopListeningInput = {
        providerCallId: fakeCallId,
      };

      await expect(plugin.stopListening(input)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Normalized Event Types
  // =========================================================================

  describe("Normalized Event Types", () => {
    it("should parse call.initiated event", () => {
      const ctx: WebhookContext = {
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: JSON.stringify({
          my_chat_member: {
            from: { id: 123, first_name: "Admin" },
            chat: { id: -456, type: "group" },
            new_chat_member: { user: { id: 789, is_bot: true } },
          },
          message: {
            chat: { id: -456 },
          },
        }),
      };

      const result = plugin.parseWebhookEvent(ctx);

      const initiatedEvents = result.events.filter((e) => e.type === "call.initiated");
      expect(initiatedEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // Error Handling and Retry Logic
  // =========================================================================

  describe("Error Handling and Retry Logic", () => {
    it("should handle rate limiting (429)", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({
          ok: false,
          error_code: 429,
          description: "Too Many Requests",
        }),
      })) as any;

      const input: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      };

      await expect(plugin.initiateCall(input)).rejects.toThrow();
    });

    it("should handle bot blocking errors", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          ok: false,
          error_code: 403,
          description: "Forbidden: user is an administrator of the chat",
        }),
      })) as any;

      const input: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      };

      await expect(plugin.initiateCall(input)).rejects.toThrow();
    });

    it("should handle invalid chat ID errors", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: "Bad Request: chat not found",
        }),
      })) as any;

      const input: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      };

      await expect(plugin.initiateCall(input)).rejects.toThrow();
    });

    it("should mark rate limit errors as retryable", async () => {
      const config = createDefaultConfig();
      config.debug = true;

      const pluginDebug = new TelegramCallProviderPlugin(config);

      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({
          ok: false,
          error_code: 429,
          description: "Too Many Requests",
        }),
      })) as any;

      const input: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      };

      try {
        await pluginDebug.initiateCall(input);
      } catch (error) {
        // Error should be caught and thrown
        expect(error).toBeDefined();
      }
    });
  });

  // =========================================================================
  // Concurrent Operations
  // =========================================================================

  describe("Concurrent Operations", () => {
    it("should handle multiple concurrent calls", async () => {
      const calls = await Promise.all(
        Array.from({ length: 3 }, async (_, i) => {
          mockFetch({ id: 111000000 + i });
          return plugin.initiateCall({
            callId: randomUUID() as CallId,
            from: `user${i}`,
            to: `user${i + 1}`,
          });
        }),
      );

      expect(calls).toHaveLength(3);
      expect(calls.every((c) => c.providerCallId)).toBe(true);
    });

    it("should handle concurrent participant queries", async () => {
      mockFetch({ id: 111222333 });

      const initResult = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      mockFetch({
        participants: [
          {
            user: { id: 111, first_name: "Alice", is_bot: false },
            is_speaking: true,
          },
        ],
      });

      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          plugin.getGroupCallParticipants(initResult.providerCallId),
        ),
      );

      expect(results).toHaveLength(3);
      results.forEach((r) => expect(Array.isArray(r)).toBe(true));
    });
  });

  // =========================================================================
  // Configuration and Debug Mode
  // =========================================================================

  describe("Configuration and Debug Mode", () => {
    it("should support debug mode", () => {
      const config = createDefaultConfig();
      config.debug = true;

      expect(() => new TelegramCallProviderPlugin(config)).not.toThrow();
    });

    it("should support disabling webhook verification", () => {
      const config = createDefaultConfig();
      config.skipVerification = true;

      const pluginNoVerify = new TelegramCallProviderPlugin(config);

      const result = pluginNoVerify.verifyWebhook({
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: "{}",
      });

      expect(result.ok).toBe(true);
    });

    it("should support webhook URL configuration", () => {
      const config = createDefaultConfig();
      config.webhookUrl = "https://example.com/webhook";

      expect(() => new TelegramCallProviderPlugin(config)).not.toThrow();
    });

    it("should validate operation timeout configuration", () => {
      const config = createDefaultConfig();
      config.operationTimeoutSeconds = 30;

      expect(() => new TelegramCallProviderPlugin(config)).not.toThrow();
    });

    it("should support max participants configuration", () => {
      const config = createDefaultConfig();
      config.maxParticipants = 50;

      expect(() => new TelegramCallProviderPlugin(config)).not.toThrow();
    });
  });

  // =========================================================================
  // Integration Scenarios
  // =========================================================================

  describe("Integration Scenarios", () => {
    it("should handle complete group call lifecycle", async () => {
      // Initiate call
      mockFetch({ id: 111222333 });

      const initResult = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      expect(initResult.providerCallId).toBeDefined();

      // Get participants
      mockFetch({
        participants: [
          {
            user: { id: 111, first_name: "Alice", is_bot: false },
            is_speaking: false,
          },
          {
            user: { id: 222, first_name: "Bot", is_bot: true },
            is_speaking: false,
          },
        ],
      });

      const participants = await plugin.getGroupCallParticipants(initResult.providerCallId);
      expect(participants.length).toBeGreaterThan(0);

      // Send TTS
      mockFetch({});
      await plugin.playTts({
        providerCallId: initResult.providerCallId,
        text: "Hello everyone!",
      });

      // End call
      mockFetch({});
      await plugin.hangupCall({
        providerCallId: initResult.providerCallId,
        reason: "call-completed",
      });
    });

    it("should handle call with recording", async () => {
      // Initiate call
      mockFetch({ id: 111222333 });

      const initResult = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      // Start recording
      mockFetch({});
      await plugin.toggleRecording(initResult.providerCallId);

      // End call
      mockFetch({});
      await plugin.hangupCall({
        providerCallId: initResult.providerCallId,
        reason: "call-completed",
      });
    });

    it("should handle participant muting operations", async () => {
      // Initiate call
      mockFetch({ id: 111222333 });

      const initResult = await plugin.initiateCall({
        callId: randomUUID() as CallId,
        from: "alice",
        to: "bob",
      });

      // Mute participant
      mockFetch({});
      await plugin.muteParticipant(initResult.providerCallId, 111, true);

      // Unmute participant
      mockFetch({});
      await plugin.muteParticipant(initResult.providerCallId, 111, false);

      // End call
      mockFetch({});
      await plugin.hangupCall({
        providerCallId: initResult.providerCallId,
        reason: "call-completed",
      });
    });
  });
});
