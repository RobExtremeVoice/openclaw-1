/**
 * Deepgram Docker Deployment Handler
 *
 * Manages Deepgram deployment via Docker containers with WebSocket streaming.
 * Handles image pulling, container lifecycle, WebSocket server setup, and health checking.
 *
 * Key Features:
 * - Automatic port assignment for WebSocket server (-p 0:8888)
 * - WebSocket connection pooling
 * - Message framing and streaming audio handling
 * - Proper connection lifecycle management
 * - Health checking via HTTP endpoint
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import WebSocket from 'ws';
import type { DeploymentConfig } from '../kokoro.js';
import { VoiceProviderError } from '../executor.js';

const execAsync = promisify(exec);

/**
 * Deepgram Docker deployment configuration
 */
export interface DeepgramDockerConfig {
  image: string;
  port: number;
  volumes?: Record<string, string>;
  env?: Record<string, string>;
  wsPort?: number; // WebSocket server port (default 8888)
  healthCheckPort?: number; // Health check HTTP port (default 8889)
  model?: 'nova-v3' | 'flux';
  apiKey?: string;
}

/**
 * WebSocket connection pool entry
 */
interface PooledConnection {
  ws: WebSocket;
  createdAt: number;
  lastUsed: number;
  isHealthy: boolean;
}

/**
 * Deepgram Docker Handler Implementation
 */
