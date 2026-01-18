/**
 * Faster-Whisper Voice Provider Plugin Service
 *
 * Central service for Faster-Whisper STT provider lifecycle management.
 * Handles initialization, deployment selection, and provider registration.
 */

import { FasterWhisperExecutor } from './faster-whisper.js';
import { FasterWhisperDockerDeploymentHandler } from './faster-whisper.docker.js';
import { FasterWhisperSystemDeploymentHandler } from './faster-whisper.system.js';
import { VoiceProviderError } from './executor.js';
import type {
  VoiceProviderExecutor,
  ProviderCapabilities,
} from './executor.js';
import type { FasterWhisperConfig } from '../../config/types.voice.js';

/**
 * Deployment detection result
 */
interface DeploymentDetection {
  mode: 'docker' | 'system' | 'cloud';
  reason: string;
  available: boolean;
  error?: string;
}

/**
 * Plugin service configuration
 */
interface FasterWhisperPluginServiceConfig {
  autoDetectDeployment?: boolean;
  preferredDeployment?: 'docker' | 'system' | 'cloud';
  autoStartDocker?: boolean;
  downloadModelsOnInit?: boolean;
  cacheDir?: string;
  workspaceDir?: string;
}

/**
 * Service status
 */
interface FasterWhisperPluginServiceStatus {
  initialized: boolean;
  deploymentMode: 'docker' | 'system' | 'cloud';
  healthy: boolean;
  executor?: VoiceProviderExecutor;
  capabilities?: ProviderCapabilities;
  error?: string;
}

/**
 * Faster-Whisper Plugin Service
 *
 * Manages the complete lifecycle of the Faster-Whisper provider.
 */
export class FasterWhisperPluginService {
  private executor?: FasterWhisperExecutor;
  private status: FasterWhisperPluginServiceStatus = {
    initialized: false,
    deploymentMode: 'system',
    healthy: false,
  };

  private config: Required<FasterWhisperPluginServiceConfig>;

  constructor(config: FasterWhisperPluginServiceConfig = {}) {
    this.config = {
      autoDetectDeployment: config.autoDetectDeployment ?? true,
      preferredDeployment: config.preferredDeployment ?? 'system',
      autoStartDocker: config.autoStartDocker ?? false,
      downloadModelsOnInit: config.downloadModelsOnInit ?? true,
      cacheDir:
        config.cacheDir || `${process.env.HOME}/.cache/faster-whisper`,
      workspaceDir: config.workspaceDir || process.cwd(),
    };
  }

  /**
   * Initialize the Faster-Whisper plugin service
   */
  async initialize(
    providerId: string,
    config: FasterWhisperConfig,
  ): Promise<void> {
    try {
      // Detect deployment mode if needed
      if (this.config.autoDetectDeployment) {
        const detection = await this.detectDeploymentMode();

        if (detection.available) {
          process.env.FASTER_WHISPER_DEPLOYMENT = detection.mode;
          this.status.deploymentMode = detection.mode;
        }
      }

      // Set cache directory
      if (this.config.cacheDir) {
        process.env.FASTER_WHISPER_CACHE_PATH = this.config.cacheDir;
      }

      // Create executor
      this.executor = new FasterWhisperExecutor(providerId, config);

      // Initialize executor
      await this.executor.initialize();

      this.status.initialized = true;
      this.status.executor = this.executor;
      this.status.capabilities = this.executor.getCapabilities();

      // Check health
      const healthy = await this.executor.isHealthy();
      this.status.healthy = healthy;

      if (!healthy) {
        console.warn(
          'Faster-Whisper executor is not healthy after initialization',
        );
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

      console.warn(
        'Docker not available, falling back to system deployment',
      );
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

    // Fall back to cloud
    return {
      mode: 'cloud',
      reason: 'Local deployments unavailable, falling back to cloud',
      available: true,
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

      // Check Faster-Whisper
      execSync('python3 -m pip show faster-whisper', { stdio: 'ignore' });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get service status
   */
  getStatus(): FasterWhisperPluginServiceStatus {
    return { ...this.status };
  }

  /**
   * Get executor
   */
  getExecutor(): FasterWhisperExecutor | undefined {
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
    config: FasterWhisperConfig,
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
        'faster-whisper-service',
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
        'faster-whisper-service',
        'SHUTDOWN_FAILED',
      );
    }
  }

  /**
   * Get Docker deployment handler
   */
  getDockerDeployment(): FasterWhisperDockerDeploymentHandler | undefined {
    if (!this.executor) {
      return undefined;
    }

    // Wrap the deployment in a handler
    return new FasterWhisperDockerDeploymentHandler({
      port: 8001,
    });
  }

  /**
   * Get system deployment handler
   */
  getSystemDeployment(): FasterWhisperSystemDeploymentHandler | undefined {
    if (!this.executor) {
      return undefined;
    }

    // Wrap the deployment in a handler
    return new FasterWhisperSystemDeploymentHandler({
      modelSize: 'base',
      computeType: 'int8',
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
let globalService: FasterWhisperPluginService | undefined;

/**
 * Get or create global plugin service
 */
export function getFasterWhisperPluginService(
  config?: FasterWhisperPluginServiceConfig,
): FasterWhisperPluginService {
  if (!globalService) {
    globalService = new FasterWhisperPluginService(config);
  }

  return globalService;
}

/**
 * Create a new plugin service instance
 */
export function createFasterWhisperPluginService(
  config?: FasterWhisperPluginServiceConfig,
): FasterWhisperPluginService {
  return new FasterWhisperPluginService(config);
}
