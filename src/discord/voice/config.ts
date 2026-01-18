/**
 * Discord Voice Message Configuration
 *
 * Manages configuration for voice message responses including
 * voice/text/both modes with per-guild, per-channel, and per-user overrides.
 */

/**
 * Voice message response type
 * - 'voice': Always respond with voice messages
 * - 'text': Always respond with text messages
 * - 'both': Always respond with both voice and text
 * - 'match': Respond in the same modality as the user input
 */
export type VoiceResponseType = 'voice' | 'text' | 'both' | 'match';

/**
 * Audio format for voice message responses
 */
export type VoiceMessageFormat = 'mp3' | 'ogg';

/**
 * Audio quality settings
 */
export type AudioQuality = 'high' | 'medium' | 'low';

/**
 * Quality-specific bitrate settings
 */
const QUALITY_BITRATES: Record<AudioQuality, number> = {
  high: 128000, // 128kbps
  medium: 64000, // 64kbps
  low: 32000, // 32kbps
};

/**
 * Discord voice message configuration
 */
export interface DiscordVoiceConfig {
  /** Global default response type */
  messageResponse: VoiceResponseType;

  /** Per-guild overrides (keyed by guild ID) */
  perGuildOverride?: Record<string, VoiceResponseType>;

  /** Per-channel overrides (keyed by channel ID) */
  perChannelOverride?: Record<string, VoiceResponseType>;

  /** Per-user overrides (keyed by user ID) */
  perUserOverride?: Record<string, VoiceResponseType>;

  /** Audio format for voice responses */
  voiceFormat: VoiceMessageFormat;

  /** Audio quality setting */
  audioQuality: AudioQuality;

  /** TTS provider to use (default: 'cartesia') */
  ttsProvider?: 'cartesia' | 'elevenlabs' | 'kokoro';

  /** Voice ID for TTS provider */
  voiceId?: string;

  /** Max audio message size in MB (Discord max is 25MB) */
  maxAudioSizeMb?: number;

  /** Enable voice message support (default: true) */
  enabled?: boolean;
}

/**
 * Default voice message configuration
 */
export const DEFAULT_VOICE_CONFIG: DiscordVoiceConfig = {
  messageResponse: 'match', // Natural UX: respond in same modality as user
  voiceFormat: 'mp3', // MP3 is smaller and widely supported
  audioQuality: 'medium', // Balance size/quality
  ttsProvider: 'cartesia',
  maxAudioSizeMb: 24, // Leave 1MB buffer from Discord's 25MB limit
  enabled: true,
};

/**
 * Input modality detected from the message
 */
export type InputModality = 'voice' | 'text' | 'voice-channel';

/**
 * Detect input modality from message
 */
export function detectInputModality(message: {
  hasVoiceAttachment?: boolean;
  isVoiceChannel?: boolean;
}): InputModality {
  if (message.hasVoiceAttachment) {
    return 'voice';
  }
  if (message.isVoiceChannel) {
    return 'voice-channel';
  }
  return 'text';
}

/**
 * Resolve voice response type for a given context
 *
 * Priority: user override > channel override > guild override > global default
 * If resolved type is 'match', returns the appropriate response based on input modality.
 */
export function resolveVoiceResponseType(
  config: DiscordVoiceConfig,
  context: {
    guildId?: string;
    channelId?: string;
    userId?: string;
    inputModality?: InputModality;
  },
): VoiceResponseType {
  // User override has highest priority
  let responseType: VoiceResponseType;

  if (context.userId && config.perUserOverride?.[context.userId]) {
    responseType = config.perUserOverride[context.userId];
  }
  // Channel override
  else if (context.channelId && config.perChannelOverride?.[context.channelId]) {
    responseType = config.perChannelOverride[context.channelId];
  }
  // Guild override
  else if (context.guildId && config.perGuildOverride?.[context.guildId]) {
    responseType = config.perGuildOverride[context.guildId];
  }
  // Global default
  else {
    responseType = config.messageResponse;
  }

  // If responseType is 'match', resolve based on input modality
  if (responseType === 'match' && context.inputModality) {
    switch (context.inputModality) {
      case 'voice':
        return 'voice'; // Audio message input → voice response
      case 'voice-channel':
        return 'voice'; // Voice channel input → voice response
      case 'text':
        return 'text'; // Text message input → text response
    }
  }

  // If responseType is 'match' but no modality detected, default to text
  if (responseType === 'match') {
    return 'text';
  }

  return responseType;
}

/**
 * Get bitrate for audio quality setting
 */
export function getQualityBitrate(quality: AudioQuality): number {
  return QUALITY_BITRATES[quality];
}

/**
 * Validate voice message configuration
 */
export function validateVoiceConfig(config: Partial<DiscordVoiceConfig>): string[] {
  const errors: string[] = [];

  if (config.maxAudioSizeMb && config.maxAudioSizeMb > 25) {
    errors.push('maxAudioSizeMb cannot exceed 25 (Discord limit)');
  }

  if (config.messageResponse && !['voice', 'text', 'both', 'match'].includes(config.messageResponse)) {
    errors.push(`Invalid messageResponse: ${config.messageResponse}`);
  }

  if (config.voiceFormat && !['mp3', 'ogg'].includes(config.voiceFormat)) {
    errors.push(`Invalid voiceFormat: ${config.voiceFormat}`);
  }

  if (config.audioQuality && !['high', 'medium', 'low'].includes(config.audioQuality)) {
    errors.push(`Invalid audioQuality: ${config.audioQuality}`);
  }

  return errors;
}

/**
 * Merge voice config with defaults
 */
export function mergeVoiceConfig(
  config: Partial<DiscordVoiceConfig>,
): DiscordVoiceConfig {
  return {
    ...DEFAULT_VOICE_CONFIG,
    ...config,
  };
}

/**
 * Check if voice messages are enabled
 */
export function isVoiceMessagesEnabled(config: DiscordVoiceConfig): boolean {
  return config.enabled !== false;
}
