/**
 * Voice Providers Configuration Migration
 *
 * Handles migration of legacy voice configuration to the new
 * voice providers system. Ensures backwards compatibility and
 * supports gradual migration of existing setups.
 */

import type { ClawdbotConfig } from "./config.js";
import type { VoiceProvidersConfig, VoiceProviderEntry } from "./zod-schema.voice-providers.js";
import { migrateLegacyVoiceConfig } from "./voice-providers.utils.js";

/**
 * Check if config has legacy voice configuration
 */
export function hasLegacyVoiceConfig(cfg: ClawdbotConfig): boolean {
  return !!(
    cfg.gateway?.talk?.voiceId ||
    cfg.gateway?.talk?.voiceAliases ||
    cfg.gateway?.talk?.modelId ||
    cfg.gateway?.talk?.apiKey
  );
}

/**
 * Check if config has new voice providers configuration
 */
export function hasNewVoiceProvidersConfig(cfg: ClawdbotConfig): boolean {
  return !!(cfg.voice?.providers?.providers && cfg.voice.providers.providers.length > 0);
}

/**
 * Migrate legacy TTS configuration to new voice providers format
 */
export function migrateLegacyTTSConfig(cfg: ClawdbotConfig): VoiceProvidersConfig | undefined {
  const talkConfig = cfg.gateway?.talk;

  if (!talkConfig) {
    return undefined;
  }

  const providers: VoiceProviderEntry[] = [];

  // Create ElevenLabs provider from legacy config
  if (talkConfig.voiceId || talkConfig.modelId || talkConfig.apiKey) {
    providers.push({
      id: "elevenlabs-migrated",
      priority: 1,
      enabled: true,
      tts: {
        type: "elevenlabs",
        service: "elevenlabs",
        voiceId: talkConfig.voiceId,
        speed: 1,
        outputFormat: talkConfig.outputFormat,
        apiKey: talkConfig.apiKey,
        model: talkConfig.modelId,
      },
    } as VoiceProviderEntry);
  }

  if (providers.length === 0) {
    return undefined;
  }

  return {
    enabled: true,
    providers,
    autoDetectCapabilities: true,
  };
}

/**
 * Apply voice providers migration to config
 */
export function applyVoiceProvidersMigration(cfg: ClawdbotConfig): ClawdbotConfig {
  // If already has new config, don't override
  if (hasNewVoiceProvidersConfig(cfg)) {
    return cfg;
  }

  // If has legacy config, migrate it
  if (hasLegacyVoiceConfig(cfg)) {
    const migratedVoiceConfig = migrateLegacyTTSConfig(cfg);

    if (migratedVoiceConfig) {
      const newConfig: ClawdbotConfig = {
        ...cfg,
        voice: {
          ...cfg.voice,
          providers: migratedVoiceConfig as any,
        },
      };
      return newConfig;
    }
  }

  // No migration needed
  return cfg;
}

/**
 * Deprecation warning for legacy voice configuration
 */
export function shouldWarnAboutLegacyVoiceConfig(cfg: ClawdbotConfig): boolean {
  return hasLegacyVoiceConfig(cfg) && !hasNewVoiceProvidersConfig(cfg);
}

/**
 * Get deprecation warning message
 */
export function getLegacyVoiceConfigWarning(): string {
  return [
    "Your voice configuration is using the legacy format.",
    "The new voice providers system offers better flexibility and support for multiple providers.",
    "To migrate:",
    "  1. Run: clawdbot configure voice",
    "  2. Follow the setup wizard",
    "  3. Old configuration will be automatically migrated",
    "",
    "See docs: https://docs.clawd.bot/configuration/voice",
  ].join("\n");
}

/**
 * Validate voice providers configuration after migration
 */
export function validateVoiceProvidersConfig(config: VoiceProvidersConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config) {
    return { valid: true, errors: [] };
  }

  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  if (!config.providers || config.providers.length === 0) {
    return { valid: true, errors: [] };
  }

  // Check that at least one provider has STT or TTS
  const hasValidProvider = config.providers.some((p) => p.stt || p.tts);
  if (!hasValidProvider) {
    errors.push("Voice providers enabled but no valid STT/TTS providers configured");
  }

  // Check provider validity
  for (const provider of config.providers) {
    if (!provider.id) {
      errors.push("Provider must have an id");
    }

    if (provider.stt) {
      if (!provider.stt.type) {
        errors.push(`STT provider ${provider.id} missing type`);
      }
      if (provider.stt.type && !["whisper", "faster-whisper"].includes(provider.stt.type as string)) {
        // Cloud providers need service field
        if (!("service" in provider.stt) || !provider.stt.service) {
          errors.push(`Cloud STT provider ${provider.id} missing service`);
        }
      }
    }

    if (provider.tts) {
      if (!provider.tts.type) {
        errors.push(`TTS provider ${provider.id} missing type`);
      }
      if (provider.tts.type && provider.tts.type !== "local" && !provider.tts.service) {
        errors.push(`Cloud TTS provider ${provider.id} missing service`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get list of providers by priority order
 */
export function getProvidersInPriorityOrder(config: VoiceProvidersConfig): VoiceProviderEntry[] {
  if (!config?.providers) {
    return [];
  }

  return config.providers
    .filter((p) => p.enabled !== false)
    .sort((a, b) => (a.priority || 100) - (b.priority || 100));
}

/**
 * Get first available STT provider
 */
export function getFirstAvailableSTTProvider(
  config: VoiceProvidersConfig,
): VoiceProviderEntry | undefined {
  const providers = getProvidersInPriorityOrder(config);
  return providers.find((p) => p.stt);
}

/**
 * Get first available TTS provider
 */
export function getFirstAvailableTTSProvider(
  config: VoiceProvidersConfig,
): VoiceProviderEntry | undefined {
  const providers = getProvidersInPriorityOrder(config);
  return providers.find((p) => p.tts);
}

/**
 * Merge multiple voice provider configurations
 * Useful when combining configs from multiple sources
 */
export function mergeVoiceProviderConfigs(
  ...configs: (VoiceProvidersConfig | undefined)[]
): VoiceProvidersConfig {
  const merged: VoiceProvidersConfig = {
    enabled: true,
    providers: [],
    autoDetectCapabilities: true,
  };

  const seenIds = new Set<string>();

  for (const config of configs) {
    if (!config) continue;

    if (config.providers) {
      for (const provider of config.providers) {
        if (!seenIds.has(provider.id)) {
          merged.providers.push(provider);
          seenIds.add(provider.id);
        }
      }
    }

    if (config.systemCapabilities && !merged.systemCapabilities) {
      merged.systemCapabilities = config.systemCapabilities;
    }

    if (config.stt && !merged.stt) {
      merged.stt = config.stt;
    }

    if (config.tts && !merged.tts) {
      merged.tts = config.tts;
    }

    if (config.defaultSttProviderId && !merged.defaultSttProviderId) {
      merged.defaultSttProviderId = config.defaultSttProviderId;
    }

    if (config.defaultTtsProviderId && !merged.defaultTtsProviderId) {
      merged.defaultTtsProviderId = config.defaultTtsProviderId;
    }

    if (config.migrationMetadata && !merged.migrationMetadata) {
      merged.migrationMetadata = config.migrationMetadata;
    }
  }

  return merged;
}
