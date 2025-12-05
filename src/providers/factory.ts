/**
 * Provider Factory
 *
 * Factory functions for creating and initializing messaging providers.
 */

import { TelegramProvider } from "../telegram/index.js";
import type { Provider, ProviderConfig, ProviderKind } from "./base/index.js";

/**
 * Create a provider instance by kind.
 *
 * The provider is created but NOT initialized. Call initialize() before using.
 *
 * @param kind - Provider type to create
 * @returns Uninitialized provider instance
 * @throws Error if provider kind is unknown or not yet implemented
 */
export function createProvider(kind: ProviderKind): Provider {
  switch (kind) {
    case "web":
    case "twilio":
      throw new Error(
        `Provider ${kind} not yet implemented in abstraction layer - use direct CLI commands`,
      );
    case "telegram":
      return new TelegramProvider();
    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}

/**
 * Create and initialize a provider in one step.
 *
 * Convenience function that combines createProvider() and initialize().
 *
 * @param kind - Provider type to create
 * @param config - Configuration for the provider
 * @returns Initialized and ready-to-use provider
 * @throws Error if provider creation or initialization fails
 */
export async function createInitializedProvider(
  kind: ProviderKind,
  config: ProviderConfig,
): Promise<Provider> {
  const provider = createProvider(kind);
  await provider.initialize(config);
  return provider;
}
