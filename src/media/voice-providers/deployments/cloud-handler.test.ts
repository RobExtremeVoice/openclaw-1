/**
 * Cloud Handler Tests
 *
 * Cohesive mocking strategy:
 * - Mock HTTP/HTTPS request/response with proper event emitters
 * - Create a request/response simulator that handles real Node.js patterns
 * - Properly handle async data streaming and error events
 * - Tests validate realistic HTTP retry behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import https from 'https';
import { CloudHandler } from './cloud-handler.js';
import { VoiceProviderError } from '../executor.js';

vi.mock('http');
vi.mock('https');

/**
 * Creates a mock HTTP response with proper event emitter behavior
 */
function createMockResponse(
  statusCode: number = 200,
  data: Buffer = Buffer.alloc(0),
): any {
  const listeners: Map<string, Function[]> = new Map();

  return {
    statusCode,
    on: vi.fn((event: string, callback: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(callback);

      // Simulate async data delivery
      if (event === 'data' && data.length > 0) {
        setImmediate(() => {
          listeners.get('data')?.forEach((cb) => cb(data));
        });
      }

      if (event === 'end') {
        setImmediate(() => {
          listeners.get('end')?.forEach((cb) => cb());
        });
      }

      return this;
    }),
  };
}

/**
 * Creates a mock HTTP request with proper event emitter behavior
 */
function createMockRequest(): any {
  const listeners: Map<string, Function[]> = new Map();

  return {
    on: vi.fn((event: string, callback: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(callback);
      return this;
    }),
    write: vi.fn(),
    end: vi.fn(() => {
      // Simulate async request completion
      setImmediate(() => {
        listeners.get('end')?.forEach((cb) => cb());
      });
    }),
    destroy: vi.fn(),
    emit: (event: string, ...args: any[]) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
  };
}

