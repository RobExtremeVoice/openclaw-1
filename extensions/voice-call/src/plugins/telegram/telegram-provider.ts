/**
 * Telegram Calls Provider Plugin - Main Provider Implementation
 *
 * Implements group call management for Telegram with participant tracking
 * and event normalization.
 *
 * CRITICAL LIMITATIONS:
 * - Telegram Bot API provides read-only participant list (no real-time updates)
 * - No direct audio/voice streaming capability
 * - TTS/STT must be handled through separate services
 * - Group calls are managed through the Telegram UI; bot cannot directly control audio
 * - This provider focuses on call lifecycle management and participant tracking
 */

import { randomUUID } from "node:crypto";
import type {
  CallId,
  HangupCallInput,
  InitiateCallInput,
  InitiateCallResult,
  NormalizedEvent,
  PlayTtsInput,
  ProviderCallId,
  ProviderWebhookParseResult,
  StartListeningInput,
  StopListeningInput,
  WebhookContext,
  WebhookVerificationResult,
} from "../../types.js";
import type { VoiceCallProvider } from "../../providers/base.js";
import {
  extractGroupCallMetadata,
  extractParticipantMetadata,
  generateGroupCallParams,
  isGroupCallStateEvent,
  isParticipantActivityEvent,
  parseTelegramError,
  TELEGRAM_CALL_EVENTS,
  TELEGRAM_CALL_STATE_MAP,
  validateBotToken,
  validateGroupId,
  validateUserId,
  type TelegramCallConfig,
  type TelegramGroupCallOptions,
} from "./telegram-config.js";
import { verifyTelegramWebhook } from "./telegram-webhook.js";

// ============================================================================
// Call State Management
// ============================================================================

/**
 * Tracks active Telegram group calls with metadata
 */
interface GroupCallState {
  callId: CallId;
  groupCallId: number;
  groupId: number;
  from: string; // Bot user or creator
  direction: "inbound" | "outbound";
  state: string;
  participantCount: number;
  participants: Map<number, { name: string; joinedAt: number }>;
  recordingStarted: boolean;
  createdAt: number;
  setupOptions?: TelegramGroupCallOptions;
}

// ============================================================================
// Telegram Provider Plugin
// ============================================================================

/**
 * Telegram call provider implementation with plugin architecture
 *
 * Features:
 * - Group call lifecycle management
 * - Participant tracking (with limitations)
 * - Event normalization for call state changes
 * - Webhook verification and event parsing
 *
 * DESIGN NOTES:
 * - Telegram Bot API doesn't support direct audio streaming
 * - TTS playback: Could send voice messages to group instead of live audio
 * - STT capture: Would require separate speech-to-text service integration
 * - This implementation focuses on call orchestration, not audio handling
 */
export class TelegramCallProviderPlugin implements VoiceCallProvider {
  readonly name = "telegram" as const;

  private config: TelegramCallConfig;
  private callState = new Map<ProviderCallId, GroupCallState>();
  private apiClient: TelegramApiClient;

  constructor(config: TelegramCallConfig) {
    // Validate configuration
    if (!validateBotToken(config.botToken)) {
      throw new Error("Invalid Telegram bot token format");
    }
    if (!validateGroupId(config.groupId)) {
      throw new Error(
        "Invalid Telegram group ID (must be negative number)",
      );
    }

    this.config = config;
    this.apiClient = new TelegramApiClient(config.botToken, config.debug);
  }

  // ========================================================================
  // Provider Interface Implementation
  // ========================================================================

  /**
   * Verify Telegram webhook signature
   */
  verifyWebhook(ctx: WebhookContext): WebhookVerificationResult {
    if (this.config.skipVerification) {
      return { ok: true };
    }

    return verifyTelegramWebhook({
      ctx,
      botToken: this.config.botToken,
    });
  }

