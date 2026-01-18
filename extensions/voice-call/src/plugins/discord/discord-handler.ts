/**
 * Discord Voice Event Handler
 *
 * Handles Discord voice state updates and events, converting them to normalized call events.
 * Manages participant tracking, speaking detection, audio stream handling, and echo cancellation.
 */

import { randomUUID } from "node:crypto";
import type { NormalizedEvent } from "../../types.js";
import {
  DISCORD_STATE_MAP,
  createVoiceStateEvent,
  type ChannelParticipant,
} from "./discord-config.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Discord voice state update from gateway
 */
export interface DiscordVoiceStateUpdate {
  /** User ID who's voice state changed */
  user_id: string;
  /** Guild ID the voice state is for */
  guild_id: string;
  /** Voice channel ID, null if left */
  channel_id: string | null;
  /** User's current session ID */
  session_id: string;
  /** Whether the user is deafened */
  deaf: boolean;
  /** Whether the user is muted */
  mute: boolean;
  /** Whether the user is self-deafened */
  self_deaf: boolean;
  /** Whether the user is self-muted */
  self_mute: boolean;
  /** Whether this user is suppressed */
  suppress: boolean;
  /** When the user requested to speak */
  request_to_speak_timestamp?: string | null;
}

/**
 * Discord voice server update for establishing connection
 */
export interface DiscordVoiceServerUpdate {
  /** Voice connection token */
  token: string;
  /** Guild ID */
  guild_id: string;
  /** Voice server endpoint */
  endpoint: string | null;
}

/**
 * Discord speaking update (user started/stopped speaking)
 */
export interface DiscordSpeakingUpdate {
  /** User ID who started speaking */
  user_id: string;
  /** Speaking flags bitmask */
  speaking: number;
  /** SSRC for audio track */
  ssrc: number;
}

/**
 * Discord user update (username, avatar changes)
 */
export interface DiscordUserUpdate {
  id: string;
  username: string;
  avatar?: string;
  bot?: boolean;
}

// ============================================================================
// Event Constants
// ============================================================================

/** Bitmask for microphone speaking flag */
export const SPEAKING_FLAG_MICROPHONE = 1 << 0;
/** Bitmask for soundshare speaking flag */
export const SPEAKING_FLAG_SOUNDSHARE = 1 << 1;
/** Bitmask for priority speaker flag */
export const SPEAKING_FLAG_PRIORITY = 1 << 2;

// ============================================================================
// Event Handler Class
// ============================================================================

/**
 * Handles Discord voice events and converts them to normalized call events
 */
export class DiscordVoiceEventHandler {
  /** Map of guild+channel to active call ID */
  private channelCalls = new Map<string, string>();
  /** Map of user session ID to user info */
  private userSessions = new Map<string, DiscordUserUpdate>();
  /** Track which users are currently speaking in each channel */
  private speakingUsers = new Map<string, Set<string>>();
  /** Voice server endpoint cache */
  private voiceServers = new Map<string, { token: string; endpoint: string | null }>();
  /** Echo cancellation: track bot's own SSRC to exclude from mixing */
  private botSsrc: number | null = null;

