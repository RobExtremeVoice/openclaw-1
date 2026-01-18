/**
 * Mock Implementations for Testing
 *
 * Provides realistic mock implementations of all 7 voice providers and their APIs
 * for comprehensive integration testing without external dependencies.
 */

import type {
  AudioBuffer,
  TranscriptionResult,
  TranscriptionChunk,
  SynthesisOptions,
  ProviderCapabilities,
  TranscribeOptions,
  VoiceProviderExecutor,
} from './executor.js';
import { AudioFormat, BaseVoiceProviderExecutor } from './executor.js';
import { VoiceProviderError } from './executor.js';
import { createSilentAudioBuffer, createProviderCapabilities } from './e2e-helpers.js';

/**
 * Mock STT Provider (Transcription)
 */
export class MockSTTProvider extends BaseVoiceProviderExecutor {
  readonly id: string;
  private healthy: boolean = true;
  private failureMode: 'healthy' | 'unhealthy' | 'timeout' | 'invalid' = 'healthy';
  private callCount: number = 0;
  private transcriptionDelay: number = 100;

  constructor(id: string = 'mock-stt') {
    super();
    this.id = id;
  }

  async initialize(): Promise<void> {
    this.callCount = 0;
  }

  async shutdown(): Promise<void> {
    // Cleanup
  }

  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    this.callCount++;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, this.transcriptionDelay));

    switch (this.failureMode) {
      case 'timeout':
        throw new VoiceProviderError(
          'Transcription timeout',
          this.id,
          'TIMEOUT',
        );
      case 'invalid':
        throw new VoiceProviderError(
          'Invalid audio format',
          this.id,
          'INVALID_AUDIO',
        );
      case 'unhealthy':
        throw new VoiceProviderError(
          'Provider is unhealthy',
          this.id,
          'UNHEALTHY',
        );
      default:
        return {
          text: `Mock transcription from ${this.id}`,
          confidence: 0.95,
          language: options?.language || 'en',
          duration: audio.duration,
          provider: this.id,
        };
    }
  }

  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk> {
    const reader = audioStream.getReader();
    let chunkIndex = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkIndex++;
        yield {
          text: `Chunk ${chunkIndex} from ${this.id}`,
          partial: chunkIndex < 3,
          timestamp: Date.now(),
        };

        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      reader.releaseLock();
    }
  }

  async synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer> {
    throw new VoiceProviderError(
      'Mock STT provider does not support synthesis',
      this.id,
      'UNSUPPORTED_OPERATION',
    );
  }

  async *synthesizeStream(
    textStream: ReadableStream<string>,
    options?: SynthesisOptions,
  ): AsyncIterable<AudioBuffer> {
    throw new VoiceProviderError(
      'Mock STT provider does not support synthesis',
      this.id,
      'UNSUPPORTED_OPERATION',
    );
  }

  getCapabilities(): ProviderCapabilities {
    return createProviderCapabilities('stt', {
      estimatedLatencyMs: this.transcriptionDelay,
    });
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  // Test helpers
  setFailureMode(mode: 'healthy' | 'unhealthy' | 'timeout' | 'invalid'): void {
    this.failureMode = mode;
    this.healthy = mode === 'healthy';
  }

  getCallCount(): number {
    return this.callCount;
  }

  setTranscriptionDelay(delayMs: number): void {
    this.transcriptionDelay = delayMs;
  }
}

/**
 * Mock TTS Provider (Synthesis)
 */
export class MockTTSProvider extends BaseVoiceProviderExecutor {
  readonly id: string;
  private healthy: boolean = true;
  private failureMode: 'healthy' | 'unhealthy' | 'timeout' | 'invalid' = 'healthy';
  private callCount: number = 0;
  private synthesisDelay: number = 100;

  constructor(id: string = 'mock-tts') {
    super();
    this.id = id;
  }

  async initialize(): Promise<void> {
    this.callCount = 0;
  }

  async shutdown(): Promise<void> {
    // Cleanup
  }

