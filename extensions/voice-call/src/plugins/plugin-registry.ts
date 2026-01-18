/**
 * Platform Call Provider Plugin Registry
 *
 * Central registry for all platform-specific call provider plugins.
 * Factory function for initializing and managing Discord, Telegram, Signal,
 * and Twilio call providers.
 */

import type { VoiceCallProvider } from "../providers/base.js";
import type { CallManager } from "../manager.js";

/**
 * Platform provider registry configuration.
 */
export interface PluginRegistryConfig {
  /** Discord bot token (if Discord calls are enabled) */
  discordToken?: string;

  /** Telegram bot token (if Telegram calls are enabled) */
  telegramToken?: string;

  /** Signal CLI URL (if Signal calls are enabled) */
  signalCliUrl?: string;

  /** Twilio API configuration */
  twilioConfig?: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };

  /** Base webhook URL for inbound call routing */
  webhookUrl: string;

  /** Max concurrent calls */
  maxConcurrentCalls?: number;

  /** Call store path */
  storePath?: string;

  /** Enabled platforms */
  enabledPlatforms?: ("discord" | "telegram" | "signal" | "twilio")[];
}

/**
 * Registry for all platform call provider plugins.
 */
export class CallProviderRegistry {
  private providers: Map<string, VoiceCallProvider> = new Map();
  private platformMap: Map<string, string> = new Map(); // platform -> providerId

  constructor() {}

  /**
   * Register a call provider for a platform.
   * @param platform - Platform identifier (discord, telegram, signal, twilio)
   * @param provider - VoiceCallProvider implementation
   */
  registerProvider(platform: string, provider: VoiceCallProvider): void {
    const providerId = `${platform}-call-provider`;
    this.providers.set(providerId, provider);
    this.platformMap.set(platform, providerId);
  }

  /**
   * Get a provider by platform name.
   * @param platform - Platform identifier
   * @returns VoiceCallProvider or undefined if not registered
   */
  getProviderForPlatform(platform: string): VoiceCallProvider | undefined {
    const providerId = this.platformMap.get(platform);
    if (!providerId) return undefined;
    return this.providers.get(providerId);
  }

  /**
   * Get a provider by ID.
   * @param providerId - Provider identifier
   * @returns VoiceCallProvider or undefined if not found
   */
  getProvider(providerId: string): VoiceCallProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all registered providers.
   * @returns Array of registered providers
   */
  getAllProviders(): VoiceCallProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all registered platforms.
   * @returns Array of platform identifiers
   */
  getRegisteredPlatforms(): string[] {
    return Array.from(this.platformMap.keys());
  }

  /**
   * Check if a platform has a registered provider.
   * @param platform - Platform identifier
   * @returns True if provider is registered
   */
  hasPlatform(platform: string): boolean {
    return this.platformMap.has(platform);
  }

  /**
   * Clear all registered providers.
   */
  clear(): void {
    this.providers.clear();
    this.platformMap.clear();
  }
}

/**
 * Initialize all call provider plugins.
 *
 * This factory function creates and registers all platform-specific call
 * provider plugins based on configuration.
 *
 * @param config - Plugin registry configuration
 * @returns Initialized registry with all enabled providers
 *
 * @example
 * ```ts
 * const registry = initializeAllCallProviders({
 *   discordToken: process.env.DISCORD_BOT_TOKEN,
 *   telegramToken: process.env.TELEGRAM_BOT_TOKEN,
 *   signalCliUrl: "http://localhost:8080",
 *   twilioConfig: {
 *     accountSid: "...",
 *     authToken: "...",
 *     fromNumber: "+1234567890"
 *   },
 *   webhookUrl: "https://example.com/webhooks/voice",
 *   enabledPlatforms: ["discord", "telegram", "signal", "twilio"]
 * });
 *
 * // Use registry with CallManager
 * for (const provider of registry.getAllProviders()) {
 *   manager.registerProvider(provider);
 * }
 * ```
 */
export async function initializeAllCallProviders(
  config: PluginRegistryConfig,
): Promise<CallProviderRegistry> {
  const registry = new CallProviderRegistry();
  const enabledPlatforms = config.enabledPlatforms || [
    "discord",
    "telegram",
    "signal",
    "twilio",
  ];

  // Initialize Discord call provider
  if (enabledPlatforms.includes("discord") && config.discordToken) {
    try {
      const { DiscordCallProviderPlugin } = await import(
        "./discord/provider.js"
      );
      const provider = new DiscordCallProviderPlugin({
        token: config.discordToken,
        webhookUrl: config.webhookUrl,
        maxConcurrentCalls: config.maxConcurrentCalls || 10,
      });
      registry.registerProvider("discord", provider);
    } catch (error) {
      console.warn(
        `Failed to initialize Discord call provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Initialize Telegram call provider
  if (enabledPlatforms.includes("telegram") && config.telegramToken) {
    try {
      const { TelegramCallProviderPlugin } = await import(
        "./telegram/provider.js"
      );
      const provider = new TelegramCallProviderPlugin({
        token: config.telegramToken,
        webhookUrl: config.webhookUrl,
        maxConcurrentCalls: config.maxConcurrentCalls || 10,
      });
      registry.registerProvider("telegram", provider);
    } catch (error) {
      console.warn(
        `Failed to initialize Telegram call provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Initialize Signal call provider
  if (enabledPlatforms.includes("signal") && config.signalCliUrl) {
    try {
      const { SignalCallProviderPlugin } = await import(
        "./signal/provider.js"
      );
      const provider = new SignalCallProviderPlugin({
        cliUrl: config.signalCliUrl,
        webhookUrl: config.webhookUrl,
        maxConcurrentCalls: config.maxConcurrentCalls || 10,
      });
      registry.registerProvider("signal", provider);
    } catch (error) {
      console.warn(
        `Failed to initialize Signal call provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Initialize Twilio call provider
  if (enabledPlatforms.includes("twilio") && config.twilioConfig) {
    try {
      const { TwilioCallProviderPlugin } = await import(
        "./twilio/twilio-provider.js"
      );
      const { TwilioProvider } = await import("../providers/twilio.js");
      const twilioProvider = new TwilioProvider(
        config.twilioConfig.accountSid,
        config.twilioConfig.authToken,
      );
      const provider = new TwilioCallProviderPlugin(twilioProvider, {
        fromNumber: config.twilioConfig.fromNumber,
        webhookUrl: config.webhookUrl,
        maxConcurrentCalls: config.maxConcurrentCalls || 10,
      });
      registry.registerProvider("twilio", provider);
    } catch (error) {
      console.warn(
        `Failed to initialize Twilio call provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return registry;
}

/**
 * Get plugin metadata for all registered providers.
 * Useful for logging and debugging.
 *
 * @param registry - Call provider registry
 * @returns Array of provider names
 */
export function getProviderMetadata(registry: CallProviderRegistry): string[] {
  return registry.getRegisteredPlatforms();
}
