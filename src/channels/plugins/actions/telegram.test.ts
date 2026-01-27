import { describe, expect, it, vi } from "vitest";

import type { ClawdbotConfig } from "../../../config/config.js";
import { telegramMessageActions } from "./telegram.js";

const handleTelegramAction = vi.fn(async () => ({ ok: true }));

vi.mock("../../../agents/tools/telegram-actions.js", () => ({
  handleTelegramAction: (...args: unknown[]) => handleTelegramAction(...args),
}));

describe("telegramMessageActions", () => {
  it("excludes sticker actions when not enabled", () => {
    const cfg = { channels: { telegram: { botToken: "tok" } } } as ClawdbotConfig;
    const actions = telegramMessageActions.listActions({ cfg });
    expect(actions).not.toContain("sticker");
    expect(actions).not.toContain("sticker-search");
  });

  it("allows media-only sends and passes asVoice", async () => {
    handleTelegramAction.mockClear();
    const cfg = { channels: { telegram: { botToken: "tok" } } } as ClawdbotConfig;

    await telegramMessageActions.handleAction({
      action: "send",
      params: {
        to: "123",
        media: "https://example.com/voice.ogg",
        asVoice: true,
      },
      cfg,
      accountId: undefined,
    });

    expect(handleTelegramAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sendMessage",
        to: "123",
        content: "",
        mediaUrl: "https://example.com/voice.ogg",
        asVoice: true,
      }),
      cfg,
    );
  });

  it("passes silent flag for silent sends", async () => {
    handleTelegramAction.mockClear();
    const cfg = { channels: { telegram: { botToken: "tok" } } } as ClawdbotConfig;

    await telegramMessageActions.handleAction({
      action: "send",
      params: {
        to: "456",
        message: "Silent notification test",
        silent: true,
      },
      cfg,
      accountId: undefined,
    });

    expect(handleTelegramAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sendMessage",
        to: "456",
        content: "Silent notification test",
        silent: true,
      }),
      cfg,
    );
  });

  it("maps edit action params into editMessage", async () => {
    handleTelegramAction.mockClear();
    const cfg = { channels: { telegram: { botToken: "tok" } } } as ClawdbotConfig;

    await telegramMessageActions.handleAction({
      action: "edit",
      params: {
        chatId: "123",
        messageId: 42,
        message: "Updated",
        buttons: [],
      },
      cfg,
      accountId: undefined,
    });

    expect(handleTelegramAction).toHaveBeenCalledWith(
      {
        action: "editMessage",
        chatId: "123",
        messageId: 42,
        content: "Updated",
        buttons: [],
        accountId: undefined,
      },
      cfg,
    );
  });

  it("rejects non-integer messageId for edit before reaching telegram-actions", async () => {
    handleTelegramAction.mockClear();
    const cfg = { channels: { telegram: { botToken: "tok" } } } as ClawdbotConfig;

    await expect(
      telegramMessageActions.handleAction({
        action: "edit",
        params: {
          chatId: "123",
          messageId: "nope",
          message: "Updated",
        },
        cfg,
        accountId: undefined,
      }),
    ).rejects.toThrow();

    expect(handleTelegramAction).not.toHaveBeenCalled();
  });

  it("excludes forum topic actions when not enabled", () => {
    const cfg = { channels: { telegram: { botToken: "tok" } } } as ClawdbotConfig;
    const actions = telegramMessageActions.listActions({ cfg });
    expect(actions).not.toContain("thread-create");
    expect(actions).not.toContain("thread-edit");
    expect(actions).not.toContain("thread-close");
    expect(actions).not.toContain("thread-reopen");
    expect(actions).not.toContain("thread-delete");
  });

  it("includes forum topic actions when forumTopics is enabled", () => {
    const cfg = {
      channels: { telegram: { botToken: "tok", actions: { forumTopics: true } } },
    } as ClawdbotConfig;
    const actions = telegramMessageActions.listActions({ cfg });
    expect(actions).toContain("thread-create");
    expect(actions).toContain("thread-edit");
    expect(actions).toContain("thread-close");
    expect(actions).toContain("thread-reopen");
    expect(actions).toContain("thread-delete");
  });

  it("maps thread-create action to createForumTopic", async () => {
    handleTelegramAction.mockClear();
    const cfg = {
      channels: { telegram: { botToken: "tok", actions: { forumTopics: true } } },
    } as ClawdbotConfig;

    await telegramMessageActions.handleAction({
      action: "thread-create",
      params: {
        target: "-1001234567890",
        threadName: "Test Topic",
        iconColor: 7322096,
      },
      cfg,
      accountId: undefined,
    });

    expect(handleTelegramAction).toHaveBeenCalledWith(
      {
        action: "createForumTopic",
        chatId: "-1001234567890",
        name: "Test Topic",
        iconColor: 7322096,
        iconCustomEmojiId: undefined,
        accountId: undefined,
      },
      cfg,
    );
  });

  it("maps thread-close action to closeForumTopic", async () => {
    handleTelegramAction.mockClear();
    const cfg = {
      channels: { telegram: { botToken: "tok", actions: { forumTopics: true } } },
    } as ClawdbotConfig;

    await telegramMessageActions.handleAction({
      action: "thread-close",
      params: {
        target: "-1001234567890",
        threadId: 42,
      },
      cfg,
      accountId: undefined,
    });

    expect(handleTelegramAction).toHaveBeenCalledWith(
      {
        action: "closeForumTopic",
        chatId: "-1001234567890",
        messageThreadId: 42,
        accountId: undefined,
      },
      cfg,
    );
  });
});
