/**
 * Discord Voice Configuration Dashboard
 *
 * Interactive button-based UI for configuring voice response modality.
 * Provides visual feedback and quick mode switching.
 */

import {
  Button,
  Command,
  Row,
  type ButtonInteraction,
  type CommandInteraction,
  type ComponentData,
} from "@buape/carbon";
import { ButtonStyle } from "discord-api-types/v10";

import type { loadConfig } from "../../config/config.js";
import { writeConfigFile } from "../../config/io.js";
import type { VoiceResponseType } from "./config.js";
import {
  getActiveVoiceConfigs,
  getVoiceResponseType,
  setVoiceResponseType,
  type VoiceConfigContext,
  type VoiceConfigLevel,
} from "./config-store.js";

type Config = ReturnType<typeof loadConfig>;

/**
 * Voice mode button custom ID format:
 * "voice-config:mode={mode};level={level};user={userId}"
 */
function buildModeButtonId(params: {
  mode: VoiceResponseType;
  level: VoiceConfigLevel;
  userId: string;
}): string {
  return `voice-config:mode=${params.mode};level=${params.level};user=${params.userId}`;
}

/**
 * Parse voice config button data
 */
function parseModeButtonData(data: ComponentData): {
  mode: VoiceResponseType;
  level: VoiceConfigLevel;
  userId: string;
} | null {
  if (!data || typeof data !== "object") return null;

  const mode = String(data.mode ?? "");
  const level = String(data.level ?? "");
  const userId = String(data.user ?? "");

  if (!mode || !level || !userId) return null;

  return {
    mode: mode as VoiceResponseType,
    level: level as VoiceConfigLevel,
    userId,
  };
}

/**
 * Mode button emojis
 */
const MODE_EMOJIS: Record<VoiceResponseType, string> = {
  voice: "🎤",
  text: "📝",
  both: "🎤📝",
  match: "🔄",
};

/**
 * Voice mode configuration button
 */
class VoiceModeButton extends Button {
  label: string;
  customId: string;
  style: ButtonStyle;

  constructor(
    private mode: VoiceResponseType,
    private level: VoiceConfigLevel,
    private userId: string,
    private cfg: Config,
    private isActive: boolean,
  ) {
    super();
    this.label = `${MODE_EMOJIS[mode]} ${mode}`;
    this.customId = buildModeButtonId({ mode, level, userId });
    this.style = isActive ? ButtonStyle.Primary : ButtonStyle.Secondary;
  }

  async run(interaction: ButtonInteraction, data: ComponentData) {
    const parsed = parseModeButtonData(data);
    if (!parsed) {
      await interaction.update({
        content: "❌ Invalid button data.",
        components: [],
      });
      return;
    }

    // Verify user
    if (interaction.user?.id !== parsed.userId) {
      await interaction.acknowledge();
      return;
    }

    const context: VoiceConfigContext = {
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
      userId: interaction.user?.id,
    };

    try {
      setVoiceResponseType(this.cfg, parsed.level, parsed.mode, context);
      await writeConfigFile(this.cfg);

      // Rebuild dashboard with updated state
      const dashboard = buildVoiceDashboard({
        cfg: this.cfg,
        context,
        userId: parsed.userId,
        level: parsed.level,
      });

      await interaction.update({
        content: dashboard.content,
        components: dashboard.components,
      });
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error";
      await interaction.update({
        content: `❌ Failed to update: ${errorMsg}`,
        components: [],
      });
    }
  }
}

/**
 * Level selection button
 */
class LevelSelectButton extends Button {
  label: string;
  customId: string;
  style: ButtonStyle;

  constructor(
    private level: VoiceConfigLevel,
    private userId: string,
    private cfg: Config,
    private isActive: boolean,
  ) {
    super();

    const labels: Record<VoiceConfigLevel, string> = {
      user: "👤 Personal",
      channel: "💬 Channel",
      guild: "🏰 Server",
      global: "🌍 Global",
    };

    this.label = labels[level];
    this.customId = `voice-level:level=${level};user=${userId}`;
    this.style = isActive ? ButtonStyle.Success : ButtonStyle.Secondary;
  }

  async run(interaction: ButtonInteraction) {
    const context: VoiceConfigContext = {
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
      userId: interaction.user?.id,
    };

    // Rebuild dashboard for selected level
    const dashboard = buildVoiceDashboard({
      cfg: this.cfg,
      context,
      userId: this.userId,
      level: this.level,
    });

    await interaction.update({
      content: dashboard.content,
      components: dashboard.components,
    });
  }
}

/**
 * Build voice configuration dashboard
 */
