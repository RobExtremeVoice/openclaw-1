/**
 * Docker Deployment Handler Specification
 *
 * This file outlines the contract that the Docker deployment handler
 * sub-agent must implement.
 *
 * IMPLEMENTATION CHECKLIST:
 * - [ ] Validate Docker is installed
 * - [ ] Pull Kokoro image with retry logic
 * - [ ] Run container with port mapping and env vars
 * - [ ] Wait for service to be healthy (health endpoint checks)
 * - [ ] Track running container ID for cleanup
 * - [ ] Implement graceful shutdown (docker stop, docker rm)
 * - [ ] Handle port conflicts and resource cleanup
 * - [ ] Write tests for: success path, image pull failure, startup failure, health check timeout
 */

import type { DeploymentConfig } from '../kokoro.js';

/**
 * Docker deployment handler interface
 */
export interface DockerDeploymentHandler {
  /**
   * Check if Docker is available on this system
   */
  checkDockerAvailable(): Promise<boolean>;

  /**
   * Pull Kokoro Docker image
   * @param imageRef - Docker image reference (e.g., "kokoro:latest")
   * @param retryCount - Number of retries on failure
   */
  pullImage(imageRef: string, retryCount?: number): Promise<void>;

  /**
   * Start Kokoro Docker container
   * @param config - Docker deployment configuration
   * @returns Container ID
   */
  startContainer(config: DeploymentConfig['docker']): Promise<string>;

  /**
   * Wait for service to be healthy
   * @param endpoint - Health check endpoint
   * @param maxWaitMs - Maximum time to wait
   */
  waitForHealthy(endpoint: string, maxWaitMs?: number): Promise<void>;

  /**
   * Stop and remove running container
   * @param containerId - Container ID
   */
  stopContainer(containerId: string): Promise<void>;

  /**
   * Get running container status
   */
  getContainerStatus(containerId: string): Promise<'running' | 'stopped' | 'error'>;
}

/**
 * Expected implementation location:
 * /src/media/voice-providers/deployments/docker-handler.ts
 */
export const DockerHandlerContract = {
  // Implementation should export a class DockerHandler that implements DockerDeploymentHandler
  // Example usage in KokoroExecutor:
  // const handler = new DockerHandler();
  // await handler.checkDockerAvailable();
  // await handler.pullImage(config.docker!.image);
  // const containerId = await handler.startContainer(config.docker!);
  // await handler.waitForHealthy(config.healthCheck!.endpoint);
};
