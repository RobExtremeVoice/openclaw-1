/**
 * Voice Configuration Integration Example
 *
 * Demonstrates how to integrate voice configuration commands
 * into a Discord bot using the @buape/carbon framework.
 */

import { Client } from "@buape/carbon";
import type { loadConfig } from "../../config/config.js";
import {
  createVoiceConfigCommands,
  type VoiceConfigGetCommand,
} from "./config-commands.js";
import {
  createVoiceDashboardCommands,
  type VoiceConfigDashboardCommand,
} from "./config-dashboard.js";

/**
 * Register voice configuration commands with Discord bot
 *
 * @example
 * ```typescript
 * import { registerVoiceConfigCommands } from './discord/voice/config-integration';
 *
 * const client = new Client({
 *   clientId: process.env.DISCORD_CLIENT_ID,
 *   publicKey: process.env.DISCORD_PUBLIC_KEY,
 *   token: process.env.DISCORD_TOKEN,
 * });
 *
 * const config = loadConfig();
 * registerVoiceConfigCommands(client, config);
 *
 * await client.login();
 * ```
 */
export function registerVoiceConfigCommands(
  client: Client,
  cfg: ReturnType<typeof loadConfig>,
): void {
  // Register slash commands
  const commands = createVoiceConfigCommands(cfg);
  client.commands.push(...commands);

  // Register dashboard commands
  const dashboardCommands = createVoiceDashboardCommands(cfg);
  client.commands.push(...dashboardCommands);
}

/**
 * Example: Custom bot with voice configuration
 *
 * This example shows a complete Discord bot setup with voice
 * configuration commands integrated.
 */
export async function createVoiceConfigBot(params: {
  clientId: string;
  publicKey: string;
  token: string;
  cfg: ReturnType<typeof loadConfig>;
}): Promise<Client> {
  const { clientId, publicKey, token, cfg } = params;

  // Create voice config commands
  const commands = [
    ...createVoiceConfigCommands(cfg),
    ...createVoiceDashboardCommands(cfg),
  ];

  // Create Carbon client with handlers
  const client = new Client(
    {
      baseUrl: "http://localhost",
      clientId,
      publicKey,
      token,
    },
    {
      commands,
      listeners: [],
      components: [],
      modals: [],
    },
  );

  // Sync commands to Discord (login handled by client)
  console.log("✅ Voice configuration bot ready!");
  console.log("Commands registered:");
  console.log("  /voice-config-get");
  console.log("  /voice-config-set");
  console.log("  /voice-config-reset");
  console.log("  /voice-config-status");
  console.log("  /voice-config-dashboard");
  console.log("  /voice-config-stats");

  return client;
}

/**
 * Example: Usage in existing bot monitor
 *
 * This shows how to add voice config to an existing bot monitoring system.
 */
export function addVoiceConfigToMonitor(params: {
  client: Client;
  cfg: ReturnType<typeof loadConfig>;
}): void {
  const { client, cfg } = params;

  // Create and register commands
  const allCommands = [
    ...createVoiceConfigCommands(cfg),
    ...createVoiceDashboardCommands(cfg),
  ];

  client.commands.push(...allCommands);

  console.log(`✅ Added ${allCommands.length} voice config commands`);
}

/**
 * Example: Programmatic configuration
 *
 * Shows how to programmatically configure voice settings
 * without using slash commands.
 */
export async function configureVoiceSettings(params: {
  cfg: ReturnType<typeof loadConfig>;
  guildId?: string;
  channelId?: string;
  userId?: string;
  mode: "voice" | "text" | "both" | "match";
  level: "global" | "guild" | "channel" | "user";
}): Promise<void> {
  const { cfg, guildId, channelId, userId, mode, level } = params;

  // Import config functions
  const { setVoiceResponseType } = await import("./config-store.js");
  const { writeConfigFile } = await import("../../config/io.js");

  // Set configuration
  setVoiceResponseType(cfg, level, mode, {
    guildId,
    channelId,
    userId,
  });

  // Persist to disk
  await writeConfigFile(cfg);

  console.log(`✅ Voice mode set to "${mode}" at ${level} level`);
}

/**
 * Example: Query current configuration
 *
 * Shows how to query the effective voice configuration
 * for a specific context.
 */
export function queryVoiceConfig(params: {
  cfg: ReturnType<typeof loadConfig>;
  guildId?: string;
  channelId?: string;
  userId?: string;
}): {
  effective: "voice" | "text" | "both" | "match";
  source: "user" | "channel" | "guild" | "global";
} {
  const { cfg, guildId, channelId, userId } = params;

  // Import config functions
  const { getVoiceResponseType } = require("./config-store.js");

  const mode = getVoiceResponseType(cfg, {
    guildId,
    channelId,
    userId,
  });

  // Determine source
  const voiceConfig = cfg.channels?.discord?.voice;
  let source: "user" | "channel" | "guild" | "global" = "global";

  if (userId && voiceConfig?.perUserOverride?.[userId]) {
    source = "user";
  } else if (channelId && voiceConfig?.perChannelOverride?.[channelId]) {
    source = "channel";
  } else if (guildId && voiceConfig?.perGuildOverride?.[guildId]) {
    source = "guild";
  }

  return {
    effective: mode ?? "match",
    source,
  };
}

/**
 * Example: Bulk configuration
 *
 * Shows how to configure multiple guilds/channels at once.
 */
export async function bulkConfigureVoice(params: {
  cfg: ReturnType<typeof loadConfig>;
  guilds?: Array<{ id: string; mode: "voice" | "text" | "both" | "match" }>;
  channels?: Array<{ id: string; mode: "voice" | "text" | "both" | "match" }>;
  users?: Array<{ id: string; mode: "voice" | "text" | "both" | "match" }>;
}): Promise<void> {
  const { cfg, guilds, channels, users } = params;
  const { setVoiceResponseType } = await import("./config-store.js");
  const { writeConfigFile } = await import("../../config/io.js");

  // Configure guilds
  if (guilds) {
    for (const { id, mode } of guilds) {
      setVoiceResponseType(cfg, "guild", mode, { guildId: id });
    }
  }

  // Configure channels
  if (channels) {
    for (const { id, mode } of channels) {
      setVoiceResponseType(cfg, "channel", mode, { channelId: id });
    }
  }

  // Configure users
  if (users) {
    for (const { id, mode } of users) {
      setVoiceResponseType(cfg, "user", mode, { userId: id });
    }
  }

  // Persist all changes
  await writeConfigFile(cfg);

  const total = (guilds?.length ?? 0) + (channels?.length ?? 0) + (users?.length ?? 0);
  console.log(`✅ Bulk configured ${total} voice settings`);
}

/**
 * Example usage in main application
 */
async function exampleUsage() {
  // Load config
  const { loadConfig } = await import("../../config/config.js");
  const cfg = loadConfig();

  // Configure a gaming server
  await bulkConfigureVoice({
    cfg,
    channels: [
      { id: "voice-channel-1", mode: "voice" },
      { id: "text-channel-1", mode: "text" },
      { id: "general-channel", mode: "match" },
    ],
  });

  // Query user's effective config
  const userConfig = queryVoiceConfig({
    cfg,
    guildId: "guild-123",
    channelId: "voice-channel-1",
    userId: "user-456",
  });

  console.log(`User will receive: ${userConfig.effective} (from ${userConfig.source})`);
}

// Export example for documentation
export { exampleUsage };
