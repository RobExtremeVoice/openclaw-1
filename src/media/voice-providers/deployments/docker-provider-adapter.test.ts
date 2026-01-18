/**
 * Docker Provider Adapter Tests
 *
 * Tests for multi-provider Docker deployment with port allocation,
 * volume management, and provider templating.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DockerProviderAdapter,
  PortAllocator,
  VolumeManager,
  PROVIDER_TEMPLATES,
  getGlobalDockerProviderAdapter,
  resetGlobalDockerProviderAdapter,
} from './docker-provider-adapter.js';
import { VoiceProviderError } from '../executor.js';

vi.mock('./docker-handler.js');

describe('PortAllocator', () => {
  let allocator: PortAllocator;

  beforeEach(() => {
    allocator = new PortAllocator();
  });

  it('should allocate sequential ports starting from minimum', () => {
    const port1 = allocator.allocatePort();
    const port2 = allocator.allocatePort();

    expect(port1).toBe(8000);
    expect(port2).toBe(8001);
    expect(port1).not.toBe(port2);
  });

  it('should allocate preferred port if available', () => {
    const preferredPort = 8500;
    const port = allocator.allocatePort(preferredPort);

    expect(port).toBe(preferredPort);
    expect(allocator.isAllocated(preferredPort)).toBe(true);
  });

  it('should not reuse allocated ports', () => {
    const port1 = allocator.allocatePort(8100);
    const port2 = allocator.allocatePort(8100);

    expect(port1).toBe(8100);
    expect(port2).toBe(8101);
  });

  it('should release allocated ports', () => {
    const port = allocator.allocatePort(8200);
    expect(allocator.isAllocated(port)).toBe(true);

    allocator.releasePort(port);
    expect(allocator.isAllocated(port)).toBe(false);
  });

  it('should return allocated ports list', () => {
    allocator.allocatePort();
    allocator.allocatePort();
    allocator.allocatePort(8500);

    const ports = allocator.getAllocatedPorts();
    expect(ports).toEqual([8000, 8001, 8500]);
    expect(ports).toEqual(expect.arrayContaining([8000, 8001, 8500]));
  });

  it('should throw when no ports available in range', () => {
    // Fill all ports in the range
    for (let port = 8000; port <= 9000; port++) {
      allocator.allocatePort(port);
    }

    expect(() => allocator.allocatePort()).toThrow(VoiceProviderError);
  });
});

describe('VolumeManager', () => {
  let manager: VolumeManager;

  beforeEach(() => {
    manager = new VolumeManager();
  });

  it('should create consistent volume names for a provider', () => {
    const vol1 = manager.getOrCreateModelVolume('provider-1');
    const vol2 = manager.getOrCreateModelVolume('provider-1');

    expect(vol1).toBe(vol2);
    expect(vol1).toMatch(/^voice-provider-provider-1-models$/);
  });

  it('should create unique volumes for different providers', () => {
    const vol1 = manager.getOrCreateModelVolume('provider-1');
    const vol2 = manager.getOrCreateModelVolume('provider-2');

    expect(vol1).not.toBe(vol2);
  });

  it('should generate mount paths from template', () => {
    const template = PROVIDER_TEMPLATES['faster-whisper'];
    const mounts = manager.getMountPaths('whisper-1', template);

    expect(mounts).toHaveProperty('voice-provider-whisper-1-models');
    expect(Object.values(mounts)).toContain(template.volumeMountPaths.models);
  });

  it('should remove provider volumes', () => {
    manager.getOrCreateModelVolume('provider-cleanup');
    manager.getOrCreateModelVolume('provider-keep');

    const removed = manager.removeProviderVolumes('provider-cleanup');
    expect(removed).toContain('voice-provider-provider-cleanup-models');
  });
});

describe('DockerProviderAdapter', () => {
  let adapter: DockerProviderAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new DockerProviderAdapter();
  });

  afterEach(async () => {
    await adapter.cleanup();
  });

  it('should list available providers', () => {
    const providers = adapter.listAvailableProviders();

    expect(providers).toContain('faster-whisper');
    expect(providers).toContain('chatterbox');
    expect(providers).toContain('whisper');
    expect(providers).toContain('deepgram');
    expect(providers).toContain('kokoro');
  });

  it('should get template for provider type', () => {
    const template = adapter.getTemplate('faster-whisper');

    expect(template.providerName).toBe('faster-whisper');
    expect(template.defaultImage).toBeTruthy();
    expect(template.defaultPort).toBeGreaterThan(0);
    expect(template.healthCheckPath).toMatch(/^\//);
  });

  it('should throw for unknown provider type', () => {
    expect(() => adapter.getTemplate('unknown-provider')).toThrow(VoiceProviderError);
  });

  it('should create provider instance with default config', async () => {
    const handler = await adapter.createProviderInstance(
      'test-whisper',
      'faster-whisper',
    );

    expect(handler).toBeDefined();
    expect(adapter.getHandler('test-whisper')).toBe(handler);
  });

  it('should create provider instance with custom config', async () => {
    const customConfig = {
      port: 9000,
      image: 'custom-whisper:v2',
      env: { CUSTOM_VAR: 'custom_value' },
    };

    const handler = await adapter.createProviderInstance(
      'custom-whisper',
      'faster-whisper',
      customConfig,
    );

    expect(handler).toBeDefined();
  });

  it('should throw for unsupported provider in createProviderInstance', async () => {
    await expect(
      adapter.createProviderInstance('test', 'unsupported-provider'),
    ).rejects.toThrow(VoiceProviderError);
  });

  it('should track multiple provider instances', async () => {
    const handler1 = await adapter.createProviderInstance('whisper-1', 'faster-whisper');
    const handler2 = await adapter.createProviderInstance('chatterbox-1', 'chatterbox');

    const instances = adapter.getActiveInstances();
    expect(instances).toContain('whisper-1');
    expect(instances).toContain('chatterbox-1');
    expect(instances.length).toBe(2);
  });

  it('should remove provider instance', async () => {
    await adapter.createProviderInstance('test-remove', 'faster-whisper');
    expect(adapter.getActiveInstances()).toContain('test-remove');

    adapter.removeProviderInstance('test-remove');
    expect(adapter.getActiveInstances()).not.toContain('test-remove');
  });

  it('should allocate unique ports for multiple instances', async () => {
    await adapter.createProviderInstance('whisper-1', 'faster-whisper');
    await adapter.createProviderInstance('whisper-2', 'faster-whisper');
    await adapter.createProviderInstance('chatterbox-1', 'chatterbox');

    // All instances should be retrievable
    expect(adapter.getHandler('whisper-1')).toBeDefined();
    expect(adapter.getHandler('whisper-2')).toBeDefined();
    expect(adapter.getHandler('chatterbox-1')).toBeDefined();
  });
});

describe('Global Docker Provider Adapter', () => {
  beforeEach(() => {
    resetGlobalDockerProviderAdapter();
  });

  afterEach(() => {
    resetGlobalDockerProviderAdapter();
  });

  it('should return same instance on multiple calls', () => {
    const adapter1 = getGlobalDockerProviderAdapter();
    const adapter2 = getGlobalDockerProviderAdapter();

    expect(adapter1).toBe(adapter2);
  });

  it('should reset to new instance after reset', () => {
    const adapter1 = getGlobalDockerProviderAdapter();
    resetGlobalDockerProviderAdapter();
    const adapter2 = getGlobalDockerProviderAdapter();

    expect(adapter1).not.toBe(adapter2);
  });
});

describe('Provider Templates', () => {
  it('should have required fields for all templates', () => {
    Object.entries(PROVIDER_TEMPLATES).forEach(([name, template]) => {
      expect(template.providerName).toBe(name);
      expect(template.defaultImage).toBeTruthy();
      expect(template.defaultPort).toBeGreaterThan(0);
      expect(template.containerPortInternal).toBeGreaterThan(0);
      expect(template.healthCheckPath).toBeTruthy();
      expect(template.healthCheckInterval).toBeGreaterThan(0);
      expect(template.healthCheckTimeout).toBeGreaterThan(0);
      expect(typeof template.gpuSupport).toBe('boolean');
      expect(template.cpuLimit).toBeTruthy();
      expect(template.memoryLimit).toBeTruthy();
    });
  });

  it('should have valid health check paths', () => {
    Object.values(PROVIDER_TEMPLATES).forEach((template) => {
      expect(template.healthCheckPath).toMatch(/^\//);
    });
  });

  it('should have reasonable timeout values', () => {
    Object.values(PROVIDER_TEMPLATES).forEach((template) => {
      expect(template.healthCheckTimeout).toBeLessThan(template.healthCheckInterval);
      expect(template.healthCheckInterval).toBeGreaterThan(1000); // At least 1 second
    });
  });

  it('should have unique default ports', () => {
    const ports = Object.values(PROVIDER_TEMPLATES).map((t) => t.defaultPort);
    const uniquePorts = new Set(ports);
    expect(uniquePorts.size).toBe(ports.length);
  });
});
