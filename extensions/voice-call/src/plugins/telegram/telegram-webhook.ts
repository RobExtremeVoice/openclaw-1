/**
 * Telegram Calls Provider Plugin - Webhook Verification
 *
 * Handles webhook parsing, signature verification, and call state tracking
 * for Telegram group call events.
 *
 * NOTE: Telegram Bot API doesn't provide real-time group call state through webhooks.
 * This module handles general chat updates, but group call state requires polling
 * the Telegram API or using TDLib for direct client access.
 */

import { createHmac } from "node:crypto";
import type { WebhookContext, WebhookVerificationResult } from "../../types.js";

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify Telegram webhook request
 *
 * Telegram Bot API webhooks are authenticated through:
 * 1. HTTPS connection (enforced)
 * 2. Optional secret token in X-Telegram-Bot-Api-Secret-Token header
 *
 * Note: Telegram doesn't use HMAC signatures like Twilio.
 * Security relies on the secret token sent with each webhook request.
 */
export interface VerifyTelegramWebhookInput {
  ctx: WebhookContext;
  botToken: string;
}

export function verifyTelegramWebhook(
  input: VerifyTelegramWebhookInput,
): WebhookVerificationResult {
  const { ctx, botToken } = input;

  // Validate HTTP method
  if (ctx.method !== "POST") {
    return {
      ok: false,
      reason: "Only POST requests are supported",
    };
  }

  // Validate HTTPS (Telegram requirement)
  if (ctx.url && !ctx.url.startsWith("https://")) {
    return {
      ok: false,
      reason: "Webhooks must use HTTPS",
    };
  }

  // Validate Content-Type
  const contentType = ctx.headers["content-type"];
  if (!contentType || !contentType.toString().includes("application/json")) {
    return {
      ok: false,
      reason: "Content-Type must be application/json",
    };
  }

  // Optional: Verify secret token if configured
  const secretToken = ctx.headers["x-telegram-bot-api-secret-token"];
  if (secretToken) {
    const expectedToken = generateSecretToken(botToken);
    if (secretToken !== expectedToken) {
      return {
        ok: false,
        reason: "Invalid secret token",
      };
    }
  }

  return { ok: true };
}

/**
 * Generate Telegram secret token from bot token
 *
 * Telegram provides a way to set a secret token when configuring webhooks.
 * This function derives a consistent token from the bot token for validation.
 */
function generateSecretToken(botToken: string): string {
  // Use HMAC-SHA256 of bot token for secret
  const hmac = createHmac("sha256", botToken);
  hmac.update("telegram-webhook");
  return hmac.digest("hex").substring(0, 32);
}

// ============================================================================
// Call State Tracking
// ============================================================================

/**
 * Telegram group call join/leave events
 */
export interface GroupCallMemberStatusUpdate {
  type: "user_joined" | "user_left";
  userId: number;
  userName: string;
  timestamp: number;
}

/**
 * Telegram group call state update
 */
export interface GroupCallStateUpdate {
  type: "call_started" | "call_ended" | "participant_activity";
  groupCallId: number;
  chatId: number;
  participantCount: number;
  recordingStarted: boolean;
  timestamp: number;
  memberStatus?: GroupCallMemberStatusUpdate;
}

/**
 * Parse Telegram chat_member update for group call events
 *
 * LIMITATION: Telegram Bot API sends chat_member updates for bot status changes,
 * but does not send real-time updates for user group call join/leave events.
 *
 * To track group call participant changes, we would need:
 * 1. Poll getGroupCallParticipants periodically
 * 2. Use TDLib for direct client access (more complex)
 * 3. Implement client-side tracking in the UI
 */
export function parseChatMemberUpdate(
  update: Record<string, unknown>,
): GroupCallMemberStatusUpdate | null {
  const chatMember = update.chat_member as Record<string, unknown>;
  if (!chatMember) {
    return null;
  }

  const user = chatMember.user as Record<string, unknown>;
  const newStatus = chatMember.new_chat_member?.status;
  const oldStatus = chatMember.old_chat_member?.status;

  // Detect join/leave from status change
  if (
    oldStatus === "left" &&
    (newStatus === "member" || newStatus === "restricted")
  ) {
    return {
      type: "user_joined",
      userId: (user.id as number) || 0,
      userName:
        `${(user.first_name as string) || ""} ${(user.last_name as string) || ""}`.trim() ||
        `User ${(user.id as number)}`,
      timestamp: Date.now(),
    };
  }

  if (
    oldStatus !== "left" &&
    (newStatus === "left" || newStatus === "kicked")
  ) {
    return {
      type: "user_left",
      userId: (user.id as number) || 0,
      userName:
        `${(user.first_name as string) || ""} ${(user.last_name as string) || ""}`.trim() ||
        `User ${(user.id as number)}`,
      timestamp: Date.now(),
    };
  }

  return null;
}

// ============================================================================
// Participant Management
// ============================================================================

/**
 * Track group call participants
 *
 * NOTE: This is a local cache since Telegram Bot API doesn't provide
 * real-time participant updates through webhooks.
 */
export class GroupCallParticipantTracker {
  private participants: Map<number, { name: string; joinedAt: number }> =
    new Map();

