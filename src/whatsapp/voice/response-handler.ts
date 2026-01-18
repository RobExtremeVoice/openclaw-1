/**
 * WhatsApp Voice Response Handler
 *
 * Handles voice bot responses in WhatsApp by:
 * - Synthesizing text responses using TTS providers
 * - Converting audio to OGG/Opus format for WhatsApp compatibility
 * - Uploading audio via WhatsApp Cloud API
 * - Supporting text-only fallback responses
 *
 * WhatsApp expects voice messages in OGG/Opus format (32kbps, 48kHz, mono)
 * matching Deepgram/Cartesia STT output natively.
 */

import { readFile, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

import type { RuntimeEnv } from '../../runtime.js';
import type { AudioBuffer, AudioFormat, SynthesisOptions } from '../../media/voice-providers/executor.js';
import { loadVoiceConfig } from '../../commands/voice/helpers.js';
import { initializeRegistry } from '../../commands/voice/helpers.js';

export interface WhatsAppVoiceResponseOptions {
  phoneNumber: string;
  text: string;
  voice?: string;
  speed?: number;
  enableVoiceResponse?: boolean;
  tempDir?: string;
}

export interface WhatsAppVoiceUploadResult {
  messageId: string;
  timestamp: number;
}

export interface VoiceResponseConfig {
  defaultVoice?: string;
  defaultSpeed?: number;
  targetFormat?: AudioFormat;
  targetSampleRate?: number;
  targetBitrate?: number;
  enableVoiceResponseByDefault?: boolean;
  tempDir?: string;
}

const DEFAULT_SAMPLE_RATE = 48000; // WhatsApp standard
const DEFAULT_BITRATE = 32; // kbps - WhatsApp standard
const DEFAULT_FORMAT: AudioFormat = 'opus' as AudioFormat;

/**
 * Voice response handler for WhatsApp
 */
export class WhatsAppVoiceResponseHandler {
  private readonly tempDir: string;
  private readonly config: {
    defaultVoice: string;
    defaultSpeed: number;
    targetFormat: AudioFormat;
    targetSampleRate: number;
    targetBitrate: number;
    enableVoiceResponseByDefault: boolean;
    tempDir: string;
  };

  constructor(
    private readonly apiToken: string,
    private readonly businessAccountId: string,
    private readonly runtime: RuntimeEnv,
    config?: VoiceResponseConfig,
  ) {
    this.tempDir = config?.tempDir ?? join(tmpdir(), 'clawdbot-whatsapp-voice-response');
    this.config = {
      defaultVoice: config?.defaultVoice ?? 'en_us',
      defaultSpeed: config?.defaultSpeed ?? 1.0,
      targetFormat: config?.targetFormat ?? DEFAULT_FORMAT,
      targetSampleRate: config?.targetSampleRate ?? DEFAULT_SAMPLE_RATE,
      targetBitrate: config?.targetBitrate ?? DEFAULT_BITRATE,
      enableVoiceResponseByDefault: config?.enableVoiceResponseByDefault ?? false,
      tempDir: this.tempDir,
    };
  }

  /**
   * Generate and send voice response to WhatsApp
   *
   * If voice synthesis is disabled, sends text-only response
   */
  async sendVoiceResponse(options: WhatsAppVoiceResponseOptions): Promise<WhatsAppVoiceUploadResult | string> {
    // Check if voice response is enabled
    const enableVoice = options.enableVoiceResponse ?? this.config.enableVoiceResponseByDefault;

    if (!enableVoice) {
      this.runtime.log?.('Voice response disabled, sending text-only');
      return await this.sendTextResponse(options.phoneNumber, options.text);
    }

    try {
      // Synthesize speech
      const audioBuffer = await this.synthesizeSpeech(options.text, {
        voice: options.voice ?? this.config.defaultVoice,
        speed: options.speed ?? this.config.defaultSpeed,
      });

      // Convert to OGG/Opus if needed
      const opusPath = await this.convertToOpus(audioBuffer);

      try {
        // Upload to WhatsApp
        const result = await this.uploadVoiceFile(opusPath, options.phoneNumber, options.text);
        return result;
      } finally {
        // Cleanup temp file
        await this.cleanupFile(opusPath);
      }
    } catch (error) {
      this.runtime.error?.(
        `Failed to send voice response: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fallback to text response
      this.runtime.log?.('Falling back to text-only response');
      return await this.sendTextResponse(options.phoneNumber, options.text);
    }
  }

  /**
   * Send text-only response to WhatsApp via Cloud API
   */
  private async sendTextResponse(phoneNumber: string, text: string): Promise<string> {
    try {
      // WhatsApp Cloud API: POST /messages endpoint
      const url = `https://graph.instagram.com/v21.0/${this.businessAccountId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          body: text,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as any;

      if (!result.messages || !result.messages[0]) {
        throw new Error('Invalid WhatsApp API response');
      }

      const messageId = result.messages[0].id;
      this.runtime.log?.(`Sent text response to WhatsApp: ${messageId}`);

      return messageId as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.runtime.error?.(`Failed to send text response: ${msg}`);
      throw new Error(`Text response failed: ${msg}`);
    }
  }

  /**
   * Synthesize text to speech using configured TTS provider
   */
  private async synthesizeSpeech(
    text: string,
    options: SynthesisOptions,
  ): Promise<AudioBuffer> {
    try {
      // Load voice configuration
      const { voiceConfig } = await loadVoiceConfig();
      if (!voiceConfig?.enabled || !voiceConfig.providers?.length) {
        throw new Error('Voice providers not configured');
      }

      // Initialize registry
      const registry = await initializeRegistry(voiceConfig);

      try {
        // Get TTS synthesizer
        const synthesizer = await registry.getSynthesizer();

        // Synthesize speech
        const audio = await synthesizer.synthesize(text, {
          ...options,
          format: this.config.targetFormat,
          sampleRate: this.config.targetSampleRate,
        });

        this.runtime.log?.(
          `Synthesized ${text.length} chars to ${audio.data.length} bytes (${audio.format})`,
        );

        return audio;
      } finally {
        await registry.shutdown();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.runtime.error?.(`Failed to synthesize speech: ${msg}`);
      throw new Error(`TTS synthesis failed: ${msg}`);
    }
  }

  /**
   * Convert audio buffer to OGG/Opus format using ffmpeg
   *
   * WhatsApp standard: 32kbps, 48kHz, mono, OGG container
   * Matches Deepgram/Cartesia output natively
   */
  private async convertToOpus(audio: AudioBuffer): Promise<string> {
    // Ensure temp directory exists
    await this.ensureTempDir();

    // Generate temp file paths
    const timestamp = Date.now();
    const inputPath = join(this.tempDir, `input-${timestamp}.wav`);
    const outputPath = join(this.tempDir, `output-${timestamp}.opus`);

    try {
      // If already opus, just save it
      if (audio.format === 'opus') {
        await writeFile(outputPath, Buffer.from(audio.data));
        return outputPath;
      }

      // Write input WAV file
      await this.writeWAVFile(inputPath, audio);

      // Convert using ffmpeg to OGG/Opus
      await this.ffmpegConvert(inputPath, outputPath, {
        bitrate: this.config.targetBitrate,
        sampleRate: this.config.targetSampleRate,
      });

      this.runtime.log?.(`Converted audio to OGG/Opus: ${outputPath}`);

      return outputPath;
    } finally {
      // Cleanup input file
      await this.cleanupFile(inputPath);
    }
  }

  /**
   * Write audio buffer as WAV file
   */
  private async writeWAVFile(path: string, audio: AudioBuffer): Promise<void> {
    const audioData = Buffer.from(audio.data);
    const sampleRate = audio.sampleRate;
    const numChannels = audio.channels;
    const bitsPerSample = 16;

    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;

    // WAV header
    const header = Buffer.alloc(44);
    let offset = 0;

    // "RIFF" chunk descriptor
    header.write('RIFF', offset);
    offset += 4;
    header.writeUInt32LE(36 + audioData.length, offset);
    offset += 4;
    header.write('WAVE', offset);
    offset += 4;

    // "fmt " subchunk
    header.write('fmt ', offset);
    offset += 4;
    header.writeUInt32LE(16, offset); // Subchunk1Size (16 for PCM)
    offset += 4;
    header.writeUInt16LE(1, offset); // AudioFormat (1 for PCM)
    offset += 2;
    header.writeUInt16LE(numChannels, offset);
    offset += 2;
    header.writeUInt32LE(sampleRate, offset);
    offset += 4;
    header.writeUInt32LE(byteRate, offset);
    offset += 4;
    header.writeUInt16LE(blockAlign, offset);
    offset += 2;
    header.writeUInt16LE(bitsPerSample, offset);
    offset += 2;

    // "data" subchunk
    header.write('data', offset);
    offset += 4;
    header.writeUInt32LE(audioData.length, offset);

    const wavFile = Buffer.concat([header, audioData]);
    await writeFile(path, wavFile);
  }

  /**
   * Convert audio file using ffmpeg to OGG/Opus
   *
   * WhatsApp spec:
   * - Codec: Opus
   * - Container: OGG
   * - Bitrate: 32 kbps
   * - Sample rate: 48000 Hz
   * - Channels: Mono
   */
  private async ffmpegConvert(
    inputPath: string,
    outputPath: string,
    options: { bitrate: number; sampleRate: number },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-codec:a', 'libopus',
        '-b:a', `${options.bitrate}k`,
        '-ar', String(options.sampleRate),
        '-ac', '1', // Mono
        '-f', 'ogg', // OGG container
        '-y', // Overwrite output
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      ffmpeg.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });
    });
  }

  /**
   * Upload voice file to WhatsApp via Cloud API
   *
   * WhatsApp Cloud API: POST /messages endpoint with media upload
   */
  private async uploadVoiceFile(filePath: string, phoneNumber: string, text: string): Promise<WhatsAppVoiceUploadResult> {
    try {
      // Read file
      const fileBuffer = await readFile(filePath);

      // First, upload media to WhatsApp
      const mediaUrl = `https://graph.instagram.com/v21.0/${this.businessAccountId}/media`;

      const mediaFormData = new FormData();
      mediaFormData.append('file', new Blob([fileBuffer], { type: 'audio/ogg' }), 'voice.ogg');
      mediaFormData.append('type', 'audio/ogg');
      mediaFormData.append('messaging_product', 'whatsapp');

      const mediaResponse = await fetch(mediaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: mediaFormData,
      });

      if (!mediaResponse.ok) {
        throw new Error(`Media upload failed: ${mediaResponse.status} ${mediaResponse.statusText}`);
      }

      const mediaResult = await mediaResponse.json() as any;
      if (!mediaResult.id) {
        throw new Error('No media ID returned from WhatsApp');
      }

      // Then, send message with media reference
      const messagesUrl = `https://graph.instagram.com/v21.0/${this.businessAccountId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'audio',
        audio: {
          id: mediaResult.id,
        },
      };

      const messageResponse = await fetch(messagesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!messageResponse.ok) {
        throw new Error(`Message sending failed: ${messageResponse.status} ${messageResponse.statusText}`);
      }

      const result = await messageResponse.json() as any;

      if (!result.messages || !result.messages[0]) {
        throw new Error('Invalid WhatsApp API response');
      }

      const messageId = result.messages[0].id;
      this.runtime.log?.(`Uploaded voice file to WhatsApp: ${messageId}`);

      return {
        messageId,
        timestamp: Date.now(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.runtime.error?.(`Failed to upload voice file: ${msg}`);
      throw new Error(`Voice upload failed: ${msg}`);
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
   * Clean up temporary file
   */
  private async cleanupFile(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch (err) {
      // Ignore cleanup errors
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
        const filePath = join(this.tempDir, file);
        const stats = await stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          await unlink(filePath);
          this.runtime.log?.(`Cleaned up old response file: ${file}`);
        }
      }
    } catch (err) {
      this.runtime.error?.(`Failed to cleanup old files: ${err}`);
    }
  }
}
