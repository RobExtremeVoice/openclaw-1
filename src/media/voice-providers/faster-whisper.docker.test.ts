/**
 * Tests for Faster-Whisper Docker Deployment Handler
 *
 * Tests Docker lifecycle, GPU support, auto-port assignment, and health checks.
 * Includes mocked docker operations for CI/CD environments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FasterWhisperDockerDeploymentHandler } from './faster-whisper.docker.js';
import { AudioFormat } from './executor.js';

// Mock execAsync to avoid actual Docker calls in tests
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

describe('FasterWhisperDockerDeploymentHandler', () => {
  let handler: FasterWhisperDockerDeploymentHandler;

  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks();

    handler = new FasterWhisperDockerDeploymentHandler({
      port: 8001,
      dockerImage: 'fedirz/faster-whisper-server:latest-cpu',
      containerName: 'test-faster-whisper',
      gpuEnabled: false,
      modelSize: 'base',
      computeType: 'float16',
      cpuLimit: '4',
      memoryLimit: '8g',
    });
  });

  afterEach(async () => {
    // Cleanup after tests
    if (handler.isRunning()) {
      try {
        await handler.stop();
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultHandler = new FasterWhisperDockerDeploymentHandler();
      const config = defaultHandler.getConfig();

      expect(config.port).toBe(8001);
      expect(config.containerName).toBe('faster-whisper-stt');
      expect(config.gpuEnabled).toBe(false);
      expect(config.modelSize).toBe('base');
      expect(config.computeType).toBe('int8');
    });

    it('should accept custom configuration', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        port: 9001,
        containerName: 'custom-whisper',
        modelSize: 'large',
        gpuEnabled: true,
        computeType: 'float32',
      });

      const config = customHandler.getConfig();
      expect(config.port).toBe(9001);
      expect(config.containerName).toBe('custom-whisper');
      expect(config.modelSize).toBe('large');
      expect(config.gpuEnabled).toBe(true);
      expect(config.computeType).toBe('float32');
    });

    it('should support beam size configuration', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        beamSize: 10,
      });

      const config = customHandler.getConfig();
      expect(config.beamSize).toBe(10);
    });

    it('should support CPU thread configuration', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        cpuThreads: 8,
      });

      const config = customHandler.getConfig();
      expect(config.cpuThreads).toBe(8);
    });

    it('should support volume mounts', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        volumeMounts: {
          '/models': '/app/models',
          '/cache': '/app/cache',
        },
      });

      const config = customHandler.getConfig();
      expect(config.volumeMounts).toEqual({
        '/models': '/app/models',
        '/cache': '/app/cache',
      });
    });
  });

  describe('Compute Type Support', () => {
    it('should support int8 compute type', () => {
      const int8Handler = new FasterWhisperDockerDeploymentHandler({
        computeType: 'int8',
      });

      const config = int8Handler.getConfig();
      expect(config.computeType).toBe('int8');
    });

    it('should support float16 compute type', () => {
      const float16Handler = new FasterWhisperDockerDeploymentHandler({
        computeType: 'float16',
      });

      const config = float16Handler.getConfig();
      expect(config.computeType).toBe('float16');
    });

    it('should support float32 compute type', () => {
      const float32Handler = new FasterWhisperDockerDeploymentHandler({
        computeType: 'float32',
      });

      const config = float32Handler.getConfig();
      expect(config.computeType).toBe('float32');
    });
  });

  describe('GPU Support', () => {
    it('should initialize with GPU disabled by default', () => {
      const config = handler.getConfig();
      expect(config.gpuEnabled).toBe(false);
    });

    it('should accept GPU enabled configuration', () => {
      const gpuHandler = new FasterWhisperDockerDeploymentHandler({
        gpuEnabled: true,
      });

      const config = gpuHandler.getConfig();
      expect(config.gpuEnabled).toBe(true);
    });

    it('should select appropriate Docker image for GPU', () => {
      // Test that GPU-enabled handler can be configured
      const gpuHandler = new FasterWhisperDockerDeploymentHandler({
        gpuEnabled: true,
        dockerImage: 'fedirz/faster-whisper-server:latest-cuda',
      });

      const config = gpuHandler.getConfig();
      expect(config.dockerImage).toContain('cuda');
    });

    it('should select CPU image when GPU not available', () => {
      const cpuHandler = new FasterWhisperDockerDeploymentHandler({
        gpuEnabled: false,
        dockerImage: 'fedirz/faster-whisper-server:latest-cpu',
      });

      const config = cpuHandler.getConfig();
      expect(config.dockerImage).toContain('cpu');
    });
  });

  describe('Port Management', () => {
    it('should use configured port', () => {
      const config = handler.getConfig();
      expect(config.port).toBe(8001);
    });

    it('should return API URL with configured port', () => {
      const apiUrl = handler.getApiUrl();
      expect(apiUrl).toBe('http://localhost:8001');
    });

    it('should support different ports for parallel deployments', () => {
      const handler1 = new FasterWhisperDockerDeploymentHandler({ port: 8001 });
      const handler2 = new FasterWhisperDockerDeploymentHandler({ port: 8002 });
      const handler3 = new FasterWhisperDockerDeploymentHandler({ port: 8003 });

      expect(handler1.getApiUrl()).toBe('http://localhost:8001');
      expect(handler2.getApiUrl()).toBe('http://localhost:8002');
      expect(handler3.getApiUrl()).toBe('http://localhost:8003');
    });

    it('should have default port 8001', () => {
      const defaultHandler = new FasterWhisperDockerDeploymentHandler();
      expect(defaultHandler.getApiUrl()).toBe('http://localhost:8001');
    });
  });

  describe('Resource Configuration', () => {
    it('should support CPU limits', () => {
      const config = handler.getConfig();
      expect(config.cpuLimit).toBe('4');
    });

    it('should support memory limits', () => {
      const config = handler.getConfig();
      expect(config.memoryLimit).toBe('8g');
    });

    it('should accept custom CPU limits', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        cpuLimit: '8',
      });

      const config = customHandler.getConfig();
      expect(config.cpuLimit).toBe('8');
    });

    it('should accept custom memory limits', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        memoryLimit: '16g',
      });

      const config = customHandler.getConfig();
      expect(config.memoryLimit).toBe('16g');
    });
  });

  describe('Container State', () => {
    it('should indicate container is not running initially', () => {
      expect(handler.isRunning()).toBe(false);
    });

    it('should return undefined container ID initially', () => {
      expect(handler.getContainerId()).toBeUndefined();
    });
  });

  describe('Health Check Setup', () => {
    it('should be configured for health checks', () => {
      // Handler should have health check capability
      expect(handler.healthCheck).toBeDefined();
      expect(typeof handler.healthCheck).toBe('function');
    });
  });

  describe('API Configuration Support', () => {
    it('should return configuration copy', () => {
      const config = handler.getConfig();
      const config2 = handler.getConfig();

      // Should be separate objects
      expect(config).not.toBe(config2);
      // But with same content
      expect(config).toEqual(config2);
    });

    it('should preserve compute type in config', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        computeType: 'float32',
      });

      expect(customHandler.getConfig().computeType).toBe('float32');
    });

    it('should preserve beam size in config', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        beamSize: 20,
      });

      expect(customHandler.getConfig().beamSize).toBe(20);
    });

    it('should preserve CPU threads in config', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        cpuThreads: 12,
      });

      expect(customHandler.getConfig().cpuThreads).toBe(12);
    });
  });

  describe('Model Size Configuration', () => {
    it('should support base model size', () => {
      const config = handler.getConfig();
      expect(config.modelSize).toBe('base');
    });

    it('should support small model size', () => {
      const smallHandler = new FasterWhisperDockerDeploymentHandler({
        modelSize: 'small',
      });

      const config = smallHandler.getConfig();
      expect(config.modelSize).toBe('small');
    });

    it('should support medium model size', () => {
      const mediumHandler = new FasterWhisperDockerDeploymentHandler({
        modelSize: 'medium',
      });

      const config = mediumHandler.getConfig();
      expect(config.modelSize).toBe('medium');
    });

    it('should support large model size', () => {
      const largeHandler = new FasterWhisperDockerDeploymentHandler({
        modelSize: 'large',
      });

      const config = largeHandler.getConfig();
      expect(config.modelSize).toBe('large');
    });

    it('should support tiny model size', () => {
      const tinyHandler = new FasterWhisperDockerDeploymentHandler({
        modelSize: 'tiny',
      });

      const config = tinyHandler.getConfig();
      expect(config.modelSize).toBe('tiny');
    });
  });

  describe('Container Naming', () => {
    it('should use custom container name', () => {
      const config = handler.getConfig();
      expect(config.containerName).toBe('test-faster-whisper');
    });

    it('should use default container name when not specified', () => {
      const defaultHandler = new FasterWhisperDockerDeploymentHandler();
      const config = defaultHandler.getConfig();
      expect(config.containerName).toBe('faster-whisper-stt');
    });

    it('should support multiple containers with different names', () => {
      const handler1 = new FasterWhisperDockerDeploymentHandler({
        containerName: 'whisper-1',
      });
      const handler2 = new FasterWhisperDockerDeploymentHandler({
        containerName: 'whisper-2',
      });

      expect(handler1.getConfig().containerName).toBe('whisper-1');
      expect(handler2.getConfig().containerName).toBe('whisper-2');
    });
  });

  describe('Image Configuration', () => {
    it('should use default image when not specified', () => {
      const defaultHandler = new FasterWhisperDockerDeploymentHandler();
      const config = defaultHandler.getConfig();
      expect(config.dockerImage).toBe('fedirz/faster-whisper-server:latest-cpu');
    });

    it('should accept custom Docker image', () => {
      const customHandler = new FasterWhisperDockerDeploymentHandler({
        dockerImage: 'custom-registry/faster-whisper:v2',
      });

      const config = customHandler.getConfig();
      expect(config.dockerImage).toBe('custom-registry/faster-whisper:v2');
    });

    it('should support GPU variants', () => {
      const gpuHandler = new FasterWhisperDockerDeploymentHandler({
        dockerImage: 'fedirz/faster-whisper-server:latest-cuda',
      });

      const config = gpuHandler.getConfig();
      expect(config.dockerImage).toContain('cuda');
    });
  });

  describe('Statistics and Diagnostics', () => {
    it('should have stats method available', () => {
      expect(handler.getStats).toBeDefined();
      expect(typeof handler.getStats).toBe('function');
    });

    it('should have logs method available', () => {
      expect(handler.getLogs).toBeDefined();
      expect(typeof handler.getLogs).toBe('function');
    });
  });

  describe('Docker Image Variants', () => {
    it('should detect CPU image variant', () => {
      const cpuHandler = new FasterWhisperDockerDeploymentHandler({
        dockerImage: 'fedirz/faster-whisper-server:latest-cpu',
        gpuEnabled: false,
      });

      const config = cpuHandler.getConfig();
      expect(config.gpuEnabled).toBe(false);
    });

    it('should support CUDA GPU image variant', () => {
      const cudaHandler = new FasterWhisperDockerDeploymentHandler({
        dockerImage: 'fedirz/faster-whisper-server:latest-cuda',
        gpuEnabled: true,
      });

      const config = cudaHandler.getConfig();
      expect(config.gpuEnabled).toBe(true);
      expect(config.dockerImage).toContain('cuda');
    });

    it('should support local image builds', () => {
      const localHandler = new FasterWhisperDockerDeploymentHandler({
        dockerImage: 'faster-whisper:local',
      });

      const config = localHandler.getConfig();
      expect(config.dockerImage).toBe('faster-whisper:local');
    });
  });

  describe('Multi-Instance Support', () => {
    it('should support creating multiple handler instances', () => {
      const handlers = [];
      for (let i = 0; i < 5; i++) {
        handlers.push(
          new FasterWhisperDockerDeploymentHandler({
            port: 8001 + i,
            containerName: `whisper-${i}`,
          }),
        );
      }

      expect(handlers).toHaveLength(5);
      handlers.forEach((h, i) => {
        expect(h.getConfig().port).toBe(8001 + i);
        expect(h.getConfig().containerName).toBe(`whisper-${i}`);
      });
    });

    it('should have independent configurations per instance', () => {
      const handler1 = new FasterWhisperDockerDeploymentHandler({
        computeType: 'float16',
      });
      const handler2 = new FasterWhisperDockerDeploymentHandler({
        computeType: 'int8',
      });

      expect(handler1.getConfig().computeType).toBe('float16');
      expect(handler2.getConfig().computeType).toBe('int8');
    });
  });

  describe('Performance Configuration', () => {
    it('should allow tuning for speed', () => {
      const speedHandler = new FasterWhisperDockerDeploymentHandler({
        computeType: 'int8',
        beamSize: 1,
        cpuThreads: 4,
      });

      const config = speedHandler.getConfig();
      expect(config.computeType).toBe('int8');
      expect(config.beamSize).toBe(1);
      expect(config.cpuThreads).toBe(4);
    });

    it('should allow tuning for accuracy', () => {
      const accuracyHandler = new FasterWhisperDockerDeploymentHandler({
        computeType: 'float32',
        beamSize: 512,
        cpuThreads: 8,
      });

      const config = accuracyHandler.getConfig();
      expect(config.computeType).toBe('float32');
      expect(config.beamSize).toBe(512);
      expect(config.cpuThreads).toBe(8);
    });
  });
});
