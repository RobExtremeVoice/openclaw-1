/**
 * Twilio Call Provider Plugin - Main Export
 *
 * Exports all Twilio call provider components, utilities, and factory functions
 * for easy integration into the voice-call extension.
 */

// Configuration exports
export {
  TwilioPluginConfigSchema,
  validateTwilioConfig,
  validatePhoneNumber,
  validateTwiml,
  isCallStateEvent,
  isSpeechEvent,
  isDtmfEvent,
  extractCallMetadata,
  generateSayTwiml,
  generateGatherTwiml,
  generateStreamConnectTwiml,
  TWILIO_STATUS_MAP,
  TWILIO_DIRECTION_MAP,
  TWIML_ELEMENTS,
  type TwilioPluginConfig,
  type TwilioCallSetupOptions,
  type TwimlGatherConfig,
} from "./twilio-config.js";

// Provider exports
export {
  TwilioCallProviderPlugin,
} from "./twilio-provider.js";

// Webhook exports
export {
  verifyTwilioProviderWebhook,
  parseTwilioWebhookPayload,
  generateMinimalTwimlResponse,
  generatePauseTwimlResponse,
  generateStreamingTwimlResponse,
  extractRecordingMetadata,
  parseMediaStreamConnected,
  parseMediaStreamEvent,
  validateTwilioWebhookPayload,
} from "./twilio-webhook.js";

// TTS/STT exports
export {
  TwilioTTSProvider,
  TwilioSTTProvider,
  TwilioSTTSession,
  createTwilioTTSProvider,
  createTwilioSTTProvider,
} from "./twilio-tts-stt.js";

// Re-export plugin interfaces for convenience
export type {
  PluginConfig,
  PluginMetadata,
  TTSProvider,
  STTProvider,
  STTSession,
  TTSSynthesisOptions,
} from "../interfaces.js";

// ============================================================================
// Factory/Integration Functions
// ============================================================================

/**
 * Initialize a complete Twilio call provider plugin setup
 *
 * This is a convenience function that sets up:
 * - Call provider with webhook handling
 * - TTS provider for speech synthesis
 * - STT provider for speech recognition
 * - Media stream handler
 *
 * @example
 * ```typescript
 * import { initializeTwilioPlugin } from "@/plugins/twilio";
 *
 * const plugin = await initializeTwilioPlugin({
 *   accountSid: "AC...",
 *   authToken: "auth_token",
 *   publicUrl: "https://example.com/webhooks/twilio",
 *   streamPath: "/voice/stream"
 * });
 * ```
 */
export async function initializeTwilioPlugin(config: {
  accountSid: string;
  authToken: string;
  phoneNumber?: string;
  publicUrl?: string;
  streamPath?: string;
  skipVerification?: boolean;
}) {
  const { TwilioProvider } = await import("../../providers/twilio.js");
  const { TwilioCallProviderPlugin } = await import("./twilio-provider.js");
  const { createTwilioTTSProvider: createTTS, createTwilioSTTProvider: createSTT } = await import("./twilio-tts-stt.js");

  // Create base provider
  const twilioProvider = new TwilioProvider(
    {
      accountSid: config.accountSid,
      authToken: config.authToken,
    },
    {
      publicUrl: config.publicUrl,
      streamPath: config.streamPath,
      skipVerification: config.skipVerification,
    },
  );

  // Create plugin wrapper
  const plugin = new TwilioCallProviderPlugin(twilioProvider, {
    accountSid: config.accountSid,
    authToken: config.authToken,
    phoneNumber: config.phoneNumber,
    publicUrl: config.publicUrl,
    streamPath: config.streamPath,
    skipVerification: config.skipVerification,
  });

  // Create TTS/STT providers
  const ttsProvider = createTTS({
    accountSid: config.accountSid,
    authToken: config.authToken,
  });

  const sttProvider = createSTT({
    accountSid: config.accountSid,
    authToken: config.authToken,
  });

  // Initialize plugin
  await plugin.initialize();

  return {
    plugin,
    ttsProvider,
    sttProvider,
    twilioProvider,
  };
}

/**
 * Version information
 */
export const PLUGIN_VERSION = "1.0.0";
export const PLUGIN_NAME = "twilio-call-provider";
export const PLUGIN_DESCRIPTION =
  "Twilio call provider plugin for voice-call extension";
