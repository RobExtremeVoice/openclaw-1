/**
 * E2E Streaming Tests for Cartesia and Kokoro
 *
 * Tests real-time streaming with actual services (requires API keys/Docker)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CartesiaExecutor } from './cartesia.js';
import { KokoroExecutor } from './kokoro.js';
import type { AudioBuffer } from './executor.js';

// Only run these tests if LIVE=1 is set
const isLiveTest = process.env.LIVE === '1';

describe.skipIf(!isLiveTest)('E2E Streaming Tests', () => {
  describe('Cartesia WebSocket Streaming', () => {
    let executor: CartesiaExecutor;

    beforeAll(async () => {
      const apiKey = process.env.CARTESIA_API_KEY;
      if (!apiKey) {
        throw new Error('CARTESIA_API_KEY not set');
      }

      executor = new CartesiaExecutor({
        apiKey,
        model: 'sonic-turbo',
        voiceId: process.env.CARTESIA_VOICE_ID || 'a0e99841-438c-4a64-b679-ae501e7d6091',
      });

      await executor.initialize();
    });

    afterAll(async () => {
      if (executor) {
        await executor.shutdown();
      }
    });

    it('should stream real audio with <100ms first chunk latency', async () => {
      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Hello, this is a real-time streaming test.');
          controller.close();
        },
      });

      const startTime = performance.now();
      let firstChunkTime = 0;
      const chunks: AudioBuffer[] = [];

      for await (const chunk of executor.synthesizeStream(textStream)) {
        if (firstChunkTime === 0) {
          firstChunkTime = performance.now() - startTime;
        }
        chunks.push(chunk);
      }

      console.log(`[Cartesia E2E] First chunk latency: ${firstChunkTime.toFixed(2)}ms`);
      console.log(`[Cartesia E2E] Total chunks: ${chunks.length}`);

      expect(firstChunkTime).toBeLessThan(100);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].data.length).toBeGreaterThan(0);
    });

    it('should handle long streaming text', async () => {
      const longText =
        'This is a longer streaming test to validate that the WebSocket connection can handle sustained streaming. ' +
        'We want to ensure that backpressure is handled correctly and that all chunks arrive in order. ' +
        'The streaming implementation should not buffer sentences but should send audio as soon as it is available.';

      const textStream = new ReadableStream({
        async start(controller) {
          const words = longText.split(' ');
          for (const word of words) {
            controller.enqueue(word + ' ');
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          controller.close();
        },
      });

      const chunks: AudioBuffer[] = [];
      const timestamps: number[] = [];
      const startTime = performance.now();

      for await (const chunk of executor.synthesizeStream(textStream)) {
        chunks.push(chunk);
        timestamps.push(performance.now() - startTime);
      }

      console.log(`[Cartesia E2E] Long text - chunks: ${chunks.length}`);
      console.log(
        `[Cartesia E2E] Long text - total duration: ${timestamps[timestamps.length - 1].toFixed(2)}ms`,
      );

      expect(chunks.length).toBeGreaterThan(5);

      // Verify chunks arrive continuously without long gaps
      const intervals = timestamps.map((t, i) => (i > 0 ? t - timestamps[i - 1] : 0));
      const maxInterval = Math.max(...intervals);
      expect(maxInterval).toBeLessThan(2000); // No gap longer than 2 seconds
    });
  });

  describe('Kokoro HTTP Streaming', () => {
    let executor: KokoroExecutor;

    beforeAll(async () => {
      executor = new KokoroExecutor({
        mode: 'docker',
        docker: {
          image: process.env.KOKORO_DOCKER_IMAGE || 'kokoro:latest',
          port: 8000,
        },
        healthCheck: {
          endpoint: 'http://localhost:8000/health',
          interval: 5000,
        },
      });

      await executor.initialize();
    });

    afterAll(async () => {
      if (executor) {
        await executor.shutdown();
      }
    });

    it('should stream real audio with <150ms first chunk latency', async () => {
      const textStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Hello, this is a Kokoro streaming test.');
          controller.close();
        },
      });

      const startTime = performance.now();
      let firstChunkTime = 0;
      const chunks: AudioBuffer[] = [];

      for await (const chunk of executor.synthesizeStream(textStream)) {
        if (firstChunkTime === 0) {
          firstChunkTime = performance.now() - startTime;
        }
        chunks.push(chunk);
      }

      console.log(`[Kokoro E2E] First chunk latency: ${firstChunkTime.toFixed(2)}ms`);
      console.log(`[Kokoro E2E] Total chunks: ${chunks.length}`);

      expect(firstChunkTime).toBeLessThan(150);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].data.length).toBeGreaterThan(0);
    });

    it('should handle HTTP chunked transfer correctly', async () => {
      const text =
        'Testing HTTP chunked transfer encoding with multiple audio chunks. ' +
        'Each chunk should be delivered as soon as it is available without waiting for the entire response.';

      const textStream = new ReadableStream({
        async start(controller) {
          const sentences = text.split('. ');
          for (const sentence of sentences) {
            if (sentence.trim()) {
              controller.enqueue(sentence + '. ');
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
          controller.close();
        },
      });

      const chunks: AudioBuffer[] = [];
      for await (const chunk of executor.synthesizeStream(textStream)) {
        chunks.push(chunk);
      }

      console.log(`[Kokoro E2E] Chunked transfer - chunks: ${chunks.length}`);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify all chunks are valid
      chunks.forEach((chunk, i) => {
        expect(chunk.data.length).toBeGreaterThan(0);
        expect(chunk.format).toBe('pcm_16');
        expect(chunk.sampleRate).toBe(16000);
      });
    });
  });
});
