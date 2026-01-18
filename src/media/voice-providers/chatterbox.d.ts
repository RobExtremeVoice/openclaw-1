/**
 * Chatterbox TTS Provider Executor
 *
 * Implements VoiceProviderExecutor for Chatterbox's advanced voice synthesis.
 *
 * Deployment Modes:
 * - cloud (DEFAULT): Hosted Chatterbox API at https://api.chatterbox.ai
 * - docker: Self-hosted Docker container with auto-port discovery
 * - system: Local Python installation with chatterbox-tts CLI
 *
 * Features:
 * - 22 language support with OpenAI-compatible API
 * - Voice cloning from 5-10 seconds of reference audio
 * - Emotion control via exaggeration parameter (0.25-2.0)
 * - Temperature control for variability (0.05-5.0)
 * - Streaming audio synthesis with proper backpressure
 * - Multi-deployment flexibility
 * - Error handling & graceful degradation
 */
import type { AudioBuffer, ProviderCapabilities, SynthesisOptions, TranscribeOptions, TranscriptionChunk, TranscriptionResult } from './executor.js';
import { BaseVoiceProviderExecutor } from './executor.js';
/**
 * Chatterbox deployment mode
 */
export type ChatterboxDeploymentMode = 'cloud' | 'docker' | 'system';
/**
 * Chatterbox configuration
 */
export interface ChatterboxConfig {
    deploymentMode: ChatterboxDeploymentMode;
    cloudEndpoint?: string;
    apiKey?: string;
    dockerImage?: string;
    dockerPort?: number;
    exaggeration?: number;
    temperature?: number;
    language?: string;
    voice?: string;
    timeout?: number;
}
/**
 * Chatterbox synthesis request (OpenAI-compatible format)
 */
export interface ChatterboxSynthesisRequest {
    input: string;
    voice?: string;
    response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'pcm';
    speed?: number;
    model?: string;
}
/**
 * Chatterbox synthesis response
 */
export interface ChatterboxSynthesisResponse {
    audio?: string;
    format?: string;
}
/**
 * Chatterbox voices response
 */
export interface ChatterboxVoicesResponse {
    voices: Array<{
        id: string;
        name: string;
        language: string;
        gender?: string;
        description?: string;
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
    audioBytes?: number;
    deploymentMode: ChatterboxDeploymentMode;
}
/**
 * Chatterbox TTS executor
 */
export declare class ChatterboxExecutor extends BaseVoiceProviderExecutor {
    id: string;
    private config;
    private isInitialized;
    private eventEmitter;
    private apiEndpoint;
    private availableVoices;
    private metricsBuffer;
    private readonly MAX_METRICS;
    private dockerProcess;
    private activeRequests;
    constructor(config: ChatterboxConfig);
    /**
     * Resolve API endpoint based on deployment mode
     */
    private resolveEndpoint;
    /**
     * Validate configuration
     */
    private validateConfig;
    /**
     * Check if URL is valid
     */
    private isValidUrl;
    /**
     * Initialize Chatterbox service
     */
    initialize(): Promise<void>;
    /**
     * Initialize cloud deployment
     */
    private initializeCloud;
    /**
     * Initialize Docker deployment with auto-port discovery
     */
    private initializeDocker;
    /**
     * Detect Docker container on common ports
     */
    private detectDockerContainer;
    /**
     * Initialize system deployment
     */
    private initializeSystem;
    /**
     * Test connectivity to service
     */
    private testConnectivity;
    /**
     * Load available voices from API
     */
    private loadVoices;
    /**
     * Make HTTP request with retry logic
     */
    private makeRequest;
    /**
     * Get provider capabilities
     */
    getCapabilities(): ProviderCapabilities;
    /**
     * Synthesize text to speech
     */
    synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer>;
    /**
     * Synthesize with streaming
     */
    synthesizeStream(textStream: ReadableStream<string>, options?: SynthesisOptions): AsyncIterable<AudioBuffer>;
    /**
     * Build synthesis request
     */
    private buildSynthesisRequest;
    /**
     * Record synthesis metrics
     */
    private recordMetrics;
    /**
     * Check if service is healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * Shutdown Chatterbox service
     */
    shutdown(): Promise<void>;
    /**
     * Get synthesis metrics
     */
    getMetrics(): SynthesisMetrics[];
    /**
     * Get average latency from recent syntheses
     */
    getAverageLatency(): number;
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
//# sourceMappingURL=chatterbox.d.ts.map