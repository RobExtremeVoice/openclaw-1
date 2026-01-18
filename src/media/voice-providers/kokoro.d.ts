/**
 * Kokoro TTS Provider Executor
 *
 * Implements VoiceProviderExecutor for the Kokoro local TTS engine.
 * Supports three deployment modes:
 * 1. Docker - Container-based Kokoro service
 * 2. System - Local Python installation
 * 3. Cloud - External Kokoro API endpoint
 */
import { EventEmitter } from 'events';
import type { AudioBuffer, ProviderCapabilities, SynthesisOptions, TranscribeOptions, TranscriptionChunk, TranscriptionResult } from './executor.js';
import { BaseVoiceProviderExecutor } from './executor.js';
/**
 * Deployment configuration schema
 */
export interface DeploymentConfig {
    mode: 'docker' | 'system' | 'cloud';
    docker?: {
        image: string;
        port: number;
        volumes?: Record<string, string>;
        env?: Record<string, string>;
    };
    system?: {
        pythonPath?: string;
        installCmd?: string;
    };
    cloud?: {
        endpoint: string;
        apiKey?: string;
    };
    healthCheck?: {
        endpoint: string;
        interval: number;
    };
}
/**
 * Kokoro synthesize response
 */
export interface KokoroSynthesizeResponse {
    audio: Uint8Array;
    sampleRate: number;
    duration: number;
    format: string;
}
/**
 * Kokoro executor - bridges to actual Kokoro service
 */
export declare class KokoroExecutor extends BaseVoiceProviderExecutor {
    id: string;
    private config;
    private isInitialized;
    private healthCheckInterval;
    private eventEmitter;
    private dockerHandler;
    private systemHandler;
    private cloudHandler;
    constructor(config: DeploymentConfig);
    /**
     * Validate mode and cloud config immediately in constructor
     * Docker and system config validation happens lazily on initialize()
     */
    private validateModeAndCloud;
    /**
     * Validate deployment configuration (lazy validation for docker/system modes)
     */
    private validateConfig;
    /**
     * Initialize Kokoro service based on deployment mode
     */
    initialize(): Promise<void>;
    /**
     * Initialize Docker deployment
     */
    private initializeDocker;
    /**
     * Initialize System deployment
     */
    private initializeSystem;
    /**
     * Initialize Cloud deployment
     */
    private initializeCloud;
    /**
     * Start periodic health checking
     */
    private startHealthChecking;
    /**
     * Shutdown Kokoro service
     */
    shutdown(): Promise<void>;
    /**
     * Shutdown Docker deployment
     */
    private shutdownDocker;
    /**
     * Shutdown System deployment
     */
    private shutdownSystem;
    /**
     * Shutdown Cloud deployment
     */
    private shutdownCloud;
    /**
     * Check if Kokoro service is healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * Get provider capabilities
     */
    getCapabilities(): ProviderCapabilities;
    /**
     * Synthesize text to speech
     */
    synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer>;
    /**
     * Stream-based text-to-speech synthesis using HTTP streaming
     */
    synthesizeStream(textStream: ReadableStream<string>, options?: SynthesisOptions): AsyncIterable<AudioBuffer>;
    /**
     * Transcribe audio to text (not supported by Kokoro - TTS only)
     */
    transcribe(audio: AudioBuffer, options?: TranscribeOptions): Promise<TranscriptionResult>;
    /**
     * Stream transcription (not supported by Kokoro - TTS only)
     */
    transcribeStream(audioStream: ReadableStream<AudioBuffer>, options?: TranscribeOptions): AsyncIterable<TranscriptionChunk>;
    /**
     * Get event emitter for monitoring
     */
    getEventEmitter(): EventEmitter;
    /**
     * Get current deployment mode
     */
    getDeploymentMode(): string;
    /**
     * Get deployment configuration
     */
    getDeploymentConfig(): DeploymentConfig;
}
//# sourceMappingURL=kokoro.d.ts.map