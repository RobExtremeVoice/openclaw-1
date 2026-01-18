/**
 * Slack Voice Integration
 *
 * Main entry point for voice message handling in Slack.
 * Combines message reception and voice response capabilities.
 */

export {
  SlackVoiceMessageHandler,
  type SlackVoiceFile,
  type SlackVoiceContext,
  type VoiceMessageHandlerOptions,
  extractAudioMetadata,
} from './message-handler.js';

export {
  SlackVoiceResponseHandler,
  type SlackVoiceResponseOptions,
  type SlackVoiceUploadResult,
  type VoiceResponseConfig,
} from './response-handler.js';

export {
  type SlackVoiceConfig,
  type ResponseModality,
  type InputModality,
  type VoiceResponseMetadata,
} from './types.js';

export { registerSlackVoiceEvents } from './events.js';
