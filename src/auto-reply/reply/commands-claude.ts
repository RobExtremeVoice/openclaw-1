/**
 * Claude Code Command Handler
 *
 * Handles the /claude command for starting and managing Claude Code sessions.
 *
 * Usage:
 *   /claude juzi              - Start session in juzi project
 *   /claude juzi @experimental - Start in worktree
 *   /claude status            - Show active sessions
 *   /claude cancel <token>    - Cancel a session
 */

import { logVerbose } from "../../globals.js";
import {
  startSession,
  cancelSessionByToken,
  listSessions,
  getSessionState,
  getCompletedPhases,
} from "../../agents/claude-code/index.js";
import {
  createSessionBubble,
  updateSessionBubble,
  completeSessionBubble,
} from "../../agents/claude-code/bubble-service.js";
import type { CommandHandler } from "./commands-types.js";

/**
 * Parse /claude command arguments.
 */
function parseClaudeCommand(commandBody: string): {
  hasCommand: boolean;
  action?: "start" | "status" | "cancel" | "list";
  project?: string;
  token?: string;
} {
  const match = commandBody.match(/^\/claude(?:\s+(.*))?$/i);
  if (!match) return { hasCommand: false };

  const args = match[1]?.trim() ?? "";

  // /claude status
  if (args.toLowerCase() === "status" || args.toLowerCase() === "list") {
    return { hasCommand: true, action: "status" };
  }

  // /claude cancel <token>
  const cancelMatch = args.match(/^cancel\s+(\S+)/i);
  if (cancelMatch) {
    return { hasCommand: true, action: "cancel", token: cancelMatch[1] };
  }

  // /claude <project> [@worktree]
  if (args) {
    return { hasCommand: true, action: "start", project: args };
  }

  // /claude with no args shows help
  return { hasCommand: true, action: "status" };
}

/**
 * Format session list for display.
 */
function formatSessionList(): string {
  const sessions = listSessions();
  if (sessions.length === 0) {
    return "No active Claude Code sessions.";
  }

  const lines = ["**Active Claude Code Sessions:**", ""];
  for (const session of sessions) {
    const state = getSessionState(session);
    const tokenPrefix = session.resumeToken.slice(0, 8);
    lines.push(`- **${state.projectName}** (${tokenPrefix})`);
    lines.push(`  ${state.runtimeStr} · ${state.status}`);
  }

  return lines.join("\n");
}

export const handleClaudeCommand: CommandHandler = async (params, allowTextCommands) => {
  const parsed = parseClaudeCommand(params.command.commandBodyNormalized);
  if (!parsed.hasCommand) return null;

  // Only authorized senders can use /claude
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /claude from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  // Handle status/list
  if (parsed.action === "status") {
    return {
      shouldContinue: false,
      reply: { text: formatSessionList() },
    };
  }

  // Handle cancel
  if (parsed.action === "cancel" && parsed.token) {
    const success = cancelSessionByToken(parsed.token);
    if (success) {
      return {
        shouldContinue: false,
        reply: { text: `Cancelled session: ${parsed.token}` },
      };
    }
    return {
      shouldContinue: false,
      reply: { text: `Session not found: ${parsed.token}` },
    };
  }

  // Handle start
  if (parsed.action === "start" && parsed.project) {
    // Extract chat info for bubble creation
    const fromField = params.ctx.From ?? params.command.from ?? "";
    const chatIdMatch = fromField.match(/telegram:(?:group:)?(-?\d+)/);
    const chatId = chatIdMatch?.[1];
    const threadId =
      typeof params.ctx.MessageThreadId === "number"
        ? params.ctx.MessageThreadId
        : typeof params.ctx.MessageThreadId === "string"
          ? parseInt(params.ctx.MessageThreadId, 10)
          : undefined;
    const accountId = params.ctx.AccountId;
    const isTelegram = params.command.channel === "telegram" || params.ctx.Surface === "telegram";

    // Track session ID for bubble updates
    let sessionId: string | undefined;

    const result = await startSession({
      project: parsed.project,
      permissionMode: "bypassPermissions",
      onStateChange: async (state) => {
        if (!sessionId) return;

        // Update bubble on state changes
        if (
          state.status === "completed" ||
          state.status === "cancelled" ||
          state.status === "failed"
        ) {
          // Session ended - show completion message
          const completedPhases = getCompletedPhases(params.workspaceDir);
          await completeSessionBubble({
            sessionId,
            state,
            completedPhases,
          });
        } else {
          // Session running - update bubble
          await updateSessionBubble({ sessionId, state });
        }
      },
    });

    if (!result.success) {
      return {
        shouldContinue: false,
        reply: { text: `Failed to start session: ${result.error}` },
      };
    }

    sessionId = result.sessionId;

    // Create bubble for Telegram
    if (isTelegram && chatId && result.sessionId && result.resumeToken) {
      const session = listSessions().find((s) => s.id === result.sessionId);
      if (session) {
        const state = getSessionState(session);
        await createSessionBubble({
          sessionId: result.sessionId,
          chatId,
          threadId: Number.isFinite(threadId) ? threadId : undefined,
          accountId,
          resumeToken: result.resumeToken,
          state,
        });

        // Return minimal confirmation since bubble shows the status
        return {
          shouldContinue: false,
          reply: {
            text: `Starting Claude Code for **${parsed.project}**...`,
          },
        };
      }
    }

    // Fallback for non-Telegram or if bubble creation failed
    return {
      shouldContinue: false,
      reply: {
        text: `Started Claude Code session for **${parsed.project}**\nSession ID: ${result.sessionId}\nResume token: \`${result.resumeToken}\``,
      },
    };
  }

  // No valid action
  return {
    shouldContinue: false,
    reply: {
      text: [
        "**Claude Code Commands:**",
        "",
        "`/claude <project>` - Start a session",
        "`/claude <project> @<worktree>` - Start in worktree",
        "`/claude status` - Show active sessions",
        "`/claude cancel <token>` - Cancel a session",
      ].join("\n"),
    },
  };
};
