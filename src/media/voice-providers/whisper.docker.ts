/**
 * Whisper Docker Deployment Handler
 *
 * Manages Docker container lifecycle for Whisper STT service.
 * Handles container setup, port discovery, health monitoring, and transcription.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AudioBuffer,
  TranscribeOptions,
  TranscriptionResult,
} from './executor.js';
import { AudioFormat, VoiceProviderError } from './executor.js';

const execAsync = promisify(exec);

/**
 * Docker deployment configuration
 */
interface DockerDeploymentConfig {
  port: number;
  dockerImage: string;
  containerName: string;
  modelSize: string;
}

/**
 * Container status information
 */
interface ContainerStatus {
  running: boolean;
  containerId?: string;
  port?: number;
  error?: string;
}

/**
 * Whisper Docker deployment handler
 */
export class WhisperDockerDeploymentHandler {
  private containerRunning = false;
  private containerId?: string;
  private apiBaseUrl: string;
  private config: DockerDeploymentConfig;
  private healthCheckInterval?: NodeJS.Timer;
  private assignedPort: number | null = null;

  constructor(config: Partial<DockerDeploymentConfig> = {}) {
    this.config = {
      port: config.port || 8000,
      dockerImage:
        config.dockerImage || 'fedirz/faster-whisper-server:latest-cpu',
      containerName: config.containerName || 'whisper-stt',
      modelSize: config.modelSize || 'base',
    };

    this.apiBaseUrl = `http://localhost:${this.config.port}`;
  }

  /**
   * Start Whisper Docker container
   */
  async start(): Promise<void> {
    try {
      // Check if container already exists and is running
      const status = await this.getContainerStatus();

      if (status.running && status.containerId) {
        this.containerRunning = true;
        this.containerId = status.containerId;
        if (status.port) {
          this.assignedPort = status.port;
          this.updateApiUrl();
        }
        return;
      }

      // Pull the Docker image
      await this.ensureImageAvailable();

      // Create and start the container
      await this.createAndStartContainer();

      // Discover assigned port
      await this.getAssignedPortFromContainer();

      // Wait for API to be ready
      await this.waitForApiReady();

      this.containerRunning = true;

      // Start periodic health checks
      this.startHealthCheckInterval();
    } catch (error) {
      this.containerRunning = false;
      throw new VoiceProviderError(
        `Failed to start Docker container: ${error instanceof Error ? error.message : String(error)}`,
        'whisper-docker',
        'START_FAILED',
      );
    }
  }

  /**
   * Stop and remove Whisper Docker container
   */
  async stop(): Promise<void> {
    try {
      // Stop health check interval
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval as unknown as number);
        this.healthCheckInterval = undefined;
      }

      if (!this.containerId) {
        const status = await this.getContainerStatus();
        if (!status.containerId) {
          return;
        }
        this.containerId = status.containerId;
      }

      // Try graceful stop first
      try {
        await execAsync(`docker stop ${this.containerId}`);
      } catch {
        // If graceful stop fails, force kill
        await execAsync(`docker kill ${this.containerId}`);
      }

      // Remove the container
      await execAsync(`docker rm ${this.containerId}`);

