/**
 * Telegram Forum Topic Management
 *
 * Functions for creating, editing, closing, reopening, and deleting
 * forum topics in Telegram supergroups.
 */

import type { ForumTopic } from "@grammyjs/types";
import { type ApiClientOptions, Bot } from "grammy";
import { loadConfig } from "../config/config.js";
import { logVerbose } from "../globals.js";
import { withTelegramApiErrorLogging } from "./api-logging.js";
import { formatErrorMessage } from "../infra/errors.js";
import type { RetryConfig } from "../infra/retry.js";
import { createTelegramRetryRunner } from "../infra/retry-policy.js";
import { type ResolvedTelegramAccount, resolveTelegramAccount } from "./accounts.js";
import { resolveTelegramFetch } from "./fetch.js";
import { makeProxyFetch } from "./proxy.js";
import { isRecoverableTelegramNetworkError } from "./network-errors.js";
import { stripTelegramInternalPrefixes } from "./targets.js";

type ForumTopicOpts = {
  token?: string;
  accountId?: string;
  verbose?: boolean;
  api?: Bot["api"];
  retry?: RetryConfig;
};

/**
 * Valid icon colors for Telegram forum topics.
 * These are the only colors supported by the Telegram API.
 */
export const FORUM_TOPIC_ICON_COLORS = [
  7322096, // Blue
  16766590, // Yellow
  13338331, // Violet
  9367192, // Green
  16749490, // Rose
  16478047, // Red
] as const;

export type ForumTopicIconColor = (typeof FORUM_TOPIC_ICON_COLORS)[number];

type CreateForumTopicOpts = ForumTopicOpts & {
  /** Color of the topic icon (one of Telegram's predefined colors: 7322096, 16766590, 13338331, 9367192, 16749490, 16478047) */
  iconColor?: number;
  /** Custom emoji identifier for the topic icon */
  iconCustomEmojiId?: string;
};

type EditForumTopicOpts = ForumTopicOpts & {
  /** New name for the topic (0-128 chars, can be empty for General topic) */
  name?: string;
  /** Custom emoji identifier for the topic icon; pass empty string to remove */
  iconCustomEmojiId?: string;
};

export type ForumTopicResult = {
  messageThreadId: number;
  name: string;
  iconColor?: number;
  iconCustomEmojiId?: string;
};

/**
 * Validates and casts a number to a valid forum topic icon color.
 * Returns undefined if the color is not one of the allowed values.
 */
function validateIconColor(color: number | undefined): ForumTopicIconColor | undefined {
  if (color == null) return undefined;
  if ((FORUM_TOPIC_ICON_COLORS as readonly number[]).includes(color)) {
    return color as ForumTopicIconColor;
  }
  return undefined;
}

function resolveTelegramClientOptions(
  account: ResolvedTelegramAccount,
): ApiClientOptions | undefined {
  const proxyUrl = account.config.proxy?.trim();
  const proxyFetch = proxyUrl ? makeProxyFetch(proxyUrl) : undefined;
  const fetchImpl = resolveTelegramFetch(proxyFetch, {
    network: account.config.network,
  });
  const timeoutSeconds =
    typeof account.config.timeoutSeconds === "number" &&
    Number.isFinite(account.config.timeoutSeconds)
      ? Math.max(1, Math.floor(account.config.timeoutSeconds))
      : undefined;
  return fetchImpl || timeoutSeconds
    ? {
        ...(fetchImpl ? { fetch: fetchImpl as unknown as ApiClientOptions["fetch"] } : {}),
        ...(timeoutSeconds ? { timeoutSeconds } : {}),
      }
    : undefined;
}

function resolveToken(explicit: string | undefined, params: { accountId: string; token: string }) {
  if (explicit?.trim()) return explicit.trim();
  if (!params.token) {
    throw new Error(
      `Telegram bot token missing for account "${params.accountId}" (set channels.telegram.accounts.${params.accountId}.botToken/tokenFile or TELEGRAM_BOT_TOKEN for default).`,
    );
  }
  return params.token.trim();
}

function normalizeChatId(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) throw new Error("Chat ID is required for forum topic operations");

  let normalized = stripTelegramInternalPrefixes(trimmed);

  // Accept t.me links for public chats
  const m =
    /^https?:\/\/t\.me\/([A-Za-z0-9_]+)$/i.exec(normalized) ??
    /^t\.me\/([A-Za-z0-9_]+)$/i.exec(normalized);
  if (m?.[1]) normalized = `@${m[1]}`;

  if (!normalized) throw new Error("Chat ID is required for forum topic operations");
  if (normalized.startsWith("@")) return normalized;
  if (/^-?\d+$/.test(normalized)) return normalized;

  // If the user passed a username without `@`, assume they meant a public chat
  if (/^[A-Za-z0-9_]{5,}$/i.test(normalized)) return `@${normalized}`;

  return normalized;
}

