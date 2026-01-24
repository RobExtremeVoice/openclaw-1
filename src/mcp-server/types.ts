export type McpServerOptions = {
  verbose?: boolean;
};

// Re-export media types for convenience
export type {
  McpImageInput,
  McpFileInput,
  McpContentBlock,
  McpMediaProcessResult,
  McpOutboundMediaResult,
  McpExtractedContent,
} from "./media/types.js";
