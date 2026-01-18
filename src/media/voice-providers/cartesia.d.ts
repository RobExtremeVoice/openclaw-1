/**
 * CartesiaAI TTS Provider Executor
 *
 * Implements VoiceProviderExecutor for CartesiaAI's ultra-fast voice synthesis.
 *
 * Supported Models:
 * - Sonic-3 (DEFAULT): ~90ms end-to-end latency, best balance of speed & quality
 * - Sonic-Turbo: <40ms end-to-end latency, ultra-fast for real-time applications
 *
 * Model Selection Guide:
 * - Use Sonic-3 for: general TTS, content delivery, pre-recorded messages
 * - Use Sonic-Turbo for: live conversations, low-latency real-time synthesis, voice agents
 *
 * Features:
 * - Model-selectable ultra-fast voice synthesis with 40-90ms latency
 * - Zero-shot voice cloning from 3 seconds of reference audio
 * - Emotion control (neutral, happy, sad, angry, surprised)
 * - Multi-language support (40+ languages)
 * - Audio control (pitch, speed, speaking rate)
 * - Streaming synthesis with per-chunk latency tracking
 * - Connection pooling and keep-alive for production use
 */
import { EventEmitter } from 'events';
import type { AudioBuffer, ProviderCapabilities, SynthesisOptions, TranscribeOptions, TranscriptionChunk, TranscriptionResult } from './executor.js';
import { BaseVoiceProviderExecutor } from './executor.js';
/**
 * CartesiaAI configuration with model selection
 */
export interface CartesiaConfig {
    /** CartesiaAI API key for authentication */
    apiKey: string;
    /**
     * Voice synthesis model selection
     * - 'sonic-3' (default): ~90ms latency, optimal quality/speed balance
     * - 'sonic-turbo': <40ms latency, ultra-fast for real-time synthesis
     *
     * Performance characteristics:
     * Sonic-3: Best for streaming, pre-recorded content, and general TTS
     * Sonic-Turbo: Best for live conversations and low-latency voice agents
     */
    model: 'sonic-3' | 'sonic-turbo';
    /** Voice ID for voice selection from available voices */
    voiceId?: string;
    /**
     * Voice cloning configuration for zero-shot voice synthesis
     * Requires 3+ seconds of reference audio in the target voice
     */
    voiceCloning?: {
        referenceAudio: Uint8Array;
        referenceText: string;
    };
    /**
     * Emotion control for voice synthesis
     * Available: neutral, happy, sad, angry, surprised
     */
    emotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';
    /**
     * Speech speed multiplier (0.5 = 50% slower, 2.0 = 2x faster)
     * Range: 0.5 - 2.0
     */
    speed?: number;
    /**
     * Speech pitch multiplier (0.5 = lower pitch, 2.0 = higher pitch)
     * Range: 0.5 - 2.0
     */
    pitch?: number;
    /** Language code for synthesis (e.g., 'en' for English) */
    language?: string;
    /** Output audio format */
    outputFormat?: 'pcm16' | 'mp3' | 'aac';
    /** CartesiaAI API endpoint override */
    apiEndpoint?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** HTTP connection pool size for concurrent requests */
    connectionPoolSize?: number;
}
/**
 * CartesiaAI synthesis request
 */
export interface CartesiaSynthesisRequest {
    text: string;
    model_id: string;
    voice: {
        mode: 'id' | 'clone';
        id?: string;
        clone?: {
            reference_audio_url?: string;
            reference_audio?: string;
            reference_text: string;
        };
    };
    duration?: number;
    emotion?: string;
    output_format: {
        container: 'raw' | 'mp3' | 'wav';
        encoding: 'pcm_s16' | 'mp3' | 'aac';
        sample_rate: number;
    };
    controls?: {
        speed?: number;
        pitch?: number;
    };
}
/**
 * CartesiaAI synthesis response
 */
export interface CartesiaSynthesisResponse {
    audio: string;
    done: boolean;
    duration?: number;
}
/**
 * CartesiaAI available voices response
 */
export interface CartesiaVoicesResponse {
    voices: Array<{
        id: string;
        name: string;
        language: string;
        accent: string;
        description: string;
    }>;
}
/**
 * Synthesis metrics for tracking performance
 */
interface SynthesisMetrics {
    startTime: number;
    firstByteTime?: number;
    endTime?: number;
    inputChars: number;
    audioSamples?: number;
    model: string;
}
/**
 * CartesiaAI TTS executor
 */
