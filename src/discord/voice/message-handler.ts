/**
 * Discord Audio Message Receiver
 *
 * Detects and processes audio message attachments from Discord messages.
 * Supports MP3, WAV, OGG, FLAC formats with validation and metadata extraction.
 *
 * Features:
 * - Detect audio attachments by content-type
 * - Download audio from Discord CDN
 * - Validate audio format and size
 * - Extract metadata (duration, user, channel, message_id)
 * - Support channels, threads, and DMs
 * - Error handling for corrupted/invalid audio
 */

import type { Message, APIAttachment } from '@buape/carbon';
import { getChildLogger } from '../../logging.js';
import type { RuntimeEnv } from '../../runtime.js';

const logger = getChildLogger({ module: 'discord-voice-messages' });

/**
 * Supported audio MIME types for Discord voice messages
 */
const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg', // MP3
  'audio/mp3', // MP3 (alternate)
  'audio/wav', // WAV
  'audio/wave', // WAV (alternate)
  'audio/ogg', // OGG
  'audio/vorbis', // OGG Vorbis
  'audio/flac', // FLAC
  'audio/x-flac', // FLAC (alternate)
];

/**
 * Audio file extensions to check
 */
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.opus'];

/**
 * Discord max file size (25MB)
 */
const DISCORD_MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Audio message metadata extracted from Discord
 */
export interface AudioMessageMetadata {
  /** Audio duration in seconds (if available) */
  duration?: number;

  /** User ID who sent the audio */
  userId: string;

  /** User display name */
  userName: string;

  /** Channel ID where audio was sent */
  channelId: string;

  /** Channel name (if available) */
  channelName?: string;

  /** Guild ID (if in a guild) */
  guildId?: string;

  /** Guild name (if available) */
  guildName?: string;

  /** Message ID for threading/replies */
  messageId: string;

  /** Thread ID if message is in a thread */
  threadId?: string;

  /** Reply-to message ID if message is a reply */
  replyToMessageId?: string;

  /** Timestamp when audio was sent */
  timestamp: Date;

  /** Audio file size in bytes */
  fileSizeBytes: number;

  /** Original filename */
  filename: string;

  /** Content type */
  contentType: string;
}

/**
 * Downloaded audio data with metadata
 */
export interface DownloadedAudioMessage {
  /** Audio data as Buffer */
  audioData: Buffer;

  /** Metadata about the audio message */
  metadata: AudioMessageMetadata;
}

/**
 * Check if message has audio attachments
 */
export function hasAudioAttachment(message: Message): boolean {
  if (!message.attachments || message.attachments.length === 0) {
    return false;
  }

  return message.attachments.some((attachment) => isAudioAttachment(attachment));
}

/**
 * Check if attachment is an audio file
 */
