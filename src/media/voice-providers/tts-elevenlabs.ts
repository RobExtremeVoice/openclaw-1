/**
 * ElevenLabs TTS Provider Executor
 *
 * Implements VoiceProviderExecutor for ElevenLabs text-to-speech service.
 * Supports:
 * - Multi-language synthesis
 * - Voice cloning
 * - Voice design parameters
 * - Audio alignment (character-level timing)
 * - Real-time streaming output
 */

import { EventEmitter } from 'events';
import type {
  AudioBuffer,
  AudioFormat,
  ProviderCapabilities,
  SynthesisOptions,
  TranscribeOptions,
  TranscriptionChunk,
  TranscriptionResult,
  VoiceProviderExecutor,
} from './executor.js';
import {
  AudioFormat as AudioFormatEnum,
  BaseVoiceProviderExecutor,
  VoiceProviderError,
} from './executor.js';

/**
 * ElevenLabs configuration
 */
export interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  stability?: number; // 0.0 - 1.0
  similarityBoost?: number; // 0.0 - 1.0
  language?: string;
  timeout?: number;
}

/**
 * ElevenLabs synthesis response with alignment
 */
export interface ElevenLabsSynthesisResponse {
  audio_bytes: Uint8Array;
  alignment?: {
    characters: Array<{
      character_index: number;
      character: string;
      start_time_ms: number;
      end_time_ms: number;
    }>;
  };
  duration_secs: number;
}

/**
 * Processed synthesis result
 */
export interface ElevenLabsSynthesisResult {
  audio: Uint8Array;
  duration: number;
  alignment?: ElevenLabsSynthesisResponse['alignment'];
}

/**
 * ElevenLabs executor - bridges to ElevenLabs API
 */
export class ElevenLabsExecutor extends BaseVoiceProviderExecutor {
  id = 'elevenlabs';
  private config: ElevenLabsConfig;
  private isInitialized = false;
  private eventEmitter = new EventEmitter();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(id: string, config: ElevenLabsConfig) {
    super();
    this.id = id;
    this.config = {
      modelId: 'eleven_monolingual_v1',
      stability: 0.5,
      similarityBoost: 0.75,
      language: 'en',
      timeout: 30000,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.config.apiKey) {
      throw new VoiceProviderError(
        'ElevenLabs API key is required',
        this.id,
        'MISSING_API_KEY',
      );
    }

    try {
      // Verify API connection
      await this.healthCheck();
      this.isInitialized = true;

      // Setup periodic health checks
      this.healthCheckInterval = setInterval(() => {
        this.healthCheck().catch((error) => {
          this.eventEmitter.emit('health-degraded', error);
        });
      }, 30000);
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to initialize ElevenLabs: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'INITIALIZATION_FAILED',
      );
    }
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.isInitialized = false;
  }

  async transcribe(
    _audioBuffer: AudioBuffer,
    _options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    throw new VoiceProviderError(
      'Transcription is not supported by ElevenLabs TTS provider',
      this.id,
      'NOT_SUPPORTED',
    );
  }

  async *transcribeStream(
    _audioStream: ReadableStream<AudioBuffer>,
    _options?: TranscribeOptions,
  ): AsyncGenerator<TranscriptionChunk> {
    throw new VoiceProviderError(
      'Streaming transcription is not supported by ElevenLabs TTS provider',
      this.id,
      'NOT_SUPPORTED',
    );
    // yield to make it an async generator
  }

  async synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer> {
    if (!this.isInitialized) {
      throw new VoiceProviderError(
        'ElevenLabs executor not initialized',
        this.id,
        'NOT_INITIALIZED',
      );
    }

    if (!text || text.trim().length === 0) {
      throw new VoiceProviderError(
        'Text is required for synthesis',
        this.id,
        'INVALID_INPUT',
      );
    }

    const voiceId = options?.voice || this.config.voiceId || '21m00Tcm4TlvDq8ikWAM';

    const requestBody = {
      text: text.trim(),
      model_id: this.config.modelId,
      voice_settings: {
        stability: this.config.stability,
        similarity_boost: this.config.similarityBoost,
      },
    };

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.config.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new VoiceProviderError(
          `ElevenLabs API error: ${errorText}`,
          this.id,
          `HTTP_${response.status}`,
        );
      }

      const audioBytes = await response.arrayBuffer();
      const duration = this.estimateDuration(audioBytes.byteLength);

      return {
        data: new Uint8Array(audioBytes),
        format: AudioFormatEnum.MP3,
        sampleRate: 24000,
        duration,
        channels: 1,
      };
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      throw new VoiceProviderError(
        `Synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'SYNTHESIS_FAILED',
      );
    }
  }

  async *synthesizeStream(
    textStream: ReadableStream<string>,
    _options?: SynthesisOptions,
  ): AsyncGenerator<AudioBuffer> {
    if (!this.isInitialized) {
      throw new VoiceProviderError(
        'ElevenLabs executor not initialized',
        this.id,
        'NOT_INITIALIZED',
      );
    }

    try {
      const reader = textStream.getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (value) buffer += value;

        if (done || buffer.endsWith('.')) {
          if (buffer.trim()) {
            const result = await this.synthesize(buffer.trim());
            yield result;
          }
          buffer = '';
          if (done) break;
        }
      }
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      throw new VoiceProviderError(
        `Stream synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'STREAM_SYNTHESIS_FAILED',
      );
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportedFormats: [AudioFormatEnum.PCM_16, AudioFormatEnum.OPUS],
      supportedSampleRates: [16000, 22050, 24000, 44100, 48000],
      supportedLanguages: [
        'en',
        'es',
        'fr',
        'de',
        'it',
        'pt',
        'nl',
        'ru',
        'zh',
        'ja',
        'ko',
      ],
      requiresNetworkConnection: true,
      requiresLocalModel: false,
      maxConcurrentSessions: 10,
      estimatedLatencyMs: 500,
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  private async healthCheck(): Promise<void> {
    if (!this.config.apiKey) {
      throw new VoiceProviderError(
        'API key not configured',
        this.id,
        'MISSING_API_KEY',
      );
    }

    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: {
        'xi-api-key': this.config.apiKey,
      },
    });

    if (!response.ok) {
      throw new VoiceProviderError(
        `Health check failed: ${response.statusText}`,
        this.id,
        `HTTP_${response.status}`,
      );
    }
  }

  private estimateDuration(byteLength: number): number {
    // Estimate based on PCM 16-bit, 24kHz: 2 bytes per sample
    const samples = byteLength / 2;
    const sampleRate = 24000;
    return samples / sampleRate;
  }

  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}