  /**
   * Handle Discord voice state update
   */
  handleVoiceStateUpdate(
    update: DiscordVoiceStateUpdate,
    botId: string,
  ): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];
    const channelKey = `${update.guild_id}:${update.channel_id}`;
    const callId = this.channelCalls.get(channelKey) || randomUUID();

    // User left voice channel
    if (update.channel_id === null) {
      events.push(this.createParticipantEvent(callId, update.user_id, "left"));
      return events;
    }

    // User joined voice channel
    events.push(this.createParticipantEvent(callId, update.user_id, "joined"));

    // Track mute/deafen status
    if (update.mute || update.self_mute) {
      events.push({
        id: randomUUID(),
        callId,
        timestamp: Date.now(),
        type: "call.speaking",
        text: `${update.user_id} is muted`,
      });
    }

    if (update.deaf || update.self_deaf) {
      events.push({
        id: randomUUID(),
        callId,
        timestamp: Date.now(),
        type: "call.speaking",
        text: `${update.user_id} is deafened`,
      });
    }

    return events;
  }

  /**
   * Handle Discord voice server update (connection established)
   */
  handleVoiceServerUpdate(
    update: DiscordVoiceServerUpdate,
  ): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Cache the voice server info for later use
    this.voiceServers.set(update.guild_id, {
      token: update.token,
      endpoint: update.endpoint,
    });

    // Emit a call.active event when server is ready
    const callId = this.channelCalls.get(`${update.guild_id}:*`) || randomUUID();

    if (update.endpoint) {
      events.push({
        id: randomUUID(),
        callId,
        timestamp: Date.now(),
        type: "call.active",
      });
    }

    return events;
  }

  /**
   * Handle Discord speaking update (microphone activity detection)
   */
  handleSpeakingUpdate(
    update: DiscordSpeakingUpdate,
    botId: string,
  ): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Track bot's SSRC for echo cancellation
    if (update.user_id === botId) {
      this.botSsrc = update.ssrc;
    }

    // Check if microphone flag is set
    const isSpeaking = (update.speaking & SPEAKING_FLAG_MICROPHONE) !== 0;
    const channelKey = `*:${update.user_id}`;
    const callId = this.channelCalls.get(channelKey) || randomUUID();

    if (isSpeaking) {
      // User started speaking
      if (!this.speakingUsers.has(callId)) {
        this.speakingUsers.set(callId, new Set());
      }
      this.speakingUsers.get(callId)?.add(update.user_id);

      events.push({
        id: randomUUID(),
        callId,
        timestamp: Date.now(),
        type: "call.speaking",
        text: `User ${update.user_id} started speaking`,
      });
    } else {
      // User stopped speaking
      this.speakingUsers.get(callId)?.delete(update.user_id);

      events.push({
        id: randomUUID(),
        callId,
        timestamp: Date.now(),
        type: "call.silence",
        durationMs: 100, // Placeholder - real duration would be tracked
      });
    }

    return events;
  }

  /**
   * Handle audio stream from user (N-party mixing)
   */
  handleAudioStream(
    callId: string,
    userId: string,
    audioBuffer: Buffer,
  ): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];

    // Skip bot's own audio (echo cancellation)
    if (this.botSsrc !== null) {
      // In a real implementation, we'd check the SSRC against botSsrc
      // For now, just process the audio
    }

    // The audio buffer can be mixed with other participant streams
    // This happens at a higher level in the provider

    return events;
  }

  /**
   * Handle transcription result from STT provider
   */
  handleTranscriptionResult(
    callId: string,
    userId: string,
    transcript: string,
    isFinal: boolean,
    confidence?: number,
  ): NormalizedEvent {
    return {
      id: randomUUID(),
      callId,
      timestamp: Date.now(),
      type: "call.speech",
      transcript,
      isFinal,
      confidence,
    };
  }

  /**
   * Handle voice channel state change
   */
  handleChannelStateChange(
    guildId: string,
    channelId: string,
    state: "connected" | "connecting" | "disconnected",
  ): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];
    const channelKey = `${guildId}:${channelId}`;
    const callId = this.channelCalls.get(channelKey) || randomUUID();

    switch (state) {
      case "connected":
        events.push({
          id: randomUUID(),
          callId,
          timestamp: Date.now(),
          type: "call.answered",
        });
        this.channelCalls.set(channelKey, callId);
        break;

      case "connecting":
        events.push({
          id: randomUUID(),
          callId,
          timestamp: Date.now(),
          type: "call.ringing",
        });
        break;

      case "disconnected":
        events.push({
          id: randomUUID(),
          callId,
          timestamp: Date.now(),
          type: "call.ended",
          reason: "hangup-bot",
        });
        this.channelCalls.delete(channelKey);
        this.speakingUsers.delete(callId);
        this.voiceServers.delete(guildId);
        break;
    }

    return events;
  }

  /**
   * Get current participants in a call
   */
  getCallParticipants(callId: string): ChannelParticipant[] {
    const participants: ChannelParticipant[] = [];

    // In a real implementation, this would query the Discord API
    // or maintain a local cache of participants
    const speakingSet = this.speakingUsers.get(callId);
    if (speakingSet) {
      for (const userId of speakingSet) {
        const userInfo = this.userSessions.get(userId);
        participants.push({
          userId,
          username: userInfo?.username || `User ${userId}`,
          isBot: userInfo?.bot || false,
          isSpeaking: true,
        });
      }
    }

    return participants;
  }

  /**
   * Update user information
   */
  updateUser(user: DiscordUserUpdate): void {
    this.userSessions.set(user.id, user);
  }

  /**
   * Clear all state (for cleanup)
   */
  clear(): void {
    this.channelCalls.clear();
    this.userSessions.clear();
    this.speakingUsers.clear();
    this.voiceServers.clear();
    this.botSsrc = null;
  }

  /**
   * Get voice server info for a guild
   */
  getVoiceServer(guildId: string): { token: string; endpoint: string | null } | undefined {
    return this.voiceServers.get(guildId);
  }

  /**
   * Check if user is currently speaking in a call
   */
  isUserSpeaking(callId: string, userId: string): boolean {
    return this.speakingUsers.get(callId)?.has(userId) ?? false;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Create a participant event (join/leave)
   */
  private createParticipantEvent(
    callId: string,
    userId: string,
    action: "joined" | "left",
  ): NormalizedEvent {
    const userInfo = this.userSessions.get(userId);
    const username = userInfo?.username || `User ${userId}`;

    return {
      id: randomUUID(),
      callId,
      timestamp: Date.now(),
      type: "call.speaking",
      text: `${username} ${action} the voice channel`,
    };
  }

  /**
   * Normalize Discord state to call state
   */
  private normalizeState(discordState: string): string {
    return DISCORD_STATE_MAP[discordState] || discordState;
  }
}

