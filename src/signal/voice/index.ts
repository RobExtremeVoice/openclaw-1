/**
 * Signal Voice Integration
 *
 * Privacy-first voice message and real-time call support for Signal with end-to-end encryption.
 *
 * Features:
 * - E2E encrypted voice message reception and sending
 * - Real-time voice calls with bidirectional audio streaming
 * - Privacy-preserving TTS synthesis (no caching)
 * - Encrypted conversation state management
 * - Optional transcription (memory-only, not logged)
 * - Auto-cleanup of voice data
 * - GDPR/privacy compliant
 *
 * @module signal/voice
 */

// Message Handler (receive voice messages)
export {
  isVoiceMessage,
  downloadVoiceMessage,
  processVoiceMessage,
  saveVoiceMessageAudio,
  extractVoiceMetadata,
} from './message-handler.js';

export type {
  SignalVoiceAttachment,
  DecryptedVoiceMessage,
  VoiceMessageOptions,
  VoiceMessageMetadata,
} from './message-handler.js';

// Response Handler (send voice messages)
export {
  synthesizeTextToVoice,
  sendEncryptedVoiceMessage,
  handleVoiceResponse,
  sendVoiceReaction,
  sendBatchVoiceResponses,
} from './response-handler.js';

export type {
  VoiceResponseConfig,
  SynthesizedVoice,
  VoiceResponseDelivery,
} from './response-handler.js';

// Privacy Manager (conversation state)
export {
  SignalVoicePrivacyManager,
} from './privacy-manager.js';

export type {
  VoiceConversationContext,
  VoiceMessageReference,
  PrivacyAuditEntry,
  PrivacyManagerConfig,
} from './privacy-manager.js';

// Call Handler (real-time voice calls)
export {
  SignalVoiceCallHandler,
} from './call-handler.js';

export type {
  VoiceCall,
  CallState,
  CallParticipant,
  CallHandlerConfig,
  CallEvents,
} from './call-handler.js';

// Call Response Handler (bidirectional audio streaming)
export {
  SignalVoiceCallResponseHandler,
} from './call-response-handler.js';

export type {
  AudioChunk,
  CallResponseConfig,
  CallResponseEvents,
} from './call-response-handler.js';
