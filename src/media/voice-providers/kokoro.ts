/**
 * Kokoro TTS Provider Executor
 *
 * Implements VoiceProviderExecutor for the Kokoro local TTS engine.
 * Supports three deployment modes:
 * 1. Docker - Container-based Kokoro service
 * 2. System - Local Python installation
 * 3. Cloud - External Kokoro API endpoint
 */

import { EventEmitter } from 'events';
import type {
  AudioBuffer,
  AudioFormat,
  ProviderCapabilities,
  SynthesisOptions,
  TranscribeOptions,
  TranscriptionChunk,
  TranscriptionResult,
  VoiceProviderExecutor,
} from './executor.js';
import { AudioFormat as AudioFormatEnum, BaseVoiceProviderExecutor, VoiceProviderError } from './executor.js';
import { DockerHandler, SystemHandler, CloudHandler } from './deployments/index.js';

/**
 * Deployment configuration schema
 */
export interface DeploymentConfig {
  mode: 'docker' | 'system' | 'cloud';
  docker?: {
    image: string;
    port: number;
    volumes?: Record<string, string>;
    env?: Record<string, string>;
  };
  system?: {
    pythonPath?: string;
    installCmd?: string;
  };
  cloud?: {
    endpoint: string;
    apiKey?: string;
  };
  healthCheck?: {
    endpoint: string;
    interval: number;
  };
}

/**
 * Kokoro synthesize response
 */
export interface KokoroSynthesizeResponse {
  audio: Uint8Array;
  sampleRate: number;
  duration: number;
  format: string;
}

/**
 * Kokoro executor - bridges to actual Kokoro service
 */
export class KokoroExecutor extends BaseVoiceProviderExecutor {
  id = 'kokoro';
  private config: DeploymentConfig;
  private isInitialized = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private eventEmitter = new EventEmitter();
  private dockerHandler: DockerHandler | null = null;
  private systemHandler: SystemHandler | null = null;
  private cloudHandler: CloudHandler | null = null;

  constructor(config: DeploymentConfig) {
    super();
    this.config = config;
    // Validate only cloud and invalid modes immediately
    // Docker and system modes validate lazily on initialize()
    this.validateModeAndCloud();
  }

  /**
   * Validate mode and cloud config immediately in constructor
   * Docker and system config validation happens lazily on initialize()
   */
  private validateModeAndCloud(): void {
    if (!this.config || !this.config.mode) {
      throw new VoiceProviderError(
        'Invalid deployment config: mode is required',
        this.id,
        'INVALID_CONFIG',
      );
    }

    // Only validate cloud mode immediately
    if (this.config.mode === 'cloud') {
      if (!this.config.cloud?.endpoint) {
        throw new VoiceProviderError(
          'Cloud mode requires endpoint',
          this.id,
          'INVALID_CLOUD_CONFIG',
        );
      }
    }

    // Validate that mode is known
    if (!['docker', 'system', 'cloud'].includes(this.config.mode)) {
      throw new VoiceProviderError(
        `Unknown deployment mode: ${this.config.mode}`,
        this.id,
        'UNKNOWN_MODE',
      );
    }
  }

  /**
   * Validate deployment configuration (lazy validation for docker/system modes)
   */
  private validateConfig(): void {
    // Only validate docker mode here (cloud and invalid modes already validated in constructor)
    if (this.config.mode === 'docker') {
      if (!this.config.docker?.image || this.config.docker?.port === undefined) {
        throw new VoiceProviderError(
          'Docker mode requires image and port',
          this.id,
          'INVALID_DOCKER_CONFIG',
        );
      }
    }
    // System mode has optional config, no validation needed
  }

  /**
   * Initialize Kokoro service based on deployment mode
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Validate config before initialization
      this.validateConfig();

      switch (this.config.mode) {
        case 'docker':
          await this.initializeDocker();
          break;
        case 'system':
          await this.initializeSystem();
          break;
        case 'cloud':
          await this.initializeCloud();
          break;
      }

      // Start health checking if configured
      if (this.config.healthCheck) {
        this.startHealthChecking();
      }

      this.isInitialized = true;
    } catch (error) {
      throw new VoiceProviderError(
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'INIT_FAILED',
      );
    }
  }

  /**
   * Initialize Docker deployment
   */
  private async initializeDocker(): Promise<void> {
    if (!this.config.docker) {
      throw new Error('Docker config not found');
    }

    this.dockerHandler = new DockerHandler(
      this.config.docker.image,
      this.config.docker.port,
    );

    // Check Docker availability
    if (!(await this.dockerHandler.checkDockerAvailable())) {
      throw new VoiceProviderError(
        'Docker is not available on this system',
        this.id,
        'DOCKER_NOT_INSTALLED',
      );
    }

    // Pull and start container
    const containerId = await this.dockerHandler.startContainer(
      this.config.docker,
    );

    console.log(
      `[Docker] Container started and health check passed`,
    );

    console.log(
      `[Docker] Kokoro initialized from image: ${this.config.docker.image}`,
    );
  }

