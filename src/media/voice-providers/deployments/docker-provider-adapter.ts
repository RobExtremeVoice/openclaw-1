/**
 * Docker Provider Adapter
 *
 * Adapts generic deployment configurations to provider-specific Docker parameters.
 * Handles automatic port allocation, volume management, and environment setup.
 * Supports multiple voice providers: Kokoro, Faster-Whisper, Chatterbox, Whisper, Deepgram.
 */

import { DockerHandler } from './docker-handler.js';
import type { DockerProviderConfig } from './docker-handler.js';
import { VoiceProviderError } from '../executor.js';

// Re-export for convenience
export type { DockerProviderConfig };

/**
 * Provider-specific Docker configuration templates
 */
export interface ProviderDockerTemplate {
  providerName: string;
  defaultImage: string;
  defaultPort: number;
  containerPortInternal: number;
  healthCheckPath: string;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  volumeMountPaths: Record<string, string>;
  environmentVariables: Record<string, string>;
  gpuSupport: boolean;
  cpuLimit: string;
  memoryLimit: string;
}

/**
 * Predefined templates for popular voice providers
 */
export const PROVIDER_TEMPLATES: Record<string, ProviderDockerTemplate> = {
  'faster-whisper': {
    providerName: 'faster-whisper',
    defaultImage: 'fedirz/faster-whisper-server:latest-cpu',
    defaultPort: 8001,
    containerPortInternal: 8000,
    healthCheckPath: '/health',
    healthCheckInterval: 30000,
    healthCheckTimeout: 10000,
    volumeMountPaths: {
      models: '/root/.cache/huggingface',
    },
    environmentVariables: {
      LOG_LEVEL: 'INFO',
      DEFAULT_MODEL_SIZE: 'base',
      COMPUTE_TYPE: 'int8',
    },
    gpuSupport: true,
    cpuLimit: '4',
    memoryLimit: '4g',
  },
  'chatterbox': {
    providerName: 'chatterbox',
    defaultImage: 'chatterbox-tts:latest',
    defaultPort: 5000,
    containerPortInternal: 5000,
    healthCheckPath: '/api/v1/health',
    healthCheckInterval: 30000,
    healthCheckTimeout: 10000,
    volumeMountPaths: {
      models: '/app/models',
      cache: '/app/cache',
    },
    environmentVariables: {
      API_PORT: '5000',
      DEVICE: 'cpu',
      MODEL_DIR: '/app/models',
    },
    gpuSupport: true,
    cpuLimit: '2',
    memoryLimit: '2g',
  },
  'whisper': {
    providerName: 'whisper',
    defaultImage: 'openai/whisper:latest',
    defaultPort: 8002,
    containerPortInternal: 8000,
    healthCheckPath: '/health',
    healthCheckInterval: 30000,
    healthCheckTimeout: 10000,
    volumeMountPaths: {
      models: '/root/.cache/whisper',
    },
    environmentVariables: {
      MODEL: 'base',
      DEVICE: 'cpu',
      DEVICE_INDEX: '0',
    },
    gpuSupport: true,
    cpuLimit: '4',
    memoryLimit: '8g',
  },
  'deepgram': {
    providerName: 'deepgram',
    defaultImage: 'deepgram-self-hosted:latest',
    defaultPort: 8003,
    containerPortInternal: 8080,
    healthCheckPath: '/v1/health',
    healthCheckInterval: 30000,
    healthCheckTimeout: 10000,
    volumeMountPaths: {
      models: '/app/models',
    },
    environmentVariables: {
      PORT: '8080',
      LOG_LEVEL: 'INFO',
    },
    gpuSupport: false,
    cpuLimit: '4',
    memoryLimit: '8g',
  },
  'kokoro': {
    providerName: 'kokoro',
    defaultImage: 'kokoro:latest',
    defaultPort: 8000,
    containerPortInternal: 8880,
    healthCheckPath: '/health',
    healthCheckInterval: 30000,
    healthCheckTimeout: 10000,
    volumeMountPaths: {
      models: '/app/models',
    },
    environmentVariables: {},
    gpuSupport: true,
    cpuLimit: '2',
    memoryLimit: '2g',
  },
};

/**
 * Port allocation manager for tracking and preventing conflicts
 */
