/**
 * Telegram Voice Message Handler
 *
 * Handles incoming voice messages from Telegram users:
 * - Detects voice message type in updates
 * - Downloads Ogg Opus audio from Telegram CDN
 * - Optional transcription via speech-to-text provider
 * - Extracts metadata (duration, user, chat context)
 * - Supports both private and group chats
 */

import type { Message } from "@grammyjs/types";
import { downloadTelegramFile, getTelegramFile } from "../download.js";
import type { SavedMedia } from "../../media/store.js";

export interface VoiceMessageMetadata {
  /** Voice message duration in seconds */
  duration: number;
  /** File size in bytes */
  fileSize?: number;
  /** Telegram file ID */
  fileId: string;
  /** Telegram unique file ID */
  fileUniqueId?: string;
  /** MIME type (audio/ogg for voice) */
  mimeType?: string;
  /** User who sent the voice message */
  userId: number;
  /** Username if available */
  username?: string;
  /** First name of user */
  firstName?: string;
  /** Chat ID where message was sent */
  chatId: number;
  /** Chat type (private, group, supergroup) */
  chatType: "private" | "group" | "supergroup" | "channel";
  /** Message ID for replies */
  messageId: number;
  /** Thread/topic ID for forum groups */
  threadId?: number;
  /** Timestamp when message was received */
  timestamp: number;
}

export interface VoiceMessageDownload {
  /** Downloaded audio file metadata */
  media: SavedMedia;
  /** Extracted metadata from Telegram */
  metadata: VoiceMessageMetadata;
  /** Optional transcription text */
  transcription?: string;
}

export interface TranscriptionProvider {
  /** Transcribe audio file to text */
  transcribe(audioPath: string, mimeType?: string): Promise<string>;
}

export interface VoiceMessageHandlerOptions {
  /** Telegram bot API token */
  token: string;
  /** Maximum file size in bytes (default: 20MB) */
  maxBytes?: number;
  /** Optional transcription provider */
  transcriptionProvider?: TranscriptionProvider;
  /** Enable transcription for private chats (default: true) */
  transcribePrivateChats?: boolean;
  /** Enable transcription for group chats (default: false) */
  transcribeGroupChats?: boolean;
  /** Custom fetch function for proxying */
  proxyFetch?: typeof fetch;
}

/**
 * Check if a Telegram message contains a voice message.
 */
export function isVoiceMessage(msg: Message): boolean {
  return "voice" in msg && msg.voice !== undefined;
}

/**
 * Extract voice message metadata from Telegram message.
 */
export function extractVoiceMetadata(msg: Message): VoiceMessageMetadata | null {
  if (!isVoiceMessage(msg)) {
    return null;
  }

  const voice = msg.voice!;
  const isForum = (msg.chat as { is_forum?: boolean }).is_forum === true;
  const messageThreadId = (msg as { message_thread_id?: number }).message_thread_id;

  return {
    duration: voice.duration,
    fileSize: voice.file_size,
    fileId: voice.file_id,
    fileUniqueId: voice.file_unique_id,
    mimeType: voice.mime_type ?? "audio/ogg",
    userId: msg.from?.id ?? 0,
    username: msg.from?.username,
    firstName: msg.from?.first_name,
    chatId: msg.chat.id,
    chatType: msg.chat.type as "private" | "group" | "supergroup" | "channel",
    messageId: msg.message_id,
    threadId: isForum ? messageThreadId : undefined,
    timestamp: msg.date * 1000, // Convert to milliseconds
  };
}

/**
 * Download voice message from Telegram servers.
 */
export async function downloadVoiceMessage(
  fileId: string,
  token: string,
  maxBytes?: number,
  proxyFetch?: typeof fetch,
): Promise<SavedMedia> {
  // Get file path from Telegram API
  const fileInfo = await getTelegramFile(token, fileId);

  // Download the file using existing download utilities
  const media = await downloadTelegramFile(token, fileInfo, maxBytes);

  // Ensure MIME type is set for Ogg Opus
  if (!media.contentType) {
    media.contentType = "audio/ogg";
  }

  return media;
}

/**
 * Process voice message with optional transcription.
 */
export async function processVoiceMessage(
  msg: Message,
  options: VoiceMessageHandlerOptions,
): Promise<VoiceMessageDownload | null> {
  const metadata = extractVoiceMetadata(msg);
  if (!metadata) {
    return null;
  }

  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024; // 20MB default

  // Download voice message
  const media = await downloadVoiceMessage(
    metadata.fileId,
    options.token,
    maxBytes,
    options.proxyFetch,
  );

  // Determine if transcription should be performed
  const shouldTranscribe =
    options.transcriptionProvider &&
    ((metadata.chatType === "private" && options.transcribePrivateChats !== false) ||
      ((metadata.chatType === "group" || metadata.chatType === "supergroup") &&
        options.transcribeGroupChats === true));

  let transcription: string | undefined;

  if (shouldTranscribe && options.transcriptionProvider) {
    try {
      transcription = await options.transcriptionProvider.transcribe(
        media.path,
        media.contentType ?? undefined,
      );
    } catch (error) {
      // Log transcription errors but don't fail the entire process
      console.error("[VoiceHandler] Transcription failed:", error);
      transcription = undefined;
    }
  }

  return {
    media,
    metadata,
    transcription,
  };
}

/**
 * Voice message handler class for stateful operation.
 */
export class VoiceMessageHandler {
  private options: VoiceMessageHandlerOptions;

  constructor(options: VoiceMessageHandlerOptions) {
    this.options = options;
  }

  /**
   * Check if message is a voice message.
   */
  isVoice(msg: Message): boolean {
    return isVoiceMessage(msg);
  }

  /**
   * Process a voice message and return download with metadata.
   */
  async process(msg: Message): Promise<VoiceMessageDownload | null> {
    return processVoiceMessage(msg, this.options);
  }

  /**
   * Extract metadata without downloading.
   */
  extractMetadata(msg: Message): VoiceMessageMetadata | null {
    return extractVoiceMetadata(msg);
  }

  /**
   * Update transcription settings.
   */
  setTranscriptionSettings(settings: {
    provider?: TranscriptionProvider;
    privateChats?: boolean;
    groupChats?: boolean;
  }): void {
    if (settings.provider !== undefined) {
      this.options.transcriptionProvider = settings.provider;
    }
    if (settings.privateChats !== undefined) {
      this.options.transcribePrivateChats = settings.privateChats;
    }
    if (settings.groupChats !== undefined) {
      this.options.transcribeGroupChats = settings.groupChats;
    }
  }
}

/**
 * Create a voice message handler instance.
 */
export function createVoiceMessageHandler(
  options: VoiceMessageHandlerOptions,
): VoiceMessageHandler {
  return new VoiceMessageHandler(options);
}
