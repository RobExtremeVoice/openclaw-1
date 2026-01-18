/**
 * Tests for voice configuration storage
 */

import { describe, expect, it } from "vitest";
import type { ClawdbotConfig } from "../../config/config.js";
import {
  getActiveVoiceConfigs,
  getVoiceConfig,
  getVoiceResponseType,
  hasVoiceConfig,
  resetVoiceConfig,
  setVoiceResponseType,
  type VoiceConfigContext,
} from "./config-store.js";

describe("config-store", () => {
  describe("getVoiceConfig", () => {
    it("should return undefined when no voice config exists", () => {
      const cfg = {} as ClawdbotConfig;
      expect(getVoiceConfig(cfg)).toBeUndefined();
    });

    it("should return voice config when it exists", () => {
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

      const voiceConfig = getVoiceConfig(cfg);
      expect(voiceConfig).toBeDefined();
      expect(voiceConfig?.messageResponse).toBe("match");
    });
  });

  describe("getVoiceResponseType", () => {
    it("should return undefined when no config exists", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = { userId: "user1" };

      expect(getVoiceResponseType(cfg, context)).toBeUndefined();
    });

    it("should return global default when no overrides", () => {
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

      const context: VoiceConfigContext = { userId: "user1" };
      expect(getVoiceResponseType(cfg, context)).toBe("text");
    });

    it("should prioritize user override", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perGuildOverride: { guild1: "voice" },
              perChannelOverride: { channel1: "both" },
              perUserOverride: { user1: "match" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const context: VoiceConfigContext = {
        guildId: "guild1",
        channelId: "channel1",
        userId: "user1",
      };

      expect(getVoiceResponseType(cfg, context)).toBe("match");
    });

    it("should fall back to channel override when no user override", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perGuildOverride: { guild1: "voice" },
              perChannelOverride: { channel1: "both" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const context: VoiceConfigContext = {
        guildId: "guild1",
        channelId: "channel1",
        userId: "user1",
      };

      expect(getVoiceResponseType(cfg, context)).toBe("both");
    });

    it("should fall back to guild override when no channel override", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perGuildOverride: { guild1: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const context: VoiceConfigContext = {
        guildId: "guild1",
        channelId: "channel1",
        userId: "user1",
      };

      expect(getVoiceResponseType(cfg, context)).toBe("voice");
    });
  });

  describe("setVoiceResponseType", () => {
    it("should set global default", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = {};

      setVoiceResponseType(cfg, "global", "voice", context);

      expect(cfg.channels?.discord?.voice?.messageResponse).toBe("voice");
    });

    it("should set guild override", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = { guildId: "guild1" };

      setVoiceResponseType(cfg, "guild", "text", context);

      expect(cfg.channels?.discord?.voice?.perGuildOverride?.guild1).toBe(
        "text",
      );
    });

    it("should set channel override", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = { channelId: "channel1" };

      setVoiceResponseType(cfg, "channel", "both", context);

      expect(cfg.channels?.discord?.voice?.perChannelOverride?.channel1).toBe(
        "both",
      );
    });

    it("should set user override", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = { userId: "user1" };

      setVoiceResponseType(cfg, "user", "match", context);

      expect(cfg.channels?.discord?.voice?.perUserOverride?.user1).toBe(
        "match",
      );
    });

    it("should throw when guild ID missing for guild level", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = {};

      expect(() => setVoiceResponseType(cfg, "guild", "voice", context)).toThrow(
        "Guild ID required",
      );
    });

    it("should throw when channel ID missing for channel level", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = {};

      expect(() =>
        setVoiceResponseType(cfg, "channel", "voice", context),
      ).toThrow("Channel ID required");
    });

    it("should throw when user ID missing for user level", () => {
      const cfg = {} as ClawdbotConfig;
      const context: VoiceConfigContext = {};

      expect(() => setVoiceResponseType(cfg, "user", "voice", context)).toThrow(
        "User ID required",
      );
    });
  });

  describe("resetVoiceConfig", () => {
    it("should reset global to default", () => {
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

      const success = resetVoiceConfig(cfg, "global", {});

      expect(success).toBe(true);
      expect(cfg.channels?.discord?.voice?.messageResponse).toBe("match");
    });

    it("should remove guild override", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "match",
              perGuildOverride: { guild1: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const success = resetVoiceConfig(cfg, "guild", { guildId: "guild1" });

      expect(success).toBe(true);
      expect(cfg.channels?.discord?.voice?.perGuildOverride?.guild1).toBeUndefined();
    });

    it("should return false when no config to reset", () => {
      const cfg = {} as ClawdbotConfig;

      const success = resetVoiceConfig(cfg, "guild", { guildId: "guild1" });

      expect(success).toBe(false);
    });

    it("should return false when guild ID missing", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "match",
              perGuildOverride: { guild1: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const success = resetVoiceConfig(cfg, "guild", {});

      expect(success).toBe(false);
    });
  });

  describe("getActiveVoiceConfigs", () => {
    it("should return defaults when no config", () => {
      const cfg = {} as ClawdbotConfig;

      const configs = getActiveVoiceConfigs(cfg);

      expect(configs.global).toBe("match");
      expect(configs.guilds).toEqual({});
      expect(configs.channels).toEqual({});
      expect(configs.users).toEqual({});
    });

    it("should return all active configs", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "text",
              perGuildOverride: { guild1: "voice" },
              perChannelOverride: { channel1: "both" },
              perUserOverride: { user1: "match" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      const configs = getActiveVoiceConfigs(cfg);

      expect(configs.global).toBe("text");
      expect(configs.guilds).toEqual({ guild1: "voice" });
      expect(configs.channels).toEqual({ channel1: "both" });
      expect(configs.users).toEqual({ user1: "match" });
    });
  });

  describe("hasVoiceConfig", () => {
    it("should return true for global (always exists)", () => {
      const cfg = {} as ClawdbotConfig;

      expect(hasVoiceConfig(cfg, "global", {})).toBe(true);
    });

    it("should return true when guild config exists", () => {
      const cfg = {
        channels: {
          discord: {
            voice: {
              messageResponse: "match",
              perGuildOverride: { guild1: "voice" },
              voiceFormat: "mp3",
              audioQuality: "medium",
              enabled: true,
            },
          },
        },
      } as ClawdbotConfig;

      expect(hasVoiceConfig(cfg, "guild", { guildId: "guild1" })).toBe(true);
    });

    it("should return false when guild config does not exist", () => {
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

      expect(hasVoiceConfig(cfg, "guild", { guildId: "guild1" })).toBe(false);
    });

    it("should return false when no voice config exists", () => {
      const cfg = {} as ClawdbotConfig;

      expect(hasVoiceConfig(cfg, "channel", { channelId: "channel1" })).toBe(
        false,
      );
    });
  });
});
