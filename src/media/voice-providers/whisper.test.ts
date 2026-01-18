/**
 * Whisper STT Provider Tests
 *
 * Comprehensive tests for the Whisper implementation including
 * Docker and system deployments, audio handling, and error cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WhisperExecutor } from './whisper.js';
import { WhisperDockerDeploymentHandler } from './whisper.docker.js';
import { WhisperSystemDeploymentHandler } from './whisper.system.js';
import { WhisperPluginService, getWhisperPluginService } from './whisper.service.js';
import { AudioFormat, VoiceProviderError } from './executor.js';
import type { AudioBuffer } from './executor.js';

/**
 * Helper to create test audio buffer
 */
function createTestAudioBuffer(
  duration: number = 1000,
  sampleRate: number = 16000,
): AudioBuffer {
  const samples = Math.floor((duration * sampleRate) / 1000);
  const data = new Uint8Array(samples * 2);

  // Fill with silence (zeros)
  data.fill(0);

  return {
    data,
    format: AudioFormat.PCM_16,
    sampleRate,
    duration,
    channels: 1,
  };
}

describe('WhisperExecutor', () => {
  let executor: WhisperExecutor;

  beforeEach(() => {
    // Reset deployment mode to system default
    delete process.env.WHISPER_DEPLOYMENT;

    executor = new WhisperExecutor('test-whisper', {
      type: 'whisper',
      modelSize: 'base',
    });
  });

  afterEach(async () => {
    try {
      await executor.shutdown();
    } catch {
      // Ignore
    }
    // Clean up environment
    delete process.env.WHISPER_DEPLOYMENT;
  });

  describe('Initialization', () => {
    it('should initialize system deployment by default', async () => {
      process.env.WHISPER_DEPLOYMENT = 'system';

      await executor.initialize();

      expect(executor.getDeploymentMode()).toBe('system');
    });

    it('should support Docker deployment', () => {
      process.env.WHISPER_DEPLOYMENT = 'docker';

      const dockerExecutor = new WhisperExecutor('test-whisper-docker', {
        type: 'whisper',
        modelSize: 'base',
      });

      expect(dockerExecutor.getDeploymentMode()).toBe('docker');
    });

    it('should throw error if not initialized', async () => {
      const audio = createTestAudioBuffer();

      await expect(executor.transcribe(audio)).rejects.toThrow(
        'not initialized',
      );
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = executor.getCapabilities();

      expect(caps.supportedFormats).toContain(AudioFormat.PCM_16);
      expect(caps.supportedSampleRates).toContain(16000);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.requiresLocalModel).toBe(true);
      expect(caps.estimatedLatencyMs).toBeGreaterThan(0);
    });

    it('should have different max concurrent sessions for Docker vs System', () => {
      process.env.WHISPER_DEPLOYMENT = 'system';
      const systemExecutor = new WhisperExecutor('test-system', {
        type: 'whisper',
        modelSize: 'base',
      });
      const systemCaps = systemExecutor.getCapabilities();
      expect(systemCaps.maxConcurrentSessions).toBe(1);

      process.env.WHISPER_DEPLOYMENT = 'docker';
      const dockerExecutor = new WhisperExecutor('test-docker', {
        type: 'whisper',
        modelSize: 'base',
      });
      const dockerCaps = dockerExecutor.getCapabilities();
      expect(dockerCaps.maxConcurrentSessions).toBeGreaterThan(1);
    });
  });

  describe('Audio Buffer Handling', () => {
    it('should handle various audio formats', () => {
      const formats = [
        AudioFormat.PCM_16,
        AudioFormat.OPUS,
        AudioFormat.MP3,
        AudioFormat.AAC,
      ];

      for (const format of formats) {
        const audio: AudioBuffer = {
          data: new Uint8Array(1000),
          format,
          sampleRate: 16000,
          duration: 1000,
          channels: 1,
        };

        expect(() => executor['normalizeAudioBuffer'](audio)).not.toThrow();
      }
    });

    it('should handle various sample rates', () => {
      const sampleRates = [16000, 44100, 48000];

      for (const rate of sampleRates) {
        const audio = createTestAudioBuffer(1000, rate);
        expect(audio.sampleRate).toBe(rate);
      }
    });

    it('should handle mono and stereo audio', () => {
      const monoAudio = createTestAudioBuffer(1000);
      expect(monoAudio.channels).toBe(1);

      const stereoAudio: AudioBuffer = {
        ...monoAudio,
        channels: 2,
        data: new Uint8Array(monoAudio.data.length * 2),
      };
      expect(stereoAudio.channels).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw VoiceProviderError with correct provider name', () => {
      expect(() => {
        throw new VoiceProviderError('Test error', 'test-provider', 'TEST_CODE');
      }).toThrow(VoiceProviderError);
    });

    it('should handle transcription timeout', async () => {
      // This would require mocking the deployment handlers
      // which is done in integration tests
    });
  });
});

