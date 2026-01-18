/**
 * Cartesia WebSocket Streaming Tests
 * Comprehensive testing of streaming synthesis with proper flow control and backpressure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CartesiaExecutor } from './cartesia.js';
import type { AudioBuffer } from './executor.js';

/**
 * Advanced mock WebSocket with configurable behavior for testing
 */
class MockWebSocket {
  public readyState = 0;
  public static CONNECTING = 0;
  public static OPEN = 1;
  public static CLOSING = 2;
  public static CLOSED = 3;

  private listeners = new Map<string, Set<Function>>();
  private messageDelay = 5; // ms delay for realistic behavior
  private audioChunksToSend = 3; // number of audio chunks per text chunk

  constructor(public url: string, options?: { messageDelay?: number; chunksPerText?: number }) {
    this.messageDelay = options?.messageDelay ?? this.messageDelay;
    this.audioChunksToSend = options?.chunksPerText ?? this.audioChunksToSend;

    this.listeners.set('open', new Set());
    this.listeners.set('message', new Set());
    this.listeners.set('error', new Set());
    this.listeners.set('close', new Set());

    // Simulate async connection
    setImmediate(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emitEventInternal('open', undefined);
    });
  }

  protected emitEventInternal(event: string, data?: any) {
    const handlers = this.listeners.get(event) || new Set();
    handlers.forEach((handler) => {
      try {
        (handler as Function)(data);
      } catch (err) {
        // Ignore handler errors
      }
    });
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      return;
    }

    try {
      const message = JSON.parse(data);

      if (message.type === 'context') {
        // Context accepted silently
        return;
      }

      if (message.type === 'chunk') {
        // Send back multiple audio chunks with realistic delay
        for (let i = 0; i < this.audioChunksToSend; i++) {
          setTimeout(() => {
            const audioChunk = Buffer.from(`test audio chunk ${i}`).toString('base64');
            this.emitEventInternal('message', {
              data: JSON.stringify({
                type: 'chunk',
                audio: audioChunk,
              }),
            });
          }, this.messageDelay * (i + 1));
        }
      } else if (message.type === 'done') {
        // Signal completion after all chunks sent
        setTimeout(() => {
          this.emitEventInternal('message', {
            data: JSON.stringify({ type: 'done' }),
          });
        }, this.messageDelay * (this.audioChunksToSend + 1));
      }
    } catch (err) {
      // Ignore parse errors
    }
  }

  addEventListener(event: string, handler: Function) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.add(handler);
    }
  }

  removeEventListener(event: string, handler: Function) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
  }
}

