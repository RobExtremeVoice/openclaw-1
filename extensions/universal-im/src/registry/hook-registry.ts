import type { InboundHook, OutboundHook } from "../types.js";

/**
 * Hook registry - manages pipeline hooks.
 * Hooks can observe/mutate messages at specific pipeline stages.
 */
class HookRegistry {
  private inboundHooks = new Map<string, InboundHook>();
  private outboundHooks = new Map<string, OutboundHook>();

  /**
   * Register an inbound hook.
   */
  registerInbound(hook: InboundHook): void {
    if (this.inboundHooks.has(hook.id)) {
      throw new Error(`Inbound hook "${hook.id}" is already registered`);
    }
    this.inboundHooks.set(hook.id, hook);
  }

  /**
   * Register an outbound hook.
   */
  registerOutbound(hook: OutboundHook): void {
    if (this.outboundHooks.has(hook.id)) {
      throw new Error(`Outbound hook "${hook.id}" is already registered`);
    }
    this.outboundHooks.set(hook.id, hook);
  }

  /**
   * Get all inbound hooks.
   */
  getInboundHooks(): InboundHook[] {
    return Array.from(this.inboundHooks.values());
  }

  /**
   * Get all outbound hooks.
   */
  getOutboundHooks(): OutboundHook[] {
    return Array.from(this.outboundHooks.values());
  }

  /**
   * Unregister an inbound hook.
   */
  unregisterInbound(id: string): boolean {
    return this.inboundHooks.delete(id);
  }

  /**
   * Unregister an outbound hook.
   */
  unregisterOutbound(id: string): boolean {
    return this.outboundHooks.delete(id);
  }

  /**
   * Clear all hooks (for testing).
   */
  clear(): void {
    this.inboundHooks.clear();
    this.outboundHooks.clear();
  }
}

// Singleton instance
export const hookRegistry = new HookRegistry();

/**
 * Register an inbound pipeline hook.
 */
export function registerInboundHook(hook: InboundHook): void {
  hookRegistry.registerInbound(hook);
}

/**
 * Register an outbound pipeline hook.
 */
export function registerOutboundHook(hook: OutboundHook): void {
  hookRegistry.registerOutbound(hook);
}

/**
 * Get all registered inbound hooks.
 */
export function getInboundHooks(): InboundHook[] {
  return hookRegistry.getInboundHooks();
}

/**
 * Get all registered outbound hooks.
 */
export function getOutboundHooks(): OutboundHook[] {
  return hookRegistry.getOutboundHooks();
}
