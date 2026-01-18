/**
 * Voice Provider Orchestrator
 *
 * Central coordinator for STT/TTS providers with intelligent provider selection,
 * fallback chain management, health monitoring, and configuration integration.
 *
 * Features:
 * - Provider selection based on priority and health status
 * - Automatic fallback chain traversal on failures
 * - Circuit breaker pattern for repeated failures
 * - Periodic health monitoring
 * - Deployment mode preference (docker/system/cloud)
 * - Configuration hot-reload without restart
 * - Comprehensive logging and metrics
 */

import type {
  VoiceProviderExecutor,
  AudioBuffer,
  TranscribeOptions,
  SynthesisOptions,
  TranscriptionResult,
  TranscriptionChunk,
} from './executor.js';
import { VoiceProviderError } from './executor.js';
import type {
  VoiceProvidersConfig,
  VoiceProviderEntry,
} from '../../config/zod-schema.voice-providers.js';
import type {
  BaseDeploymentConfig,
  DockerDeploymentConfig,
  SystemDeploymentConfig,
  CloudDeploymentConfig,
} from '../../config/deployment-config.types.js';

/**
 * Deployment configuration union type
 */
export type DeploymentConfig = DockerDeploymentConfig | SystemDeploymentConfig | CloudDeploymentConfig;

/**
 * Health status for a single provider
 */
export interface ProviderHealth {
  providerId: string;
  healthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  circuitBreakerOpen: boolean;
  capabilities?: any;
  error?: string;
}

/**
 * Orchestrator configuration options
 */
export interface VoiceOrchestratorOptions {
  config: VoiceProvidersConfig;
  deploymentConfig?: DeploymentConfig | DeploymentConfig[];
  defaultMode?: 'docker' | 'system' | 'cloud';
  fallbackChain?: boolean;
  healthCheckInterval?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  logger?: {
    debug?: (msg: string, meta?: any) => void;
    info?: (msg: string, meta?: any) => void;
    warn?: (msg: string, meta?: any) => void;
    error?: (msg: string, meta?: any) => void;
  };
}

/**
 * Provider health status tracking
 */
interface ProviderHealthTracker {
  [providerId: string]: ProviderHealth;
}

/**
 * Circuit breaker state for a provider
 */
interface CircuitBreakerState {
  [providerId: string]: {
    open: boolean;
    openedAt: number;
    failureCount: number;
  };
}

/**
 * VoiceOrchestrator - Central coordinator for voice providers
 */
export class VoiceOrchestrator {
  private config: VoiceProvidersConfig;
  private deploymentConfigs: Map<string, DeploymentConfig> = new Map();
  private providers: Map<string, VoiceProviderExecutor> = new Map();
  private sttProviders: VoiceProviderExecutor[] = [];
  private ttsProviders: VoiceProviderExecutor[] = [];
  private healthTrackers: ProviderHealthTracker = {};
  private circuitBreakers: CircuitBreakerState = {};
  private healthCheckInterval: number = 30000; // 30 seconds default
  private circuitBreakerThreshold: number = 3;
  private circuitBreakerResetMs: number = 60000; // 1 minute
  private defaultMode: 'docker' | 'system' | 'cloud' = 'system';
  private fallbackChainEnabled: boolean = true;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;
  private logger: {
    debug: (msg: string, meta?: any) => void;
    info: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };

  constructor(options: Partial<VoiceOrchestratorOptions> = {}) {
    // Initialize logger
    const defaultLogger = {
      debug: (msg: string) => console.debug(`[VoiceOrchestrator] ${msg}`),
      info: (msg: string) => console.info(`[VoiceOrchestrator] ${msg}`),
      warn: (msg: string) => console.warn(`[VoiceOrchestrator] ${msg}`),
      error: (msg: string) => console.error(`[VoiceOrchestrator] ${msg}`),
    };

    this.logger = {
      debug: options.logger?.debug || defaultLogger.debug,
      info: options.logger?.info || defaultLogger.info,
      warn: options.logger?.warn || defaultLogger.warn,
      error: options.logger?.error || defaultLogger.error,
    };

    // Initialize configuration
    this.config = options.config || {
      enabled: false,
      providers: [],
      autoDetectCapabilities: true,
    };
    this.defaultMode = options.defaultMode || 'system';
    this.fallbackChainEnabled = options.fallbackChain !== false;
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold || 3;
    this.circuitBreakerResetMs = options.circuitBreakerResetMs || 60000;

    // Load deployment configs
    if (options.deploymentConfig) {
      if (Array.isArray(options.deploymentConfig)) {
        for (const cfg of options.deploymentConfig) {
          this.deploymentConfigs.set(cfg.id, cfg);
        }
      } else {
        this.deploymentConfigs.set(options.deploymentConfig.id, options.deploymentConfig);
      }
    }

    this.logger.info('VoiceOrchestrator initialized with options', {
      defaultMode: this.defaultMode,
      fallbackChainEnabled: this.fallbackChainEnabled,
      healthCheckInterval: this.healthCheckInterval,
    });
  }