  /**
   * Parse Telegram webhook event into normalized format
   */
  parseWebhookEvent(ctx: WebhookContext): ProviderWebhookParseResult {
    let update: Record<string, unknown>;

    try {
      if (ctx.method === "POST" && ctx.rawBody) {
        update = JSON.parse(ctx.rawBody);
      } else {
        return { events: [] };
      }
    } catch (error) {
      console.error("[TelegramPlugin] Failed to parse webhook:", error);
      return { events: [] };
    }

    const events: NormalizedEvent[] = [];

    // Handle group call updates
    if (update.my_chat_member) {
      // Bot was added to group
      const chatMember = update.my_chat_member as Record<string, unknown>;
      const chat = (update.message as Record<string, unknown>)?.chat || {};
      const chatId = (chat.id as number) || 0;

      events.push({
        id: randomUUID(),
        callId: `telegram-${chatId}`,
        type: "call.initiated",
        timestamp: Date.now(),
        direction: "inbound",
      });
    }

    // Note: Telegram Bot API doesn't provide real-time group call state through webhooks
    // Group call events would need to be polled or received through TDLib
    // This is a fundamental limitation of the Telegram Bot API

    return {
      events,
      statusCode: 200,
      providerResponseBody: JSON.stringify({ ok: true }),
    };
  }

  /**
   * Initiate a group call (create group call session)
   *
   * LIMITATION: Actual audio initiation happens through Telegram UI.
   * This method prepares the group call infrastructure.
   */
  async initiateCall(
    input: InitiateCallInput,
  ): Promise<InitiateCallResult> {
    try {
      // Generate provider call ID
      const groupCallId = Math.floor(Math.random() * 1000000000);
      const providerCallId = `tg-call-${groupCallId}`;

      // Create group call via Telegram API
      const groupCall = await this.apiClient.createGroupCall(
        this.config.groupId,
        {
          title: `Call: ${input.from} to ${input.to}`,
        },
      );

      // Track call state
      const callState: GroupCallState = {
        callId: input.callId,
        groupCallId,
        groupId: this.config.groupId,
        from: input.from,
        direction: "outbound",
        state: "initiated",
        participantCount: 1,
        participants: new Map([
          [0, { name: input.from, joinedAt: Date.now() }],
        ]),
        recordingStarted: false,
        createdAt: Date.now(),
      };

      this.callState.set(providerCallId, callState);

      if (this.config.debug) {
        console.log(
          `[TelegramPlugin] Group call initiated: ${providerCallId}`,
        );
      }

      return {
        providerCallId,
        status: "initiated",
      };
    } catch (error) {
      const { message, isRetryable } = parseTelegramError(error);
      console.error("[TelegramPlugin] Failed to initiate call:", message);
      throw new Error(`Telegram call initiation failed: ${message}`);
    }
  }

  /**
   * Hang up / disband the group call
   */
  async hangupCall(input: HangupCallInput): Promise<void> {
    try {
      const callState = this.callState.get(input.providerCallId);
      if (!callState) {
        throw new Error(`Call ${input.providerCallId} not found`);
      }

      // Disband group call via Telegram API
      await this.apiClient.disbandGroupCall(
        this.config.groupId,
        callState.groupCallId,
      );

      // Clear call state
      this.callState.delete(input.providerCallId);

      if (this.config.debug) {
        console.log(
          `[TelegramPlugin] Group call ended: ${input.providerCallId} (reason: ${input.reason})`,
        );
      }
    } catch (error) {
      const { message } = parseTelegramError(error);
      console.error("[TelegramPlugin] Failed to hangup call:", message);
      throw new Error(`Telegram hangup failed: ${message}`);
    }
  }

