/**
 * Claude Code Session Management
 *
 * Provides orchestration of Claude Code as a subprocess, with:
 * - Session lifecycle management (start, cancel, send input)
 * - Event streaming from session files
 * - Question detection and forwarding
 * - State tracking for UI updates
 *
 * Usage:
 *
 * ```typescript
 * import { startSession, cancelSession, sendInput } from "./claude-code/index.js";
 *
 * const result = await startSession({
 *   project: "juzi @experimental",
 *   prompt: "implement the auth system",
 *   onEvent: (event) => console.log("Event:", event),
 *   onQuestion: async (question) => {
 *     // Forward to Telegram and wait for response
 *     return await askUser(question);
 *   },
 *   onStateChange: (state) => {
 *     // Update Telegram bubble
 *     updateBubble(state);
 *   },
 * });
 *
 * if (result.success) {
 *   console.log("Session started:", result.sessionId);
 * }
 *
 * // Later...
 * cancelSession(result.sessionId);
 * ```
 */

// Types
export type {
  ClaudeCodeSessionParams,
  ClaudeCodeSessionData,
  SessionEvent,
  SessionEventType,
  SessionState,
  SessionStatus,
  SessionStartResult,
  ResolvedProject,
} from "./types.js";

// Session management
export {
  startSession,
  cancelSession,
  cancelSessionByToken,
  sendInput,
  getSession,
  getSessionByToken,
  getSessionState,
  listSessions,
} from "./session.js";

// Project resolution
export {
  resolveProject,
  parseProjectIdentifier,
  findSessionFile,
  getSessionDir,
  getGitBranch,
  decodeClaudeProjectPath,
  encodeClaudeProjectPath,
  listKnownProjects,
  getConfiguredProjectBases,
  getDefaultPermissionMode,
  getDefaultModel,
} from "./project-resolver.js";

// Session parsing
export {
  SessionParser,
  extractRecentActions,
  getWaitingEvent,
  isSessionIdle,
} from "./session-parser.js";

// Progress tracking
export {
  getPhaseStatus,
  getCompletedPhases,
  formatRuntime,
  formatRuntimeDetailed,
  isRuntimeExceeded,
  getRemainingTime,
  detectTaskProgress,
  getProgressSummary,
} from "./progress-tracker.js";

// Bubble service (high-level Telegram integration)
export {
  createSessionBubble,
  updateSessionBubble,
  completeSessionBubble,
  getSessionBubble,
  getBubbleByTokenPrefix,
  getBubbleByMessageId,
  isReplyToBubble,
  removeSessionBubble,
  forwardEventToChat,
  checkRuntimeLimit,
  pauseSession,
  resumeSession,
  isSessionPaused,
  sendRuntimeLimitWarning,
  sendQuestionToChat,
  // Q&A state for hybrid bubble format
  recordCCQuestion,
  recordDyDoAnswer,
  clearQAState,
} from "./bubble-service.js";

// Bubble manager (Telegram status messages)
export {
  BubbleManager,
  createBubble,
  updateBubble,
  deleteBubble,
  getBubble,
  getBubbleByToken,
  sendCompletionMessage,
  formatBubbleMessage,
  buildBubbleKeyboard,
  CLEAR_MARKUP,
  isFinalStatus,
  getMarkupForStatus,
  type BubbleOptions,
  type BubbleInstance,
} from "./bubble-manager.js";

// Orchestrator (DyDo's AI intelligence for Claude Code)
export {
  generateOrchestratorResponse,
  shouldAutoContinue,
  logDyDoCommand,
  getLatestDyDoCommand,
  type OrchestratorContext,
} from "./orchestrator.js";
