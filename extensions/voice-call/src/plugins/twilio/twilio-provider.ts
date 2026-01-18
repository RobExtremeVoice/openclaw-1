/**
 * Twilio Call Provider Plugin - Main Provider Implementation
 *
 * Implements the VoiceCallProvider interface for Twilio with full call lifecycle management,
 * TTS/STT integration, and media streaming support.
 */

import { randomUUID } from "node:crypto";
import type { MediaStreamHandler } from "../../media-stream.js";
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
import type { TwilioProvider } from "../../providers/twilio.js";
import {
  extractCallMetadata,
  isDtmfEvent,
  isCallStateEvent,
  isSpeechEvent,
  TWILIO_STATUS_MAP,
  generateSayTwiml,
  generateGatherTwiml,
  generateStreamConnectTwiml,
  type TwilioPluginConfig,
  type TwilioCallSetupOptions,
} from "./twilio-config.js";
import { verifyTwilioProviderWebhook } from "./twilio-webhook.js";

// ============================================================================
// Call State Management
// ============================================================================

/**
 * Tracks active Twilio calls with provider-specific metadata
 */
interface CallStateEntry {
  callId: CallId;
  providerCallId: ProviderCallId;
  from: string;
  to: string;
  direction: "inbound" | "outbound";
  webhookUrl: string;
  state: string;
  streamSid?: string;
  createdAt: number;
  setupOptions?: TwilioCallSetupOptions;
}

// ============================================================================
// Twilio Provider Plugin
// ============================================================================

/**
 * Twilio call provider implementation with plugin architecture
 *
 * Features:
 * - Outbound and inbound call handling
 * - TTS playback via TwiML and media streams
 * - STT capture via TwiML Gather
 * - Call recording and transcription
 * - Webhook verification and event normalization
 */
export class TwilioCallProviderPlugin {
  private config: TwilioPluginConfig;
  private provider: TwilioProvider;
  private callState = new Map<ProviderCallId, CallStateEntry>();
  private mediaStreamHandler: MediaStreamHandler | null = null;

  constructor(twilioProvider: TwilioProvider, config: TwilioPluginConfig) {
    this.provider = twilioProvider;
    this.config = config;

    // Set public URL in provider if available
    if (config.publicUrl) {
      this.provider.setPublicUrl(config.publicUrl);
    }

    // Set stream path for media streaming
    if (config.streamPath) {
      this.provider.setPublicUrl(config.publicUrl || "");
    }
  }

  // ========================================================================
  // Provider Interface Implementation
  // ========================================================================

  /**
   * Verify Twilio webhook signature
   */
  verifyWebhook(ctx: WebhookContext): WebhookVerificationResult {
    return verifyTwilioProviderWebhook({
      ctx,
      authToken: this.config.authToken,
      currentPublicUrl: this.config.publicUrl,
      options: {
        allowNgrokFreeTier: this.config.allowNgrokFreeTier,
        skipVerification: this.config.skipVerification,
      },
    });
  }

  /**
   * Parse Twilio webhook event into normalized format
   */
  parseWebhookEvent(ctx: WebhookContext): ProviderWebhookParseResult {
    return this.provider.parseWebhookEvent(ctx);
  }

  /**
   * Initiate an outbound call
   */
  async initiateOutboundCall(
    to: string,
    from: string,
    callId: CallId,
    webhookUrl: string,
    setupOptions?: TwilioCallSetupOptions,
  ): Promise<ProviderCallId> {
    try {
      const result = await this.provider.initiateCall({
        callId,
        from,
        to,
        webhookUrl,
        clientState: setupOptions?.clientState,
        inlineTwiml: setupOptions?.customTwiml,
      });

      // Track call state
      this.callState.set(result.providerCallId, {
        callId,
        providerCallId: result.providerCallId,
        from,
        to,
        direction: "outbound",
        webhookUrl,
        state: result.status,
        createdAt: Date.now(),
        setupOptions,
      });

      console.log(
        `[TwilioPlugin] Outbound call initiated: ${to} from ${from} (${result.providerCallId})`,
      );

      return result.providerCallId;
    } catch (error) {
      console.error("[TwilioPlugin] Failed to initiate outbound call:", error);
      throw error;
    }
  }

  /**
   * Handle inbound call (register and setup)
   */
  async handleInboundCall(
    from: string,
    to: string,
    callId: CallId,
    providerCallId: ProviderCallId,
    webhookUrl: string,
    setupOptions?: TwilioCallSetupOptions,
  ): Promise<void> {
    try {
      // Track inbound call state
      this.callState.set(providerCallId, {
        callId,
        providerCallId,
        from,
        to,
        direction: "inbound",
        webhookUrl,
        state: "ringing",
        createdAt: Date.now(),
        setupOptions,
      });

      console.log(
        `[TwilioPlugin] Inbound call handled: ${from} to ${to} (${providerCallId})`,
      );
    } catch (error) {
      console.error("[TwilioPlugin] Failed to handle inbound call:", error);
      throw error;
    }
  }

  /**
   * Send TTS response during call
   */
  async sendTTSResponse(
    providerCallId: ProviderCallId,
    text: string,
    options?: {
      voice?: string;
      locale?: string;
      waitForSpeech?: boolean;
    },
  ): Promise<void> {
    try {
      await this.provider.playTts({
        callId: this.getCallId(providerCallId) || providerCallId,
        providerCallId,
        text,
        voice: options?.voice,
        locale: options?.locale,
      });

      console.log(
        `[TwilioPlugin] TTS sent to call ${providerCallId}: ${text.substring(0, 50)}...`,
      );
    } catch (error) {
      console.error("[TwilioPlugin] Failed to send TTS:", error);
      throw error;
    }
  }

