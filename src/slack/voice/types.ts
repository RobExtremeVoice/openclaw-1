/**
 * Slack Voice Configuration Types
 *
 * Defines types for voice message handling and response modality configuration
 */

/**
 * Response modality types for Slack voice messages
 * - 'voice': always respond with voice message
 * - 'text': always respond with text message
 * - 'match': respond in same format as user input (audio -> voice, text -> text)
 * - 'both': send both voice and text responses
 */
export type ResponseModality = 'voice' | 'text' | 'match' | 'both';

/**
 * Input modality type for detecting how user sent message
 */
export type InputModality = 'voice' | 'text';

/**
 * Slack Voice Configuration
 *
 * Controls how voice messages are processed and how responses are sent
 */
export interface SlackVoiceConfig {
  /**
   * Default response modality for all messages
   * 'match' (default): respond in same format as input
   * 'voice': always send voice responses
   * 'text': always send text responses
   * 'both': send both voice and text responses
   */
  messageResponse?: ResponseModality;

  /**
   * Per-channel modality overrides
   * Channels specified here take precedence over defaultResponse
   * Example: { 'C123456': 'voice', 'C789012': 'text' }
   */
  perChannelOverride?: Record<string, ResponseModality>;

  /**
   * Per-user modality overrides
   * Users specified here take precedence over channel and default settings
   * Example: { 'U123456': 'voice', 'U789012': 'both' }
   */
  perUserOverride?: Record<string, ResponseModality>;

  /**
   * Default response modality (used when messageResponse is not set)
   * Defaults to 'match' for natural user experience
   */
  defaultResponse?: ResponseModality;

  /**
   * Whether to include transcripts when sending voice responses
   * Defaults to true
   */
  includeTranscriptByDefault?: boolean;

  /**
   * Voice synthesis settings
   */
  defaultVoice?: string;
  defaultSpeed?: number;

  /**
   * Audio format settings
   */
  targetFormat?: 'mp3' | 'wav' | 'ogg';
  targetSampleRate?: number;
  targetBitrate?: number;
}

/**
 * Voice response metadata for tracking input/output modalities
 */
export interface VoiceResponseMetadata {
  inputModality: InputModality;
  outputModality: ResponseModality;
  reasonForModality: string; // e.g., "user-override", "channel-override", "default"
}
