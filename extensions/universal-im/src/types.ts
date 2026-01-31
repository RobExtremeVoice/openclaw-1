import type { BlockStreamingCoalesceConfig, DmPolicy, GroupPolicy } from "openclaw/plugin-sdk";

// ========================================
// Universal IM Core Message Types
// ========================================

export type UniversalTransportType = "webhook" | "websocket" | "polling";

export type UniversalConversationType = "direct" | "group" | "channel";

export type UniversalAttachmentKind = "image" | "audio" | "video" | "document" | "unknown";

export type UniversalAttachment = {
  kind: UniversalAttachmentKind;
  url?: string;
  path?: string;
  contentType?: string;
  fileName?: string;
  size?: number;
};

export type UniversalSender = {
  id: string;
  name?: string;
  username?: string;
  isBot?: boolean;
};

export type UniversalConversation = {
  type: UniversalConversationType;
  id: string;
  name?: string;
  threadId?: string;
  teamId?: string;
};

export type UniversalMessageBody = {
  text?: string;
  raw: unknown;
  mentions?: string[];
  attachments?: UniversalAttachment[];
};

/**
 * The normalized inbound message structure.
 * All IM providers must translate their raw events into this format.
 */
export type UniversalInboundMessage = {
  /** Provider ID (e.g., "slack", "discord", "custom") */
  provider: string;
  /** Transport type used to receive this message */
  transport: UniversalTransportType;
  /** Unique message ID */
  messageId: string;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Sender information */
  sender: UniversalSender;
  /** Conversation context */
  conversation: UniversalConversation;
  /** Message body and attachments */
  body: UniversalMessageBody;
  /** Provider-specific metadata */
  meta: Record<string, unknown>;
};

/**
 * Outbound message payload built by providers.
 */
export type UniversalOutboundPayload = {
  provider: string;
  to: string;
  text?: string;
  mediaUrl?: string;
  replyToId?: string;
  threadId?: string;
  meta?: Record<string, unknown>;
};

// ========================================
// Provider Extension Types
// ========================================

export type ProviderParseContext = {
  accountId: string;
  config: UniversalImAccountConfig;
  transport: UniversalTransportType;
};

export type ProviderOutboundContext = {
  accountId: string;
  config: UniversalImAccountConfig;
};

/**
 * Provider extension interface.
 * Providers translate raw events to/from UniversalInboundMessage.
 */
export type UniversalProvider = {
  id: string;
  label?: string;
  /**
   * Parse a raw inbound event into a UniversalInboundMessage.
   * Return null if the event should be ignored.
   */
  parseInbound(event: unknown, ctx: ProviderParseContext): UniversalInboundMessage | null;
  /**
   * Build a provider-specific outbound payload from a universal outbound request.
   */
  buildOutbound(msg: UniversalOutboundPayload, ctx: ProviderOutboundContext): unknown;
  /**
   * Optional: Validate provider-specific configuration.
   */
  validateConfig?(config: UniversalImAccountConfig): string | null;
};

// ========================================
// Transport Extension Types
// ========================================

export type TransportStartContext = {
  accountId: string;
  config: UniversalImAccountConfig;
  abortSignal: AbortSignal;
  onMessage: (rawEvent: unknown) => void;
  onError: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: (reason?: string) => void;
};

/**
 * Transport extension interface.
 * Transports handle the connection layer (webhook, websocket, polling).
 */
export type UniversalTransport = {
  type: UniversalTransportType;
  label?: string;
  /**
   * Start the transport. Called when the channel starts.
   * Should call onMessage(rawEvent) for each incoming event.
   */
  start(ctx: TransportStartContext): Promise<void>;
  /**
   * Optional: Stop the transport gracefully.
   */
  stop?(): Promise<void>;
};

// ========================================
// Pipeline Hook Types
// ========================================

export type InboundHookContext = {
  accountId: string;
  config: UniversalImAccountConfig;
  provider: string;
  transport: UniversalTransportType;
};

/**
 * Inbound pipeline hook.
 * Can observe or mutate message metadata, but cannot replace the message.
 */
export type InboundHook = {
  id: string;
  /**
   * Called after message normalization.
   * Can mutate msg.meta or msg.body.text, but not replace the message.
   */
  afterNormalize?(msg: UniversalInboundMessage, ctx: InboundHookContext): void;
  /**
   * Called before routing.
   * Can add routing hints to meta.
   */
  beforeRouting?(msg: UniversalInboundMessage, ctx: InboundHookContext): void;
};

export type OutboundHookContext = {
  accountId: string;
  config: UniversalImAccountConfig;
  provider: string;
};

/**
 * Outbound pipeline hook.
 * Can observe or mutate outbound payload metadata.
 */
export type OutboundHook = {
  id: string;
  /**
   * Called before building provider-specific payload.
   * Can mutate meta or text.
   */
  beforeBuild?(payload: UniversalOutboundPayload, ctx: OutboundHookContext): void;
  /**
   * Called after sending.
   * For observability/logging purposes.
   */
  afterSend?(payload: UniversalOutboundPayload, result: unknown, ctx: OutboundHookContext): void;
};

// ========================================
// Configuration Types
// ========================================

export type UniversalImAccountConfig = {
  /** Optional display name for this account. */
  name?: string;
  /** If false, do not start this account. Default: true. */
  enabled?: boolean;
  /** Provider ID to use (default: "custom"). */
  provider?: string;
  /** Transport type (default: "webhook"). */
  transport?: UniversalTransportType;
  /** Webhook configuration. */
  webhook?: {
    /** Path for incoming webhooks (e.g., "/universal-im/webhook"). */
    path?: string;
    /** Secret for webhook signature verification. */
    secret?: string;
  };
  /** WebSocket configuration. */
  websocket?: {
    /** WebSocket URL to connect to. */
    url?: string;
    /** Reconnect interval in ms (default: 5000). */
    reconnectMs?: number;
  };
  /** Polling configuration. */
  polling?: {
    /** URL to poll for messages. */
    url?: string;
    /** Polling interval in ms (default: 5000). */
    intervalMs?: number;
  };
  /** Outbound API configuration. */
  outbound?: {
    /** URL to send outbound messages to. */
    url?: string;
    /** Authorization header value. */
    authHeader?: string;
  };
  /** Direct message policy (pairing/allowlist/open/disabled). */
  dmPolicy?: DmPolicy;
  /** Allowlist for direct messages. */
  allowFrom?: Array<string | number>;
  /** Allowlist for group messages. */
  groupAllowFrom?: Array<string | number>;
  /** Group message policy (allowlist/open/disabled). */
  groupPolicy?: GroupPolicy;
  /** Outbound text chunk size (chars). Default: 4000. */
  textChunkLimit?: number;
  /** Chunking mode: "length" (default) or "newline". */
  chunkMode?: "length" | "newline";
  /** Disable block streaming for this account. */
  blockStreaming?: boolean;
  /** Merge streamed block replies before sending. */
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
  /** Provider-specific configuration. */
  providerConfig?: Record<string, unknown>;
};

export type UniversalImConfig = {
  /** Optional per-account configuration (multi-account). */
  accounts?: Record<string, UniversalImAccountConfig>;
} & UniversalImAccountConfig;
