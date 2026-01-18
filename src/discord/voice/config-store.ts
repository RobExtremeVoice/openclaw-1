/**
 * Discord Voice Configuration Storage
 *
 * Handles persistence of voice configuration overrides using the Clawdbot
 * configuration system. Provides type-safe access to guild/channel/user overrides.
 */

import type { ClawdbotConfig, loadConfig } from "../../config/config.js";
import type { DiscordVoiceConfig, VoiceResponseType } from "./config.js";

type Config = ReturnType<typeof loadConfig>;

/**
 * Configuration level for voice settings
 */
export type VoiceConfigLevel = "global" | "guild" | "channel" | "user";

/**
 * Context for resolving voice configuration
 */
export interface VoiceConfigContext {
  guildId?: string;
  channelId?: string;
  userId?: string;
}

/**
 * Get voice configuration from Clawdbot config
 */
export function getVoiceConfig(cfg: Config): DiscordVoiceConfig | undefined {
  return cfg.channels?.discord?.voice;
}

/**
 * Get voice response type for a specific context
 */
export function getVoiceResponseType(
  cfg: Config,
  context: VoiceConfigContext,
): VoiceResponseType | undefined {
  const voiceConfig = getVoiceConfig(cfg);
  if (!voiceConfig) return undefined;

  // Priority: user > channel > guild > global
  if (context.userId && voiceConfig.perUserOverride?.[context.userId]) {
    return voiceConfig.perUserOverride[context.userId];
  }

  if (context.channelId && voiceConfig.perChannelOverride?.[context.channelId]) {
    return voiceConfig.perChannelOverride[context.channelId];
  }

  if (context.guildId && voiceConfig.perGuildOverride?.[context.guildId]) {
    return voiceConfig.perGuildOverride[context.guildId];
  }

  return voiceConfig.messageResponse;
}

/**
 * Set voice response type at a specific level
 */
export function setVoiceResponseType(
  cfg: Config,
  level: VoiceConfigLevel,
  mode: VoiceResponseType,
  context: VoiceConfigContext,
): void {
  // Ensure voice config exists
  if (!cfg.channels) {
    cfg.channels = {};
  }
  if (!cfg.channels.discord) {
    cfg.channels.discord = {};
  }
  if (!cfg.channels.discord.voice) {
    cfg.channels.discord.voice = {
      messageResponse: "match",
      voiceFormat: "mp3",
      audioQuality: "medium",
      enabled: true,
    };
  }

  const voiceConfig = cfg.channels.discord.voice;

  switch (level) {
    case "global":
      voiceConfig.messageResponse = mode;
      break;

    case "guild":
      if (!context.guildId) {
        throw new Error("Guild ID required for guild-level config");
      }
      if (!voiceConfig.perGuildOverride) {
        voiceConfig.perGuildOverride = {};
      }
      voiceConfig.perGuildOverride[context.guildId] = mode;
      break;

    case "channel":
      if (!context.channelId) {
        throw new Error("Channel ID required for channel-level config");
      }
      if (!voiceConfig.perChannelOverride) {
        voiceConfig.perChannelOverride = {};
      }
      voiceConfig.perChannelOverride[context.channelId] = mode;
      break;

    case "user":
      if (!context.userId) {
        throw new Error("User ID required for user-level config");
      }
      if (!voiceConfig.perUserOverride) {
        voiceConfig.perUserOverride = {};
      }
      voiceConfig.perUserOverride[context.userId] = mode;
      break;
  }
}

/**
 * Reset voice configuration at a specific level
 */
export function resetVoiceConfig(
  cfg: Config,
  level: VoiceConfigLevel,
  context: VoiceConfigContext,
): boolean {
  const voiceConfig = getVoiceConfig(cfg);
  if (!voiceConfig) return false;

  switch (level) {
    case "global":
      voiceConfig.messageResponse = "match";
      return true;

    case "guild":
      if (!context.guildId || !voiceConfig.perGuildOverride) {
        return false;
      }
      delete voiceConfig.perGuildOverride[context.guildId];
      return true;

    case "channel":
      if (!context.channelId || !voiceConfig.perChannelOverride) {
        return false;
      }
      delete voiceConfig.perChannelOverride[context.channelId];
      return true;

    case "user":
      if (!context.userId || !voiceConfig.perUserOverride) {
        return false;
      }
      delete voiceConfig.perUserOverride[context.userId];
      return true;
  }
}

/**
 * Get all active configurations for display
 */
export interface ActiveVoiceConfig {
  global: VoiceResponseType;
  guilds: Record<string, VoiceResponseType>;
  channels: Record<string, VoiceResponseType>;
  users: Record<string, VoiceResponseType>;
}

export function getActiveVoiceConfigs(cfg: Config): ActiveVoiceConfig {
  const voiceConfig = getVoiceConfig(cfg);

  return {
    global: voiceConfig?.messageResponse ?? "match",
    guilds: voiceConfig?.perGuildOverride ?? {},
    channels: voiceConfig?.perChannelOverride ?? {},
    users: voiceConfig?.perUserOverride ?? {},
  };
}

/**
 * Check if a configuration exists at a specific level
 */
export function hasVoiceConfig(
  cfg: Config,
  level: VoiceConfigLevel,
  context: VoiceConfigContext,
): boolean {
  // Global level always exists (defaults to 'match' if not configured)
  if (level === "global") {
    return true;
  }

  const voiceConfig = getVoiceConfig(cfg);
  if (!voiceConfig) return false;

  switch (level) {
    case "guild":
      return Boolean(
        context.guildId && voiceConfig.perGuildOverride?.[context.guildId],
      );

    case "channel":
      return Boolean(
        context.channelId && voiceConfig.perChannelOverride?.[context.channelId],
      );

    case "user":
      return Boolean(context.userId && voiceConfig.perUserOverride?.[context.userId]);

    default:
      return false;
  }
}
