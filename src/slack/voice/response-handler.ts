/**
 * Slack Voice Response Handler
 *
 * Handles voice bot responses in Slack by:
 * - Synthesizing text responses using TTS providers
 * - Converting audio to MP3 for Slack compatibility
 * - Uploading audio as file attachments
 * - Supporting threaded voice conversations
 */

import type { WebClient as SlackWebClient } from '@slack/web-api';
import { readFile, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

import type { RuntimeEnv } from '../../runtime.js';
import type { AudioBuffer, AudioFormat, SynthesisOptions } from '../../media/voice-providers/executor.js';
import { loadVoiceConfig } from '../../commands/voice/helpers.js';
import { initializeRegistry } from '../../commands/voice/helpers.js';
import type { SlackVoiceConfig, ResponseModality, InputModality, VoiceResponseMetadata } from './types.js';

export interface SlackVoiceResponseOptions {
  channelId: string;
  threadTs?: string;
  userId?: string;
  text: string;
  voice?: string;
  speed?: number;
  includeTranscript?: boolean;
  inputModality?: InputModality;
}

export interface SlackVoiceUploadResult {
  fileId: string;
  permalink: string;
  timestamp: string;
}

export interface VoiceResponseConfig {
  defaultVoice?: string;
  defaultSpeed?: number;
  targetFormat?: AudioFormat;
  targetSampleRate?: number;
  targetBitrate?: number;
  includeTranscriptByDefault?: boolean;
  tempDir?: string;
  slackVoiceConfig?: Partial<SlackVoiceConfig>;
}

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_BITRATE = 64; // kbps
const DEFAULT_FORMAT: AudioFormat = 'mp3' as AudioFormat;

/**
 * Voice response handler for Slack
 */
export class SlackVoiceResponseHandler {
  private readonly tempDir: string;
  private readonly config: {
    defaultVoice: string;
    defaultSpeed: number;
    targetFormat: AudioFormat;
    targetSampleRate: number;
    targetBitrate: number;
    includeTranscriptByDefault: boolean;
    tempDir: string;
  };
  private readonly slackVoiceConfig: SlackVoiceConfig;

  constructor(
    private readonly client: SlackWebClient,
    private readonly runtime: RuntimeEnv,
    config?: VoiceResponseConfig,
  ) {
    this.tempDir = config?.tempDir ?? join(tmpdir(), 'clawdbot-slack-voice-response');
    this.config = {
      defaultVoice: config?.defaultVoice ?? 'en_us',
      defaultSpeed: config?.defaultSpeed ?? 1.0,
      targetFormat: config?.targetFormat ?? DEFAULT_FORMAT,
      targetSampleRate: config?.targetSampleRate ?? DEFAULT_SAMPLE_RATE,
      targetBitrate: config?.targetBitrate ?? DEFAULT_BITRATE,
      includeTranscriptByDefault: config?.includeTranscriptByDefault ?? true,
      tempDir: this.tempDir,
    };

    // Set up Slack voice configuration with defaults
    this.slackVoiceConfig = {
      ...(config?.slackVoiceConfig ?? {}),
      messageResponse: config?.slackVoiceConfig?.messageResponse ?? 'match',
      defaultResponse: config?.slackVoiceConfig?.defaultResponse ?? 'match',
      perChannelOverride: config?.slackVoiceConfig?.perChannelOverride ?? {},
      perUserOverride: config?.slackVoiceConfig?.perUserOverride ?? {},
    };
  }

  /**
   * Determine the output modality for a response based on input and configuration
   */
  private determineOutputModality(
    options: SlackVoiceResponseOptions,
  ): { modality: ResponseModality; metadata: VoiceResponseMetadata } {
    const inputModality = options.inputModality ?? 'voice';

    // Check for per-user override first (highest priority)
    if (options.userId && this.slackVoiceConfig.perUserOverride?.[options.userId]) {
      const modality = this.slackVoiceConfig.perUserOverride[options.userId]!;
      return {
        modality,
        metadata: {
          inputModality,
          outputModality: modality,
          reasonForModality: `user-override for ${options.userId}`,
        },
      };
    }

    // Check for per-channel override (medium priority)
    if (this.slackVoiceConfig.perChannelOverride?.[options.channelId]) {
      const modality = this.slackVoiceConfig.perChannelOverride[options.channelId]!;
      return {
        modality,
        metadata: {
          inputModality,
          outputModality: modality,
          reasonForModality: `channel-override for ${options.channelId}`,
        },
      };
    }

    // Use messageResponse or defaultResponse (lowest priority)
    const configuredModality = this.slackVoiceConfig.messageResponse ?? this.slackVoiceConfig.defaultResponse ?? 'match';

    let outputModality: ResponseModality = configuredModality;
    if (configuredModality === 'match') {
      // Match input modality
      outputModality = inputModality;
    }

    return {
      modality: outputModality,
      metadata: {
        inputModality,
        outputModality,
        reasonForModality: `configured-default: ${configuredModality}`,
      },
    };
  }

  /**
   * Generate and send voice response to Slack
   */
  async sendVoiceResponse(
    options: SlackVoiceResponseOptions,
  ): Promise<SlackVoiceUploadResult | string> {
    const { modality, metadata } = this.determineOutputModality(options);

    this.runtime.log?.(
      `Responding with ${modality} modality (input: ${metadata.inputModality}, reason: ${metadata.reasonForModality})`,
    );

    // Handle response based on determined modality
    if (modality === 'text') {
      // Send text-only response
      return await this.sendTextResponse(options);
    } else if (modality === 'both') {
      // Send both voice and text
      const voiceResult = await this.sendVoiceOnly(options);
      await this.sendTextResponse(options);
      return voiceResult;
    } else {
      // Send voice response (includes 'voice' and 'match' when input is voice)
      return await this.sendVoiceOnly(options);
    }
  }

  /**
   * Send voice-only response
   */
  private async sendVoiceOnly(
    options: SlackVoiceResponseOptions,
  ): Promise<SlackVoiceUploadResult> {
    // Synthesize speech
    const audioBuffer = await this.synthesizeSpeech(options.text, {
      voice: options.voice ?? this.config.defaultVoice,
      speed: options.speed ?? this.config.defaultSpeed,
    });

    // Convert to MP3 if needed
    const mp3Path = await this.convertToMP3(audioBuffer);

    try {
      // Upload to Slack
      const result = await this.uploadVoiceFile(mp3Path, {
        channelId: options.channelId,
        threadTs: options.threadTs,
        text: options.text,
        includeTranscript: options.includeTranscript ?? this.config.includeTranscriptByDefault,
      });

      return result;
    } finally {
      // Cleanup temp file
      await this.cleanupFile(mp3Path);
    }
  }

  /**
   * Send text-only response to Slack
   */
  private async sendTextResponse(options: SlackVoiceResponseOptions): Promise<string> {
    try {
      const messageOptions: any = {
        channel: options.channelId,
        text: options.text,
      };

      if (options.threadTs) {
        messageOptions.thread_ts = options.threadTs;
      }

      const result = await this.client.chat.postMessage(messageOptions);

      if (!result.ok) {
        throw new Error('Text message posting failed');
      }

      this.runtime.log?.(
        `Sent text response to Slack: ${result.ts} in channel ${options.channelId}`,
      );

      return result.ts as string;
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
   * Convert audio buffer to MP3 format using ffmpeg
   */
  private async convertToMP3(audio: AudioBuffer): Promise<string> {
    // Ensure temp directory exists
    await this.ensureTempDir();

    // Generate temp file paths
    const timestamp = Date.now();
    const inputPath = join(this.tempDir, `input-${timestamp}.wav`);
    const outputPath = join(this.tempDir, `output-${timestamp}.mp3`);

    try {
      // If already MP3, just save it
      if (audio.format === 'mp3') {
        await writeFile(outputPath, Buffer.from(audio.data));
        return outputPath;
      }

      // Write input WAV file
      await this.writeWAVFile(inputPath, audio);

      // Convert using ffmpeg
      await this.ffmpegConvert(inputPath, outputPath, {
        bitrate: this.config.targetBitrate,
        sampleRate: this.config.targetSampleRate,
      });

      this.runtime.log?.(`Converted audio to MP3: ${outputPath}`);

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
   * Convert audio file using ffmpeg
   */
  private async ffmpegConvert(
    inputPath: string,
    outputPath: string,
    options: { bitrate: number; sampleRate: number },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-codec:a', 'libmp3lame',
        '-b:a', `${options.bitrate}k`,
        '-ar', String(options.sampleRate),
        '-ac', '1', // Mono
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
   * Upload voice file to Slack
   */
  private async uploadVoiceFile(
    filePath: string,
    options: {
      channelId: string;
      threadTs?: string;
      text: string;
      includeTranscript: boolean;
    },
  ): Promise<SlackVoiceUploadResult> {
    try {
      // Read file
      const fileBuffer = await readFile(filePath);

      // Prepare message text
      const messageText = options.includeTranscript
        ? `Voice response:\n\n> ${options.text}`
        : 'Voice response';

      // Upload file
      const uploadOptions: any = {
        channels: options.channelId,
        file: fileBuffer,
        filename: `voice-response-${Date.now()}.mp3`,
        title: 'Voice Response',
        initial_comment: messageText,
      };

      if (options.threadTs) {
        uploadOptions.channel_id = options.channelId;
        uploadOptions.thread_ts = options.threadTs;
      }

      const result = await this.client.files.uploadV2(uploadOptions) as any;

      if (!result.ok || !result.file) {
        throw new Error('File upload failed');
      }

      this.runtime.log?.(
        `Uploaded voice file to Slack: ${result.file.id} in channel ${options.channelId}`,
      );

      return {
        fileId: result.file.id!,
        permalink: result.file.permalink || '',
        timestamp: result.file.timestamp || '',
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
      this.runtime.error?.(`Failed to cleanup old response files: ${err}`);
    }
  }
}
