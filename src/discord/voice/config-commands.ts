/**
 * Discord Voice Configuration Slash Commands
 *
 * Implements /voice-config commands for managing voice response modality.
 * Supports global, guild, channel, and user-level configuration.
 */

import { Command, type CommandInteraction, type CommandOptions } from "@buape/carbon";
import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord-api-types/v10";

import type { loadConfig } from "../../config/config.js";
import { writeConfigFile } from "../../config/io.js";
import type { VoiceResponseType } from "./config.js";
import {
  getActiveVoiceConfigs,
  getVoiceResponseType,
  resetVoiceConfig,
  setVoiceResponseType,
  type VoiceConfigContext,
  type VoiceConfigLevel,
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
 * Check if user has permission to modify configuration at a level
 */
function hasPermission(
  interaction: CommandInteraction,
  level: VoiceConfigLevel,
): boolean {
  // Users can always configure their own settings
  if (level === "user") {
    return true;
  }

  // For guild/channel/global, require administrator permission
  const member = interaction.member;
  if (!member || !("permissions" in member)) {
    return false;
  }

  const permissions = BigInt(member.permissions as string);
  return (permissions & BigInt(PermissionFlagsBits.Administrator)) !== 0n;
}

/**
 * /voice-config get - Show current settings
 */
export class VoiceConfigGetCommand extends Command {
  name = "voice-config-get";
  description = "Show current voice configuration settings";
  defer = true;
  ephemeral = true;

  constructor(private cfg: Config) {
    super();
  }

  async run(interaction: CommandInteraction) {
    const context: VoiceConfigContext = {
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
      userId: interaction.user?.id,
    };

    const currentMode = getVoiceResponseType(this.cfg, context);
    const configs = getActiveVoiceConfigs(this.cfg);

    const fields: Array<{ name: string; value: string }> = [
      {
        name: "Current Setting (This Context)",
        value: currentMode ? formatMode(currentMode) : "Not configured",
      },
      {
        name: "Global Default",
        value: formatMode(configs.global),
      },
    ];

    // Show guild override if in a guild
    if (context.guildId && configs.guilds[context.guildId]) {
      fields.push({
        name: `Server Override (${interaction.guild?.name})`,
        value: formatMode(configs.guilds[context.guildId]),
      });
    }

    // Show channel override if exists
    if (context.channelId && configs.channels[context.channelId]) {
      const channelName =
        interaction.channel && "name" in interaction.channel
          ? (interaction.channel.name as string)
          : "this channel";
      fields.push({
        name: `Channel Override (#${channelName})`,
        value: formatMode(configs.channels[context.channelId]),
      });
    }

    // Show user override if exists
    if (context.userId && configs.users[context.userId]) {
      fields.push({
        name: "Your Personal Setting",
        value: formatMode(configs.users[context.userId]),
      });
    }

    const embed = buildConfigEmbed({
      title: "🎤 Voice Configuration",
      description:
        "Settings are prioritized: User > Channel > Server > Global",
      fields,
    });

    await interaction.reply({ content: embed, ephemeral: true });
  }
}

/**
 * /voice-config set - Set voice response mode
 */
export class VoiceConfigSetCommand extends Command {
  name = "voice-config-set";
  description = "Set voice response mode";
  defer = true;
  ephemeral = true;

  options: CommandOptions = [
    {
      name: "mode",
      description: "Voice response mode",
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: VOICE_MODES.map((mode) => ({
        name: `${MODE_EMOJIS[mode]} ${mode} - ${MODE_DESCRIPTIONS[mode]}`,
        value: mode,
      })),
    },
    {
      name: "level",
      description: "Configuration level (default: user)",
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: "User (just me)", value: "user" },
        { name: "Channel (this channel)", value: "channel" },
        { name: "Server (entire server)", value: "guild" },
        { name: "Global (default for all)", value: "global" },
      ],
    },
  ];

  constructor(private cfg: Config) {
    super();
  }

  async run(interaction: CommandInteraction) {
    const mode = interaction.options.getString("mode") as VoiceResponseType | null;
    const level = (interaction.options.getString("level") ?? "user") as VoiceConfigLevel;

    if (!mode || !VOICE_MODES.includes(mode)) {
      await interaction.reply({
        content: `❌ Invalid mode. Choose from: ${VOICE_MODES.join(", ")}`,
        ephemeral: true,
      });
      return;
    }

    if (!hasPermission(interaction, level)) {
      await interaction.reply({
        content:
          "❌ You need Administrator permission to change server or channel settings.",
        ephemeral: true,
      });
      return;
    }

    const context: VoiceConfigContext = {
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
      userId: interaction.user?.id,
    };

    try {
      setVoiceResponseType(this.cfg, level, mode, context);

      // Persist configuration
      await writeConfigFile(this.cfg);

      let scopeText = "your personal";
      if (level === "channel") {
        const channelName =
          interaction.channel && "name" in interaction.channel
            ? (interaction.channel.name as string)
            : "this channel";
        scopeText = `#${channelName}`;
      } else if (level === "guild") {
        scopeText = `server "${interaction.guild?.name}"`;
      } else if (level === "global") {
        scopeText = "global default";
      }

      const embed = buildConfigEmbed({
        title: "✅ Voice Configuration Updated",
        fields: [
          { name: "Scope", value: scopeText },
          { name: "Mode", value: formatMode(mode) },
          {
            name: "Effect",
            value:
              mode === "match"
                ? "Responses will match your input (voice→voice, text→text)"
                : mode === "both"
                  ? "All responses will include both voice and text"
                  : mode === "voice"
                    ? "All responses will be voice messages"
                    : "All responses will be text messages",
          },
        ],
      });

      await interaction.reply({ content: embed, ephemeral: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await interaction.reply({
        content: `❌ Failed to update configuration: ${errorMessage}`,
        ephemeral: true,
      });
    }
  }
}

/**
 * /voice-config reset - Reset to defaults
 */
export class VoiceConfigResetCommand extends Command {
  name = "voice-config-reset";
  description = "Reset voice configuration to defaults";
  defer = true;
  ephemeral = true;

  options: CommandOptions = [
    {
      name: "level",
      description: "Configuration level to reset (default: user)",
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: "User (just me)", value: "user" },
        { name: "Channel (this channel)", value: "channel" },
        { name: "Server (entire server)", value: "guild" },
        { name: "Global (reset to 'match')", value: "global" },
      ],
    },
  ];

  constructor(private cfg: Config) {
    super();
  }

  async run(interaction: CommandInteraction) {
    const level = (interaction.options.getString("level") ?? "user") as VoiceConfigLevel;

    if (!hasPermission(interaction, level)) {
      await interaction.reply({
        content:
          "❌ You need Administrator permission to reset server or channel settings.",
        ephemeral: true,
      });
      return;
    }

    const context: VoiceConfigContext = {
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
      userId: interaction.user?.id,
    };

    const success = resetVoiceConfig(this.cfg, level, context);

    if (!success) {
      await interaction.reply({
        content: `ℹ️ No ${level}-level configuration to reset.`,
        ephemeral: true,
      });
      return;
    }

    // Persist configuration
    await writeConfigFile(this.cfg);

    let scopeText = "your personal";
    if (level === "channel") {
      const channelName =
        interaction.channel && "name" in interaction.channel
          ? (interaction.channel.name as string)
          : "this channel";
      scopeText = `#${channelName}`;
    } else if (level === "guild") {
      scopeText = `server "${interaction.guild?.name}"`;
    } else if (level === "global") {
      scopeText = "global default";
    }

    const embed = buildConfigEmbed({
      title: "✅ Configuration Reset",
      fields: [
        { name: "Scope", value: scopeText },
        {
          name: "Result",
          value:
            level === "global"
              ? "Reset to default mode: 🔄 `match` (responds in same modality as input)"
              : "Configuration removed. Will now use parent level settings.",
        },
      ],
    });

    await interaction.reply({ content: embed, ephemeral: true });
  }
}

