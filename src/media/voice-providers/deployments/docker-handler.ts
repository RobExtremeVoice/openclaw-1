/**
 * Docker Deployment Handler
 *
 * Manages voice provider deployment via Docker containers.
 * Handles image pulling, container lifecycle, health checking, and port allocation.
 * Supports multiple providers: Kokoro, Faster-Whisper, Chatterbox, Whisper, etc.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import type { DeploymentConfig } from '../kokoro.js';
import { VoiceProviderError } from '../executor.js';
import type { DockerDeploymentHandler } from './docker-handler.spec.js';

const execAsync = promisify(exec);

/**
 * Generic Docker provider configuration
 */
export interface DockerProviderConfig {
  image: string;
  port?: number;
  volumes?: Record<string, string>;
  env?: Record<string, string>;
  healthCheck?: {
    endpoint: string;
    interval?: number;
    timeout?: number;
  };
  containerName?: string;
  gpuEnabled?: boolean;
  cpuLimit?: string;
  memoryLimit?: string;
}

/**
 * Port allocation result
 */
export interface PortAllocationResult {
  containerPort: number;
  hostPort: number;
}

/**
 * Container state information
 */
export interface ContainerState {
  id: string;
  image: string;
  port: number;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
}

export class DockerHandler implements DockerDeploymentHandler {
  private runningContainerId: string | null = null;
  private readonly imageRef: string;
  private readonly port: number;
  private assignedPort: number | null = null;  // Actual port assigned by Docker

  constructor(imageRef: string = 'kokoro:latest', port: number = 8000) {
    this.imageRef = imageRef;
    this.port = port;
  }

