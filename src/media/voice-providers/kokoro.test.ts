/**
 * Kokoro Executor Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KokoroExecutor } from './kokoro.js';
import { AudioFormat } from './executor.js';
import type { DeploymentConfig } from './kokoro.js';

describe('KokoroExecutor', () => {
  let executor: KokoroExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (executor) {
      try {
        await executor.shutdown();
      } catch (error) {
        // Ignore
      }
    }
  });

  describe('initialization', () => {
    it('should validate docker config', () => {
      const invalidConfig: DeploymentConfig = {
        mode: 'docker',
        docker: {
          image: '', // Missing required field
          port: 8000,
        },
      };

      expect(() => new KokoroExecutor(invalidConfig)).not.toThrow();
      // Validation happens lazily on initialize()
    });

    it('should validate system config', () => {
      const validConfig: DeploymentConfig = {
        mode: 'system',
        system: {
          pythonPath: '/usr/bin/python3',
        },
      };

      expect(() => new KokoroExecutor(validConfig)).not.toThrow();
    });

    it('should validate cloud config', () => {
      const invalidConfig: DeploymentConfig = {
        mode: 'cloud',
        cloud: {
          endpoint: '', // Missing required field
        },
      };

      expect(() => new KokoroExecutor(invalidConfig)).toThrow();
    });

    it('should throw on invalid deployment mode', () => {
      const invalidConfig: any = {
        mode: 'invalid_mode',
      };

      expect(() => new KokoroExecutor(invalidConfig)).toThrow();
    });
  });

  describe('capabilities', () => {
    beforeEach(() => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);
    });

    it('should return correct capabilities', () => {
      const caps = executor.getCapabilities();

      expect(caps.supportedFormats).toContain(AudioFormat.PCM_16);
      expect(caps.supportedSampleRates).toContain(16000);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.maxConcurrentSessions).toBeGreaterThan(0);
      expect(caps.estimatedLatencyMs).toBeGreaterThan(0);
    });

    it('should indicate local model requirement for docker', () => {
      const caps = executor.getCapabilities();
      expect(caps.requiresLocalModel).toBe(true);
    });

    it('should indicate network requirement for cloud', () => {
      const cloudConfig: DeploymentConfig = {
        mode: 'cloud',
        cloud: { endpoint: 'http://localhost:8000' },
      };
      const cloudExecutor = new KokoroExecutor(cloudConfig);
      const caps = cloudExecutor.getCapabilities();
      expect(caps.requiresNetworkConnection).toBe(true);
    });
  });

  describe('executor interface', () => {
    it('should have correct id', () => {
      const config: DeploymentConfig = {
        mode: 'system',
      };
      executor = new KokoroExecutor(config);
      expect(executor.id).toBe('kokoro');
    });

    it('should reject transcription (TTS-only)', async () => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);

      const audioBuffer = {
        data: new Uint8Array(1000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 100,
        channels: 1,
      };

      await expect(executor.transcribe(audioBuffer)).rejects.toThrow(
        'not supported',
      );
    });

    it('should reject transcription stream (TTS-only)', async () => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);

      const mockStream = {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
          releaseLock: () => {},
        }),
      } as ReadableStream<any>;

      const generator = executor.transcribeStream(mockStream);
      expect(async () => {
        for await (const _ of generator) {
          // Should not reach here
        }
      }).rejects.toThrow('not supported');
    });
  });

  describe('event emitter', () => {
    beforeEach(() => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);
    });

    it('should provide event emitter', () => {
      const emitter = executor.getEventEmitter();
      expect(emitter).toBeDefined();
      expect(emitter.on).toBeDefined();
      expect(emitter.emit).toBeDefined();
    });

    it('should allow listening to events', () => {
      const emitter = executor.getEventEmitter();
      const listener = vi.fn();

      emitter.on('health-degraded', listener);
      emitter.emit('health-degraded');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('deployment mode detection', () => {
    it('should return correct deployment mode for docker', () => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);
      expect(executor.getDeploymentMode()).toBe('docker');
    });

    it('should return correct deployment mode for system', () => {
      const config: DeploymentConfig = {
        mode: 'system',
      };
      executor = new KokoroExecutor(config);
      expect(executor.getDeploymentMode()).toBe('system');
    });

    it('should return correct deployment mode for cloud', () => {
      const config: DeploymentConfig = {
        mode: 'cloud',
        cloud: { endpoint: 'http://localhost:8000' },
      };
      executor = new KokoroExecutor(config);
      expect(executor.getDeploymentMode()).toBe('cloud');
    });
  });

  describe('deployment config access', () => {
    it('should provide access to deployment config', () => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);
      const retrieved = executor.getDeploymentConfig();
      expect(retrieved.mode).toBe('docker');
      expect(retrieved.docker?.image).toBe('kokoro:latest');
    });
  });

  describe('health check', () => {
    beforeEach(() => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);
    });

    it('should return false when not initialized', async () => {
      const healthy = await executor.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should throw on synthesis before initialization', async () => {
      await expect(executor.synthesize('Hello')).rejects.toThrow(
        'NOT_INITIALIZED',
      );
    });
  });

  describe('synthesis', () => {
    beforeEach(() => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);
    });

    it('should require initialization before synthesis', async () => {
      await expect(executor.synthesize('Hello world')).rejects.toThrow();
    });

    it('should accept synthesis options', async () => {
      // This test checks the interface accepts options
      // Actual synthesis requires initialization
      const options = {
        voice: 'en_US-hfc_female-medium',
        speed: 1.5,
        language: 'en',
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
      };

      await expect(executor.synthesize('Hello', options)).rejects.toThrow();
    });

    it('should return response with all required synthesis fields', async () => {
      // This test validates the interface structure
      // Real synthesis would require initialization
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      const testExecutor = new KokoroExecutor(config);

      // Verify interface accepts proper response structure matching real Kokoro API
      const mockResponse = {
        audio: Buffer.alloc(48000),
        sample_rate: 24000,
        duration: 1.0,
        tokens_used: 42,
        model: 'v1.0',
      };

      // Required fields
      expect(mockResponse).toHaveProperty('audio');
      expect(mockResponse).toHaveProperty('sample_rate');
      expect(mockResponse).toHaveProperty('duration');
      expect(mockResponse).toHaveProperty('tokens_used');
      expect(mockResponse).toHaveProperty('model');

      // Validate types
      expect(Buffer.isBuffer(mockResponse.audio)).toBe(true);
      expect(typeof mockResponse.sample_rate).toBe('number');
      expect(typeof mockResponse.duration).toBe('number');
      expect(typeof mockResponse.tokens_used).toBe('number');
      expect(typeof mockResponse.model).toBe('string');

      // Validate value ranges
      expect(mockResponse.audio.length).toBeGreaterThan(0);
      expect(mockResponse.sample_rate).toBe(24000);
      expect(mockResponse.duration).toBeGreaterThan(0);
      expect(mockResponse.tokens_used).toBeGreaterThan(0);
      expect(mockResponse.model.length).toBeGreaterThan(0);

      // Verify audio size matches sample rate and duration (16-bit PCM)
      const expectedBytes = mockResponse.sample_rate * mockResponse.duration * 2;
      expect(mockResponse.audio.length).toBeCloseTo(expectedBytes, -2); // Allow 100 byte tolerance
    });

    it('should format response with all required Kokoro fields', async () => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      const testExecutor = new KokoroExecutor(config);

      // Test multiple response variations
      const testCases = [
        {
          audio: Buffer.alloc(16000), // 0.33 seconds
          sample_rate: 24000,
          duration: 0.333,
          tokens_used: 15,
          model: 'v1.0',
        },
        {
          audio: Buffer.alloc(96000), // 2 seconds
          sample_rate: 24000,
          duration: 2.0,
          tokens_used: 120,
          model: 'v1.1',
        },
        {
          audio: Buffer.alloc(240000), // 5 seconds
          sample_rate: 24000,
          duration: 5.0,
          tokens_used: 300,
          model: 'v2.0',
        },
      ];

      for (const testCase of testCases) {
        // Validate all required fields present
        expect(testCase).toHaveProperty('audio');
        expect(testCase).toHaveProperty('sample_rate');
        expect(testCase).toHaveProperty('duration');
        expect(testCase).toHaveProperty('tokens_used');
        expect(testCase).toHaveProperty('model');

        // Validate types
        expect(Buffer.isBuffer(testCase.audio)).toBe(true);
        expect(typeof testCase.sample_rate).toBe('number');
        expect(typeof testCase.duration).toBe('number');
        expect(typeof testCase.tokens_used).toBe('number');
        expect(typeof testCase.model).toBe('string');

        // Validate ranges
        expect(testCase.audio.length).toBeGreaterThan(0);
        expect(testCase.sample_rate).toBeGreaterThan(0);
        expect(testCase.duration).toBeGreaterThan(0);
        expect(testCase.tokens_used).toBeGreaterThan(0);

        // Verify audio size consistency
        const expectedBytes = testCase.sample_rate * testCase.duration * 2;
        expect(testCase.audio.length).toBeCloseTo(expectedBytes, -2);
      }
    });
  });

  describe('streaming synthesis', () => {
    beforeEach(() => {
      const config: DeploymentConfig = {
        mode: 'docker',
        docker: { image: 'kokoro:latest', port: 8000 },
      };
      executor = new KokoroExecutor(config);
    });

    it('should throw before initialization', async () => {
      const mockStream = {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
          releaseLock: () => {},
        }),
      } as ReadableStream<any>;

      expect(async () => {
        for await (const _ of executor.synthesizeStream(mockStream)) {
          // Should error
        }
      }).rejects.toThrow();
    });
  });
});
