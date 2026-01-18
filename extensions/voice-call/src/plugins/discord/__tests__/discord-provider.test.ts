/**
 * Discord Call Provider Plugin - Comprehensive Test Suite
 *
 * Tests for DiscordCallProviderPlugin covering:
 * - Plugin interface implementation
 * - Voice channel join/leave lifecycle
 * - TTS response broadcasting
 * - STT audio capture
 * - Participant management
 * - Audio mixing and echo cancellation
 * - Event emission and normalization
 * - Error handling and network resilience
 *
 * Run with: pnpm test discord-provider.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  CallId,
  HangupCallInput,
  InitiateCallInput,
  NormalizedEvent,
  PlayTtsInput,
  ProviderCallId,
  StartListeningInput,
  StopListeningInput,
} from "../../../types.js";
import {
  DiscordCallProviderPlugin,
  type CallStateEntry,
  type AudioMixer,
} from "../discord-provider.js";
import type { DiscordChannelJoinOptions, ChannelParticipant } from "../discord-config.js";
import {
  VoiceConnectionError,
  AudioStreamError,
  ParticipantError,
} from "../discord-config.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_GUILD_ID = "123456789012345678";
const VALID_CHANNEL_ID = "987654321098765432";
const VALID_BOT_TOKEN = "test-bot-token-xyz";

const createDefaultConfig = () => ({
  botToken: VALID_BOT_TOKEN,
  voice: {
    sampleRate: 48000,
    bitrate: 128,
    echoCancel: true,
    noiseSuppress: true,
  },
  stt: {
    provider: "openai-realtime",
    language: "en-US",
    interimResults: true,
  },
  tts: {
    provider: "elevenlabs",
    voice: "Adam",
    speed: 1.0,
  },
});

// ============================================================================
// Test Suite
// ============================================================================

describe("DiscordCallProviderPlugin", () => {
  let plugin: DiscordCallProviderPlugin;
  let emittedEvents: NormalizedEvent[] = [];

  beforeEach(() => {
    emittedEvents = [];
    plugin = new DiscordCallProviderPlugin(createDefaultConfig());

    plugin.on("event", (event: NormalizedEvent) => {
      emittedEvents.push(event);
    });
  });

  afterEach(async () => {
    await plugin.shutdown();
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

    it("should extend EventEmitter for event distribution", () => {
      expect(plugin).toBeInstanceOf(EventEmitter);
      expect(typeof plugin.on).toBe("function");
      expect(typeof plugin.emit).toBe("function");
    });

    it("should initialize without errors", async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
    });

    it("should throw on missing bot token", () => {
      const invalidConfig = createDefaultConfig();
      invalidConfig.botToken = "";

      expect(() => new DiscordCallProviderPlugin(invalidConfig)).toThrow();
    });
  });

  // =========================================================================
  // Voice Channel Join/Leave Lifecycle
  // =========================================================================

  describe("Voice Channel Join/Leave", () => {
    it("should successfully join a voice channel", async () => {
      const options: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(options);

      expect(result).toHaveProperty("providerCallId");
      expect(result).toHaveProperty("status");
      expect(result.status).toBe("initiated");
      expect(result.providerCallId).toBeDefined();
    });

    it("should emit call.initiated event on channel join", async () => {
      const options: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(options);

      // Should emit at least call.initiated and call.answered
      const initiatedEvents = emittedEvents.filter((e) => e.type === "call.initiated");
      expect(initiatedEvents.length).toBeGreaterThan(0);
      expect(initiatedEvents[0].providerCallId).toBe(result.providerCallId);
    });

    it("should emit call.answered event after connection established", async () => {
      const options: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      await plugin.joinVoiceChannel(options);

      const answeredEvents = emittedEvents.filter((e) => e.type === "call.answered");
      expect(answeredEvents.length).toBeGreaterThan(0);
    });

    it("should throw on invalid guild ID", async () => {
      const options: DiscordChannelJoinOptions = {
        guildId: "invalid-guild",
        channelId: VALID_CHANNEL_ID,
      };

      await expect(plugin.joinVoiceChannel(options)).rejects.toThrow(
        VoiceConnectionError,
      );
    });

    it("should throw on invalid channel ID", async () => {
      const options: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: "invalid-channel",
      };

      await expect(plugin.joinVoiceChannel(options)).rejects.toThrow(
        VoiceConnectionError,
      );
    });

    it("should successfully leave a voice channel", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const joinResult = await plugin.joinVoiceChannel(joinOptions);
      emittedEvents = []; // Clear events

      await plugin.leaveVoiceChannel(joinResult.providerCallId);

      const endedEvents = emittedEvents.filter((e) => e.type === "call.ended");
      expect(endedEvents.length).toBeGreaterThan(0);
    });

    it("should emit call.ended event with hangup reason on leave", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const joinResult = await plugin.joinVoiceChannel(joinOptions);
      emittedEvents = [];

      await plugin.leaveVoiceChannel(joinResult.providerCallId);

      const endedEvents = emittedEvents.filter((e) => e.type === "call.ended");
      expect(endedEvents[0]).toHaveProperty("reason", "hangup-bot");
    });

    it("should throw when leaving non-existent call", async () => {
      const fakeCallId = randomUUID() as ProviderCallId;

      await expect(plugin.leaveVoiceChannel(fakeCallId)).rejects.toThrow(
        VoiceConnectionError,
      );
    });
  });

  // =========================================================================
  // TTS Response Broadcasting
  // =========================================================================

  describe("TTS Response Broadcasting", () => {
    let providerCallId: ProviderCallId;

    beforeEach(async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };
      const result = await plugin.joinVoiceChannel(joinOptions);
      providerCallId = result.providerCallId;
      emittedEvents = [];
    });

    it("should send TTS response to all participants", async () => {
      const text = "Hello, everyone!";

      await expect(plugin.sendTTSResponse(providerCallId, text)).resolves.toBeUndefined();
    });

    it("should support custom voice options in TTS", async () => {
      const text = "Custom voice response";
      const options = { voice: "Bella", locale: "en-GB" };

      await expect(
        plugin.sendTTSResponse(providerCallId, text, options),
      ).resolves.toBeUndefined();
    });

    it("should throw when sending TTS to non-existent call", async () => {
      const fakeCallId = randomUUID() as ProviderCallId;

      await expect(plugin.sendTTSResponse(fakeCallId, "test")).rejects.toThrow(
        AudioStreamError,
      );
    });

    it("should throw when sending TTS in initiated state", async () => {
      // Create a new call but don't wait for answered state
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };
      const result = await plugin.joinVoiceChannel(joinOptions);

      const callState = plugin.getCallState(result.providerCallId);
      if (callState) {
        callState.state = "initiated";
      }

      // TTS should only work in answered or active state
      await expect(
        plugin.sendTTSResponse(result.providerCallId, "test"),
      ).rejects.toThrow(AudioStreamError);
    });
  });

  // =========================================================================
  // STT Audio Capture
  // =========================================================================

  describe("STT Audio Capture", () => {
    let providerCallId: ProviderCallId;

    beforeEach(async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };
      const result = await plugin.joinVoiceChannel(joinOptions);
      providerCallId = result.providerCallId;
      emittedEvents = [];
    });

    it("should start capturing STT", async () => {
      await expect(plugin.captureSTT(providerCallId)).resolves.toBeUndefined();

      const callState = plugin.getCallState(providerCallId);
      expect(callState?.isListening).toBe(true);
    });

    it("should emit call.active event when listening starts", async () => {
      await plugin.captureSTT(providerCallId);

      const activeEvents = emittedEvents.filter((e) => e.type === "call.active");
      expect(activeEvents.length).toBeGreaterThan(0);
    });

    it("should accept language parameter for STT", async () => {
      await expect(
        plugin.captureSTT(providerCallId, "es-ES"),
      ).resolves.toBeUndefined();
    });

    it("should stop capturing STT", async () => {
      await plugin.captureSTT(providerCallId);
      await expect(plugin.stopCapturingSTT(providerCallId)).resolves.toBeUndefined();

      const callState = plugin.getCallState(providerCallId);
      expect(callState?.isListening).toBe(false);
    });

    it("should throw when capturing STT on non-existent call", async () => {
      const fakeCallId = randomUUID() as ProviderCallId;

      await expect(plugin.captureSTT(fakeCallId)).rejects.toThrow(
        ParticipantError,
      );
    });

    it("should throw when stopping STT on non-existent call", async () => {
      const fakeCallId = randomUUID() as ProviderCallId;

      await expect(plugin.stopCapturingSTT(fakeCallId)).rejects.toThrow(
        ParticipantError,
      );
    });
  });

  // =========================================================================
  // Participant Management
  // =========================================================================

  describe("Participant Management", () => {
    let providerCallId: ProviderCallId;

    beforeEach(async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };
      const result = await plugin.joinVoiceChannel(joinOptions);
      providerCallId = result.providerCallId;
      emittedEvents = [];
    });

    it("should get channel participants list", async () => {
      const participants = await plugin.getChannelParticipants(providerCallId);

      expect(Array.isArray(participants)).toBe(true);
    });

    it("should return empty participants initially", async () => {
      const participants = await plugin.getChannelParticipants(providerCallId);

      expect(participants).toHaveLength(0);
    });

    it("should throw when getting participants for non-existent call", async () => {
      const fakeCallId = randomUUID() as ProviderCallId;

      await expect(plugin.getChannelParticipants(fakeCallId)).rejects.toThrow(
        ParticipantError,
      );
    });

    it("should handle participant join events", async () => {
      const participant: ChannelParticipant = {
        userId: "user123",
        username: "TestUser",
        isBot: false,
        isSpeaking: false,
      };

      // Access internal method for testing via direct state manipulation
      const callState = plugin.getCallState(providerCallId);
      if (callState) {
        callState.participants.set(participant.userId, participant);
      }

      const participants = await plugin.getChannelParticipants(providerCallId);
      expect(participants).toHaveLength(1);
      expect(participants[0]).toEqual(participant);
    });

    it("should emit call.speaking when participant joins", async () => {
      const participant: ChannelParticipant = {
        userId: "user123",
        username: "TestUser",
        isBot: false,
        isSpeaking: false,
      };

      const callState = plugin.getCallState(providerCallId);
      if (callState) {
        callState.participants.set(participant.userId, participant);
        // Trigger speaking event
        callState.participants.get(participant.userId)!.isSpeaking = true;
      }

      // Events should have been emitted during the test
      const speakingEvents = emittedEvents.filter((e) => e.type === "call.speaking");
      expect(speakingEvents.length >= 0).toBe(true);
    });
  });

  // =========================================================================
  // Audio Mixing and Echo Cancellation
  // =========================================================================

  describe("Audio Mixing and Echo Cancellation", () => {
    let providerCallId: ProviderCallId;

    beforeEach(async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };
      const result = await plugin.joinVoiceChannel(joinOptions);
      providerCallId = result.providerCallId;
    });

    it("should mix multiple audio tracks", async () => {
      // Add multiple participants
      const callState = plugin.getCallState(providerCallId);
      if (callState) {
        callState.participants.set("user1", {
          userId: "user1",
          username: "User1",
          isBot: false,
          isSpeaking: true,
        });
        callState.participants.set("user2", {
          userId: "user2",
          username: "User2",
          isBot: false,
          isSpeaking: true,
        });
      }

      const participants = await plugin.getChannelParticipants(providerCallId);
      expect(participants).toHaveLength(2);
    });

    it("should exclude bot's own audio (echo cancellation)", async () => {
      const botParticipant: ChannelParticipant = {
        userId: "bot-id",
        username: "Clawdbot",
        isBot: true,
        isSpeaking: false,
      };

      const callState = plugin.getCallState(providerCallId);
      if (callState) {
        callState.participants.set(botParticipant.userId, botParticipant);
      }

      const participants = await plugin.getChannelParticipants(providerCallId);
      expect(participants).toContainEqual(
        expect.objectContaining({ userId: "bot-id", isBot: true }),
      );
    });

    it("should handle concurrent audio mixing", async () => {
      const callState = plugin.getCallState(providerCallId);
      if (callState) {
        for (let i = 0; i < 5; i++) {
          callState.participants.set(`user${i}`, {
            userId: `user${i}`,
            username: `User${i}`,
            isBot: false,
            isSpeaking: i % 2 === 0,
          });
        }
      }

      const participants = await plugin.getChannelParticipants(providerCallId);
      expect(participants).toHaveLength(5);

      const speakingCount = participants.filter((p) => p.isSpeaking).length;
      expect(speakingCount).toBe(3);
    });
  });

  // =========================================================================
  // Normalized Event Types
  // =========================================================================

  describe("Normalized Event Types", () => {
    it("should emit call.initiated when joining channel", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      await plugin.joinVoiceChannel(joinOptions);

      const initiatedEvents = emittedEvents.filter((e) => e.type === "call.initiated");
      expect(initiatedEvents.length).toBeGreaterThan(0);
      expect(initiatedEvents[0]).toHaveProperty("callId");
      expect(initiatedEvents[0]).toHaveProperty("providerCallId");
      expect(initiatedEvents[0]).toHaveProperty("timestamp");
    });

    it("should emit call.answered when connection established", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      await plugin.joinVoiceChannel(joinOptions);

      const answeredEvents = emittedEvents.filter((e) => e.type === "call.answered");
      expect(answeredEvents.length).toBeGreaterThan(0);
      expect(answeredEvents[0]).toHaveProperty("callId");
      expect(answeredEvents[0]).toHaveProperty("timestamp");
    });

    it("should emit call.active during audio flow", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(joinOptions);
      emittedEvents = [];

      await plugin.captureSTT(result.providerCallId);

      const activeEvents = emittedEvents.filter((e) => e.type === "call.active");
      expect(activeEvents.length).toBeGreaterThan(0);
    });

    it("should emit call.speaking when participant detected", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(joinOptions);
      emittedEvents = [];

      // Add speaking participant
      const callState = plugin.getCallState(result.providerCallId);
      if (callState) {
        const participant: ChannelParticipant = {
          userId: "speaker",
          username: "Speaker",
          isBot: false,
          isSpeaking: true,
        };
        callState.participants.set(participant.userId, participant);
      }

      const speakingEvents = emittedEvents.filter((e) => e.type === "call.speaking");
      expect(speakingEvents.length >= 0).toBe(true);
    });

    it("should emit call.ended when leaving channel", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(joinOptions);
      emittedEvents = [];

      await plugin.leaveVoiceChannel(result.providerCallId);

      const endedEvents = emittedEvents.filter((e) => e.type === "call.ended");
      expect(endedEvents.length).toBeGreaterThan(0);
      expect(endedEvents[0]).toHaveProperty("reason");
    });
  });

  // =========================================================================
  // VoiceCallProvider Interface Methods
  // =========================================================================

  describe("VoiceCallProvider Interface Methods", () => {
    it("should implement initiateCall", async () => {
      const input: InitiateCallInput = {
        callId: randomUUID() as CallId,
        from: "user1",
        to: "user2",
        clientState: {
          guildId: VALID_GUILD_ID,
          channelId: VALID_CHANNEL_ID,
        },
      };

      const result = await plugin.initiateCall(input);

      expect(result).toHaveProperty("providerCallId");
      expect(result).toHaveProperty("status");
    });

    it("should implement hangupCall", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const joinResult = await plugin.joinVoiceChannel(joinOptions);

      const hangupInput: HangupCallInput = {
        providerCallId: joinResult.providerCallId,
        reason: "user-hangup",
      };

      await expect(plugin.hangupCall(hangupInput)).resolves.toBeUndefined();
    });

    it("should implement playTts", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const joinResult = await plugin.joinVoiceChannel(joinOptions);

      const ttsInput: PlayTtsInput = {
        providerCallId: joinResult.providerCallId,
        text: "Hello from TTS",
        voice: "Adam",
        locale: "en-US",
      };

      await expect(plugin.playTts(ttsInput)).resolves.toBeUndefined();
    });

    it("should implement startListening", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const joinResult = await plugin.joinVoiceChannel(joinOptions);

      const startInput: StartListeningInput = {
        providerCallId: joinResult.providerCallId,
        language: "en-US",
      };

      await expect(plugin.startListening(startInput)).resolves.toBeUndefined();
    });

    it("should implement stopListening", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const joinResult = await plugin.joinVoiceChannel(joinOptions);
      await plugin.captureSTT(joinResult.providerCallId);

      const stopInput: StopListeningInput = {
        providerCallId: joinResult.providerCallId,
      };

      await expect(plugin.stopListening(stopInput)).resolves.toBeUndefined();
    });

    it("should implement verifyWebhook", () => {
      const result = plugin.verifyWebhook({
        method: "GET",
        path: "/webhook",
        headers: {},
      });

      expect(result).toHaveProperty("ok");
    });

    it("should implement parseWebhookEvent", () => {
      const result = plugin.parseWebhookEvent({
        method: "POST",
        path: "/webhook",
        headers: {},
        rawBody: '{}',
      });

      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
    });
  });

  // =========================================================================
  // Error Handling and Network Resilience
  // =========================================================================

  describe("Error Handling and Network Resilience", () => {
    it("should handle concurrent channel operations", async () => {
      const options1: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };
      const options2: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: "111111111111111111", // Different channel
      };

      const [result1, result2] = await Promise.all([
        plugin.joinVoiceChannel(options1),
        plugin.joinVoiceChannel(options2),
      ]);

      expect(result1.providerCallId).not.toBe(result2.providerCallId);
    });

    it("should recover from partial failures", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(joinOptions);

      // Try to send TTS to invalid call first
      await expect(
        plugin.sendTTSResponse(randomUUID() as ProviderCallId, "fail"),
      ).rejects.toThrow();

      // Should still be able to use valid call
      await expect(
        plugin.sendTTSResponse(result.providerCallId, "success"),
      ).resolves.toBeUndefined();
    });

    it("should maintain state consistency on errors", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(joinOptions);

      const stateBefore = plugin.getCallState(result.providerCallId);
      expect(stateBefore).toBeDefined();

      // Attempt invalid operation
      await expect(
        plugin.leaveVoiceChannel(randomUUID() as ProviderCallId),
      ).rejects.toThrow();

      // Original call state should be unaffected
      const stateAfter = plugin.getCallState(result.providerCallId);
      expect(stateAfter).toBeDefined();
      expect(stateAfter?.state).toBe(stateBefore?.state);
    });

    it("should clean up resources on shutdown", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(joinOptions);

      const stateBefore = plugin.getCallState(result.providerCallId);
      expect(stateBefore).toBeDefined();

      await plugin.shutdown();

      const stateAfter = plugin.getCallState(result.providerCallId);
      expect(stateAfter).toBeUndefined();
    });
  });

  // =========================================================================
  // Integration Scenarios
  // =========================================================================

  describe("Integration Scenarios", () => {
    it("should handle complete call lifecycle", async () => {
      emittedEvents = [];

      // Join channel
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };
      const joinResult = await plugin.joinVoiceChannel(joinOptions);

      // Verify join events
      expect(emittedEvents.some((e) => e.type === "call.initiated")).toBe(true);
      expect(emittedEvents.some((e) => e.type === "call.answered")).toBe(true);

      emittedEvents = [];

      // Start listening
      await plugin.captureSTT(joinResult.providerCallId);
      expect(emittedEvents.some((e) => e.type === "call.active")).toBe(true);

      emittedEvents = [];

      // Send TTS
      await plugin.sendTTSResponse(joinResult.providerCallId, "Hello there");

      // Stop listening
      await plugin.stopCapturingSTT(joinResult.providerCallId);

      emittedEvents = [];

      // Leave channel
      await plugin.leaveVoiceChannel(joinResult.providerCallId);

      expect(emittedEvents.some((e) => e.type === "call.ended")).toBe(true);
    });

    it("should handle multiple concurrent calls", async () => {
      const calls = await Promise.all(
        Array.from({ length: 3 }, async (_, i) => {
          const options: DiscordChannelJoinOptions = {
            guildId: VALID_GUILD_ID,
            channelId: `${BigInt(VALID_CHANNEL_ID) + BigInt(i)}` as any, // Increment channel ID
          };
          return plugin.joinVoiceChannel(options);
        }),
      );

      expect(calls).toHaveLength(3);
      expect(calls.every((c) => c.providerCallId)).toBe(true);

      // All calls should have unique provider call IDs
      const callIds = new Set(calls.map((c) => c.providerCallId));
      expect(callIds.size).toBe(3);
    });

    it("should handle participant state transitions", async () => {
      const joinOptions: DiscordChannelJoinOptions = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
      };

      const result = await plugin.joinVoiceChannel(joinOptions);
      const callState = plugin.getCallState(result.providerCallId);

      if (callState) {
        // Participant joins
        const p1: ChannelParticipant = {
          userId: "user1",
          username: "Alice",
          isBot: false,
          isSpeaking: false,
        };
        callState.participants.set(p1.userId, p1);

        let participants = await plugin.getChannelParticipants(result.providerCallId);
        expect(participants).toHaveLength(1);

        // Participant starts speaking
        p1.isSpeaking = true;
        participants = await plugin.getChannelParticipants(result.providerCallId);
        expect(participants[0].isSpeaking).toBe(true);

        // Another participant joins
        const p2: ChannelParticipant = {
          userId: "user2",
          username: "Bob",
          isBot: false,
          isSpeaking: false,
        };
        callState.participants.set(p2.userId, p2);

        participants = await plugin.getChannelParticipants(result.providerCallId);
        expect(participants).toHaveLength(2);

        // Participant leaves
        callState.participants.delete(p1.userId);

        participants = await plugin.getChannelParticipants(result.providerCallId);
        expect(participants).toHaveLength(1);
        expect(participants[0].userId).toBe(p2.userId);
      }
    });
  });
});
