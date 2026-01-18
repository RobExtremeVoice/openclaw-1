/**
 * Audio Pipeline
 *
 * Handles audio format conversion, resampling, and preprocessing.
 * Normalizes audio to a standard format for processing.
 */

import type { AudioBuffer, AudioFormat } from './voice-providers/executor.js';
import { AudioFormat as AudioFormatEnum } from './voice-providers/executor.js';

export interface AudioPipelineConfig {
  targetFormat?: AudioFormat;
  targetSampleRate?: number;
  targetChannels?: number;
}

export class AudioPipeline {
  private config: Required<AudioPipelineConfig>;

  constructor(config: AudioPipelineConfig = {}) {
    this.config = {
      targetFormat: config.targetFormat ?? AudioFormatEnum.PCM_16,
      targetSampleRate: config.targetSampleRate ?? 16000,
      targetChannels: config.targetChannels ?? 1,
    };
  }

  /**
   * Normalize audio to target format
   */
  normalize(audio: AudioBuffer): AudioBuffer {
    let buffer = audio;

    // Resample if needed
    if (buffer.sampleRate !== this.config.targetSampleRate) {
      buffer = this.resample(
        buffer,
        this.config.targetSampleRate,
      );
    }

    // Convert format if needed
    if (buffer.format !== this.config.targetFormat) {
      buffer = this.convertFormat(
        buffer,
        this.config.targetFormat,
      );
    }

    // Mix down to target channels if needed
    if (buffer.channels !== this.config.targetChannels) {
      buffer = this.mixChannels(
        buffer,
        this.config.targetChannels,
      );
    }

    return buffer;
  }

  /**
   * Convert between audio formats
   */
  private convertFormat(
    buffer: AudioBuffer,
    targetFormat: AudioFormat,
  ): AudioBuffer {
    // For now, assume both are PCM_16 or pass-through
    // Full implementation would use ffmpeg or WASM audio codec library
    if (buffer.format === targetFormat) {
      return buffer;
    }

    // TODO: Implement actual format conversion
    console.warn(
      `Format conversion from ${buffer.format} to ${targetFormat} not yet implemented`,
    );
    return buffer;
  }

  /**
   * Resample audio to target sample rate
   */
  private resample(
    buffer: AudioBuffer,
    targetSampleRate: number,
  ): AudioBuffer {
    if (buffer.sampleRate === targetSampleRate) {
      return buffer;
    }

    // Simple linear interpolation resampler
    // This is a basic implementation; production code should use
    // libsamplerate (via WASM) or similar for better quality
    const ratio = targetSampleRate / buffer.sampleRate;
    const newSampleCount = Math.ceil(
      (buffer.data.byteLength / 2) * ratio,
    ); // Assuming 16-bit samples

    const resampled = new Uint8Array(newSampleCount * 2);
    const view16 = new Int16Array(resampled.buffer);
    const src16 = new Int16Array(buffer.data.buffer);

    for (let i = 0; i < newSampleCount; i++) {
      const pos = i / ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;

      if (idx >= src16.length - 1) {
        view16[i] = src16[src16.length - 1];
      } else {
        // Linear interpolation
        const s1 = src16[idx];
        const s2 = src16[idx + 1];
        view16[i] = Math.round(s1 * (1 - frac) + s2 * frac);
      }
    }

    return {
      ...buffer,
      data: resampled,
      sampleRate: targetSampleRate,
      duration: (newSampleCount / targetSampleRate) * 1000,
    };
  }

  /**
   * Mix channels (mono/stereo conversion)
   */
  private mixChannels(
    buffer: AudioBuffer,
    targetChannels: number,
  ): AudioBuffer {
    if (buffer.channels === targetChannels) {
      return buffer;
    }

    if (buffer.channels === 2 && targetChannels === 1) {
      // Stereo to mono: average channels
      return this.stereoToMono(buffer);
    }

    if (buffer.channels === 1 && targetChannels === 2) {
      // Mono to stereo: duplicate channel
      return this.monoToStereo(buffer);
    }

    // For other conversions, just return as-is
    return buffer;
  }

  private stereoToMono(buffer: AudioBuffer): AudioBuffer {
    const src16 = new Int16Array(buffer.data.buffer);
    const mono16 = new Int16Array(src16.length / 2);

    for (let i = 0; i < mono16.length; i++) {
      const left = src16[i * 2];
      const right = src16[i * 2 + 1];
      mono16[i] = Math.round((left + right) / 2);
    }

    return {
      ...buffer,
      data: new Uint8Array(mono16.buffer),
      channels: 1,
    };
  }

  private monoToStereo(buffer: AudioBuffer): AudioBuffer {
    const src16 = new Int16Array(buffer.data.buffer);
    const stereo16 = new Int16Array(src16.length * 2);

    for (let i = 0; i < src16.length; i++) {
      stereo16[i * 2] = src16[i];
      stereo16[i * 2 + 1] = src16[i];
    }

    return {
      ...buffer,
      data: new Uint8Array(stereo16.buffer),
      channels: 2,
    };
  }

  /**
   * Validate audio buffer
   */
  isValid(buffer: AudioBuffer): boolean {
    if (!buffer.data || buffer.data.length === 0) {
      return false;
    }
    if (buffer.sampleRate < 8000 || buffer.sampleRate > 48000) {
      return false;
    }
    if (buffer.channels < 1 || buffer.channels > 8) {
      return false;
    }
    return true;
  }
}
