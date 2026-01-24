import type { MsgContext } from "../auto-reply/templating.js";
import type { McpExtractedContent } from "./media/types.js";

type SyntheticContextParams = {
  body: string;
  sessionKey: string;
  senderId: string;
  senderName?: string;
  // Media fields
  mediaPaths?: string[];
  /** MIME types corresponding to mediaPaths (parallel arrays) */
  mediaMimeTypes?: string[];
  mediaPlaceholders?: string[];
  /** Extracted content from files (PDF text, rendered images) */
  extractedContent?: McpExtractedContent[];
};

/**
 * Builds a synthetic MsgContext for MCP requests.
 *
 * Field mapping (actual MsgContext fields from src/auto-reply/templating.ts):
 * - Body: Main message content
 * - RawBody / CommandBody / BodyForCommands: Used for command detection
 * - BodyForAgent: Agent prompt body (may include envelope/history)
 * - SessionKey: Session identifier for conversation continuity
 * - From / SenderId / SenderName / SenderUsername: Sender identification
 * - MessageSid: Provider-specific message id
 * - Provider / Surface / AccountId: Channel and account identification
 * - WasMentioned: Whether the bot was mentioned
 * - CommandAuthorized: Whether commands are allowed
 * - CommandSource: "text" or "native"
 *
 * Now supports media attachments which are passed to the media
 * understanding pipeline for processing.
 *
 * Important: All MsgContext media fields are populated:
 * - MediaPath/MediaPaths: Local filesystem paths to media files
 * - MediaUrl/MediaUrls: For MCP, these are file:// URLs pointing to the same paths
 * - MediaType/MediaTypes: MIME types for each media file
 *
 * Note: OriginatingChannel is intentionally NOT set because MCP returns
 * responses in-band (synchronously) rather than routing to external channels.
 */
export function buildSyntheticContext(params: SyntheticContextParams): MsgContext {
  const messageSid = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Prepend media placeholders to body if present
  // This follows the convention used by other channels (Telegram, Discord, etc.)
  const bodyWithPlaceholders = params.mediaPlaceholders?.length
    ? [...params.mediaPlaceholders, params.body].join(" ")
    : params.body;

  // Build BodyForAgent with extracted content (PDF text, etc.)
  // This ensures the model sees the actual file content, not just placeholders
  const bodyForAgent = buildBodyForAgentWithExtractedContent(
    bodyWithPlaceholders,
    params.extractedContent,
  );

  // Convert local paths to file:// URLs for MediaUrl/MediaUrls
  // This maintains the semantic distinction: MediaUrl = URL, MediaPath = filesystem path
  const mediaUrls = params.mediaPaths?.map((p) => `file://${p}`) ?? [];

  return {
    // Core message content (use actual field names from MsgContext)
    Body: bodyWithPlaceholders,
    RawBody: bodyWithPlaceholders,
    CommandBody: params.body, // Keep original for command parsing
    BodyForCommands: params.body,
    BodyForAgent: bodyForAgent,

    // Session/routing
    SessionKey: params.sessionKey,

    // Provider identification
    // "mcp" is not a routable channel - responses are returned in-band
    Provider: "mcp",
    Surface: "mcp",
    AccountId: "mcp",

    // Sender info
    From: params.senderId,
    SenderId: params.senderId,
    SenderName: params.senderName ?? "MCP Client",
    SenderUsername: params.senderId,

    // Message metadata
    MessageSid: messageSid,

    // Mention flag - treat MCP requests as direct mentions
    WasMentioned: true,

    // Command handling (allow all commands for MCP)
    CommandAuthorized: true,
    CommandSource: "native",

    // Media - all fields populated for downstream compatibility
    MediaUrl: mediaUrls[0],
    MediaUrls: mediaUrls,
    MediaPath: params.mediaPaths?.[0],
    MediaPaths: params.mediaPaths ?? [],
    MediaType: params.mediaMimeTypes?.[0],
    MediaTypes: params.mediaMimeTypes ?? [],

    // Threading (none for MCP)
    ReplyToId: undefined,
    MessageThreadId: undefined,

    // OriginatingChannel is intentionally omitted:
    // MCP responses are returned synchronously, not routed to external channels.
    // Setting an invalid channel here would cause routeReply() to fail.
  };
}

/**
 * Build BodyForAgent that includes extracted content from files.
 *
 * For PDFs and other extractable documents, this appends the extracted
 * text content so the model can see and reason about the actual content,
 * not just placeholders.
 *
 * Format:
 * ```
 * <media:document> What's in this PDF?
 *
 * --- Extracted content from report.pdf ---
 * [PDF text content here...]
 * --- End extracted content ---
 * ```
 */
function buildBodyForAgentWithExtractedContent(
  body: string,
  extractedContent?: McpExtractedContent[],
): string {
  if (!extractedContent || extractedContent.length === 0) {
    return body;
  }

  const contentSections: string[] = [];

  for (const content of extractedContent) {
    if (content.text && content.text.trim()) {
      contentSections.push(
        `--- Extracted content from ${content.filename} ---\n` +
          content.text.trim() +
          `\n--- End extracted content ---`,
      );
    }
    // Note: content.images (rendered PDF pages) are written to temp files
    // in processInboundFile() and included in MediaPaths via additionalPaths.
    // This ensures the media understanding pipeline can process scanned PDFs.
  }

  if (contentSections.length === 0) {
    return body;
  }

  return body + "\n\n" + contentSections.join("\n\n");
}
