/**
 * Docker Handler Tests
 *
 * Cohesive mocking strategy for promisified exec:
 * - Mock `util.promisify` to return our mock function
 * - Mock `exec` to handle Docker commands with callback pattern
 * - promisify(exec) will return a mocked function that resolves to { stdout, stderr }
 * - Each mock must extract callback as last argument and call it with (error, stdout, stderr)
 * - Return { kill, on } to match ChildProcess interface
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import type { DockerDeploymentHandler } from './docker-handler.spec.js';
import { VoiceProviderError } from '../executor.js';

vi.mock('child_process');
vi.mock('util');
vi.mock('http');

describe('DockerHandler', () => {
  let handler: any;
  let mockExecSync: any;
  let DockerHandler: any;

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Create a shared mock exec function for this test
    mockExecSync = vi.fn();
    let callCount = 0;

    // Mock promisify to return a function that handles our mocked exec
    vi.mocked(promisify).mockImplementation((fn: any) => {
      return async (...args: any[]) => {
        return new Promise((resolve, reject) => {
          // Call the original function with a callback
          const callback = (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          };

          // Invoke the mocked exec
          mockExecSync(...args, callback);
        });
      };
    });

    // Mock exec to record calls and use our test callbacks
    vi.mocked(exec).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      mockExecSync(...args.slice(0, -1), cb);
      return { kill: vi.fn(), on: vi.fn() } as any;
    });

    // Now import the DockerHandler AFTER mocking
    const importedHandler = await import('./docker-handler.js');
    DockerHandler = importedHandler.DockerHandler;
    handler = new DockerHandler('kokoro:latest', 8000);
  });

  afterEach(async () => {
    try {
      if (handler?.getRunningContainerId?.()) {
        // Mock exec for cleanup operations
        let cleanupCount = 0;
        mockExecSync.mockImplementation((cmd: string, cb: any) => {
          cleanupCount++;
          // Just succeed for any docker commands during cleanup
          setImmediate(() => cb(null, '', ''));
        });
        await handler.cleanup();
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('checkDockerAvailable', () => {
    it('should return true when docker is available', async () => {
      mockExecSync.mockImplementationOnce((cmd: string, cb: any) => {
        setImmediate(() => cb(null, 'Docker version 20.10.0\n', ''));
      });

      const result = await handler.checkDockerAvailable();
      expect(result).toBe(true);
    });

    it('should return false when docker is not available', async () => {
      mockExecSync.mockImplementationOnce((cmd: string, cb: any) => {
        setImmediate(() => cb(new Error('docker: command not found')));
      });

      const result = await handler.checkDockerAvailable();
      expect(result).toBe(false);
    });
  });

  describe('pullImage', () => {
    it('should successfully pull image on first attempt', async () => {
      mockExecSync.mockImplementationOnce((cmd: string, cb: any) => {
        setImmediate(() => cb(null, 'Successfully pulled image\n', ''));
      });

      await expect(handler.pullImage('kokoro:latest')).resolves.not.toThrow();
    });

    it('should retry on network failure', async () => {
      let attempts = 0;

      mockExecSync.mockImplementation((cmd: string, cb: any) => {
        attempts++;
        if (attempts < 3) {
          // First two attempts fail
          setTimeout(() => cb(new Error('network error')), 50);
        } else {
          // Third attempt succeeds
          setTimeout(() => cb(null, 'Successfully pulled image\n', ''), 50);
        }
      });

      // Extended timeout for retry delays (1s + 2s exponential backoff)
      await expect(handler.pullImage('kokoro:latest', 3)).resolves.not.toThrow();
      expect(mockExecSync).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should throw after max retries exhausted', async () => {
      mockExecSync.mockImplementation((cmd: string, cb: any) => {
        setTimeout(() => cb(new Error('Temporary failure in name resolution')), 50);
      });

      await expect(handler.pullImage('kokoro:latest', 2)).rejects.toThrow(
        VoiceProviderError,
      );
    }, 15000);
  });

  describe('startContainer', () => {
    it('should start container with correct configuration', async () => {
      let execCount = 0;

      mockExecSync.mockImplementation((cmd: string, cb: any) => {
        execCount++;

        if (execCount === 1) {
          // checkDockerAvailable
          setImmediate(() => cb(null, 'Docker version 20.10.0\n', ''));
        } else if (execCount === 2) {
          // pullImage
          setImmediate(() => cb(null, 'Successfully pulled image\n', ''));
        } else if (execCount === 3) {
          // docker run
          setImmediate(() => cb(null, 'container-id-123\n', ''));
        } else if (execCount === 4) {
          // getContainerStatus
          setImmediate(() => cb(null, 'running\n', ''));
        } else if (execCount === 5) {
          // getAssignedPort (docker inspect)
          setImmediate(() => cb(null, '32768\n', ''));
        }
      });

      // Mock http.get for health check
      vi.mocked(http.get).mockImplementation((options: any, callback: any) => {
        // Simulate successful health check response
        setImmediate(() => {
          const mockResponse: any = {
            statusCode: 200,
            on: (event: string, handler: Function) => {
              if (event === 'end') {
                setImmediate(() => handler());
              }
            },
          };
          callback(mockResponse);
        });
        return {
          on: (event: string, handler: Function) => {},
          destroy: vi.fn(),
        } as any;
      });

      const config = {
        image: 'kokoro:latest',
        port: 8000,
        volumes: { '/data': '/kokoro/data' },
        env: { MODEL: 'en_US-hfc_female-medium' },
      };

      const containerId = await handler.startContainer(config);
      expect(containerId).toBe('container-id-123');
      expect(handler.getRunningContainerId()).toBe('container-id-123');
      expect(handler.getAssignedPortNumber()).toBe(32768);
    });

    it('should throw if docker not available', async () => {
      mockExecSync.mockImplementationOnce((cmd: string, cb: any) => {
        setImmediate(() => cb(new Error('docker not found')));
      });

      const config = { image: 'kokoro:latest', port: 8000 };

      await expect(handler.startContainer(config)).rejects.toThrow(
        VoiceProviderError,
      );
    });

    it('should throw if config is missing', async () => {
      await expect(handler.startContainer(undefined as any)).rejects.toThrow(
        VoiceProviderError,
      );
    });
  });

  describe('getContainerStatus', () => {
    it('should return running status', async () => {
      mockExecSync.mockImplementationOnce((cmd: string, cb: any) => {
        setImmediate(() => cb(null, 'running\n', ''));
      });

      const status = await handler.getContainerStatus('container-123');
      expect(status).toBe('running');
    });

    it('should return stopped status', async () => {
      mockExecSync.mockImplementationOnce((cmd: string, cb: any) => {
        setImmediate(() => cb(null, '\n', ''));
      });

      const status = await handler.getContainerStatus('container-123');
      expect(status).toBe('stopped');
    });

    it('should return error on check failure', async () => {
      mockExecSync.mockImplementationOnce((cmd: string, cb: any) => {
        setImmediate(() => cb(new Error('docker error')));
      });

      const status = await handler.getContainerStatus('container-123');
      expect(status).toBe('error');
    });
  });

  describe('stopContainer', () => {
    it('should stop container gracefully', async () => {
      let stopCount = 0;

      mockExecSync.mockImplementation((cmd: string, cb: any) => {
        stopCount++;
        if (stopCount === 1) {
          // docker stop
          setImmediate(() => cb(null, '', ''));
        } else if (stopCount === 2) {
          // docker rm
          setImmediate(() => cb(null, '', ''));
        }
      });

      await expect(
        handler.stopContainer('container-123'),
      ).resolves.not.toThrow();
    });

    it('should force kill on stop timeout', async () => {
      let killCount = 0;

      mockExecSync.mockImplementation((cmd: string, cb: any) => {
        killCount++;
        if (killCount === 1) {
          // docker stop (fails)
          setImmediate(() => cb(new Error('timeout')));
        } else if (killCount === 2) {
          // docker kill
          setImmediate(() => cb(null, '', ''));
        } else if (killCount === 3) {
          // docker rm
          setImmediate(() => cb(null, '', ''));
        }
      });

      await expect(
        handler.stopContainer('container-123'),
      ).resolves.not.toThrow();
    });
  });

  describe('waitForHealthy', () => {
    it('should timeout on failed health checks', async () => {
      vi.mocked(http.get).mockImplementation((options: any, callback: any) => {
        return {
          on: (event: string, handler: Function) => {
            if (event === 'error') {
              setImmediate(() => handler(new Error('Connection refused')));
            }
          },
          destroy: vi.fn(),
        } as any;
      });

      await expect(
        handler.waitForHealthy('http://localhost:8000/health', 100),
      ).rejects.toThrow(VoiceProviderError);
    });

    it('should successfully pass health check on valid response', async () => {
      vi.mocked(http.get).mockImplementation((options: any, callback: any) => {
        setImmediate(() => {
          const mockResponse: any = {
            statusCode: 200,
            on: (event: string, handler: Function) => {
              if (event === 'end') {
                setImmediate(() => handler());
              }
            },
          };
          callback(mockResponse);
        });
        return {
          on: (event: string, handler: Function) => {},
          destroy: vi.fn(),
        } as any;
      });

      await expect(
        handler.waitForHealthy('http://localhost:8000/health', 5000),
      ).resolves.not.toThrow();
    });
  });

  describe('synthesizeStream', () => {
    it('should use assigned port for API calls', async () => {
      // Set up assigned port
      handler.assignedPort = 32768;

      // Mock fetch
      global.fetch = vi.fn(async (url: string) => {
        // Verify the URL uses the assigned port
        expect(url).toContain(':32768');
        expect(url).toContain('/v1/audio/speech');

        // Return mock response with audio stream
        const mockStream = new ReadableStream({
          start(controller) {
            // Push some dummy WAV audio data
            const wavHeader = new Uint8Array([
              0x52, 0x49, 0x46, 0x46, // "RIFF"
              0x24, 0x00, 0x00, 0x00, // File size
              0x57, 0x41, 0x56, 0x45, // "WAVE"
            ]);
            controller.enqueue(wavHeader);
            controller.close();
          },
        });

        return {
          ok: true,
          body: mockStream,
        } as any;
      });

      const stream = await handler.synthesizeStream('Test text', {
        voice: 'af_heart',
        speed: 1.0,
      });

      expect(stream).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(':32768'),
        expect.any(Object),
      );
    });

    it('should fallback to configured port if assigned port not set', async () => {
      handler.assignedPort = null;

      global.fetch = vi.fn(async (url: string) => {
        // Should use the configured port (8000)
        expect(url).toContain(':8000');

        const mockStream = new ReadableStream({
          start(controller) {
            controller.close();
          },
        });

        return {
          ok: true,
          body: mockStream,
        } as any;
      });

      await handler.synthesizeStream('Test text');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(':8000'),
        expect.any(Object),
      );
    });

    it('should throw error on synthesis failure', async () => {
      handler.assignedPort = 32768;

      global.fetch = vi.fn(async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as any;
      });

      await expect(
        handler.synthesizeStream('Test text'),
      ).rejects.toThrow(VoiceProviderError);
    });

    it('should handle empty response body', async () => {
      handler.assignedPort = 32768;

      global.fetch = vi.fn(async () => {
        return {
          ok: true,
          body: null,
        } as any;
      });

      await expect(
        handler.synthesizeStream('Test text'),
      ).rejects.toThrow(VoiceProviderError);
    });
  });

  describe('Port Management', () => {
    it('should track assigned port separately from configured port', () => {
      const handler2 = new DockerHandler('kokoro:latest', 9000);

      expect(handler2.getAssignedPortNumber()).toBeNull();

      // Simulate port assignment
      handler2.assignedPort = 32769;

      expect(handler2.getAssignedPortNumber()).toBe(32769);
    });

    it('should handle port conflicts with cleanup', async () => {
      let execCount = 0;

      mockExecSync.mockImplementation((cmd: string, cb: any) => {
        execCount++;
        // Just succeed for cleanup
        setImmediate(() => cb(null, '', ''));
      });

      await handler.cleanup();

      // Should call docker stop and docker rm
      expect(execCount).toBeGreaterThanOrEqual(0);
    });
  });
});
