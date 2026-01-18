/**
 * CartesiaAI TTS Service
 *
 * Plugin service lifecycle management for CartesiaAI provider.
 * Handles initialization, credential validation, health checks,
 * and voice management.
 */

import type { CartesiaConfig } from './cartesia.js';
import { CartesiaExecutor } from './cartesia.js';
import type {
  VoiceProviderExecutor,
} from './executor.js';
import { VoiceProviderError } from './executor.js';

export interface CartesiaServiceConfig {
  apiKey: string;
  model?: 'sonic-3' | 'sonic-turbo';
  voiceId?: string;
  emotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';
  speed?: number;
  pitch?: number;
  language?: string;
  timeout?: number;
  connectionPoolSize?: number;
}

export class CartesiaService {
  private executor: CartesiaExecutor | null = null;
  private config: CartesiaServiceConfig;
  private isInitialized = false;

  constructor(config: CartesiaServiceConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Validate service configuration
   */
  private validateConfig(): void {
    if (!this.config.apiKey) {
      throw new VoiceProviderError(
        'CartesiaAI API key is required',
        'cartesia-service',
        'MISSING_API_KEY',
      );
    }

    // Validate API key format (should be non-empty string)
    if (typeof this.config.apiKey !== 'string' || this.config.apiKey.length < 10) {
      throw new VoiceProviderError(
        'Invalid CartesiaAI API key format',
        'cartesia-service',
        'INVALID_API_KEY',
      );
    }
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.executor) {
      return;
    }

    try {
      // Create executor with configuration
      const executorConfig: CartesiaConfig = {
        apiKey: this.config.apiKey,
        model: this.config.model || 'sonic-3',
        voiceId: this.config.voiceId,
        emotion: this.config.emotion,
        speed: this.config.speed,
        pitch: this.config.pitch,
        language: this.config.language,
        timeout: this.config.timeout,
        connectionPoolSize: this.config.connectionPoolSize,
      };

      this.executor = new CartesiaExecutor(executorConfig);

      // Initialize the executor
      await this.executor.initialize();

      this.isInitialized = true;
      console.log('[CartesiaAI Service] Initialized successfully');
    } catch (error) {
      throw new VoiceProviderError(
        `Service initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'cartesia-service',
        'INIT_FAILED',
      );
    }
  }

  /**
   * Get the executor instance
   */
  getExecutor(): VoiceProviderExecutor {
    if (!this.executor || !this.isInitialized) {
      throw new VoiceProviderError(
        'Service not initialized',
        'cartesia-service',
        'NOT_INITIALIZED',
      );
    }

    return this.executor;
  }

  /**
   * Test API credentials
   */
  async testCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
      if (!this.executor) {
        throw new Error('Executor not initialized');
      }

      const healthy = await this.executor.isHealthy();

      return {
        valid: healthy,
        error: healthy ? undefined : 'Health check failed',
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate credential with test synthesis
   */
  async validateWithTestSynthesis(testText: string = 'Hello, testing CartesiaAI TTS.'): Promise<{
    valid: boolean;
    error?: string;
    latencyMs?: number;
  }> {
    try {
      if (!this.executor) {
        throw new Error('Executor not initialized');
      }

      const startTime = Date.now();
      const audio = await this.executor.synthesize(testText);
      const endTime = Date.now();

      if (!audio || !audio.data || audio.data.length === 0) {
        return {
          valid: false,
          error: 'Synthesis produced no audio',
        };
      }

      return {
        valid: true,
        latencyMs: endTime - startTime,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get available voices
   */
  async getAvailableVoices(): Promise<any[]> {
    try {
      if (!this.executor) {
        throw new Error('Executor not initialized');
      }

      const metrics = (this.executor as CartesiaExecutor).getMetrics?.();
      // Voice loading happens during initialization
      // This is a placeholder for future voice listing API
      return [];
    } catch (error) {
      console.error('[CartesiaAI Service] Failed to get voices:', error);
      return [];
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    latencyMs: number;
    model: string;
    error?: string;
  }> {
    try {
      if (!this.executor) {
        throw new Error('Executor not initialized');
      }

      const healthy = await this.executor.isHealthy();
      const capabilities = this.executor.getCapabilities();
      const latency = (this.executor as CartesiaExecutor).getAverageLatency?.()
        || capabilities.estimatedLatencyMs;

      return {
        healthy,
        latencyMs: latency,
        model: this.config.model || 'sonic-3',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: 0,
        model: this.config.model || 'sonic-3',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CartesiaServiceConfig>): void {
    this.config = { ...this.config, ...updates };

    // Require re-initialization if API key changed
    if (updates.apiKey) {
      this.isInitialized = false;
      this.executor = null;
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    try {
      if (this.executor) {
        await this.executor.shutdown();
      }

      this.executor = null;
      this.isInitialized = false;
      console.log('[CartesiaAI Service] Shutdown complete');
    } catch (error) {
      console.error('[CartesiaAI Service] Shutdown error:', error);
    }
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.executor !== null;
  }

  /**
   * Get configuration (without exposing API key)
   */
  getConfig(): Omit<CartesiaServiceConfig, 'apiKey'> & { apiKeySet: boolean } {
    const { apiKey, ...configWithoutKey } = this.config;
    return {
      ...configWithoutKey,
      apiKeySet: !!apiKey,
    };
  }
}

/**
 * Create CartesiaAI service from environment or configuration
 */
export async function createCartesiaService(
  config?: CartesiaServiceConfig,
): Promise<CartesiaService> {
  const apiKey = config?.apiKey || process.env.CARTESIA_API_KEY;

  if (!apiKey) {
    throw new VoiceProviderError(
      'CartesiaAI API key not provided and CARTESIA_API_KEY not set',
      'cartesia-service',
      'NO_API_KEY',
    );
  }

  const service = new CartesiaService({
    ...config,
    apiKey,
  });

  await service.initialize();

  return service;
}
