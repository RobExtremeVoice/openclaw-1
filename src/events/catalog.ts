/**
 * Event Catalog - Typed System Events
 *
 * All system events are defined here with their payloads.
 * This provides type safety and documentation for event consumers.
 *
 * Topic naming convention:
 * - domain.entity.action (e.g., "channel.message.received")
 * - Use past tense for events (received, completed, failed)
 * - Use present tense for commands (send, execute, start)
 */

import type { EventEnvelope, EventInput } from "./types.js";

// ============================================================================
// Channel Events
// ============================================================================

/**
 * A message was received from a channel
 */
export type ChannelMessageReceivedPayload = {
  channelId: string;
  accountId: string;
  messageId: string;
  chatId: string;
  chatType: "dm" | "group";
  senderId: string;
  senderName?: string;
  text?: string;
  hasMedia: boolean;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker";
  replyToMessageId?: string;
  mentions?: string[];
  timestamp: number;
};

/**
 * A message was sent to a channel
 */
export type ChannelMessageSentPayload = {
  channelId: string;
  accountId: string;
  messageId: string;
  chatId: string;
  text?: string;
  hasMedia: boolean;
  /** Duration in ms to send */
  sendDuration: number;
};

/**
 * Message delivery failed
 */
export type ChannelMessageFailedPayload = {
  channelId: string;
  accountId: string;
  chatId: string;
  error: string;
  retryable: boolean;
};

/**
 * Channel connection status changed
 */
export type ChannelStatusChangedPayload = {
  channelId: string;
  accountId: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  error?: string;
  previousStatus?: string;
};

/**
 * Channel pairing requested (e.g., QR code for WhatsApp)
 */
export type ChannelPairingRequestedPayload = {
  channelId: string;
  accountId: string;
  pairingData?: string; // QR code data, phone code, etc.
  expiresAt?: number;
};

// ============================================================================
// Agent Events
// ============================================================================

/**
 * Agent run started
 */
export type AgentRunStartedPayload = {
  runId: string;
  agentId: string;
  model: string;
  trigger: "message" | "cron" | "webhook" | "command" | "internal";
  inputTokens?: number;
};

/**
 * Agent produced a text chunk (streaming)
 */
export type AgentTextChunkPayload = {
  runId: string;
  agentId: string;
  chunk: string;
  /** Cumulative text so far */
  accumulated: string;
};

/**
 * Agent is executing a tool
 */
export type AgentToolExecutingPayload = {
  runId: string;
  agentId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
};

/**
 * Agent tool execution completed
 */
export type AgentToolCompletedPayload = {
  runId: string;
  agentId: string;
  toolName: string;
  success: boolean;
  duration: number;
  error?: string;
};

/**
 * Agent run completed
 */
export type AgentRunCompletedPayload = {
  runId: string;
  agentId: string;
  success: boolean;
  duration: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  error?: string;
};

// ============================================================================
// Workflow Events
// ============================================================================

/**
 * A workflow was triggered
 */
export type WorkflowStartedPayload = {
  workflowId: string;
  workflowName: string;
  trigger: {
    type: "channel" | "cron" | "webhook" | "manual";
    source?: string;
  };
  input?: Record<string, unknown>;
};

/**
 * Workflow state transition
 */
export type WorkflowStateChangedPayload = {
  workflowId: string;
  workflowName: string;
  previousState: string;
  newState: string;
  data?: Record<string, unknown>;
};

/**
 * Workflow completed
 */
export type WorkflowCompletedPayload = {
  workflowId: string;
  workflowName: string;
  success: boolean;
  duration: number;
  finalState: string;
  output?: Record<string, unknown>;
  error?: string;
};

// ============================================================================
// Plugin Events
// ============================================================================

/**
 * Plugin was loaded
 */
export type PluginLoadedPayload = {
  pluginId: string;
  pluginName: string;
  version: string;
  capabilities: string[];
};

/**
 * Plugin emitted a custom event
 */
export type PluginCustomEventPayload = {
  pluginId: string;
  eventName: string;
  data: unknown;
};

