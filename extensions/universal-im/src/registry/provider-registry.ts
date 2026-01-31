import type { UniversalProvider } from "../types.js";

/**
 * Provider registry - manages IM provider extensions.
 * Providers translate raw events to/from UniversalInboundMessage.
 */
class ProviderRegistry {
  private providers = new Map<string, UniversalProvider>();

  /**
   * Register a provider extension.
   * Throws if a provider with the same ID already exists.
   */
  register(provider: UniversalProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a registered provider by ID.
   */
  get(id: string): UniversalProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Check if a provider is registered.
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * List all registered provider IDs.
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Unregister a provider (for testing).
   */
  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Clear all providers (for testing).
   */
  clear(): void {
    this.providers.clear();
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();

/**
 * Register a provider extension.
 * This is the public API for external plugins to register providers.
 */
export function registerProvider(provider: UniversalProvider): void {
  providerRegistry.register(provider);
}

/**
 * Get a registered provider by ID.
 */
export function getProvider(id: string): UniversalProvider | undefined {
  return providerRegistry.get(id);
}

/**
 * List all registered provider IDs.
 */
export function listProviders(): string[] {
  return providerRegistry.list();
}
