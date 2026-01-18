/**
 * Telegram Calls Provider Plugin - Configuration
 *
 * Defines configuration schema, event mappings, and validation for Telegram Bot API integration.
 *
 * IMPORTANT LIMITATIONS:
 * - Telegram's group call API is read-only for participants (no real-time audio streaming)
 * - No direct audio streaming capability like Discord or Twilio media streams
 * - Call API limited to group creation/management, not direct voice/audio handling
 * - TTS/STT requires separate integration (not built into Telegram Bot API)
 */

import { z } from "zod";
import type { CallState, NormalizedEvent } from "../../types.js";

// ============================================================================
// Telegram Configuration Schema
// ============================================================================

/**
 * Configuration for Telegram calls provider plugin
 */
export const TelegramCallConfigSchema = z.object({
  /** Telegram Bot Token (from BotFather) */
  botToken: z.string().min(1, "Bot token is required"),

  /** Telegram Group/Channel ID for calls (-123456789 format) */
  groupId: z.number().int(),

  /** Allow webhooks for call state updates */
  allowWebhooks: z.boolean().default(false),

  /** Webhook URL for receiving call events */
  webhookUrl: z.string().url().optional(),

  /** Timeout for group call operations (seconds) */
  operationTimeoutSeconds: z.number().int().min(1).default(30),

  /** Enable voice message recording */
  enableRecording: z.boolean().default(false),

  /** Maximum participants allowed in group call */
  maxParticipants: z.number().int().min(2).optional(),

  /** Skip webhook signature verification (dev only) */
  skipVerification: z.boolean().default(false),

  /** Enable debug logging */
  debug: z.boolean().default(false),
});

export type TelegramCallConfig = z.infer<typeof TelegramCallConfigSchema>;

// ============================================================================
// Group Call Options
// ============================================================================

/**
 * Options for setting up a Telegram group call
 */
export interface TelegramGroupCallOptions {
  /** Enable call recording */
  recordingEnabled?: boolean;

  /** Title for the group call */
  title?: string;

  /** Custom parameters passed through call lifecycle */
  clientState?: Record<string, string>;

  /** Enable screen sharing (if supported by Telegram) */
  screenShareEnabled?: boolean;
}

// ============================================================================
// Participant Management
// ============================================================================

/**
 * Represents a participant in a Telegram group call
 */
export interface TelegramCallParticipant {
  /** User ID */
  userId: number;

  /** User username (if available) */
  username?: string;

  /** Participant name */
  displayName: string;

  /** Is participant the call creator */
  isCreator: boolean;

  /** Is participant speaking */
  isSpeaking: boolean;

  /** Participant joined timestamp */
  joinedAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Is participant muted */
  isMuted?: boolean;
}

// ============================================================================
// Event Mapping Configuration
// ============================================================================

/**
 * Maps Telegram group call states to normalized call states
 *
 * LIMITATION: Telegram only provides high-level group call events
 */
export const TELEGRAM_CALL_STATE_MAP: Record<string, CallState> = {
  "group_call_started": "initiated",
  "group_call_joined": "answered",
  "user_joined": "active",
  "user_left": "active",
  "user_speaking": "speaking",
  "user_muted": "listening",
  "group_call_ended": "completed",
  "error": "error",
};

/**
 * Telegram group call event types
 */
export const TELEGRAM_CALL_EVENTS = {
  GROUP_CALL_STARTED: "group_call_started",
  GROUP_CALL_ENDED: "group_call_ended",
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
  USER_SPEAKING: "user_speaking",
  USER_MUTED: "user_muted",
  RECORDING_STARTED: "recording_started",
  RECORDING_STOPPED: "recording_stopped",
} as const;

/**
 * Telegram Bot API group call methods
 */