/**
 * Plugin encountered an error
 */
export type PluginErrorPayload = {
  pluginId: string;
  pluginName: string;
  error: string;
  context?: string;
};

// ============================================================================
// System Events
// ============================================================================

/**
 * Gateway started
 */
export type GatewayStartedPayload = {
  version: string;
  port: number;
  mode: "local" | "remote";
  channels: string[];
  plugins: string[];
};

/**
 * Gateway shutting down
 */
export type GatewayShuttingDownPayload = {
  reason: "signal" | "error" | "manual";
  gracePeriod: number;
};

/**
 * Configuration was reloaded
 */
export type ConfigReloadedPayload = {
  changedSections: string[];
  triggeredBy: "file-watch" | "api" | "manual";
};

/**
 * Cron job executed
 */
export type CronExecutedPayload = {
  jobId: string;
  jobName: string;
  success: boolean;
  duration: number;
  nextRun?: number;
  error?: string;
};

/**
 * Security approval requested
 */
export type SecurityApprovalRequestedPayload = {
  requestId: string;
  type: "exec" | "tool" | "action";
  description: string;
  requestedBy: string;
  expiresAt: number;
};

/**
 * Security approval resolved
 */
export type SecurityApprovalResolvedPayload = {
  requestId: string;
  approved: boolean;
  resolvedBy: string;
  reason?: string;
};

// ============================================================================
// Webhook Events
// ============================================================================

/**
 * External webhook received
 */
export type WebhookReceivedPayload = {
  webhookId: string;
  source: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
};

// ============================================================================
// Event Type Map
// ============================================================================

/**
 * Complete map of topics to their payloads
 */
export type EventTopicMap = {
  // Channel events
  "channel.message.received": ChannelMessageReceivedPayload;
  "channel.message.sent": ChannelMessageSentPayload;
  "channel.message.failed": ChannelMessageFailedPayload;
  "channel.status.changed": ChannelStatusChangedPayload;
  "channel.pairing.requested": ChannelPairingRequestedPayload;

  // Agent events
  "agent.run.started": AgentRunStartedPayload;
  "agent.text.chunk": AgentTextChunkPayload;
  "agent.tool.executing": AgentToolExecutingPayload;
  "agent.tool.completed": AgentToolCompletedPayload;
  "agent.run.completed": AgentRunCompletedPayload;

  // Workflow events
  "workflow.started": WorkflowStartedPayload;
  "workflow.state.changed": WorkflowStateChangedPayload;
  "workflow.completed": WorkflowCompletedPayload;

  // Plugin events
  "plugin.loaded": PluginLoadedPayload;
  "plugin.custom": PluginCustomEventPayload;
  "plugin.error": PluginErrorPayload;

  // System events
  "gateway.started": GatewayStartedPayload;
  "gateway.shutting_down": GatewayShuttingDownPayload;
  "config.reloaded": ConfigReloadedPayload;
  "cron.executed": CronExecutedPayload;

  // Security events
  "security.approval.requested": SecurityApprovalRequestedPayload;
  "security.approval.resolved": SecurityApprovalResolvedPayload;

  // Webhook events
  "webhook.received": WebhookReceivedPayload;
};

// ============================================================================
// Typed Event Helpers
// ============================================================================

/**
 * Create a typed event input for a known topic
 */
export function createEvent<T extends keyof EventTopicMap>(
  topic: T,
  payload: EventTopicMap[T],
  options?: {
    correlationId?: string;
    source?: string;
    sessionKey?: string;
  },
): EventInput<T, EventTopicMap[T]> {
  return {
    topic,
    payload,
    ...options,
  };
}

/**
 * Type guard to check if an event matches a topic
 */
export function isEventOfType<T extends keyof EventTopicMap>(
  event: EventEnvelope,
  topic: T,
): event is EventEnvelope<T, EventTopicMap[T]> {
  return event.topic === topic;
}

/**
 * Typed event envelope for a known topic
 */
export type TypedEvent<T extends keyof EventTopicMap> = EventEnvelope<T, EventTopicMap[T]>;
