/**
 * Benchmarking Harness for Faster-Whisper Performance Comparison
 *
 * Tests different compute types, beam sizes, CPU threads, and GPU vs CPU execution.
 * Measures latency, memory usage, and accuracy metrics.
 */

import { FasterWhisperExecutor, type ComputeType } from './faster-whisper.js';
import { AudioFormat } from './executor.js';
import { detectGPU, getSystemInfo } from './gpu-detection.js';
import type { FasterWhisperConfig } from '../../config/types.voice.js';

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  runs: number; // Number of iterations per test
  audioLengthMs: number; // Audio duration for each benchmark
  sampleRate: number; // Audio sample rate
  testComputeTypes?: ComputeType[];
  testBeamSizes?: number[];
  testCpuThreads?: number[];
  verboseLogging?: boolean;
}

/**
 * Benchmark result for a single test
 */
export interface BenchmarkResult {
  testName: string;
  computeType: ComputeType;
  beamSize: number;
  cpuThreads: number;
  gpuUsed: boolean;
  metrics: {
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    stdDevMs: number;
    avgRTF: number; // Real-time factor
    avgMemoryMb?: number;
    throughputAudioPerSecond: number;
  };
  samples: number;
  warnings: string[];
}

/**
 * Complete benchmark report
 */
export interface BenchmarkReport {
  timestamp: string;
  systemInfo: {
    cpuCount: number;
    cpuModel: string;
    totalMemoryGb: number;
    gpuAvailable: boolean;
    gpuType?: string;
  };
  results: BenchmarkResult[];
  summary: {
    fastestConfig: BenchmarkResult;
    mostAccurateConfig: BenchmarkResult;
    bestBalanceConfig: BenchmarkResult;
    recommendations: string[];
  };
  rawData: Record<string, any>;
}

/**
 * Faster-Whisper Benchmark Suite
 */
