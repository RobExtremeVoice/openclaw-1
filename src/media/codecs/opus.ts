/**
 * Opus Codec Utilities for Discord Voice Support
 *
 * Provides PCM 16-bit ↔ Opus encoding/decoding with sample rate conversion
 * for Discord voice channels (48kHz, 20ms frames = 960 samples).
 *
 * Features:
 * - Encode PCM → Opus at 48kHz
 * - Decode Opus → PCM at 48kHz
 * - Sample rate conversion (16kHz ↔ 48kHz)
 * - 20ms frame boundary handling
 * - Sub-5ms latency per frame
 * - Fallback from @discordjs/opus to opusscript
 */

import { EventEmitter } from 'events';

/**
 * Opus encoder/decoder configuration
 */
export interface OpusConfig {
  sampleRate: 48000 | 24000 | 16000 | 12000 | 8000;
  channels: 1 | 2;
  frameSize: 960 | 480 | 240 | 120; // 20ms at 48kHz = 960 samples
  bitrate?: number; // Default: 64000 (64kbps)
  application?: 'voip' | 'audio' | 'lowdelay'; // Default: 'voip'
}

/**
 * Opus codec error types
 */
export class OpusError extends Error {
  constructor(
    message: string,
    public code: 'INIT_FAILED' | 'ENCODE_FAILED' | 'DECODE_FAILED' | 'INVALID_FRAME',
  ) {
    super(message);
    this.name = 'OpusError';
  }
}

/**
 * Opus codec wrapper with automatic fallback
 */
export class OpusCodec extends EventEmitter {
  private encoder: any;
  private decoder: any;
  private config: Required<OpusConfig>;
  private backend: 'discordjs' | 'opusscript' | null = null;
  private isInitialized = false;

  constructor(config: Partial<OpusConfig> = {}) {
    super();
    this.config = {
      sampleRate: config.sampleRate || 48000,
      channels: config.channels || 1,
      frameSize: config.frameSize || 960,
      bitrate: config.bitrate || 64000,
      application: config.application || 'voip',
    };
  }

