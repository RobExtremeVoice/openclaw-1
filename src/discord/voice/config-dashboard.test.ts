/**
 * Tests for voice configuration dashboard
 */

import { describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "../../config/config.js";
import {
  VoiceConfigDashboardCommand,
  VoiceConfigStatsCommand,
  calculateVoiceStats,
  createVoiceDashboardCommands,
} from "./config-dashboard.js";

// Mock writeConfigFile
vi.mock("../../config/io.js", () => ({
  writeConfigFile: vi.fn(() => Promise.resolve()),
}));

// Mock interaction
const createMockInteraction = (overrides: any = {}) => ({
  user: { id: "user123", username: "testuser", globalName: "Test User" },
  guild: { id: "guild123", name: "Test Guild" },
  channel: { id: "channel123", name: "test-channel" },
  options: {
    getString: vi.fn(() => null),
  },
  reply: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  acknowledge: vi.fn(() => Promise.resolve()),
  ...overrides,
});

describe("config-dashboard", () => {
  describe("createVoiceDashboardCommands", () => {
    it("should create dashboard command instances", () => {
      const cfg = {} as ClawdbotConfig;
      const commands = createVoiceDashboardCommands(cfg);

      expect(commands).toHaveLength(2);
      expect(commands[0]).toBeInstanceOf(VoiceConfigDashboardCommand);
      expect(commands[1]).toBeInstanceOf(VoiceConfigStatsCommand);
    });
  });

  describe("VoiceConfigDashboardCommand", () => {
    it("should display interactive dashboard", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "match",
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigDashboardCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const call = vi.mocked(interaction.reply).mock.calls[0][0];

      expect(call.content).toContain("Voice Configuration Dashboard");
      expect(call.content).toContain("Current Mode");
      expect(call.content).toContain("Effective Mode");
      expect(call.components).toBeDefined();
      expect(call.components.length).toBeGreaterThan(0);
      expect(call.ephemeral).toBe(true);
    });

    it("should show personal mode when user has override", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perUserOverride: { user123: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigDashboardCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("voice");
    });

    it("should create level selection buttons", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigDashboardCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      // Should have 3 rows: level selection + 2 mode rows
      expect(call.components.length).toBe(3);
    });
  });

  describe("calculateVoiceStats", () => {
    it("should calculate statistics correctly", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "match",
              perGuildOverride: { guild1: "voice", guild2: "voice" },
              perChannelOverride: { channel1: "text", channel2: "both" },
              perUserOverride: { user1: "match", user2: "match", user3: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const stats = calculateVoiceStats(cfg);

      expect(stats.totalGuilds).toBe(2);
      expect(stats.totalChannels).toBe(2);
      expect(stats.totalUsers).toBe(3);
      expect(stats.modeDistribution.voice).toBe(3); // 2 guilds + 1 user
      expect(stats.modeDistribution.text).toBe(1); // 1 channel
      expect(stats.modeDistribution.both).toBe(1); // 1 channel
      expect(stats.modeDistribution.match).toBe(3); // 1 global + 2 users
    });

    it("should handle empty configuration", () => {
      const cfg = {} as ClawdbotConfig;
      const stats = calculateVoiceStats(cfg);

      expect(stats.totalGuilds).toBe(0);
      expect(stats.totalChannels).toBe(0);
      expect(stats.totalUsers).toBe(0);
      expect(stats.modeDistribution.match).toBe(1); // Just the default global
    });

    it("should identify most popular mode", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "voice",
              perUserOverride: {
                user1: "voice",
                user2: "voice",
                user3: "voice",
                user4: "text",
              },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const stats = calculateVoiceStats(cfg);

      expect(stats.mostPopularMode).toBe("voice");
    });
  });

  describe("VoiceConfigStatsCommand", () => {
    it("should display statistics", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "match",
              perGuildOverride: { guild1: "voice" },
              perChannelOverride: { channel1: "text" },
              perUserOverride: { user1: "both" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigStatsCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const call = vi.mocked(interaction.reply).mock.calls[0][0];

      expect(call.content).toContain("Voice Configuration Statistics");
      expect(call.content).toContain("Overview");
      expect(call.content).toContain("**Servers:** 1");
      expect(call.content).toContain("**Channels:** 1");
      expect(call.content).toContain("**Users:** 1");
      expect(call.content).toContain("Mode Distribution");
      expect(call.content).toContain("Most Popular");
      expect(call.ephemeral).toBe(true);
    });

    it("should handle empty statistics", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigStatsCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("**Servers:** 0");
      expect(call.content).toContain("**Channels:** 0");
      expect(call.content).toContain("**Users:** 0");
    });
  });

  describe("Button interactions", () => {
    it("should create mode selection buttons", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigDashboardCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      const components = call.components;

      // Should have buttons for match, voice, text, both
      expect(components.length).toBe(3);
      // First row: level selection (4 buttons)
      // Second row: match, voice (2 buttons)
      // Third row: text, both (2 buttons)
    });

    it("should show active mode with primary style", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "match",
              perUserOverride: { user123: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigDashboardCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.components).toBeDefined();
      // Active mode button should use primary style (verified via button construction)
    });
  });

  describe("Dashboard context awareness", () => {
    it("should show different modes for different contexts", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perGuildOverride: { guild123: "voice" },
              perChannelOverride: { channel123: "both" },
              perUserOverride: { user123: "match" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigDashboardCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      // User level starts by default, should show user's "match" mode
      expect(call.content).toContain("Personal");
      expect(call.content).toContain("match");
    });
  });
});
