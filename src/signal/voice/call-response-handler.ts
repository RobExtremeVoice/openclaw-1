/**
 * Signal Voice Call Response & Streaming Handler
 *
 * Privacy-preserving voice call audio streaming with real-time agent responses.
 * Handles bidirectional encrypted audio streams, optional transcription (memory-only),
 * agent response generation, TTS synthesis (no caching), and encrypted response streaming.
 *
 * Features:
 * - Bidirectional encrypted audio streaming (Opus codec)
 * - Optional transcription (memory-only, not logged)
 * - Agent response generation
 * - TTS synthesis without caching/logging
 * - Maintain E2E encryption throughout
 * - Latency-optimized (<300ms end-to-end target)
 * - Privacy-first: no audio storage
 * - Graceful cleanup and hangup
 */

import type { SignalRpcOptions } from '../client.js';
import { signalRpcRequest } from '../client.js';
import type { RuntimeEnv } from '../../runtime.js';
import type { AudioBuffer, AudioFormat, SynthesisOptions, TranscribeOptions } from '../../media/voice-providers/executor.js';
import type { VoiceProviderExecutor } from '../../media/voice-providers/executor.js';
import type { VoiceCall } from './call-handler.js';
import { EventEmitter } from 'node:events';

/**
 * Audio chunk for streaming
 */
export interface AudioChunk {
  data: Uint8Array;
  format: 'opus';
  sampleRate: 48000;
  timestamp: number;
  sequenceNumber: number;
}

/**
 * Transcription in memory (never persisted)
 */
interface TranscriptionMemory {
  text: string;
  timestamp: number;
  confidence?: number;
}

/**
 * Call response configuration
 */
export interface CallResponseConfig {
  // Transcription settings
  enableTranscription?: boolean; // Default: true
  transcriptionProvider?: string; // Default: 'whisper'

  // Agent settings
  agentEnabled?: boolean; // Default: true
  agentPrompt?: string;
  agentContextWindow?: number; // Recent transcriptions to include

  // TTS settings
  ttsProvider?: string; // Default: 'cartesia'
  ttsVoice?: string;
  ttsSpeed?: number;

  // Performance settings
  maxLatencyMs?: number; // Target: 300ms
  bufferSizeMs?: number; // Audio buffer duration

  // Privacy settings
  disableAudioLogging?: boolean; // Default: true
  disableTextLogging?: boolean; // Default: true
  clearMemoryOnEnd?: boolean; // Default: true
}

/**
 * Call response events
 */
export interface CallResponseEvents {
  'audio:received': (chunk: AudioChunk) => void;
  'audio:sent': (chunk: AudioChunk) => void;
  'transcription:ready': (text: string) => void;
  'agent:response': (text: string) => void;
  'tts:synthesized': (audio: AudioBuffer) => void;
  'latency:measured': (latencyMs: number, stage: string) => void;
  'error': (error: Error, stage: string) => void;
}

/**
 * Signal Voice Call Response Handler
 *
 * Manages bidirectional audio streaming with agent responses.
 */
export class SignalVoiceCallResponseHandler extends EventEmitter {
  private config: Required<CallResponseConfig>;
  private rpcOptions: SignalRpcOptions;
  private runtime?: RuntimeEnv;

  // Voice providers
  private transcriptionProvider?: VoiceProviderExecutor;
  private ttsProvider?: VoiceProviderExecutor;

  // Active call
  private currentCall?: VoiceCall;
  private streamId?: string;
  private isStreaming = false;

  // Memory-only transcription buffer
  private transcriptionMemory: TranscriptionMemory[] = [];

  // Sequence tracking
  private inboundSequence = 0;
  private outboundSequence = 0;

  // Latency tracking
  private latencyMetrics: Map<string, number[]> = new Map();