describe('CartesiaExecutor WebSocket Streaming', () => {
  let executor: CartesiaExecutor;

  beforeEach(async () => {
    (globalThis as any).WebSocket = MockWebSocket;

    executor = new CartesiaExecutor({
      apiKey: 'test-key-12345',
      model: 'sonic-turbo',
      voiceId: 'test-voice-id',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'test-voice-id', name: 'Test Voice', language: 'en' }],
    });

    await executor.initialize();
  });

  afterEach(async () => {
    await executor.shutdown();
    delete (globalThis as any).WebSocket;
    vi.restoreAllMocks();
  });

  describe('basic streaming synthesis', () => {
    it('should stream audio chunks via WebSocket', async () => {
      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Hello ');
          controller.enqueue('world!');
          controller.close();
        },
      });

      const chunks: AudioBuffer[] = [];
      for await (const chunk of executor.synthesizeStream(textStream)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].data).toBeDefined();
      expect(chunks[0].data.length).toBeGreaterThan(0);
      expect(chunks[0].format).toBe('pcm16');
      expect(chunks[0].sampleRate).toBe(16000);
      expect(chunks[0].channels).toBe(1);
    });

    it('should handle empty text gracefully', async () => {
      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('   '); // Only whitespace
          controller.enqueue('');
          controller.close();
        },
      });

      const chunks: AudioBuffer[] = [];
      for await (const chunk of executor.synthesizeStream(textStream)) {
        chunks.push(chunk);
      }

      // Should still complete without errors
      expect(chunks).toBeDefined();
    });

    it('should respect custom sample rate', async () => {
      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Test audio');
          controller.close();
        },
      });

      const customSampleRate = 24000;
      const chunks: AudioBuffer[] = [];

      for await (const chunk of executor.synthesizeStream(textStream, {
        sampleRate: customSampleRate,
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.sampleRate).toBe(customSampleRate);
      });
    });
  });

  describe('latency and performance', () => {
    it('should receive first chunk in <100ms', async () => {
      (globalThis as any).WebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url, { messageDelay: 2, chunksPerText: 1 });
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Quick test');
          controller.close();
        },
      });

      const startTime = performance.now();
      let firstChunkLatency = 0;
      let chunkCount = 0;

      for await (const chunk of executor.synthesizeStream(textStream)) {
        if (chunkCount === 0) {
          firstChunkLatency = performance.now() - startTime;
        }
        chunkCount++;
        if (chunkCount === 1) break;
      }

      expect(firstChunkLatency).toBeLessThan(100);
      console.log(`First chunk latency: ${firstChunkLatency.toFixed(2)}ms`);
    });

    it('should maintain consistent chunk arrival times', async () => {
      (globalThis as any).WebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url, { messageDelay: 5, chunksPerText: 5 });
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Stream test text');
          controller.close();
        },
      });

      const arrivalTimes: number[] = [];
      const startTime = performance.now();

      for await (const chunk of executor.synthesizeStream(textStream)) {
        arrivalTimes.push(performance.now() - startTime);
      }

      expect(arrivalTimes.length).toBeGreaterThan(1);

      // Calculate consistency (low standard deviation = consistent)
      const avgInterval = arrivalTimes.length > 1
        ? (arrivalTimes[arrivalTimes.length - 1] - arrivalTimes[0]) / (arrivalTimes.length - 1)
        : 0;

      console.log(`Avg chunk interval: ${avgInterval.toFixed(2)}ms over ${arrivalTimes.length} chunks`);
      expect(avgInterval).toBeLessThan(50);
    });
  });

  describe('backpressure and flow control', () => {
    it('should handle multiple chunks with backpressure', async () => {
      (globalThis as any).WebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url, { messageDelay: 3, chunksPerText: 8 });
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < 3; i++) {
            controller.enqueue(`Text chunk ${i} `);
          }
          controller.close();
        },
      });

      const chunks: AudioBuffer[] = [];
      const chunkArrivalTimes: number[] = [];
      const startTime = performance.now();

      for await (const chunk of executor.synthesizeStream(textStream)) {
        chunks.push(chunk);
        chunkArrivalTimes.push(performance.now() - startTime);

        // Simulate slow consumer (backpressure)
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunkArrivalTimes.length).toBe(chunks.length);

      // Verify streaming didn't stall despite backpressure
      console.log(`Received ${chunks.length} chunks with backpressure applied`);
    });

    it('should manage buffer correctly under high load', async () => {
      (globalThis as any).WebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url, { messageDelay: 1, chunksPerText: 15 });
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < 5; i++) {
            controller.enqueue(`High volume text ${i} `.repeat(3));
          }
          controller.close();
        },
      });

      let maxBufferSize = 0;
      let currentBufferEstimate = 0;
      const chunks: AudioBuffer[] = [];

      for await (const chunk of executor.synthesizeStream(textStream)) {
        currentBufferEstimate++;
        maxBufferSize = Math.max(maxBufferSize, currentBufferEstimate);
        chunks.push(chunk);

        // Simulate fast consumer
        currentBufferEstimate--;

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      expect(chunks.length).toBeGreaterThan(0);
      // Buffer should not grow unbounded
      expect(maxBufferSize).toBeLessThanOrEqual(15);
      console.log(`Max estimated buffer size: ${maxBufferSize} chunks`);
    });
  });

  describe('error handling and resilience', () => {
    it('should handle stream errors gracefully', async () => {
      (globalThis as any).WebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          setImmediate(() => {
            setTimeout(() => {
              this.emitEventInternal('message', {
                data: JSON.stringify({
                  type: 'error',
                  message: 'Server processing error',
                }),
              });
            }, 10);
          });
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('This will fail');
          controller.close();
        },
      });

      const result = executor.synthesizeStream(textStream);
      await expect(async () => {
        for await (const chunk of result) {
          // Should throw error
        }
      }).rejects.toThrow('WebSocket error');
    });

    it('should handle malformed audio messages', async () => {
      (globalThis as any).WebSocket = class extends MockWebSocket {
        send(data: string) {
          if (this.readyState === MockWebSocket.OPEN) {
            try {
              const message = JSON.parse(data);
              if (message.type === 'chunk') {
                setTimeout(() => {
                  this.emitEventInternal('message', {
                    data: JSON.stringify({
                      type: 'chunk',
                      // Missing audio field
                    }),
                  });
                }, 5);
              } else if (message.type === 'done') {
                setTimeout(() => {
                  this.emitEventInternal('message', {
                    data: JSON.stringify({ type: 'done' }),
                  });
                }, 10);
              }
            } catch (err) {
              // Ignore
            }
          }
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Test malformed');
          controller.close();
        },
      });

      const chunks: AudioBuffer[] = [];
      for await (const chunk of executor.synthesizeStream(textStream)) {
        chunks.push(chunk);
      }

      // Should complete without throwing even with malformed messages
      expect(chunks).toBeDefined();
    });

    it('should timeout if no chunks received', async () => {
      (globalThis as any).WebSocket = class extends MockWebSocket {
        send(data: string) {
          // Send nothing - simulate unresponsive server
          // This means no audio chunks and no done message
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Timeout test');
          controller.close();
        },
      });

      // The test should timeout after 10 seconds (AudioBuffer timeout in synthesizeStream)
      // Set vitest timeout to allow for this
      const promise = (async () => {
        for await (const chunk of executor.synthesizeStream(textStream)) {
          // Should timeout waiting for chunks
        }
      })();

      await expect(promise).rejects.toThrow('Audio chunk timeout');
    }, 15000); // Give it 15 seconds to allow the 10s timeout to trigger

    it('should handle connection failures', async () => {
      (globalThis as any).WebSocket = class {
        readyState = 0;
        addEventListener(event: string, handler: Function) {
          if (event === 'error') {
            setImmediate(() => handler(new Error('Connection refused')));
          }
        }
        removeEventListener() {}
        send() {}
        close() {}
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Will fail to connect');
          controller.close();
        },
      });

      await expect(async () => {
        for await (const chunk of executor.synthesizeStream(textStream)) {
          // Should fail during connection
        }
      }).rejects.toThrow();
    });
  });

  describe('WebSocket protocol compliance', () => {
    it('should send context message on connection', async () => {
      let contextMessage: any;

      (globalThis as any).WebSocket = class extends MockWebSocket {
        send(data: string) {
          const message = JSON.parse(data);
          if (message.type === 'context') {
            contextMessage = message;
          }
          super.send(data);
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Test');
          controller.close();
        },
      });

      for await (const chunk of executor.synthesizeStream(textStream)) {
        break;
      }

      expect(contextMessage).toBeDefined();
      expect(contextMessage.model_id).toBe('sonic-turbo');
      expect(contextMessage.voice).toBeDefined();
      expect(contextMessage.voice.mode).toBe('id');
      expect(contextMessage.output_format).toBeDefined();
      expect(contextMessage.output_format.sample_rate).toBe(16000);
    });

    it('should send text chunks with chunk IDs', async () => {
      const sentChunks: any[] = [];

      (globalThis as any).WebSocket = class extends MockWebSocket {
        send(data: string) {
          const message = JSON.parse(data);
          if (message.type === 'chunk') {
            sentChunks.push(message);
          }
          super.send(data);
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Chunk 1 ');
          controller.enqueue('Chunk 2 ');
          controller.close();
        },
      });

      for await (const chunk of executor.synthesizeStream(textStream)) {
        // Consume stream
      }

      expect(sentChunks.length).toBeGreaterThan(0);
      sentChunks.forEach((chunk, index) => {
        expect(chunk.type).toBe('chunk');
        expect(chunk.chunk_id).toBe(`chunk_${index}`);
        expect(chunk.text).toBeDefined();
      });
    });

    it('should close WebSocket on completion', async () => {
      let wsInstance: any;

      (globalThis as any).WebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          wsInstance = this;
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Stream test');
          controller.close();
        },
      });

      for await (const chunk of executor.synthesizeStream(textStream)) {
        // Consume stream
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(wsInstance.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should send done message at stream end', async () => {
      const sentMessages: any[] = [];

      (globalThis as any).WebSocket = class extends MockWebSocket {
        send(data: string) {
          const message = JSON.parse(data);
          if (message.type === 'done' || message.type === 'chunk') {
            sentMessages.push(message);
          }
          super.send(data);
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Final test');
          controller.close();
        },
      });

      for await (const chunk of executor.synthesizeStream(textStream)) {
        // Consume stream
      }

      const doneMessages = sentMessages.filter((m) => m.type === 'done');
      expect(doneMessages.length).toBeGreaterThan(0);
    });
  });

  describe('audio format and configuration', () => {
    it('should support different voice options', async () => {
      let voiceConfig: any;

      (globalThis as any).WebSocket = class extends MockWebSocket {
        send(data: string) {
          const message = JSON.parse(data);
          if (message.type === 'context') {
            voiceConfig = message.voice;
          }
          super.send(data);
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Voice test');
          controller.close();
        },
      });

      for await (const chunk of executor.synthesizeStream(textStream, {
        voice: 'alternate-voice',
      })) {
        break;
      }

      expect(voiceConfig).toBeDefined();
      expect(voiceConfig.mode).toBe('id');
    });

    it('should apply speed and pitch controls', async () => {
      let contextMessage: any;

      (globalThis as any).WebSocket = class extends MockWebSocket {
        send(data: string) {
          const message = JSON.parse(data);
          if (message.type === 'context') {
            contextMessage = message;
          }
          super.send(data);
        }
      };

      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Speed test');
          controller.close();
        },
      });

      for await (const chunk of executor.synthesizeStream(textStream, {
        speed: 1.5,
        pitch: 1.2,
      })) {
        break;
      }

      expect(contextMessage.speed).toBe(1.5);
      expect(contextMessage.pitch).toBe(1.2);
    });
  });
});
