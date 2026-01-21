/**
 * Bubble Manager for Claude Code Sessions
 *
 * Manages Telegram status bubble messages with:
 * - Real-time status updates
 * - Inline keyboard buttons (Continue, Cancel)
 * - Message editing for progress updates
 *
 * Bubble format:
 * ```
 * **juzi @experimental**
 * 0h 12m · Phase 3 in progress
 *
 * ✓ Read src/config.ts
 * ✓ Edited src/auth.ts
 * ▸ Running tests
 *
 * [Continue] [Cancel]
 * ```
 */

import type { Bot } from "grammy";
import type { SessionState } from "./types.js";
import { getLatestDyDoCommand } from "./orchestrator.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("claude-code/bubble");

/**
 * Takopi-style markup constants.
 * CLEAR_MARKUP removes all buttons when session ends/cancels.
 */
export const CLEAR_MARKUP = { inline_keyboard: [] as never[] };

/**
 * Check if status indicates a final state (no buttons needed).
 */
export function isFinalStatus(status: string): boolean {
  return (
    status === "completed" || status === "cancelled" || status === "failed" || status === "done"
  );
}

/**
 * Get appropriate markup based on status.
 * Returns CLEAR_MARKUP for final states, undefined otherwise (let caller build keyboard).
 */
export function getMarkupForStatus(status: string): typeof CLEAR_MARKUP | undefined {
  return isFinalStatus(status) ? CLEAR_MARKUP : undefined;
}

/**
 * Options for creating a bubble.
 */
export interface BubbleOptions {
  /** Telegram chat ID */
  chatId: string | number;

  /** Thread/topic ID (for supergroups with topics) */
  threadId?: number;

  /** Telegram bot API instance */
  api: Bot["api"];

  /** Session resume token (for button callbacks) */
  resumeToken: string;

  /** Callback data prefix (default: "claude") */
  callbackPrefix?: string;
}

/**
 * Bubble instance for a session.
 */
export interface BubbleInstance {
  /** Telegram message ID */
  messageId: number;

  /** Chat ID */
  chatId: string | number;

  /** Thread ID if applicable */
  threadId?: number;

  /** Resume token */
  resumeToken: string;

  /** Last update time */
  lastUpdate: number;
}

/**
 * Registry of active bubbles by session ID.
 */
const activeBubbles = new Map<string, BubbleInstance>();

/**
 * Compact runtime format ("0h 5m" → "5m", "1h 30m" → "1h 30m").
 */
function compactRuntime(runtime: string): string {
  if (runtime.startsWith("0h ")) {
    return runtime.slice(3);
  }
  return runtime;
}

/**
 * Format session state into bubble message text (Takopi-style).
 *
 * Format:
 * ```
 * **working** · project · 45m
 *
 * - 🐶 DyDo: implement auth
 * - ▸ Reading file.ts
 * - ✓ Wrote config.json
 * - 💬 Claude: Done!
 *
 * ---
 * ctx: project @branch
 * `claude --resume token`
 * ```
 *
 * Icons:
 * - 🐶 = DyDo command (what DyDo sent to Claude Code)
 * - 💬 = Claude Code message
 * - ▸ = Active tool/action
 * - ✓ = Completed action
 */
export function formatBubbleMessage(state: SessionState): string {
  const lines: string[] = [];

  // Takopi-style header: "**status** · project · runtime"
  const status = state.isIdle ? "done" : "working";
  const runtime = compactRuntime(state.runtimeStr);
  lines.push(`**${status}** · ${state.projectName} · ${runtime}`);
  lines.push("");

  // Try to get latest DyDo command for this session
  const dydoCommand = state.resumeToken ? getLatestDyDoCommand(state.resumeToken) : undefined;

  if (state.isIdle) {
    // DONE STATE: Show DyDo's task and last Claude message
    if (dydoCommand) {
      lines.push(`🐶 ${dydoCommand}`);
      lines.push("");
    }

    const lastMessage = state.recentActions
      .slice()
      .reverse()
      .find((a) => a.icon === "💬");
    if (lastMessage) {
      const msg =
        lastMessage.description.length > 800
          ? lastMessage.description.slice(0, 800) + "..."
          : lastMessage.description;
      lines.push(`💬 ${msg}`);
    } else {
      lines.push("_(session complete)_");
    }
  } else {
    // WORKING STATE: Show DyDo's task and recent actions
    if (dydoCommand) {
      lines.push(`- 🐶 ${dydoCommand}`);
    }

    const actionsToShow = state.recentActions.slice(-6); // Show 6 to leave room for DyDo command
    if (actionsToShow.length > 0) {
      for (const action of actionsToShow) {
        lines.push(`- ${action.icon} ${action.description}`);
      }
    } else if (!dydoCommand) {
      lines.push("_(waiting for activity...)_");
    }
  }

  // Question indicator
  if (state.hasQuestion && state.questionText) {
    lines.push("");
    const questionPreview = state.questionText.slice(0, 100);
    lines.push(
      `**❓ Question:** ${questionPreview}${state.questionText.length > 100 ? "..." : ""}`,
    );
  }

  // Footer: context and resume command (must run from project dir)
  lines.push("");
  lines.push("---");
  // Don't duplicate branch if projectName already includes it (e.g., "juzi @experimental")
  const ctxLine = state.projectName.includes("@")
    ? `ctx: ${state.projectName}`
    : `ctx: ${state.projectName} @${state.branch}`;
  lines.push(ctxLine);
  lines.push(`\`claude --resume ${state.resumeToken}\``); // Full UUID required, run from project dir

  return lines.join("\n");
}

