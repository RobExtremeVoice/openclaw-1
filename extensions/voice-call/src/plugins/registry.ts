/**
 * Plugin Registry
 *
 * Manages plugin discovery, registration, and lifecycle.
 * Provides a centralized registry for STT and TTS providers.
 */

import {
  type PluginConfig,
  type PluginDiscoveryOptions,
  type PluginInitResult,
  type PluginRegistration,
  type STTProvider,
  type TTSProvider,
  PluginRegistryError,
} from "./interfaces.js";

/**
 * Global plugin registry.
 * Manages all registered STT and TTS providers.
 */
export class PluginRegistry {
  private static instance: PluginRegistry | null = null;
  private plugins: Map<string, PluginRegistration> = new Map();

  private constructor() {}

  /**
   * Get the global plugin registry instance.
   */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Register an STT provider.
   * @param id - Unique plugin identifier
   * @param provider - STT provider instance
   * @param config - Optional configuration
   * @returns Registration result
   */
  registerSTT(
    id: string,
    provider: STTProvider,
    config?: PluginConfig,
  ): PluginInitResult {
    try {
      provider.validateConfig();

      const registration: PluginRegistration = {
        id,
        name: provider.metadata.name,
        type: "stt",
        instance: provider,
        registeredAt: new Date(),
      };

      this.plugins.set(id, registration);

      return {
        success: true,
        message: `STT provider '${provider.metadata.name}' registered as '${id}'`,
        plugin: registration,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        message: `Failed to register STT provider: ${err.message}`,
        error: err,
      };
    }
  }

  /**
   * Register a TTS provider.
   * @param id - Unique plugin identifier
   * @param provider - TTS provider instance
   * @param config - Optional configuration
   * @returns Registration result
   */
  registerTTS(
    id: string,
    provider: TTSProvider,
    config?: PluginConfig,
  ): PluginInitResult {
    try {
      provider.validateConfig();

      const registration: PluginRegistration = {
        id,
        name: provider.metadata.name,
        type: "tts",
        instance: provider,
        registeredAt: new Date(),
      };

      this.plugins.set(id, registration);

      return {
        success: true,
        message: `TTS provider '${provider.metadata.name}' registered as '${id}'`,
        plugin: registration,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        message: `Failed to register TTS provider: ${err.message}`,
        error: err,
      };
    }
  }

  /**
   * Unregister a plugin by ID.
   * @param id - Plugin ID
   * @returns True if unregistered, false if not found
   */
  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  /**
   * Get a plugin by ID.
   * @param id - Plugin ID
   * @returns Plugin registration or undefined
   */
  get(id: string): PluginRegistration | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get an STT provider by ID.
   * @param id - Plugin ID
   * @returns STT provider instance
   * @throws PluginRegistryError if not found or wrong type
   */
  getSTT(id: string): STTProvider {
    const registration = this.plugins.get(id);
    if (!registration) {
      throw new PluginRegistryError(
        `Plugin '${id}' not found`,
        "PLUGIN_NOT_FOUND",
      );
    }
    if (registration.type !== "stt") {
      throw new PluginRegistryError(
        `Plugin '${id}' is not an STT provider`,
        "PLUGIN_TYPE_MISMATCH",
      );
    }
    return registration.instance as STTProvider;
  }

  /**
   * Get a TTS provider by ID.
   * @param id - Plugin ID
   * @returns TTS provider instance
   * @throws PluginRegistryError if not found or wrong type
   */
  getTTS(id: string): TTSProvider {
    const registration = this.plugins.get(id);
    if (!registration) {
      throw new PluginRegistryError(
        `Plugin '${id}' not found`,
        "PLUGIN_NOT_FOUND",
      );
    }
    if (registration.type !== "tts") {
      throw new PluginRegistryError(
        `Plugin '${id}' is not a TTS provider`,
        "PLUGIN_TYPE_MISMATCH",
      );
    }
    return registration.instance as TTSProvider;
  }

  /**
   * Find plugins matching discovery options.
   * @param options - Discovery options
   * @returns Array of matching plugin registrations
   */
  discover(options?: PluginDiscoveryOptions): PluginRegistration[] {
    let results = Array.from(this.plugins.values());

    if (options?.type) {
      results = results.filter((p) => p.type === options.type);
    }

    if (options?.namePattern) {
      results = results.filter((p) => options.namePattern!.test(p.name));
    }

    if (options?.tags && options.tags.length > 0) {
      // This would require storing tags in registration
      // For now, skip tag filtering
    }

    return results;
  }

  /**
   * Get all STT providers.
   * @returns Array of STT provider registrations
   */
  getAllSTT(): PluginRegistration[] {
    return Array.from(this.plugins.values()).filter((p) => p.type === "stt");
  }

  /**
   * Get all TTS providers.
   * @returns Array of TTS provider registrations
   */
  getAllTTS(): PluginRegistration[] {
    return Array.from(this.plugins.values()).filter((p) => p.type === "tts");
  }

  /**
   * Get all registered plugins.
   * @returns Array of all plugin registrations
   */
  getAll(): PluginRegistration[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Clear all registered plugins.
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Get the total number of registered plugins.
   */
  size(): number {
    return this.plugins.size;
  }

  /**
   * Check if a plugin is registered.
   * @param id - Plugin ID
   */
  has(id: string): boolean {
    return this.plugins.has(id);
  }
}

/**
 * Get the global plugin registry instance.
 */
export function getPluginRegistry(): PluginRegistry {
  return PluginRegistry.getInstance();
}
