/**
 * WhatsApp Voice Module
 *
 * Exports voice message handling, response generation, and webhook parsing
 */

export { handleWhatsAppVoiceMessage, shouldHandleWhatsAppVoiceMessage } from './integration.js';
export type { WhatsAppVoiceFile, WhatsAppVoiceContext } from './integration.js';
export { WhatsAppVoiceMessageHandler } from './message-handler.js';
export type { WhatsAppVoiceContext as VoiceContext } from './message-handler.js';
export { WhatsAppWebhookParser } from './webhook-handler.js';
export type {
  WhatsAppWebhookEvent,
  WhatsAppWebhookMessage,
  ParsedWebhookMessage,
} from './webhook-handler.js';