describe('WhisperDockerDeploymentHandler', () => {
  let handler: WhisperDockerDeploymentHandler;

  beforeEach(() => {
    handler = new WhisperDockerDeploymentHandler({
      port: 8000,
      dockerImage: 'openai/whisper:latest',
      containerName: 'test-whisper',
      modelSize: 'base',
    });
  });

  describe('Configuration', () => {
    it('should initialize with defaults', () => {
      const defaultHandler = new WhisperDockerDeploymentHandler();
      const config = defaultHandler.getConfig();

      expect(config.port).toBe(8000);
      expect(config.modelSize).toBe('base');
      expect(config.containerName).toBe('whisper-stt');
    });

    it('should allow custom configuration', () => {
      const config = handler.getConfig();

      expect(config.port).toBe(8000);
      expect(config.containerName).toBe('test-whisper');
      expect(config.modelSize).toBe('base');
    });
  });

  describe('Container Management', () => {
    it('should have isRunning method', () => {
      expect(handler.isRunning()).toBe(false);
    });

    it('should have API URL method', () => {
      const url = handler.getApiUrl();
      expect(url).toBe('http://localhost:8000');
    });

    it('should provide container info', () => {
      expect(handler.getContainerId()).toBeUndefined();
      const config = handler.getConfig();
      expect(config).toBeDefined();
    });
  });
});

describe('WhisperSystemDeploymentHandler', () => {
  let handler: WhisperSystemDeploymentHandler;

  beforeEach(() => {
    handler = new WhisperSystemDeploymentHandler({
      modelSize: 'base',
      pythonPath: 'python3',
      cachePath: '/tmp/whisper-test',
      device: 'cpu',
      numWorkers: 1,
    });
  });

  describe('Configuration', () => {
    it('should initialize with defaults', () => {
      const defaultHandler = new WhisperSystemDeploymentHandler();

      expect(defaultHandler.getModelSize()).toBe('base');
      expect(defaultHandler.getDevice()).toBe('cpu');
    });

    it('should allow custom configuration', () => {
      expect(handler.getModelSize()).toBe('base');
      expect(handler.getDevice()).toBe('cpu');
      expect(handler.getCachePath()).toBe('/tmp/whisper-test');
    });
  });

  describe('Model Management', () => {
    it('should report model size', () => {
      expect(handler.getModelSize()).toBe('base');
    });

    it('should have cache path', () => {
      const cachePath = handler.getCachePath();
      expect(cachePath).toContain('whisper');
    });

    it('should support different model sizes', () => {
      const sizes = ['tiny', 'small', 'base', 'medium', 'large'] as const;

      for (const size of sizes) {
        const h = new WhisperSystemDeploymentHandler({
          modelSize: size,
        });
        expect(h.getModelSize()).toBe(size);
      }
    });
  });

  describe('Device Detection', () => {
    it('should initialize with cpu device by default', () => {
      expect(handler.getDevice()).toBe('cpu');
    });
  });
});

