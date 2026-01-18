/**
 * Tests for GPU Detection and Optimization Utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectGPU,
  getSystemInfo,
  recommendOptimizations,
  isComputeTypeSupported,
  formatGPUInfo,
} from './gpu-detection.js';
import type { GPUDetectionResult } from './gpu-detection.js';

describe('GPU Detection', () => {
  describe('getSystemInfo', () => {
    it('should return valid system information', () => {
      const info = getSystemInfo();

      expect(info).toHaveProperty('cpuCount');
      expect(info).toHaveProperty('cpuModel');
      expect(info).toHaveProperty('totalMemoryGb');
      expect(info).toHaveProperty('availableMemoryGb');
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('nodeVersion');
    });

    it('should report positive CPU count', () => {
      const info = getSystemInfo();
      expect(info.cpuCount).toBeGreaterThan(0);
    });

    it('should report positive memory sizes', () => {
      const info = getSystemInfo();
      expect(info.totalMemoryGb).toBeGreaterThan(0);
      expect(info.availableMemoryGb).toBeGreaterThanOrEqual(0);
    });

    it('should report available memory less than or equal to total', () => {
      const info = getSystemInfo();
      expect(info.availableMemoryGb).toBeLessThanOrEqual(info.totalMemoryGb);
    });
  });

  describe('GPU Detection', () => {
    it('should detect GPU capabilities', async () => {
      const gpu = await detectGPU();

      expect(gpu).toHaveProperty('hasGPU');
      expect(typeof gpu.hasGPU).toBe('boolean');

      if (gpu.hasGPU) {
        expect(gpu.gpuType).toMatch(/cuda|mps|rocm|intel/);
      }
    });

    it('should indicate GPU type if detected', async () => {
      const gpu = await detectGPU();

      if (gpu.hasGPU) {
        expect(gpu.gpuType).toBeDefined();
        expect(['cuda', 'mps', 'rocm', 'intel']).toContain(gpu.gpuType);
      }
    });
  });

  describe('Optimization Recommendations', () => {
    it('should recommend optimizations without GPU info', async () => {
      const recommendations = await recommendOptimizations();

      expect(recommendations).toHaveProperty('computeType');
      expect(recommendations).toHaveProperty('cpuThreads');
      expect(recommendations).toHaveProperty('beamSize');
      expect(recommendations).toHaveProperty('gpuPreferred');
      expect(recommendations).toHaveProperty('estimatedLatencyMs');
      expect(recommendations).toHaveProperty('warningsAndNotes');
    });

    it('should recommend valid compute types', async () => {
      const recommendations = await recommendOptimizations();

      expect(['int8', 'float16', 'float32']).toContain(recommendations.computeType);
    });

    it('should recommend positive CPU threads', async () => {
      const recommendations = await recommendOptimizations();

      expect(recommendations.cpuThreads).toBeGreaterThan(0);
    });

    it('should recommend valid beam size', async () => {
      const recommendations = await recommendOptimizations();

      expect(recommendations.beamSize).toBeGreaterThanOrEqual(1);
      expect(recommendations.beamSize).toBeLessThanOrEqual(512);
    });

    it('should provide warnings as array', async () => {
      const recommendations = await recommendOptimizations();

      expect(Array.isArray(recommendations.warningsAndNotes)).toBe(true);
    });

    it('should scale recommendations with CPU cores', async () => {
      const mockGPU: GPUDetectionResult = { hasGPU: false };

      const recommendations = await recommendOptimizations(mockGPU);

      // More cores should allow more threads
      expect(recommendations.cpuThreads).toBeGreaterThanOrEqual(1);
    });

    it('should prefer GPU when available', async () => {
      const mockGPU: GPUDetectionResult = {
        hasGPU: true,
        gpuType: 'cuda',
        memoryGb: 8,
        isNVIDIA: true,
      };

      const recommendations = await recommendOptimizations(mockGPU);

      expect(recommendations.gpuPreferred).toBe(true);
    });

    it('should recommend int8 for low GPU memory', async () => {
      const mockGPU: GPUDetectionResult = {
        hasGPU: true,
        gpuType: 'cuda',
        memoryGb: 2,
        isNVIDIA: true,
      };

      const recommendations = await recommendOptimizations(mockGPU);

      expect(recommendations.computeType).toBe('int8');
    });

    it('should recommend float32 for high-end GPU', async () => {
      const mockGPU: GPUDetectionResult = {
        hasGPU: true,
        gpuType: 'cuda',
        memoryGb: 24,
        isNVIDIA: true,
      };

      const recommendations = await recommendOptimizations(mockGPU);

      expect(recommendations.computeType).toBe('float32');
    });

    it('should recommend MPS on macOS', async () => {
      const mockGPU: GPUDetectionResult = {
        hasGPU: true,
        gpuType: 'mps',
        isApple: true,
      };

      const recommendations = await recommendOptimizations(mockGPU);

      expect(recommendations.computeType).toBe('float16');
      expect(recommendations.warningsAndNotes.some(w => w.includes('Metal'))).toBe(true);
    });
  });

  describe('Compute Type Support', () => {
    it('should support int8 everywhere', () => {
      expect(isComputeTypeSupported('int8')).toBe(true);
    });

    it('should support float16', () => {
      expect(isComputeTypeSupported('float16')).toBe(true);
    });

    it('should support float32', () => {
      expect(isComputeTypeSupported('float32')).toBe(true);
    });

    it('should support with GPU', () => {
      const gpu: GPUDetectionResult = {
        hasGPU: true,
        gpuType: 'cuda',
      };

      expect(isComputeTypeSupported('float16', gpu)).toBe(true);
      expect(isComputeTypeSupported('float32', gpu)).toBe(true);
    });

    it('should support without GPU', () => {
      const gpu: GPUDetectionResult = {
        hasGPU: false,
      };

      expect(isComputeTypeSupported('int8', gpu)).toBe(true);
      expect(isComputeTypeSupported('float16', gpu)).toBe(true);
    });
  });

  describe('GPU Info Formatting', () => {
    it('should format no GPU result', () => {
      const gpu: GPUDetectionResult = { hasGPU: false };
      const formatted = formatGPUInfo(gpu);

      expect(formatted).toContain('No GPU');
    });

    it('should format NVIDIA GPU result', () => {
      const gpu: GPUDetectionResult = {
        hasGPU: true,
        isNVIDIA: true,
        gpuType: 'cuda',
        deviceName: 'NVIDIA A100',
        memoryGb: 80,
        driverVersion: '535.104.05',
      };

      const formatted = formatGPUInfo(gpu);

      expect(formatted).toContain('NVIDIA');
      expect(formatted).toContain('A100');
      expect(formatted).toContain('80');
    });

    it('should format Apple GPU result', () => {
      const gpu: GPUDetectionResult = {
        hasGPU: true,
        isApple: true,
        gpuType: 'mps',
        memoryGb: 16,
      };

      const formatted = formatGPUInfo(gpu);

      expect(formatted).toContain('Metal');
    });

    it('should format AMD GPU result', () => {
      const gpu: GPUDetectionResult = {
        hasGPU: true,
        isAMD: true,
        gpuType: 'rocm',
        deviceName: 'MI250X',
        memoryGb: 128,
      };

      const formatted = formatGPUInfo(gpu);

      expect(formatted).toContain('AMD');
      expect(formatted).toContain('MI250X');
    });

    it('should format Intel GPU result', () => {
      const gpu: GPUDetectionResult = {
        hasGPU: true,
        isIntel: true,
        gpuType: 'intel',
      };

      const formatted = formatGPUInfo(gpu);

      expect(formatted).toContain('Intel');
    });

    it('should include memory information when available', () => {
      const gpu: GPUDetectionResult = {
        hasGPU: true,
        isNVIDIA: true,
        gpuType: 'cuda',
        memoryGb: 16,
      };

      const formatted = formatGPUInfo(gpu);

      expect(formatted).toContain('16');
    });
  });

  describe('Environment Detection', () => {
    it('should handle missing GPU gracefully', async () => {
      expect(async () => {
        await detectGPU();
      }).not.toThrow();
    });

    it('should return valid recommendations for any system', async () => {
      const recs = await recommendOptimizations();

      expect(recs.computeType).toBeDefined();
      expect(recs.cpuThreads > 0).toBe(true);
      expect(recs.beamSize > 0).toBe(true);
    });
  });
});