function buildVoiceDashboard(params: {
  cfg: Config;
  context: VoiceConfigContext;
  userId: string;
  level: VoiceConfigLevel;
}): { content: string; components: Row<Button>[] } {
  const { cfg, context, userId, level } = params;

  // Get current configuration
  const currentMode = getVoiceResponseType(cfg, context);
  const configs = getActiveVoiceConfigs(cfg);

  // Determine active mode for this level
  let activeMode: VoiceResponseType | undefined;
  switch (level) {
    case "user":
      activeMode = context.userId ? configs.users[context.userId] : undefined;
      break;
    case "channel":
      activeMode = context.channelId
        ? configs.channels[context.channelId]
        : undefined;
      break;
    case "guild":
      activeMode = context.guildId ? configs.guilds[context.guildId] : undefined;
      break;
    case "global":
      activeMode = configs.global;
      break;
  }

  // Build status message
  const levelNames: Record<VoiceConfigLevel, string> = {
    user: "Personal",
    channel: "Channel",
    guild: "Server",
    global: "Global Default",
  };

  const content = [
    "**🎤 Voice Configuration Dashboard**",
    "",
    `**Current Mode (${levelNames[level]}):** ${activeMode ? `${MODE_EMOJIS[activeMode]} \`${activeMode}\`` : "Not set"}`,
    `**Effective Mode (This Context):** ${currentMode ? `${MODE_EMOJIS[currentMode]} \`${currentMode}\`` : "Not configured"}`,
    "",
    "**Select a mode below:**",
  ].join("\n");

  // Build mode selection buttons
  const modes: VoiceResponseType[] = ["match", "voice", "text", "both"];
  const modeButtons = modes.map(
    (mode) =>
      new VoiceModeButton(mode, level, userId, cfg, mode === activeMode),
  );

  // Build level selection buttons
  const levels: VoiceConfigLevel[] = ["user", "channel", "guild", "global"];
  const levelButtons = levels.map(
    (lvl) => new LevelSelectButton(lvl, userId, cfg, lvl === level),
  );

  // Organize into rows
  const components: Row<Button>[] = [
    new Row(levelButtons), // Level selection
    new Row(modeButtons.slice(0, 2)), // match, voice
    new Row(modeButtons.slice(2, 4)), // text, both
  ];

  return { content, components };
}

/**
 * /voice-config-dashboard - Open interactive configuration
 */
export class VoiceConfigDashboardCommand extends Command {
  name = "voice-config-dashboard";
  description = "Open interactive voice configuration dashboard";
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

    const userId = interaction.user?.id ?? "";

    const dashboard = buildVoiceDashboard({
      cfg: this.cfg,
      context,
      userId,
      level: "user", // Start with user level
    });

    await interaction.reply({
      content: dashboard.content,
      components: dashboard.components,
      ephemeral: true,
    });
  }
}

/**
 * Voice configuration statistics
 */
interface VoiceConfigStats {
  totalUsers: number;
  totalChannels: number;
  totalGuilds: number;
  modeDistribution: Record<VoiceResponseType, number>;
  mostPopularMode: VoiceResponseType;
}

/**
 * Calculate voice configuration statistics
 */
export function calculateVoiceStats(cfg: Config): VoiceConfigStats {
  const configs = getActiveVoiceConfigs(cfg);

  const distribution: Record<VoiceResponseType, number> = {
    voice: 0,
    text: 0,
    both: 0,
    match: 0,
  };

  // Count global
  distribution[configs.global]++;

  // Count guilds
  for (const mode of Object.values(configs.guilds)) {
    distribution[mode]++;
  }

  // Count channels
  for (const mode of Object.values(configs.channels)) {
    distribution[mode]++;
  }

  // Count users
  for (const mode of Object.values(configs.users)) {
    distribution[mode]++;
  }

  // Find most popular mode
  let mostPopular: VoiceResponseType = "match";
  let maxCount = 0;
  for (const [mode, count] of Object.entries(distribution)) {
    if (count > maxCount) {
      maxCount = count;
      mostPopular = mode as VoiceResponseType;
    }
  }

  return {
    totalUsers: Object.keys(configs.users).length,
    totalChannels: Object.keys(configs.channels).length,
    totalGuilds: Object.keys(configs.guilds).length,
    modeDistribution: distribution,
    mostPopularMode: mostPopular,
  };
}

/**
 * Voice statistics command
 */
export class VoiceConfigStatsCommand extends Command {
  name = "voice-config-stats";
  description = "Show voice configuration statistics";
  defer = true;
  ephemeral = true;

  constructor(private cfg: Config) {
    super();
  }

  async run(interaction: CommandInteraction) {
    const stats = calculateVoiceStats(this.cfg);

    const fields: Array<{ name: string; value: string }> = [
      {
        name: "📊 Overview",
        value: [
          `**Servers:** ${stats.totalGuilds}`,
          `**Channels:** ${stats.totalChannels}`,
          `**Users:** ${stats.totalUsers}`,
        ].join("\n"),
      },
      {
        name: "🎯 Mode Distribution",
        value: Object.entries(stats.modeDistribution)
          .map(
            ([mode, count]) =>
              `${MODE_EMOJIS[mode as VoiceResponseType]} \`${mode}\`: ${count}`,
          )
          .join("\n"),
      },
      {
        name: "⭐ Most Popular",
        value: `${MODE_EMOJIS[stats.mostPopularMode]} \`${stats.mostPopularMode}\``,
      },
    ];

    const content = [
      "**📈 Voice Configuration Statistics**",
      "",
      ...fields.map((f) => `**${f.name}**\n${f.value}`),
    ].join("\n\n");

    await interaction.reply({ content, ephemeral: true });
  }
}

/**
 * Create voice dashboard command instances
 */
export function createVoiceDashboardCommands(cfg: Config): Command[] {
  return [
    new VoiceConfigDashboardCommand(cfg),
    new VoiceConfigStatsCommand(cfg),
  ];
}
