/**
 * Deepgram STT Provider Implementation
 *
 * Integrates Deepgram's Flux STT model for real-time speech-to-text with:
 * - Built-in turn detection (no post-processing needed)
 * - <300ms latency for conversational responses
 * - 36+ languages and dialects support
 * - Interruption handling
 * - Speaker identification (diarization)
 * - WebSocket streaming for real-time transcription
 *
 * Documentation: https://developers.deepgram.com/reference/streaming-pre-recorded-audio
 */

import type {
  AudioBuffer,
  ProviderCapabilities,
  TranscribeOptions,
  TranscriptionChunk,
  TranscriptionResult,
  SynthesisOptions,
} from './executor.js';
import {
  AudioFormat,
  BaseVoiceProviderExecutor,
  VoiceProviderError,
} from './executor.js';

/**
 * Deepgram configuration interface
 */
export interface DeepgramConfig {
  apiKey: string;
  model?: 'nova-v3' | 'flux';
  language?: string;
  enableTurnDetection?: boolean;
  detectLanguage?: boolean;
  smartFormat?: boolean;
  diarize?: boolean;
  numSpeakers?: number;
  redirects?: number;
  apiUrl?: string;
}

/**
 * Deepgram streaming configuration
 */
interface DeepgramStreamConfig {
  model: string;
  language?: string;
  punctuate: boolean;
  tier: 'nova' | 'enhanced';
  no_delay: boolean;
  encoding: 'linear16' | 'opusenc' | 'aac';
  sample_rate: number;
  channels: number;
  bit_depth: 16 | 24;
  vad_events: boolean;
  utterance_end_ms: number;
  speech_final: boolean;
  interim_results: boolean;
  endpointing: '100ms_plus';
}

/**
 * Deepgram API response for transcription
 */
interface DeepgramResponse {
  result: {
    results: Array<{
      final: boolean;
      speech_final: boolean;
      punctuated_result?: {
        transcript: string;
        confidence: number;
      };
      alternatives?: Array<{
        transcript: string;
        confidence: number;
      }>;
    }>;
  };
  metadata: {
    request_uuid: string;
    model_uuid: string;
    model_info: {
      name: string;
      version: string;
      uuid: string;
      arch: string;
    };
  };
}

/**
 * Deepgram turn detection event
 */
interface TurnDetectionEvent {
  type: 'speaking' | 'silence' | 'turn_end';
  timestamp: number;
  confidence?: number;
}

/**
 * Deepgram streaming metadata
 */
interface DeepgramStreamMetadata {
  requestId: string;
  modelInfo: {
    name: string;
    version: string;
  };
  language: string;
  turnDetection: TurnDetectionEvent[];
  speakerId?: number;
  confidence: number;
}

/**
 * Deepgram Executor for Flux STT
 *
 * Handles real-time transcription with native turn detection,
 * perfect for voice agents requiring immediate conversation flow.
 */
export class DeepgramExecutor extends BaseVoiceProviderExecutor {
  readonly id: string;
  private apiKey: string;
  private model: 'nova-v3' | 'flux';
  private language: string;
  private enableTurnDetection: boolean;
  private detectLanguage: boolean;
  private smartFormat: boolean;
  private diarize: boolean;
  private numSpeakers?: number;
  private redirects: number;
  private apiBaseUrl: string;
  private wsBaseUrl: string;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck: number = 0;
  private healthCheckCache: boolean = false;

  constructor(
    id: string,
    config: DeepgramConfig,
  ) {
    super();
    this.id = id;
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'flux';
    this.language = config.language ?? 'en-US';
    this.enableTurnDetection = config.enableTurnDetection ?? true;
    this.detectLanguage = config.detectLanguage ?? false;
    this.smartFormat = config.smartFormat ?? true;
    this.diarize = config.diarize ?? false;
    this.numSpeakers = config.numSpeakers;
    this.redirects = 0;
    this.apiBaseUrl = config.apiUrl ?? 'https://api.deepgram.com/v1';
    this.wsBaseUrl = 'wss://api.deepgram.com/v1/listen';
  }

