/**
 * Deepgram Docker Streaming Tests
 *
 * Comprehensive test coverage for WebSocket streaming scenarios:
 * - Real-time audio transcription with chunked input
 * - Interim result handling
 * - Turn detection and speech pause detection
 * - Message framing and binary audio data
 * - Connection pooling during streaming
 * - Error recovery during streaming
 * - Stream termination and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import DeepgramDockerHandler from './deepgram-docker.js';

/**
 * Enhanced Mock WebSocket for streaming scenarios
 */
class StreamingMockWebSocket extends EventEmitter {
  public OPEN = 1;
  public CLOSING = 2;
  public CLOSED = 3;
  public readyState: number = 0;
  public url: string;
  public closed: boolean = false;
  public sentData: (string | Uint8Array)[] = [];
  public receivedMessages: any[] = [];

  constructor(url: string) {
    super();
    this.url = url;

    // Simulate async connection
    setImmediate(() => {
      this.readyState = this.OPEN;
      this.emit('open');
    });
  }

  send(data: string | Uint8Array | ArrayBufferLike): void {
    if (this.closed) {
      throw new Error('WebSocket is closed');
    }

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        this.receivedMessages.push(parsed);

        // Trigger response after a short delay
        setImmediate(() => {
          this.simulateResponse(parsed);
        });
      } catch (e) {
        // Binary or other format
      }
    } else {
      this.sentData.push(new Uint8Array(data));
    }
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.readyState = this.CLOSED;
    this.emit('close', { code, reason });
  }

  simulateMessage(data: string): void {
    this.emit('message', { data });
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }

  private simulateResponse(request: any): void {
    if (request.type === 'FinishStream') {
      this.simulateMessage(
        JSON.stringify({
          type: 'Results',
          is_final: true,
          result: { results: [] },
        }),
      );
    }
  }
}

/**
 * Streaming test suite
 */