  constructor(
    rpcOptions: SignalRpcOptions,
    config: CallResponseConfig = {},
    runtime?: RuntimeEnv,
  ) {
    super();

    this.rpcOptions = rpcOptions;
    this.runtime = runtime;

    // Default configuration (privacy-first)
    this.config = {
      enableTranscription: config.enableTranscription ?? true,
      transcriptionProvider: config.transcriptionProvider ?? 'whisper',
      agentEnabled: config.agentEnabled ?? true,
      agentPrompt: config.agentPrompt ?? 'You are a helpful voice assistant.',
      agentContextWindow: config.agentContextWindow ?? 5, // Last 5 exchanges
      ttsProvider: config.ttsProvider ?? 'cartesia',
      ttsVoice: config.ttsVoice ?? 'default',
      ttsSpeed: config.ttsSpeed ?? 1.0,
      maxLatencyMs: config.maxLatencyMs ?? 300,
      bufferSizeMs: config.bufferSizeMs ?? 100,
      disableAudioLogging: config.disableAudioLogging ?? true,
      disableTextLogging: config.disableTextLogging ?? true,
      clearMemoryOnEnd: config.clearMemoryOnEnd ?? true,
    };
  }

  /**
   * Initialize voice providers
   */
  async initialize(params: {
    transcriptionProvider?: VoiceProviderExecutor;
    ttsProvider?: VoiceProviderExecutor;
  }): Promise<void> {
    this.transcriptionProvider = params.transcriptionProvider;
    this.ttsProvider = params.ttsProvider;

    if (this.config.enableTranscription && !this.transcriptionProvider) {
      throw new Error('Transcription enabled but no provider configured');
    }

    if (this.config.agentEnabled && !this.ttsProvider) {
      throw new Error('Agent enabled but no TTS provider configured');
    }

    this.runtime?.log?.('Call response handler initialized');
  }

  /**
   * Start audio streaming for a call
   */
  async startStreaming(call: VoiceCall, streamId: string): Promise<void> {
    if (this.isStreaming) {
      throw new Error('Already streaming audio');
    }

    this.currentCall = call;
    this.streamId = streamId;
    this.isStreaming = true;
    this.inboundSequence = 0;
    this.outboundSequence = 0;

    this.runtime?.log?.(
      `Starting audio streaming for call ${call.callId} (stream: ${streamId})`
    );

    // Start receiving audio
    this.startReceivingAudio();
  }

