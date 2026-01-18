/**
 * WhatsApp Voice Message Handler
 *
 * Handles incoming voice messages from WhatsApp by:
 * - Detecting audio attachments in webhook callbacks
 * - Downloading audio files from WhatsApp Cloud API
 * - Validating audio format and size
 * - Managing temporary file cleanup
 *
 * WhatsApp Cloud API delivers voice messages with media_id in webhook,
 * requiring download via GET /media/{media_id} endpoint.
 */

import { readFile, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { RuntimeEnv } from '../../runtime.js';
import type { AudioBuffer, AudioFormat } from '../../media/voice-providers/executor.js';

/**
 * WhatsApp voice file attachment from webhook
 */
export interface WhatsAppVoiceFile {
  id: string; // media_id
  mimetype: string; // e.g., audio/ogg, audio/opus
  url?: string; // Optional direct download URL
  timestamp: number;
  sizeBytes?: number; // Available if webhook includes size
}

/**
 * WhatsApp voice context for processing
 */
export interface WhatsAppVoiceContext {
  mediaId: string;
  phoneNumber?: string;
  audioPath: string;
  format: AudioFormat;
  sizeBytes: number;
  timestamp: number;
  mimeType: string;
}

export interface VoiceMessageHandlerOptions {
  maxFileSizeBytes?: number;
  supportedFormats?: string[];
  tempDir?: string;
}

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB

// WhatsApp typically uses OGG/Opus for voice messages
const SUPPORTED_AUDIO_MIMETYPES = [
  'audio/ogg',
  'audio/opus',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/aac',
  'audio/m4a',
  'audio/webm',
];

/**
 * Voice message handler for WhatsApp audio files
 */
export class WhatsAppVoiceMessageHandler {
  private readonly maxSize: number;
  private readonly supportedFormats: string[];
  private readonly tempDir: string;
  private readonly activeDownloads = new Map<string, Promise<WhatsAppVoiceContext>>();

  constructor(
    private readonly apiToken: string,
    private readonly businessAccountId: string,
    private readonly runtime: RuntimeEnv,
    options?: VoiceMessageHandlerOptions,
  ) {
    this.maxSize = options?.maxFileSizeBytes ?? DEFAULT_MAX_SIZE;
    this.supportedFormats = options?.supportedFormats ?? SUPPORTED_AUDIO_MIMETYPES;
    this.tempDir = options?.tempDir ?? join(tmpdir(), 'clawdbot-whatsapp-voice');
  }

  /**
   * Check if a file is an audio file we can handle
   */
  isAudioFile(file: WhatsAppVoiceFile): boolean {
    if (!file.mimetype) return false;

    // Check if mimetype is in supported list
    const mimeType = file.mimetype.toLowerCase();
    return this.supportedFormats.some(
      fmt => mimeType === fmt || mimeType.startsWith(fmt.split('/')[0] + '/'),
    );
  }

  /**
   * Detect audio format from MIME type
   */
  private detectAudioFormat(mimeType: string): AudioFormat {
    const mime = mimeType.toLowerCase();

    if (mime.includes('ogg') || mime.includes('opus')) {
      return 'opus' as AudioFormat;
    }
    if (mime.includes('mpeg') || mime.includes('mp3')) {
      return 'mp3' as AudioFormat;
    }
    if (mime.includes('wav')) {
      return 'pcm16' as AudioFormat;
    }
    if (mime.includes('aac') || mime.includes('m4a')) {
      return 'aac' as AudioFormat;
    }

    // Default to opus (WhatsApp standard)
    return 'opus' as AudioFormat;
  }

  /**
   * Download audio file from WhatsApp Cloud API
   *
   * Uses the Media Download API endpoint:
   * GET https://graph.instagram.com/{version}/media/{media_id}
   * with Authorization header
   */
  async downloadAudioFile(file: WhatsAppVoiceFile): Promise<WhatsAppVoiceContext> {
    // Check if already downloading
    const existing = this.activeDownloads.get(file.id);
    if (existing) {
      return existing;
    }

    // Start new download
    const downloadPromise = this._downloadAudioFileImpl(file);
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
  private async _downloadAudioFileImpl(file: WhatsAppVoiceFile): Promise<WhatsAppVoiceContext> {
    // Validate file size if available
    if (file.sizeBytes && file.sizeBytes > this.maxSize) {
      throw new Error(`Audio file too large: ${file.sizeBytes} bytes (max: ${this.maxSize})`);
    }

    // Validate mime type
    if (!this.isAudioFile(file)) {
      throw new Error(`Unsupported audio format: ${file.mimetype}`);
    }

    // Construct download URL
    // WhatsApp uses Media Download API: GET /media/{media_id}
    const downloadUrl = `https://graph.instagram.com/v21.0/${file.id}`;

    try {
      // Download file from WhatsApp Cloud API
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download audio file from WhatsApp: ${response.status} ${response.statusText}`,
        );
      }

      // Get media data
      const buffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(buffer);

      // Validate downloaded size
      if (audioBuffer.length > this.maxSize) {
        throw new Error(
          `Downloaded file too large: ${audioBuffer.length} bytes (max: ${this.maxSize})`,
        );
      }

      // Detect format from MIME type
      const format = this.detectAudioFormat(file.mimetype);

      // Save to temporary file
      const fileExtension = this.getFileExtension(format);
      const tempFileName = `whatsapp-voice-${file.id}-${Date.now()}.${fileExtension}`;
      const tempPath = join(this.tempDir, tempFileName);

      // Ensure temp directory exists
      await this.ensureTempDir();

      // Write file
      await writeFile(tempPath, audioBuffer);

      // Create context
      const context: WhatsAppVoiceContext = {
        mediaId: file.id,
        audioPath: tempPath,
        format,
        sizeBytes: audioBuffer.length,
        timestamp: file.timestamp,
        mimeType: file.mimetype,
      };

      this.runtime.log?.(
        `Downloaded WhatsApp voice message: ${file.id} (${format}, ${audioBuffer.length} bytes)`,
      );

      return context;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`WhatsApp voice download failed: ${msg}`);
    }
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
   * Clean up temporary audio file
   */
  async cleanup(context: WhatsAppVoiceContext): Promise<void> {
    try {
      await unlink(context.audioPath);
      this.runtime.log?.(`Cleaned up WhatsApp voice file: ${context.audioPath}`);
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
        if (!file.startsWith('whatsapp-voice-')) continue;

        const filePath = join(this.tempDir, file);
        const stats = await stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          await unlink(filePath);
          this.runtime.log?.(`Cleaned up old WhatsApp voice file: ${file}`);
        }
      }
    } catch (err) {
      this.runtime.error?.(`Failed to cleanup old files: ${err}`);
    }
  }
}
