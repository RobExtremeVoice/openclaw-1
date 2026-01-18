/**
 * WhatsApp Message Handler Monitor
 *
 * Integrates voice message handling into the WhatsApp message processing pipeline.
 * Follows the same pattern as Slack and Discord voice integration.
 *
 * Flow:
 * 1. Check for voice attachment (audio message from webhook)
 * 2. If voice detected, handle via voice pipeline
 * 3. If no voice or voice handling fails, fall through to text processing
 */

import { logVerbose } from '../../globals.js';
import type { RuntimeEnv } from '../../runtime.js';
import {
  handleWhatsAppVoiceMessage,
  shouldHandleWhatsAppVoiceMessage,
} from '../voice/integration.js';

export type WhatsAppMessageHandler = (
  message: any,
  opts: { source: 'direct' | 'group'; phoneNumber?: string },
) => Promise<void>;

export function createWhatsAppMessageHandler(params: {
  phoneNumber: string;
  apiClient: any;
  runtime?: RuntimeEnv;
  providersConfig?: any;
  replyFn?: (text: string) => Promise<string>;
  sendFn?: (phoneNumber: string, text: string) => Promise<void>;
}): WhatsAppMessageHandler {
  const { phoneNumber, apiClient, runtime, providersConfig, replyFn, sendFn } = params;

  return async (message, opts) => {
    // Skip non-message types
    if (!message || typeof message !== 'object') return;

    // Handle voice messages first (if present)
    if (shouldHandleWhatsAppVoiceMessage(message)) {
      try {
        const targetPhone = opts.phoneNumber || phoneNumber;
        const voiceHandled = await handleWhatsAppVoiceMessage({
          message,
          apiClient,
          runtime,
          providersConfig,
          replyFn: async (transcribedText: string) => {
            if (replyFn) {
              return await replyFn(transcribedText);
            }
            // Fallback acknowledgment
            return `I heard you say: "${transcribedText}". Voice message support is active!`;
          },
          sendFn: async (params) => {
            if (sendFn && params.text) {
              await sendFn(targetPhone, params.text);
            }
          },
        });

        if (voiceHandled) {
          // Voice message was successfully handled, skip regular text processing
          logVerbose(`whatsapp: voice message handled for ${opts.phoneNumber || phoneNumber}`);
          return;
        }
      } catch (err) {
        logVerbose(
          `whatsapp: voice message handling failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Fall through to text processing on error
      }
    }

    // If we reach here, process as text message
    // This would be handled by the regular message processing pipeline
    logVerbose(`whatsapp: processing text message from ${opts.phoneNumber || phoneNumber}`);
  };
}