export class DeepgramDockerHandler {
  private runningContainerId: string | null = null;
  private readonly imageRef: string;
  private readonly wsPort: number;
  private readonly healthCheckPort: number;
  private assignedWsPort: number | null = null;
  private assignedHealthPort: number | null = null;
  private connectionPool: Map<string, PooledConnection[]> = new Map();
  private readonly maxPoolSize: number = 10;
  private readonly connectionTimeout: number = 30000; // 30 seconds
  private readonly poolCleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    imageRef: string = 'deepgram:latest',
    wsPort: number = 8888,
    healthCheckPort: number = 8889,
  ) {
    this.imageRef = imageRef;
    this.wsPort = wsPort;
    this.healthCheckPort = healthCheckPort;

    // Start periodic pool cleanup
    this.setupPoolCleanup();
  }

  /**
   * Setup periodic cleanup of stale connections in the pool
   */
  private setupPoolCleanup(): void {
    // Note: In production, implement actual cleanup
    // This is a placeholder for connection pool maintenance
  }

  /**
   * Check if Docker is installed and available
   */
  async checkDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      return true;
    } catch (error) {
      console.warn(
        '[DeepgramDocker] Docker not available:',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  /**
   * Pull Deepgram Docker image with retry logic
   */
  async pullImage(imageRef: string, retryCount: number = 3): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(
          `[DeepgramDocker] Pulling image ${imageRef} (attempt ${attempt}/${retryCount})`,
        );
        await execAsync(`docker pull ${imageRef}`);
        console.log(`[DeepgramDocker] Successfully pulled image ${imageRef}`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        if (attempt < retryCount) {
          console.warn(
            `[DeepgramDocker] Pull failed (attempt ${attempt}/${retryCount}), retrying in ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new VoiceProviderError(
      `Failed to pull image ${imageRef} after ${retryCount} attempts: ${lastError?.message || 'Unknown error'}`,
      'deepgram-docker',
      'IMAGE_PULL_FAILED',
    );
  }

  /**
   * Start Deepgram Docker container with WebSocket server
   */
  async startContainer(config: DeepgramDockerConfig): Promise<string> {
    if (!config) {
      throw new VoiceProviderError(
        'Docker configuration is required',
        'deepgram-docker',
        'INVALID_CONFIG',
      );
    }

    // Check Docker availability first
    if (!(await this.checkDockerAvailable())) {
      throw new VoiceProviderError(
        'Docker is not installed or not available',
        'deepgram-docker',
        'DOCKER_NOT_INSTALLED',
      );
    }

    try {
      // Pull image
      await this.pullImage(config.image);

      // Build docker run command
      // Deepgram WebSocket server runs on port 8888 internally
      // Use -p 0:8888 to let Docker automatically assign an available host port
      // Also expose health check port on 8889
      const wsPortMapping = '-p 0:8888';
      const healthPortMapping = '-p 0:8889';

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

      const runCommand = `docker run -d ${wsPortMapping} ${healthPortMapping} ${volumeFlags} ${envFlags} ${config.image}`;

      console.log('[DeepgramDocker] Starting container...');
      const { stdout } = await execAsync(runCommand);
      const containerId = stdout.trim();

      if (!containerId) {
        throw new Error('No container ID returned from docker run');
      }

      console.log(`[DeepgramDocker] Container started: ${containerId}`);
      this.runningContainerId = containerId;

      // Verify container is actually running
      const status = await this.getContainerStatus(containerId);
      if (status !== 'running') {
        throw new Error(`Container failed to start, status: ${status}`);
      }

      // Query Docker to find the assigned ports
      const assignedWsPort = await this.getAssignedPort(containerId, 8888);
      const assignedHealthPort = await this.getAssignedPort(containerId, 8889);

      this.assignedWsPort = assignedWsPort;
      this.assignedHealthPort = assignedHealthPort;

      console.log(
        `[DeepgramDocker] Container WebSocket port 8888 mapped to host port ${assignedWsPort}`,
      );
      console.log(
        `[DeepgramDocker] Container health port 8889 mapped to host port ${assignedHealthPort}`,
      );

      // Wait for health check
      const healthEndpoint = `http://127.0.0.1:${assignedHealthPort}/health`;
      console.log(`[DeepgramDocker] Waiting for health check at ${healthEndpoint}`);
      await this.waitForHealthy(healthEndpoint, 60000);

      return containerId;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to start container: ${error instanceof Error ? error.message : String(error)}`,
        'deepgram-docker',
        'CONTAINER_STARTUP_FAILED',
      );
    }
  }

  /**
   * Stop and remove Deepgram container
   */
  async stopContainer(): Promise<void> {
    if (!this.runningContainerId) {
      return;
    }

    try {
      console.log(`[DeepgramDocker] Stopping container ${this.runningContainerId}`);
      await execAsync(`docker stop ${this.runningContainerId}`);
      await execAsync(`docker rm ${this.runningContainerId}`);
      console.log(`[DeepgramDocker] Container stopped and removed`);
      this.runningContainerId = null;
      this.assignedWsPort = null;
      this.assignedHealthPort = null;
    } catch (error) {
      console.error(
        `[DeepgramDocker] Error stopping container: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus(containerId: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `docker inspect -f '{{.State.Status}}' ${containerId}`,
      );
      return stdout.trim().replace(/'/g, '');
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to get container status: ${error instanceof Error ? error.message : String(error)}`,
        'deepgram-docker',
        'CONTAINER_STATUS_FAILED',
      );
    }
  }

  /**
   * Get the assigned host port for a container port
   */
  async getAssignedPort(containerId: string, containerPort: number): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `docker inspect -f '{{(index (index .NetworkSettings.Ports "${containerPort}/tcp") 0).HostPort}}' ${containerId}`,
      );
      const port = parseInt(stdout.trim(), 10);
      if (isNaN(port)) {
        throw new Error(`Invalid port number: ${stdout}`);
      }
      return port;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to get assigned port: ${error instanceof Error ? error.message : String(error)}`,
        'deepgram-docker',
        'PORT_DISCOVERY_FAILED',
      );
    }
  }

  /**
   * Wait for service to be healthy via HTTP health check
   */
  async waitForHealthy(endpoint: string, maxWaitMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const pollIntervalMs = 2000;
    let attemptCount = 0;

    console.log(`[DeepgramDocker] Waiting for health check at ${endpoint} (max ${maxWaitMs}ms)`);

    while (Date.now() - startTime < maxWaitMs) {
      attemptCount++;
      try {
        console.log(`[DeepgramDocker] Health check attempt ${attemptCount}...`);
        await this.checkHealthEndpoint(endpoint);
        console.log('[DeepgramDocker] Health check passed');
        return;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(
          `[DeepgramDocker] Health check attempt ${attemptCount} failed: ${errorMsg} (${elapsed}ms elapsed)`,
        );

        if (elapsed + pollIntervalMs >= maxWaitMs) {
          throw new VoiceProviderError(
            `Health check timeout after ${maxWaitMs}ms (${attemptCount} attempts): ${errorMsg}`,
            'deepgram-docker',
            'HEALTH_CHECK_TIMEOUT',
          );
        }

        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new VoiceProviderError(
      `Health check timeout after ${maxWaitMs}ms (${attemptCount} attempts)`,
      'deepgram-docker',
      'HEALTH_CHECK_TIMEOUT',
    );
  }

  /**
   * HTTP health check to endpoint
   */
  private checkHealthEndpoint(endpoint: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(endpoint);
        const port = url.port ? parseInt(url.port, 10) : 80;
        const hostname = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
        const path = url.pathname || '/';

        console.log(`[DeepgramDocker] Health check: GET ${hostname}:${port}${path}`);

        const options = {
          hostname,
          port,
          path,
          method: 'GET' as const,
          timeout: 5000,
        };

        const request = http.get(options, (response) => {
          console.log(`[DeepgramDocker] Health check response: ${response.statusCode}`);
          let resolved = false;

          if ((response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300) {
            resolved = true;
            response.on('data', () => {});
            response.on('end', () => {
              if (!resolved) return;
              resolve();
            });
            response.on('error', () => {
              resolve();
            });
          } else {
            response.on('data', () => {});
            response.on('end', () => {
              reject(new Error(`Health check returned status ${response.statusCode}`));
            });
            response.on('error', (err) => {
              reject(err);
            });
          }
        });

        request.on('timeout', () => {
          request.destroy();
          reject(new Error('Health check request timeout'));
        });

        request.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Establish WebSocket connection to Deepgram server
   */
  async createWebSocketConnection(
    model: string = 'nova-v3',
    language: string = 'en-US',
  ): Promise<WebSocket> {
    if (!this.assignedWsPort) {
      throw new VoiceProviderError(
        'WebSocket port not assigned. Container may not be running.',
        'deepgram-docker',
        'WS_PORT_NOT_ASSIGNED',
      );
    }

    const wsUrl = this.buildWebSocketUrl(model, language);
    console.log(`[DeepgramDocker] Creating WebSocket connection to ${wsUrl}`);

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);

        const connectTimeout = setTimeout(() => {
          ws.close();
          reject(
            new VoiceProviderError(
              'WebSocket connection timeout',
              'deepgram-docker',
              'WS_CONNECTION_TIMEOUT',
            ),
          );
        }, this.connectionTimeout);

        ws.onopen = () => {
          clearTimeout(connectTimeout);
          console.log('[DeepgramDocker] WebSocket connection established');
          resolve(ws);
        };

        ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          const errorMsg = error instanceof Error ? error.message : String(error);
          reject(
            new VoiceProviderError(
              `WebSocket connection error: ${errorMsg}`,
              'deepgram-docker',
              'WS_CONNECTION_ERROR',
            ),
          );
        };
      } catch (error) {
        reject(
          new VoiceProviderError(
            error instanceof Error ? error.message : String(error),
            'deepgram-docker',
            'WS_CONNECTION_FAILED',
          ),
        );
      }
    });
  }

  /**
   * Get or create a pooled WebSocket connection
   */
  async getPooledConnection(
    model: string = 'nova-v3',
    language: string = 'en-US',
  ): Promise<WebSocket> {
    const poolKey = `${model}:${language}`;
    const pool = this.connectionPool.get(poolKey) ?? [];

    // Try to find a healthy connection in the pool
    while (pool.length > 0) {
      const entry = pool.shift();
      if (!entry) continue;

      if (entry.isHealthy && entry.ws.readyState === WebSocket.OPEN) {
        entry.lastUsed = Date.now();
        console.log(`[DeepgramDocker] Reusing pooled connection for ${poolKey}`);
        return entry.ws;
      } else {
        // Close unhealthy connection
        entry.ws.close();
      }
    }

    // Create new connection
    const ws = await this.createWebSocketConnection(model, language);

    // Store in pool for future use
    if (!this.connectionPool.has(poolKey)) {
      this.connectionPool.set(poolKey, []);
    }

    return ws;
  }

  /**
   * Return a connection to the pool
   */
  returnPooledConnection(
    ws: WebSocket,
    model: string = 'nova-v3',
    language: string = 'en-US',
  ): void {
    const poolKey = `${model}:${language}`;
    const pool = this.connectionPool.get(poolKey) ?? [];

    if (pool.length < this.maxPoolSize && ws.readyState === WebSocket.OPEN) {
      pool.push({
        ws,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        isHealthy: true,
      });
      this.connectionPool.set(poolKey, pool);
      console.log(`[DeepgramDocker] Returned connection to pool for ${poolKey}`);
    } else {
      ws.close();
    }
  }

  /**
   * Build WebSocket URL with proper query parameters
   */
  private buildWebSocketUrl(model: string, language: string): string {
    if (!this.assignedWsPort) {
      throw new Error('WebSocket port not assigned');
    }

    const url = new URL(`ws://127.0.0.1:${this.assignedWsPort}/v1/listen`);

    // Add query parameters
    url.searchParams.append('model', model);
    url.searchParams.append('language', language);
    url.searchParams.append('punctuate', 'true');
    url.searchParams.append('interim_results', 'true');
    url.searchParams.append('encoding', 'linear16');
    url.searchParams.append('sample_rate', '16000');
    url.searchParams.append('channels', '1');
    url.searchParams.append('bit_depth', '16');

    // Enable turn detection
    url.searchParams.append('vad_events', 'true');
    url.searchParams.append('utterance_end_ms', '800');
    url.searchParams.append('speech_final', 'true');
    url.searchParams.append('no_delay', 'true');

    // Tier and endpointing
    url.searchParams.append('tier', 'nova');
    url.searchParams.append('endpointing', '100ms_plus');

    return url.toString();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Close all pooled connections
    for (const pool of this.connectionPool.values()) {
      for (const entry of pool) {
        entry.ws.close();
      }
    }
    this.connectionPool.clear();

    // Stop container
    await this.stopContainer();
  }

  /**
   * Get current WebSocket port
   */
  getWebSocketPort(): number | null {
    return this.assignedWsPort;
  }

  /**
   * Get current health check port
   */
  getHealthCheckPort(): number | null {
    return this.assignedHealthPort;
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [key, pool] of this.connectionPool.entries()) {
      stats[key] = pool.length;
    }
    return stats;
  }
}

export default DeepgramDockerHandler;
