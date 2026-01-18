/**
 * Deployment Configuration Tests
 *
 * Comprehensive tests for deployment config schema validation,
 * utilities, and provider-specific configurations.
 */

import { describe, it, expect } from 'vitest';
import type {
  DeploymentConfig,
  DockerDeploymentConfig,
  SystemDeploymentConfig,
  CloudDeploymentConfig,
} from './deployment-config.types.js';
import {
  validateDeploymentConfig,
  validateDeploymentConfigByMode,
  isDockerConfig,
  isSystemConfig,
  isCloudConfig,
  mergeDeploymentConfigs,
  resolveEnvVariables,
  resolveConfigEnvironment,
  configToEnvVars,
  summarizeDeploymentConfig,
  isCompleteConfig,
  estimateDeploymentRequirements,
} from './deployment-config.utils.js';
import {
  WHISPER_DOCKER_PRESET,
  WHISPER_SYSTEM_PRESET,
  OPENAI_TTS_CLOUD_PRESET,
  ELEVENLABS_CLOUD_PRESET,
  getDeploymentPreset,
  listDeploymentPresets,
  getPresetsByMode,
  getPresetsByType,
} from './deployment-config.presets.js';

describe('Deployment Configuration Schema', () => {
  describe('Docker Config Validation', () => {
    it('should validate a valid Docker config', () => {
      const config: DockerDeploymentConfig = {
        id: 'test-docker',
        type: 'whisper',
        mode: 'docker',
        image: 'openai/whisper:latest',
        ports: { 8000: 8000 },
      };

      const result = validateDeploymentConfigByMode(config, 'docker');
      expect(result.valid).toBe(true);
      expect(result.config).toBeDefined();
    });

    it('should reject Docker config missing image', () => {
      const config = {
        id: 'test-docker',
        type: 'whisper',
        mode: 'docker',
        ports: { 8000: 8000 },
      };

      const result = validateDeploymentConfigByMode(config, 'docker');
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should validate resource limits', () => {
      const config: DockerDeploymentConfig = {
        id: 'test-docker',
        type: 'whisper',
        mode: 'docker',
        image: 'openai/whisper',
        ports: { 8000: 8000 },
        resources: {
          memoryMb: 4096,
          cpuLimit: 2,
          memoryRequestMb: 2048,
          cpuRequest: 1,
        },
      };

      const result = validateDeploymentConfigByMode(config, 'docker');
      expect(result.valid).toBe(true);
    });
  });

  describe('System Config Validation', () => {
    it('should validate a valid System config', () => {
      const config: SystemDeploymentConfig = {
        id: 'test-system',
        type: 'whisper',
        mode: 'system',
        binary: 'whisper',
      };

      const result = validateDeploymentConfigByMode(config, 'system');
      expect(result.valid).toBe(true);
    });

    it('should validate system with package managers', () => {
      const config: SystemDeploymentConfig = {
        id: 'test-system',
        type: 'whisper',
        mode: 'system',
        binary: 'whisper',
        packageManager: ['pip', 'brew'],
        pypiPackage: 'openai-whisper',
      };

      const result = validateDeploymentConfigByMode(config, 'system');
      expect(result.valid).toBe(true);
    });

    it('should validate system models config', () => {
      const config: SystemDeploymentConfig = {
        id: 'test-system',
        type: 'whisper',
        mode: 'system',
        binary: 'whisper',
        models: {
          path: '~/.cache/whisper',
          autoDownload: true,
          predownload: ['base', 'small'],
        },
      };

      const result = validateDeploymentConfigByMode(config, 'system');
      expect(result.valid).toBe(true);
    });
  });

  describe('Cloud Config Validation', () => {
    it('should validate a valid Cloud config', () => {
      const config: CloudDeploymentConfig = {
        id: 'test-cloud',
        type: 'openai',
        mode: 'cloud',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(true);
    });

    it('should validate Cloud config with auth', () => {
      const config: CloudDeploymentConfig = {
        id: 'test-cloud',
        type: 'openai',
        mode: 'cloud',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        auth: {
          type: 'bearer',
        },
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(true);
    });

    it('should validate Cloud config with rate limits', () => {
      const config: CloudDeploymentConfig = {
        id: 'test-cloud',
        type: 'elevenlabs',
        mode: 'cloud',
        provider: 'elevenlabs',
        endpoint: 'https://api.elevenlabs.io/v1',
        rateLimit: {
          requestsPerMinute: 60,
          maxConcurrent: 5,
        },
        quota: {
          monthlyCharacterLimit: 100000,
          costPer1kUnits: 0.002,
        },
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(true);
    });

    it('should reject Cloud config with invalid URL', () => {
      const config = {
        id: 'test-cloud',
        type: 'openai',
        mode: 'cloud',
        provider: 'openai',
        endpoint: 'not-a-url',
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(false);
    });
  });

  describe('Type Guards', () => {
    it('should identify Docker config', () => {
      const config = WHISPER_DOCKER_PRESET;
      expect(isDockerConfig(config)).toBe(true);
      expect(isSystemConfig(config)).toBe(false);
      expect(isCloudConfig(config)).toBe(false);
    });

    it('should identify System config', () => {
      const config = WHISPER_SYSTEM_PRESET;
      expect(isSystemConfig(config)).toBe(true);
      expect(isDockerConfig(config)).toBe(false);
      expect(isCloudConfig(config)).toBe(false);
    });

    it('should identify Cloud config', () => {
      const config = OPENAI_TTS_CLOUD_PRESET;
      expect(isCloudConfig(config)).toBe(true);
      expect(isDockerConfig(config)).toBe(false);
      expect(isSystemConfig(config)).toBe(false);
    });
  });

  describe('Configuration Merging', () => {
    it('should merge Docker configs', () => {
      const baseConfig = WHISPER_DOCKER_PRESET;
      const overrides = {
        priority: 20,
        env: { CUDA_VISIBLE_DEVICES: '1' },
      };

      const merged = mergeDeploymentConfigs(baseConfig, overrides);
      expect(merged.priority).toBe(20);
      expect(merged.env?.CUDA_VISIBLE_DEVICES).toBe('1');
      expect(merged.image).toBe(baseConfig.image); // Base fields preserved
    });

    it('should preserve nested objects when merging', () => {
      const baseConfig = WHISPER_DOCKER_PRESET;
      const overrides = {
        resources: { memoryMb: 8192 },
      };

      const merged = mergeDeploymentConfigs(baseConfig, overrides);
      expect(merged.resources?.memoryMb).toBe(8192);
      expect(merged.resources?.cpuLimit).toBe(baseConfig.resources?.cpuLimit); // Other fields preserved
    });
  });

  describe('Environment Variable Resolution', () => {
    it('should resolve simple variable', () => {
      const result = resolveEnvVariables('$HOME/whisper', { HOME: '/home/user' });
      expect(result).toBe('/home/user/whisper');
    });

    it('should resolve braced variable', () => {
      const result = resolveEnvVariables('${HOME}/whisper', { HOME: '/home/user' });
      expect(result).toBe('/home/user/whisper');
    });

    it('should resolve variable with default', () => {
      const result = resolveEnvVariables('${MISSING:default}', {});
      expect(result).toBe('default');
    });

    it('should handle multiple variables', () => {
      const result = resolveEnvVariables(
        '${HOST:localhost}:${PORT:8000}',
        { HOST: 'example.com' },
      );
      expect(result).toBe('example.com:8000');
    });

    it('should resolve config environment', () => {
      const config: CloudDeploymentConfig = {
        id: 'test',
        type: 'openai',
        mode: 'cloud',
        provider: 'openai',
        endpoint: '${OPENAI_ENDPOINT:https://api.openai.com/v1}',
      };

      const resolved = resolveConfigEnvironment(config, {
        OPENAI_ENDPOINT: 'https://custom.openai.com/v1',
      });

      expect(resolved.endpoint).toBe('https://custom.openai.com/v1');
    });
  });

  describe('Configuration to Environment Variables', () => {
    it('should convert Docker config to env vars', () => {
      const config = WHISPER_DOCKER_PRESET;
      const envVars = configToEnvVars(config);

      expect(envVars.VOICE_PROVIDER_ID).toBe(config.id);
      expect(envVars.VOICE_PROVIDER_TYPE).toBe(config.type);
      expect(envVars.VOICE_PROVIDER_MODE).toBe('docker');
      expect(envVars.VOICE_PROVIDER_DOCKER_IMAGE).toBe(config.image);
    });

    it('should use custom prefix', () => {
      const config = WHISPER_SYSTEM_PRESET;
      const envVars = configToEnvVars(config, 'CUSTOM_');

      expect(envVars.CUSTOM_ID).toBe(config.id);
      expect(envVars.CUSTOM_MODE).toBe('system');
    });
  });

  describe('Configuration Summary', () => {
    it('should summarize Docker config', () => {
      const config = WHISPER_DOCKER_PRESET;
      const summary = summarizeDeploymentConfig(config);

      expect(summary.id).toBe(config.id);
      expect(summary.mode).toBe('docker');
      expect(summary.docker).toBeDefined();
      expect(summary.docker.image).toBe(config.image);
    });

    it('should summarize System config', () => {
      const config = WHISPER_SYSTEM_PRESET;
      const summary = summarizeDeploymentConfig(config);

      expect(summary.system).toBeDefined();
      expect(summary.system.binary).toBe(config.binary);
    });

    it('should summarize Cloud config', () => {
      const config = OPENAI_TTS_CLOUD_PRESET;
      const summary = summarizeDeploymentConfig(config);

      expect(summary.cloud).toBeDefined();
      expect(summary.cloud.provider).toBe(config.provider);
    });
  });

  describe('Configuration Completeness', () => {
    it('should identify complete Docker config', () => {
      expect(isCompleteConfig(WHISPER_DOCKER_PRESET)).toBe(true);
    });

    it('should identify complete System config', () => {
      expect(isCompleteConfig(WHISPER_SYSTEM_PRESET)).toBe(true);
    });

    it('should identify complete Cloud config', () => {
      expect(isCompleteConfig(OPENAI_TTS_CLOUD_PRESET)).toBe(true);
    });

    it('should identify incomplete config', () => {
      const incomplete: any = {
        id: 'test',
        type: 'whisper',
        mode: 'docker',
        // Missing required 'image' and 'ports'
      };

      expect(isCompleteConfig(incomplete)).toBe(false);
    });
  });

  describe('Deployment Requirements Estimation', () => {
    it('should estimate Docker requirements', () => {
      const config = WHISPER_DOCKER_PRESET;
      const requirements = estimateDeploymentRequirements(config);

      expect(requirements.minimumMemoryMb).toBeGreaterThan(0);
      expect(requirements.estimatedMemoryMb).toBeGreaterThan(requirements.minimumMemoryMb);
      expect(requirements.cpuCoresNeeded).toBeGreaterThan(0);
      expect(requirements.networkRequired).toBe(false);
    });

    it('should estimate System requirements', () => {
      const config = WHISPER_SYSTEM_PRESET;
      const requirements = estimateDeploymentRequirements(config);

      expect(requirements.minimumMemoryMb).toBeLessThan(2000); // Lightweight
      expect(requirements.diskSpaceGb).toBeGreaterThan(0); // Models needed
    });

    it('should estimate Cloud requirements', () => {
      const config = OPENAI_TTS_CLOUD_PRESET;
      const requirements = estimateDeploymentRequirements(config);

      expect(requirements.minimumMemoryMb).toBeLessThan(1000); // Minimal
      expect(requirements.networkRequired).toBe(true);
    });
  });

  describe('Deployment Presets', () => {
    it('should provide Whisper Docker preset', () => {
      expect(WHISPER_DOCKER_PRESET.id).toBe('whisper-docker');
      expect(WHISPER_DOCKER_PRESET.mode).toBe('docker');
      expect(isCompleteConfig(WHISPER_DOCKER_PRESET)).toBe(true);
    });

    it('should provide Whisper System preset', () => {
      expect(WHISPER_SYSTEM_PRESET.id).toBe('whisper-system');
      expect(WHISPER_SYSTEM_PRESET.mode).toBe('system');
      expect(isCompleteConfig(WHISPER_SYSTEM_PRESET)).toBe(true);
    });

    it('should provide Cloud provider presets', () => {
      expect(OPENAI_TTS_CLOUD_PRESET.mode).toBe('cloud');
      expect(ELEVENLABS_CLOUD_PRESET.mode).toBe('cloud');
    });

    it('should retrieve preset by ID', () => {
      const preset = getDeploymentPreset('whisper-docker');
      expect(preset).toEqual(WHISPER_DOCKER_PRESET);
    });

    it('should list all presets', () => {
      const presets = listDeploymentPresets();
      expect(presets.length).toBeGreaterThan(0);
      expect(presets[0]).toHaveProperty('id');
      expect(presets[0]).toHaveProperty('name');
      expect(presets[0]).toHaveProperty('mode');
    });

    it('should filter presets by mode', () => {
      const dockerPresets = getPresetsByMode('docker');
      expect(dockerPresets.length).toBeGreaterThan(0);
      dockerPresets.forEach(p => {
        expect(['whisper-docker', 'faster-whisper-docker', 'kokoro-docker']).toContain(p.id);
      });
    });

    it('should filter presets by type', () => {
      const whisperPresets = getPresetsByType('whisper');
      expect(whisperPresets.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check Configuration', () => {
    it('should validate health check with endpoint', () => {
      const config: DockerDeploymentConfig = {
        id: 'test',
        type: 'whisper',
        mode: 'docker',
        image: 'openai/whisper',
        ports: { 8000: 8000 },
        healthCheck: {
          enabled: true,
          endpoint: 'http://localhost:8000/health',
          timeoutMs: 5000,
          intervalMs: 30000,
        },
      };

      const result = validateDeploymentConfigByMode(config, 'docker');
      expect(result.valid).toBe(true);
    });

    it('should validate health check with command', () => {
      const config: SystemDeploymentConfig = {
        id: 'test',
        type: 'whisper',
        mode: 'system',
        binary: 'whisper',
        healthCheck: {
          enabled: true,
          command: 'whisper --version',
          expectedExitCode: 0,
        },
      };

      const result = validateDeploymentConfigByMode(config, 'system');
      expect(result.valid).toBe(true);
    });
  });

  describe('Retry Policy Configuration', () => {
    it('should validate retry policy', () => {
      const config: CloudDeploymentConfig = {
        id: 'test',
        type: 'openai',
        mode: 'cloud',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        retries: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          multiplier: 2,
          retryableErrors: ['TIMEOUT', 429, 'ECONNRESET'],
        },
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(true);
    });
  });

  describe('Quota and Budget Configuration', () => {
    it('should validate quota configuration', () => {
      const config: CloudDeploymentConfig = {
        id: 'test',
        type: 'elevenlabs',
        mode: 'cloud',
        provider: 'elevenlabs',
        endpoint: 'https://api.elevenlabs.io/v1',
        quota: {
          enabled: true,
          monthlyCharacterLimit: 100000,
          costPer1kUnits: 0.002,
          alertThreshold: 80,
        },
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(true);
    });

    it('should validate budget configuration', () => {
      const config: CloudDeploymentConfig = {
        id: 'test',
        type: 'openai',
        mode: 'cloud',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        budget: {
          monthlyLimit: 100,
          dailyLimit: 10,
          alertThreshold: 5,
        },
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(true);
    });
  });

  describe('Regional Configuration', () => {
    it('should validate regional configuration', () => {
      const config: CloudDeploymentConfig = {
        id: 'test',
        type: 'google',
        mode: 'cloud',
        provider: 'google',
        endpoint: 'https://speech.googleapis.com/v1',
        regions: {
          default: 'us-central1',
          endpoints: {
            'us-central1': 'https://us-central1-speech.googleapis.com/v1',
            'eu-west1': 'https://eu-west1-speech.googleapis.com/v1',
          },
          preferredRegions: ['us-central1', 'eu-west1'],
        },
      };

      const result = validateDeploymentConfigByMode(config, 'cloud');
      expect(result.valid).toBe(true);
    });
  });
});
