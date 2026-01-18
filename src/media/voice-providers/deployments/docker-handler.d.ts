/**
 * Docker Deployment Handler
 *
 * Manages voice provider deployment via Docker containers.
 * Handles image pulling, container lifecycle, health checking, and port allocation.
 * Supports multiple providers: Kokoro, Faster-Whisper, Chatterbox, Whisper, etc.
 */
import type { DeploymentConfig } from '../kokoro.js';
import type { DockerDeploymentHandler } from './docker-handler.spec.js';
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
export declare class DockerHandler implements DockerDeploymentHandler {
    private runningContainerId;
    private readonly imageRef;
    private readonly port;
    private assignedPort;
    constructor(imageRef?: string, port?: number);
    /**
     * Check if Docker is installed and available
     */
    checkDockerAvailable(): Promise<boolean>;
    /**
     * Pull Kokoro Docker image with retry logic
     */
    pullImage(imageRef: string, retryCount?: number): Promise<void>;
    /**
     * Start Kokoro Docker container
     */
    startContainer(config: DeploymentConfig['docker']): Promise<string>;
    /**
     * Wait for service to be healthy via HTTP health check
     */
    waitForHealthy(endpoint: string, maxWaitMs?: number): Promise<void>;
    /**
     * HTTP health check to endpoint
     * Kokoro provides /health endpoint that returns {"status":"healthy"}
     * Verifies connectivity and checks for 2xx status code
     */
    private checkHealthEndpoint;
    /**
     * Stop and remove container
     */
    stopContainer(containerId: string): Promise<void>;
    /**
     * Get container status
     */
    getContainerStatus(containerId: string): Promise<'running' | 'stopped' | 'error'>;
    /**
     * Query Docker to find the assigned host port for internal port 8880
     */
    private getAssignedPort;
    /**
     * Get running container ID
     */
    getRunningContainerId(): string | null;
    /**
     * Get the actual port assigned by Docker
     */
    getAssignedPortNumber(): number | null;
    /**
     * Synthesize audio via HTTP streaming endpoint
     * @param text - Text to synthesize
     * @param options - Voice options (voice, speed, etc.)
     * @returns ReadableStream of audio chunks
     */
    synthesizeStream(text: string, options?: {
        voice?: string;
        speed?: number;
        language?: string;
    }): Promise<ReadableStream<Uint8Array>>;
    /**
     * Cleanup on shutdown
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=docker-handler.d.ts.map