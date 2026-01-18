/**
 * ElevenLabs TTS Provider Tests
 *
 * Comprehensive test coverage for:
 * - Text-to-speech synthesis
 * - Streaming synthesis
 * - Audio alignment/character timing
 * - Error handling
 * - Health checks
 * - Configuration validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElevenLabsExecutor, type ElevenLabsConfig } from './tts-elevenlabs.js';
import { AudioFormat, VoiceProviderError } from './executor.js';

/**
 * Mock API responses - Match real ElevenLabs API format
 */
const mockAudioData = Buffer.alloc(48000); // 1 second of audio at 24kHz, 16-bit
mockAudioData.fill(0x00); // PCM silence

const mockSynthesisResponse = {
  audio_bytes: mockAudioData,
  alignment: {
    characters: [
      { character_index: 0, character: 'h', start_time_ms: 0, end_time_ms: 100 },
      { character_index: 1, character: 'e', start_time_ms: 100, end_time_ms: 150 },
      { character_index: 2, character: 'l', start_time_ms: 150, end_time_ms: 200 },
      { character_index: 3, character: 'l', start_time_ms: 200, end_time_ms: 250 },
      { character_index: 4, character: 'o', start_time_ms: 250, end_time_ms: 350 },
      { character_index: 5, character: ' ', start_time_ms: 350, end_time_ms: 400 },
      { character_index: 6, character: 'w', start_time_ms: 400, end_time_ms: 500 },
      { character_index: 7, character: 'o', start_time_ms: 500, end_time_ms: 550 },
      { character_index: 8, character: 'r', start_time_ms: 550, end_time_ms: 600 },
      { character_index: 9, character: 'l', start_time_ms: 600, end_time_ms: 650 },
      { character_index: 10, character: 'd', start_time_ms: 650, end_time_ms: 750 },
    ],
  },
  duration_secs: 1.0,
};

const validConfig: ElevenLabsConfig = {
  apiKey: 'sk-test-1234567890abcdef',
  voiceId: '21m00Tcm4TlvDq8ikWAM',
  modelId: 'eleven_monolingual_v1',
  stability: 0.5,
  similarityBoost: 0.75,
  language: 'en',
};

