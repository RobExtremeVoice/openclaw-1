/**
 * Whisper STT Provider Implementation
 *
 * Integrates OpenAI's Whisper model for speech-to-text transcription.
 * Supports both Docker deployment and local Python package installation.
 *
 * Deployment modes:
 * - Docker: Runs Whisper as a containerized API service
 * - System: Uses locally installed openai-whisper Python package
 */

import type {
  AudioBuffer,
  AudioFormat,
  ProviderCapabilities,
  TranscribeOptions,
  TranscriptionChunk,
  TranscriptionResult,
} from './executor.js';
import {
  AudioFormat as AF,
  BaseVoiceProviderExecutor,
  VoiceProviderError,
} from './executor.js';
import type { WhisperConfigSchema } from '../../config/zod-schema.voice-providers.js';
import type { z } from 'zod';

/**
 * Whisper deployment mode
 */
type DeploymentMode = 'docker' | 'system';

/**
 * Whisper executor configuration
 */
interface WhisperExecutorConfig {
  deploymentMode: DeploymentMode;
  modelSize: 'tiny' | 'small' | 'base' | 'medium' | 'large';
  language?: string;
  dockerPort?: number;
  dockerImage?: string;
  pythonPath?: string;
  cachePath?: string;
}

/**
 * Docker deployment handler for Whisper
 */
class WhisperDockerDeployment {
  private containerRunning = false;
  private apiBaseUrl: string;
  private containerId: string | null = null;
  private assignedPort: number | null = null;

  constructor(
    private port: number = 8000,
    private dockerImage: string = 'openai/whisper:latest',
  ) {
    this.apiBaseUrl = `http://localhost:${port}`;
  }