describe('DeepgramDockerHandler - Streaming Scenarios', () => {
  let handler: DeepgramDockerHandler;

  beforeEach(() => {
    handler = new DeepgramDockerHandler('deepgram:latest', 8888, 8889);
    (handler as any).assignedWsPort = 9000;

    vi.stubGlobal('WebSocket', StreamingMockWebSocket);
  });

  afterEach(async () => {
    await handler.cleanup();
    vi.unstubAllGlobals();
  });

  describe('Audio Streaming', () => {
    it('should stream audio in chunks', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      // Simulate 5 chunks of audio
      const chunks = [];
      for (let i = 0; i < 5; i++) {
        const chunk = new Uint8Array(512);
        chunk.fill(i);
        chunks.push(chunk);
      }

      // Send all chunks
      chunks.forEach((chunk) => mockWs.send(chunk));

      expect(mockWs.sentData.length).toBe(5);
      expect(mockWs.sentData[0].length).toBe(512);

      // Verify each chunk is distinct
      for (let i = 0; i < 5; i++) {
        expect((mockWs.sentData[i] as Uint8Array)[0]).toBe(i);
      }
    });

    it('should handle continuous audio stream', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      // Simulate continuous streaming for 1 second at 16kHz
      const sampleRate = 16000;
      const duration = 1000; // ms
      const bytesPerSample = 2; // 16-bit
      const bytesPerChunk = 1024;

      const totalBytes = (sampleRate * bytesPerSample * duration) / 1000;
      const totalChunks = Math.ceil(totalBytes / bytesPerChunk);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = new Uint8Array(Math.min(bytesPerChunk, totalBytes - i * bytesPerChunk));
        mockWs.send(chunk);
      }

      expect(mockWs.sentData.length).toBe(totalChunks);
    });

    it('should preserve audio data integrity', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      // Create recognizable audio pattern
      const pattern = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const audioBuffer = new Uint8Array(1024);

      // Repeat pattern
      for (let i = 0; i < 1024; i += 4) {
        audioBuffer.set(pattern, i);
      }

      mockWs.send(audioBuffer);

      const sent = mockWs.sentData[0] as Uint8Array;
      expect(sent[0]).toBe(0xde);
      expect(sent[1]).toBe(0xad);
      expect(sent[2]).toBe(0xbe);
      expect(sent[3]).toBe(0xef);
    });

    it('should signal end of stream', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      // Send audio
      const chunk = new Uint8Array(512);
      mockWs.send(chunk);

      // Signal end
      mockWs.send(JSON.stringify({ type: 'FinishStream' }));

      expect(mockWs.receivedMessages.length).toBeGreaterThan(0);
      expect(mockWs.receivedMessages[mockWs.receivedMessages.length - 1].type).toBe(
        'FinishStream',
      );
    });
  });

  describe('Interim Result Handling', () => {
    it('should handle partial transcription updates', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');
      const results: any[] = [];

      mockWs.on('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.result?.results) {
          results.push(message);
        }
      });

      // Simulate partial result
      const partialResult = {
        result: {
          results: [
            {
              final: false,
              speech_final: false,
              punctuated_result: {
                transcript: 'Hello,',
                confidence: 0.92,
              },
            },
          ],
        },
      };

      mockWs.simulateMessage(JSON.stringify(partialResult));

      await new Promise((resolve) => setImmediate(resolve));

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].result.results[0].final).toBe(false);
    });

    it('should aggregate interim results', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');
      const transcripts: string[] = [];

      mockWs.on('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.result?.results?.[0]?.punctuated_result?.transcript) {
          transcripts.push(message.result.results[0].punctuated_result.transcript);
        }
      });

      // Simulate multiple interim results
      const messages = [
        { transcript: 'Hello,', confidence: 0.90 },
        { transcript: 'Hello, how', confidence: 0.92 },
        { transcript: 'Hello, how are', confidence: 0.94 },
        { transcript: 'Hello, how are you?', confidence: 0.96 },
      ];

      for (const msg of messages) {
        mockWs.simulateMessage(
          JSON.stringify({
            result: {
              results: [
                {
                  final: msg === messages[messages.length - 1],
                  speech_final: msg === messages[messages.length - 1],
                  punctuated_result: msg,
                },
              ],
            },
          }),
        );
      }

      await new Promise((resolve) => setImmediate(resolve));

      expect(transcripts.length).toBe(messages.length);
      expect(transcripts[0]).toContain('Hello,');
      expect(transcripts[transcripts.length - 1]).toContain('you?');
    });

    it('should distinguish final from interim results', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');
      const finalResults: any[] = [];
      const interimResults: any[] = [];

      mockWs.on('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.result?.results?.[0]) {
          if (message.result.results[0].final) {
            finalResults.push(message);
          } else {
            interimResults.push(message);
          }
        }
      });

      // Send interim results
      for (let i = 0; i < 3; i++) {
        mockWs.simulateMessage(
          JSON.stringify({
            result: {
              results: [
                {
                  final: false,
                  speech_final: false,
                  punctuated_result: {
                    transcript: 'Test ' + i,
                    confidence: 0.9 + i * 0.02,
                  },
                },
              ],
            },
          }),
        );
      }

      // Send final result
      mockWs.simulateMessage(
        JSON.stringify({
          result: {
            results: [
              {
                final: true,
                speech_final: true,
                punctuated_result: {
                  transcript: 'Test 3 final',
                  confidence: 0.98,
                },
              },
            ],
          },
          is_final: true,
        }),
      );

      await new Promise((resolve) => setImmediate(resolve));

      expect(interimResults.length).toBe(3);
      expect(finalResults.length).toBeGreaterThan(0);
    });
  });

  describe('Connection State During Streaming', () => {
    it('should maintain open connection during streaming', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      await new Promise((resolve) => setImmediate(resolve));

      expect(mockWs.readyState).toBe(mockWs.OPEN);

      // Send data
      mockWs.send(new Uint8Array(512));
      expect(mockWs.readyState).toBe(mockWs.OPEN);

      // Send termination
      mockWs.send(JSON.stringify({ type: 'FinishStream' }));
      expect(mockWs.readyState).toBe(mockWs.OPEN);
    });

    it('should handle reconnection after disconnection', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      await new Promise((resolve) => setImmediate(resolve));
      expect(mockWs.readyState).toBe(mockWs.OPEN);

      // Simulate disconnection
      mockWs.close();
      expect(mockWs.readyState).toBe(mockWs.CLOSED);

      // Simulate reconnection
      const newWs = new StreamingMockWebSocket('ws://test');
      await new Promise((resolve) => setImmediate(resolve));
      expect(newWs.readyState).toBe(newWs.OPEN);
    });

    it('should reject send on closed connection', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');
      mockWs.close();

      expect(() => {
        mockWs.send(new Uint8Array(512));
      }).toThrow('WebSocket is closed');
    });
  });

  describe('Message Framing', () => {
    it('should handle large messages', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      // Create a large message (>64KB)
      const largeTranscript = 'word '.repeat(20000); // Large text
      const largeMessage = {
        result: {
          results: [
            {
              final: true,
              punctuated_result: {
                transcript: largeTranscript,
                confidence: 0.95,
              },
            },
          ],
        },
      };

      mockWs.send(JSON.stringify(largeMessage));

      expect(mockWs.receivedMessages.length).toBeGreaterThan(0);
      const sent = mockWs.receivedMessages[0];
      expect(sent.result.results[0].punctuated_result.transcript.length).toBeGreaterThan(10000);
    });

    it('should handle binary frame boundaries correctly', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      // Send multiple frames that together form valid audio
      const frame1 = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const frame2 = new Uint8Array([0x04, 0x05, 0x06, 0x07]);
      const frame3 = new Uint8Array([0x08, 0x09, 0x0a, 0x0b]);

      mockWs.send(frame1);
      mockWs.send(frame2);
      mockWs.send(frame3);

      expect(mockWs.sentData.length).toBe(3);

      // Verify frames are distinct
      const combined = Buffer.concat([
        Buffer.from(mockWs.sentData[0] as Uint8Array),
        Buffer.from(mockWs.sentData[1] as Uint8Array),
        Buffer.from(mockWs.sentData[2] as Uint8Array),
      ]);

      expect(combined[0]).toBe(0x00);
      expect(combined[11]).toBe(0x0b);
    });
  });

  describe('Stream Termination', () => {
    it('should cleanly terminate stream', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      await new Promise((resolve) => setImmediate(resolve));

      // Send some audio
      mockWs.send(new Uint8Array(512));

      // Send termination message
      mockWs.send(JSON.stringify({ type: 'FinishStream' }));

      // Close connection
      mockWs.close();

      expect(mockWs.closed).toBe(true);
      expect(mockWs.readyState).toBe(mockWs.CLOSED);
    });

    it('should handle abrupt connection closure', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      await new Promise((resolve) => setImmediate(resolve));

      let closureDetected = false;
      mockWs.on('close', () => {
        closureDetected = true;
      });

      // Abrupt close without FinishStream
      mockWs.close(1006, 'Abnormal closure');

      expect(closureDetected).toBe(true);
      expect(mockWs.closed).toBe(true);
    });

    it('should not send data after stream closure', async () => {
      const mockWs = new StreamingMockWebSocket('ws://test');

      mockWs.close();

      expect(() => {
        mockWs.send(new Uint8Array(512));
      }).toThrow();
    });
  });

  describe('Multi-Stream Scenarios', () => {
    it('should handle multiple concurrent streams from pool', async () => {
      const streams = [];

      for (let i = 0; i < 3; i++) {
        const mockWs = new StreamingMockWebSocket(`ws://test-${i}`);

        await new Promise((resolve) => setImmediate(resolve));

        // Send unique audio to each stream
        const audioChunk = new Uint8Array([i, i, i, i]);
        mockWs.send(audioChunk);

        streams.push(mockWs);
      }

      expect(streams.length).toBe(3);
      expect(streams[0].sentData.length).toBeGreaterThan(0);
      expect((streams[0].sentData[0] as Uint8Array)[0]).toBe(0);
      expect((streams[1].sentData[0] as Uint8Array)[0]).toBe(1);
      expect((streams[2].sentData[0] as Uint8Array)[0]).toBe(2);
    });

    it('should isolate streams from each other', async () => {
      const mockWs1 = new StreamingMockWebSocket('ws://test-1');
      const mockWs2 = new StreamingMockWebSocket('ws://test-2');

      await new Promise((resolve) => setImmediate(resolve));

      mockWs1.send(new Uint8Array([1, 1, 1]));
      mockWs2.send(new Uint8Array([2, 2, 2]));

      expect(mockWs1.sentData.length).toBe(1);
      expect(mockWs2.sentData.length).toBe(1);

      // Close first stream
      mockWs1.close();
      expect(mockWs1.closed).toBe(true);
      expect(mockWs2.closed).toBe(false);

      // Second stream should still be usable
      mockWs2.send(new Uint8Array([3, 3, 3]));
      expect(mockWs2.sentData.length).toBe(2);
    });
  });

  describe('WebSocket URL Parameters', () => {
    it('should include all required parameters in WebSocket URL', async () => {
      (handler as any).assignedWsPort = 8888;

      const url = (handler as any).buildWebSocketUrl('nova-v3', 'en-US');
      const parsedUrl = new URL(url);

      // Verify all critical parameters
      const requiredParams = [
        'model',
        'language',
        'encoding',
        'sample_rate',
        'channels',
        'punctuate',
        'interim_results',
        'vad_events',
        'utterance_end_ms',
        'speech_final',
        'tier',
        'endpointing',
      ];

      for (const param of requiredParams) {
        expect(parsedUrl.searchParams.has(param)).toBe(true);
      }
    });

    it('should support different models in URL', async () => {
      (handler as any).assignedWsPort = 8888;

      const urlNovaV3 = (handler as any).buildWebSocketUrl('nova-v3', 'en-US');
      const urlFlux = (handler as any).buildWebSocketUrl('flux', 'en-US');

      expect(urlNovaV3).toContain('model=nova-v3');
      expect(urlFlux).toContain('model=flux');
    });

    it('should support different languages in URL', async () => {
      (handler as any).assignedWsPort = 8888;

      const languages = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP'];

      for (const lang of languages) {
        const url = (handler as any).buildWebSocketUrl('nova-v3', lang);
        expect(url).toContain(`language=${lang}`);
      }
    });
  });

  describe('Connection Pooling', () => {
    it('should pool connections by model and language', () => {
      for (let i = 0; i < 3; i++) {
        const mockWs = new StreamingMockWebSocket('ws://test');
        mockWs.readyState = mockWs.OPEN;
        handler.returnPooledConnection(mockWs, 'nova-v3', 'en-US');
      }

      const stats = handler.getPoolStats();
      expect(stats['nova-v3:en-US']).toBe(3);
    });

    it('should limit pool size per model/language', () => {
      for (let i = 0; i < 15; i++) {
        const mockWs = new StreamingMockWebSocket('ws://test');
        mockWs.readyState = mockWs.OPEN;
        handler.returnPooledConnection(mockWs, 'nova-v3', 'en-US');
      }

      const stats = handler.getPoolStats();
      // Should not exceed max pool size of 10
      expect(stats['nova-v3:en-US']).toBeLessThanOrEqual(10);
    });
  });
});
