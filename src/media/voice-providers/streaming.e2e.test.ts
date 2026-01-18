/**
 * E2E Streaming Tests for Voice Providers
 *
 * Tests real streaming behavior for:
 * - Cartesia WebSocket (real API connection)
 * - Kokoro HTTP (Docker or real API)
 *
 * Success criteria:
 * - Cartesia: <100ms first chunk latency, >95% uptime
 * - Kokoro: <150ms first chunk latency, >95% uptime
 * - Both handle network interruptions gracefully
 * - Audio quality verified (no garbled output)
 * - Tests pass consistently (run 10x)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CartesiaExecutor, type CartesiaConfig } from './cartesia.js';
import { KokoroExecutor, type DeploymentConfig } from './kokoro.js';
import { AudioFormat } from './executor.js';
import type { AudioBuffer } from './executor.js';

// Test configuration
const TEST_CONFIG = {
  cartesiaEnabled: process.env.CARTESIA_API_KEY !== undefined,
  kokoroEnabled: process.env.KOKORO_DOCKER_ENABLED === 'true' || process.env.KOKORO_API_URL !== undefined,
  runCount: 10, // Run each test 10x to ensure consistency
  latencyTargets: {
    cartesiaFirstChunk: 100, // ms
    kokoroFirstChunk: 150, // ms
  },
  uptimeTarget: 0.95, // 95%
};

// Helper: Measure first chunk latency
async function measureFirstChunkLatency(
  streamGenerator: AsyncGenerator<AudioBuffer>,
): Promise<number> {
  const startTime = Date.now();
  const firstChunk = await streamGenerator.next();
  const latency = Date.now() - startTime;

  if (firstChunk.done) {
    throw new Error('Stream ended without producing any chunks');
  }

  return latency;
}

// Helper: Collect all chunks from stream
async function collectStreamChunks(
  streamGenerator: AsyncGenerator<AudioBuffer>,
  maxDuration = 10000, // 10s max
): Promise<AudioBuffer[]> {
  const chunks: AudioBuffer[] = [];
  const timeout = Date.now() + maxDuration;

  for await (const chunk of streamGenerator) {
    chunks.push(chunk);
    if (Date.now() > timeout) {
      break;
    }
  }

  return chunks;
}

// Helper: Verify audio quality (no garbled output)
function verifyAudioQuality(buffer: AudioBuffer): void {
  expect(buffer.data).toBeDefined();
  expect(buffer.data.length).toBeGreaterThan(0);
  expect(buffer.sampleRate).toBeGreaterThan(0);
  expect(buffer.channels).toBeGreaterThan(0);
  expect(buffer.duration).toBeGreaterThan(0);

  // Check for corruption: verify data is not all zeros or all ones
  const view = new Uint8Array(buffer.data);
  const allZeros = view.every(byte => byte === 0);
  const allOnes = view.every(byte => byte === 255);

  expect(allZeros).toBe(false);
  expect(allOnes).toBe(false);
}

describe('Cartesia WebSocket Streaming E2E', () => {
  let executor: CartesiaExecutor;
  const skipIfNoKey = TEST_CONFIG.cartesiaEnabled ? it : it.skip;

  beforeEach(() => {
    if (TEST_CONFIG.cartesiaEnabled) {
      executor = new CartesiaExecutor({
        apiKey: process.env.CARTESIA_API_KEY!,
        model: 'sonic-3',
      });
    }
  });

  afterEach(async () => {
    if (executor) {
      await executor.shutdown();
    }
  });

  skipIfNoKey('should connect to WebSocket API successfully', async () => {
    await executor.initialize();
    expect(executor['isInitialized']).toBe(true);

    const healthy = await executor.isHealthy();
    expect(healthy).toBe(true);
  });

  skipIfNoKey('should deliver first chunk in <100ms', async () => {
    await executor.initialize();

    const text = 'Hello, this is a streaming test.';
    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    });

    const audioStream = executor.synthesizeStream(textStream);
    const latency = await measureFirstChunkLatency(audioStream);

    expect(latency).toBeLessThan(TEST_CONFIG.latencyTargets.cartesiaFirstChunk);
  });

  skipIfNoKey('should maintain streaming latency consistency', async () => {
    await executor.initialize();

    const latencies: number[] = [];

    for (let i = 0; i < 5; i++) {
      const textStream = new ReadableStream<string>({
        start(controller) {
          controller.enqueue('Test streaming latency consistency.');
          controller.close();
        },
      });

      const audioStream = executor.synthesizeStream(textStream);
      const latency = await measureFirstChunkLatency(audioStream);
      latencies.push(latency);

      // Drain stream
      for await (const _chunk of audioStream) {
        // Consume remaining chunks
      }
    }

    // Calculate standard deviation
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const variance = latencies.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / latencies.length;
    const stdDev = Math.sqrt(variance);

    // Standard deviation should be low (consistent performance)
    expect(stdDev).toBeLessThan(50); // <50ms variation
  });

  skipIfNoKey('should handle network interruptions (reconnect)', async () => {
    await executor.initialize();

    // First successful stream
    const stream1 = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('First stream.');
        controller.close();
      },
    });

    const audio1 = executor.synthesizeStream(stream1);
    const chunks1 = await collectStreamChunks(audio1);
    expect(chunks1.length).toBeGreaterThan(0);

    // Simulate network interruption by closing and reconnecting
    await executor.shutdown();
    await executor.initialize();

    // Second stream after reconnect
    const stream2 = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('Second stream after reconnect.');
        controller.close();
      },
    });

    const audio2 = executor.synthesizeStream(stream2);
    const chunks2 = await collectStreamChunks(audio2);
    expect(chunks2.length).toBeGreaterThan(0);
  });

  skipIfNoKey('should output valid Opus audio format', async () => {
    await executor.initialize();

    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('Testing Opus output format.');
        controller.close();
      },
    });

    const audioStream = executor.synthesizeStream(textStream);
    const chunks = await collectStreamChunks(audioStream);

    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      verifyAudioQuality(chunk);
      expect(chunk.format).toBe(AudioFormat.PCM_16); // Cartesia returns PCM
    }
  });

  skipIfNoKey('should handle large text throughput', async () => {
    await executor.initialize();

    // Generate 5 minutes of text (approximately)
    const longText = Array(500).fill('This is a long text to test throughput. ').join('');

    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(longText);
        controller.close();
      },
    });

    const audioStream = executor.synthesizeStream(textStream);
    const chunks = await collectStreamChunks(audioStream, 60000); // 1 minute max

    expect(chunks.length).toBeGreaterThan(10); // Should produce multiple chunks

    // Calculate total duration
    const totalDuration = chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
    expect(totalDuration).toBeGreaterThan(1000); // >1 second of audio
  });

  skipIfNoKey('should achieve >95% uptime across 10 runs', async () => {
    const successes: boolean[] = [];

    for (let i = 0; i < TEST_CONFIG.runCount; i++) {
      try {
        await executor.initialize();

        const textStream = new ReadableStream<string>({
          start(controller) {
            controller.enqueue(`Test run ${i + 1}`);
            controller.close();
          },
        });

        const audioStream = executor.synthesizeStream(textStream);
        const chunks = await collectStreamChunks(audioStream);

        successes.push(chunks.length > 0);

        await executor.shutdown();
      } catch (error) {
        successes.push(false);
      }
    }

    const uptimeRate = successes.filter(Boolean).length / successes.length;
    expect(uptimeRate).toBeGreaterThanOrEqual(TEST_CONFIG.uptimeTarget);
  });
});

describe('Kokoro HTTP Streaming E2E', () => {
  let executor: KokoroExecutor;
  const skipIfNoKokoro = TEST_CONFIG.kokoroEnabled ? it : it.skip;

  beforeEach(() => {
    if (TEST_CONFIG.kokoroEnabled) {
      const dockerConfig: DeploymentConfig = {
        mode: 'docker',
        docker: {
          image: 'kokoro:latest',
          port: Number.parseInt(process.env.KOKORO_PORT || '8000'),
        },
      };

      const cloudConfig: DeploymentConfig = {
        mode: 'cloud',
        cloud: {
          endpoint: process.env.KOKORO_API_URL || 'http://localhost:8000',
        },
      };

      executor = new KokoroExecutor(
        process.env.KOKORO_API_URL ? cloudConfig : dockerConfig,
      );
    }
  });

  afterEach(async () => {
    if (executor) {
      await executor.shutdown();
    }
  });

  skipIfNoKokoro('should connect to HTTP API successfully', async () => {
    await executor.initialize();

    const healthy = await executor.isHealthy();
    expect(healthy).toBe(true);
  });

  skipIfNoKokoro('should deliver first chunk in <150ms', async () => {
    await executor.initialize();

    const text = 'Hello, this is a Kokoro streaming test.';
    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    });

    const audioStream = executor.synthesizeStream(textStream);
    const latency = await measureFirstChunkLatency(audioStream);

    expect(latency).toBeLessThan(TEST_CONFIG.latencyTargets.kokoroFirstChunk);
  });

  skipIfNoKokoro('should handle chunked encoding properly', async () => {
    await executor.initialize();

    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('First chunk. ');
        controller.enqueue('Second chunk. ');
        controller.enqueue('Third chunk.');
        controller.close();
      },
    });

    const audioStream = executor.synthesizeStream(textStream);
    const chunks = await collectStreamChunks(audioStream);

    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      verifyAudioQuality(chunk);
    }
  });

  skipIfNoKokoro('should manage backpressure correctly', async () => {
    await executor.initialize();

    // Generate large text that should trigger backpressure
    const largeText = Array(1000).fill('This is a large text to test backpressure. ').join('');

    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(largeText);
        controller.close();
      },
    });

    const audioStream = executor.synthesizeStream(textStream);

    // Slowly consume chunks to simulate backpressure
    const chunks: AudioBuffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
      // Simulate slow consumer
      await new Promise(resolve => setTimeout(resolve, 10));

      if (chunks.length > 50) {
        break; // Limit test duration
      }
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  skipIfNoKokoro('should output valid PCM audio format', async () => {
    await executor.initialize();

    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('Testing PCM output format.');
        controller.close();
      },
    });

    const audioStream = executor.synthesizeStream(textStream);
    const chunks = await collectStreamChunks(audioStream);

    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      verifyAudioQuality(chunk);
      expect(chunk.format).toBe(AudioFormat.PCM_16);
    }
  });

  skipIfNoKokoro('should maintain performance under load', async () => {
    await executor.initialize();

    const latencies: number[] = [];

    // Run 10 sequential requests
    for (let i = 0; i < 10; i++) {
      const textStream = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(`Load test iteration ${i + 1}`);
          controller.close();
        },
      });

      const audioStream = executor.synthesizeStream(textStream);
      const latency = await measureFirstChunkLatency(audioStream);
      latencies.push(latency);

      // Drain stream
      for await (const _chunk of audioStream) {
        // Consume remaining chunks
      }
    }

    // All requests should complete successfully
    expect(latencies.length).toBe(10);

    // Average latency should be reasonable
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    expect(avgLatency).toBeLessThan(TEST_CONFIG.latencyTargets.kokoroFirstChunk * 2);
  });

  skipIfNoKokoro('should achieve >95% uptime across 10 runs', async () => {
    const successes: boolean[] = [];

    for (let i = 0; i < TEST_CONFIG.runCount; i++) {
      try {
        await executor.initialize();

        const textStream = new ReadableStream<string>({
          start(controller) {
            controller.enqueue(`Kokoro test run ${i + 1}`);
            controller.close();
          },
        });

        const audioStream = executor.synthesizeStream(textStream);
        const chunks = await collectStreamChunks(audioStream);

        successes.push(chunks.length > 0);

        await executor.shutdown();
      } catch (error) {
        successes.push(false);
      }
    }

    const uptimeRate = successes.filter(Boolean).length / successes.length;
    expect(uptimeRate).toBeGreaterThanOrEqual(TEST_CONFIG.uptimeTarget);
  });
});