  /**
   * Initialize the orchestrator and all providers
   */
  async initialize(options?: Partial<VoiceOrchestratorOptions>): Promise<void> {
    if (this.initialized) {
      this.logger.warn('VoiceOrchestrator already initialized, skipping');
      return;
    }

    try {
      // Update configuration if provided
      if (options?.config) {
        this.config = options.config;
      }

      // Update options if provided
      if (options?.fallbackChain !== undefined) {
        this.fallbackChainEnabled = options.fallbackChain;
      }
      if (options?.healthCheckInterval !== undefined) {
        this.healthCheckInterval = options.healthCheckInterval;
      }
      if (options?.circuitBreakerThreshold !== undefined) {
        this.circuitBreakerThreshold = options.circuitBreakerThreshold;
      }
      if (options?.circuitBreakerResetMs !== undefined) {
        this.circuitBreakerResetMs = options.circuitBreakerResetMs;
      }

      if (!this.config?.enabled || !this.config?.providers?.length) {
        this.logger.warn('Voice providers not enabled or no providers configured');
        this.initialized = true;
        return;
      }

      // Initialize all providers from configuration
      await this.loadProviders();

      // Start health checks
      this.startHealthChecks();

      this.initialized = true;
      this.logger.info('VoiceOrchestrator initialized successfully', {
        sttProviders: this.sttProviders.length,
        ttsProviders: this.ttsProviders.length,
      });
    } catch (error) {
      this.logger.error('Failed to initialize VoiceOrchestrator', { error });
      throw new VoiceProviderError(
        'Failed to initialize orchestrator',
        'orchestrator',
        'INIT_FAILED',
      );
    }
  }