function wrapForumError(err: unknown, chatId: string, operation: string): Error {
  const errText = formatErrorMessage(err);

  if (/chat not found/i.test(errText)) {
    return new Error(
      `Telegram ${operation} failed: chat not found (chat_id=${chatId}). ` +
        "Ensure the bot is a member of the group with can_manage_topics permission.",
    );
  }

  if (/CHAT_NOT_MODIFIED/i.test(errText)) {
    return new Error(`Telegram ${operation} failed: topic not modified (no changes detected).`);
  }

  if (/TOPIC_NOT_MODIFIED/i.test(errText)) {
    return new Error(`Telegram ${operation} failed: topic not modified (no changes detected).`);
  }

  if (/not enough rights/i.test(errText) || /CHAT_ADMIN_REQUIRED/i.test(errText)) {
    return new Error(
      `Telegram ${operation} failed: bot needs administrator rights with can_manage_topics permission.`,
    );
  }

  if (/TOPIC_CLOSED/i.test(errText)) {
    return new Error(`Telegram ${operation} failed: topic is closed. Reopen it first.`);
  }

  if (/TOPIC_NOT_CLOSED/i.test(errText)) {
    return new Error(`Telegram ${operation} failed: topic is not closed.`);
  }

  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Create a new forum topic in a supergroup chat.
 * The bot must be an administrator with can_manage_topics permission.
 */
export async function createForumTopicTelegram(
  chatId: string,
  name: string,
  opts: CreateForumTopicOpts = {},
): Promise<ForumTopicResult> {
  if (!name?.trim()) {
    throw new Error("Topic name is required (1-128 characters)");
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 128) {
    throw new Error("Topic name must be 128 characters or less");
  }

  const cfg = loadConfig();
  const account = resolveTelegramAccount({
    cfg,
    accountId: opts.accountId,
  });
  const token = resolveToken(opts.token, account);
  const normalizedChatId = normalizeChatId(chatId);
  const client = resolveTelegramClientOptions(account);
  const api = opts.api ?? new Bot(token, client ? { client } : undefined).api;

  const request = createTelegramRetryRunner({
    retry: opts.retry,
    configRetry: account.config.retry,
    verbose: opts.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  const requestWithDiag = <T>(fn: () => Promise<T>, label?: string) =>
    withTelegramApiErrorLogging({
      operation: label ?? "request",
      fn: () => request(fn, label),
    });

  const other: { icon_color?: ForumTopicIconColor; icon_custom_emoji_id?: string } = {};
  if (opts.iconColor != null) {
    const validatedColor = validateIconColor(opts.iconColor);
    if (validatedColor != null) {
      other.icon_color = validatedColor;
    }
  }
  if (opts.iconCustomEmojiId != null) {
    other.icon_custom_emoji_id = opts.iconCustomEmojiId;
  }

  const result: ForumTopic = await requestWithDiag(
    () =>
      api.createForumTopic(
        normalizedChatId,
        trimmedName,
        Object.keys(other).length > 0 ? other : undefined,
      ),
    "createForumTopic",
  ).catch((err) => {
    throw wrapForumError(err, normalizedChatId, "createForumTopic");
  });

  logVerbose(
    `[telegram] Created forum topic "${trimmedName}" (thread_id=${result.message_thread_id}) in chat ${normalizedChatId}`,
  );

  return {
    messageThreadId: result.message_thread_id,
    name: result.name,
    iconColor: result.icon_color,
    iconCustomEmojiId: result.icon_custom_emoji_id,
  };
}

/**
 * Edit name and/or icon of a forum topic.
 * The bot must be an administrator with can_manage_topics permission.
 */
export async function editForumTopicTelegram(
  chatId: string,
  messageThreadId: number,
  opts: EditForumTopicOpts = {},
): Promise<{ ok: true }> {
  if (opts.name != null && opts.name.length > 128) {
    throw new Error("Topic name must be 128 characters or less");
  }

  const cfg = loadConfig();
  const account = resolveTelegramAccount({
    cfg,
    accountId: opts.accountId,
  });
  const token = resolveToken(opts.token, account);
  const normalizedChatId = normalizeChatId(chatId);
  const client = resolveTelegramClientOptions(account);
  const api = opts.api ?? new Bot(token, client ? { client } : undefined).api;

  const request = createTelegramRetryRunner({
    retry: opts.retry,
    configRetry: account.config.retry,
    verbose: opts.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  const requestWithDiag = <T>(fn: () => Promise<T>, label?: string) =>
    withTelegramApiErrorLogging({
      operation: label ?? "request",
      fn: () => request(fn, label),
    });

  const other: { name?: string; icon_custom_emoji_id?: string } = {};
  if (opts.name != null) {
    other.name = opts.name;
  }
  if (opts.iconCustomEmojiId != null) {
    other.icon_custom_emoji_id = opts.iconCustomEmojiId;
  }

  if (Object.keys(other).length === 0) {
    throw new Error("At least one of name or iconCustomEmojiId must be provided");
  }

  await requestWithDiag(
    () => api.editForumTopic(normalizedChatId, messageThreadId, other),
    "editForumTopic",
  ).catch((err) => {
    throw wrapForumError(err, normalizedChatId, "editForumTopic");
  });

  logVerbose(
    `[telegram] Edited forum topic (thread_id=${messageThreadId}) in chat ${normalizedChatId}`,
  );

  return { ok: true };
}

/**
 * Close a forum topic.
 * The bot must be an administrator with can_manage_topics permission.
 */
export async function closeForumTopicTelegram(
  chatId: string,
  messageThreadId: number,
  opts: ForumTopicOpts = {},
): Promise<{ ok: true }> {
  const cfg = loadConfig();
  const account = resolveTelegramAccount({
    cfg,
    accountId: opts.accountId,
  });
  const token = resolveToken(opts.token, account);
  const normalizedChatId = normalizeChatId(chatId);
  const client = resolveTelegramClientOptions(account);
  const api = opts.api ?? new Bot(token, client ? { client } : undefined).api;

  const request = createTelegramRetryRunner({
    retry: opts.retry,
    configRetry: account.config.retry,
    verbose: opts.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  const requestWithDiag = <T>(fn: () => Promise<T>, label?: string) =>
    withTelegramApiErrorLogging({
      operation: label ?? "request",
      fn: () => request(fn, label),
    });

  await requestWithDiag(
    () => api.closeForumTopic(normalizedChatId, messageThreadId),
    "closeForumTopic",
  ).catch((err) => {
    throw wrapForumError(err, normalizedChatId, "closeForumTopic");
  });

  logVerbose(
    `[telegram] Closed forum topic (thread_id=${messageThreadId}) in chat ${normalizedChatId}`,
  );

  return { ok: true };
}

/**
 * Reopen a closed forum topic.
 * The bot must be an administrator with can_manage_topics permission.
 */
export async function reopenForumTopicTelegram(
  chatId: string,
  messageThreadId: number,
  opts: ForumTopicOpts = {},
): Promise<{ ok: true }> {
  const cfg = loadConfig();
  const account = resolveTelegramAccount({
    cfg,
    accountId: opts.accountId,
  });
  const token = resolveToken(opts.token, account);
  const normalizedChatId = normalizeChatId(chatId);
  const client = resolveTelegramClientOptions(account);
  const api = opts.api ?? new Bot(token, client ? { client } : undefined).api;

  const request = createTelegramRetryRunner({
    retry: opts.retry,
    configRetry: account.config.retry,
    verbose: opts.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  const requestWithDiag = <T>(fn: () => Promise<T>, label?: string) =>
    withTelegramApiErrorLogging({
      operation: label ?? "request",
      fn: () => request(fn, label),
    });

  await requestWithDiag(
    () => api.reopenForumTopic(normalizedChatId, messageThreadId),
    "reopenForumTopic",
  ).catch((err) => {
    throw wrapForumError(err, normalizedChatId, "reopenForumTopic");
  });

  logVerbose(
    `[telegram] Reopened forum topic (thread_id=${messageThreadId}) in chat ${normalizedChatId}`,
  );

  return { ok: true };
}

/**
 * Delete a forum topic along with all its messages.
 * The bot must be an administrator with can_manage_topics permission.
 */
export async function deleteForumTopicTelegram(
  chatId: string,
  messageThreadId: number,
  opts: ForumTopicOpts = {},
): Promise<{ ok: true }> {
  const cfg = loadConfig();
  const account = resolveTelegramAccount({
    cfg,
    accountId: opts.accountId,
  });
  const token = resolveToken(opts.token, account);
  const normalizedChatId = normalizeChatId(chatId);
  const client = resolveTelegramClientOptions(account);
  const api = opts.api ?? new Bot(token, client ? { client } : undefined).api;

  const request = createTelegramRetryRunner({
    retry: opts.retry,
    configRetry: account.config.retry,
    verbose: opts.verbose,
    shouldRetry: (err) => isRecoverableTelegramNetworkError(err, { context: "send" }),
  });

  const requestWithDiag = <T>(fn: () => Promise<T>, label?: string) =>
    withTelegramApiErrorLogging({
      operation: label ?? "request",
      fn: () => request(fn, label),
    });

  await requestWithDiag(
    () => api.deleteForumTopic(normalizedChatId, messageThreadId),
    "deleteForumTopic",
  ).catch((err) => {
    throw wrapForumError(err, normalizedChatId, "deleteForumTopic");
  });

  logVerbose(
    `[telegram] Deleted forum topic (thread_id=${messageThreadId}) in chat ${normalizedChatId}`,
  );

  return { ok: true };
}
