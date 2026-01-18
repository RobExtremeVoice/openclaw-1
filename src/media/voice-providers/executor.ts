/**
 * Voice Provider Execution Layer
 *
 * Defines the unified interface for STT/TTS providers and
 * establishes the contract that all implementations must follow.
 */

export enum AudioFormat {
  PCM_16 = 'pcm16',
  OPUS = 'opus',
  AAC = 'aac',
  MP3 = 'mp3',
  VORBIS = 'vorbis',
}

export interface AudioBuffer {
  data: Uint8Array;
  format: AudioFormat;
  sampleRate: number;
  duration: number;
  channels: number;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  duration: number;
  provider: string;
}

export interface TranscriptionChunk {
  text: string;
  partial?: boolean;
  timestamp: number;
  confidence?: number;
}

export interface SynthesisOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  language?: string;
  format?: AudioFormat;
  sampleRate?: number;
}

export interface ProviderCapabilities {
  supportedFormats: AudioFormat[];
  supportedSampleRates: number[];
  supportedLanguages: string[];
  supportsStreaming: boolean;
  maxConcurrentSessions: number;
  estimatedLatencyMs: number;
  requiresNetworkConnection: boolean;
  requiresLocalModel?: boolean;
}

export interface TranscribeOptions {
  language?: string;
  format?: AudioFormat;
  timeout?: number;
}

/**
 * Base interface for all voice provider executors
 */
export interface VoiceProviderExecutor {
  id: string;

  // STT operations
  transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult>;

  transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk>;

  // TTS operations
  synthesize(
    text: string,
    options?: SynthesisOptions,
  ): Promise<AudioBuffer>;

  synthesizeStream(
    textStream: ReadableStream<string>,
    options?: SynthesisOptions,
  ): AsyncIterable<AudioBuffer>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getCapabilities(): ProviderCapabilities;
  isHealthy(): Promise<boolean>;
}

/**
 * Base executor class for common functionality
 */
export abstract class BaseVoiceProviderExecutor implements VoiceProviderExecutor {
  abstract id: string;

  async initialize(): Promise<void> {
    // Override in subclass if needed
  }

  async shutdown(): Promise<void> {
    // Override in subclass if needed
  }

  abstract transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult>;

  abstract transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk>;

  abstract synthesize(
    text: string,
    options?: SynthesisOptions,
  ): Promise<AudioBuffer>;

  abstract synthesizeStream(
    textStream: ReadableStream<string>,
    options?: SynthesisOptions,
  ): AsyncIterable<AudioBuffer>;

  abstract getCapabilities(): ProviderCapabilities;

  abstract isHealthy(): Promise<boolean>;

  /**
   * Helper to create empty/silence audio buffer
   */
  protected createSilence(
    duration: number,
    sampleRate: number = 16000,
  ): AudioBuffer {
    const samples = Math.floor((duration * sampleRate) / 1000);
    return {
      data: new Uint8Array(samples * 2),
      format: AudioFormat.PCM_16,
      sampleRate,
      duration,
      channels: 1,
    };
  }

  /**
   * Helper to normalize audio to standard format
   */
  protected normalizeAudioBuffer(
    audio: AudioBuffer,
    targetFormat: AudioFormat = AudioFormat.PCM_16,
    targetSampleRate: number = 16000,
  ): AudioBuffer {
    // TODO: Implement format conversion and resampling
    // For now, just return as-is (assume already normalized)
    return audio;
  }
}

/**
 * Error class for provider-specific errors
 */
export class VoiceProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'VoiceProviderError';
  }
}
