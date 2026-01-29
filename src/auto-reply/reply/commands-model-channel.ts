import { loadConfig, writeConfigFile } from "../../config/config.js";
import { resolveChannelConfigWrites } from "../../channels/plugins/config-writes.js";
import { resolveModelRefFromString, buildModelAliasIndex } from "../../agents/model-selection.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import type { MoltbotConfig } from "../../config/config.js";
import type { ReplyPayload } from "../types.js";
import type { CommandHandler } from "./commands-types.js";

export type ModelChannelCommandContext = {
  cfg: MoltbotConfig;
  commandBodyNormalized: string;
  provider?: string;
  surface?: string;
  accountId?: string;
  groupSpace?: string;
  groupChannel?: string;
  channelId?: string;
  commandAuthorized?: boolean;
};

function extractChannelId(ctx: ModelChannelCommandContext): string | null {
  // Try to extract channel ID from groupChannel (e.g., "#channel-name" -> id not available)
  // or from channelId if passed directly
  if (ctx.channelId) return ctx.channelId;

  // For Discord, the channel ID is typically in the "To" field as "channel:<id>"
  return null;
}

export async function resolveModelChannelCommandReply(
  ctx: ModelChannelCommandContext,
): Promise<ReplyPayload | null> {
  const body = ctx.commandBodyNormalized.trim();
  if (!body.startsWith("/model-channel") && !body.startsWith("/model_channel")) return null;

  const surface = ctx.surface?.toLowerCase() ?? ctx.provider?.toLowerCase();

  // Only supported for Discord guild channels
  if (surface !== "discord") {
    return {
      text: "The /model-channel command is only available in Discord servers.",
    };
  }

  if (!ctx.groupSpace) {
    return {
      text: "The /model-channel command can only be used in server channels, not DMs.",
    };
  }

  // Check if config writes are enabled
  if (
    !resolveChannelConfigWrites({ cfg: ctx.cfg, channelId: "discord", accountId: ctx.accountId })
  ) {
    return {
      text: "Config writes are disabled for this account. Enable `configWrites` in your Discord config to use this command.",
    };
  }

  // Check authorization
  if (ctx.commandAuthorized === false) {
    return {
      text: "You are not authorized to use this command.",
    };
  }

  const argText = body.replace(/^\/model[-_]channel\b/i, "").trim();
  const channelId = ctx.channelId;
  const guildId = ctx.groupSpace;

  if (!channelId) {
    return {
      text: "Could not determine the current channel. Please try again or specify the channel in your config directly.",
    };
  }

  // Handle clear/reset
  if (!argText || argText.toLowerCase() === "clear" || argText.toLowerCase() === "reset") {
    const currentConfig = loadConfig();
    const guildEntry = currentConfig.channels?.discord?.guilds?.[guildId];
    const channelEntry = guildEntry?.channels?.[channelId];

    if (!channelEntry?.model) {
      return {
        text: `No model override is set for this channel.`,
      };
    }

    // Remove the model override
    delete channelEntry.model;

    // Clean up empty objects
    if (Object.keys(channelEntry).length === 0 && guildEntry?.channels) {
      delete guildEntry.channels[channelId];
    }

    await writeConfigFile(currentConfig);
    return {
      text: `Cleared model override for this channel. Messages will now use the guild or agent default model.`,
    };
  }

  // Resolve the model reference
  const aliasIndex = buildModelAliasIndex({
    cfg: ctx.cfg,
    defaultProvider: DEFAULT_PROVIDER,
  });

  const resolved = resolveModelRefFromString({
    raw: argText,
    defaultProvider: DEFAULT_PROVIDER,
    aliasIndex,
  });

  if (!resolved) {
    return {
      text: `Unknown model "${argText}". Use /models to see available models.`,
    };
  }

  const modelId = `${resolved.ref.provider}/${resolved.ref.model}`;

  // Update the config
  const currentConfig = loadConfig();

  // Ensure the path exists
  if (!currentConfig.channels) currentConfig.channels = {};
  if (!currentConfig.channels.discord) currentConfig.channels.discord = {};
  if (!currentConfig.channels.discord.guilds) currentConfig.channels.discord.guilds = {};
  if (!currentConfig.channels.discord.guilds[guildId]) {
    currentConfig.channels.discord.guilds[guildId] = {};
  }
  if (!currentConfig.channels.discord.guilds[guildId].channels) {
    currentConfig.channels.discord.guilds[guildId].channels = {};
  }
  if (!currentConfig.channels.discord.guilds[guildId].channels[channelId]) {
    currentConfig.channels.discord.guilds[guildId].channels[channelId] = {};
  }

  // Set the model
  currentConfig.channels.discord.guilds[guildId].channels[channelId].model = modelId;

  await writeConfigFile(currentConfig);

  const displayModel = resolved.alias ? `${resolved.alias} (${modelId})` : modelId;
  return {
    text: `Set default model for this channel to **${displayModel}**. Use \`/model-channel clear\` to remove this override.`,
  };
}
