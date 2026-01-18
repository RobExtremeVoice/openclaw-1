/**
 * Slack Voice Message Handler
 *
 * Handles incoming voice messages from Slack by:
 * - Listening for file_shared events with audio files
 * - Downloading and validating audio files
 * - Storing audio context for response generation
 * - Supporting multiple audio formats (MP3, WAV, OGG, M4A, etc.)
 */

import type { WebClient as SlackWebClient } from '@slack/web-api';
import { fileTypeFromBuffer } from 'file-type';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { RuntimeEnv } from '../../runtime.js';
import type { AudioBuffer, AudioFormat } from '../../media/voice-providers/executor.js';
import type { InputModality } from './types.js';

export interface SlackVoiceFile {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  url_private: string;
  url_private_download?: string;
  channels?: string[];
  user?: string;
  timestamp: number;
}

export interface SlackVoiceContext {
  fileId: string;
  channelId: string;
  userId?: string;
  audioPath: string;
  format: AudioFormat;
  duration?: number;
  sizeBytes: number;
  timestamp: number;
  transcription?: string;
  inputModality: InputModality;
}

export interface VoiceMessageHandlerOptions {
  maxFileSizeBytes?: number;
  supportedFormats?: string[];
  tempDir?: string;
  enableTranscription?: boolean;
}

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const SUPPORTED_AUDIO_MIMETYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/m4a',
  'audio/aac',
  'audio/x-m4a',
  'audio/mp4',
];

const AUDIO_FILE_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.opus',
  '.m4a',
  '.aac',
  '.webm',
];

/**
 * Voice message handler for Slack audio files
 */
export class SlackVoiceMessageHandler {
  private readonly maxSize: number;
  private readonly supportedFormats: string[];
  private readonly tempDir: string;
  private readonly enableTranscription: boolean;
  private readonly activeDownloads = new Map<string, Promise<SlackVoiceContext>>();

  constructor(
    private readonly client: SlackWebClient,
    private readonly runtime: RuntimeEnv,
    options?: VoiceMessageHandlerOptions,
  ) {
    this.maxSize = options?.maxFileSizeBytes ?? DEFAULT_MAX_SIZE;
    this.supportedFormats = options?.supportedFormats ?? SUPPORTED_AUDIO_MIMETYPES;
    this.tempDir = options?.tempDir ?? join(tmpdir(), 'clawdbot-slack-voice');
    this.enableTranscription = options?.enableTranscription ?? false;
  }

