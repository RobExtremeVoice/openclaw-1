/**
 * Tests for Signal Voice Call Response Handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignalVoiceCallResponseHandler } from './call-response-handler.js';
import type { SignalRpcOptions } from '../client.js';
import type { VoiceCall } from './call-handler.js';
import type { VoiceProviderExecutor, AudioBuffer } from '../../media/voice-providers/executor.js';

// Mock Signal RPC
vi.mock('../client.js', () => ({
  signalRpcRequest: vi.fn(),
}));

import { signalRpcRequest } from '../client.js';

describe('SignalVoiceCallResponseHandler', () => {
  let handler: SignalVoiceCallResponseHandler;
  let rpcOptions: SignalRpcOptions;
  let mockRuntime: any;
  let mockTranscriptionProvider: VoiceProviderExecutor;
  let mockTtsProvider: VoiceProviderExecutor;
  let mockCall: VoiceCall;

  beforeEach(() => {
    rpcOptions = {
      baseUrl: 'http://localhost:8080',
    };

    mockRuntime = {
      log: vi.fn(),
      error: vi.fn(),
    };

    // Mock transcription provider
    mockTranscriptionProvider = {
      id: 'whisper-test',
      transcribe: vi.fn().mockResolvedValue({
        text: 'Hello, can you hear me?',
        confidence: 0.95,
        language: 'en',
        duration: 2000,
        provider: 'whisper-test',
      }),
      transcribeStream: vi.fn(),
      synthesize: vi.fn(),
      synthesizeStream: vi.fn(),
      initialize: vi.fn(),
      shutdown: vi.fn(),
      getCapabilities: vi.fn(),
      isHealthy: vi.fn(),
    } as unknown as VoiceProviderExecutor;

    // Mock TTS provider
    mockTtsProvider = {
      id: 'cartesia-test',
      synthesize: vi.fn().mockResolvedValue({
        data: new Uint8Array([1, 2, 3, 4, 5]),
        format: 'opus',
        sampleRate: 48000,
        duration: 1000,
        channels: 1,
      } as AudioBuffer),
      synthesizeStream: vi.fn(),
      transcribe: vi.fn(),
      transcribeStream: vi.fn(),
      initialize: vi.fn(),
      shutdown: vi.fn(),
      getCapabilities: vi.fn(),
      isHealthy: vi.fn(),
    } as unknown as VoiceProviderExecutor;

    // Mock call
    mockCall = {
      callId: 'test-call-1',
      caller: '+15551234567',
      type: '1:1',
      state: 'connected',
      startTime: Date.now(),
      participants: [],
      encrypted: true,
      encryptionVerified: true,
      audioFormat: 'opus',
      sampleRate: 48000,
      channels: 1,
    };

    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (handler) {
      await handler.cleanup();
    }
  });

  describe('initialization', () => {
    it('should initialize with providers', async () => {
      handler = new SignalVoiceCallResponseHandler(rpcOptions, {}, mockRuntime);

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });

      expect(handler).toBeDefined();
    });

    it('should fail initialization without required providers', async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        { enableTranscription: true },
        mockRuntime,
      );

      await expect(
        handler.initialize({
          ttsProvider: mockTtsProvider,
        }),
      ).rejects.toThrow('Transcription enabled but no provider configured');
    });

    it('should initialize with custom config', async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          maxLatencyMs: 200,
          bufferSizeMs: 50,
          enableTranscription: true,
          agentEnabled: true,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });

      expect(handler).toBeDefined();
    });
  });

  describe('audio streaming', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: false, // Disable for basic streaming tests
          agentEnabled: false,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });
    });

    it('should start audio streaming', async () => {
      // Mock no audio available initially
      vi.mocked(signalRpcRequest).mockResolvedValue({
        chunks: [],
        hasMore: false,
      });

      const promise = handler.startStreaming(mockCall, 'stream-123');

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Stop streaming
      await handler.stopStreaming();

      await promise;
    });

    it('should emit audio received events', async () => {
      const audioReceivedPromise = new Promise<any>((resolve) => {
        handler.on('audio:received', (chunk) => {
          resolve(chunk);
        });
      });

      // Mock audio chunks
      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        chunks: [
          {
            data: Buffer.from([1, 2, 3, 4]).toString('base64'),
            timestamp: Date.now(),
          },
        ],
        hasMore: false,
      });

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      const chunk = await audioReceivedPromise;
      expect(chunk).toBeDefined();
      expect(chunk.format).toBe('opus');
      expect(chunk.sampleRate).toBe(48000);

      await handler.stopStreaming();
      await streamPromise;
    });
  });

  describe('transcription', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: true,
          agentEnabled: false, // Disable agent for transcription-only tests
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });
    });

    it('should transcribe audio chunks', async () => {
      const transcriptionPromise = new Promise<string>((resolve) => {
        handler.on('transcription:ready', (text) => {
          resolve(text);
        });
      });

      // Mock audio chunk
      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        chunks: [
          {
            data: Buffer.from(new Uint8Array(100)).toString('base64'),
            timestamp: Date.now(),
          },
        ],
        hasMore: false,
      });

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      const transcribedText = await transcriptionPromise;
      expect(transcribedText).toBe('Hello, can you hear me?');
      expect(mockTranscriptionProvider.transcribe).toHaveBeenCalled();

      await handler.stopStreaming();
      await streamPromise;
    });

    it('should not log transcription when disabled', async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: true,
          disableTextLogging: true,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        chunks: [
          {
            data: Buffer.from(new Uint8Array(100)).toString('base64'),
            timestamp: Date.now(),
          },
        ],
        hasMore: false,
      });

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      await new Promise(resolve => setTimeout(resolve, 100));

      await handler.stopStreaming();
      await streamPromise;

      // Runtime log should not contain transcription text
      const logCalls = (mockRuntime.log as any).mock.calls;
      const hasTranscriptionLog = logCalls.some((call: any[]) =>
        call[0]?.includes('Transcription:'),
      );
      expect(hasTranscriptionLog).toBe(false);
    });
  });

  describe('agent responses', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: true,
          agentEnabled: true,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });
    });

    it('should generate agent response from transcription', async () => {
      const agentResponsePromise = new Promise<string>((resolve) => {
        handler.on('agent:response', (text) => {
          resolve(text);
        });
      });

      const ttsPromise = new Promise<AudioBuffer>((resolve) => {
        handler.on('tts:synthesized', (audio) => {
          resolve(audio);
        });
      });

      // Mock successful audio send
      vi.mocked(signalRpcRequest)
        .mockResolvedValueOnce({
          // receiveCallAudio
          chunks: [
            {
              data: Buffer.from(new Uint8Array(100)).toString('base64'),
              timestamp: Date.now(),
            },
          ],
          hasMore: false,
        })
        .mockResolvedValue({}); // sendCallAudio

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      const responseText = await agentResponsePromise;
      expect(responseText).toContain('I heard you say');

      const audio = await ttsPromise;
      expect(audio).toBeDefined();
      expect(mockTtsProvider.synthesize).toHaveBeenCalled();

      await handler.stopStreaming();
      await streamPromise;
    });

    it('should handle TTS synthesis errors gracefully', async () => {
      const errorPromise = new Promise<[Error, string]>((resolve) => {
        handler.on('error', (error, stage) => {
          resolve([error, stage]);
        });
      });

      // Mock TTS failure
      vi.mocked(mockTtsProvider.synthesize).mockRejectedValueOnce(
        new Error('TTS synthesis failed'),
      );

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        chunks: [
          {
            data: Buffer.from(new Uint8Array(100)).toString('base64'),
            timestamp: Date.now(),
          },
        ],
        hasMore: false,
      });

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      const [error, stage] = await errorPromise;
      expect(error.message).toContain('synthesis');
      expect(stage).toBe('tts-synthesis');

      await handler.stopStreaming();
      await streamPromise;
    });
  });

  describe('audio sending', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: false,
          agentEnabled: false,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });
    });

    it('should emit audio sent events', async () => {
      // Create new handler with agent enabled to trigger audio sending
      const agentHandler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: true,
          agentEnabled: true,
        },
        mockRuntime,
      );

      await agentHandler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });

      // Set up listener on the correct handler instance
      const audioSentPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('audio:sent event timeout'));
        }, 10000);

        agentHandler.on('audio:sent', (chunk) => {
          clearTimeout(timeout);
          resolve(chunk);
        });
      });

      vi.mocked(signalRpcRequest)
        .mockResolvedValueOnce({
          chunks: [
            {
              data: Buffer.from(new Uint8Array(100)).toString('base64'),
              timestamp: Date.now(),
            },
          ],
          hasMore: false,
        })
        .mockResolvedValue({}); // sendCallAudio

      const streamPromise = agentHandler.startStreaming(mockCall, 'stream-123');

      const sentChunk = await audioSentPromise;
      expect(sentChunk).toBeDefined();
      expect(sentChunk.format).toBe('opus');

      await agentHandler.stopStreaming();
      await streamPromise;
      await agentHandler.cleanup();
    });
  });

  describe('latency tracking', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          maxLatencyMs: 300,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });
    });

    it('should track latency metrics', async () => {
      // Create handler with transcription enabled to generate latency events
      const latencyHandler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: true,
          agentEnabled: false,
        },
        mockRuntime,
      );

      await latencyHandler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });

      // Set up listener on the correct handler instance
      const latencyPromise = new Promise<[number, string]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('latency:measured event timeout'));
        }, 10000);

        latencyHandler.on('latency:measured', (latencyMs, stage) => {
          clearTimeout(timeout);
          resolve([latencyMs, stage]);
        });
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        chunks: [
          {
            data: Buffer.from(new Uint8Array(100)).toString('base64'),
            timestamp: Date.now(),
          },
        ],
        hasMore: false,
      });

      const streamPromise = latencyHandler.startStreaming(mockCall, 'stream-123');

      const [latencyMs, stage] = await latencyPromise;
      expect(latencyMs).toBeGreaterThanOrEqual(0);
      expect(stage).toBeTruthy();

      await latencyHandler.stopStreaming();
      await streamPromise;
      await latencyHandler.cleanup();
    });

    it('should calculate average latency', async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: true,
          agentEnabled: false,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });

      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        chunks: [
          {
            data: Buffer.from(new Uint8Array(100)).toString('base64'),
            timestamp: Date.now(),
          },
        ],
        hasMore: false,
      });

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await handler.stopStreaming();
      await streamPromise;

      const avgTranscriptionLatency = handler.getAverageLatency('transcription');
      expect(avgTranscriptionLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('privacy', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallResponseHandler(
        rpcOptions,
        {
          enableTranscription: true,
          clearMemoryOnEnd: true,
          disableAudioLogging: true,
          disableTextLogging: true,
        },
        mockRuntime,
      );

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });
    });

    it('should clear memory on stream end', async () => {
      vi.mocked(signalRpcRequest).mockResolvedValueOnce({
        chunks: [
          {
            data: Buffer.from(new Uint8Array(100)).toString('base64'),
            timestamp: Date.now(),
          },
        ],
        hasMore: false,
      });

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      await new Promise(resolve => setTimeout(resolve, 100));

      await handler.stopStreaming();
      await streamPromise;

      // Memory should be cleared (checked via logging)
      const logCalls = (mockRuntime.log as any).mock.calls;
      const hasMemoryClearLog = logCalls.some((call: any[]) =>
        call[0]?.includes('memory cleared'),
      );
      expect(hasMemoryClearLog).toBe(true);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      handler = new SignalVoiceCallResponseHandler(rpcOptions, {}, mockRuntime);

      await handler.initialize({
        transcriptionProvider: mockTranscriptionProvider,
        ttsProvider: mockTtsProvider,
      });
    });

    it('should cleanup resources', async () => {
      vi.mocked(signalRpcRequest).mockResolvedValue({
        chunks: [],
        hasMore: false,
      });

      const streamPromise = handler.startStreaming(mockCall, 'stream-123');

      await new Promise(resolve => setTimeout(resolve, 50));

      await handler.cleanup();

      await streamPromise;
    });
  });
});