  async synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer> {
    this.callCount++;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, this.synthesisDelay));

    switch (this.failureMode) {
      case 'timeout':
        throw new VoiceProviderError(
          'Synthesis timeout',
          this.id,
          'TIMEOUT',
        );
      case 'invalid':
        throw new VoiceProviderError(
          'Invalid text content',
          this.id,
          'INVALID_TEXT',
        );
      case 'unhealthy':
        throw new VoiceProviderError(
          'Provider is unhealthy',
          this.id,
          'UNHEALTHY',
        );
      default:
        // Return silent audio for testing
        return createSilentAudioBuffer(
          text.length * 0.05, // Estimate: ~50ms per character
          options?.sampleRate || 24000,
        );
    }
  }

  async *synthesizeStream(
    textStream: ReadableStream<string>,
    options?: SynthesisOptions,
  ): AsyncIterable<AudioBuffer> {
    const reader = textStream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Simulate streaming synthesis
        yield createSilentAudioBuffer(value.length * 0.05, options?.sampleRate || 24000);

        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      reader.releaseLock();
    }
  }

  async transcribe(audio: AudioBuffer, options?: TranscribeOptions): Promise<TranscriptionResult> {
    throw new VoiceProviderError(
      'Mock TTS provider does not support transcription',
      this.id,
      'UNSUPPORTED_OPERATION',
    );
  }

  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk> {
    throw new VoiceProviderError(
      'Mock TTS provider does not support transcription',
      this.id,
      'UNSUPPORTED_OPERATION',
    );
  }

  getCapabilities(): ProviderCapabilities {
    return createProviderCapabilities('tts', {
      estimatedLatencyMs: this.synthesisDelay,
    });
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  // Test helpers
  setFailureMode(mode: 'healthy' | 'unhealthy' | 'timeout' | 'invalid'): void {
    this.failureMode = mode;
    this.healthy = mode === 'healthy';
  }

  getCallCount(): number {
    return this.callCount;
  }

  setSynthesisDelay(delayMs: number): void {
    this.synthesisDelay = delayMs;
  }
}

/**
 * Mock Health Monitor
 */
export class MockHealthMonitor {
  private healthStatus: Map<string, boolean> = new Map();
  private checkCount: number = 0;
  private simulatedFailures: Map<string, number> = new Map();

  async checkHealth(providerId: string): Promise<boolean> {
    this.checkCount++;

    // Simulate failure if configured
    const remainingFailures = this.simulatedFailures.get(providerId) || 0;
    if (remainingFailures > 0) {
      this.simulatedFailures.set(providerId, remainingFailures - 1);
      return false;
    }

    const status = this.healthStatus.get(providerId);
    return status !== false; // Default to healthy
  }

  setHealthStatus(providerId: string, healthy: boolean): void {
    this.healthStatus.set(providerId, healthy);
  }

  simulateConsecutiveFailures(providerId: string, count: number): void {
    this.simulatedFailures.set(providerId, count);
  }

  getCheckCount(): number {
    return this.checkCount;
  }

  reset(): void {
    this.healthStatus.clear();
    this.simulatedFailures.clear();
    this.checkCount = 0;
  }
}

/**
 * Simulation utilities
 */
export class ProviderSimulator {
  /**
   * Simulate provider failure that triggers fallback
   */
  static simulateProviderFailure(provider: MockSTTProvider | MockTTSProvider): void {
    provider.setFailureMode('unhealthy');
  }

  /**
   * Simulate provider recovery
   */
  static simulateProviderRecovery(provider: MockSTTProvider | MockTTSProvider): void {
    provider.setFailureMode('healthy');
  }

  /**
   * Simulate timeout scenario
   */
  static simulateTimeout(provider: MockSTTProvider | MockTTSProvider): void {
    provider.setFailureMode('timeout');
    if (provider instanceof MockSTTProvider) {
      provider.setTranscriptionDelay(10000);
    } else {
      provider.setSynthesisDelay(10000);
    }
  }

  /**
   * Simulate network latency
   */
  static simulateNetworkLatency(
    provider: MockSTTProvider | MockTTSProvider,
    delayMs: number,
  ): void {
    if (provider instanceof MockSTTProvider) {
      provider.setTranscriptionDelay(delayMs);
    } else {
      provider.setSynthesisDelay(delayMs);
    }
  }

  /**
   * Simulate rate limiting
   */
  static simulateRateLimiting(
    provider: MockSTTProvider | MockTTSProvider,
  ): void {
    provider.setFailureMode('invalid');
  }