  /**
   * Check if a file is an audio file we can handle
   */
  isAudioFile(file: SlackVoiceFile): boolean {
    // Check mimetype
    if (file.mimetype && this.supportedFormats.includes(file.mimetype)) {
      return true;
    }

    // Check file extension as fallback
    const fileName = file.name?.toLowerCase() || '';
    return AUDIO_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext));
  }

  /**
   * Detect audio format from buffer and filename
   */
  private async detectAudioFormat(
    buffer: Buffer,
    fileName: string,
  ): Promise<AudioFormat> {
    // Try to detect from buffer content
    try {
      const fileType = await fileTypeFromBuffer(buffer);
      if (fileType) {
        switch (fileType.mime) {
          case 'audio/mpeg':
            return 'mp3' as AudioFormat;
          case 'audio/wav':
          case 'audio/wave':
          case 'audio/x-wav':
            return 'pcm16' as AudioFormat;
          case 'audio/ogg':
          case 'audio/opus':
            return 'opus' as AudioFormat;
          case 'audio/aac':
          case 'audio/m4a':
          case 'audio/x-m4a':
          case 'audio/mp4':
            return 'aac' as AudioFormat;
        }
      }
    } catch (err) {
      this.runtime.error?.(`Failed to detect file type: ${err}`);
    }

    // Fallback to file extension
    const ext = fileName.toLowerCase();
    if (ext.endsWith('.mp3')) return 'mp3' as AudioFormat;
    if (ext.endsWith('.wav')) return 'pcm16' as AudioFormat;
    if (ext.endsWith('.ogg') || ext.endsWith('.opus')) return 'opus' as AudioFormat;
    if (ext.endsWith('.m4a') || ext.endsWith('.aac')) return 'aac' as AudioFormat;

    // Default to MP3 (most common)
    return 'mp3' as AudioFormat;
  }

  /**
   * Download audio file from Slack
   */
  async downloadAudioFile(
    file: SlackVoiceFile,
    channelId: string,
  ): Promise<SlackVoiceContext> {
    // Check if already downloading
    const existing = this.activeDownloads.get(file.id);
    if (existing) {
      return existing;
    }

    // Start new download
    const downloadPromise = this._downloadAudioFileImpl(file, channelId);
    this.activeDownloads.set(file.id, downloadPromise);

    try {
      const result = await downloadPromise;
      return result;
    } finally {
      this.activeDownloads.delete(file.id);
    }
  }

  /**
   * Internal implementation of download logic
   */
  private async _downloadAudioFileImpl(
    file: SlackVoiceFile,
    channelId: string,
  ): Promise<SlackVoiceContext> {
    // Validate file size
    if (file.size > this.maxSize) {
      throw new Error(
        `Audio file too large: ${file.size} bytes (max: ${this.maxSize})`,
      );
    }

    // Get download URL
    const downloadUrl = file.url_private_download || file.url_private;
    if (!downloadUrl) {
      throw new Error('No download URL available for audio file');
    }

    // Download file with authentication
    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${await this.getBotToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download audio file: ${response.status} ${response.statusText}`,
      );
    }

    // Read file data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect format
    const format = await this.detectAudioFormat(buffer, file.name);

    // Save to temporary file
    const tempFileName = `slack-voice-${file.id}-${Date.now()}.${this.getFileExtension(format)}`;
    const tempPath = join(this.tempDir, tempFileName);

    // Ensure temp directory exists
    await this.ensureTempDir();

    // Write file
    await writeFile(tempPath, buffer);

    // Create context with voice modality (this is an audio file, so input is voice)
    const context: SlackVoiceContext = {
      fileId: file.id,
      channelId,
      userId: file.user,
      audioPath: tempPath,
      format,
      sizeBytes: buffer.length,
      timestamp: file.timestamp,
      inputModality: 'voice', // Audio files always have voice input modality
    };

    this.runtime.log?.(`Downloaded voice message: ${file.name} (${format}, ${buffer.length} bytes)`);

    return context;
  }

  /**
   * Get file extension for audio format
   */
  private getFileExtension(format: AudioFormat): string {
    switch (format) {
      case 'mp3': return 'mp3';
      case 'pcm16': return 'wav';
      case 'opus': return 'opus';
      case 'aac': return 'aac';
      case 'vorbis': return 'ogg';
      default: return 'bin';
    }
  }

  /**
   * Ensure temporary directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      const { mkdir } = await import('fs/promises');
      await mkdir(this.tempDir, { recursive: true });
    } catch (err) {
      // Ignore if already exists
    }
  }

  /**
   * Get bot token for API calls
   */
  private async getBotToken(): Promise<string> {
    // The token is already configured in the WebClient instance
    // This method exists for potential future token rotation support
    const token = (this.client as any).token;
    if (!token) {
      throw new Error('Slack bot token not configured');
    }
    return token;
  }

  /**
   * Clean up temporary audio file
   */
  async cleanup(context: SlackVoiceContext): Promise<void> {
    try {
      await unlink(context.audioPath);
      this.runtime.log?.(`Cleaned up voice file: ${context.audioPath}`);
    } catch (err) {
      this.runtime.error?.(`Failed to cleanup voice file: ${err}`);
    }
  }

  /**
   * Clean up all temporary files older than specified age
   */
  async cleanupOldFiles(maxAgeMs: number = 3600000): Promise<void> {
    try {
      const { readdir, stat, unlink } = await import('fs/promises');
      const files = await readdir(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith('slack-voice-')) continue;

        const filePath = join(this.tempDir, file);
        const stats = await stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          await unlink(filePath);
          this.runtime.log?.(`Cleaned up old voice file: ${file}`);
        }
      }
    } catch (err) {
      this.runtime.error?.(`Failed to cleanup old files: ${err}`);
    }
  }
}

/**
 * Extract audio metadata (duration, bitrate, etc.)
 */
export async function extractAudioMetadata(
  filePath: string,
): Promise<{ duration?: number; bitrate?: number }> {
  // TODO: Use ffprobe or similar to extract metadata
  // For now, return empty metadata
  return {};
}