/**
 * Build inline keyboard for bubble (Takopi-style lowercase labels).
 *
 * Button states:
 * - working: [cancel] only - DyDo handles CC questions automatically
 * - done (idle): [continue] [cancel] - User gives next direction
 * - finished: no buttons
 *
 * Note: No "answer" button - DyDo intercepts and answers CC questions.
 */
export function buildBubbleKeyboard(
  resumeToken: string,
  state: SessionState,
  prefix: string = "claude",
): Array<Array<{ text: string; callback_data: string }>> {
  const tokenPrefix = resumeToken.slice(0, 8);

  // No buttons for finished sessions
  if (state.status === "completed" || state.status === "cancelled" || state.status === "failed") {
    return [];
  }

  // Done state (idle): [continue] [cancel]
  // User can continue or give new instructions by replying to bubble
  if (state.isIdle) {
    return [
      [
        { text: "continue", callback_data: `${prefix}:continue:${tokenPrefix}` },
        { text: "cancel", callback_data: `${prefix}:cancel:${tokenPrefix}` },
      ],
    ];
  }

  // Working state: [cancel] only
  // DyDo handles CC questions automatically - no "answer" button needed
  return [[{ text: "cancel", callback_data: `${prefix}:cancel:${tokenPrefix}` }]];
}

/**
 * Create a new bubble message.
 */
export async function createBubble(
  sessionId: string,
  state: SessionState,
  options: BubbleOptions,
): Promise<BubbleInstance | undefined> {
  const { chatId, threadId, api, resumeToken, callbackPrefix = "claude" } = options;

  const text = formatBubbleMessage(state);
  const keyboard = buildBubbleKeyboard(resumeToken, state, callbackPrefix);

  try {
    const result = await api.sendMessage(chatId, text, {
      message_thread_id: threadId,
      parse_mode: "Markdown",
      reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
    });

    const bubble: BubbleInstance = {
      messageId: result.message_id,
      chatId,
      threadId,
      resumeToken,
      lastUpdate: Date.now(),
    };

    activeBubbles.set(sessionId, bubble);
    log.info(`[${sessionId}] Created bubble: ${result.message_id}`);

    return bubble;
  } catch (err) {
    log.error(`[${sessionId}] Failed to create bubble: ${err}`);
    return undefined;
  }
}

/**
 * Update an existing bubble message.
 */
export async function updateBubble(
  sessionId: string,
  state: SessionState,
  api: Bot["api"],
  callbackPrefix: string = "claude",
): Promise<boolean> {
  const bubble = activeBubbles.get(sessionId);
  if (!bubble) {
    log.warn(`[${sessionId}] No bubble to update`);
    return false;
  }

  // Throttle updates (min 1 second between edits)
  const now = Date.now();
  if (now - bubble.lastUpdate < 1000) {
    return true; // Skip this update
  }

  const text = formatBubbleMessage(state);
  const keyboard = buildBubbleKeyboard(bubble.resumeToken, state, callbackPrefix);

  try {
    await api.editMessageText(bubble.chatId, bubble.messageId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
    });

    bubble.lastUpdate = now;
    log.debug(`[${sessionId}] Updated bubble`);
    return true;
  } catch (err) {
    // Telegram returns error if message content hasn't changed
    const errMsg = String(err);
    if (errMsg.includes("message is not modified")) {
      return true; // Not an error, just no change
    }
    log.warn(`[${sessionId}] Failed to update bubble: ${err}`);
    return false;
  }
}

/**
 * Delete a bubble message.
 */