function isAudioAttachment(attachment: APIAttachment): boolean {
  // Check content type first (most reliable)
  if (attachment.content_type && SUPPORTED_AUDIO_TYPES.includes(attachment.content_type)) {
    return true;
  }

  // Fallback: check file extension
  const filename = attachment.filename?.toLowerCase() || '';
  return AUDIO_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

/**
 * Get audio attachments from message
 */
export function getAudioAttachments(message: Message): APIAttachment[] {
  if (!message.attachments || message.attachments.length === 0) {
    return [];
  }

  return message.attachments.filter((attachment) => isAudioAttachment(attachment));
}

/**
 * Extract audio metadata from message and attachment
 */
export function extractAudioMetadata(
  message: Message,
  attachment: APIAttachment,
  context: {
    channelName?: string;
    guildName?: string;
    userName?: string;
  },
): AudioMessageMetadata {
  const author = message.author;
  if (!author) {
    throw new Error('Cannot extract metadata from message without author');
  }

  return {
    userId: author.id,
    userName: context.userName || author.username || author.id,
    channelId: message.channelId,
    channelName: context.channelName,
    guildId: undefined, // Guild ID not available on Message type in Carbon
    guildName: context.guildName,
    messageId: message.id,
    threadId: undefined, // Will be set by caller if in thread
    replyToMessageId: message.messageReference?.message_id,
    timestamp: new Date(message.timestamp),
    fileSizeBytes: attachment.size || 0,
    filename: attachment.filename || 'audio.mp3',
    contentType: attachment.content_type || 'audio/mpeg',
  };
}

/**
 * Validate audio attachment size and format
 */
export function validateAudioAttachment(
  attachment: APIAttachment,
  maxSizeBytes: number = DISCORD_MAX_FILE_SIZE,
): { valid: boolean; error?: string } {
  // Check size
  if (attachment.size && attachment.size > maxSizeBytes) {
    return {
      valid: false,
      error: `Audio file too large: ${(attachment.size / 1024 / 1024).toFixed(2)}MB (max: ${(maxSizeBytes / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  // Check format
  if (!isAudioAttachment(attachment)) {
    return {
      valid: false,
      error: `Unsupported audio format: ${attachment.content_type || 'unknown'}`,
    };
  }

  return { valid: true };
}

/**
 * Download audio attachment from Discord CDN
 */
export async function downloadAudioAttachment(
  attachment: APIAttachment,
  runtime: RuntimeEnv,
): Promise<Buffer> {
  if (!attachment.url) {
    throw new Error('Attachment URL is missing');
  }

  try {
    logger.info(
      {
        url: attachment.url,
        filename: attachment.filename,
        size: attachment.size,
      },
      'Downloading audio attachment',
    );

    const response = await fetch(attachment.url);

    if (!response.ok) {
      throw new Error(`Failed to download audio: HTTP ${response.status}`);
    }

    // Verify content type from response headers
    const contentTypeHeader = response.headers.get('content-type') || '';
    const contentType = contentTypeHeader.split(';')[0].trim(); // Remove charset info
    if (contentType && !SUPPORTED_AUDIO_TYPES.includes(contentType)) {
      logger.warn(
        {
          contentType,
          expectedTypes: SUPPORTED_AUDIO_TYPES,
        },
        'Downloaded file has unexpected content type',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify size matches
    if (attachment.size && buffer.length !== attachment.size) {
      logger.warn(
        {
          expected: attachment.size,
          actual: buffer.length,
        },
        'Downloaded file size mismatch',
      );
    }

    logger.info(
      {
        filename: attachment.filename,
        size: buffer.length,
      },
      'Audio attachment downloaded successfully',
    );

    return buffer;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        url: attachment.url,
      },
      'Failed to download audio attachment',
    );
    throw new Error(
      `Failed to download audio: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Process audio message attachment
 *
 * Downloads audio and extracts metadata for further processing.
 */
export async function processAudioMessage(
  message: Message,
  attachment: APIAttachment,
  context: {
    channelName?: string;
    guildName?: string;
    userName?: string;
    runtime: RuntimeEnv;
    maxSizeBytes?: number;
  },
): Promise<DownloadedAudioMessage> {
  // Validate attachment
  const validation = validateAudioAttachment(attachment, context.maxSizeBytes);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Download audio data
  const audioData = await downloadAudioAttachment(attachment, context.runtime);

  // Extract metadata
  const metadata = extractAudioMetadata(message, attachment, {
    channelName: context.channelName,
    guildName: context.guildName,
    userName: context.userName,
  });

  return {
    audioData,
    metadata,
  };
}

/**
 * Get audio format from content type
 */
export function getAudioFormat(contentType: string): 'mp3' | 'wav' | 'ogg' | 'flac' | 'unknown' {
  if (contentType.includes('mpeg') || contentType.includes('mp3')) {
    return 'mp3';
  }
  if (contentType.includes('wav') || contentType.includes('wave')) {
    return 'wav';
  }
  if (contentType.includes('ogg') || contentType.includes('vorbis')) {
    return 'ogg';
  }
  if (contentType.includes('flac')) {
    return 'flac';
  }
  return 'unknown';
}

/**
 * Check if message is a voice message context
 */
export function isVoiceMessageContext(message: Message): boolean {
  // Voice messages from mobile clients often have specific flags
  // or are sent as attachments with no text
  return (
    hasAudioAttachment(message) &&
    (!message.content || message.content.trim().length === 0)
  );
}