      this.containerRunning = false;
      this.containerId = undefined;
      this.assignedPort = null;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to stop Docker container: ${error instanceof Error ? error.message : String(error)}`,
        'whisper-docker',
        'STOP_FAILED',
      );
    }
  }

  /**
   * Get container status
   */
  private async getContainerStatus(): Promise<ContainerStatus> {
    try {
      const { stdout } = await execAsync(
        `docker ps -a --filter "name=${this.config.containerName}" --format "{{.ID}}|{{.Status}}"`,
      );

      const lines = stdout.trim().split('\n').filter((l) => l);

      if (lines.length === 0) {
        return { running: false };
      }

      const [containerId, status] = lines[0].split('|');

      if (!containerId) {
        return { running: false };
      }

      const isRunning = status?.includes('Up');

      return {
        running: isRunning,
        containerId,
        port: this.config.port,
      };
    } catch (error) {
      return {
        running: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ensure Docker image is available (pull)
   */
  private async ensureImageAvailable(): Promise<void> {
    await execAsync(`docker pull ${this.config.dockerImage}`);
  }

  /**
   * Create and start Docker container
   */
  private async createAndStartContainer(): Promise<void> {
    const runCommand = [
      'docker run',
      '-d',
      `--name ${this.config.containerName}`,
      `-p ${this.config.port}:8000`,
      `-e WHISPER_MODEL=${this.config.modelSize}`,
      this.config.dockerImage,
    ].join(' ');

    const { stdout } = await execAsync(runCommand);
    this.containerId = stdout.trim();

    if (!this.containerId) {
      throw new Error('Failed to start container - no ID returned');
    }
  }

  /**
   * Get assigned port from running container
   */
  private async getAssignedPortFromContainer(): Promise<void> {
    if (!this.containerId) {
      throw new Error('Container ID not found');
    }

    try {
      const { stdout } = await execAsync(
        `docker inspect ${this.containerId} --format='{{range .NetworkSettings.Ports}}{{index (split (index (split .[] "/") 0) ":") 1}}{{end}}'`,
      );

      const portStr = stdout.trim();
      const port = parseInt(portStr, 10);

      if (!Number.isNaN(port) && port > 0) {
        this.assignedPort = port;
        this.updateApiUrl();
      } else {
        // Fallback to configured port
        this.assignedPort = this.config.port;
      }
    } catch (error) {
      // Fallback to configured port on error
      this.assignedPort = this.config.port;
    }
  }

  /**
   * Update API URL based on assigned port
   */
  private updateApiUrl(): void {
    if (this.assignedPort) {
      this.apiBaseUrl = `http://localhost:${this.assignedPort}`;
    }
  }

  /**
   * Wait for API to be ready
   */
  private async waitForApiReady(
    maxAttempts: number = 30,
    delayMs: number = 1000,
  ): Promise<void> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${this.apiBaseUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          return;
        }
      } catch {
        // API not ready yet
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempts++;
    }

    throw new Error('API did not become ready in time');
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheckInterval(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, 30000); // Check every 30 seconds

    // Don't keep process alive
    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Transcribe audio via Docker API
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    if (!this.containerRunning) {
      throw new VoiceProviderError(
        'Docker container is not running',
        'whisper-docker',
        'CONTAINER_NOT_RUNNING',
      );
    }

    try {
      const formData = new FormData();

      // Add audio as WAV blob
      const buffer = audio.data.buffer.slice(0);
      formData.append(
        'file',
        new Blob([buffer as ArrayBuffer], { type: 'audio/wav' }),
        'audio.wav',
      );

      // Add optional parameters
      if (options?.language) {
        formData.append('language', options.language);
      }

      const response = await fetch(
        `${this.apiBaseUrl}/v1/audio/transcriptions`,
        {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(options?.timeout || 60000),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.statusText} - ${errorText}`);
      }

      const result = (await response.json()) as {
        text: string;
        language?: string;
        duration?: number;
        confidence?: number;
      };

      return {
        text: result.text,
        language: result.language || options?.language,
        duration: result.duration || audio.duration,
        confidence: result.confidence,
        provider: 'whisper-docker',
      };
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message.includes('fetch failed')
      ) {
        throw new VoiceProviderError(
          'Failed to connect to Whisper API',
          'whisper-docker',
          'CONNECTION_FAILED',
        );
      }

      throw new VoiceProviderError(
        `Docker transcription failed: ${error instanceof Error ? error.message : String(error)}`,
        'whisper-docker',
        'TRANSCRIPTION_FAILED',
      );
    }
  }

  /**
   * Get container logs
   */
  async getLogs(lines: number = 50): Promise<string> {
    if (!this.containerId) {
      throw new Error('Container not found');
    }

    const { stdout } = await execAsync(
      `docker logs --tail ${lines} ${this.containerId}`,
    );

    return stdout;
  }

  /**
   * Get API base URL
   */
  getApiUrl(): string {
    return this.apiBaseUrl;
  }

  /**
   * Get deployment config
   */
  getConfig(): DockerDeploymentConfig {
    return { ...this.config };
  }

  /**
   * Check if container is running
   */
  isRunning(): boolean {
    return this.containerRunning;
  }

  /**
   * Get container ID
   */
  getContainerId(): string | undefined {
    return this.containerId;
  }

  /**
   * Get assigned port number
   */
  getAssignedPortNumber(): number | null {
    return this.assignedPort;
  }
}
