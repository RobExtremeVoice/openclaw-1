/**
 * Bubble Service for Claude Code Sessions
 *
 * Provides a high-level interface for managing Telegram bubbles
 * using the standard Telegram send/edit functions.
 */

import { sendMessageTelegram, editMessageTelegram } from "../../telegram/send.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { formatBubbleMessage, buildBubbleKeyboard } from "./bubble-manager.js";
import type { SessionState } from "./types.js";

const log = createSubsystemLogger("claude-code/bubble-service");

/**
 * Active bubble tracking.
 */
interface ActiveBubble {
  chatId: string;
  messageId: string;
  threadId?: number;
  resumeToken: string;
  lastUpdate: number;
  accountId?: string;
}

const activeBubbles = new Map<string, ActiveBubble>();

/**
 * Create a bubble for a Claude Code session.
 */
export async function createSessionBubble(params: {
  sessionId: string;
  chatId: string | number;
  threadId?: number;
  accountId?: string;
  resumeToken: string;
  state: SessionState;
}): Promise<{ messageId: string } | null> {
  const { sessionId, chatId, threadId, accountId, resumeToken, state } = params;

  const text = formatBubbleMessage(state);
  const keyboard = buildBubbleKeyboard(resumeToken, state, "claude");

  try {
    const result = await sendMessageTelegram(String(chatId), text, {
      accountId,
      messageThreadId: threadId,
      buttons: keyboard,
    });

    const bubble: ActiveBubble = {
      chatId: result.chatId,
      messageId: result.messageId,
      threadId,
      resumeToken,
      lastUpdate: Date.now(),
      accountId,
    };

    activeBubbles.set(sessionId, bubble);
    log.info(`[${sessionId}] Created bubble: ${result.messageId}`);

    return { messageId: result.messageId };
  } catch (err) {
    log.error(`[${sessionId}] Failed to create bubble: ${err}`);
    return null;
  }
}

/**
 * Update an existing bubble.
 */
export async function updateSessionBubble(params: {
  sessionId: string;
  state: SessionState;
}): Promise<boolean> {
  const { sessionId, state } = params;
  const bubble = activeBubbles.get(sessionId);

  if (!bubble) {
    log.warn(`[${sessionId}] No bubble to update`);
    return false;
  }

  // Throttle updates (min 2 seconds between edits)
  const now = Date.now();
  if (now - bubble.lastUpdate < 2000) {
    return true; // Skip this update
  }

  const text = formatBubbleMessage(state);
  const keyboard = buildBubbleKeyboard(bubble.resumeToken, state, "claude");

  try {
    await editMessageTelegram(bubble.chatId, bubble.messageId, text, {
      accountId: bubble.accountId,
      buttons: keyboard,
    });

    bubble.lastUpdate = now;
    log.debug(`[${sessionId}] Updated bubble`);
    return true;
  } catch (err) {
    log.warn(`[${sessionId}] Failed to update bubble: ${err}`);
    return false;
  }
}

/**
 * Mark a bubble as complete (remove buttons, show final state).
 */
export async function completeSessionBubble(params: {
  sessionId: string;
  state: SessionState;
  completedPhases?: string[];
}): Promise<boolean> {
  const { sessionId, state, completedPhases = [] } = params;
  const bubble = activeBubbles.get(sessionId);

  if (!bubble) {
    return false;
  }

  const lines: string[] = [];
  lines.push(`**Session Complete**`);
  lines.push("");
  lines.push(`**Project:** ${state.projectName}`);
  lines.push(`**Runtime:** ${state.runtimeStr}`);
  lines.push(`**Events:** ${state.totalEvents.toLocaleString()}`);

  if (completedPhases.length > 0) {
    lines.push("");
    lines.push("**Phases Completed:**");
    for (const phase of completedPhases) {
      lines.push(`- ${phase}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push(`ctx: ${state.projectName} @${state.branch}`);
  lines.push(`\`claude --resume ${state.resumeToken}\``);

  const text = lines.join("\n");

  try {
    await editMessageTelegram(bubble.chatId, bubble.messageId, text, {
      accountId: bubble.accountId,
      buttons: [], // Remove buttons
    });

    activeBubbles.delete(sessionId);
    log.info(`[${sessionId}] Completed bubble`);
    return true;
  } catch (err) {
    log.error(`[${sessionId}] Failed to complete bubble: ${err}`);
    activeBubbles.delete(sessionId);
    return false;
  }
}

/**
 * Get bubble for a session.
 */
export function getSessionBubble(sessionId: string): ActiveBubble | undefined {
  return activeBubbles.get(sessionId);
}

/**
 * Remove bubble tracking (without editing the message).
 */
export function removeSessionBubble(sessionId: string): void {
  activeBubbles.delete(sessionId);
}
