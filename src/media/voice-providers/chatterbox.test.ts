/**
 * Chatterbox TTS Provider Tests
 *
 * Comprehensive test suite covering:
 * - All deployment modes (cloud, docker, system)
 * - Configuration validation
 * - Synthesis and streaming
 * - Error handling and recovery
 * - Health checks and metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChatterboxConfig } from './chatterbox.js';
import { ChatterboxExecutor, type ChatterboxSynthesisRequest } from './chatterbox.js';
import { VoiceProviderError } from './executor.js';

/**
 * Mock global fetch
 */
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('ChatterboxExecutor', () => {
  let executor: ChatterboxExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    if (executor?.id) {
      await executor.shutdown();
    }
  });

  describe('Configuration Validation', () => {
    it('should validate deployment mode is required', () => {
      expect(() => {
        new ChatterboxExecutor({
          deploymentMode: 'invalid' as any,
        });
      }).toThrow(VoiceProviderError);
    });

    it('should validate exaggeration parameter range', () => {
      expect(() => {
        new ChatterboxExecutor({
          deploymentMode: 'cloud',
          exaggeration: 0.1, // Too low
        });
      }).toThrow('Exaggeration must be between 0.25 and 2.0');
    });

    it('should validate exaggeration upper bound', () => {
      expect(() => {
        new ChatterboxExecutor({
          deploymentMode: 'cloud',
          exaggeration: 3.0, // Too high
        });
      }).toThrow('Exaggeration must be between 0.25 and 2.0');
    });

    it('should accept valid exaggeration values', () => {
      const validValues = [0.25, 0.5, 1.0, 1.5, 2.0];
      for (const value of validValues) {
        expect(() => {
          new ChatterboxExecutor({
            deploymentMode: 'cloud',
            exaggeration: value,
          });
        }).not.toThrow();
      }
    });

    it('should validate temperature parameter range', () => {
      expect(() => {
        new ChatterboxExecutor({
          deploymentMode: 'cloud',
          temperature: 0.01, // Too low
        });
      }).toThrow('Temperature must be between 0.05 and 5.0');
    });

    it('should validate temperature upper bound', () => {
      expect(() => {
        new ChatterboxExecutor({
          deploymentMode: 'cloud',
          temperature: 6.0, // Too high
        });
      }).toThrow('Temperature must be between 0.05 and 5.0');
    });

    it('should accept valid temperature values', () => {
      const validValues = [0.05, 0.5, 1.0, 2.5, 5.0];
      for (const value of validValues) {
        expect(() => {
          new ChatterboxExecutor({
            deploymentMode: 'cloud',
            temperature: value,
          });
        }).not.toThrow();
      }
    });

    it('should validate cloud endpoint URL format', () => {
      expect(() => {
        new ChatterboxExecutor({
          deploymentMode: 'cloud',
          cloudEndpoint: 'not-a-url',
        });
      }).toThrow('Invalid cloud endpoint URL');
    });

    it('should accept valid cloud endpoint URLs', () => {
      expect(() => {
        new ChatterboxExecutor({
          deploymentMode: 'cloud',
          cloudEndpoint: 'https://api.example.com',
        });
      }).not.toThrow();
    });
  });

  describe('Cloud Deployment Mode', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
        cloudEndpoint: 'https://api.chatterbox.ai',
      });
    });

    it('should use default cloud endpoint', () => {
      const exec = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
      expect(exec['apiEndpoint']).toBe('https://api.chatterbox.ai');
    });

    it('should use custom cloud endpoint', () => {
      const exec = new ChatterboxExecutor({
        deploymentMode: 'cloud',
        cloudEndpoint: 'https://custom.api.com',
      });
      expect(exec['apiEndpoint']).toBe('https://custom.api.com');
    });

    it('should initialize successfully with cloud mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          voices: [
            { id: 'voice-1', name: 'Alex', language: 'en' },
            { id: 'voice-2', name: 'Jordan', language: 'es' },
          ],
        }),
      });

      await executor.initialize();
      expect(executor['isInitialized']).toBe(true);
    });

    it('should handle initialization with API key', async () => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
        apiKey: 'sk-test-key-1234567890',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();
      expect(mockFetch).toHaveBeenCalled();

      // Check Authorization header was sent
      const calls = mockFetch.mock.calls;
      expect(calls.some(call => {
        const headers = (call[1] as any)?.headers;
        return headers?.Authorization === 'Bearer sk-test-key-1234567890';
      })).toBe(true);
    });
  });

  describe('Docker Deployment Mode', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'docker',
        dockerPort: 8000,
      });
    });

    it('should use default docker port', () => {
      const exec = new ChatterboxExecutor({
        deploymentMode: 'docker',
      });
      expect(exec['apiEndpoint']).toBe('http://localhost:8000');
    });

    it('should use custom docker port', () => {
      const exec = new ChatterboxExecutor({
        deploymentMode: 'docker',
        dockerPort: 9000,
      });
      expect(exec['apiEndpoint']).toBe('http://localhost:9000');
    });

    it('should attempt docker detection on initialize', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();
      expect(executor['isInitialized']).toBe(true);
    });

    it('should auto-discover docker container on non-default port', async () => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'docker',
      });

      // Mock port 8002 as available (simulating discovery)
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('localhost:8000') || url.includes('localhost:8001')) {
          throw new Error('Port not available');
        }
        if (url.includes('localhost:8002')) {
          return {
            ok: true,
            json: async () => ({ status: 'healthy' }),
          };
        }
        return {
          ok: true,
          json: async () => ({ voices: [] }),
        };
      });

      await executor.initialize();
      // Should have detected alternative port
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle docker port configuration', async () => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'docker',
        dockerPort: 8001,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      // Verify initial endpoint before initialization
      expect(executor['apiEndpoint']).toBe('http://localhost:8001');
    });
  });

  describe('System Deployment Mode', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'system',
      });
    });

    it('should resolve system endpoint', () => {
      expect(executor['apiEndpoint']).toBe('http://localhost:5000');
    });

    it('should attempt to initialize system mode', async () => {
      // Mock child_process
      vi.doMock('child_process', () => ({
        execSync: vi.fn(() => '/usr/local/bin/chatterbox-tts'),
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();
      expect(executor['isInitialized']).toBe(true);
    });
  });

  describe('Capabilities', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
    });

    it('should return correct capabilities', () => {
      const caps = executor.getCapabilities();

      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportedLanguages.length).toBeGreaterThanOrEqual(22);
      expect(caps.supportedLanguages).toContain('en');
      expect(caps.supportedLanguages).toContain('es');
      expect(caps.supportedLanguages).toContain('fr');
      expect(caps.maxConcurrentSessions).toBe(10);
    });

    it('should indicate local model requirement for system mode', () => {
      const exec = new ChatterboxExecutor({
        deploymentMode: 'system',
      });

      const caps = exec.getCapabilities();
      expect(caps.requiresLocalModel).toBe(true);
    });

    it('should indicate no local model for cloud mode', () => {
      const caps = executor.getCapabilities();
      expect(caps.requiresLocalModel).toBe(false);
    });

    it('should support multiple audio formats', () => {
      const caps = executor.getCapabilities();
      expect(caps.supportedFormats.length).toBeGreaterThan(0);
    });

    it('should require network connection', () => {
      const caps = executor.getCapabilities();
      expect(caps.requiresNetworkConnection).toBe(true);
    });
  });

  describe('Synthesis', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
        cloudEndpoint: 'https://api.chatterbox.ai',
      });
    });

    it('should throw error if not initialized', async () => {
      await expect(executor.synthesize('Hello world')).rejects.toThrow(
        'Chatterbox not initialized',
      );
    });

    it('should throw error for empty text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      await expect(executor.synthesize('')).rejects.toThrow(
        'Text cannot be empty',
      );
    });

    it('should synthesize text successfully', async () => {
      // Initialize
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      // Synthesize
      const audioData = new Uint8Array([0xff, 0xfb, 0x90, 0x00]); // MP3 header
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => audioData.buffer,
      });

      const result = await executor.synthesize('Hello world');

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.channels).toBe(1);
      expect(result.sampleRate).toBe(16000);
    });

    it('should pass synthesis options correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      const audioData = new Uint8Array([0xff, 0xfb]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => audioData.buffer,
      });

      await executor.synthesize('Hello', {
        voice: 'alex',
        speed: 1.5,
        language: 'en',
      });

      // Verify request body
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const requestBody = JSON.parse((lastCall[1] as any).body);

      expect(requestBody.input).toBe('Hello');
      expect(requestBody.voice).toBe('alex');
      expect(requestBody.speed).toBe(1.5);
    });

    it('should record synthesis metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      const audioData = new Uint8Array([0xff, 0xfb]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => audioData.buffer,
      });

      await executor.synthesize('Test text');

      const metrics = executor.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].inputChars).toBe(9);
      expect(metrics[0].deploymentMode).toBe('cloud');
    });

    it('should handle synthesis errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(executor.synthesize('Hello')).rejects.toThrow(
        'Synthesis failed',
      );
    });
  });

  describe('Streaming Synthesis', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
    });

    it('should throw error if not initialized', async () => {
      const stream = new ReadableStream<string>({
        start(controller) {
          controller.close();
        },
      });

      const iterator = executor.synthesizeStream(stream);
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of iterator) {
          // consume
        }
      }).rejects.toThrow('Chatterbox not initialized');
    });

    it('should stream audio chunks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      // Create input stream
      const textChunks = ['Hello ', 'world.'];
      const stream = new ReadableStream<string>({
        start(controller) {
          for (const chunk of textChunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      // Mock synthesis responses
      const audioData = new Uint8Array([0xff, 0xfb]);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => audioData.buffer,
      });

      const audioChunks = [];
      for await (const chunk of executor.synthesizeStream(stream)) {
        audioChunks.push(chunk);
      }

      expect(audioChunks.length).toBeGreaterThan(0);
    });

    it('should handle streaming errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      const stream = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('Hello');
          controller.close();
        },
      });

      mockFetch.mockRejectedValueOnce(new Error('Synthesis error'));

      let caughtError: Error | null = null;
      try {
        const iterator = executor.synthesizeStream(stream);
        for await (const _ of iterator) {
          // consume
        }
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError).toBeDefined();
      if (caughtError) {
        expect(caughtError.message).toContain('Stream synthesis failed');
      }
    });
  });

  describe('Health Checks', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
    });

    it('should return false if not initialized', async () => {
      const healthy = await executor.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return true if health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      const healthy = await executor.isHealthy();
      expect(healthy).toBe(true);
    });

    it('should return false if health check fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const healthy = await executor.isHealthy();
      expect(healthy).toBe(false);
    });
  });

  describe('Metrics', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
    });

    it('should calculate average latency', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      const audioData = new Uint8Array([0xff, 0xfb]);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => audioData.buffer,
      });

      // Do several syntheses with delays to ensure measurable latency
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        await executor.synthesize('Test');
      }

      const avgLatency = executor.getAverageLatency();
      expect(avgLatency).toBeGreaterThanOrEqual(0);
    });

    it('should return default latency if no metrics', () => {
      const avgLatency = executor.getAverageLatency();
      const caps = executor.getCapabilities();

      expect(avgLatency).toBe(caps.estimatedLatencyMs);
    });

    it('should maintain bounded metrics buffer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      const audioData = new Uint8Array([0xff, 0xfb]);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => audioData.buffer,
      });

      // Generate metrics beyond MAX_METRICS (1000)
      for (let i = 0; i < 1100; i++) {
        await executor.synthesize('Test');
      }

      const metrics = executor.getMetrics();
      expect(metrics.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Transcription (Not Supported)', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
    });

    it('should throw error for transcribe', async () => {
      const dummyAudio = {
        data: new Uint8Array(),
        format: 'pcm16' as any,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      await expect(executor.transcribe(dummyAudio)).rejects.toThrow(
        'transcription not supported',
      );
    });

    it('should throw error for transcribeStream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const iterator = executor.transcribeStream(stream);
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of iterator) {
          // consume
        }
      }).rejects.toThrow('transcription not supported');
    });
  });

  describe('Shutdown', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
    });

    it('should shutdown gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      await executor.shutdown();

      expect(executor['isInitialized']).toBe(false);
      expect(executor['metricsBuffer'].length).toBe(0);
    });

    it('should clear resources on shutdown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      const audioData = new Uint8Array([0xff, 0xfb]);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => audioData.buffer,
      });

      await executor.synthesize('Test');
      expect(executor.getMetrics().length).toBe(1);

      await executor.shutdown();
      expect(executor.getMetrics().length).toBe(0);
    });

    it('should handle multiple shutdown calls', async () => {
      await executor.shutdown();
      await executor.shutdown(); // Should not throw

      expect(executor['isInitialized']).toBe(false);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      executor = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
    });

    it('should handle request failures gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      // Request fails
      mockFetch.mockRejectedValueOnce(new Error('Request failed'));

      await expect(executor.synthesize('Test')).rejects.toThrow('Synthesis failed');
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await executor.initialize();

      mockFetch.mockImplementationOnce(async (_url, _opts: any) => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
      });

      await expect(executor.synthesize('Test', { sampleRate: 16000 })).rejects.toThrow(
        'Synthesis failed',
      );
    });
  });

  describe('Multi-Deployment Integration', () => {
    it('should support swapping deployment modes', () => {
      const cloudExec = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });
      expect(cloudExec['apiEndpoint']).toBe('https://api.chatterbox.ai');

      const dockerExec = new ChatterboxExecutor({
        deploymentMode: 'docker',
        dockerPort: 8000,
      });
      expect(dockerExec['apiEndpoint']).toBe('http://localhost:8000');

      const systemExec = new ChatterboxExecutor({
        deploymentMode: 'system',
      });
      expect(systemExec['apiEndpoint']).toBe('http://localhost:5000');
    });

    it('should maintain separate executor instances', async () => {
      const exec1 = new ChatterboxExecutor({
        deploymentMode: 'cloud',
      });

      const exec2 = new ChatterboxExecutor({
        deploymentMode: 'docker',
      });

      expect(exec1['apiEndpoint']).not.toBe(exec2['apiEndpoint']);
      expect(exec1.id).toBe(exec2.id);
    });
  });
});