  /**
   * Play TTS response during group call
   *
   * LIMITATION: Telegram Bot API cannot directly inject audio into group calls.
   * Alternative approaches:
   * 1. Send voice message to group (async, not live)
   * 2. Send text message and rely on user TTS (client-side)
   * 3. Integrate external TTS service + play via separate channel
   */
  async playTts(input: PlayTtsInput): Promise<void> {
    try {
      const callState = this.callState.get(input.providerCallId);
      if (!callState) {
        throw new Error(`Call ${input.providerCallId} not found`);
      }

      // Option 1: Send text message to group (simple fallback)
      await this.apiClient.sendMessage(
        this.config.groupId,
        `[Bot Response]: ${input.text}`,
      );

      if (this.config.debug) {
        console.log(
          `[TelegramPlugin] TTS message sent to group call ${input.providerCallId}`,
        );
      }

      // Emit speaking event for call tracking
      // Note: Real audio injection would require TDLib or alternative approach
    } catch (error) {
      const { message } = parseTelegramError(error);
      console.error("[TelegramPlugin] Failed to play TTS:", message);
      throw new Error(`TTS playback failed: ${message}`);
    }
  }

  /**
   * Start listening for speech in group call
   *
   * LIMITATION: Telegram Bot API cannot capture raw audio from group calls.
   * This is a fundamental limitation of the Telegram Bot API.
   *
   * Workarounds:
   * 1. Have users send voice messages (async)
   * 2. Integrate OpenAI Realtime or similar for STT
   * 3. Use TDLib for direct Telegram client access (more complex)
   */
  async startListening(input: StartListeningInput): Promise<void> {
    const callState = this.callState.get(input.providerCallId);
    if (!callState) {
      throw new Error(`Call ${input.providerCallId} not found`);
    }

    // Update call state to listening
    callState.state = "listening";

    if (this.config.debug) {
      console.log(
        `[TelegramPlugin] Started listening on call ${input.providerCallId}`,
      );
    }

    // Note: Actual speech capture requires external service or TDLib integration
    // This method updates internal state but doesn't capture audio directly
  }

  /**
   * Stop listening for speech in group call
   */
  async stopListening(input: StopListeningInput): Promise<void> {
    const callState = this.callState.get(input.providerCallId);
    if (!callState) {
      throw new Error(`Call ${input.providerCallId} not found`);
    }

    // Update call state
    callState.state = "active";

    if (this.config.debug) {
      console.log(
        `[TelegramPlugin] Stopped listening on call ${input.providerCallId}`,
      );
    }
  }

  // ========================================================================
  // Telegram-Specific Methods
  // ========================================================================

  /**
   * Get current group call participants
   * LIMITATION: Telegram Bot API provides snapshots, not real-time streams
   */
  async getGroupCallParticipants(
    providerCallId: ProviderCallId,
  ): Promise<Array<{ userId: number; name: string; isSpeaking: boolean }>> {
    const callState = this.callState.get(providerCallId);
    if (!callState) {
      throw new Error(`Call ${providerCallId} not found`);
    }

    try {
      const participants =
        await this.apiClient.getGroupCallParticipants(
          this.config.groupId,
          callState.groupCallId,
        );

      return participants;
    } catch (error) {
      const { message } = parseTelegramError(error);
      console.error(
        "[TelegramPlugin] Failed to get participants:",
        message,
      );
      return Array.from(callState.participants.values()).map(
        (p, idx) => ({
          userId: idx,
          name: p.name,
          isSpeaking: false,
        }),
      );
    }
  }

  /**
   * Toggle group call recording
   */
  async toggleRecording(providerCallId: ProviderCallId): Promise<void> {
    const callState = this.callState.get(providerCallId);
    if (!callState) {
      throw new Error(`Call ${providerCallId} not found`);
    }

    try {
      await this.apiClient.toggleGroupCallRecord(
        this.config.groupId,
        callState.groupCallId,
        !callState.recordingStarted,
      );

      callState.recordingStarted = !callState.recordingStarted;

      if (this.config.debug) {
        console.log(
          `[TelegramPlugin] Recording ${callState.recordingStarted ? "started" : "stopped"} for call ${providerCallId}`,
        );
      }
    } catch (error) {
      const { message } = parseTelegramError(error);
      console.error("[TelegramPlugin] Failed to toggle recording:", message);
      throw new Error(`Recording toggle failed: ${message}`);
    }
  }

