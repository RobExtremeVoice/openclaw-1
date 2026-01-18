/**
 * Faster-Whisper Docker Deployment Handler
 *
 * Manages Docker container lifecycle for Faster-Whisper STT service.
 * Handles image building, container setup, GPU support, and health monitoring.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AudioBuffer,
  TranscribeOptions,
  TranscriptionResult,
} from './executor.js';
import { VoiceProviderError } from './executor.js';

const execAsync = promisify(exec);

/**
 * Docker deployment configuration
 */
interface DockerDeploymentConfig {
  port: number;
  dockerImage: string;
  containerName: string;
  gpuEnabled: boolean;
  modelSize: string;
  computeType: 'int8' | 'float16' | 'float32';
  cpuLimit?: string;
  memoryLimit?: string;
  volumeMounts?: Record<string, string>;
  beamSize?: number;
  cpuThreads?: number;
  autoPortAssignment?: boolean;
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
 * Comprehensive Docker deployment handler for Faster-Whisper
 */
export class FasterWhisperDockerDeploymentHandler {
  private containerRunning = false;
  private containerId?: string;
  private apiBaseUrl: string;
  private config: DockerDeploymentConfig;
  private healthCheckInterval?: NodeJS.Timer;
  private assignedPort?: number;

  constructor(config: Partial<DockerDeploymentConfig> = {}) {
    this.config = {
      port: config.port || 8001,
      dockerImage:
        config.dockerImage || 'fedirz/faster-whisper-server:latest-cpu',
      containerName: config.containerName || 'faster-whisper-stt',
      gpuEnabled: config.gpuEnabled || false,
      modelSize: config.modelSize || 'base',
      computeType: config.computeType || 'int8',
      cpuLimit: config.cpuLimit || '4',
      memoryLimit: config.memoryLimit || '8g',
      volumeMounts: config.volumeMounts || {},
      beamSize: config.beamSize,
      cpuThreads: config.cpuThreads,
      autoPortAssignment: config.autoPortAssignment ?? false,
    };

    this.apiBaseUrl = `http://localhost:${this.config.port}`;
  }