  /**
   * Capture STT (speech-to-text) from call
   */
  async captureSTT(
    providerCallId: ProviderCallId,
    language?: string,
  ): Promise<void> {
    try {
      await this.provider.startListening({
        callId: this.getCallId(providerCallId) || providerCallId,
        providerCallId,
        language,
      });

      console.log(
        `[TwilioPlugin] Started listening on call ${providerCallId}`,
      );
    } catch (error) {
      console.error("[TwilioPlugin] Failed to start listening:", error);
      throw error;
    }
  }

  /**
   * Disconnect/hangup a call
   */
  async disconnectCall(
    providerCallId: ProviderCallId,
    reason: string = "completed",
  ): Promise<void> {
    try {
      const entry = this.callState.get(providerCallId);
      if (!entry) {
        throw new Error(`Call not found: ${providerCallId}`);
      }

      await this.provider.hangupCall({
        callId: entry.callId,
        providerCallId,
        reason: reason as any, // Map to EndReason type
      });

      this.callState.delete(providerCallId);

      console.log(
        `[TwilioPlugin] Call disconnected: ${providerCallId} (${reason})`,
      );
    } catch (error) {
      console.error("[TwilioPlugin] Failed to disconnect call:", error);
      throw error;
    }
  }

  /**
   * Get recording URL for a completed call
   */
  getRecordingURL(providerCallId: ProviderCallId): string | null {
    const entry = this.callState.get(providerCallId);
    if (!entry) {
      return null;
    }

    // Construct Twilio recording URL based on call SID
    // Note: Actual recording URLs are returned via webhook callbacks
    return `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Calls/${providerCallId}/Recordings`;
  }

  // ========================================================================
  // Media Streaming Support
  // ========================================================================

  /**
   * Register media stream handler for bidirectional audio
   */
  setMediaStreamHandler(handler: MediaStreamHandler): void {
    this.mediaStreamHandler = handler;
    this.provider.setMediaStreamHandler(handler);
    console.log("[TwilioPlugin] Media stream handler registered");
  }

  /**
   * Register call with stream SID for media streaming
   */
  registerCallStream(callSid: string, streamSid: string): void {
    const entry = this.callState.get(callSid);
    if (entry) {
      entry.streamSid = streamSid;
      this.callState.set(callSid, entry);
    }
    this.provider.registerCallStream(callSid, streamSid);
  }

  /**
   * Unregister call stream
   */
  unregisterCallStream(callSid: string): void {
    const entry = this.callState.get(callSid);
    if (entry) {
      entry.streamSid = undefined;
      this.callState.set(callSid, entry);
    }
    this.provider.unregisterCallStream(callSid);
  }

  // ========================================================================
  // TwiML Generation Helpers
  // ========================================================================

  /**
   * Generate TwiML for IVR say-gather loop
   */
  generateIvrTwiml(
    prompt: string,
    webhookUrl: string,
    options?: {
      voice?: string;
      language?: string;
      speechTimeout?: "auto" | number;
      maxSpeechTime?: number;
    },
  ): string {
    const sayTwiml = generateSayTwiml(prompt, {
      voice: options?.voice,
      language: options?.language,
    });

    // Parse and enhance with Gather
    const gatherTwiml = generateGatherTwiml({
      input: "speech",
      language: options?.language || "en-US",
      speechTimeout: options?.speechTimeout || "auto",
      action: webhookUrl,
      method: "POST",
    });

    return gatherTwiml;
  }

  /**
   * Generate TwiML for media stream connection
   */
  generateStreamConnectTwiml(streamUrl: string): string {
    return generateStreamConnectTwiml(streamUrl);
  }

  // ========================================================================
  // State Management
  // ========================================================================

  /**
   * Get call state entry
   */
  getCallState(providerCallId: ProviderCallId): CallStateEntry | undefined {
    return this.callState.get(providerCallId);
  }

  /**
   * Get all active calls
   */
  getAllActiveCalls(): CallStateEntry[] {
    return Array.from(this.callState.values());
  }

  /**
   * Update call state
   */
  updateCallState(providerCallId: ProviderCallId, state: string): void {
    const entry = this.callState.get(providerCallId);
    if (entry) {
      entry.state = state;
      this.callState.set(providerCallId, entry);
    }
  }

  /**
   * Clear all call state
   */
  clearAllCalls(): void {
    this.callState.clear();
    console.log("[TwilioPlugin] All call state cleared");
  }

  // ========================================================================
  // Configuration
  // ========================================================================

  /**
   * Get current configuration
   */
  getConfig(): TwilioPluginConfig {
    return this.config;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<TwilioPluginConfig>): void {
    this.config = { ...this.config, ...updates };

    if (updates.publicUrl) {
      this.provider.setPublicUrl(updates.publicUrl);
    }

    console.log("[TwilioPlugin] Configuration updated");
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    console.log("[TwilioPlugin] Initializing with account:", this.config.accountSid);
  }

  /**
   * Shutdown the plugin and cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      // Hangup all active calls
      for (const [providerCallId, entry] of this.callState.entries()) {
        try {
          await this.disconnectCall(providerCallId, "hangup-bot");
        } catch (error) {
          console.warn(
            `[TwilioPlugin] Error hanging up call ${providerCallId}:`,
            error,
          );
        }
      }

      this.callState.clear();
      console.log("[TwilioPlugin] Shutdown complete");
    } catch (error) {
      console.error("[TwilioPlugin] Shutdown error:", error);
      throw error;
    }
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get internal call ID from provider call ID
   */
  private getCallId(providerCallId: ProviderCallId): CallId | null {
    const entry = this.callState.get(providerCallId);
    return entry?.callId || null;
  }
}
