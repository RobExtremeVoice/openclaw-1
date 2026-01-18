/**
 * Discord Call Provider Plugin - Module Exports
 *
 * Re-exports and factory functions for the Discord voice-call provider plugin.
 */

import type { DiscordCallConfig } from "./discord-config.js";
import { DiscordCallProviderPlugin } from "./discord-provider.js";

export {
  DiscordCallProviderPlugin,
  type AudioMixer,
  type VoiceChannelBroadcaster,
  type CallStateEntry,
} from "./discord-provider.js";

export {
  DiscordVoiceEventHandler,
  SPEAKING_FLAG_MICROPHONE,
  SPEAKING_FLAG_SOUNDSHARE,
  SPEAKING_FLAG_PRIORITY,
  mixAudioStreams,
  applyCancellation,
  detectVoiceActivity,
  type DiscordVoiceStateUpdate,
  type DiscordVoiceServerUpdate,
  type DiscordSpeakingUpdate,
  type DiscordUserUpdate,
} from "./discord-handler.js";

export {
  DiscordCallConfigSchema,
  validateDiscordConfig,
  validateGuildId,
  validateChannelId,
  validateUserId,
  getDiscordAudioCodecOptions,
  createVoiceStateEvent,
  formatSnowflakeId,
  DiscordPluginError,
  VoiceConnectionError,
  AudioStreamError,
  ParticipantError,
  DISCORD_STATE_MAP,
  type DiscordCallConfig,
  type GuildVoiceConfig,
  type DiscordChannelJoinOptions,
  type ChannelParticipant,
  type AudioCodecOptions,
} from "./discord-config.js";

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Initialize the Discord call provider plugin
 *
 * @param config - Discord call configuration
 * @returns Initialized plugin instance
 *
 * @example
 * ```typescript
 * const config = {
 *   botToken: process.env.DISCORD_TOKEN!,
 *   voice: {
 *     sampleRate: 48000,
 *     echoCancel: true,
 *   },
 *   stt: {
 *     provider: 'openai-realtime',
 *     language: 'en-US',
 *   },
 *   tts: {
 *     provider: 'elevenlabs',
 *     voice: 'Adam',
 *   },
 * };
 *
 * const plugin = initializeDiscordPlugin(config);
 * await plugin.initialize();
 * ```
 */
export async function initializeDiscordPlugin(
  config: DiscordCallConfig,
): Promise<DiscordCallProviderPlugin> {
  const plugin = new DiscordCallProviderPlugin(config);
  await plugin.initialize();
  return plugin;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Create default Discord configuration
 */
export function createDefaultDiscordConfig(
  overrides?: Partial<DiscordCallConfig>,
): DiscordCallConfig {
  return {
    botToken: process.env.DISCORD_BOT_TOKEN || "",
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
    ...overrides,
  };
}

// ============================================================================
// Version Info
// ============================================================================

export const DISCORD_PLUGIN_VERSION = "1.0.0";
export const PLUGIN_NAME = "discord-voice-call";