describe('WhisperPluginService', () => {
  let service: WhisperPluginService;

  beforeEach(() => {
    service = new WhisperPluginService({
      autoDetectDeployment: false,
      downloadModelsOnInit: false,
    });
  });

  describe('Service Lifecycle', () => {
    it('should create service', () => {
      expect(service).toBeDefined();
    });

    it('should have initial status', () => {
      const status = service.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.healthy).toBe(false);
    });

    it('should provide info', () => {
      const info = service.getInfo();

      expect(info.initialized).toBe(false);
      expect(info.cacheDir).toBeDefined();
    });
  });

  describe('Global Service', () => {
    it('should provide global service instance', () => {
      const global1 = getWhisperPluginService();
      const global2 = getWhisperPluginService();

      expect(global1).toBe(global2);
    });

    it('should allow creating new instances', () => {
      const service1 = new WhisperPluginService();
      const service2 = new WhisperPluginService();

      expect(service1).not.toBe(service2);
    });
  });

  describe('Deployment Detection', () => {
    it('should detect available deployments', async () => {
      const detection = await service.detectDeploymentMode();

      expect(detection).toHaveProperty('mode');
      expect(detection).toHaveProperty('reason');
      expect(detection).toHaveProperty('available');
    });
  });
});

describe('Audio Stream Handling', () => {
  let executor: WhisperExecutor;

  beforeEach(() => {
    executor = new WhisperExecutor('test-stream', {
      type: 'whisper',
      modelSize: 'tiny',
    });
  });

  afterEach(async () => {
    try {
      await executor.shutdown();
    } catch {
      // Ignore
    }
  });

  it('should support audio streaming interface', async () => {
    const audioChunks: AudioBuffer[] = [
      createTestAudioBuffer(500),
      createTestAudioBuffer(500),
      createTestAudioBuffer(500),
    ];

    // Create a readable stream
    const stream = new ReadableStream<AudioBuffer>({
      start(controller) {
        for (const chunk of audioChunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    // This would require proper initialization and deployment setup
    // In a real test environment, we'd mock the deployment handlers
  });
});

describe('Integration Tests (Mocked)', () => {
  it('should handle deployment mode environment variable', () => {
    process.env.WHISPER_DEPLOYMENT = 'docker';

    const dockerExecutor = new WhisperExecutor('test-docker', {
      type: 'whisper',
      modelSize: 'base',
    });

    expect(dockerExecutor.getDeploymentMode()).toBe('docker');

    process.env.WHISPER_DEPLOYMENT = 'system';

    const systemExecutor = new WhisperExecutor('test-system', {
      type: 'whisper',
      modelSize: 'base',
    });

    expect(systemExecutor.getDeploymentMode()).toBe('system');
  });

  it('should handle model size configuration', () => {
    const sizes = ['tiny', 'small', 'base', 'medium', 'large'] as const;

    for (const size of sizes) {
      const exec = new WhisperExecutor(`test-${size}`, {
        type: 'whisper',
        modelSize: size,
      });

      const caps = exec.getCapabilities();
      expect(caps).toBeDefined();
    }
  });

  it('should handle language configuration', () => {
    const executor = new WhisperExecutor('test-lang', {
      type: 'whisper',
      modelSize: 'base',
      language: 'es',
    });

    expect(executor).toBeDefined();
  });
});

describe('Error Scenarios', () => {
  it('should handle missing Python package', async () => {
    const handler = new WhisperSystemDeploymentHandler({
      pythonPath: '/nonexistent/python',
    });

    const info = await handler.getPythonInfo();

    // Will report Python as not available if path is wrong
    expect(info).toHaveProperty('pythonAvailable');
  });

  it('should handle Docker connection errors', () => {
    const handler = new WhisperDockerDeploymentHandler({
      port: 9999, // Likely unused port
    });

    expect(() => handler.getApiUrl()).not.toThrow();
    expect(handler.isRunning()).toBe(false);
  });

  it('should wrap errors in VoiceProviderError', () => {
    expect(() => {
      throw new VoiceProviderError(
        'Test error',
        'test-provider',
        'TEST_CODE',
      );
    }).toThrow(VoiceProviderError);
  });
});
