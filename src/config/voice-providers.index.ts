/**
 * Voice Providers Integration Index
 *
 * Central export point for voice providers system.
 * Provides public API for configuration, loading, and utilities.
 */

// Schema and types
export type {
  STTProviderConfig,
  TTSProviderConfig,
  VoiceProviderEntry,
  VoiceProvidersConfig,
  VoiceConfig,
} from "./types.voice.js";

export {
  STTProviderConfigSchema,
  TTSProviderConfigSchema,
  VoiceProviderEntrySchema,
  VoiceProvidersConfigSchema,
  VoiceConfigSchema,
} from "./zod-schema.voice-providers.js";

// Type definitions
export type {
  SystemCapability,
  DependencyInfo,
  ProviderAvailability,
  VoiceProviderTestResult,
  ProviderRecommendation,
  ProviderInitOptions,
  ProviderInitResult,
} from "./voice-providers.types.js";

// Utilities
export {
  detectSystemCapabilities,
  checkPackageInstalled,
  getProviderDependencies,
  isLocalProviderAvailable,
  getRecommendedProviders,
  validateProviderConfig,
  migrateLegacyVoiceConfig,
  getInstallCommand,
} from "./voice-providers.utils.js";

// Migration and backwards compatibility
export {
  hasLegacyVoiceConfig,
  hasNewVoiceProvidersConfig,
  migrateLegacyTTSConfig,
  applyVoiceProvidersMigration,
  shouldWarnAboutLegacyVoiceConfig,
  getLegacyVoiceConfigWarning,
  validateVoiceProvidersConfig,
  getProvidersInPriorityOrder,
  getFirstAvailableSTTProvider,
  getFirstAvailableTTSProvider,
  mergeVoiceProviderConfigs,
} from "./voice-providers.migration.js";

// Configuration loading
export {
  loadVoiceProvidersConfig,
  initializeVoiceProviders,
  getSystemCapabilities,
  hasAvailableSTTProvider,
  hasAvailableTTSProvider,
  resolveProviderById,
  getVoiceProviderStatus,
} from "./voice-providers.loader.js";
