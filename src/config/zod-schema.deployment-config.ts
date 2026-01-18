/**
 * Zod Schema for Deployment Configuration
 *
 * Validates deployment configurations for voice providers across
 * all modes: Docker, System, and Cloud.
 *
 * Provides runtime validation and type inference with discriminated unions
 * to ensure correct schema is used based on deployment mode.
 */

import { z } from 'zod';

/**
 * Health check schema
 */
export const HealthCheckConfigSchema = z.object({
  enabled: z.boolean(),
  endpoint: z.string().url().optional(),
  timeoutMs: z.number().int().positive().optional().default(5000),
  intervalMs: z.number().int().positive().optional().default(30000),
  failureThreshold: z.number().int().min(1).optional().default(3),
  successThreshold: z.number().int().min(1).optional().default(1),
  command: z.string().optional(),
  expectedExitCode: z.number().int().optional().default(0),
});

/**
 * Retry policy schema
 */
export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).default(3),
  initialDelayMs: z.number().int().min(100).default(500),
  maxDelayMs: z.number().int().min(1000).default(30000),
  multiplier: z.number().positive().default(2),
  retryableErrors: z
    .array(z.union([z.string(), z.number()]))
    .optional(),
});

/**
 * Logging configuration schema
 */
export const LoggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  verbose: z.boolean().optional().default(false),
  filePath: z.string().optional(),
  maxFileSize: z.number().int().positive().optional(),
  maxFiles: z.number().int().min(1).optional().default(3),
  json: z.boolean().optional().default(false),
});

/**
 * Base deployment configuration schema
 */
export const BaseDeploymentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  type: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().optional().default(0),
  timeoutMs: z.number().int().min(100).optional().default(30000),
  retries: RetryPolicySchema.optional(),
  healthCheck: HealthCheckConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  tags: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

/**
 * Docker deployment configuration schema
 */
