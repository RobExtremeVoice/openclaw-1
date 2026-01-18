/**
 * Discord Voice Channel Slash Commands
 *
 * Implements /join-voice, /leave-voice, /voice-status, and /voice-config-channel commands
 * for managing bot voice channel connections and per-channel configuration.
 */

import { Command, type CommandInteraction, type CommandOptions } from "@buape/carbon";
import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord-api-types/v10";

import type { loadConfig } from "../../config/config.js";
import { writeConfigFile } from "../../config/io.js";
import { fetchVoiceStatusDiscord } from "../send.guild.js";
import type { DiscordVoiceChannelManager } from "./channel-manager.js";
import type { VoiceResponseType } from "./config.js";
import {
  getVoiceResponseType,
  setVoiceResponseType,
  type VoiceConfigContext,
} from "./config-store.js";

type Config = ReturnType<typeof loadConfig>;

/**
 * Valid voice response modes
 */
const VOICE_MODES: VoiceResponseType[] = ["voice", "text", "both", "match"];

/**
 * Mode descriptions for help text
 */
const MODE_DESCRIPTIONS: Record<VoiceResponseType, string> = {
  voice: "Always respond with voice messages",
  text: "Always respond with text messages",
  both: "Respond with both voice and text",
  match: "Match user's input modality (default)",
};

/**
 * Emoji indicators for voice modes
 */
const MODE_EMOJIS: Record<VoiceResponseType, string> = {
  voice: "🎤",
  text: "📝",
  both: "🎤📝",
  match: "🔄",
};

/**
 * Format voice mode for display
 */
function formatMode(mode: VoiceResponseType): string {
  return `${MODE_EMOJIS[mode]} \`${mode}\` - ${MODE_DESCRIPTIONS[mode]}`;
}

/**
 * Build embed-style message for configuration display
 */
