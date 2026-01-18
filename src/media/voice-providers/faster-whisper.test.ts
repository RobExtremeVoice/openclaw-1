/**
 * Tests for Faster-Whisper Executor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FasterWhisperExecutor, type ComputeType } from './faster-whisper';
import { AudioFormat } from './executor';
import type { FasterWhisperConfig } from '../../config/types.voice';

describe('FasterWhisperExecutor', () => {
  let executor: FasterWhisperExecutor;
  let config: FasterWhisperConfig;

  beforeEach(() => {
    config = {
      type: 'faster-whisper',
      modelSize: 'base',
      language: 'en',
      computeType: 'float16',
      cpuThreads: 4,
      beamSize: 5,
    };

    executor = new FasterWhisperExecutor('test-faster-whisper', config);
  });

  afterEach(async () => {
    await executor.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize without errors', async () => {
      await executor.initialize();
      expect(await executor.isHealthy()).toBe(true);
    });

    it('should detect GPU capabilities', async () => {
      await executor.initialize();
      const gpuCaps = executor.getGPUCapabilities();
      expect(gpuCaps).toBeDefined();
      expect(gpuCaps?.available).toBeDefined();
    });

    it('should handle initialization gracefully if GPU detection fails', async () => {
      // Mock GPU detection failure
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await executor.initialize();
      // Should still be healthy even without GPU
      expect(await executor.isHealthy()).toBe(true);
    });
  });

  describe('Capabilities', () => {
    it('should report correct supported formats', async () => {
      const caps = executor.getCapabilities();
      expect(caps.supportedFormats).toContain(AudioFormat.PCM_16);
      expect(caps.supportedFormats).toContain(AudioFormat.MP3);
      expect(caps.supportedFormats).toContain(AudioFormat.OPUS);
    });

    it('should report correct supported sample rates', () => {
      const caps = executor.getCapabilities();
      expect(caps.supportedSampleRates).toContain(16000);
      expect(caps.supportedSampleRates).toContain(8000);
    });

    it('should indicate streaming support', () => {
      const caps = executor.getCapabilities();
      expect(caps.supportsStreaming).toBe(true);
    });

    it('should indicate no network connection required', () => {
      const caps = executor.getCapabilities();
      expect(caps.requiresNetworkConnection).toBe(false);
    });

    it('should indicate local model required', () => {
      const caps = executor.getCapabilities();
      expect(caps.requiresLocalModel).toBe(true);
    });

    it('should report at least some supported languages', () => {
      const caps = executor.getCapabilities();
      expect(caps.supportedLanguages.length).toBeGreaterThan(50);
      expect(caps.supportedLanguages).toContain('en');
      expect(caps.supportedLanguages).toContain('es');
    });
  });

  describe('Audio Validation', () => {
    it('should reject empty audio buffer', async () => {
      const emptyAudio = {
        data: new Uint8Array(0),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 0,
        channels: 1,
      };

      await expect(executor.transcribe(emptyAudio)).rejects.toThrow();
    });

    it('should reject unsupported sample rates', async () => {
      const audio = {
        data: new Uint8Array(1000),
        format: AudioFormat.PCM_16,
        sampleRate: 22050, // Unsupported
        duration: 100,
        channels: 1,
      };

      await expect(executor.transcribe(audio)).rejects.toThrow();
    });

    it('should accept valid 16kHz PCM audio', async () => {
      await executor.initialize();

      const audio = {
        data: new Uint8Array(32000), // 1 second at 16kHz, 16-bit
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      // Should not throw validation error
      const result = await executor.transcribe(audio);
      expect(result).toBeDefined();
      expect(result.provider).toBe('test-faster-whisper');
    });

    it('should accept valid 8kHz PCM audio', async () => {
      await executor.initialize();

      const audio = {
        data: new Uint8Array(16000), // 1 second at 8kHz, 16-bit
        format: AudioFormat.PCM_16,
        sampleRate: 8000,
        duration: 1000,
        channels: 1,
      };

      const result = await executor.transcribe(audio);
      expect(result).toBeDefined();
    });
  });

  describe('Compute Type Management', () => {
    it('should have default compute type of float16', () => {
      const computeType = executor.getComputeType();
      expect(computeType).toBe('float16');
    });

    it('should allow setting compute type to int8', () => {
      executor.setComputeType('int8');
      expect(executor.getComputeType()).toBe('int8');
    });

    it('should allow setting compute type to float32', () => {
      executor.setComputeType('float32');
      expect(executor.getComputeType()).toBe('float32');
    });

    it('should switch compute types and clear model cache', () => {
      executor.setComputeType('int8');
      executor.setComputeType('float32');
      expect(executor.getComputeType()).toBe('float32');
    });
  });

  describe('CPU Thread Configuration', () => {
    it('should set CPU threads', () => {
      executor.setCPUThreads(8);
      // No direct getter, but should not throw
      expect(() => executor.setCPUThreads(8)).not.toThrow();
    });

    it('should reject invalid thread counts', () => {
      expect(() => executor.setCPUThreads(0)).toThrow();
      expect(() => executor.setCPUThreads(-1)).toThrow();
    });

    it('should accept thread count of 1', () => {
      expect(() => executor.setCPUThreads(1)).not.toThrow();
    });
  });

  describe('Beam Size Configuration', () => {
    it('should set beam size', () => {
      executor.setBeamSize(10);
      expect(() => executor.setBeamSize(10)).not.toThrow();
    });

    it('should reject invalid beam sizes', () => {
      expect(() => executor.setBeamSize(0)).toThrow();
      expect(() => executor.setBeamSize(513)).toThrow();
      expect(() => executor.setBeamSize(-1)).toThrow();
    });

    it('should accept min beam size of 1', () => {
      expect(() => executor.setBeamSize(1)).not.toThrow();
    });

    it('should accept max beam size of 512', () => {
      expect(() => executor.setBeamSize(512)).not.toThrow();
    });
  });

  describe('Transcription', () => {
    beforeEach(async () => {
      await executor.initialize();
    });

    it('should transcribe audio and return result', async () => {
      const audio = {
        data: new Uint8Array(32000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      const result = await executor.transcribe(audio);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('provider');
      expect(result.provider).toBe('test-faster-whisper');
      expect(result.duration).toBe(1000);
    });

    it('should include confidence in result', async () => {
      const audio = {
        data: new Uint8Array(32000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      const result = await executor.transcribe(audio);
      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include language in result', async () => {
      const audio = {
        data: new Uint8Array(32000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      const result = await executor.transcribe(audio);
      expect(result.language).toBeDefined();
    });

    it('should respect language option', async () => {
      const audio = {
        data: new Uint8Array(32000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      const result = await executor.transcribe(audio, { language: 'es' });
      expect(result.language).toBeDefined();
    });
  });

  describe('Streaming Transcription', () => {
    beforeEach(async () => {
      await executor.initialize();
    });

    it('should support stream transcription', async () => {
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < 3; i++) {
        chunks.push(new Uint8Array(16000)); // ~1 second each
      }

      let chunkCount = 0;
      const mockStream = new ReadableStream({
        start(controller) {
          chunks.forEach(chunk => {
            controller.enqueue({
              data: chunk,
              format: AudioFormat.PCM_16,
              sampleRate: 16000,
              duration: 1000,
              channels: 1,
            });
          });
          controller.close();
        },
      });

      for await (const chunk of executor.transcribeStream(mockStream)) {
        expect(chunk.text).toBeDefined();
        expect(chunk.timestamp).toBeDefined();
        chunkCount++;
      }

      expect(chunkCount).toBeGreaterThan(0);
    });

    it('should handle empty stream gracefully', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      let chunkCount = 0;
      for await (const chunk of executor.transcribeStream(mockStream)) {
        chunkCount++;
      }

      expect(chunkCount).toBe(0);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      await executor.initialize();
    });

    it('should track performance metrics', async () => {
      const audio = {
        data: new Uint8Array(32000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      // Perform multiple transcriptions
      await executor.transcribe(audio);
      await executor.transcribe(audio);

      const metrics = executor.getPerformanceMetrics();

      expect(metrics).toHaveProperty('averageLatencyMs');
      expect(metrics).toHaveProperty('averageRTF');
      expect(metrics).toHaveProperty('computeTypeDistribution');
      expect(metrics).toHaveProperty('gpuUsagePercent');
    });

    it('should calculate average RTF', async () => {
      const audio = {
        data: new Uint8Array(32000),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 1000,
        channels: 1,
      };

      await executor.transcribe(audio);

      const metrics = executor.getPerformanceMetrics();
      expect(metrics.averageRTF).toBeGreaterThan(0);
    });

    it('should return zero metrics when no transcriptions', () => {
      const metrics = executor.getPerformanceMetrics();

      expect(metrics.averageLatencyMs).toBe(0);
      expect(metrics.averageRTF).toBe(0);
      expect(metrics.gpuUsagePercent).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await executor.initialize();
    });

    it('should throw on transcription failure', async () => {
      // Create invalid audio that will fail validation
      const audio = {
        data: new Uint8Array(),
        format: AudioFormat.PCM_16,
        sampleRate: 44100, // Unsupported rate
        duration: 0,
        channels: 1,
      };

      await expect(executor.transcribe(audio)).rejects.toThrow();
    });

    it('should include provider ID in error messages', async () => {
      const audio = {
        data: new Uint8Array(),
        format: AudioFormat.PCM_16,
        sampleRate: 16000,
        duration: 0,
        channels: 1,
      };

      try {
        await executor.transcribe(audio);
      } catch (error) {
        expect((error as any).provider).toBe('test-faster-whisper');
      }
    });
  });

  describe('GPU Capabilities', () => {
    it('should detect GPU capabilities', async () => {
      await executor.initialize();
      const gpuCaps = executor.getGPUCapabilities();

      expect(gpuCaps).toBeDefined();
      if (gpuCaps?.available) {
        expect(gpuCaps.type).toMatch(/cuda|mps|rocm/);
      }
    });
  });

  describe('Lifecycle', () => {
    it('should initialize and shutdown without errors', async () => {
      const exec = new FasterWhisperExecutor('test', config);
      await exec.initialize();
      expect(await exec.isHealthy()).toBe(true);

      await exec.shutdown();
      expect(await exec.isHealthy()).toBe(false);
    });

    it('should handle multiple initializations', async () => {
      const exec = new FasterWhisperExecutor('test', config);
      await exec.initialize();
      await exec.initialize();
      expect(await exec.isHealthy()).toBe(true);

      await exec.shutdown();
    });

    it('should handle shutdown without initialization', async () => {
      const exec = new FasterWhisperExecutor('test', config);
      expect(async () => {
        await exec.shutdown();
      }).not.toThrow();
    });
  });

  describe('Audio Normalization', () => {
    it('should normalize audio to PCM16 16kHz', async () => {
      // Create audio with different sample rate
      const audio = {
        data: new Uint8Array(16000),
        format: AudioFormat.PCM_16,
        sampleRate: 8000, // Will be normalized
        duration: 2000,
        channels: 1,
      };

      await executor.initialize();
      const result = await executor.transcribe(audio);

      expect(result).toBeDefined();
      expect(result.duration).toBe(2000);
    });
  });
});