export declare class CartesiaExecutor extends BaseVoiceProviderExecutor {
    id: string;
    private config;
    private isInitialized;
    private eventEmitter;
    private apiEndpoint;
    private availableVoices;
    private metricsBuffer;
    private readonly MAX_METRICS;
    private connectionPool;
    private poolSize;
    private activeRequests;
    private voiceCache;
    constructor(config: CartesiaConfig);
    /**
     * Validate configuration
     */
    private validateConfig;
    /**
     * Initialize CartesiaAI service with model selection
     *
     * Setup process:
     * 1. Validate configuration and model selection (sonic-3 or sonic-turbo)
     * 2. Test API authentication
     * 3. Load available voices
     * 4. Initialize connection pool for concurrent requests
     *
     * Model is locked during initialization and applies to all subsequent synthesis operations.
     * To use a different model, create a new CartesiaExecutor instance.
     */
    initialize(): Promise<void>;
    /**
     * Test API authentication
     */
    private testAuthentication;
    /**
     * Load available voices from API
     */
    private loadVoices;
    /**
     * Initialize connection pool for concurrent requests
     */
    private initializeConnectionPool;
    /**
     * Get next available connection from pool
     */
    private getPooledConnection;
    /**
     * Return connection to pool
     */
    private returnToPool;
    /**
     * Make API request with connection pooling
     */
    private makeApiRequest;
    /**
     * Get provider capabilities
     *
     * Returns capabilities based on selected model:
     * - Sonic-3: ~90ms end-to-end latency, excellent quality
     * - Sonic-Turbo: <40ms end-to-end latency, ultra-fast for real-time
     *
     * All models support 40+ languages, streaming synthesis, and connection pooling.
     */
    getCapabilities(): ProviderCapabilities;
    /**
     * Synthesize text to speech using the configured model
     *
     * Model selection affects latency and quality:
     * - Sonic-3 (default): ~90ms, best quality, recommended for most use cases
     * - Sonic-Turbo: <40ms, ultra-fast for real-time voice agents and live conversations
     *
     * The model is included in the synthesis request and cannot be overridden per-request
     * (configured at initialization time).
     *
     * @param text Text to synthesize
     * @param options Optional synthesis parameters (voice, sampleRate, speed, pitch)
     * @returns AudioBuffer with synthesized audio
     */
    synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer>;
    /**
     * Stream-based synthesis using WebSocket with proper flow control
     *
     * Supports streaming text input for real-time synthesis using the configured model:
     * - Sonic-3: Optimal for streaming content with consistent latency
     * - Sonic-Turbo: Ultra-low latency for interactive voice applications
     *
     * Features:
     * - Backpressure handling for buffer management
     * - Per-chunk latency tracking
     * - Model selection included in WebSocket context message
     * - Proper error handling and cleanup
     *
     * The model_id is sent in the WebSocket context initialization and cannot be changed
     * mid-stream (must be configured at initialization).
     *
     * @param textStream Readable stream of text chunks
     * @param options Optional synthesis parameters (voice, sampleRate, speed, pitch)
     * @yields AudioBuffer chunks as they are synthesized
     */
    synthesizeStream(textStream: ReadableStream<string>, options?: SynthesisOptions): AsyncIterable<AudioBuffer>;
    /**
     * Build synthesis request with model selection
     *
     * The request includes the configured model (sonic-3 or sonic-turbo) which determines
     * synthesis latency and quality characteristics.
     *
     * Model selection:
     * - sonic-3: Recommended for most use cases, ~90ms latency, excellent quality
     * - sonic-turbo: For ultra-low latency applications, <40ms latency
     *
     * @param text The text to synthesize
     * @param options Optional parameters (voice, sampleRate, speed, pitch)
     * @returns CartesiaSynthesisRequest with model_id set to configured model
     */
    private buildSynthesisRequest;
    /**
     * Resolve voice ID from voice name or predefined ID
     */
    private resolveVoice;
    /**
     * Extract audio data from response
     */
    private extractAudioData;
    /**
     * Convert base64 to ArrayBuffer
     */
    private base64ToArrayBuffer;
    /**
     * Convert ArrayBuffer to base64
     */
    private arrayBufferToBase64;
    /**
     * Record synthesis metrics
     */
    private recordMetrics;
    /**
     * Get synthesis metrics
     */
    getMetrics(): SynthesisMetrics[];
    /**
     * Get average latency from recent syntheses
     */
    getAverageLatency(): number;
    /**
     * Check if service is healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * Shutdown CartesiaAI service
     */
    shutdown(): Promise<void>;
    /**
     * Get event emitter for monitoring
     */
    getEventEmitter(): EventEmitter;
    /**
     * Transcribe audio (not supported)
     */
    transcribe(_audio: AudioBuffer, _options?: TranscribeOptions): Promise<TranscriptionResult>;
    /**
     * Transcribe stream (not supported)
     */
    transcribeStream(_audioStream: ReadableStream<AudioBuffer>, _options?: TranscribeOptions): AsyncIterable<TranscriptionChunk>;
}
export {};
//# sourceMappingURL=cartesia.d.ts.map