  /**
   * Initialize Opus encoder/decoder with automatic fallback
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Try @discordjs/opus first (native, faster)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { OpusEncoder } = (await import('@discordjs/opus')) as any;
      this.encoder = new OpusEncoder(
        this.config.sampleRate,
        this.config.channels,
      );
      // @discordjs/opus provides both encoder and decoder via OpusEncoder
      this.decoder = new OpusEncoder(
        this.config.sampleRate,
        this.config.channels,
      );
      this.backend = 'discordjs';
      this.emit('backend', 'discordjs');
    } catch (error) {
      // Fallback to opusscript (pure JS, slower)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opusModule = (await import('opusscript')) as any;
        // opusscript exports the class as default
        const OpusScript = opusModule.default || opusModule;
        const app =
          this.config.application === 'voip'
            ? opusModule.Application.VOIP
            : this.config.application === 'audio'
              ? opusModule.Application.AUDIO
              : opusModule.Application.RESTRICTED_LOWDELAY;

        this.encoder = new OpusScript(this.config.sampleRate, this.config.channels, app);
        this.decoder = new OpusScript(this.config.sampleRate, this.config.channels, app);
        this.backend = 'opusscript';
        this.emit('backend', 'opusscript');
      } catch (fallbackError) {
        throw new OpusError(
          `Failed to initialize Opus codec: ${error instanceof Error ? error.message : String(error)}`,
          'INIT_FAILED',
        );
      }
    }

    this.isInitialized = true;
  }

  /**
   * Encode PCM 16-bit to Opus
   * @param pcm - PCM data as Int16Array or Buffer
   * @returns Opus-encoded buffer
   */
  encode(pcm: Int16Array | Buffer): Buffer {
    if (!this.isInitialized) {
      throw new OpusError('Codec not initialized', 'ENCODE_FAILED');
    }

    const startTime = performance.now();

    try {
      // Validate frame size
      const expectedSamples = this.config.frameSize * this.config.channels;

      // Calculate actual samples correctly (Int16Array is samples, Buffer is bytes)
      const actualSamples = pcm instanceof Int16Array
        ? pcm.length
        : pcm.length / 2; // 16-bit = 2 bytes per sample

      if (actualSamples !== expectedSamples) {
        throw new OpusError(
          `Invalid frame size: expected ${expectedSamples} samples, got ${actualSamples}`,
          'INVALID_FRAME',
        );
      }

      // Convert to Buffer if needed
      const buffer = Buffer.isBuffer(pcm)
        ? pcm
        : Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);

      // Encode based on backend
      const encoded =
        this.backend === 'discordjs'
          ? this.encoder.encode(buffer)
          : this.encoder.encode(buffer, this.config.frameSize);

      const duration = performance.now() - startTime;
      this.emit('encode', { duration, inputSize: buffer.length, outputSize: encoded.length });

      return Buffer.from(encoded);
    } catch (error) {
      throw new OpusError(
        `Encoding failed: ${error instanceof Error ? error.message : String(error)}`,
        'ENCODE_FAILED',
      );
    }
  }

  /**
   * Decode Opus to PCM 16-bit
   * @param opus - Opus-encoded buffer
   * @returns PCM data as Buffer
   */
  decode(opus: Buffer): Buffer {
    if (!this.isInitialized) {
      throw new OpusError('Codec not initialized', 'DECODE_FAILED');
    }

    const startTime = performance.now();

    try {
      // Decode based on backend
      const decoded =
        this.backend === 'discordjs'
          ? this.decoder.decode(opus)
          : this.decoder.decode(opus, this.config.frameSize);

      const duration = performance.now() - startTime;
      this.emit('decode', { duration, inputSize: opus.length, outputSize: decoded.length });

      return Buffer.from(decoded);
    } catch (error) {
      throw new OpusError(
        `Decoding failed: ${error instanceof Error ? error.message : String(error)}`,
        'DECODE_FAILED',
      );
    }
  }

  /**
   * Convert sample rate using linear interpolation
   * @param pcm - Input PCM data
   * @param fromRate - Source sample rate
   * @param toRate - Target sample rate
   * @returns Resampled PCM data
   */
  static resample(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
    if (fromRate === toRate) return pcm;

    const ratio = toRate / fromRate;
    const outputLength = Math.floor(pcm.length * ratio);
    const output = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i / ratio;
      const leftIndex = Math.floor(sourceIndex);
      const rightIndex = Math.min(leftIndex + 1, pcm.length - 1);
      const fraction = sourceIndex - leftIndex;

      // Linear interpolation
      output[i] = Math.round(pcm[leftIndex] * (1 - fraction) + pcm[rightIndex] * fraction);
    }

    return output;
  }

  /**
   * Convert PCM buffer to Int16Array
   */
  static bufferToInt16(buffer: Buffer): Int16Array {
    const samples = new Int16Array(buffer.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = buffer.readInt16LE(i * 2);
    }
    return samples;
  }

  /**
   * Convert Int16Array to PCM buffer
   */
  static int16ToBuffer(samples: Int16Array): Buffer {
    const buffer = Buffer.allocUnsafe(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
      buffer.writeInt16LE(samples[i], i * 2);
    }
    return buffer;
  }

  /**
   * Encode with sample rate conversion (e.g., 16kHz → 48kHz → Opus)
   */
  encodeWithResampling(pcm: Int16Array, sourceSampleRate: number): Buffer {
    if (sourceSampleRate !== this.config.sampleRate) {
      const resampled = OpusCodec.resample(pcm, sourceSampleRate, this.config.sampleRate);
      return this.encode(OpusCodec.int16ToBuffer(resampled));
    }
    return this.encode(OpusCodec.int16ToBuffer(pcm));
  }

  /**
   * Decode with sample rate conversion (Opus → 48kHz → target rate)
   */
  decodeWithResampling(opus: Buffer, targetSampleRate: number): Int16Array {
    const decoded = this.decode(opus);
    const samples = OpusCodec.bufferToInt16(decoded);

    if (targetSampleRate !== this.config.sampleRate) {
      return OpusCodec.resample(samples, this.config.sampleRate, targetSampleRate);
    }
    return samples;
  }

  /**
   * Get current backend
   */
  getBackend(): 'discordjs' | 'opusscript' | null {
    return this.backend;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<OpusConfig> {
    return { ...this.config };
  }

  /**
   * Destroy encoder/decoder
   */
  destroy(): void {
    this.encoder = null;
    this.decoder = null;
    this.isInitialized = false;
    this.removeAllListeners();
  }
}

/**
 * Create Opus codec instance for Discord (48kHz, mono, 20ms frames)
 */
export function createDiscordOpusCodec(): OpusCodec {
  return new OpusCodec({
    sampleRate: 48000,
    channels: 1,
    frameSize: 960, // 20ms at 48kHz
    bitrate: 64000,
    application: 'voip',
  });
}

/**
 * Calculate frame size for given sample rate and duration
 */
export function calculateFrameSize(sampleRate: number, durationMs: number): number {
  return Math.floor((sampleRate * durationMs) / 1000);
}

/**
 * Validate if buffer is a valid Opus frame
 */
export function isValidOpusFrame(buffer: Buffer): boolean {
  // Opus frames must be at least 1 byte and max 1275 bytes
  return buffer.length >= 1 && buffer.length <= 1275;
}