  /**
   * Add or update participant
   */
  addParticipant(userId: number, name: string): void {
    if (!this.participants.has(userId)) {
      this.participants.set(userId, { name, joinedAt: Date.now() });
    }
  }

  /**
   * Remove participant
   */
  removeParticipant(userId: number): void {
    this.participants.delete(userId);
  }

  /**
   * Get all current participants
   */
  getParticipants(): Array<{
    userId: number;
    name: string;
    joinedAt: number;
    durationSeconds: number;
  }> {
    const now = Date.now();
    return Array.from(this.participants.entries()).map(
      ([userId, { name, joinedAt }]) => ({
        userId,
        name,
        joinedAt,
        durationSeconds: Math.floor((now - joinedAt) / 1000),
      }),
    );
  }

  /**
   * Get participant count
   */
  getParticipantCount(): number {
    return this.participants.size;
  }

  /**
   * Clear all participants
   */
  clear(): void {
    this.participants.clear();
  }
}

// ============================================================================
// Event Normalization Helpers
// ============================================================================

/**
 * Extract group ID from Telegram update
 */
export function extractGroupIdFromUpdate(
  update: Record<string, unknown>,
): number | null {
  // Try different update types
  const message = update.message as Record<string, unknown>;
  if (message?.chat) {
    const chat = message.chat as Record<string, unknown>;
    return (chat.id as number) || null;
  }

  const chatMember = update.chat_member as Record<string, unknown>;
  if (chatMember?.chat) {
    const chat = chatMember.chat as Record<string, unknown>;
    return (chat.id as number) || null;
  }

  return null;
}

/**
 * Extract user info from Telegram update
 */
export function extractUserFromUpdate(
  update: Record<string, unknown>,
): { userId: number; username?: string; displayName: string } | null {
  let user: Record<string, unknown> | null = null;

  // Try to find user in different locations
  if (update.message) {
    const msg = update.message as Record<string, unknown>;
    user = (msg.from as Record<string, unknown>) || null;
  } else if (update.chat_member) {
    const cm = update.chat_member as Record<string, unknown>;
    user = (cm.user as Record<string, unknown>) || null;
  }

  if (!user) {
    return null;
  }

  return {
    userId: (user.id as number) || 0,
    username: (user.username as string) || undefined,
    displayName:
      `${(user.first_name as string) || ""} ${(user.last_name as string) || ""}`.trim() ||
      `User ${(user.id as number)}`,
  };
}

/**
 * Check if update is from a group/supergroup/channel
 */
export function isGroupUpdate(update: Record<string, unknown>): boolean {
  const message = update.message as Record<string, unknown>;
  if (message) {
    const chat = message.chat as Record<string, unknown>;
    const chatType = chat.type as string;
    return (
      chatType === "group" ||
      chatType === "supergroup" ||
      chatType === "channel"
    );
  }

  const chatMember = update.chat_member as Record<string, unknown>;
  if (chatMember) {
    const chat = chatMember.chat as Record<string, unknown>;
    const chatType = chat.type as string;
    return (
      chatType === "group" ||
      chatType === "supergroup" ||
      chatType === "channel"
    );
  }

  return false;
}

// ============================================================================
// Polling Helpers (for real-time participant tracking)
// ============================================================================

/**
 * Options for polling group call state
 */
export interface GroupCallPollingOptions {
  intervalMs: number; // How often to poll (default 2000ms)
  maxRetries: number; // Max failed polls before giving up (default 5)
  timeout: number; // Timeout for each poll (default 10000ms)
}

/**
 * Poll group call participants (workaround for real-time updates)
 *
 * Since Telegram Bot API doesn't provide real-time participant updates,
 * this function polls the API periodically to track participant changes.
 *
 * LIMITATION: This is not efficient for large groups or frequent changes.
 * Consider using TDLib or alternative approaches for better real-time support.
 */
export async function* pollGroupCallParticipants(
  chatId: number,
  groupCallId: number,
  apiRequest: (
    method: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>,
  options: Partial<GroupCallPollingOptions> = {},
): AsyncGenerator<
  Array<{ userId: number; name: string; isSpeaking: boolean }>,
  void,
  unknown
> {
  const opts: GroupCallPollingOptions = {
    intervalMs: options.intervalMs || 2000,
    maxRetries: options.maxRetries || 5,
    timeout: options.timeout || 10000,
  };

  let retryCount = 0;
  let lastParticipants: Set<number> = new Set();

  while (retryCount < opts.maxRetries) {
    try {
      const participants = await apiRequest("getGroupCallParticipants", {
        chat_id: chatId,
        group_call_id: groupCallId,
      });

      retryCount = 0; // Reset retry count on success

      if (Array.isArray(participants)) {
        yield participants as Array<{
          userId: number;
          name: string;
          isSpeaking: boolean;
        }>;
      }

      // Wait before next poll
      await new Promise((resolve) =>
        setTimeout(resolve, opts.intervalMs),
      );
    } catch (error) {
      retryCount++;
      console.error(
        `[TelegramPlugin] Polling error (attempt ${retryCount}):`,
        error,
      );

      if (retryCount >= opts.maxRetries) {
        console.error(
          "[TelegramPlugin] Max polling retries exceeded, stopping",
        );
        break;
      }

      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, opts.intervalMs * retryCount),
      );
    }
  }
}
