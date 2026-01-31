/**
 * Event Bus - In-Process Implementation
 *
 * A high-performance, type-safe event bus for Moltbot.
 * Supports topic patterns, priority ordering, and async handlers.
 */

import type {
  EventBus,
  EventBusConfig,
  EventEnvelope,
  EventHandler,
  EventInput,
  Subscription,
  SubscribeOptions,
  TopicPattern,
} from "./types.js";
import { topicMatches } from "./types.js";

// ============================================================================
// Internal Types
// ============================================================================

type InternalSubscription = {
  id: string;
  pattern: TopicPattern;
  handler: EventHandler<EventEnvelope>;
  options: SubscribeOptions;
  once: boolean;
};

// ============================================================================
// Implementation
// ============================================================================

let subscriptionIdCounter = 0;

function generateSubscriptionId(): string {
  return `sub_${++subscriptionIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Create an in-process event bus
 */
export function createEventBus(config: EventBusConfig = {}): EventBus {
  const {
    store,
    maxConcurrency = 10,
    handlerTimeout = 30_000,
    logger = {
      error: console.error,
      warn: console.warn,
      debug: () => {},
    },
  } = config;

  let seq = 0;
  let isShutdown = false;

  // Subscriptions indexed by pattern for efficient lookup
  const subscriptions = new Map<string, InternalSubscription>();
  // Cache of patterns for faster matching
  const patternCache = new Set<TopicPattern>();

  // -------------------------------------------------------------------------
  // Subscription Management
  // -------------------------------------------------------------------------

  const subscribe = <E extends EventEnvelope = EventEnvelope>(
    pattern: TopicPattern,
    handler: EventHandler<E>,
    options: SubscribeOptions = {},
  ): Subscription => {
    if (isShutdown) {
      throw new Error("EventBus is shut down");
    }

    const id = generateSubscriptionId();
    const sub: InternalSubscription = {
      id,
      pattern,
      handler: handler as EventHandler<EventEnvelope>,
      options,
      once: false,
    };

    subscriptions.set(id, sub);
    patternCache.add(pattern);

    logger.debug(`Subscribed ${id} to pattern "${pattern}"`);

    return {
      id,
      pattern,
      unsubscribe: () => unsubscribe(id),
    };
  };

  const once = <E extends EventEnvelope = EventEnvelope>(
    pattern: TopicPattern,
    handler: EventHandler<E>,
    options: SubscribeOptions = {},
  ): Subscription => {
    const id = generateSubscriptionId();
    const sub: InternalSubscription = {
      id,
      pattern,
      handler: handler as EventHandler<EventEnvelope>,
      options,
      once: true,
    };

    subscriptions.set(id, sub);
    patternCache.add(pattern);

    return {
      id,
      pattern,
      unsubscribe: () => unsubscribe(id),
    };
  };

  const unsubscribe = (subscriptionId: string): boolean => {
    const sub = subscriptions.get(subscriptionId);
    if (!sub) return false;

    subscriptions.delete(subscriptionId);

    // Rebuild pattern cache if needed
    let patternStillUsed = false;
    for (const s of subscriptions.values()) {
      if (s.pattern === sub.pattern) {
        patternStillUsed = true;
        break;
      }
    }
    if (!patternStillUsed) {
      patternCache.delete(sub.pattern);
    }

    logger.debug(`Unsubscribed ${subscriptionId} from pattern "${sub.pattern}"`);
    return true;
  };

  const unsubscribeAll = (pattern: TopicPattern): number => {
    let count = 0;
    for (const [id, sub] of subscriptions) {
      if (sub.pattern === pattern) {
        subscriptions.delete(id);
        count++;
      }
    }
    if (count > 0) {
      patternCache.delete(pattern);
    }
    return count;
  };

  // -------------------------------------------------------------------------
  // Event Emission
  // -------------------------------------------------------------------------

  const findMatchingSubscriptions = (
    topic: string,
    sessionKey?: string,
    source?: string,
  ): InternalSubscription[] => {
    const matching: InternalSubscription[] = [];

    for (const sub of subscriptions.values()) {
      // Check topic pattern match
      if (!topicMatches(sub.pattern, topic)) continue;

      // Check session key filter
      if (sub.options.sessionKey && sub.options.sessionKey !== sessionKey) {
        continue;
      }

      // Check source filter
      if (sub.options.source && sub.options.source !== source) {
        continue;
      }

      matching.push(sub);
    }

    // Sort by priority (higher first)
    matching.sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0));

    return matching;
  };

  const executeHandler = async (sub: InternalSubscription, event: EventEnvelope): Promise<void> => {
    try {
      const result = sub.handler(event);
      if (result instanceof Promise) {
        // Apply timeout
        await Promise.race([
          result,
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Handler timeout after ${handlerTimeout}ms`)),
              handlerTimeout,
            ),
          ),
        ]);
      }
    } catch (err) {
      if (sub.options.propagateErrors) {
        throw err;
      }
      logger.error(`Event handler error for "${event.topic}" (sub: ${sub.id}): ${String(err)}`);
    }
  };

  const emit = <T extends string, P>(input: EventInput<T, P>): EventEnvelope<T, P> => {
    if (isShutdown) {
      throw new Error("EventBus is shut down");
    }

    const event: EventEnvelope<T, P> = {
      ...input,
      seq: ++seq,
      ts: Date.now(),
    };

    const matching = findMatchingSubscriptions(event.topic, event.sessionKey, event.source);

    // Track once-subscriptions to remove
    const toRemove: string[] = [];

    for (const sub of matching) {
      if (sub.once) {
        toRemove.push(sub.id);
      }

      // Execute sync, fire-and-forget for async
      try {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          // Don't await - fire and forget
          result.catch((err) => {
            if (sub.options.propagateErrors) {
              // Can't propagate from fire-and-forget, log instead
              logger.error(
                `Async handler error for "${event.topic}" (sub: ${sub.id}): ${String(err)}`,
              );
            } else {
              logger.error(
                `Event handler error for "${event.topic}" (sub: ${sub.id}): ${String(err)}`,
              );
            }
          });
        }
      } catch (err) {
        if (sub.options.propagateErrors) {
          throw err;
        }
        logger.error(`Event handler error for "${event.topic}" (sub: ${sub.id}): ${String(err)}`);
      }
    }

    // Remove once-subscriptions
    for (const id of toRemove) {
      unsubscribe(id);
    }

    // Persist if store configured (async, don't block emit)
    if (store) {
      store.append(event).catch((err) => {
        logger.error(`Failed to persist event ${event.seq}: ${String(err)}`);
      });
    }

    return event;
  };

  const emitAsync = async <T extends string, P>(
    input: EventInput<T, P>,
  ): Promise<EventEnvelope<T, P>> => {
    if (isShutdown) {
      throw new Error("EventBus is shut down");
    }

    const event: EventEnvelope<T, P> = {
      ...input,
      seq: ++seq,
      ts: Date.now(),
    };

    const matching = findMatchingSubscriptions(event.topic, event.sessionKey, event.source);

    // Track once-subscriptions to remove
    const toRemove: string[] = [];

    // Execute handlers with concurrency limit
    const pending: Promise<void>[] = [];
    let running = 0;

    for (const sub of matching) {
      if (sub.once) {
        toRemove.push(sub.id);
      }

      // Wait if at concurrency limit
      while (running >= maxConcurrency) {
        await Promise.race(pending);
      }

      running++;
      const p = executeHandler(sub, event).finally(() => {
        running--;
        const idx = pending.indexOf(p);
        if (idx !== -1) void pending.splice(idx, 1);
      });
      pending.push(p);
    }

    // Wait for all remaining handlers
    await Promise.all(pending);

    // Remove once-subscriptions
    for (const id of toRemove) {
      unsubscribe(id);
    }

    // Persist if store configured
    if (store) {
      await store.append(event);
    }

    return event;
  };

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  const getSeq = (): number => seq;

  const hasSubscribers = (topic: string): boolean => {
    // Quick check: any pattern could match?
    if (patternCache.size === 0) return false;

    // Check each subscription
    for (const sub of subscriptions.values()) {
      if (topicMatches(sub.pattern, topic)) {
        return true;
      }
    }
    return false;
  };

  const subscriptionCount = (): number => subscriptions.size;

  const shutdown = (): void => {
    isShutdown = true;
    subscriptions.clear();
    patternCache.clear();
    logger.debug("EventBus shut down");
  };

  return {
    emit,
    emitAsync,
    subscribe,
    once,
    unsubscribe,
    unsubscribeAll,
    getSeq,
    hasSubscribers,
    subscriptionCount,
    shutdown,
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultBus: EventBus | null = null;

/**
 * Get the default event bus instance (creates one if needed)
 */
export function getEventBus(): EventBus {
  if (!defaultBus) {
    defaultBus = createEventBus();
  }
  return defaultBus;
}

/**
 * Set a custom event bus as the default
 */
export function setEventBus(bus: EventBus): void {
  defaultBus = bus;
}

/**
 * Reset the default event bus (useful for testing)
 */
export function resetEventBus(): void {
  if (defaultBus) {
    defaultBus.shutdown();
    defaultBus = null;
  }
}
