/**
 * Tests for voice configuration slash commands
 */

import { describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "../../config/config.js";
import {
  VoiceConfigGetCommand,
  VoiceConfigResetCommand,
  VoiceConfigSetCommand,
  VoiceConfigStatusCommand,
  createVoiceConfigCommands,
} from "./config-commands.js";

// Mock writeConfigFile
vi.mock("../../config/io.js", () => ({
  writeConfigFile: vi.fn(() => Promise.resolve()),
}));

// Mock Carbon interaction types
const createMockInteraction = (overrides: any = {}) => {
  const optionValues: Record<string, string> = {
    mode: "voice",
    level: "user",
    ...(overrides.options ?? {}),
  };

  const baseInteraction = {
    user: overrides.user ?? { id: "user123", username: "testuser", globalName: "Test User" },
    guild: overrides.guild ?? { id: "guild123", name: "Test Guild" },
    channel: overrides.channel ?? { id: "channel123", name: "test-channel" },
    member: overrides.member ?? { permissions: "8" }, // Administrator permission
    options: {
      getString: vi.fn((name: string) => optionValues[name] ?? null),
    },
    reply: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    acknowledge: vi.fn(() => Promise.resolve()),
  };

  return baseInteraction;
};

describe("config-commands", () => {
  describe("createVoiceConfigCommands", () => {
    it("should create all command instances", () => {
      const cfg = {} as ClawdbotConfig;
      const commands = createVoiceConfigCommands(cfg);

      expect(commands).toHaveLength(4);
      expect(commands[0]).toBeInstanceOf(VoiceConfigGetCommand);
      expect(commands[1]).toBeInstanceOf(VoiceConfigSetCommand);
      expect(commands[2]).toBeInstanceOf(VoiceConfigResetCommand);
      expect(commands[3]).toBeInstanceOf(VoiceConfigStatusCommand);
    });
  });

  describe("VoiceConfigGetCommand", () => {
    it("should display current configuration", async () => {
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

      const command = new VoiceConfigGetCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("Voice Configuration");
      expect(call.content).toContain("match");
      expect(call.ephemeral).toBe(true);
    });

    it("should show guild override when present", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perGuildOverride: { guild123: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigGetCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("Server Override");
      expect(call.content).toContain("voice");
    });
  });

  describe("VoiceConfigSetCommand", () => {
    it("should set user-level configuration", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigSetCommand(cfg);

      const interaction = createMockInteraction({
        options: { mode: "voice", level: "user" },
      });

      await command.run(interaction as any);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("✅");
      expect(call.content).toContain("voice");
      expect(cfg.channels?.discord?.voice?.perUserOverride?.user123).toBe(
        "voice",
      );
    });

    it("should require administrator for guild-level changes", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigSetCommand(cfg);

      const interaction = createMockInteraction({
        options: { mode: "voice", level: "guild" },
        member: { permissions: "0" }, // No admin permission
      });

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("❌");
      expect(call.content).toContain("Administrator permission");
    });

    it("should reject invalid mode", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigSetCommand(cfg);

      const interaction = createMockInteraction({
        options: { mode: "invalid", level: "user" },
      });

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("❌");
      expect(call.content).toContain("Invalid mode");
    });

    it("should set channel-level configuration with admin permission", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigSetCommand(cfg);

      const interaction = createMockInteraction({
        options: { mode: "both", level: "channel" },
      });

      await command.run(interaction as any);

      expect(cfg.channels?.discord?.voice?.perChannelOverride?.channel123).toBe(
        "both",
      );
    });
  });

  describe("VoiceConfigResetCommand", () => {
    it("should reset user-level configuration", async () => {
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

      const command = new VoiceConfigResetCommand(cfg);
      const interaction = createMockInteraction({
        options: { level: "user" },
      });

      await command.run(interaction as any);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("✅");
      expect(cfg.channels?.discord?.voice?.perUserOverride?.user123).toBeUndefined();
    });

    it("should reset global to default", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigResetCommand(cfg);
      const interaction = createMockInteraction({
        options: { level: "global" },
      });

      await command.run(interaction as any);

      expect(cfg.channels?.discord?.voice?.messageResponse).toBe("match");
    });

    it("should report when no config to reset", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigResetCommand(cfg);

      const interaction = createMockInteraction({
        options: { level: "user" },
      });

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("ℹ️");
      expect(call.content).toContain("No");
    });
  });

  describe("VoiceConfigStatusCommand", () => {
    it("should display all active configurations", async () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perGuildOverride: { guild1: "voice", guild2: "both" },
              perChannelOverride: { channel1: "match" },
              perUserOverride: { user1: "voice", user2: "text" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const command = new VoiceConfigStatusCommand(cfg);
      const interaction = createMockInteraction();

      await command.run(interaction as any);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const call = vi.mocked(interaction.reply).mock.calls[0][0];

      expect(call.content).toContain("Configuration Status");
      expect(call.content).toContain("Global Default");
      expect(call.content).toContain("Server Overrides (2)");
      expect(call.content).toContain("Channel Overrides (1)");
      expect(call.content).toContain("User Overrides (2)");
    });

    it("should handle empty configuration", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigStatusCommand(cfg);

      const interaction = createMockInteraction();

      await command.run(interaction as any);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("match"); // Default global
    });
  });

  describe("Permission validation", () => {
    it("should allow user-level changes without admin", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigSetCommand(cfg);

      const interaction = createMockInteraction({
        options: { mode: "voice", level: "user" },
        member: { permissions: "0" }, // No permissions
      });

      await command.run(interaction as any);

      expect(cfg.channels?.discord?.voice?.perUserOverride?.user123).toBe(
        "voice",
      );
    });

    it("should block channel-level changes without admin", async () => {
      const cfg = {} as ClawdbotConfig;
      const command = new VoiceConfigSetCommand(cfg);

      const interaction = createMockInteraction({
        options: { mode: "voice", level: "channel" },
        member: { permissions: "0" },
      });

      await command.run(interaction as any);

      const call = vi.mocked(interaction.reply).mock.calls[0][0];
      expect(call.content).toContain("Administrator permission");
    });
  });
});