export async function deleteBubble(sessionId: string, api: Bot["api"]): Promise<boolean> {
  const bubble = activeBubbles.get(sessionId);
  if (!bubble) {
    return false;
  }

  try {
    await api.deleteMessage(bubble.chatId, bubble.messageId);
    activeBubbles.delete(sessionId);
    log.info(`[${sessionId}] Deleted bubble`);
    return true;
  } catch (err) {
    log.warn(`[${sessionId}] Failed to delete bubble: ${err}`);
    activeBubbles.delete(sessionId);
    return false;
  }
}

/**
 * Get bubble for a session.
 */
export function getBubble(sessionId: string): BubbleInstance | undefined {
  return activeBubbles.get(sessionId);
}

/**
 * Get bubble by resume token prefix.
 */
export function getBubbleByToken(tokenPrefix: string): BubbleInstance | undefined {
  for (const bubble of activeBubbles.values()) {
    if (bubble.resumeToken.startsWith(tokenPrefix)) {
      return bubble;
    }
  }
  return undefined;
}

/**
 * Send a final completion message.
 */
export async function sendCompletionMessage(
  sessionId: string,
  state: SessionState,
  api: Bot["api"],
  completedPhases: string[] = [],
): Promise<boolean> {
  const bubble = activeBubbles.get(sessionId);
  if (!bubble) {
    return false;
  }

  const lines: string[] = [];

  // Header
  lines.push(`**Session Complete**`);
  lines.push("");
  lines.push(`**Project:** ${state.projectName}`);
  lines.push(`**Runtime:** ${state.runtimeStr}`);
  lines.push(`**Events:** ${state.totalEvents.toLocaleString()}`);

  // Completed phases
  if (completedPhases.length > 0) {
    lines.push("");
    lines.push("**Phases Completed:**");
    for (const phase of completedPhases) {
      lines.push(`- ${phase}`);
    }
  }

  // Resume info
  lines.push("");
  lines.push("---");
  // Don't duplicate branch if projectName already includes it
  const ctxLine = state.projectName.includes("@")
    ? `ctx: ${state.projectName}`
    : `ctx: ${state.projectName} @${state.branch}`;
  lines.push(ctxLine);
  lines.push(`\`claude --resume ${state.resumeToken}\``);

  const text = lines.join("\n");

  try {
    // Edit the bubble to show completion (no buttons)
    await api.editMessageText(bubble.chatId, bubble.messageId, text, {
      parse_mode: "Markdown",
    });

    activeBubbles.delete(sessionId);
    log.info(`[${sessionId}] Sent completion message`);
    return true;
  } catch (err) {
    log.error(`[${sessionId}] Failed to send completion message: ${err}`);
    return false;
  }
}

/**
 * BubbleManager class for managing a session's bubble.
 *
 * Usage:
 * ```typescript
 * const manager = new BubbleManager(api, chatId, threadId);
 * await manager.create(sessionId, state, resumeToken);
 *
 * // On state changes
 * await manager.update(state);
 *
 * // On completion
 * await manager.complete(state, completedPhases);
 * ```
 */
export class BubbleManager {
  private api: Bot["api"];
  private chatId: string | number;
  private threadId?: number;
  private sessionId?: string;
  private callbackPrefix: string;

  constructor(
    api: Bot["api"],
    chatId: string | number,
    threadId?: number,
    callbackPrefix: string = "claude",
  ) {
    this.api = api;
    this.chatId = chatId;
    this.threadId = threadId;
    this.callbackPrefix = callbackPrefix;
  }

  /**
   * Create a new bubble for a session.
   */
  async create(
    sessionId: string,
    state: SessionState,
    resumeToken: string,
  ): Promise<BubbleInstance | undefined> {
    this.sessionId = sessionId;
    return createBubble(sessionId, state, {
      chatId: this.chatId,
      threadId: this.threadId,
      api: this.api,
      resumeToken,
      callbackPrefix: this.callbackPrefix,
    });
  }

  /**
   * Update the bubble with new state.
   */
  async update(state: SessionState): Promise<boolean> {
    if (!this.sessionId) {
      return false;
    }
    return updateBubble(this.sessionId, state, this.api, this.callbackPrefix);
  }

  /**
   * Mark the session as complete.
   */
  async complete(state: SessionState, completedPhases: string[] = []): Promise<boolean> {
    if (!this.sessionId) {
      return false;
    }
    return sendCompletionMessage(this.sessionId, state, this.api, completedPhases);
  }

  /**
   * Delete the bubble.
   */
  async delete(): Promise<boolean> {
    if (!this.sessionId) {
      return false;
    }
    return deleteBubble(this.sessionId, this.api);
  }

  /**
   * Get the current bubble instance.
   */
  getBubble(): BubbleInstance | undefined {
    if (!this.sessionId) {
      return undefined;
    }
    return getBubble(this.sessionId);
  }
}