export const TELEGRAM_GROUP_CALL_METHODS = {
  CREATE_GROUP_CALL: "createGroupCall",
  DISBAND_GROUP_CALL: "disbandGroupCall",
  GET_GROUP_CALL: "getGroupCall",
  GET_GROUP_CALL_PARTICIPANTS: "getGroupCallParticipants",
  TOGGLE_GROUP_CALL_RECORD: "toggleGroupCallRecord",
  TOGGLE_GROUP_CALL_MUTE_NEW_PARTICIPANTS:
    "toggleGroupCallMuteNewParticipants",
  TOGGLE_GROUP_CALL_PARTICIPANT_MUTE: "toggleGroupCallParticipantMute",
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate Telegram configuration
 */
export function validateTelegramConfig(config: unknown): TelegramCallConfig {
  return TelegramCallConfigSchema.parse(config);
}

/**
 * Validate Telegram bot token format
 * Format: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
 */
export function validateBotToken(token: string): boolean {
  return /^\d{5,}:[a-zA-Z0-9_-]{27}$/.test(token);
}

/**
 * Validate Telegram group/channel ID
 * Group IDs: negative numbers (-123456789)
 * Supergroup IDs: negative numbers with higher absolute value
 */
export function validateGroupId(groupId: number): boolean {
  return groupId < 0 && Number.isInteger(groupId);
}

/**
 * Validate Telegram user ID
 */
export function validateUserId(userId: number): boolean {
  return userId > 0 && Number.isInteger(userId);
}

/**
 * Check if a Telegram event represents a group call state change
 */
export function isGroupCallStateEvent(
  eventType: string,
): eventType is keyof typeof TELEGRAM_CALL_STATE_MAP {
  return eventType in TELEGRAM_CALL_STATE_MAP;
}

/**
 * Check if a Telegram event represents participant activity
 */
export function isParticipantActivityEvent(eventType: string): boolean {
  return (
    eventType === TELEGRAM_CALL_EVENTS.USER_JOINED ||
    eventType === TELEGRAM_CALL_EVENTS.USER_LEFT ||
    eventType === TELEGRAM_CALL_EVENTS.USER_SPEAKING ||
    eventType === TELEGRAM_CALL_EVENTS.USER_MUTED
  );
}

/**
 * Extract Telegram call metadata from group call update
 */
export function extractGroupCallMetadata(
  groupCallUpdate: Record<string, unknown>,
): {
  groupCallId: number;
  createdAt: number;
  participantCount: number;
  recordingStarted: boolean;
} {
  return {
    groupCallId: (groupCallUpdate.id as number) || 0,
    createdAt: (groupCallUpdate.created_at as number) || Date.now(),
    participantCount: (groupCallUpdate.participant_count as number) || 0,
    recordingStarted: (groupCallUpdate.record_video_is_enabled as boolean) || false,
  };
}

/**
 * Extract participant metadata from Telegram user data
 */
export function extractParticipantMetadata(
  participantUpdate: Record<string, unknown>,
): TelegramCallParticipant {
  const user = participantUpdate.user as Record<string, unknown>;
  const userId = (user?.id as number) || 0;

  return {
    userId,
    username: (user?.username as string) || undefined,
    displayName:
      `${(user?.first_name as string) || ""} ${(user?.last_name as string) || ""}`.trim() ||
      `User ${userId}`,
    isCreator: (participantUpdate.is_creator as boolean) || false,
    isSpeaking: (participantUpdate.is_speaking as boolean) || false,
    joinedAt: (participantUpdate.joined_at as number) || Date.now(),
    lastActivityAt: Date.now(),
    isMuted: (participantUpdate.is_muted_by_admin as boolean) || false,
  };
}

/**
 * Generate Telegram group call parameters
 *
 * LIMITATION: Telegram Bot API has limited group call customization.
 * TTS/STT integration requires separate service integration.
 */
export function generateGroupCallParams(
  options?: TelegramGroupCallOptions,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    record_video_is_enabled: options?.recordingEnabled || false,
  };

  if (options?.title) {
    params.title = options.title;
  }

  // Note: Telegram Bot API doesn't support direct audio/TTS through group calls
  // TTS/STT must be handled through separate service integration
  return params;
}

/**
 * Telegram API error codes and messages
 */
export const TELEGRAM_ERROR_CODES = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Parse Telegram API error response
 */
export function parseTelegramError(
  error: unknown,
): { code: number; message: string; isRetryable: boolean } {
  if (error instanceof Error) {
    const message = error.message;
    // Check for common Telegram error patterns
    if (message.includes("CHAT_NOT_FOUND")) {
      return {
        code: 404,
        message: "Chat/Group not found",
        isRetryable: false,
      };
    }
    if (message.includes("BOT_BLOCKED_BY_USER")) {
      return {
        code: 403,
        message: "Bot has been blocked by user",
        isRetryable: false,
      };
    }
    if (message.includes("PEER_ID_INVALID")) {
      return {
        code: 400,
        message: "Invalid peer/group ID",
        isRetryable: false,
      };
    }
    if (message.includes("Too Many Requests")) {
      return {
        code: 429,
        message: "Rate limited by Telegram",
        isRetryable: true,
      };
    }
  }
  return {
    code: 500,
    message: "Unknown Telegram error",
    isRetryable: true,
  };
}
