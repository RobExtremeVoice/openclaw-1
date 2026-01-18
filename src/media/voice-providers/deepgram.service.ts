/**
 * Deepgram Service - Plugin Lifecycle Management
 *
 * Handles:
 * - Service initialization and shutdown
 * - Credential validation
 * - Health monitoring
 * - Connection pooling
 * - Metrics collection for latency and accuracy
 */

import { DeepgramExecutor, type DeepgramConfig } from './deepgram.js';
import { VoiceProviderError } from './executor.js';

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  lastCheck: Date;
  latencyMs?: number;
  error?: string;
}

/**
 * Service metrics
 */
export interface DeepgramMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  turnDetectionAccuracy: number;
}

/**
 * Deepgram Service
 *
 * Manages the lifecycle of Deepgram STT provider instances.
 */
export class DeepgramService {
  private executor: DeepgramExecutor | undefined;
  private config: DeepgramConfig | undefined;
  private healthCheck: HealthCheckResult = {
    healthy: false,
    lastCheck: new Date(),
  };
  private metrics: DeepgramMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    errorRate: 0,
    turnDetectionAccuracy: 0,
  };
  private latencyHistory: number[] = [];
  private readonly maxLatencyHistorySize = 1000;
  private turnDetectionAccuracyCount = 0;
  private turnDetectionCorrectCount = 0;

  /**
   * Initialize service with configuration
   */
  async initialize(config: DeepgramConfig): Promise<void> {
    this.validateConfiguration(config);

    this.config = config;
    this.executor = new DeepgramExecutor('deepgram-stt', config);

    try {
      await this.executor.initialize();
      this.healthCheck = {
        healthy: true,
        lastCheck: new Date(),
      };
    } catch (error) {
      this.healthCheck = {
        healthy: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  /**
   * Shutdown service and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.executor) {
      try {
        await this.executor.shutdown();
      } catch (error) {
        console.error(
          `Error shutting down Deepgram executor: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.executor = undefined;
    }

    this.healthCheck = {
      healthy: false,
      lastCheck: new Date(),
    };
  }

  /**
   * Get executor instance
   */
  getExecutor(): DeepgramExecutor {
    if (!this.executor) {
      throw new VoiceProviderError(
        'Deepgram service not initialized',
        'deepgram-service',
        'NOT_INITIALIZED',
      );
    }

    return this.executor;
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<HealthCheckResult> {
    if (!this.executor) {
      return {
        healthy: false,
        lastCheck: new Date(),
        error: 'Service not initialized',
      };
    }

    const startTime = Date.now();

    try {
      const healthy = await this.executor.isHealthy();
      const latencyMs = Date.now() - startTime;

      this.healthCheck = {
        healthy,
        lastCheck: new Date(),
        latencyMs,
      };

      return this.healthCheck;
    } catch (error) {
      this.healthCheck = {
        healthy: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };

      return this.healthCheck;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthCheckResult {
    return { ...this.healthCheck };
  }

  /**
   * Record successful request with latency
   */
  recordSuccess(latencyMs: number): void {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.updateLatencyMetrics(latencyMs);
    this.updateErrorRate();
  }

  /**
   * Record failed request
   */
  recordFailure(): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    this.updateErrorRate();
  }

  /**
   * Update turn detection accuracy
   */
  recordTurnDetectionAccuracy(isAccurate: boolean): void {
    this.turnDetectionAccuracyCount++;
    if (isAccurate) {
      this.turnDetectionCorrectCount++;
    }

    this.metrics.turnDetectionAccuracy = this.turnDetectionAccuracyCount > 0
      ? this.turnDetectionCorrectCount / this.turnDetectionAccuracyCount
      : 0;
  }

  /**
   * Get service metrics
   */
  getMetrics(): DeepgramMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      errorRate: 0,
      turnDetectionAccuracy: 0,
    };
    this.latencyHistory = [];
    this.turnDetectionAccuracyCount = 0;
    this.turnDetectionCorrectCount = 0;
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(config: DeepgramConfig): void {
    if (!config.apiKey) {
      throw new VoiceProviderError(
        'Deepgram API key is required',
        'deepgram-service',
        'MISSING_API_KEY',
      );
    }

    if (!config.apiKey.startsWith('sk-') && !config.apiKey.startsWith('test_')) {
      throw new VoiceProviderError(
        'Invalid Deepgram API key format',
        'deepgram-service',
        'INVALID_API_KEY_FORMAT',
      );
    }

    const validModels = ['nova-v3', 'flux'];
    if (config.model && !validModels.includes(config.model)) {
      throw new VoiceProviderError(
        `Invalid model. Must be one of: ${validModels.join(', ')}`,
        'deepgram-service',
        'INVALID_MODEL',
      );
    }

    if (config.numSpeakers && config.numSpeakers < 1) {
      throw new VoiceProviderError(
        'numSpeakers must be at least 1',
        'deepgram-service',
        'INVALID_NUM_SPEAKERS',
      );
    }
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latencyMs: number): void {
    this.latencyHistory.push(latencyMs);

    // Keep history size under control
    if (this.latencyHistory.length > this.maxLatencyHistorySize) {
      this.latencyHistory.shift();
    }

    // Calculate average
    const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
    this.metrics.averageLatencyMs = sum / this.latencyHistory.length;

    // Calculate percentiles
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    this.metrics.p95LatencyMs = sorted[p95Index] ?? 0;
    this.metrics.p99LatencyMs = sorted[p99Index] ?? 0;
  }

  /**
   * Update error rate
   */
  private updateErrorRate(): void {
    if (this.metrics.totalRequests === 0) {
      this.metrics.errorRate = 0;
    } else {
      this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;
    }
  }
}

/**
 * Singleton instance
 */
let serviceInstance: DeepgramService | undefined;

/**
 * Get or create singleton service instance
 */
export function getDeepgramService(): DeepgramService {
  if (!serviceInstance) {
    serviceInstance = new DeepgramService();
  }

  return serviceInstance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetDeepgramService(): void {
  serviceInstance = undefined;
}

export default DeepgramService;
