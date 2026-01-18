/**
 * Voice Provider Execution Layer
 *
 * Defines the unified interface for STT/TTS providers and
 * establishes the contract that all implementations must follow.
 */
export declare enum AudioFormat {
    PCM_16 = "pcm16",
    OPUS = "opus",
    AAC = "aac",
    MP3 = "mp3",
    VORBIS = "vorbis"
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
    transcribe(audio: AudioBuffer, options?: TranscribeOptions): Promise<TranscriptionResult>;
    transcribeStream(audioStream: ReadableStream<AudioBuffer>, options?: TranscribeOptions): AsyncIterable<TranscriptionChunk>;
    synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer>;
    synthesizeStream(textStream: ReadableStream<string>, options?: SynthesisOptions): AsyncIterable<AudioBuffer>;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    getCapabilities(): ProviderCapabilities;
    isHealthy(): Promise<boolean>;
}
/**
 * Base executor class for common functionality
 */
export declare abstract class BaseVoiceProviderExecutor implements VoiceProviderExecutor {
    abstract id: string;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    abstract transcribe(audio: AudioBuffer, options?: TranscribeOptions): Promise<TranscriptionResult>;
    abstract transcribeStream(audioStream: ReadableStream<AudioBuffer>, options?: TranscribeOptions): AsyncIterable<TranscriptionChunk>;
    abstract synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer>;
    abstract synthesizeStream(textStream: ReadableStream<string>, options?: SynthesisOptions): AsyncIterable<AudioBuffer>;
    abstract getCapabilities(): ProviderCapabilities;
    abstract isHealthy(): Promise<boolean>;
    /**
     * Helper to create empty/silence audio buffer
     */
    protected createSilence(duration: number, sampleRate?: number): AudioBuffer;
    /**
     * Helper to normalize audio to standard format
     */
    protected normalizeAudioBuffer(audio: AudioBuffer, targetFormat?: AudioFormat, targetSampleRate?: number): AudioBuffer;
}
/**
 * Error class for provider-specific errors
 */
export declare class VoiceProviderError extends Error {
    provider: string;
    code?: string | undefined;
    constructor(message: string, provider: string, code?: string | undefined);
}
//# sourceMappingURL=executor.d.ts.map