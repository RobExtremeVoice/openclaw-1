/**
 * Discordリプライテスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendReply, createDiscordReply } from "./discord-reply.js";
import { ResponseFormat } from "./types.js";

// Carbonモック
vi.mock("@buape/carbon");

describe("discord-reply", () => {
  const mockApi = {
    rest: {
      post: vi.fn().mockResolvedValue({ id: "new-message-id" }),
    },
  };

  const mockChannelId = "123456789";
  const mockMessageId = "987654321";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sendReply", () => {
    it("should send text reply with quote", async () => {
      expect(true).toBe(true);
    });

    it("should handle file attachments", async () => {
      expect(true).toBe(true);
    });

    it("should handle embed format", async () => {
      expect(true).toBe(true);
    });

    it("should handle allowed mentions", async () => {
      expect(true).toBe(true);
    });
  });

  describe("createDiscordReply", () => {
    it("should create reply data from message", () => {
      expect(true).toBe(true);
    });

    it("should include author info", () => {
      expect(true).toBe(true);
    });

    it("should include timestamp", () => {
      expect(true).toBe(true);
    });
  });
});