function buildConfigEmbed(params: {
  title: string;
  description?: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  color?: number;
}): string {
  const lines: string[] = [];

  lines.push(`**${params.title}**`);
  if (params.description) {
    lines.push(params.description);
    lines.push("");
  }

  for (const field of params.fields) {
    lines.push(`**${field.name}**`);
    lines.push(field.value);
    if (!field.inline) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Check if user has administrator permission
 */
function hasAdminPermission(interaction: CommandInteraction): boolean {
  const member = interaction.member;
  if (!member || !("permissions" in member)) {
    return false;
  }

  const permissions = BigInt(member.permissions as string);
  return (permissions & BigInt(PermissionFlagsBits.Administrator)) !== 0n;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format bytes in human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

/**
 * /join-voice - Make bot join user's current voice channel
 */
export class JoinVoiceCommand extends Command {
  name = "join-voice";
  description = "Join your current voice channel";
  defer = true;
  ephemeral = true;

  constructor(
    private cfg: Config,
    private channelManager: DiscordVoiceChannelManager,
    private adapterCreatorFactory: (guildId: string) => any,
  ) {
    super();
  }

  async run(interaction: CommandInteraction) {
    // Check if in a guild
    if (!interaction.guild?.id || !interaction.user?.id) {
      await interaction.reply({
        content: "❌ This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    try {
      // Fetch user's voice state to see if they're in a voice channel
      const voiceState = await fetchVoiceStatusDiscord(guildId, userId);

      if (!voiceState.channel_id) {
        await interaction.reply({
          content: "❌ You must be in a voice channel to use this command.",
          ephemeral: true,
        });
        return;
      }

      const channelId = voiceState.channel_id;

      // Check if already connected to this channel
      if (this.channelManager.isConnected(guildId, channelId)) {
        await interaction.reply({
          content: `ℹ️ I'm already connected to <#${channelId}>`,
          ephemeral: true,
        });
        return;
      }

      // Check if connected to a different channel in this guild
      const connections = this.channelManager.listConnections();
      const existingConnection = connections.find((conn) => conn.guildId === guildId);

      if (existingConnection) {
        await interaction.reply({
          content: `❌ I'm already connected to <#${existingConnection.channelId}>.\n` +
                   `Use \`/leave-voice\` first to disconnect.`,
          ephemeral: true,
        });
        return;
      }

      // Join the voice channel
      await this.channelManager.join({
        guildId,
        channelId,
        adapterCreator: this.adapterCreatorFactory(guildId),
        selfDeaf: false,
        selfMute: false,
      });

      await interaction.reply({
        content: `🎤 Joined <#${channelId}>! I'm now listening and ready to respond.`,
        ephemeral: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Handle common errors
      if (errorMessage.includes("Already connected")) {
        await interaction.reply({
          content: "ℹ️ I'm already connected to this voice channel.",
          ephemeral: true,
        });
      } else if (errorMessage.includes("Maximum connections")) {
        await interaction.reply({
          content: "❌ I've reached the maximum number of voice connections. Try again later.",
          ephemeral: true,
        });
      } else if (errorMessage.includes("Unknown Channel") || errorMessage.includes("Missing Access")) {
        await interaction.reply({
          content: "❌ I don't have permission to join that voice channel.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to join voice channel: ${errorMessage}\n\n` +
                   `Make sure I have permission to connect and speak in the channel.`,
          ephemeral: true,
        });
      }
    }
  }
}

/**
 * /leave-voice - Make bot leave the voice channel
 */
export class LeaveVoiceCommand extends Command {
  name = "leave-voice";
  description = "Leave the voice channel";
  defer = true;
  ephemeral = true;

  constructor(
    private cfg: Config,
    private channelManager: DiscordVoiceChannelManager,
  ) {
    super();
  }

  async run(interaction: CommandInteraction) {
    if (!interaction.guild?.id || !interaction.channel?.id) {
      await interaction.reply({
        content: "❌ This command can only be used in a server channel.",
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guild.id;

    // Find if bot is connected to any voice channel in this guild
    const connections = this.channelManager.listConnections();
    const guildConnection = connections.find((conn) => conn.guildId === guildId);

    if (!guildConnection) {
      await interaction.reply({
        content: "ℹ️ I'm not currently connected to any voice channel in this server.",
        ephemeral: true,
      });
      return;
    }

    try {
      await this.channelManager.leave(guildConnection.guildId, guildConnection.channelId);

      await interaction.reply({
        content: `👋 Left voice channel <#${guildConnection.channelId}>`,
        ephemeral: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await interaction.reply({
        content: `❌ Failed to leave voice channel: ${errorMessage}`,
        ephemeral: true,
      });
    }
  }
}

/**
 * /voice-status - Show active voice channel status
 */
export class VoiceStatusCommand extends Command {
  name = "voice-status";
  description = "Show active voice channel status";
  defer = true;
  ephemeral = true;

  constructor(
    private cfg: Config,
    private channelManager: DiscordVoiceChannelManager,
  ) {
    super();
  }

  async run(interaction: CommandInteraction) {
    const context: VoiceConfigContext = {
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
      userId: interaction.user?.id,
    };

    // Get current voice response mode
    const responseMode = getVoiceResponseType(this.cfg, context);

    // Get all connections
    const connections = this.channelManager.listConnections();
    const metrics = this.channelManager.getMetrics();

    // Filter connections for current guild if in a guild
    const relevantConnections = context.guildId
      ? connections.filter((conn) => conn.guildId === context.guildId)
      : connections;

    const fields: Array<{ name: string; value: string }> = [];

    // Voice response mode
    fields.push({
      name: "🎤 Response Mode",
      value: responseMode ? formatMode(responseMode) : "Not configured",
    });

    // Connection status
    if (relevantConnections.length === 0) {
      fields.push({
        name: "📡 Connection Status",
        value: "Not connected to any voice channels",
      });
    } else {
      for (const conn of relevantConnections) {
        const status = this.channelManager.getStatus(conn.guildId, conn.channelId);
        const connectionTime = Date.now() - conn.createdAt;
        const idleTime = Date.now() - conn.lastActivity;

        const statusLines: string[] = [];
        statusLines.push(`**Channel:** <#${conn.channelId}>`);
        statusLines.push(`**Status:** ${conn.connected ? "✅ Connected" : "❌ Disconnected"}`);

        if (status) {
          statusLines.push(`**Participants:** ${status.participants}`);
          statusLines.push(`**Uptime:** ${formatDuration(connectionTime)}`);
          statusLines.push(`**Last Activity:** ${formatDuration(idleTime)} ago`);

          if (status.bytesReceived > 0 || status.bytesSent > 0) {
            statusLines.push(
              `**Data:** ↓ ${formatBytes(status.bytesReceived)} / ↑ ${formatBytes(status.bytesSent)}`,
            );
          }

          if (status.packetsReceived > 0 || status.packetsSent > 0) {
            statusLines.push(
              `**Packets:** ↓ ${status.packetsReceived} / ↑ ${status.packetsSent}`,
            );
          }

          // Calculate latency if we have packet data
          if (status.packetsReceived > 0 && status.connectionTime > 0) {
            const avgLatency = (status.connectionTime / status.packetsReceived) * 1000;
            const quality =
              avgLatency < 50 ? "Excellent 🟢" :
              avgLatency < 100 ? "Good 🟡" :
              avgLatency < 200 ? "Fair 🟠" :
              "Poor 🔴";
            statusLines.push(`**Quality:** ${quality} (~${avgLatency.toFixed(0)}ms)`);
          }
        }

        fields.push({
          name: `📡 Voice Connection`,
          value: statusLines.join("\n"),
        });
      }
    }

    // Global metrics if connected to multiple channels
    if (connections.length > 1) {
      fields.push({
        name: "📊 Global Metrics",
        value: [
          `**Total Connections:** ${metrics.totalConnections} (${metrics.activeConnections} active)`,
          `**Total Participants:** ${metrics.totalParticipants}`,
          `**Total Data:** ↓ ${formatBytes(metrics.totalBytesReceived)} / ↑ ${formatBytes(metrics.totalBytesSent)}`,
        ].join("\n"),
      });
    }

    const embed = buildConfigEmbed({
      title: "🎤 Voice Status",
      description: context.guildId
        ? `Status for ${interaction.guild?.name ?? "this server"}`
        : "Global voice status",
      fields,
    });

    await interaction.reply({ content: embed, ephemeral: true });
  }
}

/**
 * /voice-config-channel - Set voice response mode per voice channel
 */
export class VoiceConfigChannelCommand extends Command {
  name = "voice-config-channel";
  description = "Configure voice response mode for this channel (Admin only)";
  defer = true;
  ephemeral = true;

  options: CommandOptions = [
    {
      name: "mode",
      description: "Voice response mode for this channel",
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: VOICE_MODES.map((mode) => ({
        name: `${MODE_EMOJIS[mode]} ${mode} - ${MODE_DESCRIPTIONS[mode]}`,
        value: mode,
      })),
    },
  ];

  constructor(private cfg: Config) {
    super();
  }

  async run(interaction: CommandInteraction) {
    // Check permissions
    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        content: "❌ You need Administrator permission to configure channel settings.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.channel?.id) {
      await interaction.reply({
        content: "❌ This command must be used in a channel.",
        ephemeral: true,
      });
      return;
    }

    const mode = interaction.options.getString("mode") as VoiceResponseType | null;

    if (!mode || !VOICE_MODES.includes(mode)) {
      await interaction.reply({
        content: `❌ Invalid mode. Choose from: ${VOICE_MODES.join(", ")}`,
        ephemeral: true,
      });
      return;
    }

    const context: VoiceConfigContext = {
      guildId: interaction.guild?.id,
      channelId: interaction.channel.id,
      userId: interaction.user?.id,
    };

    try {
      // Set channel-level configuration
      setVoiceResponseType(this.cfg, "channel", mode, context);

      // Persist configuration
      await writeConfigFile(this.cfg);

      const channelName =
        interaction.channel && "name" in interaction.channel
          ? (interaction.channel.name as string)
          : "this channel";

      const embed = buildConfigEmbed({
        title: "✅ Channel Voice Configuration Updated",
        fields: [
          { name: "Channel", value: `#${channelName}` },
          { name: "Mode", value: formatMode(mode) },
          {
            name: "Effect",
            value:
              mode === "match"
                ? "Responses will match user input (voice→voice, text→text)"
                : mode === "both"
                  ? "All responses will include both voice and text"
                  : mode === "voice"
                    ? "All responses will be voice messages"
                    : "All responses will be text messages",
          },
          {
            name: "Scope",
            value: "This setting applies to all users in this channel",
          },
        ],
      });

      await interaction.reply({ content: embed, ephemeral: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await interaction.reply({
        content: `❌ Failed to update channel configuration: ${errorMessage}`,
        ephemeral: true,
      });
    }
  }
}

/**
 * Create voice channel command instances
 *
 * @param cfg - Bot configuration
 * @param channelManager - Voice channel manager instance
 * @param adapterCreatorFactory - Factory function to create Discord.js voice adapter for a guild
 * @returns Array of voice channel command instances
 */
export function createVoiceChannelCommands(
  cfg: Config,
  channelManager: DiscordVoiceChannelManager,
  adapterCreatorFactory: (guildId: string) => any,
): Command[] {
  return [
    new JoinVoiceCommand(cfg, channelManager, adapterCreatorFactory),
    new LeaveVoiceCommand(cfg, channelManager),
    new VoiceStatusCommand(cfg, channelManager),
    new VoiceConfigChannelCommand(cfg),
  ];
}