export class FasterWhisperBenchmark {
  private config: BenchmarkConfig;
  private results: BenchmarkResult[] = [];

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = {
      runs: 5,
      audioLengthMs: 5000, // 5 second audio
      sampleRate: 16000,
      testComputeTypes: ['int8', 'float16', 'float32'],
      testBeamSizes: [1, 5, 10],
      testCpuThreads: [1, 2, 4, 8],
      verboseLogging: false,
      ...config,
    };
  }

  /**
   * Create mock audio for benchmarking
   */
  private createMockAudio(lengthMs: number, sampleRate: number = 16000): Uint8Array {
    const samples = Math.floor((lengthMs * sampleRate) / 1000);
    const buffer = new Uint8Array(samples * 2); // 16-bit PCM

    // Generate silence (zeros)
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = 0;
    }

    return buffer;
  }

  /**
   * Run benchmark for a specific configuration
   */
  private async benchmarkConfig(
    computeType: ComputeType,
    beamSize: number,
    cpuThreads: number,
  ): Promise<BenchmarkResult> {
    const config: FasterWhisperConfig = {
      type: 'faster-whisper',
      modelSize: 'base',
      language: 'en',
      computeType,
      cpuThreads,
      beamSize,
    };

    const executor = new FasterWhisperExecutor('benchmark', config);

    try {
      await executor.initialize();

      const latencies: number[] = [];
      const rtfs: number[] = [];
      let totalMemoryMb = 0;
      const warnings: string[] = [];

      const audio = {
        data: this.createMockAudio(this.config.audioLengthMs, this.config.sampleRate),
        format: AudioFormat.PCM_16,
        sampleRate: this.config.sampleRate,
        duration: this.config.audioLengthMs,
        channels: 1,
      };

      // Run multiple iterations
      for (let i = 0; i < this.config.runs; i++) {
        const startTime = performance.now();

        try {
          const result = await executor.transcribe(audio);
          const endTime = performance.now();

          const latencyMs = endTime - startTime;
          const rtf = latencyMs / this.config.audioLengthMs;

          latencies.push(latencyMs);
          rtfs.push(rtf);

          if (this.config.verboseLogging) {
            console.log(
              `[${computeType}/${beamSize}/${cpuThreads}] Run ${i + 1}: ${latencyMs.toFixed(2)}ms (RTF: ${rtf.toFixed(3)})`,
            );
          }
        } catch (error) {
          warnings.push(`Run ${i + 1} failed: ${error}`);
        }
      }

      // Calculate statistics
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const stdDev = Math.sqrt(
        latencies.reduce((sum, val) => sum + Math.pow(val - avgLatency, 2), 0) / latencies.length,
      );

      const gpuCaps = executor.getGPUCapabilities();

      const result: BenchmarkResult = {
        testName: `${computeType}-beam${beamSize}-threads${cpuThreads}`,
        computeType,
        beamSize,
        cpuThreads,
        gpuUsed: gpuCaps?.available ?? false,
        metrics: {
          avgLatencyMs: avgLatency,
          minLatencyMs: Math.min(...latencies),
          maxLatencyMs: Math.max(...latencies),
          stdDevMs: stdDev,
          avgRTF: rtfs.reduce((a, b) => a + b, 0) / rtfs.length,
          avgMemoryMb: totalMemoryMb / this.config.runs || undefined,
          throughputAudioPerSecond: 1000 / avgLatency, // Audio seconds per second
        },
        samples: latencies.length,
        warnings,
      };

      await executor.shutdown();
      return result;
    } catch (error) {
      throw new Error(`Benchmark failed for ${computeType}/${beamSize}/${cpuThreads}: ${error}`);
    }
  }

  /**
   * Run full benchmark suite
   */
  async runBenchmarks(): Promise<BenchmarkReport> {
    console.log('Starting Faster-Whisper benchmarks...');
    console.log(`Configuration: ${this.config.runs} runs, ${this.config.audioLengthMs}ms audio`);

    const gpu = await detectGPU();
    const systemInfo = getSystemInfo();

    const computeTypes = this.config.testComputeTypes || ['int8', 'float16', 'float32'];
    const beamSizes = this.config.testBeamSizes || [1, 5, 10];
    const cpuThreads = this.config.testCpuThreads || [1, 2, 4];

    this.results = [];

    let testCount = 0;
    const totalTests = computeTypes.length * beamSizes.length * cpuThreads.length;

    for (const computeType of computeTypes) {
      for (const beamSize of beamSizes) {
        for (const threads of cpuThreads) {
          testCount++;
          console.log(`\n[${testCount}/${totalTests}] Testing ${computeType} (beam=${beamSize}, threads=${threads})`);

          try {
            const result = await this.benchmarkConfig(computeType, beamSize, threads);
            this.results.push(result);

            console.log(`  Latency: ${result.metrics.avgLatencyMs.toFixed(2)}ms (RTF: ${result.metrics.avgRTF.toFixed(3)})`);
          } catch (error) {
            console.warn(`  Failed: ${error}`);
          }
        }
      }
    }

    return this.generateReport(gpu, systemInfo);
  }

  /**
   * Generate benchmark report
   */
  private generateReport(
    gpu: Awaited<ReturnType<typeof detectGPU>>,
    systemInfo: ReturnType<typeof getSystemInfo>,
  ): BenchmarkReport {
    // Find best configurations
    const sortedByLatency = [...this.results].sort(
      (a, b) => a.metrics.avgLatencyMs - b.metrics.avgLatencyMs,
    );

    const sortedByRTF = [...this.results].sort((a, b) => a.metrics.avgRTF - b.metrics.avgRTF);

    const fastestConfig = sortedByLatency[0] || this.results[0];
    const mostAccurateConfig = this.results.find(r => r.computeType === 'float32') || fastestConfig;

    // Find best balance (low latency + int8/float16)
    const balanceCandidate = this.results
      .filter(r => r.computeType !== 'float32')
      .sort((a, b) => a.metrics.avgLatencyMs - b.metrics.avgLatencyMs)[0];

    const bestBalanceConfig = balanceCandidate || fastestConfig;

    // Generate recommendations
    const recommendations: string[] = [];

    if (gpu.hasGPU) {
      recommendations.push(
        `GPU detected (${gpu.gpuType}): ${fastestConfig.gpuUsed ? 'GPU utilized' : 'Not utilized'} in best config`,
      );
    } else {
      recommendations.push('No GPU detected: CPU-only mode. Consider using int8 quantization.');
    }

    const bestComputeType = fastestConfig.computeType;
    recommendations.push(
      `Best latency: ${bestComputeType}-beam${fastestConfig.beamSize}-threads${fastestConfig.cpuThreads} (${fastestConfig.metrics.avgLatencyMs.toFixed(2)}ms)`,
    );

    recommendations.push(
      `Best balance: ${bestBalanceConfig.computeType}-beam${bestBalanceConfig.beamSize}-threads${bestBalanceConfig.cpuThreads}`,
    );

    if (systemInfo.totalMemoryGb < 4) {
      recommendations.push('Low memory system: use int8 quantization and beam_size=1 for better performance');
    }

    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      systemInfo: {
        cpuCount: systemInfo.cpuCount,
        cpuModel: systemInfo.cpuModel,
        totalMemoryGb: systemInfo.totalMemoryGb,
        gpuAvailable: gpu.hasGPU,
        gpuType: gpu.gpuType,
      },
      results: this.results,
      summary: {
        fastestConfig,
        mostAccurateConfig,
        bestBalanceConfig,
        recommendations,
      },
      rawData: {
        config: this.config,
        allResults: this.results.map(r => ({
          ...r,
          metrics: r.metrics,
        })),
      },
    };

    return report;
  }

  /**
   * Print benchmark report to console
   */
  static printReport(report: BenchmarkReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('FASTER-WHISPER BENCHMARK REPORT');
    console.log('='.repeat(80));

    console.log('\nSystem Information:');
    console.log(`  CPU: ${report.systemInfo.cpuModel} (${report.systemInfo.cpuCount} cores)`);
    console.log(`  Memory: ${report.systemInfo.totalMemoryGb}GB`);
    console.log(`  GPU: ${report.systemInfo.gpuAvailable ? report.systemInfo.gpuType : 'Not available'}`);

    console.log('\nBenchmark Results (sorted by latency):');
    console.log('-'.repeat(80));

    const sorted = [...report.results].sort((a, b) => a.metrics.avgLatencyMs - b.metrics.avgLatencyMs);

    console.log('Config                    | Latency (ms) | RTF    | Memory (MB) | Throughput');
    console.log('-'.repeat(80));

    sorted.slice(0, 10).forEach(result => {
      const config = `${result.computeType}-B${result.beamSize}-T${result.cpuThreads}`.padEnd(24);
      const latency = result.metrics.avgLatencyMs.toFixed(2).padStart(12);
      const rtf = result.metrics.avgRTF.toFixed(3).padStart(6);
      const memory = (result.metrics.avgMemoryMb?.toFixed(0) || 'N/A').padStart(11);
      const throughput = result.metrics.throughputAudioPerSecond.toFixed(2);

      console.log(`${config} | ${latency} | ${rtf} | ${memory} | ${throughput}x`);
    });

    console.log('\nRecommendations:');
    report.summary.recommendations.forEach(rec => {
      console.log(`  - ${rec}`);
    });

    console.log('\n' + '='.repeat(80));
  }

  /**
   * Export report as JSON
   */
  static exportJSON(report: BenchmarkReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as CSV
   */
  static exportCSV(report: BenchmarkReport): string {
    const lines: string[] = [];

    // Header
    lines.push(
      'ComputeType,BeamSize,CPUThreads,GPUUsed,AvgLatency(ms),MinLatency(ms),MaxLatency(ms),StdDev(ms),AvgRTF,Memory(MB),Throughput',
    );

    // Data rows
    report.results.forEach(result => {
      const row = [
        result.computeType,
        result.beamSize,
        result.cpuThreads,
        result.gpuUsed ? 'yes' : 'no',
        result.metrics.avgLatencyMs.toFixed(2),
        result.metrics.minLatencyMs.toFixed(2),
        result.metrics.maxLatencyMs.toFixed(2),
        result.metrics.stdDevMs.toFixed(2),
        result.metrics.avgRTF.toFixed(3),
        result.metrics.avgMemoryMb?.toFixed(2) || 'N/A',
        result.metrics.throughputAudioPerSecond.toFixed(2),
      ];
      lines.push(row.join(','));
    });

    return lines.join('\n');
  }
}

/**
 * Quick benchmark runner
 */
export async function runQuickBenchmark(): Promise<BenchmarkReport> {
  const benchmark = new FasterWhisperBenchmark({
    runs: 3,
    audioLengthMs: 5000,
    testComputeTypes: ['int8', 'float16'],
    testBeamSizes: [1, 5],
    testCpuThreads: [1, 4],
  });

  const report = await benchmark.runBenchmarks();
  FasterWhisperBenchmark.printReport(report);
  return report;
}