  /**
   * Check if Docker is installed and available
   */
  async checkDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      return true;
    } catch (error) {
      console.warn('[Docker] Docker not available:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Pull Kokoro Docker image with retry logic
   */
  async pullImage(imageRef: string, retryCount: number = 3): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`[Docker] Pulling image ${imageRef} (attempt ${attempt}/${retryCount})`);
        await execAsync(`docker pull ${imageRef}`);
        console.log(`[Docker] Successfully pulled image ${imageRef}`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        if (attempt < retryCount) {
          console.warn(
            `[Docker] Pull failed (attempt ${attempt}/${retryCount}), retrying in ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new VoiceProviderError(
      `Failed to pull image ${imageRef} after ${retryCount} attempts: ${lastError?.message || 'Unknown error'}`,
      'kokoro-docker',
      'IMAGE_PULL_FAILED',
    );
  }

  /**
   * Start Kokoro Docker container
   */
  async startContainer(config: DeploymentConfig['docker']): Promise<string> {
    if (!config) {
      throw new VoiceProviderError(
        'Docker configuration is required',
        'kokoro-docker',
        'INVALID_CONFIG',
      );
    }

    // Check Docker availability first
    if (!(await this.checkDockerAvailable())) {
      throw new VoiceProviderError(
        'Docker is not installed or not available',
        'kokoro-docker',
        'DOCKER_NOT_INSTALLED',
      );
    }

    try {
      // Pull image
      await this.pullImage(config.image);

      // Build docker run command
      // Kokoro FastAPI image runs on port 8880 internally, not 8000
      // Use -p 0:8880 to let Docker automatically assign an available host port
      const portMapping = '-p 0:8880';
      const volumeFlags = config.volumes
        ? Object.entries(config.volumes)
            .map(([host, container]) => `-v ${host}:${container}`)
            .join(' ')
        : '';
      const envFlags = config.env
        ? Object.entries(config.env)
            .map(([key, value]) => `-e ${key}="${value}"`)
            .join(' ')
        : '';

      const runCommand = `docker run -d ${portMapping} ${volumeFlags} ${envFlags} ${config.image}`;

      console.log('[Docker] Starting container...');
      const { stdout } = await execAsync(runCommand);
      const containerId = stdout.trim();

      if (!containerId) {
        throw new Error('No container ID returned from docker run');
      }

      console.log(`[Docker] Container started: ${containerId}`);
      this.runningContainerId = containerId;

      // Verify container is actually running
      const status = await this.getContainerStatus(containerId);
      if (status !== 'running') {
        throw new Error(`Container failed to start, status: ${status}`);
      }

      // Query Docker to find the assigned port
      const assignedPort = await this.getAssignedPort(containerId);
      this.assignedPort = assignedPort;
      console.log(`[Docker] Container port 8880 mapped to host port ${assignedPort}`);

      // Wait for health check with dynamically discovered port
      const healthEndpoint = `http://127.0.0.1:${assignedPort}/health`;
      console.log(`[Docker] Waiting for health check at ${healthEndpoint}`);
      await this.waitForHealthy(healthEndpoint, 60000);

      return containerId;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to start container: ${error instanceof Error ? error.message : String(error)}`,
        'kokoro-docker',
        'CONTAINER_STARTUP_FAILED',
      );
    }
  }

  /**
   * Wait for service to be healthy via HTTP health check
   */
  async waitForHealthy(endpoint: string, maxWaitMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const pollIntervalMs = 2000;  // Increased from 1000ms to give container more time to start
    let attemptCount = 0;

    console.log(`[Docker] Waiting for health check at ${endpoint} (max ${maxWaitMs}ms)`);

    while (Date.now() - startTime < maxWaitMs) {
      attemptCount++;
      try {
        console.log(`[Docker] Health check attempt ${attemptCount}...`);
        await this.checkHealthEndpoint(endpoint);
        console.log('[Docker] Health check passed');
        return;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[Docker] Health check attempt ${attemptCount} failed: ${errorMsg} (${elapsed}ms elapsed)`);

        if (elapsed + pollIntervalMs >= maxWaitMs) {
          throw new VoiceProviderError(
            `Health check timeout after ${maxWaitMs}ms (${attemptCount} attempts): ${errorMsg}`,
            'kokoro-docker',
            'HEALTH_CHECK_TIMEOUT',
          );
        }

        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new VoiceProviderError(
      `Health check timeout after ${maxWaitMs}ms (${attemptCount} attempts)`,
      'kokoro-docker',
      'HEALTH_CHECK_TIMEOUT',
    );
  }

  /**
   * HTTP health check to endpoint
   * Kokoro provides /health endpoint that returns {"status":"healthy"}
   * Verifies connectivity and checks for 2xx status code
   */
  private checkHealthEndpoint(endpoint: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(endpoint);

        // Extract and convert port to number (url.port is a string)
        const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);

        // Use 127.0.0.1 instead of localhost for better reliability
        const hostname = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;

        // Use the path from the endpoint URL (e.g., /health)
        const path = url.pathname || '/';

        console.log(`[Docker] Health check: GET ${hostname}:${port}${path}`);

        const options = {
          hostname: hostname,
          port: port,
          path: path,
          method: 'GET',
          timeout: 5000,
        };

        const request = http.get(options, (response) => {
          console.log(`[Docker] Health check response: ${response.statusCode}`);
          let resolved = false;

          // Consider 2xx responses as healthy
          if ((response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300) {
            resolved = true;
            // Consume the response to properly close the connection
            response.on('data', () => {});
            response.on('end', () => {
              if (!resolved) return;
              resolve();
            });
            response.on('error', () => {
              // Even if there's an error, we got a 2xx response, so consider it healthy
              resolve();
            });
          } else {
            // Consume the response
            response.on('data', () => {});
            response.on('end', () => {
              reject(new Error(`Health check returned status ${response.statusCode}`));
            });
            response.on('error', (err) => {
              reject(err);
            });
          }
        });

        request.on('error', (error) => {
          console.log(`[Docker] Health check error: ${error.message}`);
          reject(error);
        });

        request.on('timeout', () => {
          request.destroy();
          reject(new Error('Health check timeout'));
        });

        request.on('socket', (socket) => {
          console.log(`[Docker] Health check socket connected to ${hostname}:${port}`);
        });
      } catch (error) {
        console.log(`[Docker] Health check exception: ${error instanceof Error ? error.message : String(error)}`);
        reject(error);
      }
    });
  }

  /**
   * Stop and remove container
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      console.log(`[Docker] Stopping container ${containerId}...`);

      // Try graceful stop with timeout
      try {
        await execAsync(`docker stop -t 10 ${containerId}`);
      } catch (stopError) {
        console.warn('[Docker] Graceful stop failed, forcing kill...');
        await execAsync(`docker kill ${containerId}`);
      }

      // Remove container
      try {
        await execAsync(`docker rm ${containerId}`);
      } catch (rmError) {
        console.warn('[Docker] Failed to remove container:', rmError instanceof Error ? rmError.message : String(rmError));
      }

      console.log(`[Docker] Container ${containerId} stopped and removed`);
      if (this.runningContainerId === containerId) {
        this.runningContainerId = null;
      }
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to stop container ${containerId}: ${error instanceof Error ? error.message : String(error)}`,
        'kokoro-docker',
        'CONTAINER_SHUTDOWN_FAILED',
      );
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus(
    containerId: string,
  ): Promise<'running' | 'stopped' | 'error'> {
    try {
      const { stdout } = await execAsync(`docker ps -f id=${containerId} --format "{{.State}}"`);
      const state = stdout.trim().toLowerCase();

      if (state === 'running') {
        return 'running';
      }
      if (state === 'exited' || state === '') {
        return 'stopped';
      }
      return 'error';
    } catch (error) {
      return 'error';
    }
  }

  /**
   * Query Docker to find the assigned host port for internal port 8880
   */
  private async getAssignedPort(containerId: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{index .NetworkSettings.Ports "8880/tcp" 0 "HostPort"}}' ${containerId}`
      );
      const port = parseInt(stdout.trim(), 10);
      if (Number.isNaN(port)) {
        throw new Error(`Invalid port number: ${stdout.trim()}`);
      }
      return port;
    } catch (error) {
      throw new Error(
        `Failed to get assigned port for container ${containerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get running container ID
   */
  getRunningContainerId(): string | null {
    return this.runningContainerId;
  }

  /**
   * Get the actual port assigned by Docker
   */
  getAssignedPortNumber(): number | null {
    return this.assignedPort;
  }

  /**
   * Synthesize audio via HTTP streaming endpoint
   * @param text - Text to synthesize
   * @param options - Voice options (voice, speed, etc.)
   * @returns ReadableStream of audio chunks
   */
  async synthesizeStream(
    text: string,
    options?: { voice?: string; speed?: number; language?: string },
  ): Promise<ReadableStream<Uint8Array>> {
    // Kokoro FastAPI endpoint: /v1/audio/speech (OpenAI-compatible)
    // Use the actual assigned port from Docker, not the configured port
    const hostPort = this.assignedPort || this.port;
    const url = `http://localhost:${hostPort}/v1/audio/speech`;

    const requestBody = JSON.stringify({
      input: text,
      voice: options?.voice || 'af_heart',
      speed: options?.speed || 1.0,
      response_format: 'wav',
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Kokoro returns binary WAV audio data directly
      // Just pass through the byte stream as-is
      return response.body as ReadableStream<Uint8Array>;
    } catch (error) {
      throw new VoiceProviderError(
        `Stream synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
        'kokoro-docker',
        'STREAM_SYNTHESIS_FAILED',
      );
    }
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    if (this.runningContainerId) {
      await this.stopContainer(this.runningContainerId);
    }
  }
}
