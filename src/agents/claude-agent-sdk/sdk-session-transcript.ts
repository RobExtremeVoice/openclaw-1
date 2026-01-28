/**
 * Session transcript persistence for the Claude Agent SDK.
 *
 * Appends user/assistant turn pairs to the session JSONL file for
 * multi-turn continuity when using the SDK main-agent mode.
 */

import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("agents/claude-agent-sdk/sdk-session-transcript");

type TranscriptRole = "user" | "assistant";

function fileEndsWithNewline(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return true;
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(1);
      fs.readSync(fd, buffer, 0, 1, stat.size - 1);
      return buffer[0] === 0x0a;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return true;
  }
}

function appendJsonlLine(params: { filePath: string; value: unknown }) {
  fs.mkdirSync(path.dirname(params.filePath), { recursive: true });
  const prefix =
    fs.existsSync(params.filePath) && !fileEndsWithNewline(params.filePath) ? "\n" : "";
  fs.appendFileSync(params.filePath, `${prefix}${JSON.stringify(params.value)}\n`, "utf-8");
}

/**
 * Append a single text turn to the session transcript.
 */
export function appendSdkTextTurnToSessionTranscript(params: {
  sessionFile: string;
  role: TranscriptRole;
  text: string;
  timestamp?: number;
}): void {
  const trimmed = params.text.trim();
  if (!trimmed) return;

  try {
    appendJsonlLine({
      filePath: params.sessionFile,
      value: {
        role: params.role,
        content: [{ type: "text", text: trimmed }],
        timestamp: params.timestamp ?? Date.now(),
      },
    });
  } catch (err) {
    log.debug(`Failed to append transcript: ${String(err)}`);
  }
}

/**
 * Append a user/assistant turn pair to the session transcript.
 *
 * This enables multi-turn continuity for the SDK main-agent mode
 * by recording both the user prompt and assistant response.
 */
export function appendSdkTurnPairToSessionTranscript(params: {
  sessionFile: string;
  prompt: string;
  assistantText?: string;
  timestamp?: number;
}): void {
  const ts = params.timestamp ?? Date.now();
  appendSdkTextTurnToSessionTranscript({
    sessionFile: params.sessionFile,
    role: "user",
    text: params.prompt,
    timestamp: ts,
  });
  if (params.assistantText) {
    appendSdkTextTurnToSessionTranscript({
      sessionFile: params.sessionFile,
      role: "assistant",
      text: params.assistantText,
      timestamp: ts,
    });
  }
}

/**
 * A tracked tool call for session transcript recording.
 */
export type SdkToolCallRecord = {
  /** Tool call ID from the model. */
  toolCallId: string;
  /** Normalized tool name. */
  toolName: string;
  /** Tool input arguments. */
  args: Record<string, unknown>;
  /** Tool result (if completed). */
  result?: unknown;
  /** Whether the tool execution resulted in an error. */
  isError?: boolean;
};

/**
 * Append a tool use block to the session transcript.
 *
 * Records tool calls in a structured format matching the pi-agent session format.
 */
export function appendSdkToolUseToSessionTranscript(params: {
  sessionFile: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp?: number;
}): void {
  try {
    appendJsonlLine({
      filePath: params.sessionFile,
      value: {
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: params.toolCallId,
              name: params.toolName,
              input: params.args,
            },
          ],
          timestamp: params.timestamp ?? Date.now(),
        },
      },
    });
  } catch (err) {
    log.debug(`Failed to append tool use to transcript: ${String(err)}`);
  }
}

/**
 * Append a tool result block to the session transcript.
 *
 * Records tool results in a structured format matching the pi-agent session format.
 */
export function appendSdkToolResultToSessionTranscript(params: {
  sessionFile: string;
  toolCallId: string;
  result: unknown;
  isError?: boolean;
  timestamp?: number;
}): void {
  try {
    // Serialize result to text if it's an object.
    let resultContent: string;
    if (typeof params.result === "string") {
      resultContent = params.result;
    } else if (params.result !== undefined) {
      try {
        resultContent = JSON.stringify(params.result);
      } catch {
        resultContent = String(params.result);
      }
    } else {
      resultContent = "(no output)";
    }

    appendJsonlLine({
      filePath: params.sessionFile,
      value: {
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: params.toolCallId,
              content: resultContent,
              is_error: params.isError,
            },
          ],
          timestamp: params.timestamp ?? Date.now(),
        },
      },
    });
  } catch (err) {
    log.debug(`Failed to append tool result to transcript: ${String(err)}`);
  }
}

/**
 * Append multiple tool calls from a single run to the session transcript.
 *
 * This records completed tool calls with both the tool_use and tool_result
 * blocks for full transcript parity with pi-agent format.
 */
export function appendSdkToolCallsToSessionTranscript(params: {
  sessionFile: string;
  toolCalls: SdkToolCallRecord[];
  timestamp?: number;
}): void {
  const ts = params.timestamp ?? Date.now();
  for (const call of params.toolCalls) {
    appendSdkToolUseToSessionTranscript({
      sessionFile: params.sessionFile,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      args: call.args,
      timestamp: ts,
    });
    if (call.result !== undefined) {
      appendSdkToolResultToSessionTranscript({
        sessionFile: params.sessionFile,
        toolCallId: call.toolCallId,
        result: call.result,
        isError: call.isError,
        timestamp: ts,
      });
    }
  }
}
