/**
 * Deployment Configuration Utilities
 *
 * Helper functions for working with deployment configurations:
 * - Validation and error handling
 * - Merging and overriding configurations
 * - Provider capability detection
 * - Configuration transformation and normalization
 */

import type {
  DeploymentConfig,
  DockerDeploymentConfig,
  SystemDeploymentConfig,
  CloudDeploymentConfig,
  BaseDeploymentConfig,
  ProviderDeploymentOverrides,
} from './deployment-config.types.js';
import {
  DeploymentConfigSchema,
  DockerDeploymentConfigSchema,
  SystemDeploymentConfigSchema,
  CloudDeploymentConfigSchema,
  ProviderDeploymentOverridesSchema,
} from './zod-schema.deployment-config.js';

/**
 * Validate a deployment configuration
 *
 * Returns validation result with detailed error information
 */
export function validateDeploymentConfig(
  config: unknown,
): { valid: boolean; config?: DeploymentConfig; errors?: string[] } {
  try {
    const validated = DeploymentConfigSchema.parse(config);
    return { valid: true, config: validated };
  } catch (error) {
    const errors = error instanceof Error
      ? [error.message]
      : Array.isArray(error)
        ? (error as any[]).map((e: any) => e.message || String(e))
        : [String(error)];
    return { valid: false, errors };
  }
}

/**
 * Validate a specific mode's configuration
 */
export function validateDeploymentConfigByMode(
  config: unknown,
  mode: 'docker' | 'system' | 'cloud',
): { valid: boolean; config?: DeploymentConfig; errors?: string[] } {
  try {
    let schema;
    switch (mode) {
      case 'docker':
        schema = DockerDeploymentConfigSchema;
        break;
      case 'system':
        schema = SystemDeploymentConfigSchema;
        break;
      case 'cloud':
        schema = CloudDeploymentConfigSchema;
        break;
      default:
        return { valid: false, errors: [`Unknown deployment mode: ${mode}`] };
    }

    const validated = schema.parse(config);
    return { valid: true, config: validated };
  } catch (error) {
    const errors = error instanceof Error
      ? [error.message]
      : [String(error)];
    return { valid: false, errors };
  }
}

/**
 * Type guard: Check if config is Docker deployment
 */
export function isDockerConfig(config: DeploymentConfig): config is DockerDeploymentConfig {
  return config.mode === 'docker';
}

/**
 * Type guard: Check if config is System deployment
 */
export function isSystemConfig(config: DeploymentConfig): config is SystemDeploymentConfig {
  return config.mode === 'system';
}

/**
 * Type guard: Check if config is Cloud deployment
 */
export function isCloudConfig(config: DeploymentConfig): config is CloudDeploymentConfig {
  return config.mode === 'cloud';
}

/**
 * Merge two deployment configurations
 *
 * Shallow merge: base config extended with override values
 * Preserves structure and types
 */
export function mergeDeploymentConfigs<T extends DeploymentConfig>(
  baseConfig: T,
  overrides: Partial<T>,
): T {
  return {
    ...baseConfig,
    ...overrides,
    // Preserve nested objects via spread
    retries: { ...baseConfig.retries, ...overrides.retries },
    healthCheck: { ...baseConfig.healthCheck, ...overrides.healthCheck },
    logging: { ...baseConfig.logging, ...overrides.logging },
    env: { ...baseConfig.env, ...overrides.env },
    tags: { ...baseConfig.tags, ...overrides.tags },
    // Merge mode-specific nested objects based on base config type (since overrides is Partial)
    ...(isDockerConfig(baseConfig)
      ? {
          resources: { ...(baseConfig as any).resources, ...(overrides as any)?.resources },
          security: { ...(baseConfig as any).security, ...(overrides as any)?.security },
        }
      : {}),
    ...(isSystemConfig(baseConfig)
      ? {
          cliFlags: { ...(baseConfig as any).cliFlags, ...(overrides as any)?.cliFlags },
          models: { ...(baseConfig as any).models, ...(overrides as any)?.models },
        }
      : {}),
    ...(isCloudConfig(baseConfig)
      ? {
          rateLimit: { ...(baseConfig as any).rateLimit, ...(overrides as any)?.rateLimit },
          quota: { ...(baseConfig as any).quota, ...(overrides as any)?.quota },
          regions: { ...(baseConfig as any).regions, ...(overrides as any)?.regions },
          budget: { ...(baseConfig as any).budget, ...(overrides as any)?.budget },
          cache: { ...(baseConfig as any).cache, ...(overrides as any)?.cache },
        }
      : {}),
  } as T;
}

/**
 * Deep merge for nested objects
 */