  /**
   * Receive encrypted Opus audio from Signal caller
   */
  private async startReceivingAudio(): Promise<void> {
    if (!this.currentCall || !this.streamId) {
      return;
    }

    try {
      // Poll for audio chunks from Signal
      // In a real implementation, this would use WebSocket or SSE
      while (this.isStreaming) {
        const receiveStartTime = Date.now();

        const audioResponse = await signalRpcRequest<{
          chunks?: Array<{
            data: string; // base64 encoded Opus
            timestamp: number;
          }>;
          hasMore: boolean;
        }>(
          'receiveCallAudio',
          {
            callId: this.currentCall.callId,
            streamId: this.streamId,
            maxChunks: 10,
          },
          this.rpcOptions,
        );

        if (audioResponse?.chunks && audioResponse.chunks.length > 0) {
          for (const chunkData of audioResponse.chunks) {
            // Decode base64 Opus audio
            const audioData = Buffer.from(chunkData.data, 'base64');

            const chunk: AudioChunk = {
              data: new Uint8Array(audioData),
              format: 'opus',
              sampleRate: 48000,
              timestamp: chunkData.timestamp,
              sequenceNumber: this.inboundSequence++,
            };

            this.emit('audio:received', chunk);

            // Process audio chunk
            await this.processInboundAudio(chunk);

            // Track receive latency
            const receiveLatency = Date.now() - receiveStartTime;
            this.recordLatency('audio-receive', receiveLatency);
          }
        }

        if (!audioResponse?.hasMore) {
          // No more audio, wait before polling again
          await new Promise(resolve => setTimeout(resolve, this.config.bufferSizeMs));
        }
      }
    } catch (error) {
      this.runtime?.error?.(
        `Audio receiving error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.emit('error', error as Error, 'audio-receive');
    }
  }

  /**
   * Process inbound encrypted audio
   */
  private async processInboundAudio(chunk: AudioChunk): Promise<void> {
    if (!this.config.enableTranscription || !this.transcriptionProvider) {
      return; // Skip transcription
    }

    try {
      const transcribeStartTime = Date.now();

      // Convert Opus to format expected by transcription provider
      const audioBuffer: AudioBuffer = {
        data: chunk.data,
        format: 'opus' as AudioFormat,
        sampleRate: chunk.sampleRate,
        duration: (chunk.data.length / (chunk.sampleRate / 1000)), // Estimate
        channels: 1,
      };

      // Transcribe (in memory only, never persisted)
      const transcription = await this.transcriptionProvider.transcribe(
        audioBuffer,
        {
          language: 'en',
        } as TranscribeOptions,
      );

      const transcribeLatency = Date.now() - transcribeStartTime;
      this.recordLatency('transcription', transcribeLatency);

      if (transcription.text.trim()) {
        // Store in memory buffer (never persisted to disk)
        const memory: TranscriptionMemory = {
          text: transcription.text,
          timestamp: Date.now(),
          confidence: transcription.confidence,
        };

        this.transcriptionMemory.push(memory);

        // Limit memory buffer size (privacy: don't keep unlimited history)
        if (this.transcriptionMemory.length > this.config.agentContextWindow * 2) {
          this.transcriptionMemory = this.transcriptionMemory.slice(-this.config.agentContextWindow * 2);
        }

        if (!this.config.disableTextLogging) {
          this.runtime?.log?.(`Transcription: ${transcription.text}`);
        }

        this.emit('transcription:ready', transcription.text);

        // Generate agent response if enabled
        if (this.config.agentEnabled) {
          await this.generateAgentResponse(transcription.text);
        }
      }

    } catch (error) {
      this.runtime?.error?.(
        `Transcription error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.emit('error', error as Error, 'transcription');
    }
  }

  /**
   * Generate agent response from transcription
   */
  private async generateAgentResponse(userInput: string): Promise<void> {
    try {
      const agentStartTime = Date.now();

      // Build context from recent transcriptions
      const recentTranscriptions = this.transcriptionMemory
        .slice(-this.config.agentContextWindow)
        .map(m => m.text)
        .join('\n');

      // Simple agent response (in production, this would use LLM)
      // For now, echo with acknowledgment
      const responseText = `I heard you say: ${userInput}. How can I help you?`;

      const agentLatency = Date.now() - agentStartTime;
      this.recordLatency('agent-response', agentLatency);

      if (!this.config.disableTextLogging) {
        this.runtime?.log?.(`Agent response: ${responseText}`);
      }

      this.emit('agent:response', responseText);

      // Synthesize and stream response
      await this.synthesizeAndStreamResponse(responseText);

    } catch (error) {
      this.runtime?.error?.(
        `Agent response error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.emit('error', error as Error, 'agent-response');
    }
  }

  /**
   * Synthesize response using TTS (no caching)
   */
  private async synthesizeAndStreamResponse(text: string): Promise<void> {
    if (!this.ttsProvider) {
      return;
    }

    try {
      const ttsStartTime = Date.now();

      // Synthesize audio (privacy mode: no caching)
      const audioBuffer = await this.ttsProvider.synthesize(
        text,
        {
          voice: this.config.ttsVoice,
          speed: this.config.ttsSpeed,
          format: 'opus' as AudioFormat,
          sampleRate: 48000,
        } as SynthesisOptions,
      );

      const ttsLatency = Date.now() - ttsStartTime;
      this.recordLatency('tts-synthesis', ttsLatency);

      this.emit('tts:synthesized', audioBuffer);

      // Stream encrypted response back
      await this.streamEncryptedResponse(audioBuffer);

    } catch (error) {
      this.runtime?.error?.(
        `TTS synthesis error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.emit('error', error as Error, 'tts-synthesis');
    }
  }

  /**
   * Stream encrypted response back to Signal
   */
  private async streamEncryptedResponse(audioBuffer: AudioBuffer): Promise<void> {
    if (!this.currentCall || !this.streamId) {
      return;
    }

    try {
      const streamStartTime = Date.now();

      // Split audio into chunks for streaming
      const chunkSize = Math.floor((this.config.bufferSizeMs / 1000) * audioBuffer.sampleRate * 2); // 16-bit samples
      const chunks: AudioChunk[] = [];

      for (let offset = 0; offset < audioBuffer.data.length; offset += chunkSize) {
        const chunkData = audioBuffer.data.slice(offset, offset + chunkSize);

        const chunk: AudioChunk = {
          data: chunkData,
          format: 'opus',
          sampleRate: 48000,
          timestamp: Date.now(),
          sequenceNumber: this.outboundSequence++,
        };

        chunks.push(chunk);
      }

      // Send chunks to Signal (encrypted)
      for (const chunk of chunks) {
        const sendStartTime = Date.now();

        // Encode chunk data as base64
        const base64Data = Buffer.from(chunk.data).toString('base64');

        await signalRpcRequest(
          'sendCallAudio',
          {
            callId: this.currentCall.callId,
            streamId: this.streamId,
            chunk: {
              data: base64Data,
              timestamp: chunk.timestamp,
              sequenceNumber: chunk.sequenceNumber,
            },
          },
          this.rpcOptions,
        );

        const sendLatency = Date.now() - sendStartTime;
        this.recordLatency('audio-send', sendLatency);

        this.emit('audio:sent', chunk);

        // Small delay between chunks to maintain timing
        await new Promise(resolve => setTimeout(resolve, this.config.bufferSizeMs / 2));
      }

      const totalStreamLatency = Date.now() - streamStartTime;
      this.runtime?.log?.(
        `Streamed ${chunks.length} audio chunks in ${totalStreamLatency}ms`
      );

    } catch (error) {
      this.runtime?.error?.(
        `Audio streaming error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.emit('error', error as Error, 'audio-stream');
    }
  }

  /**
   * Stop audio streaming
   */
  async stopStreaming(): Promise<void> {
    if (!this.isStreaming) {
      return;
    }

    this.runtime?.log?.('Stopping audio streaming...');

    this.isStreaming = false;
    this.currentCall = undefined;
    this.streamId = undefined;

    // Clear memory if configured (privacy)
    if (this.config.clearMemoryOnEnd) {
      this.clearMemory();
    }

    // Log latency summary
    this.logLatencySummary();
  }

  /**
   * Clear transcription memory (privacy)
   */
  private clearMemory(): void {
    this.transcriptionMemory = [];
    this.runtime?.log?.('Transcription memory cleared');
  }

  /**
   * Record latency metric
   */
  private recordLatency(stage: string, latencyMs: number): void {
    if (!this.latencyMetrics.has(stage)) {
      this.latencyMetrics.set(stage, []);
    }

    this.latencyMetrics.get(stage)!.push(latencyMs);

    // Keep only recent metrics (last 100)
    const metrics = this.latencyMetrics.get(stage)!;
    if (metrics.length > 100) {
      this.latencyMetrics.set(stage, metrics.slice(-100));
    }

    this.emit('latency:measured', latencyMs, stage);
  }

  /**
   * Get average latency for a stage
   */
  getAverageLatency(stage: string): number | null {
    const metrics = this.latencyMetrics.get(stage);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const sum = metrics.reduce((acc, val) => acc + val, 0);
    return sum / metrics.length;
  }

  /**
   * Get end-to-end latency
   */
  getEndToEndLatency(): number | null {
    const stages = ['audio-receive', 'transcription', 'agent-response', 'tts-synthesis', 'audio-send'];
    let totalLatency = 0;

    for (const stage of stages) {
      const avgLatency = this.getAverageLatency(stage);
      if (avgLatency === null) {
        return null; // Missing data
      }
      totalLatency += avgLatency;
    }

    return totalLatency;
  }

  /**
   * Log latency summary
   */
  private logLatencySummary(): void {
    const stages = ['audio-receive', 'transcription', 'agent-response', 'tts-synthesis', 'audio-send'];

    this.runtime?.log?.('Latency Summary:');
    for (const stage of stages) {
      const avgLatency = this.getAverageLatency(stage);
      if (avgLatency !== null) {
        this.runtime?.log?.(`  ${stage}: ${avgLatency.toFixed(1)}ms avg`);
      }
    }

    const endToEnd = this.getEndToEndLatency();
    if (endToEnd !== null) {
      this.runtime?.log?.(`  End-to-end: ${endToEnd.toFixed(1)}ms`);

      if (endToEnd > this.config.maxLatencyMs) {
        this.runtime?.log?.(
          `WARNING: End-to-end latency (${endToEnd.toFixed(1)}ms) exceeds target (${this.config.maxLatencyMs}ms)`
        );
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stopStreaming();
    this.clearMemory();
    this.latencyMetrics.clear();
    this.removeAllListeners();

    this.runtime?.log?.('Call response handler cleaned up');
  }
}
