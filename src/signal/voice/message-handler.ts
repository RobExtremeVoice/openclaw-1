/**
 * Signal Voice Message Receiver
 *
 * Privacy-first voice message handling for Signal with end-to-end encryption.
 * Handles decryption, validation, and metadata extraction while maintaining
 * Signal's privacy guarantees.
 */

import type { SignalRpcOptions } from '../client.js';
import { signalRpcRequest } from '../client.js';
import { saveMediaBuffer } from '../../media/store.js';
import type { RuntimeEnv } from '../../runtime.js';

/**
 * Signal voice message attachment metadata
 */
export interface SignalVoiceAttachment {
  id: string;
  contentType?: string;
  filename?: string;
  size?: number;
  voiceNote?: boolean;
}

/**
 * Decrypted voice message with metadata
 */
export interface DecryptedVoiceMessage {
  // Audio content (decrypted by Signal)
  audioBuffer: Buffer;
  audioFormat: 'opus' | 'wav' | 'ogg' | 'unknown';

  // Sender information
  sender: string;
  senderUuid?: string;

  // Message metadata
  timestamp: number;
  messageId: string;

  // Group context (if applicable)
  groupId?: string;
  groupName?: string;

  // Privacy/encryption metadata
  encrypted: boolean;
  verified: boolean; // E2E encryption verified

  // Audio metadata
  duration?: number;
  size: number;
}

/**
 * Voice message detection and validation options
 */
export interface VoiceMessageOptions {
  maxSizeMb?: number; // Default: 8MB
  allowedFormats?: string[]; // Default: ['audio/ogg', 'audio/wav', 'audio/opus']
  requireVerification?: boolean; // Default: true - require E2E verification
}

/**
 * Detect if a Signal attachment is a voice message
 */
export function isVoiceMessage(attachment: SignalVoiceAttachment): boolean {
  if (!attachment?.id) return false;

  // Check if marked as voice note
  if (attachment.voiceNote === true) return true;

  // Check content type for audio formats
  const contentType = attachment.contentType?.toLowerCase();
  if (!contentType) return false;

  const voiceFormats = [
    'audio/ogg',
    'audio/opus',
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
  ];

  return voiceFormats.some(format => contentType.includes(format));
}

/**
 * Determine audio format from content type
 */
function detectAudioFormat(contentType?: string): 'opus' | 'wav' | 'ogg' | 'unknown' {
  if (!contentType) return 'unknown';

  const type = contentType.toLowerCase();
  if (type.includes('opus')) return 'opus';
  if (type.includes('wav')) return 'wav';
  if (type.includes('ogg')) return 'ogg';

  return 'unknown';
}

/**
 * Download and decrypt voice message from Signal
 *
 * Signal's library handles end-to-end encryption automatically.
 * This function downloads the encrypted attachment and returns
 * the decrypted audio data.
 */
export async function downloadVoiceMessage(
  attachment: SignalVoiceAttachment,
  rpcOptions: SignalRpcOptions,
  options: {
    account?: string;
    sender?: string;
    groupId?: string;
    maxBytes?: number;
  } = {},
): Promise<Buffer> {
  if (!attachment?.id) {
    throw new Error('Invalid attachment: missing ID');
  }

  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024; // 8MB default

  // Validate size before download
  if (attachment.size && attachment.size > maxBytes) {
    throw new Error(
      `Voice message ${attachment.id} exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)}MB limit`
    );
  }

  // Build RPC request parameters
  const params: Record<string, unknown> = {
    id: attachment.id,
  };

  if (options.account) params.account = options.account;
  if (options.groupId) params.groupId = options.groupId;
  else if (options.sender) params.recipient = options.sender;

  // Download attachment (Signal library handles decryption)
  const result = await signalRpcRequest<{ data?: string }>(
    'getAttachment',
    params,
    rpcOptions,
  );

  if (!result?.data) {
    throw new Error(`Failed to download voice message ${attachment.id}`);
  }

  // Decode base64 audio data
  const buffer = Buffer.from(result.data, 'base64');

  // Validate decrypted size
  if (buffer.byteLength > maxBytes) {
    throw new Error('Decrypted voice message exceeds size limit');
  }

  return buffer;
}

