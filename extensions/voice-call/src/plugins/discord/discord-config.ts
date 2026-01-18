/**
 * Discord Call Provider Plugin - Configuration
 *
 * Defines configuration schema, voice channel settings, and validation for Discord integration.
 */

import { z } from "zod";
import type { NormalizedEvent } from "../../types.js";

// ============================================================================
// Discord Configuration Schema
// ============================================================================

/**
 * Configuration for Discord call provider plugin
 */
export const DiscordCallConfigSchema = z.object({
  /** Discord bot token (required) */
  botToken: z.string().min(1, "Bot token is required"),

  /** Guild configurations for voice channel support */
  guilds: z
    .record(
      z.string(),
      z.object({
        guildId: z.string(),
        /** Default voice channel for calls */
        defaultChannelId: z.string().optional(),
        /** Whether to create temporary voice channels */
        allowTempChannels: z.boolean().default(false),
      }),
    )
    .optional(),

  /** Voice channel settings */
  voice: z.object({
    /** Default audio encoder (sample rate in Hz) */
    sampleRate: z.number().default(48000),
    /** Default audio bitrate in kbps */
    bitrate: z.number().default(128),
    /** Enable automatic echo cancellation */
    echoCancel: z.boolean().default(true),
    /** Enable noise suppression */
    noiseSuppress: z.boolean().default(true),
  }),

  /** STT provider configuration */
  stt: z.object({
    /** Default STT provider (e.g., "openai-realtime") */
    provider: z.string().default("openai-realtime"),
    /** Language for transcription */
    language: z.string().default("en-US"),
    /** Enable interim results during transcription */
    interimResults: z.boolean().default(true),
  }),

  /** TTS provider configuration */
  tts: z.object({
    /** Default TTS provider (e.g., "elevenlabs") */
    provider: z.string().default("elevenlabs"),
    /** Default voice for TTS */
    voice: z.string().default("Adam"),
    /** Voice speed (0.5-2.0x) */
    speed: z.number().min(0.5).max(2.0).default(1.0),
  }),
});

export type DiscordCallConfig = z.infer<typeof DiscordCallConfigSchema>;

// ============================================================================
// Guild Configuration
// ============================================================================

/**
 * Configuration for a specific Discord guild
 */
export interface GuildVoiceConfig {
  guildId: string;
  defaultChannelId?: string;
  allowTempChannels?: boolean;
}

/**
 * Voice channel join options
 */
export interface DiscordChannelJoinOptions {
  /** Guild ID where the channel exists */
  guildId: string;
  /** Voice channel ID to join */
  channelId: string;
  /** Whether to suppress initial events */
  silent?: boolean;
  /** Timeout for connection in milliseconds */
  timeoutMs?: number;
}

/**
 * Participant information for a voice channel
 */
export interface ChannelParticipant {
  userId: string;
  username: string;
  isBot: boolean;
  isSpeaking: boolean;
}

// ============================================================================
// Event Mapping Configuration
// ============================================================================

/**
 * Maps Discord voice state changes to normalized call states
 */
export const DISCORD_STATE_MAP: Record<string, string> = {
  "voice.connected": "answered",
  "voice.reconnecting": "ringing",
  "voice.disconnected": "ended",
  "voice.authenticating": "initiated",
  "voice.signalling": "initiated",
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate Discord configuration
 */
export function validateDiscordConfig(config: unknown): DiscordCallConfig {
  return DiscordCallConfigSchema.parse(config);
}

/**
 * Validate guild ID format (snowflake)
 */
export function validateGuildId(guildId: string): boolean {
  return /^\d{17,19}$/.test(guildId);
}

/**
 * Validate channel ID format (snowflake)
 */
export function validateChannelId(channelId: string): boolean {
  return /^\d{17,19}$/.test(channelId);
}

/**
 * Validate user ID format (snowflake)
 */
export function validateUserId(userId: string): boolean {
  return /^\d{17,19}$/.test(userId);
}

// ============================================================================
// Audio Format Configuration
// ============================================================================

/**
 * Discord audio codec options
 */
export interface AudioCodecOptions {
  /** Sample rate in Hz (48000 standard for Discord) */
  sampleRate: number;
  /** Number of audio channels (1=mono, 2=stereo) */
  channels: number;
  /** Frame size for encoding */
  frameSize: number;
}

/**
 * Get standard Discord audio codec options
 */
export function getDiscordAudioCodecOptions(): AudioCodecOptions {
  return {
    sampleRate: 48000, // Discord standard
    channels: 2,
    frameSize: 960, // 20ms at 48kHz
  };
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Discord plugin specific error
 */
export class DiscordPluginError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DiscordPluginError";
  }
}

/**
 * Voice connection error
 */
export class VoiceConnectionError extends DiscordPluginError {
  constructor(message: string) {
    super(message, "VOICE_CONNECTION_ERROR");
  }
}

/**
 * Audio streaming error
 */
export class AudioStreamError extends DiscordPluginError {
  constructor(message: string) {
    super(message, "AUDIO_STREAM_ERROR");
  }
}

/**
 * Participant management error
 */
export class ParticipantError extends DiscordPluginError {
  constructor(message: string) {
    super(message, "PARTICIPANT_ERROR");
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a normalized event for Discord voice state change
 */
export function createVoiceStateEvent(
  callId: string,
  providerCallId: string,
  state: string,
  details?: Record<string, unknown>,
): Partial<NormalizedEvent> {
  return {
    id: `discord-${Date.now()}-${Math.random()}`,
    callId,
    providerCallId,
    timestamp: Date.now(),
    ...details,
  };
}

/**
 * Format Discord snowflake ID for logging
 */
export function formatSnowflakeId(id: string): string {
  return `[${id.slice(0, 8)}...${id.slice(-8)}]`;
}