export function deepMergeDeploymentConfigs<T extends DeploymentConfig>(
  baseConfig: T,
  overrides: Partial<T>,
  depth: number = 2,
): T {
  if (depth === 0) {
    return mergeDeploymentConfigs(baseConfig, overrides);
  }

  const merged = mergeDeploymentConfigs(baseConfig, overrides);

  // Deep merge resource limits for Docker
  if (isDockerConfig(baseConfig) && isDockerConfig(merged) && (baseConfig as any).resources) {
    (merged as any).resources = {
      ...(baseConfig as any).resources,
      ...(overrides as any)?.resources,
    };
  }

  // Deep merge CLI flags for System
  if (isSystemConfig(baseConfig) && isSystemConfig(merged) && (baseConfig as any).cliFlags) {
    (merged as any).cliFlags = {
      ...(baseConfig as any).cliFlags,
      defaults: {
        ...(baseConfig as any).cliFlags.defaults,
        ...(overrides as any)?.cliFlags?.defaults,
      },
      ...(overrides as any)?.cliFlags,
    };
  }

  return merged;
}

/**
 * Apply provider-specific overrides to a base configuration
 */
export function applyProviderOverrides(
  baseConfig: DeploymentConfig,
  overrides: ProviderDeploymentOverrides,
): DeploymentConfig {
  if (overrides.strategy === 'replace') {
    // Validate and return the override config entirely
    const result = validateDeploymentConfig(overrides.overrides as any);
    if (result.valid && result.config) {
      return result.config;
    }
    throw new Error(`Invalid override configuration: ${result.errors?.join(', ')}`);
  }

  // Default: merge strategy
  return mergeDeploymentConfigs(baseConfig, overrides.overrides as Partial<typeof baseConfig>);
}

/**
 * Normalize environment variable references
 *
 * Supports: $VAR, ${VAR}, ${VAR:default}
 */
