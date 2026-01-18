/**
 * Plugin System
 *
 * Exports all plugin infrastructure, registry, and built-in plugins.
 */

// Core interfaces and types
export type {
  PluginConfig,
  PluginDiscoveryOptions,
  PluginInitResult,
  PluginMetadata,
  PluginRegistration,
  STTProvider,
  STTSession,
  TTSProvider,
  TTSSynthesisOptions,
} from "./interfaces.js";
export { PluginRegistryError } from "./interfaces.js";

// Plugin registry
export { getPluginRegistry, PluginRegistry } from "./registry.js";

// Platform call provider registry
export {
  CallProviderRegistry,
  initializeAllCallProviders,
  getProviderMetadata,
} from "./plugin-registry.js";
export type {
  PluginRegistryConfig,
} from "./plugin-registry.js";

// Platform-specific call providers
export { DiscordCallProviderPlugin } from "./discord/provider.js";
export type { DiscordCallProviderConfig } from "./discord/provider.js";

export { TelegramCallProviderPlugin } from "./telegram/provider.js";
export type { TelegramCallProviderConfig } from "./telegram/provider.js";

export { SignalCallProviderPlugin } from "./signal/provider.js";
export type { SignalCallProviderConfig } from "./signal/provider.js";

export { TwilioCallProviderPlugin } from "./twilio/twilio-provider.js";
export type { TwilioPluginConfig } from "./twilio/twilio-config.js";

// Built-in STT plugins
export {
  OpenAIRealtimeSTTProvider,
  OpenAIRealtimeSTTSession,
} from "./stt-openai-realtime/index.js";
export type { OpenAIRealtimeSTTConfig } from "./stt-openai-realtime/index.js";

// Built-in TTS plugins
export {
  OPENAI_TTS_VOICES,
  OpenAITTSProvider,
  chunkAudio,
  mulawToLinear,
  pcmToMulaw,
  resample24kTo8k,
} from "./tts-openai/index.js";
export type { OpenAITTSConfig, OpenAITTSVoice } from "./tts-openai/index.js";

/**
 * Helper function to initialize and register the built-in OpenAI plugins.
 * Call this during application startup.
 *
 * @example
 * ```ts
 * import { initializeBuiltInPlugins } from './plugins';
 *
 * const sttResult = await initializeBuiltInPlugins();
 * if (!sttResult.success) {
 *   console.error('Failed to register plugins:', sttResult.message);
 * }
 * ```
 */
export async function initializeBuiltInPlugins(): Promise<PluginInitResult> {
  const { getPluginRegistry } = await import("./registry.js");
  const { OpenAIRealtimeSTTProvider } = await import(
    "./stt-openai-realtime/index.js"
  );
  const { OpenAITTSProvider } = await import("./tts-openai/index.js");

  const registry = getPluginRegistry();

  try {
    // Register OpenAI Realtime STT
    const sttProvider = new OpenAIRealtimeSTTProvider({
      apiKey: process.env.OPENAI_API_KEY || "",
    });
    const sttResult = registry.registerSTT("openai-realtime", sttProvider);
    if (!sttResult.success) {
      console.warn("Failed to register OpenAI Realtime STT:", sttResult.message);
    }

    // Register OpenAI TTS
    const ttsProvider = new OpenAITTSProvider({
      apiKey: process.env.OPENAI_API_KEY || "",
    });
    const ttsResult = registry.registerTTS("openai-tts", ttsProvider);
    if (!ttsResult.success) {
      console.warn("Failed to register OpenAI TTS:", ttsResult.message);
    }

    return {
      success: sttResult.success && ttsResult.success,
      message: `Registered ${registry.size()} built-in plugins`,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      message: `Failed to initialize built-in plugins: ${err.message}`,
      error: err,
    };
  }
}
