/**
 * Discord Voice Messages & Channels
 *
 * Exports voice message handling and real-time voice channel functionality for Discord.
 */

export * from './config.js';
export * from './message-handler.js';
export * from './response-handler.js';
export * from './config-store.js';
export * from './config-commands.js';
export * from './config-dashboard.js';

// Voice channel support
export {
  DiscordVoiceChannelConnector,
  type VoiceChannelConfig,
  type VoiceParticipant,
  type VoiceConnectionStats,
  type UserTranscription,
} from './channel-connector.js';

export {
  DiscordVoiceChannelManager,
  type AggregatedMetrics,
} from './channel-manager.js';

export {
  DiscordVoiceRestAPI,
  type JoinVoiceChannelRequest,
  type JoinVoiceChannelResponse,
  type LeaveVoiceChannelRequest,
  type LeaveVoiceChannelResponse,
  type BroadcastAudioRequest,
  type BroadcastAudioResponse,
  type StatusRequest,
  type ErrorResponse,
} from './rest-api.js';

// Direct call support (1-on-1 voice calls)
export {
  DiscordDirectCallConnector,
  CallState,
  type DirectCallConfig,
  type CallStats,
  type DirectCallTranscription,
} from './direct-call-connector.js';

export {
  DiscordCallManager,
  type CallManagerConfig,
  type CallRecord,
} from './call-manager.js';

export {
  DiscordCallResponder,
  createCallResponder,
  generateAndPlayCallResponse,
  type CallResponseConfig,
  type CallResponseContext,
  type CallResponseResult,
} from './call-responder.js';
