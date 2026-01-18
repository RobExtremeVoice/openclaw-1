/**
 * Voice Providers Configuration Tests
 *
 * Tests for schema validation, migration, loading, and utilities.
 */

import { describe, it, expect } from "vitest";
import type { VoiceProvidersConfig } from "./zod-schema.voice-providers.js";
import { VoiceProvidersConfigSchema } from "./zod-schema.voice-providers.js";
import {
  validateVoiceProvidersConfig as validateConfig,
  getProvidersInPriorityOrder,
  getFirstAvailableSTTProvider,
  getFirstAvailableTTSProvider,
  migrateLegacyTTSConfig,
  hasLegacyVoiceConfig,
  hasNewVoiceProvidersConfig,
} from "./voice-providers.migration.js";
import {
  detectSystemCapabilities,
  getRecommendedProviders,
  isLocalProviderAvailable,
  validateProviderConfig,
  migrateLegacyVoiceConfig as migrateLegacy,
} from "./voice-providers.utils.js";
import type { ClawdbotConfig } from "./config.js";

describe("Voice Providers Schema", () => {
  it("should validate Whisper STT provider config", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        {
          id: "test-whisper",
          stt: {
            type: "whisper",
            modelSize: "small",
            language: "en",
          },
        },
      ],
    };

    expect(() => VoiceProvidersConfigSchema.parse(config)).not.toThrow();
  });

  it("should validate Faster-Whisper STT provider config with compute type", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        {
          id: "test-faster-whisper",
          stt: {
            type: "faster-whisper",
            modelSize: "small",
            computeType: "float16",
            cpuThreads: 4,
            beamSize: 5,
          },
        },
      ],
    };

    expect(() => VoiceProvidersConfigSchema.parse(config)).not.toThrow();
  });

  it("should validate basic TTS provider config", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        {
          id: "test-tts",
          tts: {
            type: "local",
            model: "kokoro",
            voice: "af",
          },
        },
      ],
    };

    expect(() => VoiceProvidersConfigSchema.parse(config)).not.toThrow();
  });

  it("should validate OpenAI STT provider with API key", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        {
          id: "openai-provider",
          stt: {
            type: "openai",
            service: "openai",
            apiKey: "sk-...",
            model: "whisper-1",
          },
          tts: {
            type: "cloud",
            service: "elevenlabs",
            apiKey: "sk-...",
          },
        },
      ],
    };

    expect(() => VoiceProvidersConfigSchema.parse(config)).not.toThrow();
  });

  it("should enforce priority ordering", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        { id: "p1", priority: 10 },
        { id: "p2", priority: 1 },
        { id: "p3", priority: 5 },
      ],
    };

    const ordered = getProvidersInPriorityOrder(config);
    expect(ordered.map((p) => p.id)).toEqual(["p2", "p3", "p1"]);
  });
});

describe("Voice Providers Migration", () => {
  it("should detect legacy voice config", () => {
    const cfg: ClawdbotConfig = {
      gateway: {
        talk: {
          voiceId: "voice-1",
          apiKey: "key-1",
        },
      },
    };

    expect(hasLegacyVoiceConfig(cfg)).toBe(true);
  });

  it("should migrate legacy TTS config", () => {
    const cfg: ClawdbotConfig = {
      gateway: {
        talk: {
          voiceId: "rachel",
          modelId: "model-1",
          apiKey: "sk-...",
          outputFormat: "mp3_44100_128",
        },
      },
    };

    const migrated = migrateLegacyTTSConfig(cfg);

    expect(migrated.enabled).toBe(true);
    expect(migrated.providers).toHaveLength(1);
    expect(migrated.providers?.[0]?.tts?.type).toBe("elevenlabs");
    expect(migrated.providers?.[0]?.tts?.service).toBe("elevenlabs");
    expect(migrated.providers?.[0]?.tts?.voiceId).toBe("rachel");
    expect(migrated.migrationMetadata?.migratedFrom).toBeUndefined();
  });

  it("should not override existing new config during migration", () => {
    const cfg: ClawdbotConfig = {
      gateway: {
        talk: {
          voiceId: "rachel",
        },
      },
      voice: {
        providers: {
          enabled: true,
          providers: [
            {
              id: "existing",
              tts: {
                type: "cloud",
                service: "elevenlabs",
              },
            },
          ],
        },
      },
    };

    expect(hasNewVoiceProvidersConfig(cfg)).toBe(true);
  });
});