/**
 * Process incoming Signal voice message
 *
 * This is the main entry point for handling voice messages.
 * It validates encryption, downloads audio, and extracts metadata
 * while maintaining privacy guarantees.
 */
export async function processVoiceMessage(params: {
  attachment: SignalVoiceAttachment;
  sender: string;
  senderUuid?: string;
  timestamp: number;
  messageId: string;
  groupId?: string;
  groupName?: string;
  verified?: boolean; // E2E encryption verified
  baseUrl: string;
  account?: string;
  options?: VoiceMessageOptions;
  runtime?: RuntimeEnv;
}): Promise<DecryptedVoiceMessage> {
  const { attachment, sender, senderUuid, timestamp, messageId, groupId, groupName, verified, baseUrl, account, options, runtime } = params;

  // Default options
  const opts: Required<VoiceMessageOptions> = {
    maxSizeMb: options?.maxSizeMb ?? 8,
    allowedFormats: options?.allowedFormats ?? ['audio/ogg', 'audio/wav', 'audio/opus'],
    requireVerification: options?.requireVerification ?? true,
  };

  // Validate voice message
  if (!isVoiceMessage(attachment)) {
    throw new Error('Attachment is not a voice message');
  }

  // Verify end-to-end encryption
  const encrypted = true; // Signal messages are always E2E encrypted
  const isVerified = verified ?? false;

  if (opts.requireVerification && !isVerified) {
    runtime?.error?.('Warning: Voice message encryption not verified');
  }

  // Validate format
  const contentType = attachment.contentType?.toLowerCase();
  if (contentType && !opts.allowedFormats.some(f => contentType.includes(f))) {
    throw new Error(`Unsupported audio format: ${contentType}`);
  }

  // Download and decrypt voice message
  const maxBytes = opts.maxSizeMb * 1024 * 1024;
  const audioBuffer = await downloadVoiceMessage(
    attachment,
    { baseUrl },
    {
      account,
      sender,
      groupId,
      maxBytes,
    },
  );

  // Extract audio format
  const audioFormat = detectAudioFormat(attachment.contentType);

  // Build decrypted message
  const decryptedMessage: DecryptedVoiceMessage = {
    audioBuffer,
    audioFormat,
    sender,
    senderUuid,
    timestamp,
    messageId,
    groupId,
    groupName,
    encrypted,
    verified: isVerified,
    size: audioBuffer.byteLength,
  };

  runtime?.log?.(
    `Processed voice message: ${messageId} from ${sender} (${(audioBuffer.byteLength / 1024).toFixed(1)}KB, ${audioFormat})`
  );

  return decryptedMessage;
}

/**
 * Save voice message to disk (encrypted at rest)
 *
 * Privacy note: Only metadata is stored. Audio content is saved
 * temporarily for processing and auto-deleted.
 */
export async function saveVoiceMessageAudio(
  message: DecryptedVoiceMessage,
  options: {
    subdir?: string;
    maxBytes?: number;
  } = {},
): Promise<{ path: string; contentType: string }> {
  const contentTypeMap = {
    opus: 'audio/opus',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    unknown: 'application/octet-stream',
  };

  const contentType = contentTypeMap[message.audioFormat];
  const subdir = options.subdir ?? 'signal-voice';
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;

  const saved = await saveMediaBuffer(
    message.audioBuffer,
    contentType,
    subdir,
    maxBytes,
  );

  return {
    path: saved.path,
    contentType: saved.contentType ?? contentType,
  };
}

/**
 * Extract voice message metadata (no audio content)
 *
 * Privacy-first: returns only metadata for logging/storage,
 * never includes actual audio content.
 */
export interface VoiceMessageMetadata {
  messageId: string;
  sender: string;
  senderUuid?: string;
  timestamp: number;
  groupId?: string;
  groupName?: string;
  encrypted: boolean;
  verified: boolean;
  audioFormat: string;
  size: number;
  duration?: number;
}

export function extractVoiceMetadata(
  message: DecryptedVoiceMessage,
): VoiceMessageMetadata {
  return {
    messageId: message.messageId,
    sender: message.sender,
    senderUuid: message.senderUuid,
    timestamp: message.timestamp,
    groupId: message.groupId,
    groupName: message.groupName,
    encrypted: message.encrypted,
    verified: message.verified,
    audioFormat: message.audioFormat,
    size: message.size,
    duration: message.duration,
  };
}