export const DockerDeploymentConfigSchema = BaseDeploymentConfigSchema.extend({
  mode: z.literal('docker'),
  image: z.string().min(1),
  tag: z.string().optional(),
  pullPolicy: z.enum(['always', 'ifNotPresent', 'never']).optional().default('ifNotPresent'),
  ports: z.record(z.coerce.number().int(), z.coerce.number().int()),
  volumes: z.record(z.string(), z.string()).optional(),
  network: z.string().optional().default('bridge'),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  buildFirst: z.boolean().optional().default(false),
  dockerfilePath: z.string().optional(),
  resources: z
    .object({
      memoryMb: z.number().positive().optional(),
      cpuLimit: z.number().positive().optional(),
      memoryRequestMb: z.number().positive().optional(),
      cpuRequest: z.number().positive().optional(),
    })
    .optional(),
  restartPolicy: z
    .enum(['no', 'always', 'onFailure', 'unlessStopped'])
    .optional()
    .default('onFailure'),
  maxRetryCount: z.number().int().min(0).optional(),
  logging: z
    .object({
      driver: z.string().optional(),
      options: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  security: z
    .object({
      privileged: z.boolean().optional().default(false),
      user: z.string().optional(),
      capAdd: z.array(z.string()).optional(),
      capDrop: z.array(z.string()).optional(),
    })
    .optional(),
  containerHealthCheck: z
    .object({
      command: z.array(z.string()),
      intervalMs: z.number().int().positive().optional(),
      timeoutMs: z.number().int().positive().optional(),
      retries: z.number().int().min(0).optional(),
      startPeriodMs: z.number().int().min(0).optional(),
    })
    .optional(),
  additionalFlags: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
});

/**
 * System deployment configuration schema
 */
export const SystemDeploymentConfigSchema = BaseDeploymentConfigSchema.extend({
  mode: z.literal('system'),
  binary: z.string().min(1),
  packageManager: z
    .array(z.enum(['npm', 'pip', 'brew', 'apt', 'dnf', 'pacman']))
    .optional(),
  npmPackage: z.string().optional(),
  pypiPackage: z.string().optional(),
  brewFormula: z.string().optional(),
  aptPackage: z.string().optional(),
  searchPaths: z.array(z.string()).optional(),
  versionConstraint: z.string().optional(),
  systemDependencies: z
    .array(
      z.object({
        name: z.string(),
        packageManager: z.string(),
        required: z.boolean(),
        optional: z.boolean().optional(),
      }),
    )
    .optional(),
  installationInstructions: z
    .object({
      title: z.string().optional(),
      command: z.string().optional(),
      manualSteps: z.array(z.string()).optional(),
      documentationUrl: z.string().url().optional(),
    })
    .optional(),
  cliFlags: z
    .object({
      defaults: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional(),
      wrapper: z.string().optional(),
      cwd: z.string().optional(),
    })
    .optional(),
  environmentSetup: z.record(z.string(), z.string()).optional(),
  models: z
    .object({
      path: z.string(),
      autoDownload: z.boolean().optional(),
      predownload: z.array(z.string()).optional(),
      sources: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  capabilityCheck: z
    .object({
      command: z.string(),
      successIndicator: z.string().optional(),
    })
    .optional(),
});

/**
 * Cloud deployment configuration schema
 */
export const CloudDeploymentConfigSchema = BaseDeploymentConfigSchema.extend({
  mode: z.literal('cloud'),
  provider: z.string().min(1),
  endpoint: z.string().url(),
  apiVersion: z.string().optional(),
  auth: z
    .object({
      type: z.enum(['apiKey', 'oauth2', 'bearer', 'custom']),
      keyField: z.string().optional().default('Authorization'),
      oauth2: z
        .object({
          tokenEndpoint: z.string().url(),
          authorizeEndpoint: z.string().url(),
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
          scopes: z.array(z.string()).optional(),
        })
        .optional(),
      headers: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  rateLimit: z
    .object({
      requestsPerMinute: z.number().int().positive().optional(),
      requestsPerDay: z.number().int().positive().optional(),
      maxConcurrent: z.number().int().positive().optional(),
      queueStrategy: z.enum(['fifo', 'prioritize']).optional().default('fifo'),
    })
    .optional(),
  quota: z
    .object({
      enabled: z.boolean().optional().default(true),
      monthlyCharacterLimit: z.number().int().positive().optional(),
      monthlyRequestLimit: z.number().int().positive().optional(),
      costPer1kUnits: z.number().positive().optional(),
      alertThreshold: z.number().min(0).max(100).optional().default(80),
    })
    .optional(),
  fallbackEndpoints: z
    .array(
      z.object({
        url: z.string().url(),
        priority: z.number().int().optional(),
      }),
    )
    .optional(),
  transforms: z
    .object({
      requestTransform: z.any().optional(),
      responseTransform: z.any().optional(),
      responseSchema: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
  availableModels: z.array(z.string()).optional(),
  availableVoices: z.array(z.string()).optional(),
  modelFallbacks: z.record(z.string(), z.string()).optional(),
  voiceFallbacks: z.record(z.string(), z.string()).optional(),
  regions: z
    .object({
      default: z.string(),
      endpoints: z.record(z.string(), z.string()).optional(),
      preferredRegions: z.array(z.string()).optional(),
    })
    .optional(),
  budget: z
    .object({
      monthlyLimit: z.number().positive().optional(),
      dailyLimit: z.number().positive().optional(),
      alertThreshold: z.number().positive().optional(),
    })
    .optional(),
  cache: z
    .object({
      enabled: z.boolean().optional(),
      ttlSeconds: z.number().int().positive().optional(),
      maxEntries: z.number().int().positive().optional(),
    })
    .optional(),
});

/**
 * Discriminated union for all deployment configurations
 * Use this for parsing unknown deployment configs
 */
export const DeploymentConfigSchema = z.discriminatedUnion('mode', [
  DockerDeploymentConfigSchema,
  SystemDeploymentConfigSchema,
  CloudDeploymentConfigSchema,
]);

/**
 * Provider-specific overrides schema
 */
export const ProviderDeploymentOverridesSchema = z.object({
  providerId: z.string().min(1),
  overrides: z.record(z.string(), z.any()),
  strategy: z.enum(['merge', 'replace']).optional().default('merge'),
});

/**
 * Deployment health status schema
 */
export const DeploymentHealthStatusSchema = z.object({
  providerId: z.string(),
  mode: z.enum(['docker', 'system', 'cloud']),
  healthy: z.boolean(),
  lastCheck: z.date(),
  nextCheck: z.date().optional(),
  details: z.record(z.string(), z.any()).optional(),
  error: z.string().optional(),
});

/**
 * Deployment initialization result schema
 */
export const DeploymentInitResultSchema = z.object({
  providerId: z.string(),
  mode: z.enum(['docker', 'system', 'cloud']),
  success: z.boolean(),
  duration: z.number().int().positive(),
  error: z.instanceof(Error).optional(),
  warnings: z.array(z.string()).default([]),
  details: z.record(z.string(), z.any()),
});

/**
 * Type inference from schemas
 */
export type HealthCheckConfig = z.infer<typeof HealthCheckConfigSchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type BaseDeploymentConfig = z.infer<typeof BaseDeploymentConfigSchema>;
export type DockerDeploymentConfig = z.infer<typeof DockerDeploymentConfigSchema>;
export type SystemDeploymentConfig = z.infer<typeof SystemDeploymentConfigSchema>;
export type CloudDeploymentConfig = z.infer<typeof CloudDeploymentConfigSchema>;
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
export type ProviderDeploymentOverrides = z.infer<typeof ProviderDeploymentOverridesSchema>;
export type DeploymentHealthStatus = z.infer<typeof DeploymentHealthStatusSchema>;
export type DeploymentInitResult = z.infer<typeof DeploymentInitResultSchema>;
