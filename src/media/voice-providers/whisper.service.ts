/**
 * Whisper Voice Provider Plugin Service
 *
 * Central service for Whisper STT provider lifecycle management.
 * Handles initialization, deployment selection, and provider registration.
 */

import { WhisperExecutor } from './whisper.js';
import { WhisperDockerDeploymentHandler } from './whisper.docker.js';
import { WhisperSystemDeploymentHandler } from './whisper.system.js';
import { VoiceProviderError } from './executor.js';
import type { VoiceProviderExecutor, ProviderCapabilities } from './executor.js';
import type { z } from 'zod';
import type { WhisperConfigSchema } from '../../config/zod-schema.voice-providers.js';

/**
 * Deployment detection result
 */
interface DeploymentDetection {
  mode: 'docker' | 'system';
  reason: string;
  available: boolean;
  error?: string;
}

/**
 * Plugin service configuration
 */
interface WhisperPluginServiceConfig {
  autoDetectDeployment?: boolean;
  preferredDeployment?: 'docker' | 'system';
  autoStartDocker?: boolean;
  downloadModelsOnInit?: boolean;
  cacheDir?: string;
  workspaceDir?: string;
}

/**
 * Service status
 */
interface WhisperPluginServiceStatus {
  initialized: boolean;
  deploymentMode: 'docker' | 'system';
  healthy: boolean;
  executor?: VoiceProviderExecutor;
  capabilities?: ProviderCapabilities;
  error?: string;
}

/**
 * Whisper Plugin Service
 *
 * Manages the complete lifecycle of the Whisper provider.
 */
export class WhisperPluginService {
  private executor?: WhisperExecutor;
  private status: WhisperPluginServiceStatus = {
    initialized: false,
    deploymentMode: 'system',
    healthy: false,
  };

  private config: Required<WhisperPluginServiceConfig>;

  constructor(config: WhisperPluginServiceConfig = {}) {
    this.config = {
      autoDetectDeployment: config.autoDetectDeployment ?? true,
      preferredDeployment: config.preferredDeployment ?? 'system',
      autoStartDocker: config.autoStartDocker ?? false,
      downloadModelsOnInit: config.downloadModelsOnInit ?? true,
      cacheDir: config.cacheDir || `${process.env.HOME}/.cache/whisper`,
      workspaceDir: config.workspaceDir || process.cwd(),
    };
  }

