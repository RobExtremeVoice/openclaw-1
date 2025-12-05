/**
 * Provider Interface Types for warelay
 *
 * Unified interfaces for all messaging providers (WhatsApp, Telegram).
 * All providers follow the same model:
 * - Personal account automation for 1-on-1 conversations
 * - `allowFrom` whitelist security model
 * - Unified message format
 */

// =============================================================================
// PROVIDER TYPES
// =============================================================================

/**
 * Supported provider kinds.
 */
export type ProviderKind = "twilio" | "web" | "telegram";

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Media attachment for messages.
 */
export interface ProviderMedia {
  /** Media type category */
  type: "image" | "video" | "audio" | "document" | "voice";

  /** Remote URL (for Twilio or download) */
  url?: string;

  /** Local buffer (for Web/Telegram direct send) */
  buffer?: Buffer;

  /** MIME type (e.g., "image/jpeg", "audio/ogg") */
  mimeType?: string;

  /** Original filename (for documents) */
  fileName?: string;

  /** File size in bytes */
  size?: number;

  /** Thumbnail buffer (for video/document previews) */
  thumbnail?: Buffer;
}

/**
 * Normalized inbound message from any provider.
 */
export interface ProviderMessage {
  /** Unique message identifier */
  id: string;

  /** Sender identifier */
  from: string;

  /** Recipient identifier */
  to: string;

  /** Message text body */
  body: string;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Sender's display name if available */
  displayName?: string;

  /** Attached media */
  media?: ProviderMedia[];

  /** Provider-specific raw payload */
  raw?: unknown;

  /** Which provider this message came from */
  provider: ProviderKind;
}

// =============================================================================
// SEND TYPES
// =============================================================================

/**
 * Options for sending a message.
 */
export interface SendOptions {
  /** Attach media to the message */
  media?: ProviderMedia[];

  /** Message ID to reply to (creates a threaded reply) */
  replyTo?: string;

  /** Send typing indicator before message */
  typing?: boolean;

  /** Provider-specific options */
  providerOptions?: {
    /** Twilio: Messaging Service SID override */
    twilioMessagingServiceSid?: string;
  };
}

/**
 * Result of sending a message.
 */
export interface SendResult {
  /** Message identifier from the provider */
  messageId: string;

  /** Immediate send status */
  status: "sent" | "queued" | "failed";

  /** Error message if status is "failed" */
  error?: string;

  /** Provider-specific metadata */
  providerMeta?: {
    sid?: string;
    accountSid?: string;
    userId?: number;
    jid?: string;
  };
}

/**
 * Delivery status for a sent message.
 */
export interface DeliveryStatus {
  /** Message identifier */
  messageId: string;

  /** Current delivery status */
  status: "sent" | "delivered" | "read" | "failed" | "unknown";

  /** Status update timestamp */
  timestamp?: number;

  /** Error details if failed */
  error?: string;

  /** Provider-specific status code */
  providerStatusCode?: string | number;
}

// =============================================================================
// PROVIDER CAPABILITIES
// =============================================================================

/**
 * Declares what features a provider supports.
 */
export interface ProviderCapabilities {
  supportsDeliveryReceipts: boolean;
  supportsReadReceipts: boolean;
  supportsTypingIndicator: boolean;
  supportsReactions: boolean;
  supportsReplies: boolean;
  supportsEditing: boolean;
  supportsDeleting: boolean;
  maxMediaSize: number;
  supportedMediaTypes: string[];
  canInitiateConversation: boolean;
}

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

/**
 * Base configuration shared by all providers.
 */
export interface BaseProviderConfig {
  verbose?: boolean;
  logger?: unknown;
}

/**
 * Twilio WhatsApp provider configuration.
 */
export interface TwilioProviderConfig extends BaseProviderConfig {
  kind: "wa-twilio";
  accountSid: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
  whatsappFrom: string;
  messagingServiceSid?: string;
}

/**
 * WhatsApp Web provider configuration.
 */
export interface WebProviderConfig extends BaseProviderConfig {
  kind: "wa-web";
  authDir?: string;
  printQr?: boolean;
  reconnect?: {
    initialMs?: number;
    maxMs?: number;
    factor?: number;
    jitter?: number;
    maxAttempts?: number;
  };
}

/**
 * Telegram MTProto provider configuration.
 */
export interface TelegramProviderConfig extends BaseProviderConfig {
  kind: "telegram";
  apiId: number;
  apiHash: string;
  sessionDir?: string;
  allowFrom?: string[];
}

/**
 * Union of all provider configurations.
 */
export type ProviderConfig =
  | TwilioProviderConfig
  | WebProviderConfig
  | TelegramProviderConfig;

// =============================================================================
// INBOUND MESSAGE HANDLER
// =============================================================================

/**
 * Handler function for inbound messages.
 */
export type MessageHandler = (message: ProviderMessage) => Promise<void>;

/**
 * Handler context with reply helpers.
 */
export interface MessageContext extends ProviderMessage {
  sendTyping(): Promise<void>;
  reply(text: string): Promise<SendResult>;
  replyWithMedia(text: string, media: ProviderMedia[]): Promise<SendResult>;
}

/**
 * Enhanced message handler with context.
 */
export type MessageContextHandler = (ctx: MessageContext) => Promise<void>;
