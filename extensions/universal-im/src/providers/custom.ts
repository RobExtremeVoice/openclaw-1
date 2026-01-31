import type {
  ProviderOutboundContext,
  ProviderParseContext,
  UniversalInboundMessage,
  UniversalOutboundPayload,
  UniversalProvider,
} from "../types.js";

/**
 * Custom Provider - a flexible provider for arbitrary IM integrations.
 *
 * This provider accepts a standardized JSON format for inbound messages
 * and generates a simple JSON payload for outbound messages.
 *
 * Inbound message format (expected from webhook/websocket):
 * {
 *   "messageId": "unique-id",
 *   "timestamp": 1234567890000, // optional, defaults to now
 *   "sender": {
 *     "id": "user-123",
 *     "name": "John Doe", // optional
 *     "username": "johndoe", // optional
 *     "isBot": false // optional
 *   },
 *   "conversation": {
 *     "type": "direct" | "group" | "channel",
 *     "id": "conv-123",
 *     "name": "General", // optional
 *     "threadId": "thread-456" // optional
 *   },
 *   "text": "Hello world",
 *   "attachments": [ // optional
 *     {
 *       "kind": "image",
 *       "url": "https://...",
 *       "contentType": "image/png"
 *     }
 *   ],
 *   "mentions": ["user-456"], // optional
 *   "meta": {} // optional, provider-specific data
 * }
 */
export const customProvider: UniversalProvider = {
  id: "custom",
  label: "Custom",

  parseInbound(event: unknown, ctx: ProviderParseContext): UniversalInboundMessage | null {
    if (!event || typeof event !== "object") {
      return null;
    }

    const raw = event as Record<string, unknown>;

    // Validate required fields
    const senderId = extractString(raw.sender, "id");
    if (!senderId) {
      return null;
    }

    const conversationId = extractString(raw.conversation, "id");
    if (!conversationId) {
      return null;
    }

    // Extract message ID (required or generate)
    const messageId = String(raw.messageId ?? raw.id ?? `custom-${Date.now()}-${Math.random()}`);

    // Extract timestamp
    const timestamp =
      typeof raw.timestamp === "number"
        ? raw.timestamp
        : typeof raw.timestamp === "string"
          ? Date.parse(raw.timestamp) || Date.now()
          : Date.now();

    // Extract sender info
    const senderRaw = (raw.sender ?? {}) as Record<string, unknown>;
    const sender = {
      id: senderId,
      name: extractStringOrUndefined(senderRaw, "name"),
      username: extractStringOrUndefined(senderRaw, "username"),
      isBot: typeof senderRaw.isBot === "boolean" ? senderRaw.isBot : undefined,
    };

    // Extract conversation info
    const convRaw = (raw.conversation ?? {}) as Record<string, unknown>;
    const conversationType = extractConversationType(convRaw.type);
    const conversation = {
      type: conversationType,
      id: conversationId,
      name: extractStringOrUndefined(convRaw, "name"),
      threadId: extractStringOrUndefined(convRaw, "threadId"),
      teamId: extractStringOrUndefined(convRaw, "teamId"),
    };

    // Extract body
    const text = typeof raw.text === "string" ? raw.text : undefined;
    const mentions = Array.isArray(raw.mentions)
      ? raw.mentions.filter((m): m is string => typeof m === "string")
      : undefined;

    // Extract attachments
    const attachments = parseAttachments(raw.attachments);

    // Extract meta
    const meta =
      raw.meta && typeof raw.meta === "object" ? (raw.meta as Record<string, unknown>) : {};

    return {
      provider: "custom",
      transport: ctx.transport,
      messageId,
      timestamp,
      sender,
      conversation,
      body: {
        text,
        raw: event,
        mentions,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      meta,
    };
  },

  buildOutbound(msg: UniversalOutboundPayload, _ctx: ProviderOutboundContext): unknown {
    return {
      to: msg.to,
      text: msg.text,
      mediaUrl: msg.mediaUrl,
      replyToId: msg.replyToId,
      threadId: msg.threadId,
      ...msg.meta,
    };
  },
};

// Helper functions

function extractString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const value = (obj as Record<string, unknown>)[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function extractStringOrUndefined(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function extractConversationType(value: unknown): "direct" | "group" | "channel" {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "direct" || lower === "dm" || lower === "private") return "direct";
    if (lower === "group") return "group";
    if (lower === "channel") return "channel";
  }
  return "direct";
}

function parseAttachments(
  raw: unknown,
): Array<{
  kind: "image" | "audio" | "video" | "document" | "unknown";
  url?: string;
  path?: string;
  contentType?: string;
  fileName?: string;
  size?: number;
}> {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => item && typeof item === "object")
    .map((item) => ({
      kind: parseAttachmentKind(item.kind ?? item.type),
      url: typeof item.url === "string" ? item.url : undefined,
      path: typeof item.path === "string" ? item.path : undefined,
      contentType: typeof item.contentType === "string" ? item.contentType : undefined,
      fileName: typeof item.fileName === "string" ? item.fileName : undefined,
      size: typeof item.size === "number" ? item.size : undefined,
    }));
}

function parseAttachmentKind(
  value: unknown,
): "image" | "audio" | "video" | "document" | "unknown" {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "image" || lower === "photo") return "image";
    if (lower === "audio" || lower === "voice") return "audio";
    if (lower === "video") return "video";
    if (lower === "document" || lower === "file") return "document";
  }
  return "unknown";
}