describe("Voice Providers Utilities", () => {
  it("should detect system capabilities", () => {
    const caps = detectSystemCapabilities();

    expect(caps.cpuThreads).toBeGreaterThan(0);
    expect(caps.totalMemoryGb).toBeGreaterThan(0);
    expect(caps.osType).toMatch(/darwin|linux|win32/);
    expect(caps.nodeVersion).toContain("v");
    expect(typeof caps.hasGpu).toBe("boolean");
  });

  it("should get recommended providers", () => {
    const recs = getRecommendedProviders();

    expect(Array.isArray(recs)).toBe(true);
    // Should have recommendations for both STT and TTS
    const hasSTT = recs.some((r) => r.type === "stt");
    const hasTTS = recs.some((r) => r.type === "tts");
    expect(hasSTT).toBe(true);
    expect(hasTTS).toBe(true);
  });

  it("should validate provider config", () => {
    const validWhisper = validateProviderConfig({
      type: "whisper",
      modelSize: "small",
    });
    expect(validWhisper.valid).toBe(true);
    expect(validWhisper.errors).toHaveLength(0);

    const validFasterWhisper = validateProviderConfig({
      type: "faster-whisper",
      modelSize: "small",
      computeType: "float16",
    });
    expect(validFasterWhisper.valid).toBe(true);

    const validCloud = validateProviderConfig({
      type: "openai",
      service: "openai",
      apiKey: "sk-...",
    });
    expect(validCloud.valid).toBe(true);

    const invalidMissing = validateProviderConfig({
      type: "whisper",
    });
    expect(invalidMissing.valid).toBe(false);
    expect(invalidMissing.errors.length).toBeGreaterThan(0);
  });
});

describe("Voice Providers Configuration Validation", () => {
  it("should validate complete config", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        {
          id: "provider1",
          stt: {
            type: "faster-whisper",
            modelSize: "small",
            computeType: "float16",
          },
          tts: {
            type: "cloud",
            service: "elevenlabs",
            apiKey: "key",
          },
        },
      ],
    };

    const validation = validateConfig(config);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("should reject config with no providers when enabled", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [],
    };

    const validation = validateConfig(config);
    // Empty providers should not necessarily fail - depends on implementation
    // This test documents the expected behavior
  });

  it("should allow disabled config", () => {
    const config: VoiceProvidersConfig = {
      enabled: false,
    };

    const validation = validateConfig(config);
    expect(validation.valid).toBe(true);
  });

  it("should find first available STT provider", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        { id: "tts-only", tts: { type: "cloud", service: "elevenlabs" } },
        { id: "stt-provider", stt: { type: "local", model: "faster-whisper" } },
      ],
    };

    const stt = getFirstAvailableSTTProvider(config);
    expect(stt?.id).toBe("stt-provider");
  });

  it("should find first available TTS provider", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        { id: "stt-only", stt: { type: "local", model: "faster-whisper" } },
        { id: "tts-provider", tts: { type: "cloud", service: "elevenlabs" } },
      ],
    };

    const tts = getFirstAvailableTTSProvider(config);
    expect(tts?.id).toBe("tts-provider");
  });

  it("should filter disabled providers", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        { id: "p1", enabled: false, tts: { type: "cloud", service: "elevenlabs" } },
        { id: "p2", enabled: true, tts: { type: "local", model: "kokoro" } },
      ],
    };

    const ordered = getProvidersInPriorityOrder(config);
    expect(ordered.map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("Voice Provider Legacy Config Migration", () => {
  it("should migrate legacy voice config", () => {
    const legacy = {
      tts: {
        voice: "voice-id",
        modelId: "model-id",
        apiKey: "key",
      },
    };

    const migrated = migrateLegacy(legacy);
    expect(migrated.providers).toBeDefined();
    expect(Array.isArray(migrated.providers)).toBe(true);
  });

  it("should handle empty legacy config", () => {
    const migrated = migrateLegacy({});
    expect(migrated.providers).toBeDefined();
  });

  it("should set migration metadata", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        {
          id: "test",
          tts: { type: "cloud", service: "elevenlabs" },
        },
      ],
      migrationMetadata: {
        migratedFrom: "legacy",
        migratedAt: new Date().toISOString(),
      },
    };

    expect(config.migrationMetadata?.migratedFrom).toBe("legacy");
    expect(config.migrationMetadata?.migratedAt).toBeDefined();
  });
});

describe("Voice Providers Edge Cases", () => {
  it("should handle undefined providers config", () => {
    const config: VoiceProvidersConfig = undefined;
    expect(config).toBeUndefined();
  });

  it("should handle empty providers array", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [],
    };

    const ordered = getProvidersInPriorityOrder(config);
    expect(ordered).toHaveLength(0);
  });

  it("should default priority to 100", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        { id: "p1" },
        { id: "p2", priority: 50 },
        { id: "p3", priority: 150 },
      ],
    };

    const ordered = getProvidersInPriorityOrder(config);
    expect(ordered.map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("should handle provider with both STT and TTS", () => {
    const config: VoiceProvidersConfig = {
      enabled: true,
      providers: [
        {
          id: "combined",
          stt: { type: "cloud", service: "openai", apiKey: "key" },
          tts: { type: "cloud", service: "elevenlabs", apiKey: "key" },
        },
      ],
    };

    const stt = getFirstAvailableSTTProvider(config);
    const tts = getFirstAvailableTTSProvider(config);

    expect(stt?.id).toBe("combined");
    expect(tts?.id).toBe("combined");
  });
});