// ============================================================================
// Audio Mixing Utilities
// ============================================================================

/**
 * Mix multiple audio streams together (N-party mixing)
 */
export function mixAudioStreams(
  streams: Map<string, Buffer>,
  botSsrc?: number,
): Buffer {
  if (streams.size === 0) return Buffer.alloc(0);

  // Filter out bot's own stream (echo cancellation)
  const otherStreams = Array.from(streams.entries())
    .filter(([userId]) => {
      // In real implementation, check SSRC against botSsrc
      return true;
    })
    .map(([, buffer]) => buffer);

  if (otherStreams.length === 0) return Buffer.alloc(0);
  if (otherStreams.length === 1) return otherStreams[0];

  // Simple averaging mix
  const maxLength = Math.max(...otherStreams.map((b) => b.length));
  const mixed = Buffer.alloc(maxLength);

  for (let i = 0; i < maxLength; i++) {
    let sum = 0;
    let count = 0;
    for (const stream of otherStreams) {
      if (i < stream.length) {
        sum += stream[i];
        count++;
      }
    }
    mixed[i] = count > 0 ? Math.floor(sum / count) : 0;
  }

  return mixed;
}

/**
 * Apply echo cancellation to audio stream
 */
export function applyCancellation(
  incomingAudio: Buffer,
  referenceAudio: Buffer,
): Buffer {
  if (referenceAudio.length === 0) return incomingAudio;

  const output = Buffer.from(incomingAudio);
  const minLen = Math.min(incomingAudio.length, referenceAudio.length);

  // Simple subtraction-based echo cancellation
  for (let i = 0; i < minLen; i++) {
    output[i] = Math.max(0, Math.min(255, incomingAudio[i] - referenceAudio[i] / 2));
  }

  return output;
}

/**
 * Detect speech/voice activity
 */
export function detectVoiceActivity(audioBuffer: Buffer, threshold: number = 50): boolean {
  if (audioBuffer.length === 0) return false;

  let sum = 0;
  for (const byte of audioBuffer) {
    sum += Math.abs(byte - 128); // Center around 128 for unsigned audio
  }

  const avg = sum / audioBuffer.length;
  return avg > threshold;
}
