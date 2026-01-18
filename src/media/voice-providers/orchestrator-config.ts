/**
 * Voice Orchestrator Configuration Schema
 *
 * Defines the configuration structure for the VoiceOrchestrator,
 * including provider selection, fallback chains, health checks,
 * circuit breaker settings, metrics collection, and logging.
 */

import { z } from 'zod';

/**
 * Provider deployment modes
 */
export enum DeploymentMode {
  DOCKER = 'docker',
  SYSTEM = 'system',
  CLOUD = 'cloud',
  HYBRID = 'hybrid',
}

/**
 * Provider preference strategies
 */
export enum ProviderPreference {
  FAST = 'fast',                    // Lowest latency
  ACCURATE = 'accurate',            // Highest accuracy (STT) / quality (TTS)
  CHEAP = 'cheap',                  // Lowest cost
  BALANCED = 'balanced',            // Default balanced approach
}

/**
 * Health check strategies
 */
export interface HealthCheckStrategyConfig {
  /** Quick metadata check (getCapabilities) */
  metadata?: boolean;

  /** Echo test: send test audio/text through provider */
  echo?: boolean;

  /** Measure latency and flag if degraded */
  latency?: boolean;

  /** Full round-trip test */
  fullRoundTrip?: boolean;
}

/**
 * Health check configuration
 */
export const HealthCheckConfigSchema = z.object({
  /** Enable/disable health checks */
  enabled: z.boolean().default(true),

  /** Interval between health checks (milliseconds) */
  intervalMs: z.number().min(1000).default(60000), // 1 minute

  /** Initial delay before first check (milliseconds) */
  initialDelayMs: z.number().min(0).default(5000),

  /** Timeout for each health check (milliseconds) */
  timeoutMs: z.number().min(100).default(5000),

  /** Number of failures before marking unhealthy */
  unhealthyThreshold: z.number().min(1).default(3),

  /** Number of successes before marking healthy again */
  healthyThreshold: z.number().min(1).default(2),

  /** Which strategies to use */
  strategies: z
    .object({
      metadata: z.boolean().default(true),
      echo: z.boolean().default(true),
      latency: z.boolean().default(false),
      fullRoundTrip: z.boolean().default(false),
    })
    .default({
      metadata: true,
      echo: true,
      latency: false,
      fullRoundTrip: false,
    }),
});

export type HealthCheckConfig = z.infer<typeof HealthCheckConfigSchema>;

/**
 * Circuit breaker configuration
 */
export const CircuitBreakerConfigSchema = z.object({
  /** Enable/disable circuit breaker */
  enabled: z.boolean().default(true),

  /** Number of failures to open the circuit */
  failureThreshold: z.number().min(1).default(5),

  /** Number of successes to close the circuit from half-open */
  successThreshold: z.number().min(1).default(2),

  /** Time before transitioning from open to half-open (milliseconds) */
  timeoutMs: z.number().min(1000).default(30000),

  /** Multiplier for exponential backoff */
  backoffMultiplier: z.number().min(1).default(2),

  /** Maximum backoff time (milliseconds) */
  maxBackoffMs: z.number().min(1000).default(300000), // 5 minutes

  /** Reset counters after timeout success */
  autoReset: z.boolean().default(true),
});

export type CircuitBreakerConfig = z.infer<
  typeof CircuitBreakerConfigSchema
>;

/**
 * Metrics collection configuration
 */
export const MetricsConfigSchema = z.object({
  /** Enable/disable metrics collection */
  enabled: z.boolean().default(true),

  /** Maximum number of request records to keep in history */
  historySize: z.number().min(10).max(10000).default(1000),

  /** Interval to recalculate percentile metrics (milliseconds) */
  aggregationIntervalMs: z.number().min(1000).default(60000),

  /** Interval to export metrics to dashboard (milliseconds, 0 = disabled) */
  exportIntervalMs: z.number().min(0).default(30000),

  /** Retention period for metrics (days, 0 = unlimited) */
  retentionDays: z.number().min(0).default(30),

  /** Enable request-level details in metrics */
  detailedTracking: z.boolean().default(false),
});

export type MetricsConfig = z.infer<typeof MetricsConfigSchema>;

/**
 * Logging configuration
 */