export function resolveEnvVariables(
  value: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return value.replace(
    /\$\{([^}:]+)(?::([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, named, defaultVal, simple) => {
      const varName = named || simple;
      return env[varName] || defaultVal || match;
    },
  );
}

/**
 * Resolve environment variables in a deployment config
 */
export function resolveConfigEnvironment(
  config: DeploymentConfig,
  env: Record<string, string | undefined> = process.env,
): DeploymentConfig {
  const resolved = { ...config };

  // Resolve env object
  if (config.env) {
    resolved.env = Object.fromEntries(
      Object.entries(config.env).map(([key, value]) => [
        key,
        resolveEnvVariables(value, env),
      ]),
    );
  }

  // Resolve mode-specific fields
  if (isDockerConfig(config)) {
    const dockerResolved = resolved as DockerDeploymentConfig;
    if (config.image) {
      dockerResolved.image = resolveEnvVariables(config.image, env);
    }
  }

  if (isSystemConfig(config)) {
    const systemResolved = resolved as SystemDeploymentConfig;
    if (config.binary) {
      systemResolved.binary = resolveEnvVariables(config.binary, env);
    }
  }

  if (isCloudConfig(config)) {
    const cloudResolved = resolved as CloudDeploymentConfig;
    if (config.endpoint) {
      cloudResolved.endpoint = resolveEnvVariables(config.endpoint, env);
    }
  }

  return resolved;
}

/**
 * Convert a deployment config to environment variables
 *
 * Useful for passing config to subprocesses
 */
export function configToEnvVars(
  config: DeploymentConfig,
  prefix: string = 'VOICE_PROVIDER_',
): Record<string, string> {
  const envVars: Record<string, string> = {};
  const key = (name: string) => `${prefix}${name}`.toUpperCase();

  // Base config
  envVars[key('ID')] = config.id;
  envVars[key('TYPE')] = config.type;
  envVars[key('MODE')] = config.mode;
  envVars[key('ENABLED')] = String(config.enabled ?? true);
  envVars[key('PRIORITY')] = String(config.priority ?? 0);
  envVars[key('TIMEOUT_MS')] = String(config.timeoutMs ?? 30000);

  // Mode-specific
  if (isDockerConfig(config)) {
    envVars[`${prefix}DOCKER_IMAGE`] = config.image;
    if (config.tag) {
      envVars[`${prefix}DOCKER_TAG`] = config.tag;
    }
    envVars[`${prefix}DOCKER_PORTS`] = JSON.stringify(config.ports);
  }

  if (isSystemConfig(config)) {
    envVars[`${prefix}SYSTEM_BINARY`] = config.binary;
    if (config.packageManager) {
      envVars[`${prefix}SYSTEM_PKG_MANAGERS`] = config.packageManager.join(',');
    }
  }

  if (isCloudConfig(config)) {
    envVars[`${prefix}CLOUD_PROVIDER`] = config.provider;
    envVars[`${prefix}CLOUD_ENDPOINT`] = config.endpoint;
  }

  return envVars;
}

/**
 * Get configuration summary for logging/debugging
 */
export function summarizeDeploymentConfig(config: DeploymentConfig): Record<string, any> {
  const summary: Record<string, any> = {
    id: config.id,
    name: config.name,
    type: config.type,
    mode: config.mode,
    enabled: config.enabled ?? true,
    priority: config.priority ?? 0,
  };

  if (isDockerConfig(config)) {
    summary.docker = {
      image: config.image,
      tag: config.tag,
      ports: config.ports,
      memory: config.resources?.memoryMb,
      cpu: config.resources?.cpuLimit,
    };
  }

  if (isSystemConfig(config)) {
    summary.system = {
      binary: config.binary,
      packageManagers: config.packageManager,
      modelPath: config.models?.path,
    };
  }

  if (isCloudConfig(config)) {
    summary.cloud = {
      provider: config.provider,
      endpoint: config.endpoint,
      hasAuth: !!config.auth,
      rateLimitRPM: config.rateLimit?.requestsPerMinute,
    };
  }

  return summary;
}

/**
 * Check if a config has all required fields
 */
export function isCompleteConfig(config: DeploymentConfig): boolean {
  if (!config.id || !config.type || !config.mode) {
    return false;
  }

  if (isDockerConfig(config)) {
    return !!config.image && Object.keys(config.ports).length > 0;
  }

  if (isSystemConfig(config)) {
    return !!config.binary;
  }

  if (isCloudConfig(config)) {
    return !!config.provider && !!config.endpoint;
  }

  return false;
}

/**
 * Get required fields for a deployment mode
 */
export function getRequiredFields(mode: 'docker' | 'system' | 'cloud'): string[] {
  switch (mode) {
    case 'docker':
      return ['id', 'type', 'mode', 'image', 'ports'];
    case 'system':
      return ['id', 'type', 'mode', 'binary'];
    case 'cloud':
      return ['id', 'type', 'mode', 'provider', 'endpoint'];
    default:
      return [];
  }
}

/**
 * Format a deployment config for display
 */
export function formatDeploymentConfig(config: DeploymentConfig, indent: number = 0): string {
  const padding = ' '.repeat(indent);
  const lines: string[] = [];

  lines.push(`${padding}Provider ID: ${config.id}`);
  lines.push(`${padding}Name: ${config.name || config.id}`);
  lines.push(`${padding}Type: ${config.type}`);
  lines.push(`${padding}Mode: ${config.mode}`);
  lines.push(`${padding}Enabled: ${config.enabled ?? true}`);

  if (isDockerConfig(config)) {
    lines.push(`${padding}Docker Image: ${config.image}${config.tag ? `:${config.tag}` : ''}`);
    lines.push(`${padding}Ports: ${JSON.stringify(config.ports)}`);
    if (config.resources) {
      lines.push(`${padding}Resources:`);
      lines.push(`${padding}  Memory: ${config.resources.memoryMb}MB`);
      lines.push(`${padding}  CPU: ${config.resources.cpuLimit} cores`);
    }
  }

  if (isSystemConfig(config)) {
    lines.push(`${padding}Binary: ${config.binary}`);
    lines.push(`${padding}Package Managers: ${config.packageManager?.join(', ') || 'auto'}`);
  }

  if (isCloudConfig(config)) {
    lines.push(`${padding}Provider: ${config.provider}`);
    lines.push(`${padding}Endpoint: ${config.endpoint}`);
    if (config.rateLimit?.requestsPerMinute) {
      lines.push(`${padding}Rate Limit: ${config.rateLimit.requestsPerMinute} req/min`);
    }
  }

  return lines.join('\n');
}

/**
 * Estimate deployment requirements
 */
export function estimateDeploymentRequirements(config: DeploymentConfig): {
  minimumMemoryMb: number;
  estimatedMemoryMb: number;
  recommendedMemoryMb: number;
  cpuCoresNeeded: number;
  networkRequired: boolean;
  diskSpaceGb: number;
} {
  let minMemory = 512;
  let estMemory = 2048;
  let recMemory = 4096;
  let cpuCores = 1;
  let network = false;
  let diskSpace = 0;

  if (isDockerConfig(config)) {
    minMemory = config.resources?.memoryRequestMb ?? 1024;
    estMemory = config.resources?.memoryMb ?? 2048;
    recMemory = estMemory * 1.5;
    cpuCores = config.resources?.cpuLimit ?? 1;
  }

  if (isSystemConfig(config)) {
    estMemory = 1024; // Lightweight for system installs
    recMemory = 2048;
    diskSpace = 2; // Models typically 1-2GB
  }

  if (isCloudConfig(config)) {
    minMemory = 256; // Minimal for API clients
    estMemory = 512;
    recMemory = 1024;
    network = true;
  }

  return {
    minimumMemoryMb: minMemory,
    estimatedMemoryMb: estMemory,
    recommendedMemoryMb: recMemory,
    cpuCoresNeeded: cpuCores,
    networkRequired: network,
    diskSpaceGb: diskSpace,
  };
}