describe('CloudHandler', () => {
  let handler: CloudHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CloudHandler('http://localhost:8000', 'test-api-key');
  });

  afterEach(async () => {
    try {
      await handler.close();
    } catch (error) {
      // Ignore
    }
  });

  describe('validateEndpoint', () => {
    it('should return true for valid endpoint', async () => {
      const mockResponse = createMockResponse(200, Buffer.from('ok'));
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const result = await handler.validateEndpoint('http://localhost:8000');
      expect(result).toBe(true);
    });

    it('should return false for unreachable endpoint', async () => {
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation((() => {
        // Simulate connection error on next tick
        setImmediate(() => {
          mockRequest.emit('error', new Error('ECONNREFUSED'));
        });
        return mockRequest;
      }) as any);

      const result = await handler.validateEndpoint('http://localhost:9999');
      expect(result).toBe(false);
    });

    it('should return false for non-200 status codes', async () => {
      const mockResponse = createMockResponse(503, Buffer.from('Service Unavailable'));
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const result = await handler.validateEndpoint('http://localhost:8000');
      expect(result).toBe(false);
    });
  });

  describe('testAuthentication', () => {
    it('should return true for successful auth (200)', async () => {
      const mockResponse = createMockResponse(200, Buffer.from('authenticated'));
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const result = await handler.testAuthentication(
        'http://localhost:8000',
        'test-key',
      );
      expect(result).toBe(true);
    });

    it('should return false for auth failure (401)', async () => {
      const mockResponse = createMockResponse(401, Buffer.from('unauthorized'));
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const result = await handler.testAuthentication(
        'http://localhost:8000',
        'bad-key',
      );
      expect(result).toBe(false);
    });

    it('should return false for auth failure (403)', async () => {
      const mockResponse = createMockResponse(403, Buffer.from('forbidden'));
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const result = await handler.testAuthentication(
        'http://localhost:8000',
        'bad-key',
      );
      expect(result).toBe(false);
    });
  });

  describe('synthesize', () => {
    it('should synthesize text successfully', async () => {
      const audioData = Buffer.from('PCM audio data');
      const mockResponse = createMockResponse(200, audioData);
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const result = await handler.synthesize('Hello world', {
        voice: 'en_US-hfc_female-medium',
        speed: 1.0,
      });

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(audioData.length);
    });

    it('should throw on synthesis failure (500)', async () => {
      const mockResponse = createMockResponse(
        500,
        Buffer.from('Internal server error'),
      );
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      await expect(handler.synthesize('Hello world')).rejects.toThrow(
        VoiceProviderError,
      );
    });

    it('should throw on connection error', async () => {
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation((() => {
        setImmediate(() => {
          mockRequest.emit('error', new Error('Connection timeout'));
        });
        return mockRequest;
      }) as any);

      await expect(handler.synthesize('Hello world')).rejects.toThrow(
        VoiceProviderError,
      );
    });
  });

  describe('getConnectionStatus', () => {
    it('should return connected status with latency', async () => {
      const mockResponse = createMockResponse(200, Buffer.from('ok'));
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const status = await handler.getConnectionStatus();
      expect(status.connected).toBe(true);
      expect(status.latencyMs).toBeDefined();
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
      expect(status.lastCheck).toBeDefined();
    });

    it('should return disconnected status on error', async () => {
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation((() => {
        setImmediate(() => {
          mockRequest.emit('error', new Error('Connection failed'));
        });
        return mockRequest;
      }) as any);

      const status = await handler.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it('should return disconnected for non-200 responses', async () => {
      const mockResponse = createMockResponse(503, Buffer.from('Unavailable'));
      const mockRequest = createMockRequest();

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const status = await handler.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('retry logic', () => {
    it('should retry on temporary failure (503)', async () => {
      const failResponse = createMockResponse(
        503,
        Buffer.from('Service Unavailable'),
      );
      const successResponse = createMockResponse(200, Buffer.from('audio data'));

      let callCount = 0;
      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        const mockRequest = createMockRequest();
        setImmediate(() => {
          if (callCount++ === 0) {
            callback(failResponse);
          } else {
            callback(successResponse);
          }
        });
        return mockRequest;
      }) as any);

      const result = await handler.synthesize('Hello world');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(callCount).toBeGreaterThan(1); // Should have retried
    });

    it('should exhaust retries after max attempts', async () => {
      const failResponse = createMockResponse(
        503,
        Buffer.from('Service Unavailable'),
      );

      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        const mockRequest = createMockRequest();
        setImmediate(() => callback(failResponse));
        return mockRequest;
      }) as any);

      await expect(handler.synthesize('Hello world')).rejects.toThrow(
        VoiceProviderError,
      );
    });

    it('should not retry on 401 errors', async () => {
      const authFailResponse = createMockResponse(401, Buffer.from('Unauthorized'));

      let callCount = 0;
      vi.mocked(http.request).mockImplementation(((options: any, callback: any) => {
        const mockRequest = createMockRequest();
        setImmediate(() => {
          callCount++;
          callback(authFailResponse);
        });
        return mockRequest;
      }) as any);

      await expect(handler.synthesize('Hello world')).rejects.toThrow(
        VoiceProviderError,
      );

      // Should only attempt once (no retry for auth errors)
      expect(callCount).toBe(1);
    });
  });

  describe('close', () => {
    it('should close connection pool', async () => {
      await expect(handler.close()).resolves.not.toThrow();

      // Connection pool should be cleaned up
      expect(handler).toBeDefined();
    });
  });

  describe('HTTPS support', () => {
    it('should use https agent for https endpoints', async () => {
      const handler2 = new CloudHandler('https://localhost:8443', 'test-key');
      const mockResponse = createMockResponse(200, Buffer.from('ok'));
      const mockRequest = createMockRequest();

      vi.mocked(https.request).mockImplementation(((options: any, callback: any) => {
        setImmediate(() => callback(mockResponse));
        return mockRequest;
      }) as any);

      const result = await handler2.validateEndpoint('https://localhost:8443');
      expect(result).toBe(true);
      expect(vi.mocked(https.request)).toHaveBeenCalled();

      await handler2.close();
    });
  });
});
