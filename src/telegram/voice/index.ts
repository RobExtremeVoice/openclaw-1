/**
 * Telegram Voice Integration
 *
 * Complete voice message support for Telegram:
 * - Voice message reception and processing
 * - Voice response synthesis and sending
 * - Conversation management and context tracking
 */

// Voice Message Handler
export {
  isVoiceMessage,
  extractVoiceMetadata,
  downloadVoiceMessage,
  processVoiceMessage,
  VoiceMessageHandler,
  createVoiceMessageHandler,
  type VoiceMessageMetadata,
  type VoiceMessageDownload,
  type TranscriptionProvider,
  type VoiceMessageHandlerOptions,
} from "./message-handler.js";

// Voice Response Handler
export {
  sendVoiceResponse,
  sendLongVoiceResponse,
  VoiceResponseHandler,
  createVoiceResponseHandler,
  SimpleOggOpusEncoder,
  chunkTextForVoice,
  type TTSProvider,
  type AudioEncoder,
  type VoiceResponseOptions,
  type VoiceResponseContext,
} from "./response-handler.js";

// Conversation Manager
export {
  generateConversationId,
  VoiceConversationManager,
  createVoiceConversationManager,
  type ConversationMessage,
  type Conversation,
  type ConversationManagerOptions,
} from "./conversation-manager.js";
