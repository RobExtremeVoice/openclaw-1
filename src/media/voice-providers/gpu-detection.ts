/**
 * GPU Detection and Optimization Utilities
 *
 * Detects available GPU hardware (CUDA, Metal/MPS, ROCm, etc.) and provides
 * auto-optimization recommendations for Faster-Whisper deployment.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * GPU detection result with detailed hardware info
 */
export interface GPUDetectionResult {
  hasGPU: boolean;
  gpuType?: 'cuda' | 'mps' | 'rocm' | 'intel' | 'directx';
  deviceName?: string;
  memoryGb?: number;
  computeCapability?: string;
  driverVersion?: string;
  isNVIDIA?: boolean;
  isAMD?: boolean;
  isApple?: boolean;
  isIntel?: boolean;
  cudaVersion?: string;
  rocmVersion?: string;
  maxBatchSize?: number;
  recommendedComputeType?: 'int8' | 'float16' | 'float32';
}

/**
 * System optimization recommendations
 */
export interface OptimizationRecommendations {
  computeType: 'int8' | 'float16' | 'float32';
  cpuThreads: number;
  beamSize: number;
  gpuPreferred: boolean;
  estimatedLatencyMs: number;
  estimatedThroughputAudioPerSecond: number;
  warningsAndNotes: string[];
}

/**
 * Detect GPU capabilities on the current system
 */
export async function detectGPU(): Promise<GPUDetectionResult> {
  const result: GPUDetectionResult = {
    hasGPU: false,
  };

  // Try NVIDIA CUDA detection
  try {
    const cudaResult = await detectCUDA();
    if (cudaResult.hasGPU) {
      return { ...result, ...cudaResult };
    }
  } catch (error) {
    // Continue to next detection
  }

  // Try AMD ROCm detection
  try {
    const rocmResult = await detectROCm();
    if (rocmResult.hasGPU) {
      return { ...result, ...rocmResult };
    }
  } catch (error) {
    // Continue to next detection
  }

  // Try Apple Metal Performance Shaders (MPS)
  try {
    const mpsResult = await detectMPS();
    if (mpsResult.hasGPU) {
      return { ...result, ...mpsResult };
    }
  } catch (error) {
    // Continue to next detection
  }

  // Try Intel GPU detection
  try {
    const intelResult = await detectIntelGPU();
    if (intelResult.hasGPU) {
      return { ...result, ...intelResult };
    }
  } catch (error) {
    // Continue to next detection
  }

  return result;
}

/**
 * Detect NVIDIA CUDA support
 */
async function detectCUDA(): Promise<GPUDetectionResult> {
  const result: GPUDetectionResult = {
    hasGPU: false,
    isNVIDIA: false,
  };

  try {
    // Check if nvidia-smi is available
    const { stdout } = await execAsync('nvidia-smi --query-gpu=index,name,memory.total,driver_version,compute_cap --format=csv,noheader');

    if (stdout) {
      result.hasGPU = true;
      result.isNVIDIA = true;
      result.gpuType = 'cuda';

      // Parse nvidia-smi output
      const lines = stdout.trim().split('\n');
      if (lines.length > 0) {
        const parts = lines[0].split(',').map(p => p.trim());
        if (parts.length >= 5) {
          result.deviceName = parts[1];
          result.memoryGb = parseInt(parts[2]) / 1024; // Convert MB to GB
          result.driverVersion = parts[3];
          result.computeCapability = parts[4];
        }
      }

      // Get CUDA version
      try {
        const { stdout: cudaVersionOutput } = await execAsync('nvcc --version');
        const cudaMatch = cudaVersionOutput.match(/release ([\d.]+)/);
        if (cudaMatch) {
          result.cudaVersion = cudaMatch[1];
        }
      } catch {
        // nvcc might not be in PATH
      }
    }
  } catch (error) {
    // nvidia-smi not available
  }

  return result;
}

/**
 * Detect AMD ROCm support
 */
