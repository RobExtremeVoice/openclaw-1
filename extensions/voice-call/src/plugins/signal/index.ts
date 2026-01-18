/**
 * Signal Call Provider Plugin - Main Export
 *
 * Exports the Signal call provider plugin factory function and re-exports
 * configuration types and utilities.
 */

export {
  SignalCallProviderPlugin,
} from "./signal-provider.js";

export {
  validateSignalConfig,
  validatePhoneNumber,
  validateGroupId,
  validateZrtpSas,
  extractEncryptionMetadata,
  verifyEncryptionMetadata,
  parseSignalErrorCode,
  generateCallConnectionString,
  SignalE2EEncryptionConfigSchema,
  SignalGroupConfigSchema,
  SignalPluginConfigSchema,
  SIGNAL_STATUS_MAP,
  SIGNAL_EVENT_TYPES,
  type SignalPluginConfig,
  type SignalE2EEncryptionConfig,
  type SignalGroupConfig,
  type SignalCallSetupOptions,
  type EncryptionMetadata,
} from "./signal-config.js";

export {
  verifySignalProviderWebhook,
  parseSignalWebhookPayload,
  SignalWebhookStateTracker,
  SignalEncryptionVerifier,
  SignalWebhookError,
  SignalWebhookErrorCode,
  generateWebhookResponse,
  type SignalWebhookPayload,
  type EncryptionVerificationState,
} from "./signal-webhook.js";

// ============================================================================
// Factory Function
// ============================================================================

import type { SignalPluginConfig } from "./signal-config.js";
import { SignalCallProviderPlugin } from "./signal-provider.js";

/**
 * Create a Signal call provider plugin instance
 *
 * @param config - Signal plugin configuration
 * @returns Signal provider instance
 *
 * @example
 * ```typescript
 * const provider = createSignalProvider({
 *   phoneNumber: '+15551234567',
 *   accountPassword: 'secure-password',
 *   signalCliPath: '/usr/bin/signal-cli',
 *   encryption: {
 *     enableZrtp: true,
 *     requireZrtpAuth: false,
 *   },
 * });
 *
 * // Initiate an outbound call
 * const result = await provider.initiateCall({
 *   to: '+15559876543',
 * });
 *
 * if (result.ok) {
 *   console.log('Call initiated:', result.providerCallId);
 * }
 * ```
 */
export function createSignalProvider(
  config: Partial<SignalPluginConfig>,
): SignalCallProviderPlugin {
  return new SignalCallProviderPlugin(config);
}

/**
 * Plugin metadata
 */
export const SIGNAL_PLUGIN_METADATA = {
  name: "signal",
  version: "1.0.0",
  provider: "signal",
  description:
    "End-to-end encrypted voice calls using Signal Protocol with support for 1:1 and group calls",
  features: [
    "E2E encryption with Signal Protocol (Double Ratchet Algorithm)",
    "Perfect forward secrecy (keys discarded after use)",
    "1:1 voice calls",
    "Group voice calls",
    "ZRTP verification for additional security",
    "TTS playback with encrypted media streaming",
    "STT capture with encrypted audio processing",
    "Call recording with encryption preservation",
    "Webhook integration with HMAC verification",
  ],
  capabilities: [
    "outbound-call",
    "inbound-call",
    "group-call",
    "e2e-encryption",
    "zrtp-verification",
    "perfect-forward-secrecy",
    "tts-streaming",
    "stt-capture",
    "call-recording",
    "webhook",
  ],
  documentation: "https://docs.clawd.bot/integrations/signal",
} as const;