export class PortAllocator {
  private allocatedPorts: Set<number> = new Set();
  private readonly minPort = 8000;
  private readonly maxPort = 9000;

  /**
   * Allocate a port, avoiding conflicts with already-used ports
   */
  allocatePort(preferredPort?: number): number {
    let startPort = this.minPort;

    // If preferred port is available, use it
    if (preferredPort !== undefined && !this.allocatedPorts.has(preferredPort)) {
      this.allocatedPorts.add(preferredPort);
      return preferredPort;
    }

    // If preferred port is taken, start search from preferred + 1
    if (preferredPort !== undefined && this.allocatedPorts.has(preferredPort)) {
      startPort = preferredPort + 1;
    }

    for (let port = startPort; port <= this.maxPort; port++) {
      if (!this.allocatedPorts.has(port)) {
        this.allocatedPorts.add(port);
        return port;
      }
    }

    throw new VoiceProviderError(
      `No available ports in range ${this.minPort}-${this.maxPort}`,
      'docker-provider-adapter',
      'PORT_ALLOCATION_FAILED',
    );
  }

  /**
   * Release an allocated port
   */
  releasePort(port: number): void {
    this.allocatedPorts.delete(port);
  }

  /**
   * Check if a port is allocated
   */
  isAllocated(port: number): boolean {
    return this.allocatedPorts.has(port);
  }

  /**
   * Get all allocated ports
   */
  getAllocatedPorts(): number[] {
    return Array.from(this.allocatedPorts).sort((a, b) => a - b);
  }
}

/**
 * Volume manager for tracking and managing Docker volumes
 */
export class VolumeManager {
  private namedVolumes: Map<string, string> = new Map();
  private readonly baseVolumeName = 'voice-provider';

  /**
   * Create or get a named volume for model caching
   */
  getOrCreateModelVolume(providerId: string): string {
    const volumeName = `${this.baseVolumeName}-${providerId}-models`;

    if (!this.namedVolumes.has(providerId)) {
      this.namedVolumes.set(providerId, volumeName);
    }

    return this.namedVolumes.get(providerId)!;
  }

  /**
   * Get mount path configuration for a provider
   */
  getMountPaths(providerId: string, template: ProviderDockerTemplate): Record<string, string> {
    const mounts: Record<string, string> = {};
    const modelVolume = this.getOrCreateModelVolume(providerId);

    // Use named volume for model caching
    if (template.volumeMountPaths.models) {
      mounts[modelVolume] = template.volumeMountPaths.models;
    }

    // Add other volume mounts
    for (const [key, containerPath] of Object.entries(template.volumeMountPaths)) {
      if (key !== 'models') {
        const volumeName = `${this.baseVolumeName}-${providerId}-${key}`;
        mounts[volumeName] = containerPath;
      }
    }

    return mounts;
  }

  /**
   * Clean up volumes for a provider (useful for cleanup)
   */
  removeProviderVolumes(providerId: string): string[] {
    const volumesToRemove: string[] = [];

    for (const [key, volumeName] of this.namedVolumes) {
      if (key.startsWith(providerId)) {
        volumesToRemove.push(volumeName);
      }
    }

    for (const key of volumesToRemove) {
      this.namedVolumes.delete(key);
    }

    return volumesToRemove;
  }
}

/**
 * Docker Provider Adapter
 *
 * Manages Docker deployment for voice providers with automatic configuration.
 */
export class DockerProviderAdapter {
  private portAllocator: PortAllocator;
  private volumeManager: VolumeManager;
  private handlers: Map<string, DockerHandler> = new Map();

  constructor() {
    this.portAllocator = new PortAllocator();
    this.volumeManager = new VolumeManager();
  }