  /**
   * Start Faster-Whisper Docker container
   */
  async start(): Promise<void> {
    try {
      // Check if container already exists and is running
      const status = await this.getContainerStatus();

      if (status.running && status.containerId) {
        this.containerRunning = true;
        this.containerId = status.containerId;
        return;
      }

      // Detect GPU availability if enabled
      if (this.config.gpuEnabled) {
        const gpuAvailable = await this.detectNvidiaGPU();
        if (!gpuAvailable) {
          console.warn(
            'GPU requested but not available, falling back to CPU',
          );
          this.config.gpuEnabled = false;
        }
      }

      // Build or pull the Docker image
      await this.ensureImageAvailable();

      // Create and start the container
      await this.createAndStartContainer();

      // Wait for API to be ready
      await this.waitForApiReady();

      this.containerRunning = true;

      // Start periodic health checks
      this.startHealthCheckInterval();
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to start Docker container: ${error instanceof Error ? error.message : String(error)}`,
        'faster-whisper-docker',
        'START_FAILED',
      );
    }
  }

  /**
   * Stop and remove Faster-Whisper Docker container
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

      // Stop the container
      await execAsync(`docker stop ${this.containerId}`);

      // Remove the container
      await execAsync(`docker rm ${this.containerId}`);

      this.containerRunning = false;
      this.containerId = undefined;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to stop Docker container: ${error instanceof Error ? error.message : String(error)}`,
        'faster-whisper-docker',
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
   * Detect NVIDIA GPU availability
   */
  private async detectNvidiaGPU(): Promise<boolean> {
    try {
      await execAsync('nvidia-smi');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure Docker image is available (pull or build)
   */
  private async ensureImageAvailable(): Promise<void> {
    try {
      // Determine the correct image variant
      const imageVariant = this.config.gpuEnabled
        ? this.config.dockerImage.replace('-cpu', '-cuda')
        : this.config.dockerImage;

      // Try to pull the image
      await execAsync(`docker pull ${imageVariant}`);
    } catch (error) {
      // If pull fails, attempt to build from local Dockerfile
      console.warn(
        `Failed to pull ${this.config.dockerImage}, building locally...`,
      );
      await this.buildImageLocally();
    }
  }

  /**
   * Build Docker image locally from Dockerfile
   */
  private async buildImageLocally(): Promise<void> {
    try {
      await execAsync(`docker build -t ${this.config.dockerImage} .`, {
        cwd: process.cwd(),
      });
    } catch (error) {
      throw new Error(
        `Failed to build Docker image: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create and start Docker container
   */
  private async createAndStartContainer(): Promise<void> {
    const volumeFlags = Object.entries(this.config.volumeMounts || {})
      .map(([local, container]) => `-v ${local}:${container}`)
      .join(' ');

    const gpuFlags = this.config.gpuEnabled ? '--gpus all' : '';

    // Environment variables for faster-whisper configuration
    const envVars = [
      `-e WHISPER_MODEL=${this.config.modelSize}`,
      `-e COMPUTE_TYPE=${this.config.computeType}`,
    ];

    if (this.config.beamSize !== undefined) {
      envVars.push(`-e BEAM_SIZE=${this.config.beamSize}`);
    }

    if (this.config.cpuThreads !== undefined) {
      envVars.push(`-e NUM_WORKERS=${this.config.cpuThreads}`);
    }

    // Auto-port assignment: use 0 to let Docker choose available port
    const portMapping = this.config.autoPortAssignment
      ? '-p 0:8000'
      : `-p ${this.config.port}:8000`;

    const runCommand = [
      'docker run',
      '-d',
      `--name ${this.config.containerName}`,
      portMapping,
      `--cpus=${this.config.cpuLimit}`,
      `-m ${this.config.memoryLimit}`,
      volumeFlags,
      gpuFlags,
      ...envVars,
      this.config.dockerImage,
    ]
      .filter(Boolean)
      .join(' ');

    const { stdout } = await execAsync(runCommand);
    this.containerId = stdout.trim();

    // If auto-port assignment is enabled, retrieve the assigned port
    if (this.config.autoPortAssignment) {
      await this.retrieveAssignedPort();
    }
  }

  /**
   * Retrieve the actual port assigned by Docker
   */
  private async retrieveAssignedPort(): Promise<void> {
    if (!this.containerId) {
      throw new Error('Container ID not found');
    }

    try {
      const { stdout } = await execAsync(
        `docker port ${this.containerId} 8000/tcp`,
      );

      // Output format: "0.0.0.0:ASSIGNED_PORT"
      const portMatch = stdout.trim().match(/:(\d+)$/);
      if (portMatch && portMatch[1]) {
        this.assignedPort = parseInt(portMatch[1], 10);
        this.apiBaseUrl = `http://localhost:${this.assignedPort}`;
      }
    } catch (error) {
      console.warn(
        'Failed to retrieve assigned port, using configured port',
        error,
      );
      // Fall back to configured port
      this.assignedPort = this.config.port;
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
        const healthy = await this.healthCheck();

        if (!healthy) {
          console.warn(
            'Faster-Whisper Docker container health check failed',
          );
          // Could implement auto-recovery here if needed
        }
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
    options?: TranscribeOptions & {
      computeType?: string;
      beamSize?: number;
    },
  ): Promise<TranscriptionResult> {
    if (!this.containerRunning) {
      throw new VoiceProviderError(
        'Docker container is not running',
        'faster-whisper-docker',
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

      if (options?.computeType || this.config.computeType) {
        formData.append(
          'compute_type',
          options?.computeType || this.config.computeType,
        );
      }

      if (options?.beamSize !== undefined || this.config.beamSize !== undefined) {
        formData.append(
          'beam_size',
          String(options?.beamSize ?? this.config.beamSize),
        );
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
        provider: 'faster-whisper-docker',
      };
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message.includes('fetch failed')
      ) {
        throw new VoiceProviderError(
          'Failed to connect to Faster-Whisper API',
          'faster-whisper-docker',
          'CONNECTION_FAILED',
        );
      }

      throw new VoiceProviderError(
        `Docker transcription failed: ${error instanceof Error ? error.message : String(error)}`,
        'faster-whisper-docker',
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
   * Get container stats
   */
  async getStats(): Promise<Record<string, unknown>> {
    if (!this.containerId) {
      throw new Error('Container not found');
    }

    try {
      const { stdout } = await execAsync(
        `docker stats ${this.containerId} --no-stream --format "table"`,
      );

      return {
        raw: stdout,
        containerRunning: this.containerRunning,
        containerPort: this.config.port,
        gpuEnabled: this.config.gpuEnabled,
        computeType: this.config.computeType,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
   * Get assigned port (if using auto-port assignment)
   */
  getAssignedPort(): number | undefined {
    return this.assignedPort;
  }

  /**
   * Stream transcription for real-time speech-to-text (if API supports it)
   */
  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<{ text: string; partial: boolean; timestamp: number }> {
    if (!this.containerRunning) {
      throw new VoiceProviderError(
        'Docker container is not running',
        'faster-whisper-docker',
        'CONTAINER_NOT_RUNNING',
      );
    }

    const reader = audioStream.getReader();
    let buffer: Uint8Array = new Uint8Array();
    let chunkNumber = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Accumulate audio data
        const newBuffer = new Uint8Array(buffer.length + value.data.length);
        newBuffer.set(buffer);
        newBuffer.set(value.data, buffer.length);
        buffer = newBuffer;

        // Process when we have enough data (e.g., 1 second of audio at 16kHz)
        const minSampleCount = 16000; // 1 second at 16kHz
        if (buffer.length >= minSampleCount * 2) {
          // 2 bytes per sample for PCM16
          const chunkToProcess = buffer.slice(0, minSampleCount * 2);
          buffer = buffer.slice(minSampleCount * 2);

          try {
            const result = await this.transcribe(
              {
                data: chunkToProcess,
                format: 'pcm_16' as any,
                sampleRate: 16000,
                duration: minSampleCount / 16,
                channels: 1,
              },
              options,
            );

            yield {
              text: result.text,
              partial: buffer.length > 0,
              timestamp: chunkNumber++,
            };
          } catch (error) {
            console.warn('Error transcribing chunk:', error);
          }
        }
      }

      // Process remaining buffer
      if (buffer.length > 0) {
        try {
          const result = await this.transcribe(
            {
              data: buffer,
              format: 'pcm_16' as any,
              sampleRate: 16000,
              duration: (buffer.length / 2) / 16,
              channels: 1,
            },
            options,
          );

          yield {
            text: result.text,
            partial: false,
            timestamp: chunkNumber++,
          };
        } catch (error) {
          console.warn('Error transcribing final buffer:', error);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