/**
 * /voice-config status - Show all active configurations
 */
export class VoiceConfigStatusCommand extends Command {
  name = "voice-config-status";
  description = "Show all active voice configurations";
  defer = true;
  ephemeral = true;

  constructor(private cfg: Config) {
    super();
  }

  async run(interaction: CommandInteraction) {
    const configs = getActiveVoiceConfigs(this.cfg);

    const fields: Array<{ name: string; value: string }> = [
      {
        name: "Global Default",
        value: formatMode(configs.global),
      },
    ];

    // Server overrides
    const guildCount = Object.keys(configs.guilds).length;
    if (guildCount > 0) {
      const guildList = Object.entries(configs.guilds)
        .map(([id, mode]) => `• Server \`${id}\`: ${MODE_EMOJIS[mode]} \`${mode}\``)
        .join("\n");
      fields.push({
        name: `Server Overrides (${guildCount})`,
        value: guildList,
      });
    }

    // Channel overrides
    const channelCount = Object.keys(configs.channels).length;
    if (channelCount > 0) {
      const channelList = Object.entries(configs.channels)
        .map(([id, mode]) => `• Channel \`${id}\`: ${MODE_EMOJIS[mode]} \`${mode}\``)
        .join("\n");
      fields.push({
        name: `Channel Overrides (${channelCount})`,
        value: channelList,
      });
    }

    // User overrides
    const userCount = Object.keys(configs.users).length;
    if (userCount > 0) {
      const userList = Object.entries(configs.users)
        .map(([id, mode]) => `• User \`${id}\`: ${MODE_EMOJIS[mode]} \`${mode}\``)
        .slice(0, 10)
        .join("\n");
      const moreCount = userCount - 10;
      fields.push({
        name: `User Overrides (${userCount})`,
        value: moreCount > 0 ? `${userList}\n...and ${moreCount} more` : userList,
      });
    }

    const embed = buildConfigEmbed({
      title: "📊 Voice Configuration Status",
      description: "All active voice configuration overrides",
      fields,
    });

    await interaction.reply({ content: embed, ephemeral: true });
  }
}

/**
 * Create voice config command instances
 */
export function createVoiceConfigCommands(cfg: Config): Command[] {
  return [
    new VoiceConfigGetCommand(cfg),
    new VoiceConfigSetCommand(cfg),
    new VoiceConfigResetCommand(cfg),
    new VoiceConfigStatusCommand(cfg),
  ];
}