  /**
   * Simulate circuit breaker scenario
   */
  static async simulateCircuitBreakerBreak(
    provider: MockSTTProvider | MockTTSProvider,
    failureCount: number,
  ): Promise<void> {
    provider.setFailureMode('unhealthy');
    for (let i = 0; i < failureCount; i++) {
      try {
        if (provider instanceof MockSTTProvider) {
          await provider.transcribe({
            data: new Uint8Array(1000),
            format: AudioFormat.PCM_16,
            sampleRate: 16000,
            duration: 1.0,
            channels: 1,
          });
        } else {
          await provider.synthesize('test');
        }
      } catch {
        // Expected to fail
      }
    }
  }

  /**
   * Create realistic latency distribution
   */
  static getRealisticLatencyMs(providerType: 'cloud' | 'docker' | 'system'): number {
    switch (providerType) {
      case 'cloud':
        return 200 + Math.random() * 300; // 200-500ms
      case 'docker':
        return 100 + Math.random() * 200; // 100-300ms
      case 'system':
        return 50 + Math.random() * 150; // 50-200ms
    }
  }
}

/**
 * Test data generators
 */
export class TestDataGenerator {
  /**
   * Generate random transcription text
   */
  static generateTranscriptionText(wordCount: number = 10): string {
    const words = [
      'hello', 'world', 'test', 'voice', 'provider', 'transcription',
      'synthesis', 'audio', 'provider', 'integration', 'mock', 'test',
      'example', 'data', 'generate', 'random', 'orchestrator', 'fallback',
    ];

    return Array.from({ length: wordCount })
      .map(() => words[Math.floor(Math.random() * words.length)])
      .join(' ');
  }

  /**
   * Generate random audio buffer
   */
  static generateAudioBuffer(
    durationSeconds: number = 1.0,
    format: AudioFormat = AudioFormat.PCM_16,
  ): AudioBuffer {
    const sampleRate = 16000;
    const channels = 1;
    let dataSize: number;

    switch (format) {
      case AudioFormat.PCM_16:
        dataSize = durationSeconds * sampleRate * channels * 2;
        break;
      case AudioFormat.OPUS:
      case AudioFormat.MP3:
      case AudioFormat.AAC:
      case AudioFormat.VORBIS:
        dataSize = durationSeconds * sampleRate * 0.125; // Compressed
        break;
    }

    const data = new Uint8Array(dataSize);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }

    return {
      data,
      format,
      sampleRate,
      duration: durationSeconds,
      channels,
    };
  }

  /**
   * Generate multiple provider results
   */
  static generateTranscriptionResults(count: number, baseProvider: string): TranscriptionResult[] {
    const results: TranscriptionResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push({
        text: this.generateTranscriptionText(),
        confidence: 0.85 + Math.random() * 0.15,
        language: 'en',
        duration: 1.0 + Math.random() * 2.0,
        provider: `${baseProvider}-${i}`,
      });
    }
    return results;
  }
}

/**
 * Circuit breaker simulator
 */
export class CircuitBreakerSimulator {
  private open: boolean = false;
  private failureCount: number = 0;
  private successCount: number = 0;
  private readonly threshold: number;
  private readonly resetCount: number;

  constructor(threshold: number = 3, resetCount: number = 2) {
    this.threshold = threshold;
    this.resetCount = resetCount;
  }

  recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.threshold) {
      this.open = true;
    }
  }

  recordSuccess(): void {
    this.successCount++;
    this.failureCount = 0;

    if (this.successCount >= this.resetCount) {
      this.open = false;
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  reset(): void {
    this.open = false;
    this.failureCount = 0;
    this.successCount = 0;
  }

  getState(): {
    open: boolean;
    failureCount: number;
    successCount: number;
  } {
    return {
      open: this.open,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }
}

/**
 * Performance metrics collector
 */
export class PerformanceMetricsCollector {
  private latencies: number[] = [];
  private errors: number = 0;
  private successes: number = 0;

  recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
  }

  recordError(): void {
    this.errors++;
  }

  recordSuccess(): void {
    this.successes++;
  }

  getMetrics() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length || 0;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return {
      callCount: this.latencies.length,
      successCount: this.successes,
      errorCount: this.errors,
      errorRate: (this.errors / (this.successes + this.errors)) || 0,
      avgLatencyMs: avg,
      minLatencyMs: sorted[0] || 0,
      maxLatencyMs: sorted[sorted.length - 1] || 0,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
    };
  }

  reset(): void {
    this.latencies = [];
    this.errors = 0;
    this.successes = 0;
  }
}