  /**
   * Initialize executor
   */
  async initialize(): Promise<void> {
    // Validate API key
    if (!this.apiKey) {
      throw new VoiceProviderError(
        'Deepgram API key is required',
        this.id,
        'MISSING_API_KEY',
      );
    }

    // Perform initial health check
    await this.performHealthCheck();

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.warn(`Deepgram health check failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 60000); // Every minute
  }

  /**
   * Shutdown executor and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Transcribe audio (batch mode)
   *
   * For batch transcription, use the REST API
   */
  async transcribe(
    audio: AudioBuffer,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    try {
      // Validate audio
      if (!audio.data || audio.data.length === 0) {
        throw new VoiceProviderError(
          'Audio data is empty',
          this.id,
          'EMPTY_AUDIO',
        );
      }

      // Prepare request
      const url = new URL(`${this.apiBaseUrl}/listen`);
      url.searchParams.append('model', this.model);

      const language = options?.language ?? this.language;
      url.searchParams.append('language', language);

      // Add optional parameters
      if (this.enableTurnDetection) {
        url.searchParams.append('utterance_end_ms', '800');
        url.searchParams.append('vad_events', 'true');
      }

      if (this.smartFormat) {
        url.searchParams.append('smart_format', 'true');
      }

      if (this.diarize) {
        url.searchParams.append('diarize', 'true');
        if (this.numSpeakers) {
          url.searchParams.append('num_speakers', String(this.numSpeakers));
        }
      }

      if (this.detectLanguage) {
        url.searchParams.append('detect_language', 'true');
      }

      url.searchParams.append('punctuate', 'true');
      url.searchParams.append('tier', 'nova');

      // Prepare content type based on audio format
      const contentType = this.getContentType(audio.format);

      // Make request
      const timeout = options?.timeout ?? 30000;
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': contentType,
          },
          body: Buffer.from(audio.data),
          signal: controller.signal,
        });

        clearTimeout(timeoutHandle);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new VoiceProviderError(
            `HTTP ${response.status}: ${errorBody}`,
            this.id,
            `HTTP_${response.status}`,
          );
        }

        const result: DeepgramResponse = await response.json();
        const transcript = this.extractTranscript(result);
        const confidence = this.extractConfidence(result);

        return {
          text: transcript,
          confidence,
          language,
          duration: audio.duration,
          provider: this.id,
        };
      } finally {
        clearTimeout(timeoutHandle);
      }
    } catch (error) {
      if (error instanceof VoiceProviderError) {
        throw error;
      }

      throw new VoiceProviderError(
        error instanceof Error ? error.message : String(error),
        this.id,
        'TRANSCRIPTION_FAILED',
      );
    }
  }

  /**
   * Transcribe audio stream (real-time mode)
   *
   * Uses WebSocket for real-time streaming with native turn detection.
   * Yields transcription chunks and turn detection events.
   */
  async *transcribeStream(
    audioStream: ReadableStream<AudioBuffer>,
    options?: TranscribeOptions,
  ): AsyncIterable<TranscriptionChunk> {
    let ws: WebSocket | undefined;
    let streamMetadata: DeepgramStreamMetadata | undefined;

    // Message queue for handler → generator communication
    const messageQueue: TranscriptionChunk[] = [];
    let streamComplete = false;
    let streamError: Error | null = null;

    try {
      // Build WebSocket URL with parameters
      const wsUrl = this.buildWebSocketUrl(options);

      // Create WebSocket connection
      ws = new WebSocket(wsUrl);

      // Create promise for connection ready
      const connectionReady = new Promise<void>((resolve, reject) => {
        ws!.onopen = () => {
          resolve();
        };
        ws!.onerror = (error) => {
          reject(new VoiceProviderError(
            `WebSocket connection failed: ${error}`,
            this.id,
            'WS_CONNECTION_FAILED',
          ));
        };
      });

      // Wait for connection
      await connectionReady;

      // Track last utterance time for turn detection
      let lastUtteranceTime = Date.now();
      let isSpeaking = false;

      // Setup message handler
      ws.onmessage = (event) => {

        try {
          const message = JSON.parse(String(event.data)) as DeepgramResponse | any;

          // Extract metadata
          if (message.metadata) {
            streamMetadata = {
              requestId: message.metadata.request_uuid,
              modelInfo: {
                name: message.metadata.model_info.name,
                version: message.metadata.model_info.version,
              },
              language: options?.language ?? this.language,
              turnDetection: [],
              confidence: 0,
            };
          }

          // Process results
          if (message.result?.results) {
            for (const result of message.result.results) {
              if (result.punctuated_result?.transcript) {
                const transcript = result.punctuated_result.transcript;
                const confidence = result.punctuated_result.confidence;

                lastUtteranceTime = Date.now();
                isSpeaking = true;

                // Yield intermediate or final result
                if (result.final || result.speech_final) {
                  messageQueue.push({
                    text: transcript,
                    partial: false,
                    timestamp: Date.now(),
                    confidence,
                  });
                } else {
                  messageQueue.push({
                    text: transcript,
                    partial: true,
                    timestamp: Date.now(),
                    confidence,
                  });
                }
              }
            }
          }

          // Handle VAD events for turn detection
          if (message.is_final) {
            if (isSpeaking) {
              isSpeaking = false;
              // Turn ended
              if (streamMetadata) {
                streamMetadata.turnDetection.push({
                  type: 'turn_end',
                  timestamp: Date.now(),
                });
              }
            }
          }
        } catch (error) {
          streamError = error instanceof Error ? error : new Error(String(error));
          console.error(`Error processing WebSocket message: ${streamError.message}`);
        }
      };

      // Setup error handler
      ws.onerror = (error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        streamError = new Error(`WebSocket error: ${errorMsg}`);
        console.error(streamError.message);
      };

      // Stream audio chunks
      const reader = audioStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (ws && ws.readyState === WebSocket.OPEN) {
            // Send audio data as binary
            ws.send(value.data);
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Signal end of stream
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'FinishStream' }));
      }

      // Wait for final response and yield messages
      let connectionClosed = false;
      const closePromise = new Promise<void>((resolve) => {
        if (ws) {
          ws.onclose = () => {
            connectionClosed = true;
            resolve();
          };
          setTimeout(() => {
            connectionClosed = true;
            resolve();
          }, 5000); // Timeout after 5 seconds
        } else {
          connectionClosed = true;
          resolve();
        }
      });

      // Yield messages until stream completes
      while (!connectionClosed) {
        // Check for any errors
        if (streamError) {
          throw streamError;
        }

        // Yield all queued messages
        while (messageQueue.length > 0) {
          const chunk = messageQueue.shift();
          if (chunk) {
            yield chunk;
          }
        }

        // Wait a bit before checking again
        await Promise.race([
          closePromise,
          new Promise<void>((resolve) => setTimeout(resolve, 50)),
        ]);
      }

      // Yield any final remaining messages
      while (messageQueue.length > 0) {
        const chunk = messageQueue.shift();
        if (chunk) {
          yield chunk;
        }
      }
    } catch (error) {
      throw new VoiceProviderError(
        error instanceof Error ? error.message : String(error),
        this.id,
        'STREAM_TRANSCRIPTION_FAILED',
      );
    } finally {
      if (ws) {
        ws.close();
      }
    }
  }

  /**
   * Synthesize text to speech (not supported by Deepgram)
   *
   * Deepgram specializes in STT. For TTS, use another provider.
   */
  async synthesize(
    text: string,
    options?: SynthesisOptions,
  ): Promise<AudioBuffer> {
    throw new VoiceProviderError(
      'Deepgram does not support text-to-speech. Use TTS-specific provider.',
      this.id,
      'UNSUPPORTED_OPERATION',
    );
  }

  /**
   * Synthesize stream (not supported by Deepgram)
   */
  async *synthesizeStream(
    textStream: ReadableStream<string>,
    options?: SynthesisOptions,
  ): AsyncIterable<AudioBuffer> {
    throw new VoiceProviderError(
      'Deepgram does not support text-to-speech. Use TTS-specific provider.',
      this.id,
      'UNSUPPORTED_OPERATION',
    );
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportedFormats: [
        AudioFormat.PCM_16,
        AudioFormat.OPUS,
        AudioFormat.AAC,
        AudioFormat.MP3,
      ],
      supportedSampleRates: [8000, 16000, 48000],
      supportedLanguages: [
        'en-US',
        'en-GB',
        'en-AU',
        'en-IN',
        'es-ES',
        'es-MX',
        'fr-FR',
        'de-DE',
        'it-IT',
        'ja-JP',
        'zh-CN',
        'zh-TW',
        'ko-KR',
        'ru-RU',
        'pt-BR',
        'pt-PT',
        'nl-NL',
        'tr-TR',
        'ar-SA',
        'hi-IN',
      ],
      supportsStreaming: true,
      maxConcurrentSessions: 100,
      estimatedLatencyMs: 250,
      requiresNetworkConnection: true,
      requiresLocalModel: false,
    };
  }

  /**
   * Check provider health
   */
  async isHealthy(): Promise<boolean> {
    // Use cached result if recent (within 10 seconds)
    const now = Date.now();
    if (now - this.lastHealthCheck < 10000) {
      return this.healthCheckCache;
    }

    return this.performHealthCheck();
  }

  /**
   * Perform health check via API
   */
  private async performHealthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      this.lastHealthCheck = Date.now();
      this.healthCheckCache = response.ok;
      return response.ok;
    } catch (error) {
      this.lastHealthCheck = Date.now();
      this.healthCheckCache = false;
      return false;
    }
  }

  /**
   * Build WebSocket URL with query parameters
   */
  private buildWebSocketUrl(options?: TranscribeOptions): string {
    const url = new URL(this.wsBaseUrl);

    url.searchParams.append('model', this.model);

    const language = options?.language ?? this.language;
    url.searchParams.append('language', language);

    // Turn detection parameters
    if (this.enableTurnDetection) {
      url.searchParams.append('utterance_end_ms', '800');
      url.searchParams.append('vad_events', 'true');
    }

    // Formatting options
    url.searchParams.append('punctuate', 'true');
    if (this.smartFormat) {
      url.searchParams.append('smart_format', 'true');
    }

    // Speaker identification
    if (this.diarize) {
      url.searchParams.append('diarize', 'true');
      if (this.numSpeakers) {
        url.searchParams.append('num_speakers', String(this.numSpeakers));
      }
    }

    // Language detection
    if (this.detectLanguage) {
      url.searchParams.append('detect_language', 'true');
    }

    // Streaming options
    url.searchParams.append('tier', 'nova');
    url.searchParams.append('interim_results', 'true');
    url.searchParams.append('encoding', 'linear16');

    // Authentication
    url.searchParams.append('Authorization', `Token ${this.apiKey}`);

    return url.toString();
  }

  /**
   * Extract main transcript from response
   */
  private extractTranscript(response: DeepgramResponse): string {
    if (!response.result?.results) {
      return '';
    }

    const transcripts: string[] = [];

    for (const result of response.result.results) {
      if (result.punctuated_result?.transcript) {
        transcripts.push(result.punctuated_result.transcript);
      } else if (result.alternatives?.[0]?.transcript) {
        transcripts.push(result.alternatives[0].transcript);
      }
    }

    return transcripts.join(' ').trim();
  }

  /**
   * Extract confidence score from response
   */
  private extractConfidence(response: DeepgramResponse): number {
    if (!response.result?.results) {
      return 0;
    }

    let totalConfidence = 0;
    let count = 0;

    for (const result of response.result.results) {
      if (result.punctuated_result?.confidence) {
        totalConfidence += result.punctuated_result.confidence;
        count++;
      } else if (result.alternatives?.[0]?.confidence) {
        totalConfidence += result.alternatives[0].confidence;
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  /**
   * Get content type for audio format
   */
  private getContentType(format: AudioFormat): string {
    switch (format) {
      case AudioFormat.PCM_16:
        return 'audio/wav';
      case AudioFormat.OPUS:
        return 'audio/opus';
      case AudioFormat.AAC:
        return 'audio/aac';
      case AudioFormat.MP3:
        return 'audio/mpeg';
      case AudioFormat.VORBIS:
        return 'audio/ogg';
      default:
        return 'audio/wav';
    }
  }
}

export default DeepgramExecutor;
