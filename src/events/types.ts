/**
 * Event Bus - Core Types
 *
 * A unified event system for Moltbot that enables:
 * - Cross-channel coordination (WhatsApp → Discord notifications)
 * - Async workflows with checkpoints
 * - Plugin communication without tight coupling
 * - External webhook integrations
 *
 * Design principles:
 * - Type-safe with discriminated unions
 * - Topic-based routing with wildcard support
 * - Error isolation (handlers don't crash the bus)
 * - Sequence numbering for ordering guarantees
 * - Designed for future distribution (Redis/NATS compatible)
 */

// ============================================================================
// Core Event Types
// ============================================================================

/**
 * Base event envelope - all events include these fields
 */
export type EventEnvelope<T extends string = string, P = unknown> = {
  /** Event topic (e.g., "channel.message.received", "agent.tool.executed") */
  topic: T;
  /** Event payload - type depends on topic */
  payload: P;
  /** Monotonically increasing sequence number */
  seq: number;
  /** Unix timestamp (ms) when event was emitted */
  ts: number;
  /** Optional correlation ID for tracing related events */
  correlationId?: string;
  /** Optional source identifier (channel, plugin, agent) */
  source?: string;
  /** Optional session key for session-scoped events */
  sessionKey?: string;
};

/**
 * Event input - what callers provide (seq/ts added by bus)
 */
export type EventInput<T extends string = string, P = unknown> = {
  topic: T;
  payload: P;
  correlationId?: string;
  source?: string;
  sessionKey?: string;
};

// ============================================================================
// Topic Patterns
// ============================================================================

/**
 * Topic pattern for subscriptions - supports wildcards:
 * - "channel.message.received" - exact match
 * - "channel.message.*" - single segment wildcard
 * - "channel.#" - multi-segment wildcard (matches channel.anything.here)
 * - "*" - matches any single topic segment
 * - "#" - matches zero or more topic segments
 */
export type TopicPattern = string;

/**
 * Check if a topic matches a pattern
 */
export function topicMatches(pattern: TopicPattern, topic: string): boolean {
  // Exact match fast path
  if (pattern === topic) return true;
  if (pattern === "#") return true;

  const patternParts = pattern.split(".");
  const topicParts = topic.split(".");

  let pi = 0;
  let ti = 0;

  while (pi < patternParts.length && ti < topicParts.length) {
    const pp = patternParts[pi];

    if (pp === "#") {
      // # at end matches everything remaining
      if (pi === patternParts.length - 1) return true;
      // # in middle - try matching rest at each position
      for (let tryTi = ti; tryTi <= topicParts.length; tryTi++) {
        if (topicMatches(patternParts.slice(pi + 1).join("."), topicParts.slice(tryTi).join("."))) {
          return true;
        }
      }
      return false;
    }

    if (pp === "*") {
      // * matches exactly one segment
      pi++;
      ti++;
      continue;
    }

    // Literal match required
    if (pp !== topicParts[ti]) return false;
    pi++;
    ti++;
  }

  // Pattern exhausted - topic must also be exhausted
  // Unless pattern ends with #
  if (pi < patternParts.length) {
    return patternParts[pi] === "#" && pi === patternParts.length - 1;
  }

  return ti === topicParts.length;
}

// ============================================================================
// Subscription Types
// ============================================================================

/**
 * Event handler function
 */
export type EventHandler<E extends EventEnvelope = EventEnvelope> = (
  event: E,
) => void | Promise<void>;

/**
 * Subscription options
 */
export type SubscribeOptions = {
  /** Only receive events matching this session key */
  sessionKey?: string;
  /** Only receive events from this source */
  source?: string;
  /** Priority for ordered execution (higher = earlier, default 0) */
  priority?: number;
  /** If true, errors in this handler propagate (default: false, errors logged) */
  propagateErrors?: boolean;
};

/**
 * Active subscription handle
 */
export type Subscription = {
  /** Unique subscription ID */
  id: string;
  /** Pattern this subscription matches */
  pattern: TopicPattern;
  /** Unsubscribe from this subscription */
  unsubscribe: () => void;
};

// ============================================================================
// Event Bus Interface
// ============================================================================

/**
 * Core event bus interface - can be implemented with different backends
 */
export type EventBus = {
  /**
   * Emit an event to all matching subscribers
   * Returns after all sync handlers complete, async handlers may still be running
   */
  emit: <T extends string, P>(event: EventInput<T, P>) => EventEnvelope<T, P>;

  /**
   * Emit an event and wait for all handlers (sync + async) to complete
   */
  emitAsync: <T extends string, P>(event: EventInput<T, P>) => Promise<EventEnvelope<T, P>>;

  /**
   * Subscribe to events matching a topic pattern
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
   * Unsubscribe by subscription ID
   */
  unsubscribe: (subscriptionId: string) => boolean;

  /**
   * Unsubscribe all handlers for a pattern
   */
  unsubscribeAll: (pattern: TopicPattern) => number;

  /**
   * Get current sequence number
   */
  getSeq: () => number;

  /**
   * Check if there are any subscribers for a topic
   */
  hasSubscribers: (topic: string) => boolean;

  /**
   * Get count of active subscriptions
   */
  subscriptionCount: () => number;

  /**
   * Shutdown the bus, clearing all subscriptions
   */
  shutdown: () => void;
};

// ============================================================================
// Event Persistence Types
// ============================================================================

/**
 * Persisted event with metadata
 */
export type PersistedEvent<E extends EventEnvelope = EventEnvelope> = E & {
  /** Persistence ID (may differ from seq for distributed systems) */
  persistenceId: string;
  /** When the event was persisted */
  persistedAt: number;
};

/**
 * Event store interface for persistence
 */
export type EventStore = {
  /** Append an event to the store */
  append: (event: EventEnvelope) => Promise<PersistedEvent>;

  /** Read events after a sequence number */
  readAfter: (
    seq: number,
    options?: { limit?: number; topic?: TopicPattern },
  ) => Promise<PersistedEvent[]>;

  /** Read events in a time range */
  readRange: (
    from: number,
    to: number,
    options?: { limit?: number; topic?: TopicPattern },
  ) => Promise<PersistedEvent[]>;

  /** Get the latest sequence number */
  getLatestSeq: () => Promise<number>;

  /** Prune events older than a timestamp */
  prune: (olderThan: number) => Promise<number>;
};

// ============================================================================
// Bus Configuration
// ============================================================================

export type EventBusConfig = {
  /** Optional event store for persistence */
  store?: EventStore;
  /** Max async handlers to run concurrently per event (default: 10) */
  maxConcurrency?: number;
  /** Timeout for async handlers in ms (default: 30000) */
  handlerTimeout?: number;
  /** Logger for errors and debug info */
  logger?: {
    error: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    debug: (msg: string, ...args: unknown[]) => void;
  };
};