  /**
   * Mute/unmute a participant
   */
  async muteParticipant(
    providerCallId: ProviderCallId,
    userId: number,
    mute: boolean,
  ): Promise<void> {
    if (!validateUserId(userId)) {
      throw new Error("Invalid user ID");
    }

    const callState = this.callState.get(providerCallId);
    if (!callState) {
      throw new Error(`Call ${providerCallId} not found`);
    }

    try {
      await this.apiClient.muteGroupCallParticipant(
        this.config.groupId,
        callState.groupCallId,
        userId,
        mute,
      );

      if (this.config.debug) {
        console.log(
          `[TelegramPlugin] Participant ${userId} ${mute ? "muted" : "unmuted"}`,
        );
      }
    } catch (error) {
      const { message } = parseTelegramError(error);
      console.error("[TelegramPlugin] Failed to mute participant:", message);
      throw new Error(`Mute operation failed: ${message}`);
    }
  }
}

// ============================================================================
// Telegram API Client
// ============================================================================

/**
 * Low-level Telegram Bot API client for group call operations
 */
class TelegramApiClient {
  private botToken: string;
  private debug: boolean;
  private baseUrl = "https://api.telegram.org";

  constructor(botToken: string, debug = false) {
    this.botToken = botToken;
    this.debug = debug;
  }

  /**
   * Make authenticated request to Telegram Bot API
   */
  private async request<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}/bot${this.botToken}/${method}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.description || `API error: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.description || "Unknown API error");
      }

      return result.result;
    } catch (error) {
      if (this.debug) {
        console.error(`[TelegramAPI] ${method} error:`, error);
      }
      throw error;
    }
  }

  /**
   * Create a group call in the specified chat
   */
  async createGroupCall(
    chatId: number,
    params: Record<string, unknown>,
  ): Promise<{ id: number }> {
    return this.request("createGroupCall", {
      chat_id: chatId,
      ...params,
    });
  }

  /**
   * Disband (end) a group call
   */
  async disbandGroupCall(chatId: number, groupCallId: number): Promise<void> {
    await this.request("disbandGroupCall", {
      chat_id: chatId,
      group_call_id: groupCallId,
    });
  }

  /**
   * Get group call details
   */
  async getGroupCall(
    chatId: number,
    groupCallId: number,
  ): Promise<Record<string, unknown>> {
    return this.request("getGroupCall", {
      chat_id: chatId,
      group_call_id: groupCallId,
    });
  }

  /**
   * Get group call participants
   *
   * LIMITATION: Returns snapshot, not real-time stream
   */
  async getGroupCallParticipants(
    chatId: number,
    groupCallId: number,
  ): Promise<Array<{ userId: number; name: string; isSpeaking: boolean }>> {
    const response = await this.request<{
      participants: Array<{ user: Record<string, unknown>; is_speaking: boolean }>;
    }>("getGroupCallParticipants", {
      chat_id: chatId,
      group_call_id: groupCallId,
    });

    return response.participants.map((p) => {
      const user = p.user as Record<string, unknown>;
      return {
        userId: (user.id as number) || 0,
        name:
          `${(user.first_name as string) || ""} ${(user.last_name as string) || ""}`.trim() ||
          `User ${(user.id as number)}`,
        isSpeaking: p.is_speaking,
      };
    });
  }

  /**
   * Toggle group call recording
   */
  async toggleGroupCallRecord(
    chatId: number,
    groupCallId: number,
    recordVideo: boolean,
  ): Promise<void> {
    await this.request("toggleGroupCallRecord", {
      chat_id: chatId,
      group_call_id: groupCallId,
      record_video: recordVideo,
    });
  }

  /**
   * Mute/unmute a participant in group call
   */
  async muteGroupCallParticipant(
    chatId: number,
    groupCallId: number,
    userId: number,
    mute: boolean,
  ): Promise<void> {
    await this.request("toggleGroupCallParticipantMute", {
      chat_id: chatId,
      group_call_id: groupCallId,
      user_id: userId,
      is_muted: mute,
    });
  }

  /**
   * Send text message to chat
   */
  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.request("sendMessage", {
      chat_id: chatId,
      text,
    });
  }
}