async function detectROCm(): Promise<GPUDetectionResult> {
  const result: GPUDetectionResult = {
    hasGPU: false,
    isAMD: false,
  };

  try {
    // Check if rocm-smi is available
    const { stdout } = await execAsync('rocm-smi --showid --showmeminfo --showversion');

    if (stdout) {
      result.hasGPU = true;
      result.isAMD = true;
      result.gpuType = 'rocm';

      // Parse output for GPU info
      const lines = stdout.trim().split('\n');
      const versionLine = lines.find(line => line.includes('ROCm'));
      if (versionLine) {
        const versionMatch = versionLine.match(/(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          result.rocmVersion = versionMatch[1];
        }
      }

      // Estimate memory from output
      const memLine = lines.find(line => line.includes('Used Memory'));
      if (memLine) {
        const memMatch = memLine.match(/(\d+)/);
        if (memMatch) {
          result.memoryGb = parseInt(memMatch[1]) / 1024;
        }
      }
    }
  } catch (error) {
    // rocm-smi not available
  }

  return result;
}

/**
 * Detect Apple Metal Performance Shaders (MPS)
 */
async function detectMPS(): Promise<GPUDetectionResult> {
  const result: GPUDetectionResult = {
    hasGPU: false,
    isApple: false,
  };

  try {
    if (os.platform() === 'darwin') {
      result.hasGPU = true;
      result.isApple = true;
      result.gpuType = 'mps';
      result.deviceName = 'Apple Silicon / Intel GPU';

      // Get system info from macOS
      try {
        const { stdout } = await execAsync('system_profiler SPDisplaysDataType');
        if (stdout.includes('VRAM')) {
          const vramMatch = stdout.match(/VRAM \(Dynamic\):\s+([\d.]+)\s*([MG]B)/);
          if (vramMatch) {
            const memory = parseInt(vramMatch[1]);
            result.memoryGb = vramMatch[2] === 'GB' ? memory : memory / 1024;
          }
        }
      } catch {
        // Fallback if system_profiler fails
        result.memoryGb = 4; // Default estimate
      }
    }
  } catch (error) {
    // Not on macOS
  }

  return result;
}

/**
 * Detect Intel GPU support
 */
async function detectIntelGPU(): Promise<GPUDetectionResult> {
  const result: GPUDetectionResult = {
    hasGPU: false,
    isIntel: false,
  };

  try {
    // Check for Intel GPU tools
    const { stdout } = await execAsync('clinfo 2>/dev/null || echo ""');

    if (stdout && stdout.includes('Intel')) {
      result.hasGPU = true;
      result.isIntel = true;
      result.gpuType = 'intel';
      result.deviceName = 'Intel GPU';
    }
  } catch (error) {
    // clinfo not available
  }

  return result;
}

/**
 * Get system CPU and memory info
 */
export function getSystemInfo(): {
  cpuCount: number;
  cpuModel: string;
  totalMemoryGb: number;
  availableMemoryGb: number;
  platform: string;
  nodeVersion: string;
} {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const availableMemory = os.freemem();

  return {
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'Unknown',
    totalMemoryGb: Math.round((totalMemory / 1024 / 1024 / 1024) * 100) / 100,
    availableMemoryGb: Math.round((availableMemory / 1024 / 1024 / 1024) * 100) / 100,
    platform: os.platform(),
    nodeVersion: process.version,
  };
}

/**
 * Generate optimization recommendations based on hardware
 */
export async function recommendOptimizations(
  gpuInfo?: GPUDetectionResult,
): Promise<OptimizationRecommendations> {
  const systemInfo = getSystemInfo();
  const gpu = gpuInfo || (await detectGPU());

  const recommendations: OptimizationRecommendations = {
    computeType: 'float16',
    cpuThreads: Math.max(1, Math.floor(systemInfo.cpuCount / 2)),
    beamSize: 5,
    gpuPreferred: false,
    estimatedLatencyMs: 2000,
    estimatedThroughputAudioPerSecond: 1,
    warningsAndNotes: [],
  };

  if (gpu.hasGPU) {
    recommendations.gpuPreferred = true;

    // NVIDIA CUDA optimization
    if (gpu.isNVIDIA) {
      const memory = gpu.memoryGb || 2;
      const computeCapability = gpu.computeCapability ? parseFloat(gpu.computeCapability) : 7.0;

      if (memory >= 16) {
        recommendations.computeType = 'float32';
        recommendations.beamSize = 10;
        recommendations.estimatedLatencyMs = 800;
        recommendations.estimatedThroughputAudioPerSecond = 5;
      } else if (memory >= 8) {
        recommendations.computeType = 'float16';
        recommendations.beamSize = 8;
        recommendations.estimatedLatencyMs = 1000;
        recommendations.estimatedThroughputAudioPerSecond = 4;
      } else if (memory >= 4) {
        recommendations.computeType = 'float16';
        recommendations.beamSize = 5;
        recommendations.estimatedLatencyMs = 1200;
        recommendations.estimatedThroughputAudioPerSecond = 3;
      } else {
        recommendations.computeType = 'int8';
        recommendations.beamSize = 3;
        recommendations.estimatedLatencyMs = 1500;
        recommendations.estimatedThroughputAudioPerSecond = 2;
        recommendations.warningsAndNotes.push('Low GPU VRAM: consider using int8 quantization');
      }

      // Tensor Cores optimization for newer cards
      if (computeCapability >= 7.0) {
        recommendations.warningsAndNotes.push('Tensor Cores detected: using TF32 precision');
      }
    }
    // Apple MPS optimization
    else if (gpu.isApple) {
      // Apple GPUs typically have unified memory
      recommendations.computeType = 'float16';
      recommendations.beamSize = 5;
      recommendations.estimatedLatencyMs = 1200;
      recommendations.estimatedThroughputAudioPerSecond = 2;
      recommendations.cpuThreads = Math.max(1, systemInfo.cpuCount - 2);
      recommendations.warningsAndNotes.push('Using Metal Performance Shaders (MPS)');
    }
    // AMD ROCm optimization
    else if (gpu.isAMD) {
      const memory = gpu.memoryGb || 2;

      if (memory >= 8) {
        recommendations.computeType = 'float16';
        recommendations.beamSize = 5;
        recommendations.estimatedLatencyMs = 1500;
        recommendations.estimatedThroughputAudioPerSecond = 2;
      } else {
        recommendations.computeType = 'int8';
        recommendations.beamSize = 3;
        recommendations.estimatedLatencyMs = 2000;
        recommendations.estimatedThroughputAudioPerSecond = 1;
      }
      recommendations.warningsAndNotes.push('Using AMD ROCm: performance varies by GPU architecture');
    }
  } else {
    // CPU-only optimization
    if (systemInfo.cpuCount >= 16) {
      recommendations.computeType = 'float16';
      recommendations.cpuThreads = 8;
      recommendations.beamSize = 5;
      recommendations.estimatedLatencyMs = 3000;
      recommendations.estimatedThroughputAudioPerSecond = 1;
      recommendations.warningsAndNotes.push('High-core CPU detected: float16 with multi-threading');
    } else if (systemInfo.cpuCount >= 8) {
      recommendations.computeType = 'float16';
      recommendations.cpuThreads = 4;
      recommendations.beamSize = 3;
      recommendations.estimatedLatencyMs = 4000;
      recommendations.estimatedThroughputAudioPerSecond = 0.5;
    } else if (systemInfo.cpuCount >= 4) {
      recommendations.computeType = 'int8';
      recommendations.cpuThreads = 2;
      recommendations.beamSize = 3;
      recommendations.estimatedLatencyMs = 5000;
      recommendations.estimatedThroughputAudioPerSecond = 0.3;
      recommendations.warningsAndNotes.push('Limited CPU cores: using int8 quantization');
    } else {
      recommendations.computeType = 'int8';
      recommendations.cpuThreads = 1;
      recommendations.beamSize = 1;
      recommendations.estimatedLatencyMs = 8000;
      recommendations.estimatedThroughputAudioPerSecond = 0.1;
      recommendations.warningsAndNotes.push('Single-core or dual-core CPU: expect slowdown');
    }

    recommendations.warningsAndNotes.push('No GPU detected: CPU-only mode');
  }

  // Memory constraints
  if (systemInfo.availableMemoryGb < 2) {
    recommendations.warningsAndNotes.push('Low available memory: may cause slowdowns');
  }

  return recommendations;
}

/**
 * Check if a specific compute type is supported
 */
export function isComputeTypeSupported(
  computeType: 'int8' | 'float16' | 'float32',
  gpu?: GPUDetectionResult,
): boolean {
  // int8 always supported
  if (computeType === 'int8') return true;

  // float16 supported on GPU or CPU systems (CPU performance is limited but supported)
  if (computeType === 'float16') {
    return true;
  }

  // float32 works everywhere but slower
  return true;
}

/**
 * Format GPU detection result as readable string
 */
export function formatGPUInfo(gpu: GPUDetectionResult): string {
  if (!gpu.hasGPU) {
    return 'No GPU detected - CPU-only mode';
  }

  const parts: string[] = [];

  if (gpu.isNVIDIA) {
    parts.push(`NVIDIA CUDA: ${gpu.deviceName}`);
    if (gpu.memoryGb) parts.push(`Memory: ${gpu.memoryGb.toFixed(2)}GB`);
    if (gpu.cudaVersion) parts.push(`CUDA: ${gpu.cudaVersion}`);
    if (gpu.driverVersion) parts.push(`Driver: ${gpu.driverVersion}`);
    if (gpu.computeCapability) parts.push(`Compute: ${gpu.computeCapability}`);
  } else if (gpu.isApple) {
    parts.push('Apple Metal Performance Shaders (MPS)');
    if (gpu.memoryGb) parts.push(`Shared Memory: ~${gpu.memoryGb.toFixed(0)}GB`);
  } else if (gpu.isAMD) {
    parts.push(`AMD ROCm: ${gpu.deviceName}`);
    if (gpu.memoryGb) parts.push(`Memory: ${gpu.memoryGb.toFixed(2)}GB`);
    if (gpu.rocmVersion) parts.push(`ROCm: ${gpu.rocmVersion}`);
  } else if (gpu.isIntel) {
    parts.push('Intel GPU');
  }

  return parts.join(' | ');
}
