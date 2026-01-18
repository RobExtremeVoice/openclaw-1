/**
 * ElevenLabs TTS Plugin Service Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ElevenLabsTTSService, ElevenLabsTTSPlugin } from "./service.js";
import type { ElevenLabsTTSConfig } from "../../providers/tts-elevenlabs.js";

// Import types for testing
import type { TTSSynthesisOptions } from "../interfaces.js";

// Mock fetch
global.fetch = vi.fn();

describe("ElevenLabsTTSService", () => {
  let service: ElevenLabsTTSService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ElevenLabsTTSService();
  });

  describe("initialization", () => {
    it("should initialize successfully with valid config", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key-12345",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      const result = await service.initialize(config);

      expect(result).toBe(true);
      expect(service.isReady()).toBe(true);
    });

    it("should fail initialization with missing API key", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "",
      };

      const result = await service.initialize(config);

      expect(result).toBe(false);
      expect(service.isReady()).toBe(false);
    });

    it("should continue initialization even if API verification fails", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await service.initialize(config);

      // Should still initialize successfully (provider was created)
      expect(result).toBe(true);
    });

    it("should throw error if provider initialization fails", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-key",
        stability: 1.5, // Invalid
      };

      const result = await service.initialize(config);

      expect(result).toBe(false);
    });
  });

  describe("getProvider", () => {
    it("should return null if not initialized", () => {
      const provider = service.getProvider();

      expect(provider).toBeNull();
    });

    it("should return provider if initialized", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      const provider = service.getProvider();

      expect(provider).not.toBeNull();
      expect(provider?.metadata.name).toBe("elevenlabs-tts");
    });
  });

  describe("isReady", () => {
    it("should return false if not initialized", () => {
      expect(service.isReady()).toBe(false);
    });

    it("should return true after successful initialization", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      expect(service.isReady()).toBe(true);
    });

    it("should return false if provider is unhealthy", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      // Manually mark as unhealthy (simulating health check failure)
      (service as any).isHealthy = false;

      expect(service.isReady()).toBe(false);
    });
  });

  describe("healthCheck", () => {
    it("should return false if not initialized", async () => {
      const result = await service.healthCheck();

      expect(result).toBe(false);
    });

    it("should perform health check successfully", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      const result = await service.healthCheck();

      expect(result).toBe(true);
    });

    it("should return false on health check failure", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      (global.fetch as any).mockRejectedValueOnce(new Error("API error"));

      const result = await service.healthCheck();

      expect(result).toBe(false);
      expect(service.isReady()).toBe(false);
    });

    it("should rate limit health checks", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      // First health check
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.healthCheck();
      const firstCallCount = (global.fetch as any).mock.calls.length;

      // Second health check (should be rate-limited and not make a call)
      await service.healthCheck();
      const secondCallCount = (global.fetch as any).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe("getStatus", () => {
    it("should return initial status", () => {
      // Reset health state
      (service as any).isHealthy = false;
      const status = service.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.healthy).toBe(false);
      expect(status.provider).toBeNull();
    });

    it("should return status after initialization", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      const status = service.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.provider).toBe("elevenlabs-tts");
      expect(status.metadata).toBeDefined();
      expect(status.metadata?.name).toBe("elevenlabs-tts");
    });
  });

  describe("shutdown", () => {
    it("should shutdown successfully", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await service.initialize(config);

      expect(service.isReady()).toBe(true);

      await service.shutdown();

      expect(service.isReady()).toBe(false);
      expect(service.getProvider()).toBeNull();
    });

    it("should handle shutdown when not initialized", async () => {
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });
});

describe("ElevenLabsTTSPlugin", () => {
  let plugin: ElevenLabsTTSPlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = new ElevenLabsTTSPlugin();
  });

  describe("initialization", () => {
    it("should initialize plugin successfully", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      const service = await plugin.init(config);

      expect(service).not.toBeNull();
      expect(service.isReady()).toBe(true);
    });

    it("should throw error if service initialization fails", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "",
      };

      await expect(plugin.init(config)).rejects.toThrow(
        "Failed to initialize ElevenLabs TTS service",
      );
    });
  });

  describe("getService", () => {
    it("should return null before initialization", () => {
      const service = plugin.getService();

      expect(service).toBeNull();
    });

    it("should return service after initialization", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      await plugin.init(config);

      const service = plugin.getService();

      expect(service).not.toBeNull();
      expect(service?.isReady()).toBe(true);
    });
  });

  describe("destroy", () => {
    it("should destroy plugin and cleanup resources", async () => {
      const config: ElevenLabsTTSConfig = {
        apiKey: "test-api-key",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription: { character_count: 50000 },
        }),
      });

      const service = await plugin.init(config);

      expect(service.isReady()).toBe(true);

      await plugin.destroy();

      expect(plugin.getService()).toBeNull();
    });

    it("should handle destroy when not initialized", async () => {
      await expect(plugin.destroy()).resolves.not.toThrow();
    });
  });
});
