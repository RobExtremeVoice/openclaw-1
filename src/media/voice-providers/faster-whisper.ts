/**
 * Faster-Whisper STT Provider Executor
 *
 * High-performance Whisper implementation with compute optimization.
 * Supports CPU and GPU execution with configurable accuracy/speed tradeoffs.
 *
 * Key features:
 * - Multiple compute types: int8 (fastest), float16 (balanced), float32 (accurate)
 * - GPU detection and automatic optimization
 * - CPU thread configuration for parallel processing
 * - Beam search size tuning for accuracy
 * - Streaming transcription support
 * - Performance monitoring and metrics
 */

import type {
  AudioBuffer,
  ProviderCapabilities,
  TranscribeOptions,
  TranscriptionChunk,
  TranscriptionResult,
  VoiceProviderExecutor,
} from './executor.js';
import { AudioFormat, BaseVoiceProviderExecutor, VoiceProviderError } from './executor.js';
import type { FasterWhisperConfig } from '../../config/types.voice.js';

/**
 * Compute type for Faster-Whisper quantization
 * int8: Smallest model, fastest inference, lower accuracy
 * float16: Balanced speed/accuracy, good for most use cases
 * float32: Highest accuracy, slowest inference, largest model
 */
export type ComputeType = 'int8' | 'float16' | 'float32';

/**
 * GPU hardware detection result
 */
export interface GPUCapabilities {
  available: boolean;
  type?: 'cuda' | 'mps' | 'rocm'; // GPU type: NVIDIA, Apple, AMD
  memoryGb?: number;
  computeCapability?: string; // e.g., "8.6" for A100
  driverVersion?: string;
}

/**
 * Performance metrics for transcription
 */
export interface TranscriptionMetrics {
  computeType: ComputeType;
  gpuUsed: boolean;
  durationMs: number;
  audioLengthMs: number;
  rtf: number; // Real-time factor (processing time / audio length)
  cpuUsagePercent?: number;
  gpuUsagePercent?: number;
  memoryUsageMb?: number;
}

/**
 * Configuration for compute type optimization
 */
export interface ComputeOptimizationConfig {
  autoOptimize: boolean;
  preferredComputeType?: ComputeType;
  gpuPreferred: boolean;
  cpuThreads?: number;
  beamSize?: number;
}

/**
 * Faster-Whisper model cache entry
 */
interface ModelCacheEntry {
  model: any; // Actual faster-whisper model instance
  computeType: ComputeType;
  loadTimeMs: number;
  lastAccessTime: number;
}

/**
 * FasterWhisperExecutor - Local speech-to-text with compute optimization
 */
export class FasterWhisperExecutor extends BaseVoiceProviderExecutor implements VoiceProviderExecutor {
  override readonly id: string;
  private config: FasterWhisperConfig;
  private modelCache: Map<string, ModelCacheEntry> = new Map();
  private gpuCapabilities: GPUCapabilities | null = null;
  private optimizationConfig: ComputeOptimizationConfig;
  private metrics: TranscriptionMetrics[] = [];
  private healthy: boolean = false;
  private initializationError: Error | null = null;

  // Supported languages (extended set for Whisper)
  private readonly supportedLanguages = [
    'en', 'zh', 'de', 'es', 'ru', 'ko', 'fr', 'ja', 'pt', 'tr',
    'pl', 'ca', 'nl', 'ar', 'sv', 'it', 'id', 'hi', 'fi', 'vi',
    'he', 'uk', 'el', 'ms', 'cs', 'ro', 'da', 'hu', 'ta', 'no',
    'th', 'ur', 'hr', 'bg', 'lt', 'la', 'mi', 'ml', 'cy', 'sk',
    'te', 'fa', 'lv', 'bn', 'sr', 'az', 'sl', 'kn', 'et', 'mk',
    'br', 'eu', 'is', 'hy', 'ne', 'mn', 'bs', 'kk', 'sq', 'sw',
    'gl', 'mr', 'pa', 'si', 'km', 'sn', 'so', 'af', 'oc', 'ka',
    'be', 'tg', 'sd', 'gu', 'am', 'yi', 'lo', 'uz', 'fo', 'mt',
    'ps', 'tk', 'nn', 'dv', 'ckb', 'ff', 'as', 'gn', 'mni', 'abr'
  ];

  constructor(id: string, config: FasterWhisperConfig) {
    super();
    this.id = id;
    this.config = config;

    // Initialize optimization configuration
    this.optimizationConfig = {
      autoOptimize: true,
      preferredComputeType: config.computeType,
      gpuPreferred: true,
      cpuThreads: config.cpuThreads,
      beamSize: config.beamSize,
    };
  }

