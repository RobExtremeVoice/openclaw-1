/**
 * Voice Providers Configuration Loader
 *
 * Loads, validates, and initializes voice provider configuration.
 * Handles provider setup, fallback chains, and dependency resolution.
 */

import type { ClawdbotConfig } from "./config.js";
import type { VoiceProvidersConfig, VoiceProviderEntry } from "./zod-schema.voice-providers.js";
import { VoiceProvidersConfigSchema } from "./zod-schema.voice-providers.js";
import {
  validateVoiceProvidersConfig,
  getProvidersInPriorityOrder,
} from "./voice-providers.migration.js";
import { detectSystemCapabilities } from "./voice-providers.utils.js";
import type { ProviderInitResult } from "./voice-providers.types.js";

/**
 * Load and validate voice providers configuration
 */
export function loadVoiceProvidersConfig(
  cfg: ClawdbotConfig,
): { config: VoiceProvidersConfig; valid: boolean; errors: string[] } {
  const voiceConfig = cfg.voice?.providers;

  if (!voiceConfig) {
    return {
      config: {
        enabled: false,
        providers: [],
        autoDetectCapabilities: true,
      },
      valid: true,
      errors: [],
    };
  }

  // Validate against schema
  try {
    const parsed = VoiceProvidersConfigSchema.parse(voiceConfig);
    const validated = (parsed ?? {
      enabled: false,
      providers: [],
      autoDetectCapabilities: true,
    }) as VoiceProvidersConfig;
    const validation = validateVoiceProvidersConfig(validated);

    return {
      config: validated,
      valid: validation.valid,
      errors: validation.errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      config: {
        enabled: false,
        providers: [],
        autoDetectCapabilities: true,
      },
      valid: false,
      errors: [msg],
    };
  }
}

/**
 * Initialize voice providers with dependency checks
 */
export async function initializeVoiceProviders(
  config: VoiceProvidersConfig,
  options?: {
    validateOnly?: boolean;
    logger?: {
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string) => void;
    };
  },
): Promise<ProviderInitResult[]> {
  const results: ProviderInitResult[] = [];
  const providers = getProvidersInPriorityOrder(config);
  const logger = options?.logger || {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  logger.info(`Initializing ${providers.length} voice providers...`);

  for (const provider of providers) {
    const result: ProviderInitResult = {
      success: true,
      providerId: provider.id,
      warnings: [],
      details: {},
    };

    try {
      // Check STT provider if configured
      if (provider.stt) {
        if (provider.stt.type === "whisper" || provider.stt.type === "faster-whisper") {
          const { checkPackageInstalled } = await import("./voice-providers.utils.js");
          const packageName = provider.stt.type === "whisper" ? "openai-whisper" : "faster-whisper";
          const installed = checkPackageInstalled(packageName);

          if (!installed.installed) {
            result.warnings.push(
              `STT model ${provider.stt.type} not installed. Run: npm install ${installed.npmPackage}`,
            );

            if (!options?.validateOnly) {
              result.success = false;
              result.error = new Error("STT dependencies not installed");
            }
          }

          result.details.sttStatus = "ready";
        } else if (provider.stt.type === "openai" || provider.stt.type === "google" || provider.stt.type === "azure") {
          // Cloud STT provider (openai, google, azure)
          if (!provider.stt.apiKey) {
            result.warnings.push(`Cloud STT (${provider.stt.service || provider.stt.type}) missing API key`);
            if (!options?.validateOnly) {
              result.success = false;
              result.error = new Error("Cloud STT API key not configured");
            }
          } else {
            result.details.sttStatus = "configured";
          }
        }
      }

      // Check TTS provider if configured
      if (provider.tts) {
        if (provider.tts.type === "local" || provider.tts.type === "kokoro" || provider.tts.type === "piper") {
          const { checkPackageInstalled } = await import("./voice-providers.utils.js");
          const installed = checkPackageInstalled(provider.tts.type === "kokoro" ? "kokoro" : "piper");

          if (!installed.installed) {
            result.warnings.push(
              `TTS model ${provider.tts.type} not installed. Run: npm install ${installed.npmPackage}`,
            );

            if (!options?.validateOnly) {
              result.success = false;
              result.error = new Error("TTS dependencies not installed");
            }
          }

          result.details.ttsStatus = "ready";
        } else {
          // Cloud TTS provider (elevenlabs, openai, google, azure)
          if (!provider.tts.apiKey) {
            result.warnings.push(`Cloud TTS (${provider.tts.service || provider.tts.type}) missing API key`);
            if (!options?.validateOnly) {
              result.success = false;
              result.error = new Error("Cloud TTS API key not configured");
            }
          } else {
            result.details.ttsStatus = "configured";
          }
        }
      }

      if (result.warnings.length > 0) {
        logger.warn(`Provider ${provider.id}: ${result.warnings.join("; ")}`);
      }

      if (result.success) {
        logger.info(
          `Provider ${provider.id} initialized successfully (STT: ${result.details.sttStatus || "N/A"}, TTS: ${result.details.ttsStatus || "N/A"})`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.success = false;
      result.error = new Error(`Failed to initialize provider ${provider.id}: ${msg}`);
      logger.error(result.error.message);
    }

    results.push(result);
  }

  return results;
}

/**
 * Get system capabilities - for use in voice provider detection
 */
export function getSystemCapabilities() {
  return detectSystemCapabilities();
}

/**
 * Check if any STT provider is available
 */
export function hasAvailableSTTProvider(config: VoiceProvidersConfig): boolean {
  if (!config?.enabled) {
    return false;
  }
  const providers = getProvidersInPriorityOrder(config);
  return providers.some((p) => p.stt);
}

/**
 * Check if any TTS provider is available
 */
export function hasAvailableTTSProvider(config: VoiceProvidersConfig): boolean {
  if (!config?.enabled) {
    return false;
  }
  const providers = getProvidersInPriorityOrder(config);
  return providers.some((p) => p.tts);
}

/**
 * Resolve provider by ID
 */
export function resolveProviderById(
  config: VoiceProvidersConfig,
  providerId: string,
): VoiceProviderEntry | undefined {
  const providers = getProvidersInPriorityOrder(config);
  return providers.find((p) => p.id === providerId);
}

/**
 * Get provider status summary
 */
export function getVoiceProviderStatus(config: VoiceProvidersConfig): {
  enabled: boolean;
  totalProviders: number;
  activeProviders: number;
  hasSTT: boolean;
  hasTTS: boolean;
  defaultSttProviderId?: string;
  defaultTtsProviderId?: string;
} {
  const providers = getProvidersInPriorityOrder(config);
  const activeProviders = providers.filter((p) => p.enabled !== false);

  return {
    enabled: config?.enabled ?? false,
    totalProviders: providers.length,
    activeProviders: activeProviders.length,
    hasSTT: activeProviders.some((p) => p.stt),
    hasTTS: activeProviders.some((p) => p.tts),
    defaultSttProviderId: config?.defaultSttProviderId,
    defaultTtsProviderId: config?.defaultTtsProviderId,
  };
}
