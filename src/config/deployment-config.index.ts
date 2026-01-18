/**
 * Voice Provider Deployment Configuration - Public API
 *
 * This index file exports the complete deployment configuration schema,
 * validation, presets, and utilities for voice provider deployment across
 * Docker, System, and Cloud modes.
 *
 * Usage:
 *   import type { DeploymentConfig } from './deployment-config.index';
 *   import { WHISPER_DOCKER_PRESET } from './deployment-config.index';
 *   import { validateDeploymentConfig } from './deployment-config.index';
 */

// Type Definitions
export type {
  HealthCheckConfig,
  RetryPolicy,
  LoggingConfig,
  BaseDeploymentConfig,
  DockerDeploymentConfig,
  SystemDeploymentConfig,
  CloudDeploymentConfig,
  DeploymentConfig,
  ProviderDeploymentOverrides,
  DeploymentHealthStatus,
  DeploymentInitResult,
} from './deployment-config.types.js';

// Zod Schemas
export {
  HealthCheckConfigSchema,
  RetryPolicySchema,
  LoggingConfigSchema,
  BaseDeploymentConfigSchema,
  DockerDeploymentConfigSchema,
  SystemDeploymentConfigSchema,
  CloudDeploymentConfigSchema,
  DeploymentConfigSchema,
  ProviderDeploymentOverridesSchema,
  DeploymentHealthStatusSchema,
  DeploymentInitResultSchema,
} from './zod-schema.deployment-config.js';

// Provider Presets
export {
  // Whisper
  WHISPER_DOCKER_PRESET,
  WHISPER_SYSTEM_PRESET,
  // Faster-Whisper
  FASTER_WHISPER_DOCKER_PRESET,
  FASTER_WHISPER_SYSTEM_PRESET,
  // Kokoro TTS
  KOKORO_DOCKER_PRESET,
  KOKORO_SYSTEM_PRESET,
  // Piper TTS
  PIPER_SYSTEM_PRESET,
  // ElevenLabs
  ELEVENLABS_CLOUD_PRESET,
  // OpenAI
  OPENAI_STT_CLOUD_PRESET,
  OPENAI_TTS_CLOUD_PRESET,
  // Google Cloud
  GOOGLE_STT_CLOUD_PRESET,
  GOOGLE_TTS_CLOUD_PRESET,
  // Azure
  AZURE_STT_CLOUD_PRESET,
  AZURE_TTS_CLOUD_PRESET,
  // Preset registry and utilities
  DEPLOYMENT_PRESETS,
  getDeploymentPreset,
  listDeploymentPresets,
  getPresetsByMode,
  getPresetsByType,
} from './deployment-config.presets.js';

// Validation Utilities
export {
  validateDeploymentConfig,
  validateDeploymentConfigByMode,
} from './deployment-config.utils.js';

// Type Guards
export {
  isDockerConfig,
  isSystemConfig,
  isCloudConfig,
} from './deployment-config.utils.js';

// Configuration Merging
export {
  mergeDeploymentConfigs,
  deepMergeDeploymentConfigs,
  applyProviderOverrides,
} from './deployment-config.utils.js';

// Environment Utilities
export {
  resolveEnvVariables,
  resolveConfigEnvironment,
  configToEnvVars,
} from './deployment-config.utils.js';

// Analysis and Formatting
export {
  summarizeDeploymentConfig,
  isCompleteConfig,
  getRequiredFields,
  formatDeploymentConfig,
  estimateDeploymentRequirements,
} from './deployment-config.utils.js';

/**
 * Quick Start Examples
 *
 * Example 1: Use Docker preset directly
 *   const config = WHISPER_DOCKER_PRESET;
 *   await registry.loadProviders([config]);
 *
 * Example 2: Customize Docker preset
 *   const custom = mergeDeploymentConfigs(WHISPER_DOCKER_PRESET, {
 *     priority: 20,
 *     env: { CUDA_VISIBLE_DEVICES: '0' }
 *   });
 *
 * Example 3: Validate configuration
 *   const result = validateDeploymentConfig(myConfig);
 *   if (result.valid) {
 *     // Use result.config
 *   } else {
 *     console.error(result.errors);
 *   }
 *
 * Example 4: Get all Docker presets
 *   const dockerPresets = getPresetsByMode('docker');
 *
 * Example 5: Estimate resource requirements
 *   const req = estimateDeploymentRequirements(WHISPER_DOCKER_PRESET);
 *   console.log(`Needs ${req.recommendedMemoryMb}MB RAM`);
 */

// Re-export common types for convenience
export type {
  DeploymentConfig as DeploymentConfigType,
  DockerDeploymentConfig as DockerModeConfig,
  SystemDeploymentConfig as SystemModeConfig,
  CloudDeploymentConfig as CloudModeConfig,
} from './deployment-config.types.js';