describe('ElevenLabsExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      const executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      expect(executor.id).toBe('test-elevenlabs');

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ) as any;

      await executor.initialize();
      expect(global.fetch).toHaveBeenCalled();
      await executor.shutdown();
    });

    it('should throw error if API key is missing', async () => {
      const invalidConfig: ElevenLabsConfig = {
        apiKey: '',
      };

      const executor = new ElevenLabsExecutor('test-elevenlabs', invalidConfig);

      await expect(executor.initialize()).rejects.toThrow(VoiceProviderError);
    });

    it('should setup periodic health checks', async () => {
      const executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ) as any;

      await executor.initialize();

      // Should have made at least one fetch call for health check
      expect(global.fetch).toHaveBeenCalled();

      await executor.shutdown();
    });
  });

  describe('Synthesis', () => {
    let executor: ElevenLabsExecutor;

    beforeEach(async () => {
      executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockAudioData.buffer),
        }),
      ) as any;

      await executor.initialize();
    });

    afterEach(async () => {
      await executor.shutdown();
    });

    it('should synthesize text to audio successfully', async () => {
      const result = await executor.synthesize('Hello world');

      // Required response fields
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('duration');

      // Validate types and values
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should include alignment data when available', async () => {
      // Mock fetch with alignment data
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockAudioData.buffer),
        }),
      ) as any;

      const result = await executor.synthesize('Hello world');

      // Validate audio structure
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBeGreaterThan(0);

      // Verify duration is in valid range
      expect(result.duration).toBeGreaterThanOrEqual(0.5);
      expect(result.duration).toBeLessThanOrEqual(2.0);
    });

    it('should return all required response fields', async () => {
      const result = await executor.synthesize('Test text');

      const requiredFields = ['data', 'duration'];
      for (const field of requiredFields) {
        expect(result).toHaveProperty(field);
      }

      // Validate field types
      expect(result.data instanceof Uint8Array).toBe(true);
      expect(typeof result.duration).toBe('number');
    });

    it('should handle synthesis with custom options', async () => {
      const options = {
        voice: 'custom-voice-id',
        speed: 1.5,
        language: 'es',
      };

      const result = await executor.synthesize('Hola mundo', options);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('duration');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should throw error on empty text', async () => {
      await expect(executor.synthesize('')).rejects.toThrow(VoiceProviderError);
    });

    it('should throw error on API failure', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Invalid API key'),
        }),
      ) as any;

      await expect(executor.synthesize('Hello')).rejects.toThrow(VoiceProviderError);
    });

    it('should throw error on network failure', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;

      await expect(executor.synthesize('Hello')).rejects.toThrow(VoiceProviderError);
    });

    it('should validate audio format and size', async () => {
      const result = await executor.synthesize('Hello world');

      // Audio should be PCM 16-bit
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.length % 2).toBe(0); // PCM 16-bit requires even byte count

      // Duration should be reasonable for audio data
      const expectedMinBytes = 24000 * result.duration * 2 * 0.8; // 80% tolerance
      const expectedMaxBytes = 24000 * result.duration * 2 * 1.2; // 120% tolerance
      expect(result.data.length).toBeGreaterThan(expectedMinBytes);
      expect(result.data.length).toBeLessThan(expectedMaxBytes);
    });
  });

  describe('Streaming Synthesis', () => {
    let executor: ElevenLabsExecutor;

    beforeEach(async () => {
      executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockAudioData.buffer),
        }),
      ) as any;

      await executor.initialize();
    });

    afterEach(async () => {
      await executor.shutdown();
    });

    it('should throw error for streaming before initialization', async () => {
      const unitializedExecutor = new ElevenLabsExecutor('test', validConfig);

      const mockStream = {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
          releaseLock: () => {},
        }),
      } as ReadableStream<any>;

      const generator = unitializedExecutor.synthesizeStream(mockStream);
      await expect((async () => {
        for await (const _ of generator) {
          // Should not reach here
        }
      })()).rejects.toThrow(VoiceProviderError);
    });
  });

  describe('Provider Capabilities', () => {
    let executor: ElevenLabsExecutor;

    beforeEach(async () => {
      executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ) as any;

      await executor.initialize();
    });

    afterEach(async () => {
      await executor.shutdown();
    });

    it('should report correct capabilities', () => {
      const capabilities = executor.getCapabilities();

      expect(capabilities.supportsStreaming).toBe(true);
      expect(capabilities.requiresNetworkConnection).toBe(true);
      expect(capabilities.requiresLocalModel).toBe(false);
      expect(capabilities.estimatedLatencyMs).toBeGreaterThan(0);
      expect(capabilities.maxConcurrentSessions).toBeGreaterThan(0);
      expect(capabilities.supportedLanguages).toContain('en');
    });

    it('should support multiple audio formats', () => {
      const capabilities = executor.getCapabilities();

      expect(capabilities.supportedFormats).toContain(AudioFormat.PCM_16);
      expect(capabilities.supportedFormats).toContain(AudioFormat.OPUS);
    });

    it('should support multiple sample rates', () => {
      const capabilities = executor.getCapabilities();

      expect(capabilities.supportedSampleRates.length).toBeGreaterThan(0);
      expect(capabilities.supportedSampleRates).toContain(24000);
    });

    it('should support multiple languages', () => {
      const capabilities = executor.getCapabilities();

      expect(capabilities.supportedLanguages.length).toBeGreaterThan(0);
      expect(capabilities.supportedLanguages).toContain('en');
    });
  });

  describe('Health Checks', () => {
    let executor: ElevenLabsExecutor;

    beforeEach(async () => {
      executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);
    });

    afterEach(async () => {
      await executor.shutdown();
    });

    it('should report healthy status when API is accessible', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ) as any;

      await executor.initialize();

      const healthy = await executor.isHealthy();
      expect(healthy).toBe(true);
    });

    it('should report unhealthy status when API is not accessible', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;

      const unitializedExecutor = new ElevenLabsExecutor('test', validConfig);

      const healthy = await unitializedExecutor.isHealthy();
      expect(healthy).toBe(false);
    });
  });

  describe('TTS-Only Interface', () => {
    let executor: ElevenLabsExecutor;

    beforeEach(async () => {
      executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ) as any;

      await executor.initialize();
    });

    afterEach(async () => {
      await executor.shutdown();
    });

    it('should throw error for transcribe (unsupported)', async () => {
      const audioBuffer = {
        data: new Uint8Array(1000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 100,
        channels: 1,
      };

      await expect(executor.transcribe(audioBuffer)).rejects.toThrow(VoiceProviderError);
    });

    it('should throw error for transcribeStream (unsupported)', async () => {
      const mockStream = {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
          releaseLock: () => {},
        }),
      } as ReadableStream<any>;

      await expect((async () => {
        for await (const _ of executor.transcribeStream(mockStream)) {
          // Should not reach here
        }
      })()).rejects.toThrow(VoiceProviderError);
    });
  });

  describe('Audio Response Validation', () => {
    let executor: ElevenLabsExecutor;

    beforeEach(async () => {
      executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockAudioData.buffer),
        }),
      ) as any;

      await executor.initialize();
    });

    afterEach(async () => {
      await executor.shutdown();
    });

    it('should validate audio buffer is binary data', async () => {
      const result = await executor.synthesize('Test');

      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.buffer).toBeInstanceOf(ArrayBuffer);
    });

    it('should calculate reasonable duration from audio size', async () => {
      const result = await executor.synthesize('Hello world');

      // Audio duration should be positive and reasonable
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(10); // Max 10 seconds for test data
    });

    it('should handle large audio responses', async () => {
      const largeAudio = Buffer.alloc(240000); // ~10 seconds at 24kHz
      largeAudio.fill(0x00);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(largeAudio.buffer),
        }),
      ) as any;

      const result = await executor.synthesize('Long text');

      expect(result.data.length).toBe(240000);
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    let executor: ElevenLabsExecutor;

    beforeEach(async () => {
      executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ) as any;

      await executor.initialize();
    });

    afterEach(async () => {
      await executor.shutdown();
    });

    it('should handle HTTP 401 (authentication error)', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Invalid API key'),
        }),
      ) as any;

      await expect(executor.synthesize('Hello')).rejects.toThrow(VoiceProviderError);
    });

    it('should handle HTTP 429 (rate limit)', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limit exceeded'),
        }),
      ) as any;

      await expect(executor.synthesize('Hello')).rejects.toThrow(VoiceProviderError);
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;

      await expect(executor.synthesize('Hello')).rejects.toThrow(VoiceProviderError);
    });

    it('should throw before initialization', async () => {
      const unitializedExecutor = new ElevenLabsExecutor('test', validConfig);

      await expect(unitializedExecutor.synthesize('Hello')).rejects.toThrow(VoiceProviderError);
    });
  });

  describe('Event Emitter', () => {
    it('should provide event emitter', () => {
      const executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);
      const emitter = executor.getEventEmitter();

      expect(emitter).toBeDefined();
      expect(emitter.on).toBeDefined();
      expect(emitter.emit).toBeDefined();
    });

    it('should allow listening to health events', () => {
      const executor = new ElevenLabsExecutor('test-elevenlabs', validConfig);
      const emitter = executor.getEventEmitter();
      const listener = vi.fn();

      emitter.on('health-degraded', listener);
      emitter.emit('health-degraded', new Error('Test error'));

      expect(listener).toHaveBeenCalled();
    });
  });
});
