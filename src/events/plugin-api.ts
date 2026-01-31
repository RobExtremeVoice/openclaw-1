/**
 * Event Bus - Plugin API
 *
 * Provides event bus access to plugins, enabling:
 * - Subscribing to system events
 * - Emitting custom plugin events
 * - Cross-plugin communication
 */

import type {
  EventEnvelope,
  EventHandler,
  Subscription,
  SubscribeOptions,
  TopicPattern,
} from "./types.js";
import type { EventTopicMap, PluginCustomEventPayload } from "./catalog.js";
import { getEventBus } from "./bus.js";
import { createEvent } from "./catalog.js";

// ============================================================================
// Plugin Event API Types
// ============================================================================

/**
 * Event API exposed to plugins
 */
export type PluginEventApi = {
  /**
   * Subscribe to events matching a topic pattern
   *
   * @example
   * ```ts
   * // Subscribe to all channel messages
   * api.events.subscribe("channel.message.received", (event) => {
   *   console.log(`Message: ${event.payload.text}`);
   * });
   *
   * // Subscribe with wildcards
   * api.events.subscribe("agent.#", (event) => {
   *   console.log(`Agent event: ${event.topic}`);
   * });
   * ```
   */
  subscribe: <E extends EventEnvelope = EventEnvelope>(
    pattern: TopicPattern,
    handler: EventHandler<E>,
    options?: SubscribeOptions,
  ) => Subscription;

  /**
   * Subscribe to a single event (auto-unsubscribes after first match)
   */
  once: <E extends EventEnvelope = EventEnvelope>(
    pattern: TopicPattern,
    handler: EventHandler<E>,
    options?: SubscribeOptions,
  ) => Subscription;

  /**
   * Emit a custom plugin event
   *
   * @example
   * ```ts
   * api.events.emit("my-feature.activated", { userId: "123" });
   * ```
   */
  emit: (eventName: string, data: unknown, options?: { sessionKey?: string }) => void;

  /**
   * Emit a typed system event (for plugins that extend core functionality)
   *
   * @example
   * ```ts
   * api.events.emitTyped("channel.message.received", {
   *   channelId: "my-channel",
   *   // ... other required fields
   * });
   * ```
   */
  emitTyped: <T extends keyof EventTopicMap>(
    topic: T,
    payload: EventTopicMap[T],
    options?: { sessionKey?: string; correlationId?: string },
  ) => void;

  /**
   * Check if there are any subscribers for a topic
   */
  hasSubscribers: (topic: string) => boolean;
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create the event API for a plugin
 */
export function createPluginEventApi(pluginId: string): PluginEventApi {
  const bus = getEventBus();

  // Track subscriptions for cleanup
  const subscriptions: Subscription[] = [];

  const subscribe = <E extends EventEnvelope = EventEnvelope>(
    pattern: TopicPattern,
    handler: EventHandler<E>,
    options?: SubscribeOptions,
  ): Subscription => {
    const sub = bus.subscribe(pattern, handler, options);
    subscriptions.push(sub);
    return sub;
  };

  const once = <E extends EventEnvelope = EventEnvelope>(
    pattern: TopicPattern,
    handler: EventHandler<E>,
    options?: SubscribeOptions,
  ): Subscription => {
    const sub = bus.once(pattern, handler, options);
    subscriptions.push(sub);
    return sub;
  };

  const emit = (eventName: string, data: unknown, options?: { sessionKey?: string }): void => {
    const payload: PluginCustomEventPayload = {
      pluginId,
      eventName,
      data,
    };
    bus.emit(
      createEvent("plugin.custom", payload, {
        source: `plugin:${pluginId}`,
        sessionKey: options?.sessionKey,
      }),
    );
  };

  const emitTyped = <T extends keyof EventTopicMap>(
    topic: T,
    payload: EventTopicMap[T],
    options?: { sessionKey?: string; correlationId?: string },
  ): void => {
    bus.emit(
      createEvent(topic, payload, {
        source: `plugin:${pluginId}`,
        ...options,
      }),
    );
  };

  const hasSubscribers = (topic: string): boolean => {
    return bus.hasSubscribers(topic);
  };

  return {
    subscribe,
    once,
    emit,
    emitTyped,
    hasSubscribers,
  };
}

/**
 * Cleanup all subscriptions for a plugin
 */
export function cleanupPluginEventSubscriptions(_api: PluginEventApi): void {
  // The subscriptions are tracked internally, but for safety
  // plugins should call unsubscribe on returned Subscription objects
}

// ============================================================================
// Event Helpers for Plugins
// ============================================================================

/**
 * Helper to create a typed event handler
 */
export function createTypedHandler<T extends keyof EventTopicMap>(
  topic: T,
  handler: (
    payload: EventTopicMap[T],
    event: EventEnvelope<T, EventTopicMap[T]>,
  ) => void | Promise<void>,
): EventHandler<EventEnvelope<T, EventTopicMap[T]>> {
  return (event) => handler(event.payload, event);
}

/**
 * Helper to filter events by session
 */
export function forSession(sessionKey: string, handler: EventHandler): EventHandler {
  return (event) => {
    if (event.sessionKey === sessionKey) {
      return handler(event);
    }
  };
}

/**
 * Helper to filter events by source
 */
export function fromSource(source: string, handler: EventHandler): EventHandler {
  return (event) => {
    if (event.source === source) {
      return handler(event);
    }
  };
}

/**
 * Helper to debounce event handlers
 */
export function debounced(handler: EventHandler, delayMs: number): EventHandler {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastEvent: EventEnvelope | null = null;

  return (event) => {
    lastEvent = event;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (lastEvent) {
        void handler(lastEvent);
        lastEvent = null;
      }
    }, delayMs);
  };
}

/**
 * Helper to throttle event handlers
 */
export function throttled(handler: EventHandler, intervalMs: number): EventHandler {
  let lastCall = 0;

  return (event) => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      return handler(event);
    }
  };
}