  /**
   * Shutdown the orchestrator and all providers
   */
  async shutdown(): Promise<void> {
    try {
      // Stop health checks
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }

      // Shutdown all providers
      const errors: Error[] = [];
      for (const provider of this.providers.values()) {
        try {
          await provider.shutdown();
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }

      this.providers.clear();
      this.sttProviders = [];
      this.ttsProviders = [];
      this.healthTrackers = {};
      this.circuitBreakers = {};
      this.initialized = false;

      if (errors.length > 0) {
        this.logger.warn('Some providers failed to shutdown cleanly', {
          count: errors.length,
        });
      }

      this.logger.info('VoiceOrchestrator shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  /**
   * Transcribe audio using STT providers with fallback chain
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    if (!this.initialized) {
      throw new VoiceProviderError(
        'Orchestrator not initialized',
        'orchestrator',
        'NOT_INITIALIZED',
      );
    }

    if (this.sttProviders.length === 0) {
      throw new VoiceProviderError(
        'No STT providers available',
        'orchestrator',
        'NO_PROVIDERS',
      );
    }

    if (!this.fallbackChainEnabled) {
      // Use only the first (primary) provider without fallback
      const provider = this.sttProviders[0];
      return this.transcribeWithProvider(provider, audio, options);
    }

    // Try each provider in fallback chain
    for (let i = 0; i < this.sttProviders.length; i++) {
      const provider = this.sttProviders[i];

      try {
        // Check provider health
        if (!this.isProviderHealthy(provider.id)) {
          this.logger.debug(`Skipping unhealthy STT provider: ${provider.id}`);
          continue;
        }

        // Check circuit breaker
        if (this.isCircuitBreakerOpen(provider.id)) {
          this.logger.debug(`Circuit breaker open for: ${provider.id}`);
          continue;
        }

        const result = await this.transcribeWithProvider(provider, audio, options);
        this.recordProviderSuccess(provider.id);
        return result;
      } catch (error) {
        this.recordProviderFailure(provider.id);

        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Transcription failed with ${provider.id}`, {
          error: errorMsg,
          attemptNumber: i + 1,
          totalProviders: this.sttProviders.length,
        });

        if (i === this.sttProviders.length - 1) {
          throw new VoiceProviderError(
            `All ${this.sttProviders.length} STT providers failed`,
            'orchestrator',
            'ALL_PROVIDERS_FAILED',
          );
        }
      }
    }

    throw new VoiceProviderError(
      'No healthy STT providers available',
      'orchestrator',
      'NO_HEALTHY_PROVIDERS',
    );
  }

  /**
   * Transcribe using a specific provider
   */
  private async transcribeWithProvider(
    provider: VoiceProviderExecutor,
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    try {
      return await provider.transcribe(audio, options);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new VoiceProviderError(
        `Transcription error: ${errorMsg}`,
        provider.id,
      );
    }
  }

  /**
   * Transcribe audio stream using STT providers
   */
  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk> {
    if (!this.initialized) {
      throw new VoiceProviderError(
        'Orchestrator not initialized',
        'orchestrator',
        'NOT_INITIALIZED',
      );
    }

    if (this.sttProviders.length === 0) {
      throw new VoiceProviderError(
        'No STT providers available',
        'orchestrator',
        'NO_PROVIDERS',
      );
    }

    // Use first healthy provider for streaming
    for (const provider of this.sttProviders) {
      if (!this.isProviderHealthy(provider.id)) {
        continue;
      }

      if (this.isCircuitBreakerOpen(provider.id)) {
        continue;
      }

      try {
        yield* provider.transcribeStream(audioStream, options);
        this.recordProviderSuccess(provider.id);
        return;
      } catch (error) {
        this.recordProviderFailure(provider.id);
        this.logger.warn(`Streaming transcription failed with ${provider.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new VoiceProviderError(
      'No healthy STT providers available for streaming',
      'orchestrator',
      'NO_HEALTHY_PROVIDERS',
    );
  }

  /**
   * Synthesize text to speech using TTS providers with fallback chain
   */
  async synthesize(
    text: string,
    options?: SynthesisOptions,
  ): Promise<AudioBuffer> {
    if (!this.initialized) {
      throw new VoiceProviderError(
        'Orchestrator not initialized',
        'orchestrator',
        'NOT_INITIALIZED',
      );
    }

    if (this.ttsProviders.length === 0) {
      throw new VoiceProviderError(
        'No TTS providers available',
        'orchestrator',
        'NO_PROVIDERS',
      );
    }

    if (!this.fallbackChainEnabled) {
      const provider = this.ttsProviders[0];
      return this.synthesizeWithProvider(provider, text, options);
    }

    // Try each provider in fallback chain
    for (let i = 0; i < this.ttsProviders.length; i++) {
      const provider = this.ttsProviders[i];

      try {
        // Check provider health
        if (!this.isProviderHealthy(provider.id)) {
          this.logger.debug(`Skipping unhealthy TTS provider: ${provider.id}`);
          continue;
        }

        // Check circuit breaker
        if (this.isCircuitBreakerOpen(provider.id)) {
          this.logger.debug(`Circuit breaker open for: ${provider.id}`);
          continue;
        }

        const result = await this.synthesizeWithProvider(provider, text, options);
        this.recordProviderSuccess(provider.id);
        return result;
      } catch (error) {
        this.recordProviderFailure(provider.id);

        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Synthesis failed with ${provider.id}`, {
          error: errorMsg,
          attemptNumber: i + 1,
          totalProviders: this.ttsProviders.length,
        });

        if (i === this.ttsProviders.length - 1) {
          throw new VoiceProviderError(
            `All ${this.ttsProviders.length} TTS providers failed`,
            'orchestrator',
            'ALL_PROVIDERS_FAILED',
          );
        }
      }
    }

    throw new VoiceProviderError(
      'No healthy TTS providers available',
      'orchestrator',
      'NO_HEALTHY_PROVIDERS',
    );
  }

  /**
   * Synthesize using a specific provider
   */
  private async synthesizeWithProvider(
    provider: VoiceProviderExecutor,
    text: string,
    options?: SynthesisOptions,
  ): Promise<AudioBuffer> {
    try {
      return await provider.synthesize(text, options);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new VoiceProviderError(
        `Synthesis error: ${errorMsg}`,
        provider.id,
      );
    }
  }

  /**
   * Synthesize text stream to speech
   */
  async *synthesizeStream(
    textStream: ReadableStream<string>,
    options?: SynthesisOptions,
  ): AsyncIterable<AudioBuffer> {
    if (!this.initialized) {
      throw new VoiceProviderError(
        'Orchestrator not initialized',
        'orchestrator',
        'NOT_INITIALIZED',
      );
    }

    if (this.ttsProviders.length === 0) {
      throw new VoiceProviderError(
        'No TTS providers available',
        'orchestrator',
        'NO_PROVIDERS',
      );
    }

    // Use first healthy provider for streaming
    for (const provider of this.ttsProviders) {
      if (!this.isProviderHealthy(provider.id)) {
        continue;
      }

      if (this.isCircuitBreakerOpen(provider.id)) {
        continue;
      }

      try {
        yield* provider.synthesizeStream(textStream, options);
        this.recordProviderSuccess(provider.id);
        return;
      } catch (error) {
        this.recordProviderFailure(provider.id);
        this.logger.warn(`Streaming synthesis failed with ${provider.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new VoiceProviderError(
      'No healthy TTS providers available for streaming',
      'orchestrator',
      'NO_HEALTHY_PROVIDERS',
    );
  }

  /**
   * Get all STT providers
   */
  getSTTProviders(): VoiceProviderExecutor[] {
    return [...this.sttProviders];
  }

  /**
   * Get all TTS providers
   */
  getTTSProviders(): VoiceProviderExecutor[] {
    return [...this.ttsProviders];
  }

  /**
   * Get the active STT provider (first healthy one)
   */
  getActiveSTTProvider(): VoiceProviderExecutor | undefined {
    return this.sttProviders.find(
      (p) => !this.isCircuitBreakerOpen(p.id) && this.isProviderHealthy(p.id),
    );
  }

  /**
   * Get the active TTS provider (first healthy one)
   */
  getActiveTTSProvider(): VoiceProviderExecutor | undefined {
    return this.ttsProviders.find(
      (p) => !this.isCircuitBreakerOpen(p.id) && this.isProviderHealthy(p.id),
    );
  }

  /**
   * Get active provider by type
   */
  getActiveProvider(type: 'stt' | 'tts'): VoiceProviderExecutor | undefined {
    if (type === 'stt') {
      return this.getActiveSTTProvider();
    }
    return this.getActiveTTSProvider();
  }

  /**
   * Switch to a different provider
   */
  switchProvider(id: string): void {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new VoiceProviderError(
        `Provider not found: ${id}`,
        'orchestrator',
        'PROVIDER_NOT_FOUND',
      );
    }

    const currentEntry = this.config.providers?.find(
      (p) => this.providers.get(p.id) === provider,
    );
    if (!currentEntry) {
      throw new VoiceProviderError(
        `Provider entry not found for: ${id}`,
        'orchestrator',
        'PROVIDER_ENTRY_NOT_FOUND',
      );
    }

    // Reorder providers list to prioritize this one
    if (currentEntry.stt) {
      const idx = this.sttProviders.indexOf(provider);
      if (idx > 0) {
        this.sttProviders.splice(idx, 1);
        this.sttProviders.unshift(provider);
        this.logger.info(`Switched to STT provider: ${id}`);
      }
    }

    if (currentEntry.tts) {
      const idx = this.ttsProviders.indexOf(provider);
      if (idx > 0) {
        this.ttsProviders.splice(idx, 1);
        this.ttsProviders.unshift(provider);
        this.logger.info(`Switched to TTS provider: ${id}`);
      }
    }
  }

  /**
   * Get health status of all providers
   */
  async getHealthStatus(): Promise<Record<string, ProviderHealth>> {
    const status: Record<string, ProviderHealth> = {};

    for (const [id, tracker] of Object.entries(this.healthTrackers)) {
      status[id] = { ...tracker };
    }

    return status;
  }

  /**
   * Check health of a specific provider
   */
  async checkProviderHealth(providerId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return false;
    }

    try {
      const healthy = await provider.isHealthy();
      const tracker = this.healthTrackers[providerId];

      if (healthy) {
        this.recordProviderSuccess(providerId);
      } else {
        this.recordProviderFailure(providerId);
      }

      return healthy;
    } catch (error) {
      this.recordProviderFailure(providerId);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): VoiceProvidersConfig {
    return {
      ...this.config,
      autoDetectCapabilities: this.config.autoDetectCapabilities ?? true,
    } as VoiceProvidersConfig;
  }

  /**
   * Update deployment configuration at runtime
   */
  updateDeploymentConfig(config: DeploymentConfig | DeploymentConfig[]): void {
    if (Array.isArray(config)) {
      for (const cfg of config) {
        this.deploymentConfigs.set(cfg.id, cfg);
      }
    } else {
      this.deploymentConfigs.set(config.id, config);
    }

    this.logger.info('Deployment configuration updated', {
      configCount: this.deploymentConfigs.size,
    });
  }

  /**
   * Load providers from configuration
   */
  private async loadProviders(): Promise<void> {
    if (!this.config?.providers) {
      return;
    }

    const ordered = this.sortProvidersByPriority(this.config.providers);

    for (const entry of ordered) {
      if (entry.enabled === false) {
        continue;
      }

      try {
        const executor = await this.createProviderExecutor(entry);
        await executor.initialize();

        this.providers.set(entry.id, executor);
        this.initializeHealthTracker(entry.id);

        if (entry.stt) {
          this.sttProviders.push(executor);
          this.logger.debug(`Loaded STT provider: ${entry.id}`);
        }

        if (entry.tts) {
          this.ttsProviders.push(executor);
          this.logger.debug(`Loaded TTS provider: ${entry.id}`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to load provider ${entry.id}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }

  /**
   * Sort providers by priority (ascending: lower priority number = higher precedence)
   */
  private sortProvidersByPriority(providers: VoiceProviderEntry[]): VoiceProviderEntry[] {
    return providers.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  /**
   * Create a provider executor (delegates to provider-specific factory)
   */
  private async createProviderExecutor(
    entry: VoiceProviderEntry,
  ): Promise<VoiceProviderExecutor> {
    // This would typically delegate to provider-specific factory methods
    // For now, throw an error indicating this should be implemented by subclasses
    throw new VoiceProviderError(
      'Provider executor creation not implemented',
      entry.id,
      'NOT_IMPLEMENTED',
    );
  }

  /**
   * Initialize health tracker for a provider
   */
  private initializeHealthTracker(providerId: string): void {
    this.healthTrackers[providerId] = {
      providerId,
      healthy: true,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      circuitBreakerOpen: false,
    };

    this.circuitBreakers[providerId] = {
      open: false,
      openedAt: 0,
      failureCount: 0,
    };
  }

  /**
   * Check if provider is healthy
   */
  private isProviderHealthy(providerId: string): boolean {
    const tracker = this.healthTrackers[providerId];
    return tracker ? tracker.healthy : false;
  }

  /**
   * Check if circuit breaker is open for provider
   */
  private isCircuitBreakerOpen(providerId: string): boolean {
    const breaker = this.circuitBreakers[providerId];
    if (!breaker?.open) {
      return false;
    }

    const elapsedMs = Date.now() - breaker.openedAt;
    if (elapsedMs > this.circuitBreakerResetMs) {
      // Reset circuit breaker after timeout
      breaker.open = false;
      breaker.failureCount = 0;
      return false;
    }

    return true;
  }

  /**
   * Record a successful operation for a provider
   */
  private recordProviderSuccess(providerId: string): void {
    const tracker = this.healthTrackers[providerId];
    const breaker = this.circuitBreakers[providerId];

    if (!tracker || !breaker) {
      return;
    }

    tracker.consecutiveSuccesses++;
    tracker.consecutiveFailures = 0;
    tracker.healthy = true;
    tracker.lastCheck = Date.now();

    // Reset circuit breaker on success
    if (breaker.failureCount > 0) {
      breaker.failureCount = 0;
    }
  }

  /**
   * Record a failed operation for a provider
   */
  private recordProviderFailure(providerId: string): void {
    const tracker = this.healthTrackers[providerId];
    const breaker = this.circuitBreakers[providerId];

    if (!tracker || !breaker) {
      return;
    }

    tracker.consecutiveFailures++;
    tracker.consecutiveSuccesses = 0;
    tracker.lastCheck = Date.now();

    // Mark as unhealthy after threshold
    if (tracker.consecutiveFailures >= 2) {
      tracker.healthy = false;
    }

    // Open circuit breaker after threshold
    breaker.failureCount++;
    if (breaker.failureCount >= this.circuitBreakerThreshold && !breaker.open) {
      breaker.open = true;
      breaker.openedAt = Date.now();
      tracker.circuitBreakerOpen = true;
      this.logger.warn(`Circuit breaker opened for provider: ${providerId}`, {
        failureCount: breaker.failureCount,
      });
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        const providerIds = Array.from(this.providers.keys());
        this.logger.debug('Running health checks', { count: providerIds.length });

        for (const providerId of providerIds) {
          await this.checkProviderHealth(providerId);
        }
      } catch (error) {
        this.logger.error('Error during health check', { error });
      }
    }, this.healthCheckInterval);

    // Unref timer so it doesn't keep process alive
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }
}
