import type { UniversalTransport, UniversalTransportType } from "../types.js";

/**
 * Transport registry - manages transport extensions.
 * Transports handle the connection layer (webhook, websocket, polling).
 */
class TransportRegistry {
  private transports = new Map<UniversalTransportType, UniversalTransport>();

  /**
   * Register a transport extension.
   * Throws if a transport with the same type already exists.
   */
  register(transport: UniversalTransport): void {
    if (this.transports.has(transport.type)) {
      throw new Error(`Transport "${transport.type}" is already registered`);
    }
    this.transports.set(transport.type, transport);
  }

  /**
   * Get a registered transport by type.
   */
  get(type: UniversalTransportType): UniversalTransport | undefined {
    return this.transports.get(type);
  }

  /**
   * Check if a transport is registered.
   */
  has(type: UniversalTransportType): boolean {
    return this.transports.has(type);
  }

  /**
   * List all registered transport types.
   */
  list(): UniversalTransportType[] {
    return Array.from(this.transports.keys());
  }

  /**
   * Unregister a transport (for testing).
   */
  unregister(type: UniversalTransportType): boolean {
    return this.transports.delete(type);
  }

  /**
   * Clear all transports (for testing).
   */
  clear(): void {
    this.transports.clear();
  }
}

// Singleton instance
export const transportRegistry = new TransportRegistry();

/**
 * Register a transport extension.
 * This is the public API for external plugins to register transports.
 */
export function registerTransport(transport: UniversalTransport): void {
  transportRegistry.register(transport);
}

/**
 * Get a registered transport by type.
 */
export function getTransport(type: UniversalTransportType): UniversalTransport | undefined {
  return transportRegistry.get(type);
}

/**
 * List all registered transport types.
 */
export function listTransports(): UniversalTransportType[] {
  return transportRegistry.list();
}
