/**
 * Faster-Whisper Plugin Service Registration
 *
 * Handles service registration, hardware detection, and auto-optimization setup
 * for the Faster-Whisper STT provider.
 */

import type { FasterWhisperConfig } from '../../config/types.voice.js';
import type { VoiceProviderExecutor } from './executor.js';
import { FasterWhisperExecutor } from './faster-whisper.js';
import {
  detectGPU,
  recommendOptimizations,
  formatGPUInfo,
  getSystemInfo,
} from './gpu-detection.js';

/**
 * Service registration options
 */
export interface FasterWhisperServiceOptions {
  id: string;
  config: FasterWhisperConfig;
  enableLogging?: boolean;
  autoOptimize?: boolean;
  profileHardware?: boolean;
}

/**
 * Service initialization result
 */
export interface ServiceInitResult {
  executor: VoiceProviderExecutor;
  gpuAvailable: boolean;
  gpuInfo: string;
  systemInfo: {
    cpuCount: number;
    cpuModel: string;
    totalMemoryGb: number;
    availableMemoryGb: number;
  };
  optimizations: {
    computeType: 'int8' | 'float16' | 'float32';
    cpuThreads: number;
    beamSize: number;
    gpuPreferred: boolean;
    estimatedLatencyMs: number;
    warnings: string[];
  };
}

/**
 * Faster-Whisper Service Manager
 * Handles service lifecycle, hardware detection, and optimization
 */
export class FasterWhisperService {
  private executor: FasterWhisperExecutor | null = null;
  private options: FasterWhisperServiceOptions;
  private initialized: boolean = false;

  constructor(options: FasterWhisperServiceOptions) {
    this.options = {
      enableLogging: true,
      autoOptimize: true,
      profileHardware: true,
      ...options,
    };
  }

  /**
   * Initialize service with hardware detection and optimization
   */
  async initialize(): Promise<ServiceInitResult> {
    this.log('Initializing Faster-Whisper service...');

    // Detect GPU and system capabilities
    const gpu = await detectGPU();
    const systemInfo = getSystemInfo();

    this.log(`System: ${systemInfo.cpuModel} (${systemInfo.cpuCount} cores, ${systemInfo.totalMemoryGb}GB RAM)`);
    this.log(`GPU: ${formatGPUInfo(gpu)}`);

    // Get optimization recommendations
    const recommendations = await recommendOptimizations(gpu);

    // Apply auto-optimization if enabled
    if (this.options.autoOptimize) {
      this.applyOptimizations(recommendations);
    }

    // Create executor
    this.executor = new FasterWhisperExecutor(this.options.id, this.options.config);

    // Initialize executor
    try {
      await this.executor.initialize();
      this.initialized = true;
      this.log('Executor initialized successfully');
    } catch (error) {
      this.log(`Executor initialization warning: ${error}`);
      // Don't throw - allow degraded mode
    }

    // Log capabilities
    const capabilities = this.executor.getCapabilities();
    this.log(`Capabilities: ${capabilities.supportedLanguages.length} languages, streaming=${capabilities.supportsStreaming}`);

    return {
      executor: this.executor,
      gpuAvailable: gpu.hasGPU,
      gpuInfo: formatGPUInfo(gpu),
      systemInfo: {
        cpuCount: systemInfo.cpuCount,
        cpuModel: systemInfo.cpuModel,
        totalMemoryGb: systemInfo.totalMemoryGb,
        availableMemoryGb: systemInfo.availableMemoryGb,
      },
      optimizations: {
        computeType: recommendations.computeType,
        cpuThreads: recommendations.cpuThreads,
        beamSize: recommendations.beamSize,
        gpuPreferred: recommendations.gpuPreferred,
        estimatedLatencyMs: recommendations.estimatedLatencyMs,
        warnings: recommendations.warningsAndNotes,
      },
    };
  }

  /**
   * Apply optimization recommendations to executor
   */
  private applyOptimizations(recommendations: Awaited<ReturnType<typeof recommendOptimizations>>): void {
    if (!this.executor) return;

    this.log(
      `Applying optimizations: ${recommendations.computeType}, ${recommendations.cpuThreads} threads, beam=${recommendations.beamSize}`,
    );

    this.executor.setComputeType(recommendations.computeType);
    this.executor.setCPUThreads(recommendations.cpuThreads);
    this.executor.setBeamSize(recommendations.beamSize);

    if (recommendations.warningsAndNotes.length > 0) {
      recommendations.warningsAndNotes.forEach(warning => {
        this.log(`[WARNING] ${warning}`);
      });
    }
  }

  /**
   * Get initialized executor
   */
  getExecutor(): VoiceProviderExecutor {
    if (!this.executor) {
      throw new Error('Service not initialized');
    }
    return this.executor;
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): any {
    if (!this.executor) {
      throw new Error('Service not initialized');
    }

    const metrics = (this.executor as FasterWhisperExecutor).getPerformanceMetrics();
    const gpu = (this.executor as FasterWhisperExecutor).getGPUCapabilities();

    return {
      initialized: this.initialized,
      computeType: (this.executor as FasterWhisperExecutor).getComputeType(),
      gpuCapabilities: gpu,
      performance: metrics,
    };
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    if (this.executor) {
      try {
        await this.executor.shutdown();
        this.log('Service shutdown complete');
      } catch (error) {
        this.log(`Shutdown warning: ${error}`);
      }
    }
    this.initialized = false;
  }

  /**
   * Helper for conditional logging
   */
  private log(message: string): void {
    if (this.options.enableLogging) {
      console.log(`[Faster-Whisper] ${message}`);
    }
  }
}

/**
 * Factory function to create and initialize service
 */
export async function createFasterWhisperService(
  options: FasterWhisperServiceOptions,
): Promise<ServiceInitResult> {
  const service = new FasterWhisperService(options);
  return service.initialize();
}

/**
 * Plugin registration metadata
 */
export const FasterWhisperPluginMetadata = {
  name: 'faster-whisper',
  version: '1.0.0',
  description: 'High-performance Whisper STT provider with compute optimization',
  supports: {
    stt: true,
    tts: false,
    streaming: true,
    gpu: ['cuda', 'mps', 'rocm'],
  },
  features: {
    computeTypes: ['int8', 'float16', 'float32'],
    autoOptimization: true,
    gpuDetection: true,
    performanceMetrics: true,
    supportedLanguages: 99,
  },
  performance: {
    recommendedMinMemoryGb: 2,
    recommendedMinCpuCores: 2,
    optimizedForGpu: true,
  },
};

/**
 * Register the Faster-Whisper provider globally
 */
export function registerFasterWhisperProvider(): void {
  if (typeof globalThis !== 'undefined') {
    const providers = (globalThis as any).__voice_providers__ || {};
    providers['faster-whisper'] = {
      metadata: FasterWhisperPluginMetadata,
      createService: createFasterWhisperService,
      ExecutorClass: FasterWhisperExecutor,
    };
    (globalThis as any).__voice_providers__ = providers;
  }
}

/**
 * Get provider information
 */
export function getFasterWhisperInfo(): {
  metadata: typeof FasterWhisperPluginMetadata;
  status: 'ready' | 'installing' | 'unavailable';
  recommendedSetup: string[];
} {
  return {
    metadata: FasterWhisperPluginMetadata,
    status: 'ready',
    recommendedSetup: [
      'For best performance, install CUDA: https://developer.nvidia.com/cuda-downloads',
      'Or use ROCm for AMD GPUs: https://rocmdocs.amd.com/',
      'On macOS, Metal (MPS) is automatically available on Apple Silicon',
      'CPU-only mode supported but slower',
    ],
  };
}