  /**
   * Create a Docker handler for a specific provider instance
   */
  async createProviderInstance(
    providerId: string,
    providerType: string,
    customConfig?: Partial<DockerProviderConfig>,
  ): Promise<DockerHandler> {
    const template = PROVIDER_TEMPLATES[providerType];

    if (!template) {
      throw new VoiceProviderError(
        `Unknown provider type: ${providerType}. Supported: ${Object.keys(PROVIDER_TEMPLATES).join(', ')}`,
        'docker-provider-adapter',
        'UNKNOWN_PROVIDER',
      );
    }

    // Allocate port for this instance
    const hostPort = this.portAllocator.allocatePort(customConfig?.port);

    // Build configuration
    const config: DockerProviderConfig = {
      image: customConfig?.image || template.defaultImage,
      port: hostPort,
      containerName: customConfig?.containerName || `${providerType}-${providerId}`,
      volumes: {
        ...this.volumeManager.getMountPaths(providerId, template),
        ...customConfig?.volumes,
      },
      env: {
        ...template.environmentVariables,
        ...customConfig?.env,
      },
      healthCheck: {
        endpoint: `http://127.0.0.1:${hostPort}${template.healthCheckPath}`,
        interval: customConfig?.healthCheck?.interval ?? template.healthCheckInterval,
        timeout: customConfig?.healthCheck?.timeout ?? template.healthCheckTimeout,
      },
      gpuEnabled: customConfig?.gpuEnabled ?? template.gpuSupport,
      cpuLimit: customConfig?.cpuLimit || template.cpuLimit,
      memoryLimit: customConfig?.memoryLimit || template.memoryLimit,
    };

    // Create handler
    const handler = new DockerHandler(config.image, config.port);

    // Store reference
    this.handlers.set(providerId, handler);

    console.log(
      `[Docker Provider Adapter] Created ${providerType} instance '${providerId}' on port ${hostPort}`,
    );

    return handler;
  }

  /**
   * Get an existing handler by provider ID
   */
  getHandler(providerId: string): DockerHandler | undefined {
    return this.handlers.get(providerId);
  }

  /**
   * Remove a provider instance and clean up resources
   */
  removeProviderInstance(providerId: string): void {
    const handler = this.handlers.get(providerId);

    if (handler) {
      const containerId = handler.getRunningContainerId();
      if (containerId) {
        console.log(
          `[Docker Provider Adapter] Stopping container ${containerId} for provider '${providerId}'`,
        );
        handler.stopContainer(containerId).catch((err) => {
          console.error(`Failed to stop container: ${err}`);
        });
      }

      this.handlers.delete(providerId);
    }

    // Release port
    const port = handler?.getAssignedPortNumber();
    if (port) {
      this.portAllocator.releasePort(port);
    }

    // Clean up volumes
    this.volumeManager.removeProviderVolumes(providerId);

    console.log(
      `[Docker Provider Adapter] Cleaned up resources for provider '${providerId}'`,
    );
  }

  /**
   * Get a template for a provider type
   */
  getTemplate(providerType: string): ProviderDockerTemplate {
    const template = PROVIDER_TEMPLATES[providerType];

    if (!template) {
      throw new VoiceProviderError(
        `Unknown provider type: ${providerType}`,
        'docker-provider-adapter',
        'UNKNOWN_PROVIDER',
      );
    }

    return template;
  }

  /**
   * List all registered provider templates
   */
  listAvailableProviders(): string[] {
    return Object.keys(PROVIDER_TEMPLATES);
  }

  /**
   * Get all active provider instances
   */
  getActiveInstances(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Cleanup all handlers and release all resources
   */
  async cleanup(): Promise<void> {
    const providerIds = Array.from(this.handlers.keys());

    for (const providerId of providerIds) {
      try {
        const handler = this.handlers.get(providerId);
        if (handler) {
          const containerId = handler.getRunningContainerId();
          if (containerId) {
            await handler.stopContainer(containerId);
          }
        }
      } catch (error) {
        console.error(
          `Error cleaning up provider '${providerId}':`,
          error instanceof Error ? error.message : String(error),
        );
      }

      this.removeProviderInstance(providerId);
    }

    console.log('[Docker Provider Adapter] Cleanup complete');
  }
}

/**
 * Singleton instance for global provider adapter
 */
let adapterInstance: DockerProviderAdapter | null = null;

/**
 * Get or create the global Docker provider adapter
 */
export function getGlobalDockerProviderAdapter(): DockerProviderAdapter {
  if (!adapterInstance) {
    adapterInstance = new DockerProviderAdapter();
  }
  return adapterInstance;
}

/**
 * Reset the global adapter (useful for testing)
 */
export function resetGlobalDockerProviderAdapter(): void {
  adapterInstance = null;
}