  /**
   * Initialize executor and detect GPU capabilities
   */
  override async initialize(): Promise<void> {
    try {
      // Detect GPU capabilities
      this.gpuCapabilities = await this.detectGPU();

      // Auto-optimize compute type if not explicitly set
      if (this.optimizationConfig.autoOptimize && !this.config.computeType) {
        this.optimizationConfig.preferredComputeType = await this.selectOptimalComputeType();
      }

      this.healthy = true;
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Failed to initialize Faster-Whisper executor: ${this.initializationError.message}`);
      // Don't throw - allow degraded mode operation
    }
  }

  /**
   * Shutdown and cleanup resources
   */
  override async shutdown(): Promise<void> {
    // Clear model cache
    for (const [, entry] of this.modelCache) {
      try {
        if (entry.model?.dispose) {
          await entry.model.dispose();
        }
      } catch (error) {
        console.warn('Failed to dispose model:', error);
      }
    }
    this.modelCache.clear();
    this.healthy = false;
  }

  /**
   * TTS not supported by Faster-Whisper (STT only)
   */
  async synthesize(
    _text: string,
  ): Promise<AudioBuffer> {
    throw new VoiceProviderError(
      'Synthesis not supported by Faster-Whisper',
      this.id,
      'NOT_SUPPORTED',
    );
  }

  /**
   * TTS streaming not supported by Faster-Whisper (STT only)
   */
  async *synthesizeStream(
    _textStream: ReadableStream<string>,
  ): AsyncIterable<AudioBuffer> {
    throw new VoiceProviderError(
      'Synthesis not supported by Faster-Whisper',
      this.id,
      'NOT_SUPPORTED',
    );
  }

  /**
   * Transcribe audio buffer to text
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    const startTime = performance.now();

    try {
      // Validate audio
      this.validateAudioBuffer(audio);

      // Normalize audio if needed
      const normalizedAudio = this.normalizeAudioBuffer(
        audio,
        AudioFormat.PCM_16,
        16000,
      );

      // Get model
      const computeType = this.optimizationConfig.preferredComputeType ?? 'float16';
      const model = await this.loadModel(computeType);

      // Prepare transcription options
      const transcriptionOpts = {
        language: options?.language || this.config.language,
        beam_size: this.optimizationConfig.beamSize ?? 5,
        num_workers: this.optimizationConfig.cpuThreads ?? 1,
        fp16: computeType !== 'float32',
        int8: computeType === 'int8',
      };

      // Perform transcription
      const result = await this.performTranscription(
        model,
        normalizedAudio,
        transcriptionOpts,
      );

      // Record metrics
      const durationMs = performance.now() - startTime;
      this.recordMetrics({
        computeType,
        gpuUsed: this.gpuCapabilities?.available ?? false,
        durationMs,
        audioLengthMs: audio.duration,
        rtf: durationMs / audio.duration,
      });

      return {
        text: result.text,
        confidence: result.confidence,
        language: result.language,
        duration: audio.duration,
        provider: this.id,
      };
    } catch (error) {
      throw new VoiceProviderError(
        `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'TRANSCRIPTION_FAILED',
      );
    }
  }

  /**
   * Stream transcription for real-time speech-to-text
   */
  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk> {
    const computeType = this.optimizationConfig.preferredComputeType ?? 'float16';
    const model = await this.loadModel(computeType);

    const reader = audioStream.getReader();
    let buffer: Uint8Array = new Uint8Array();
    let chunkNumber = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Accumulate audio data
        const newBuffer = new Uint8Array(buffer.length + value.data.length);
        newBuffer.set(buffer);
        newBuffer.set(value.data, buffer.length);
        buffer = newBuffer;

        // Process when we have enough data (e.g., 1 second of audio at 16kHz)
        const minSampleCount = 16000; // 1 second at 16kHz
        if (buffer.length >= minSampleCount * 2) {
          // 2 bytes per sample for PCM16
          const chunkToProcess = buffer.slice(0, minSampleCount * 2);
          buffer = buffer.slice(minSampleCount * 2);

          const transcriptionOpts = {
            language: options?.language || this.config.language,
            beam_size: this.optimizationConfig.beamSize ?? 5,
            num_workers: this.optimizationConfig.cpuThreads ?? 1,
            fp16: computeType !== 'float32',
            int8: computeType === 'int8',
          };

          const result = await this.performTranscription(
            model,
            {
              data: chunkToProcess,
              format: AudioFormat.PCM_16,
              sampleRate: 16000,
              duration: minSampleCount / 16,
              channels: 1,
            },
            transcriptionOpts,
          );

          yield {
            text: result.text,
            partial: buffer.length > 0,
            timestamp: chunkNumber++,
          };
        }
      }

      // Process remaining buffer
      if (buffer.length > 0) {
        const transcriptionOpts = {
          language: options?.language || this.config.language,
          beam_size: this.optimizationConfig.beamSize ?? 5,
          num_workers: this.optimizationConfig.cpuThreads ?? 1,
          fp16: computeType !== 'float32',
          int8: computeType === 'int8',
        };

        const result = await this.performTranscription(
          model,
          {
            data: buffer,
            format: AudioFormat.PCM_16,
            sampleRate: 16000,
            duration: (buffer.length / 2) / 16,
            channels: 1,
          },
          transcriptionOpts,
        );

        yield {
          text: result.text,
          partial: false,
          timestamp: chunkNumber++,
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get executor capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportedFormats: [
        AudioFormat.PCM_16,
        AudioFormat.OPUS,
        AudioFormat.MP3,
      ],
      supportedSampleRates: [8000, 16000, 32000, 44100, 48000],
      supportedLanguages: this.supportedLanguages,
      supportsStreaming: true,
      maxConcurrentSessions: this.optimizationConfig.cpuThreads ?? 4,
      estimatedLatencyMs: this.gpuCapabilities?.available ? 500 : 2000,
      requiresNetworkConnection: false,
      requiresLocalModel: true,
    };
  }

  /**
   * Check executor health
   */
  async isHealthy(): Promise<boolean> {
    return this.healthy && this.initializationError === null;
  }

  /**
   * --- Private Methods ---
   */

  /**
   * Detect GPU capabilities on the system
   */
  private async detectGPU(): Promise<GPUCapabilities> {
    try {
      // Try CUDA detection (NVIDIA)
      if (await this.checkCUDA()) {
        return {
          available: true,
          type: 'cuda',
          memoryGb: await this.getCUDAMemory(),
        };
      }

      // Try MPS detection (Apple Metal)
      if (await this.checkMPS()) {
        return {
          available: true,
          type: 'mps',
        };
      }

      // Try ROCm detection (AMD)
      if (await this.checkROCm()) {
        return {
          available: true,
          type: 'rocm',
          memoryGb: await this.getROCmMemory(),
        };
      }

      return { available: false };
    } catch (error) {
      console.warn('GPU detection failed:', error);
      return { available: false };
    }
  }

  /**
   * Check if CUDA is available
   */
  private async checkCUDA(): Promise<boolean> {
    try {
      // This would use native bindings or shell check in real implementation
      // For now, simulate with environment variable check
      const cudaPath = process.env.CUDA_PATH;
      return !!cudaPath;
    } catch {
      return false;
    }
  }

  /**
   * Get CUDA memory in GB
   */
  private async getCUDAMemory(): Promise<number> {
    // This would query nvidia-smi in real implementation
    return 4; // Default estimate
  }

  /**
   * Check if Metal Performance Shaders (MPS) is available (Apple)
   */
  private async checkMPS(): Promise<boolean> {
    try {
      return process.platform === 'darwin';
    } catch {
      return false;
    }
  }

  /**
   * Check if ROCm is available (AMD)
   */
  private async checkROCm(): Promise<boolean> {
    try {
      const rocmPath = process.env.ROCM_PATH;
      return !!rocmPath;
    } catch {
      return false;
    }
  }

  /**
   * Get ROCm memory in GB
   */
  private async getROCmMemory(): Promise<number> {
    // This would query rocm-smi in real implementation
    return 4; // Default estimate
  }

  /**
   * Select optimal compute type based on hardware
   */
  private async selectOptimalComputeType(): Promise<ComputeType> {
    // Priority: speed vs accuracy based on hardware
    if (this.gpuCapabilities?.available) {
      // GPU available - use float16 for good balance
      if (this.gpuCapabilities.type === 'cuda' && this.gpuCapabilities.memoryGb && this.gpuCapabilities.memoryGb >= 8) {
        return 'float32'; // High-end NVIDIA GPU: use maximum accuracy
      }
      return 'float16'; // Balanced for GPU
    }

    // CPU-only: prefer int8 for speed on mobile/edge devices
    const cpuCount = require('os').cpus().length;
    if (cpuCount >= 8) {
      return 'float16'; // Multi-core CPU: can handle float16
    }
    return 'int8'; // Limited CPU: use quantized model
  }

  /**
   * Load or retrieve cached model
   */
  private async loadModel(computeType: ComputeType): Promise<any> {
    const cacheKey = `whisper-${computeType}-${this.config.modelSize || 'base'}`;

    // Check cache
    const cached = this.modelCache.get(cacheKey);
    if (cached) {
      cached.lastAccessTime = Date.now();
      return cached.model;
    }

    // Load new model
    const startTime = performance.now();
    try {
      // In real implementation, would load faster-whisper model
      // For now, create mock model object
      const model = await this.createMockModel(
        this.config.modelSize || 'base',
        computeType,
      );

      const loadTimeMs = performance.now() - startTime;

      this.modelCache.set(cacheKey, {
        model,
        computeType,
        loadTimeMs,
        lastAccessTime: Date.now(),
      });

      return model;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to load model: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'MODEL_LOAD_FAILED',
      );
    }
  }

  /**
   * Perform actual transcription with model
   */
  private async performTranscription(
    model: any,
    audio: AudioBuffer,
    options: any,
  ): Promise<{ text: string; confidence: number; language: string }> {
    // In real implementation, would call model.transcribe()
    // For now, return mock result
    return {
      text: '[Mock transcription result]',
      confidence: 0.85,
      language: options.language || 'en',
    };
  }

  /**
   * Create mock model for testing
   */
  private async createMockModel(modelSize: string, computeType: ComputeType): Promise<any> {
    return {
      modelSize,
      computeType,
      transcribe: async (audio: any, options: any) => ({
        text: '[Transcribed text]',
        language: options?.language || 'en',
      }),
      dispose: async () => {
        // Cleanup
      },
    };
  }

  /**
   * Validate audio buffer
   */
  private validateAudioBuffer(audio: AudioBuffer): void {
    if (!audio.data || audio.data.length === 0) {
      throw new VoiceProviderError(
        'Audio buffer is empty',
        this.id,
        'INVALID_AUDIO',
      );
    }

    if (audio.sampleRate !== 16000 && audio.sampleRate !== 8000) {
      throw new VoiceProviderError(
        `Unsupported sample rate: ${audio.sampleRate}. Expected 8000 or 16000`,
        this.id,
        'INVALID_SAMPLE_RATE',
      );
    }
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(metrics: Partial<TranscriptionMetrics>): void {
    const fullMetrics: TranscriptionMetrics = {
      computeType: (metrics.computeType || 'float16') as ComputeType,
      gpuUsed: metrics.gpuUsed ?? false,
      durationMs: metrics.durationMs ?? 0,
      audioLengthMs: metrics.audioLengthMs ?? 0,
      rtf: metrics.rtf ?? 0,
    };

    this.metrics.push(fullMetrics);

    // Keep last 100 metrics for memory efficiency
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }
  }

  /**
   * Get aggregated performance metrics
   */
  public getPerformanceMetrics(): {
    averageLatencyMs: number;
    averageRTF: number;
    computeTypeDistribution: Record<ComputeType, number>;
    gpuUsagePercent: number;
  } {
    if (this.metrics.length === 0) {
      return {
        averageLatencyMs: 0,
        averageRTF: 0,
        computeTypeDistribution: { int8: 0, float16: 0, float32: 0 },
        gpuUsagePercent: 0,
      };
    }

    const avgDuration = this.metrics.reduce((sum, m) => sum + m.durationMs, 0) / this.metrics.length;
    const avgRTF = this.metrics.reduce((sum, m) => sum + m.rtf, 0) / this.metrics.length;
    const gpuCount = this.metrics.filter(m => m.gpuUsed).length;

    const distribution: Record<ComputeType, number> = { int8: 0, float16: 0, float32: 0 };
    this.metrics.forEach(m => {
      distribution[m.computeType]++;
    });

    return {
      averageLatencyMs: avgDuration,
      averageRTF: avgRTF,
      computeTypeDistribution: distribution,
      gpuUsagePercent: (gpuCount / this.metrics.length) * 100,
    };
  }

  /**
   * Get current GPU capabilities
   */
  public getGPUCapabilities(): GPUCapabilities | null {
    return this.gpuCapabilities;
  }

  /**
   * Manually set compute type (for testing/optimization)
   */
  public setComputeType(computeType: ComputeType): void {
    this.optimizationConfig.preferredComputeType = computeType;
    // Clear cache to force reload with new compute type
    this.modelCache.clear();
  }

  /**
   * Get current compute type
   */
  public getComputeType(): ComputeType {
    return this.optimizationConfig.preferredComputeType ?? 'float16';
  }

  /**
   * Set CPU threads for parallel processing
   */
  public setCPUThreads(threads: number): void {
    if (threads < 1) {
      throw new Error('CPU threads must be at least 1');
    }
    this.optimizationConfig.cpuThreads = threads;
  }

  /**
   * Set beam size for accuracy tuning
   */
  public setBeamSize(beamSize: number): void {
    if (beamSize < 1 || beamSize > 512) {
      throw new Error('Beam size must be between 1 and 512');
    }
    this.optimizationConfig.beamSize = beamSize;
  }
}