export const LoggingConfigSchema = z.object({
  /** Logging level */
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  /** Log provider operations (transcribe, synthesize) */
  providers: z.boolean().default(true),

  /** Log health check results */
  healthChecks: z.boolean().default(true),

  /** Log fallback decisions and provider switches */
  fallbacks: z.boolean().default(true),

  /** Log metrics (periodic aggregation) */
  metrics: z.boolean().default(false),

  /** Log provider state changes */
  providerSwitches: z.boolean().default(true),

  /** Log circuit breaker state changes */
  circuitBreaker: z.boolean().default(true),

  /** Log configuration loading/updates */
  configuration: z.boolean().default(false),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

/**
 * Retry configuration
 */
export const RetryConfigSchema = z.object({
  /** Maximum number of retry attempts */
  maxRetries: z.number().min(0).default(2),

  /** Initial backoff time in milliseconds */
  backoffMs: z.number().min(0).default(100),

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: z.number().min(1).default(2),

  /** Maximum backoff time in milliseconds */
  maxBackoffMs: z.number().min(100).default(5000),

  /** Jitter factor (0-1) to randomize backoff */
  jitterFactor: z.number().min(0).max(1).default(0.1),
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

/**
 * Default preferences for provider selection
 */
export const DefaultPreferencesSchema = z.object({
  /** Default STT provider preference */
  sttPreference: z
    .enum(['fast', 'accurate', 'cheap', 'balanced'])
    .default('balanced'),

  /** Default TTS provider preference */
  ttsPreference: z
    .enum(['fast', 'accurate', 'natural', 'balanced'])
    .default('balanced'),

  /** Prefer local providers over cloud when available */
  preferLocal: z.boolean().default(true),

  /** Prefer providers in deployment mode order */
  deploymentModePreference: z
    .array(z.enum(['docker', 'system', 'cloud']))
    .default(['docker', 'system', 'cloud']),
});

export type DefaultPreferences = z.infer<typeof DefaultPreferencesSchema>;

/**
 * Provider registry configuration (per provider)
 */
export const ProviderRegistryConfigSchema = z.object({
  /** Provider ID (unique identifier) */
  id: z.string().min(1),

  /** Human-readable name */
  name: z.string().optional(),

  /** Provider priority (lower = higher priority) */
  priority: z.number().min(1).default(100),

  /** Enable/disable this provider */
  enabled: z.boolean().default(true),

  /** Provider type (stt, tts, or both) */
  type: z.enum(['stt', 'tts', 'both']).default('both'),

  /** Deployment mode for this provider */
  deployment: z.enum(['docker', 'system', 'cloud']).optional(),

  /** Estimated latency in milliseconds (for sorting) */
  estimatedLatencyMs: z.number().min(0).optional(),

  /** Estimated monthly cost (for cheap preference) */
  estimatedCostPerMonth: z.number().min(0).optional(),

  /** Maximum concurrent requests this provider can handle */
  maxConcurrentRequests: z.number().min(1).default(10),

  /** Timeout for operations with this provider */
  timeoutMs: z.number().min(100).optional(),

  /** Retry config override for this provider */
  retry: RetryConfigSchema.optional(),

  /** Circuit breaker config override for this provider */
  circuitBreaker: CircuitBreakerConfigSchema.optional(),

  /** Custom metadata */
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ProviderRegistryConfig = z.infer<
  typeof ProviderRegistryConfigSchema
>;

/**
 * Main orchestrator configuration schema
 */
export const OrchestratorConfigSchema = z.object({
  /** Enable/disable the orchestrator */
  enabled: z.boolean().default(true),

  /** Deployment mode: how providers are deployed */
  deploymentMode: z
    .enum(['docker', 'system', 'cloud', 'hybrid'])
    .default('hybrid'),

  /** Providers registry (sorted by priority) */
  providers: z.array(ProviderRegistryConfigSchema).default([]),

  /** STT provider fallback chain (provider IDs in order) */
  sttFallbackChain: z.array(z.string()).default([]),

  /** TTS provider fallback chain (provider IDs in order) */
  ttsFallbackChain: z.array(z.string()).default([]),

  /** Default preferences for provider selection */
  defaultPreferences: DefaultPreferencesSchema.optional(),

  /** Health check configuration */
  healthCheck: HealthCheckConfigSchema.optional(),

  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfigSchema.optional(),

  /** Default retry configuration */
  retry: RetryConfigSchema.optional(),

  /** Metrics collection configuration */
  metrics: MetricsConfigSchema.optional(),

  /** Logging configuration */
  logging: LoggingConfigSchema.optional(),

  /** Load balancing strategy */
  loadBalancing: z
    .object({
      enabled: z.boolean().default(true),
      strategy: z.enum(['round-robin', 'least-loaded', 'weighted']).default('weighted'),
      weights: z.record(z.string(), z.number()).optional(),
    })
    .optional()
    .default({
      enabled: true,
      strategy: 'weighted',
    }),

  /** Provider switching behavior */
  switching: z
    .object({
      /** Automatically switch providers on error */
      autoSwitch: z.boolean().default(true),

      /** Only switch within same capability tier */
      tierLocked: z.boolean().default(false),

      /** Cooldown period before switching back (ms) */
      cooldownMs: z.number().min(0).default(10000),

      /** Maximum switches per operation */
      maxSwitches: z.number().min(1).default(3),
    })
    .optional()
    .default({
      autoSwitch: true,
      tierLocked: false,
      cooldownMs: 10000,
      maxSwitches: 3,
    }),

  /** Custom metadata */
  metadata: z.record(z.string(), z.any()).optional(),
});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

/**
 * Orchestrator runtime options for individual operations
 */
export const OrchestratorRuntimeOptionsSchema = z.object({
  /** Use specific provider by ID */
  providerId: z.string().optional(),

  /** Provider preference (fast, accurate, cheap, balanced) */
  providerPreference: z
    .enum(['fast', 'accurate', 'cheap', 'balanced'])
    .optional(),

  /** Allow automatic fallback to next provider */
  allowFallback: z.boolean().default(true),

  /** Timeout before fallback attempt (milliseconds) */
  fallbackTimeoutMs: z.number().min(0).optional(),

  /** Overall operation timeout (milliseconds) */
  timeoutMs: z.number().min(100).optional(),

  /** Maximum retry attempts (override global config) */
  maxRetries: z.number().min(0).optional(),

  /** Track metrics for this operation */
  trackMetrics: z.boolean().default(true),

  /** Callback when provider switches */
  onProviderSwitch: z.function().optional(),

  /** Callback when fallback occurs */
  onFallback: z.function().optional(),

  /** Callback on health check update */
  onHealthUpdate: z.function().optional(),
});

export type OrchestratorRuntimeOptions = z.infer<
  typeof OrchestratorRuntimeOptionsSchema
>;

/**
 * Default configuration builder
 */
export function createDefaultOrchestratorConfig(
  overrides?: Partial<OrchestratorConfig>,
): OrchestratorConfig {
  const defaults: OrchestratorConfig = {
    enabled: true,
    deploymentMode: 'hybrid',
    providers: [],
    sttFallbackChain: [],
    ttsFallbackChain: [],
    defaultPreferences: {
      sttPreference: 'balanced',
      ttsPreference: 'balanced',
      preferLocal: true,
      deploymentModePreference: ['docker', 'system', 'cloud'],
    } as DefaultPreferences,
    healthCheck: {
      enabled: true,
      intervalMs: 60000,
      initialDelayMs: 5000,
      timeoutMs: 5000,
      unhealthyThreshold: 3,
      healthyThreshold: 2,
      strategies: {
        metadata: true,
        echo: true,
        latency: false,
        fullRoundTrip: false,
      },
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 30000,
      backoffMultiplier: 2,
      maxBackoffMs: 300000,
      autoReset: true,
    },
    retry: {
      maxRetries: 2,
      backoffMs: 100,
      backoffMultiplier: 2,
      maxBackoffMs: 5000,
      jitterFactor: 0.1,
    },
    metrics: {
      enabled: true,
      historySize: 1000,
      aggregationIntervalMs: 60000,
      exportIntervalMs: 30000,
      retentionDays: 30,
      detailedTracking: false,
    },
    logging: {
      level: 'info',
      providers: true,
      healthChecks: true,
      fallbacks: true,
      metrics: false,
      providerSwitches: true,
      circuitBreaker: true,
      configuration: false,
    },
    loadBalancing: {
      enabled: true,
      strategy: 'weighted' as const,
    },
    switching: {
      autoSwitch: true,
      tierLocked: false,
      cooldownMs: 10000,
      maxSwitches: 3,
    },
  } as OrchestratorConfig;

  if (overrides) {
    return {
      ...defaults,
      ...overrides,
    };
  }

  return defaults;
}

/**
 * Configuration examples for common scenarios
 */
export const ConfigurationExamples = {
  /**
   * Local development: Use Docker for STT, System for TTS
   */
  localDevelopment: createDefaultOrchestratorConfig({
    deploymentMode: 'docker',
    providers: [
      {
        id: 'faster-whisper-docker',
        name: 'Faster-Whisper (Docker)',
        type: 'stt',
        priority: 1,
        deployment: 'docker',
        enabled: true,
        maxConcurrentRequests: 5,
      },
      {
        id: 'kokoro-system',
        name: 'Kokoro (System)',
        type: 'tts',
        priority: 1,
        deployment: 'system',
        enabled: true,
        maxConcurrentRequests: 3,
      },
    ],
    sttFallbackChain: ['faster-whisper-docker'],
    ttsFallbackChain: ['kokoro-system'],
  }),

  /**
   * Production: Cloud providers with local fallback
   */
  productionCloudFirst: createDefaultOrchestratorConfig({
    deploymentMode: 'hybrid',
    providers: [
      {
        id: 'openai-whisper',
        name: 'OpenAI Whisper API',
        type: 'stt',
        priority: 1,
        deployment: 'cloud',
        enabled: true,
        maxConcurrentRequests: 10,
      },
      {
        id: 'faster-whisper-system',
        name: 'Faster-Whisper (Fallback)',
        type: 'stt',
        priority: 2,
        deployment: 'system',
        enabled: true,
        maxConcurrentRequests: 5,
      },
      {
        id: 'elevenlabs-api',
        name: 'ElevenLabs API',
        type: 'tts',
        priority: 1,
        deployment: 'cloud',
        enabled: true,
        maxConcurrentRequests: 8,
      },
      {
        id: 'kokoro-system',
        name: 'Kokoro (Fallback)',
        type: 'tts',
        priority: 2,
        deployment: 'system',
        enabled: true,
        maxConcurrentRequests: 3,
      },
    ],
    sttFallbackChain: ['openai-whisper', 'faster-whisper-system'],
    ttsFallbackChain: ['elevenlabs-api', 'kokoro-system'],
    defaultPreferences: {
      sttPreference: 'accurate',
      ttsPreference: 'natural',
      preferLocal: false,
      deploymentModePreference: ['docker', 'system', 'cloud'],
    } as DefaultPreferences,
  }),

  /**
   * Cost-optimized: Prioritize local providers
   */
  costOptimized: createDefaultOrchestratorConfig({
    deploymentMode: 'system',
    providers: [
      {
        id: 'faster-whisper-system',
        name: 'Faster-Whisper',
        type: 'stt',
        priority: 1,
        deployment: 'system',
        estimatedCostPerMonth: 0,
        enabled: true,
        maxConcurrentRequests: 5,
      },
      {
        id: 'kokoro-system',
        name: 'Kokoro',
        type: 'tts',
        priority: 1,
        deployment: 'system',
        estimatedCostPerMonth: 0,
        enabled: true,
        maxConcurrentRequests: 3,
      },
    ],
    sttFallbackChain: ['faster-whisper-system'],
    ttsFallbackChain: ['kokoro-system'],
    defaultPreferences: {
      sttPreference: 'cheap',
      ttsPreference: 'balanced',
      preferLocal: true,
      deploymentModePreference: ['docker', 'system', 'cloud'],
    } as DefaultPreferences,
  }),

  /**
   * High availability: Multiple providers with aggressive health checks
   */
  highAvailability: createDefaultOrchestratorConfig({
    deploymentMode: 'hybrid',
    healthCheck: {
      enabled: true,
      intervalMs: 30000,     // Check every 30 seconds
      initialDelayMs: 5000,
      timeoutMs: 3000,
      unhealthyThreshold: 2,
      healthyThreshold: 1,
      strategies: {
        metadata: true,
        echo: true,
        latency: true,
        fullRoundTrip: true,
      },
    } as HealthCheckConfig,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,   // Open faster
      successThreshold: 3,   // Close slower
      timeoutMs: 15000,      // Quick retry
      backoffMultiplier: 2,
      maxBackoffMs: 60000,
      autoReset: true,
    } as CircuitBreakerConfig,
    retry: {
      maxRetries: 3,
      backoffMs: 50,
      backoffMultiplier: 2,
      maxBackoffMs: 2000,
      jitterFactor: 0.1,
    } as RetryConfig,
    switching: {
      autoSwitch: true,
      tierLocked: false,
      maxSwitches: 5,
      cooldownMs: 5000,
    },
  }),
};

/**
 * Validate orchestrator configuration
 */
export async function validateOrchestratorConfig(
  config: unknown,
): Promise<OrchestratorConfig> {
  return OrchestratorConfigSchema.parseAsync(config);
}

/**
 * Validate runtime options
 */
export async function validateRuntimeOptions(
  options: unknown,
): Promise<OrchestratorRuntimeOptions> {
  return OrchestratorRuntimeOptionsSchema.parseAsync(options);
}
