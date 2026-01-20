/**
 * Bubble Service for Claude Code Sessions
 *
 * Provides a high-level interface for managing Telegram bubbles
 * using the standard Telegram send/edit functions.
 *
 * Features:
 * - Status bubble with live updates and Continue/Cancel buttons
 * - Message forwarding with emoji convention (🐶/💬/▸/✓)
 * - Runtime limit enforcement
 */

import { sendMessageTelegram, editMessageTelegram } from "../../telegram/send.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { formatBubbleMessage, buildBubbleKeyboard } from "./bubble-manager.js";
import type { SessionState, SessionEvent } from "./types.js";

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
  // Runtime limit tracking
  startedAt: number;
  runtimeLimitHours: number;
  isPaused: boolean;
  // Last forwarded event index (to avoid duplicates)
  lastForwardedEventIndex: number;
}

const activeBubbles = new Map<string, ActiveBubble>();

/**
 * Format a session event for Telegram message forwarding.
 * Uses emoji convention: 🐶 = user, 💬 = Claude, ▸ = tool start, ✓ = tool done
 */
function formatEventForForward(event: SessionEvent): string | null {
  switch (event.type) {
    case "user_message":
      if (event.text) {
        const truncated = event.text.length > 200 ? event.text.slice(0, 197) + "..." : event.text;
        return `🐶 ${truncated}`;
      }
      return null;

    case "assistant_message":
      if (event.text) {
        const truncated = event.text.length > 300 ? event.text.slice(0, 297) + "..." : event.text;
        return `💬 ${truncated}`;
      }
      return null;

    case "tool_use":
      const toolName = event.toolName ?? "tool";
      const input = event.toolInput ?? "";
      const filename = extractFilename(input);

      if (toolName.toLowerCase().includes("read")) {
        return `▸ Reading ${filename || "file"}`;
      }
      if (toolName.toLowerCase().includes("write")) {
        return `▸ Writing ${filename || "file"}`;
      }
      if (toolName.toLowerCase().includes("edit")) {
        return `▸ Editing ${filename || "file"}`;
      }
      if (toolName.toLowerCase().includes("bash")) {
        const cmd = input.split(/\s/)[0] || "command";
        return `▸ Running: ${cmd.slice(0, 20)}`;
      }
      if (toolName.toLowerCase().includes("grep")) {
        return `▸ Searching code`;
      }
      if (toolName.toLowerCase().includes("glob")) {
        return `▸ Finding files`;
      }
      if (toolName.toLowerCase().includes("task")) {
        return `▸ Running subagent`;
      }
      return `▸ ${toolName}`;

    case "tool_result":
      // Tool results are shown in recentActions, don't forward separately
      return null;

    default:
      return null;
  }
}

/**
 * Extract filename from tool input.
 */
function extractFilename(input: string): string {
  if (!input) return "";
  const match = input.match(/([a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+)/);
  if (match) {
    const filename = match[1];
    return filename.length > 25 ? filename.slice(0, 22) + "..." : filename;
  }
  return "";
}

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
  runtimeLimitHours?: number;
}): Promise<{ messageId: string } | null> {
  const {
    sessionId,
    chatId,
    threadId,
    accountId,
    resumeToken,
    state,
    runtimeLimitHours = 3.0,
  } = params;

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
      startedAt: Date.now(),
      runtimeLimitHours,
      isPaused: false,
      lastForwardedEventIndex: 0,
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

/**
 * Forward a session event to the chat as a message.
 * Uses emoji convention for visibility.
 */
export async function forwardEventToChat(params: {
  sessionId: string;
  event: SessionEvent;
  eventIndex: number;
}): Promise<boolean> {
  const { sessionId, event, eventIndex } = params;
  const bubble = activeBubbles.get(sessionId);

  if (!bubble) {
    return false;
  }

  // Avoid duplicate forwards
  if (eventIndex <= bubble.lastForwardedEventIndex) {
    return false;
  }

  // Format the event
  const formatted = formatEventForForward(event);
  if (!formatted) {
    // Update index even if we don't forward (e.g., tool_result)
    bubble.lastForwardedEventIndex = eventIndex;
    return false;
  }

  try {
    await sendMessageTelegram(bubble.chatId, formatted, {
      accountId: bubble.accountId,
      messageThreadId: bubble.threadId,
    });
    bubble.lastForwardedEventIndex = eventIndex;
    return true;
  } catch (err) {
    log.warn(`[${sessionId}] Failed to forward event: ${err}`);
    return false;
  }
}

/**
 * Check if runtime limit has been exceeded.
 */
export function checkRuntimeLimit(sessionId: string): {
  exceeded: boolean;
  elapsedHours: number;
  limitHours: number;
} {
  const bubble = activeBubbles.get(sessionId);
  if (!bubble) {
    return { exceeded: false, elapsedHours: 0, limitHours: 0 };
  }

  const elapsedMs = Date.now() - bubble.startedAt;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  return {
    exceeded: elapsedHours >= bubble.runtimeLimitHours,
    elapsedHours,
    limitHours: bubble.runtimeLimitHours,
  };
}

/**
 * Pause the session (for runtime limit or manual pause).
 */
export function pauseSession(sessionId: string): void {
  const bubble = activeBubbles.get(sessionId);
  if (bubble) {
    bubble.isPaused = true;
  }
}

/**
 * Resume a paused session (resets runtime timer).
 */
export function resumeSession(sessionId: string): void {
  const bubble = activeBubbles.get(sessionId);
  if (bubble) {
    bubble.isPaused = false;
    bubble.startedAt = Date.now(); // Reset timer on resume
  }
}

/**
 * Check if session is paused.
 */
export function isSessionPaused(sessionId: string): boolean {
  const bubble = activeBubbles.get(sessionId);
  return bubble?.isPaused ?? false;
}

/**
 * Send a runtime limit warning to the chat.
 */
export async function sendRuntimeLimitWarning(params: {
  sessionId: string;
  elapsedHours: number;
  limitHours: number;
}): Promise<boolean> {
  const { sessionId, elapsedHours, limitHours } = params;
  const bubble = activeBubbles.get(sessionId);

  if (!bubble) {
    return false;
  }

  const text = [
    `**⏱ Runtime Limit Reached**`,
    ``,
    `Session has been running for ${elapsedHours.toFixed(1)}h (limit: ${limitHours}h).`,
    `Session paused. Use **Continue** to resume.`,
  ].join("\n");

  try {
    await sendMessageTelegram(bubble.chatId, text, {
      accountId: bubble.accountId,
      messageThreadId: bubble.threadId,
    });
    return true;
  } catch (err) {
    log.error(`[${sessionId}] Failed to send runtime warning: ${err}`);
    return false;
  }
}

/**
 * Send a question to the chat and wait for reply.
 */
export async function sendQuestionToChat(params: {
  sessionId: string;
  questionText: string;
}): Promise<boolean> {
  const { sessionId, questionText } = params;
  const bubble = activeBubbles.get(sessionId);

  if (!bubble) {
    return false;
  }

  const truncated = questionText.length > 500 ? questionText.slice(0, 497) + "..." : questionText;
  const text = [
    `**❓ Claude needs input:**`,
    ``,
    truncated,
    ``,
    `_Reply to this message to answer._`,
  ].join("\n");

  try {
    await sendMessageTelegram(bubble.chatId, text, {
      accountId: bubble.accountId,
      messageThreadId: bubble.threadId,
    });
    return true;
  } catch (err) {
    log.error(`[${sessionId}] Failed to send question: ${err}`);
    return false;
  }
}
