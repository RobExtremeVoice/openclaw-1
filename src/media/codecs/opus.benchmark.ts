/**
 * Opus Codec Performance Benchmark
 *
 * Measures encoding/decoding latency to ensure <5ms per 20ms frame
 */

import { OpusCodec, createDiscordOpusCodec } from './opus.js';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughput: number; // operations per second
  passedTarget: boolean;
  targetMs: number;
}

/**
 * Run Opus codec performance benchmark
 */
async function runBenchmark(): Promise<BenchmarkResult[]> {
  const codec = createDiscordOpusCodec();
  await codec.initialize();

  const results: BenchmarkResult[] = [];
  const iterations = 1000;

  console.log('Starting Opus Codec Benchmark...\n');
  console.log(`Backend: ${codec.getBackend()}`);
  console.log(`Iterations: ${iterations}\n`);

  // Generate test PCM data (20ms of sine wave at 48kHz)
  const frameSize = 960; // 20ms at 48kHz
  const pcmBuffer = Buffer.alloc(frameSize * 2); // 16-bit = 2 bytes per sample

  for (let i = 0; i < frameSize; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / 48000) * 10000;
    pcmBuffer.writeInt16LE(Math.round(sample), i * 2);
  }

  // Benchmark encoding
  console.log('Benchmarking PCM → Opus encoding...');
  const encodeLatencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    codec.encode(pcmBuffer);
    const latency = performance.now() - start;
    encodeLatencies.push(latency);
  }

  const encodeResult = analyzeLatencies('Encode (PCM → Opus)', encodeLatencies, 5);
  results.push(encodeResult);
  printResult(encodeResult);

  // Benchmark decoding
  console.log('\nBenchmarking Opus → PCM decoding...');
  const encoded = codec.encode(pcmBuffer);
  const decodeLatencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    codec.decode(encoded);
    const latency = performance.now() - start;
    decodeLatencies.push(latency);
  }

  const decodeResult = analyzeLatencies('Decode (Opus → PCM)', decodeLatencies, 5);
  results.push(decodeResult);
  printResult(decodeResult);

  // Benchmark resampling (16kHz → 48kHz)
  console.log('\nBenchmarking 16kHz → 48kHz resampling...');
  const pcm16k = new Int16Array(320); // 20ms at 16kHz
  for (let i = 0; i < 320; i++) {
    pcm16k[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 10000;
  }

  const resampleLatencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    OpusCodec.resample(pcm16k, 16000, 48000);
    const latency = performance.now() - start;
    resampleLatencies.push(latency);
  }

  const resampleResult = analyzeLatencies('Resample (16kHz → 48kHz)', resampleLatencies, 5);
  results.push(resampleResult);
  printResult(resampleResult);

  // Benchmark full pipeline (resample + encode)
  console.log('\nBenchmarking full pipeline (resample + encode)...');
  const pipelineLatencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    codec.encodeWithResampling(pcm16k, 16000);
    const latency = performance.now() - start;
    pipelineLatencies.push(latency);
  }

  const pipelineResult = analyzeLatencies('Pipeline (resample + encode)', pipelineLatencies, 5);
  results.push(pipelineResult);
  printResult(pipelineResult);

  codec.destroy();

  return results;
}

/**
 * Analyze latency measurements
 */
function analyzeLatencies(
  operation: string,
  latencies: number[],
  targetMs: number,
): BenchmarkResult {
  latencies.sort((a, b) => a - b);

  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const avg = sum / latencies.length;
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const throughput = 1000 / avg; // ops/sec
  const passed = avg < targetMs;

  return {
    operation,
    iterations: latencies.length,
    avgLatencyMs: avg,
    minLatencyMs: min,
    maxLatencyMs: max,
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    throughput,
    passedTarget: passed,
    targetMs,
  };
}

/**
 * Print benchmark result
 */
function printResult(result: BenchmarkResult): void {
  console.log(`  Average:    ${result.avgLatencyMs.toFixed(3)}ms`);
  console.log(`  Min:        ${result.minLatencyMs.toFixed(3)}ms`);
  console.log(`  Max:        ${result.maxLatencyMs.toFixed(3)}ms`);
  console.log(`  P95:        ${result.p95LatencyMs.toFixed(3)}ms`);
  console.log(`  P99:        ${result.p99LatencyMs.toFixed(3)}ms`);
  console.log(`  Throughput: ${result.throughput.toFixed(0)} ops/sec`);
  console.log(
    `  Status:     ${result.passedTarget ? '✅ PASS' : '❌ FAIL'} (target: <${result.targetMs}ms)`,
  );
}

/**
 * Print summary
 */
function printSummary(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(60));

  const allPassed = results.every((r) => r.passedTarget);

  results.forEach((result) => {
    const status = result.passedTarget ? '✅' : '❌';
    console.log(
      `${status} ${result.operation.padEnd(30)} ${result.avgLatencyMs.toFixed(3)}ms (target: <${result.targetMs}ms)`,
    );
  });

  console.log('='.repeat(60));
  console.log(`Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('='.repeat(60) + '\n');
}

// Run benchmark if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark()
    .then((results) => {
      printSummary(results);
      const allPassed = results.every((r) => r.passedTarget);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((error) => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}

export { runBenchmark, BenchmarkResult };
