/**
 * MCP Media Module
 *
 * Provides bidirectional media transfer support for the MCP server.
 * All media is transferred as base64-encoded data (no URLs).
 */

// Re-export types
export type {
  McpImageInput,
  McpFileInput,
  McpMediaProcessResult,
  McpExtractedContent,
  McpContentBlock,
  McpOutboundMediaResult,
} from "./types.js";

// Re-export constants
export {
  MCP_MEDIA_MAX_BYTES,
  MCP_MEDIA_LIMITS,
  MCP_SDK_HAS_AUDIO_CONTENT,
  ARCHIVE_MIMES,
  AUDIO_MIMES,
  VIDEO_MIMES,
  MCP_IMAGE_LIMITS,
  MCP_FILE_LIMITS,
} from "./constants.js";

// Re-export helper functions
export {
  validateBase64,
  stripDataUrlPrefix,
  sanitizeFilename,
  resolveMediaPlaceholder,
  isArchiveMime,
  formatBytes,
  estimateBlockSize,
} from "./helpers.js";

// Re-export processing functions
export { processInboundMedia } from "./inbound.js";
export { processOutboundMedia, encodeMediaToContentBlock } from "./outbound.js";
