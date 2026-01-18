/**
 * Audio Mixer
 *
 * Handles real-time mixing of multiple audio streams with selective routing
 * for N-party voice channels. Supports broadcast, selective, and spatial mixing.
 */

import type { AudioBuffer } from './voice-providers/executor.js';
import { AudioFormat as AudioFormatEnum } from './voice-providers/executor.js';

export type MixAlgorithm = 'broadcast' | 'selective' | 'spatial';

export interface AudioMixerOptions {
  algorithm?: MixAlgorithm;
  maxParticipants?: number;
  dynamicNormalization?: boolean;
  vadThreshold?: number; // Voice activity detection threshold
}

interface TrackBuffer {
  userId: string;
  buffers: AudioBuffer[];
  volume: number;
  enabled: boolean;
  lastEnergy: number;
}

export class AudioMixer {
  private tracks: Map<string, TrackBuffer> = new Map();
  private config: Required<AudioMixerOptions>;
  private sampleRate: number = 16000;

  constructor(config: AudioMixerOptions = {}) {
    this.config = {
      algorithm: config.algorithm ?? 'broadcast',
      maxParticipants: config.maxParticipants ?? 16,
      dynamicNormalization: config.dynamicNormalization ?? true,
      vadThreshold: config.vadThreshold ?? 0.02,
    };
  }

  /**
   * Add audio from a track (participant)
   */
  addTrack(userId: string, audio: AudioBuffer): void {
    if (!this.tracks.has(userId)) {
      this.tracks.set(userId, {
        userId,
        buffers: [],
        volume: 1.0,
        enabled: true,
        lastEnergy: 0,
      });
    }

    const track = this.tracks.get(userId)!;
    track.buffers.push(audio);

    // Calculate energy for VAD
    track.lastEnergy = this.calculateEnergy(audio);

    // Keep buffer limited (2-3 frames to reduce latency)
    while (track.buffers.length > 3) {
      track.buffers.shift();
    }
  }

  /**
   * Mix audio from all tracks
   */
  mix(): AudioBuffer {
    const samples = this.collectSamples();

    if (samples.size === 0) {
      return this.createSilence(1000); // 1 second of silence
    }

    let mixed: Float32Array;

    switch (this.config.algorithm) {
      case 'selective':
        mixed = this.mixSelective(samples);
        break;
      case 'spatial':
        mixed = this.mixSpatial(samples);
        break;
      case 'broadcast':
      default:
        mixed = this.mixBroadcast(samples);
        break;
    }

    // Apply dynamic normalization
    if (this.config.dynamicNormalization) {
      mixed = this.normalizeDynamic(mixed);
    }

    return this.float32ToAudioBuffer(mixed);
  }