  /**
   * Initialize the Whisper plugin service
   */
  async initialize(
    providerId: string,
    config: z.infer<typeof WhisperConfigSchema>,
  ): Promise<void> {
    try {
      // Detect deployment mode if needed
      if (this.config.autoDetectDeployment) {
        const detection = await this.detectDeploymentMode();

        if (detection.available) {
          process.env.WHISPER_DEPLOYMENT = detection.mode;
          this.status.deploymentMode = detection.mode;
        }
      }

      // Set cache directory
      if (this.config.cacheDir) {
        process.env.WHISPER_CACHE_PATH = this.config.cacheDir;
      }

      // Create executor
      this.executor = new WhisperExecutor(providerId, config);

      // Initialize executor
      await this.executor.initialize();

      this.status.initialized = true;
      this.status.executor = this.executor;
      this.status.capabilities = this.executor.getCapabilities();

      // Check health
      const healthy = await this.executor.isHealthy();
      this.status.healthy = healthy;

      if (!healthy) {
        console.warn('Whisper executor is not healthy after initialization');
      }
    } catch (error) {
      this.status.error =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Detect available deployment mode
   */
  async detectDeploymentMode(): Promise<DeploymentDetection> {
    // Try Docker first if preferred
    if (this.config.preferredDeployment === 'docker') {
      const dockerDetected = await this.isDockerAvailable();

      if (dockerDetected) {
        return {
          mode: 'docker',
          reason: 'Docker is available and preferred',
          available: true,
        };
      }

      console.warn('Docker not available, falling back to system deployment');
    }

    // Check system deployment
    const systemAvailable = await this.isSystemDeploymentAvailable();

    if (systemAvailable) {
      return {
        mode: 'system',
        reason: 'System Python deployment available',
        available: true,
      };
    }

    return {
      mode: 'system',
      reason: 'No deployment mode available',
      available: false,
      error: 'Neither Docker nor system Python deployment is available',
    };
  }

  /**
   * Check if Docker is available
   */
  private async isDockerAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');
      execSync('docker version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if system deployment is available
   */
  private async isSystemDeploymentAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');

      // Check Python
      execSync('python3 --version', { stdio: 'ignore' });

      // Check Whisper
      execSync('python3 -m pip show openai-whisper', { stdio: 'ignore' });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get service status
   */
  getStatus(): WhisperPluginServiceStatus {
    return { ...this.status };
  }

  /**
   * Get executor
   */
  getExecutor(): WhisperExecutor | undefined {
    return this.executor;
  }

  /**
   * Check health
   */
  async checkHealth(): Promise<boolean> {
    if (!this.executor) {
      return false;
    }

    try {
      const healthy = await this.executor.isHealthy();
      this.status.healthy = healthy;
      return healthy;
    } catch (error) {
      this.status.error =
        error instanceof Error ? error.message : String(error);
      this.status.healthy = false;
      return false;
    }
  }

  /**
   * Restart the service
   */
  async restart(
    providerId: string,
    config: z.infer<typeof WhisperConfigSchema>,
  ): Promise<void> {
    try {
      // Shutdown current executor
      if (this.executor) {
        await this.executor.shutdown();
        this.executor = undefined;
      }

      // Reinitialize
      await this.initialize(providerId, config);
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to restart service: ${error instanceof Error ? error.message : String(error)}`,
        'whisper-service',
        'RESTART_FAILED',
      );
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    try {
      if (this.executor) {
        await this.executor.shutdown();
        this.executor = undefined;
      }

      this.status.initialized = false;
      this.status.healthy = false;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to shutdown service: ${error instanceof Error ? error.message : String(error)}`,
        'whisper-service',
        'SHUTDOWN_FAILED',
      );
    }
  }

  /**
   * Get Docker deployment handler
   */
  getDockerDeployment(): WhisperDockerDeploymentHandler | undefined {
    if (!this.executor) {
      return undefined;
    }

    const executor = this.executor as InstanceType<typeof WhisperExecutor>;
    const deployment = executor.getDockerDeployment?.();

    if (!deployment) {
      return undefined;
    }

    // Wrap the deployment in a handler
    return new WhisperDockerDeploymentHandler({
      port: 8000,
    });
  }

  /**
   * Get system deployment handler
   */
  getSystemDeployment(): WhisperSystemDeploymentHandler | undefined {
    if (!this.executor) {
      return undefined;
    }

    const executor = this.executor as InstanceType<typeof WhisperExecutor>;
    const deployment = executor.getSystemDeployment?.();

    if (!deployment) {
      return undefined;
    }

    // Wrap the deployment in a handler
    return new WhisperSystemDeploymentHandler({
      modelSize: 'base',
    });
  }

  /**
   * Get service info
   */
  getInfo(): Record<string, unknown> {
    return {
      initialized: this.status.initialized,
      deploymentMode: this.status.deploymentMode,
      healthy: this.status.healthy,
      cacheDir: this.config.cacheDir,
      capabilities: this.status.capabilities,
      config: {
        cacheDir: this.config.cacheDir,
        workspaceDir: this.config.workspaceDir,
        downloadModelsOnInit: this.config.downloadModelsOnInit,
      },
      error: this.status.error,
    };
  }
}

/**
 * Global plugin service instance
 */
let globalService: WhisperPluginService | undefined;

/**
 * Get or create global plugin service
 */
export function getWhisperPluginService(
  config?: WhisperPluginServiceConfig,
): WhisperPluginService {
  if (!globalService) {
    globalService = new WhisperPluginService(config);
  }

  return globalService;
}

/**
 * Create a new plugin service instance
 */
export function createWhisperPluginService(
  config?: WhisperPluginServiceConfig,
): WhisperPluginService {
  return new WhisperPluginService(config);
}