  /**
   * Initialize System deployment
   */
  private async initializeSystem(): Promise<void> {
    this.systemHandler = new SystemHandler();

    // Detect Python and install Kokoro if needed
    const pythonPath = await this.systemHandler.detectPython();

    if (!(await this.systemHandler.checkKokoroInstalled(pythonPath))) {
      console.log('[System] Installing Kokoro...');
      await this.systemHandler.installKokoro(
        pythonPath,
        this.config.system?.installCmd,
      );
    }

    // Start the process
    const pid = await this.systemHandler.startProcess(this.config.system);

    console.log(`[System] Kokoro initialized with PID ${pid}`);
  }

  /**
   * Initialize Cloud deployment
   */
  private async initializeCloud(): Promise<void> {
    if (!this.config.cloud) {
      throw new Error('Cloud config not found');
    }

    this.cloudHandler = new CloudHandler(
      this.config.cloud.endpoint,
      this.config.cloud.apiKey,
    );

    // Validate endpoint
    if (!(await this.cloudHandler.validateEndpoint(this.config.cloud.endpoint))) {
      throw new VoiceProviderError(
        `Endpoint not accessible: ${this.config.cloud.endpoint}`,
        this.id,
        'ENDPOINT_UNREACHABLE',
      );
    }

    // Test authentication if API key provided
    if (
      this.config.cloud.apiKey &&
      !(await this.cloudHandler.testAuthentication(
        this.config.cloud.endpoint,
        this.config.cloud.apiKey,
      ))
    ) {
      throw new VoiceProviderError(
        'API authentication failed',
        this.id,
        'AUTHENTICATION_FAILED',
      );
    }

    console.log(
      `[Cloud] Kokoro initialized with API endpoint: ${this.config.cloud.endpoint}`,
    );
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    if (!this.config.healthCheck) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthy = await this.isHealthy();
        if (!healthy) {
          this.eventEmitter.emit('health-degraded');
        }
      } catch (error) {
        console.error('[Kokoro] Health check failed:', error);
        this.eventEmitter.emit('health-check-error', error);
      }
    }, this.config.healthCheck.interval);
  }

  /**
   * Shutdown Kokoro service
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    try {
      switch (this.config.mode) {
        case 'docker':
          await this.shutdownDocker();
          break;
        case 'system':
          await this.shutdownSystem();
          break;
        case 'cloud':
          await this.shutdownCloud();
          break;
      }
    } finally {
      this.isInitialized = false;
    }
  }

  /**
   * Shutdown Docker deployment
   */
  private async shutdownDocker(): Promise<void> {
    if (this.dockerHandler) {
      try {
        await this.dockerHandler.cleanup();
      } catch (error) {
        console.error('[Docker] Cleanup error:', error);
      }
    }
  }

  /**
   * Shutdown System deployment
   */
  private async shutdownSystem(): Promise<void> {
    if (this.systemHandler) {
      try {
        await this.systemHandler.cleanup();
      } catch (error) {
        console.error('[System] Cleanup error:', error);
      }
    }
  }

  /**
   * Shutdown Cloud deployment
   */
  private async shutdownCloud(): Promise<void> {
    if (this.cloudHandler) {
      try {
        await this.cloudHandler.close();
      } catch (error) {
        console.error('[Cloud] Cleanup error:', error);
      }
    }
  }

  /**
   * Check if Kokoro service is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      switch (this.config.mode) {
        case 'docker':
          if (this.dockerHandler) {
            const status = await this.dockerHandler.getRunningContainerId();
            return status !== null;
          }
          return false;

        case 'system':
          if (this.systemHandler) {
            const pid = this.systemHandler.getRunningPid();
            return pid !== null && (await this.systemHandler.isProcessRunning(pid));
          }
          return false;

        case 'cloud':
          if (this.cloudHandler) {
            const status = await this.cloudHandler.getConnectionStatus();
            return status.connected;
          }
          return false;

        default:
          return false;
      }
    } catch (error) {
      console.error('[Kokoro] Health check error:', error);
      return false;
    }
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportedFormats: [AudioFormatEnum.PCM_16],
      supportedSampleRates: [16000],
      supportedLanguages: ['en', 'ja', 'zh', 'es', 'fr', 'de', 'it', 'pt', 'ko'],
      supportsStreaming: true,
      maxConcurrentSessions: 10,
      estimatedLatencyMs: 150,
      requiresNetworkConnection: this.config.mode === 'cloud',
      requiresLocalModel: this.config.mode !== 'cloud',
    };
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(text: string, options?: SynthesisOptions): Promise<AudioBuffer> {
    if (!this.isInitialized) {
      throw new VoiceProviderError(
        'NOT_INITIALIZED: Kokoro not initialized',
        this.id,
        'NOT_INITIALIZED',
      );
    }

    try {
      let audio: Uint8Array;

      if (this.config.mode === 'cloud' && this.cloudHandler) {
        // Use cloud handler
        audio = await this.cloudHandler.synthesize(text, {
          voice: options?.voice,
          speed: options?.speed,
          language: options?.language,
        });
      } else if (this.dockerHandler) {
        // Use Docker handler's streaming endpoint (collect all chunks for non-streaming API)
        const stream = await this.dockerHandler.synthesizeStream(text, {
          voice: options?.voice,
          speed: options?.speed,
          language: options?.language,
        });

        // Collect all chunks into single buffer
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }

        // Concatenate all chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        audio = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          audio.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        // For System mode, we would call local HTTP endpoint
        // For now, return placeholder
        console.warn('[Kokoro] System mode synthesis not yet implemented, returning silence');
        audio = new Uint8Array(16000 * 2); // 1 second of silence
      }

      return {
        data: audio,
        format: AudioFormatEnum.PCM_16,
        sampleRate: 16000,
        duration: (audio.length / 2 / 16000) * 1000, // Duration in ms
        channels: 1,
      };
    } catch (error) {
      throw new VoiceProviderError(
        `Synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
        'SYNTHESIS_FAILED',
      );
    }
  }

  /**
   * Stream-based text-to-speech synthesis using HTTP streaming
   */
  async *synthesizeStream(
    textStream: ReadableStream<string>,
    options?: SynthesisOptions,
  ): AsyncIterable<AudioBuffer> {
    if (!this.isInitialized) {
      throw new VoiceProviderError(
        'NOT_INITIALIZED: Kokoro not initialized',
        this.id,
        'NOT_INITIALIZED',
      );
    }

    const reader = textStream.getReader();
    const startTime = performance.now();
    let firstChunkTime: number | null = null;
    let textBuffer = '';

    try {
      // Stream text chunks to HTTP endpoint
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          textBuffer += value;
        }

        // Stream accumulated text (don't wait for sentence boundaries)
        if (textBuffer.length > 0 && (textBuffer.length >= 50 || done)) {
          const textToSynthesize = textBuffer;
          textBuffer = '';

          if (this.config.mode === 'cloud' && this.cloudHandler) {
            // Cloud mode: use standard synthesis
            const audio = await this.cloudHandler.synthesize(textToSynthesize, {
              voice: options?.voice,
              speed: options?.speed,
              language: options?.language,
            });

            const audioBuffer: AudioBuffer = {
              data: audio,
              format: AudioFormatEnum.PCM_16,
              sampleRate: 16000,
              duration: (audio.length / 2 / 16000) * 1000,
              channels: 1,
            };

            if (!firstChunkTime) {
              firstChunkTime = performance.now();
              const latency = firstChunkTime - startTime;
              console.log(`[Kokoro] First audio chunk in ${latency.toFixed(2)}ms`);
            }

            yield audioBuffer;
          } else if (this.dockerHandler) {
            // Docker mode: use streaming endpoint
            const stream = await this.dockerHandler.synthesizeStream(textToSynthesize, {
              voice: options?.voice,
              speed: options?.speed,
              language: options?.language,
            });

            const streamReader = stream.getReader();
            try {
              while (true) {
                const { done: streamDone, value: audioChunk } = await streamReader.read();
                if (streamDone) break;

                if (audioChunk && audioChunk.length > 0) {
                  if (!firstChunkTime) {
                    firstChunkTime = performance.now();
                    const latency = firstChunkTime - startTime;
                    console.log(`[Kokoro] First audio chunk in ${latency.toFixed(2)}ms`);
                  }

                  const audioBuffer: AudioBuffer = {
                    data: audioChunk,
                    format: AudioFormatEnum.PCM_16,
                    sampleRate: 16000,
                    duration: (audioChunk.length / 2 / 16000) * 1000,
                    channels: 1,
                  };

                  yield audioBuffer;
                }
              }
            } finally {
              streamReader.releaseLock();
            }
          } else {
            // System mode fallback: synthesize chunk by chunk
            const audio = await this.synthesize(textToSynthesize, options);
            yield audio;
          }
        }

        if (done) {
          break;
        }
      }

      // Process remaining text buffer
      if (textBuffer.trim().length > 0) {
        const audio = await this.synthesize(textBuffer.trim(), options);
        yield audio;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Transcribe audio to text (not supported by Kokoro - TTS only)
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    throw new VoiceProviderError(
      'Kokoro is a TTS-only provider, transcription not supported',
      this.id,
      'TRANSCRIPTION_NOT_SUPPORTED',
    );
  }

  /**
   * Stream transcription (not supported by Kokoro - TTS only)
   */
  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk> {
    throw new VoiceProviderError(
      'Kokoro is a TTS-only provider, transcription not supported',
      this.id,
      'TRANSCRIPTION_NOT_SUPPORTED',
    );
  }

  /**
   * Get event emitter for monitoring
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  /**
   * Get current deployment mode
   */
  getDeploymentMode(): string {
    return this.config.mode;
  }

  /**
   * Get deployment configuration
   */
  getDeploymentConfig(): DeploymentConfig {
    return this.config;
  }
}
