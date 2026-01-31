/**
 * Event Bus - Public API
 *
 * Unified event system for Moltbot enabling:
 * - Cross-channel coordination
 * - Async workflows
 * - Plugin communication
 * - External integrations
 *
 * @example
 * ```ts
 * import { getEventBus, createEvent } from "./events/index.js";
 *
 * const bus = getEventBus();
 *
 * // Subscribe to channel messages
 * bus.subscribe("channel.message.received", (event) => {
 *   console.log(`Message from ${event.payload.channelId}: ${event.payload.text}`);
 * });
 *
 * // Subscribe with wildcards
 * bus.subscribe("agent.#", (event) => {
 *   console.log(`Agent event: ${event.topic}`);
 * });
 *
 * // Emit a typed event
 * bus.emit(createEvent("channel.message.received", {
 *   channelId: "whatsapp",
 *   accountId: "default",
 *   messageId: "msg123",
 *   chatId: "+1234567890",
 *   chatType: "dm",
 *   senderId: "+1234567890",
 *   text: "Hello!",
 *   hasMedia: false,
 *   timestamp: Date.now(),
 * }));
 * ```
 */

// Core types
export type {
  EventEnvelope,
  EventInput,
  EventHandler,
  Subscription,
  SubscribeOptions,
  TopicPattern,
  EventBus,
  EventBusConfig,
  EventStore,
  PersistedEvent,
} from "./types.js";

export { topicMatches } from "./types.js";

// Bus implementation
export { createEventBus, getEventBus, setEventBus, resetEventBus } from "./bus.js";

// Event catalog
export type {
  EventTopicMap,
  TypedEvent,
  // Channel events
  ChannelMessageReceivedPayload,
  ChannelMessageSentPayload,
  ChannelMessageFailedPayload,
  ChannelStatusChangedPayload,
  ChannelPairingRequestedPayload,
  // Agent events
  AgentRunStartedPayload,
  AgentTextChunkPayload,
  AgentToolExecutingPayload,
  AgentToolCompletedPayload,
  AgentRunCompletedPayload,
  // Workflow events
  WorkflowStartedPayload,
  WorkflowStateChangedPayload,
  WorkflowCompletedPayload,
  // Plugin events
  PluginLoadedPayload,
  PluginCustomEventPayload,
  PluginErrorPayload,
  // System events
  GatewayStartedPayload,
  GatewayShuttingDownPayload,
  ConfigReloadedPayload,
  CronExecutedPayload,
  // Security events
  SecurityApprovalRequestedPayload,
  SecurityApprovalResolvedPayload,
  // Webhook events
  WebhookReceivedPayload,
} from "./catalog.js";

export { createEvent, isEventOfType } from "./catalog.js";

// Persistence
export type { EventStoreConfig } from "./store.js";
export { createEventStore, getDefaultEventStorePath } from "./store.js";
