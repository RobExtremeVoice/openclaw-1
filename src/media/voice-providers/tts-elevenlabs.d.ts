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
import type { AudioBuffer, ProviderCapabilities, SynthesisOptions, TranscribeOptions, TranscriptionChunk, TranscriptionResult } from './executor.js';
import { BaseVoiceProviderExecutor } from './executor.js';
/**
 * ElevenLabs configuration
 */
export interface ElevenLabsConfig {
    apiKey: string;
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
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
export declare class ElevenLabsExecutor extends BaseVoiceProviderExecutor {
    id: string;
    private config;
    private isInitialized;
    private eventEmitter;
    private healthCheckInterval;
    constructor(id: string, config: ElevenLabsConfig);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    transcribe(_audioBuffer: AudioBuffer, _options?: TranscribeOptions): Promise<TranscriptionResult>;
    transcribeStream(_audioStream: ReadableStream<AudioBuffer>, _options?: TranscribeOptions): AsyncGenerator<TranscriptionChunk>;
    synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer>;
    synthesizeStream(textStream: ReadableStream<string>, _options?: SynthesisOptions): AsyncGenerator<AudioBuffer>;
    getCapabilities(): ProviderCapabilities;
    isHealthy(): Promise<boolean>;
    private healthCheck;
    private estimateDuration;
    getEventEmitter(): EventEmitter;
}
//# sourceMappingURL=tts-elevenlabs.d.ts.map