  /**
   * Set volume for a track
   */
  setTrackVolume(userId: string, volume: number): void {
    const track = this.tracks.get(userId);
    if (track) {
      track.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Enable/disable a track
   */
  setTrackEnabled(userId: string, enabled: boolean): void {
    const track = this.tracks.get(userId);
    if (track) {
      track.enabled = enabled;
    }
  }

  /**
   * Remove a track
   */
  removeTrack(userId: string): void {
    this.tracks.delete(userId);
  }

  /**
   * Get current active tracks (by voice activity)
   */
  getActiveTracks(): string[] {
    return Array.from(this.tracks.values())
      .filter(
        t =>
          t.enabled && t.lastEnergy > this.config.vadThreshold,
      )
      .map(t => t.userId);
  }

  /**
   * Broadcast mix - all tracks equally weighted
   */
  private mixBroadcast(
    samples: Map<string, Float32Array>,
  ): Float32Array {
    const maxLength = Math.max(
      ...Array.from(samples.values()).map(s => s.length),
    );
    const result = new Float32Array(maxLength);

    let count = 0;
    for (const [userId, audio] of samples) {
      const track = this.tracks.get(userId);
      if (!track || !track.enabled) continue;

      const volume = track.volume;
      for (let i = 0; i < audio.length; i++) {
        result[i] += audio[i] * volume;
      }
      count++;
    }

    if (count > 0) {
      for (let i = 0; i < result.length; i++) {
        result[i] /= count; // Average to prevent clipping
      }
    }

    return result;
  }

  /**
   * Selective mix - prioritize top N speakers by energy
   */
  private mixSelective(
    samples: Map<string, Float32Array>,
  ): Float32Array {
    // Sort tracks by recent energy (voice activity)
    const sorted = Array.from(this.tracks.entries())
      .filter(([, t]) => t.enabled)
      .sort((a, b) => b[1].lastEnergy - a[1].lastEnergy);

    // Take top 4 speakers
    const topN = 4;
    const selected = new Map(
      sorted.slice(0, topN),
    );

    const maxLength = Math.max(
      ...Array.from(samples.values()).map(s => s.length),
    );
    const result = new Float32Array(maxLength);

    let count = 0;
    for (const [userId, audio] of samples) {
      if (!selected.has(userId)) continue;

      const track = this.tracks.get(userId)!;
      const volume = track.volume;

      for (let i = 0; i < audio.length; i++) {
        result[i] += audio[i] * volume;
      }
      count++;
    }

    if (count > 0) {
      for (let i = 0; i < result.length; i++) {
        result[i] /= count;
      }
    }

    return result;
  }

  /**
   * Spatial mix - simulated 3D audio positioning
   * Simple implementation: apply panning based on user position
   */
  private mixSpatial(
    samples: Map<string, Float32Array>,
  ): Float32Array {
    // For now, just fall back to broadcast
    // Full implementation would apply HRTF or panning filters
    return this.mixBroadcast(samples);
  }

  /**
   * Dynamic normalization to prevent clipping
   */
  private normalizeDynamic(audio: Float32Array): Float32Array {
    let max = 0;
    for (let i = 0; i < audio.length; i++) {
      max = Math.max(max, Math.abs(audio[i]));
    }

    if (max > 1.0) {
      for (let i = 0; i < audio.length; i++) {
        audio[i] /= max;
      }
    }

    return audio;
  }

  /**
   * Collect samples from all enabled tracks
   */
  private collectSamples(): Map<string, Float32Array> {
    const samples = new Map<string, Float32Array>();

    for (const [userId, track] of this.tracks) {
      if (!track.enabled || track.buffers.length === 0) {
        continue;
      }

      // Concatenate all buffers from this track
      const combined = this.concatenateAudioBuffers(
        track.buffers,
      );
      samples.set(userId, combined);
    }

    return samples;
  }

  /**
   * Concatenate multiple audio buffers into one
   */
  private concatenateAudioBuffers(
    buffers: AudioBuffer[],
  ): Float32Array {
    const totalSamples = buffers.reduce(
      (sum, buf) => sum + buf.data.length / 2,
      0,
    );
    const result = new Float32Array(totalSamples);

    let offset = 0;
    for (const buffer of buffers) {
      const view16 = new Int16Array(buffer.data.buffer);
      for (let i = 0; i < view16.length; i++) {
        result[offset + i] = view16[i] / 32768; // Convert 16-bit to [-1, 1]
      }
      offset += view16.length;
    }

    return result;
  }

  /**
   * Calculate energy (RMS) of audio for VAD
   */
  private calculateEnergy(buffer: AudioBuffer): number {
    const view16 = new Int16Array(buffer.data.buffer);
    let sum = 0;

    for (let i = 0; i < view16.length; i++) {
      const normalized = view16[i] / 32768;
      sum += normalized * normalized;
    }

    return Math.sqrt(sum / view16.length);
  }

  /**
   * Convert Float32Array back to AudioBuffer
   */
  private float32ToAudioBuffer(
    float32: Float32Array,
  ): AudioBuffer {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
    }

    return {
      data: new Uint8Array(int16.buffer),
      format: AudioFormatEnum.PCM_16,
      sampleRate: this.sampleRate,
      duration: (float32.length / this.sampleRate) * 1000,
      channels: 1,
    };
  }

  /**
   * Create silence audio buffer
   */
  private createSilence(duration: number): AudioBuffer {
    const samples = Math.floor((duration * this.sampleRate) / 1000);
    return {
      data: new Uint8Array(samples * 2),
      format: AudioFormatEnum.PCM_16,
      sampleRate: this.sampleRate,
      duration,
      channels: 1,
    };
  }
}