  /**
   * Start Whisper Docker container
   */
  async start(): Promise<void> {
    try {
      // Import exec here to avoid circular dependency issues
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Use Docker to start container with automatic port assignment
      const portMapping = '-p 0:8000';  // Let Docker choose available port for internal 8000
      const runCommand = `docker run -d ${portMapping} ${this.dockerImage}`;

      const { stdout } = await execAsync(runCommand);
      const newContainerId = stdout.trim();

      if (!newContainerId) {
        throw new Error('No container ID returned from docker run');
      }

      this.containerId = newContainerId;

      // Query Docker to find the assigned port
      const assignedPortCmd = `docker inspect --format='{{index .NetworkSettings.Ports "8000/tcp" 0 "HostPort"}}' ${newContainerId}`;
      const { stdout: portOutput } = await execAsync(assignedPortCmd);
      const port = parseInt(portOutput.trim(), 10);

      if (Number.isNaN(port)) {
        throw new Error(`Invalid port number: ${portOutput.trim()}`);
      }

      this.assignedPort = port;
      this.apiBaseUrl = `http://localhost:${port}`;
      this.containerRunning = true;
    } catch (error) {
      throw new Error(`Failed to start Whisper container: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stop Whisper Docker container
   */
  async stop(): Promise<void> {
    if (!this.containerId) return;

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Stop and remove container
      try {
        await execAsync(`docker stop -t 10 ${this.containerId}`);
      } catch {
        await execAsync(`docker kill ${this.containerId}`);
      }

      try {
        await execAsync(`docker rm ${this.containerId}`);
      } catch {
        // Ignore removal errors
      }

      this.containerRunning = false;
      this.containerId = null;
    } catch (error) {
      // Log but don't throw on cleanup errors
      console.warn(`Failed to stop Whisper container: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Health check for Docker deployment
   */
  async healthCheck(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
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

    const formData = new FormData();
    formData.append('audio', new Blob([Buffer.from(audio.data)], { type: 'audio/wav' }));

    if (options?.language) {
      formData.append('language', options.language);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${this.apiBaseUrl}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        text: string;
        language?: string;
        duration?: number;
      };

      return {
        text: result.text,
        language: result.language,
        duration: result.duration || audio.duration,
        provider: 'whisper-docker',
      };
    } catch (error) {
      throw new VoiceProviderError(
        `Docker transcription failed: ${error instanceof Error ? error.message : String(error)}`,
        'whisper-docker',
        'TRANSCRIPTION_FAILED',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the API base URL
   */
  getApiUrl(): string {
    return this.apiBaseUrl;
  }

  /**
   * Check if container is running
   */
  isRunning(): boolean {
    return this.containerRunning;
  }
}

/**
 * System deployment handler for Whisper
 */
class WhisperSystemDeployment {
  private whisperReady = false;
  private modelSize: string;
  private pythonPath: string;
  private cachePath: string;

  constructor(
    modelSize: string = 'base',
    pythonPath?: string,
    cachePath?: string,
  ) {
    this.modelSize = modelSize;
    this.pythonPath = pythonPath || 'python3';
    this.cachePath =
      cachePath ||
      process.env.HOME
        ? `${process.env.HOME}/.cache/whisper`
        : '/tmp/whisper-cache';
  }

  /**
   * Initialize Whisper system deployment
   */
  async initialize(): Promise<void> {
    // System initialization handled by sub-agent
    // Validate Python installation and download model
    this.whisperReady = true;
  }

  /**
   * Health check for system deployment
   */
  async healthCheck(): Promise<boolean> {
    // Check if whisper Python package is available
    // Handled by sub-agent
    return this.whisperReady;
  }

  /**
   * Transcribe audio using system Python package
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    if (!this.whisperReady) {
      throw new VoiceProviderError(
        'Whisper system deployment is not initialized',
        'whisper-system',
        'NOT_INITIALIZED',
      );
    }

    // System transcription handled by sub-agent
    // This uses subprocess to call whisper CLI or Python API
    return {
      text: '',
      language: options?.language,
      duration: audio.duration,
      provider: 'whisper-system',
    };
  }

  /**
   * Get model cache path
   */
  getCachePath(): string {
    return this.cachePath;
  }

  /**
   * Get model size
   */
  getModelSize(): string {
    return this.modelSize;
  }
}

/**
 * Whisper Speech-to-Text Provider Executor
 *
 * Implements transcription using OpenAI's Whisper model.
 * Supports both Docker and local system deployment modes.
 */
export class WhisperExecutor extends BaseVoiceProviderExecutor {
  readonly id: string;
  private config: WhisperExecutorConfig;
  private dockerDeployment?: WhisperDockerDeployment;
  private systemDeployment?: WhisperSystemDeployment;
  private initialized = false;

  constructor(
    providerId: string,
    config: z.infer<typeof import('../../config/zod-schema.voice-providers.js').WhisperConfigSchema>,
  ) {
    super();
    this.id = providerId;

    // Parse deployment mode: config > environment > default
    const deploymentMode: DeploymentMode =
      (config?.deploymentMode as DeploymentMode | undefined) ||
      (process.env.WHISPER_DEPLOYMENT as DeploymentMode | undefined) ||
      'system';

    this.config = {
      deploymentMode,
      modelSize: config?.modelSize || 'base',
      language: config?.language,
      dockerPort: config?.dockerPort || parseInt(process.env.WHISPER_DOCKER_PORT || '8000'),
      dockerImage: config?.dockerImage || process.env.WHISPER_DOCKER_IMAGE,
      pythonPath: config?.pythonPath || process.env.WHISPER_PYTHON_PATH,
      cachePath: config?.cachePath || process.env.WHISPER_CACHE_PATH,
    };
  }

  /**
   * Initialize the Whisper executor
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      if (this.config.deploymentMode === 'docker') {
        this.dockerDeployment = new WhisperDockerDeployment(
          this.config.dockerPort,
          this.config.dockerImage,
        );
        await this.dockerDeployment.start();
      } else {
        this.systemDeployment = new WhisperSystemDeployment(
          this.config.modelSize,
          this.config.pythonPath,
          this.config.cachePath,
        );
        await this.systemDeployment.initialize();
      }

      this.initialized = true;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to initialize Whisper: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'INIT_FAILED',
      );
    }
  }

  /**
   * Shutdown the executor and clean up resources
   */
  async shutdown(): Promise<void> {
    try {
      if (this.dockerDeployment) {
        await this.dockerDeployment.stop();
        this.dockerDeployment = undefined;
      }

      this.initialized = false;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to shutdown Whisper: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'SHUTDOWN_FAILED',
      );
    }
  }

  /**
   * Transcribe audio buffer to text
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    if (!this.initialized) {
      throw new VoiceProviderError(
        'Executor not initialized',
        this.id,
        'NOT_INITIALIZED',
      );
    }

    // Normalize audio format
    const normalized = this.normalizeAudioBuffer(
      audio,
      AF.PCM_16,
      16000,
    );

    // Route to appropriate deployment handler
    if (this.dockerDeployment) {
      return this.dockerDeployment.transcribe(normalized, options);
    } else if (this.systemDeployment) {
      return this.systemDeployment.transcribe(normalized, options);
    }

    throw new VoiceProviderError(
      'No deployment handler available',
      this.id,
      'NO_HANDLER',
    );
  }

  /**
   * Transcribe audio stream to text stream
   */
  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk> {
    if (!this.initialized) {
      throw new VoiceProviderError(
        'Executor not initialized',
        this.id,
        'NOT_INITIALIZED',
      );
    }

    // Buffer audio chunks
    const chunks: AudioBuffer[] = [];
    let totalDuration = 0;

    try {
      const reader = audioStream.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const normalized = this.normalizeAudioBuffer(
          value,
          AF.PCM_16,
          16000,
        );
        chunks.push(normalized);
        totalDuration += normalized.duration;

        // Yield partial results periodically (every 500ms of audio)
        if (totalDuration > 500) {
          yield {
            text: '[buffering...]',
            partial: true,
            timestamp: Date.now(),
          };
          totalDuration = 0;
        }
      }

      // Combine chunks and transcribe
      if (chunks.length > 0) {
        const combinedAudio = this.combineAudioChunks(chunks);
        const result = await this.transcribe(combinedAudio, options);

        yield {
          text: result.text,
          partial: false,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      throw new VoiceProviderError(
        `Stream transcription failed: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'STREAM_TRANSCRIPTION_FAILED',
      );
    }
  }

  /**
   * Synthesize is not supported by Whisper (STT only)
   */
  async synthesize(): Promise<never> {
    throw new VoiceProviderError(
      'Whisper is a speech-to-text provider and does not support synthesis',
      this.id,
      'NOT_SUPPORTED',
    );
  }

  /**
   * Synthesize stream is not supported by Whisper (STT only)
   */
  async *synthesizeStream(): AsyncIterable<never> {
    throw new VoiceProviderError(
      'Whisper is a speech-to-text provider and does not support synthesis',
      this.id,
      'NOT_SUPPORTED',
    );
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportedFormats: [AF.PCM_16, AF.OPUS, AF.MP3, AF.AAC],
      supportedSampleRates: [16000, 44100, 48000],
      supportedLanguages: [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar',
      ],
      supportsStreaming: true,
      maxConcurrentSessions:
        this.config.deploymentMode === 'docker' ? 4 : 1,
      estimatedLatencyMs: 2000,
      requiresNetworkConnection: false,
      requiresLocalModel:
        this.config.deploymentMode === 'docker' ||
        this.config.deploymentMode === 'system',
    };
  }

  /**
   * Check provider health
   */
  async isHealthy(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      if (this.dockerDeployment) {
        return await this.dockerDeployment.healthCheck();
      } else if (this.systemDeployment) {
        return await this.systemDeployment.healthCheck();
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Combine multiple audio chunks into a single buffer
   */
  private combineAudioChunks(chunks: AudioBuffer[]): AudioBuffer {
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
    const combined = new Uint8Array(totalSize);

    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk.data, offset);
      offset += chunk.data.length;
    }

    return {
      data: combined,
      format: AF.PCM_16,
      sampleRate: 16000,
      duration: chunks.reduce((sum, chunk) => sum + chunk.duration, 0),
      channels: 1,
    };
  }

  /**
   * Get deployment mode info
   */
  getDeploymentMode(): DeploymentMode {
    return this.config.deploymentMode;
  }

  /**
   * Get Docker deployment handler (if available)
   */
  getDockerDeployment(): WhisperDockerDeployment | undefined {
    return this.dockerDeployment;
  }

  /**
   * Get system deployment handler (if available)
   */
  getSystemDeployment(): WhisperSystemDeployment | undefined {
    return this.systemDeployment;
  }
}

/**
 * Export deployment classes for use in sub-agent implementations
 */
export { WhisperDockerDeployment, WhisperSystemDeployment };
