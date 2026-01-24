/**
 * MCP Media Helpers
 *
 * Shared utility functions for MCP media processing.
 */

import { ARCHIVE_MIMES } from "./constants.js";

// ═══════════════════════════════════════════════════════════════════════════
// BASE64 VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate base64 string before decoding.
 *
 * Buffer.from(data, "base64") doesn't throw for invalid base64 - it silently
 * produces garbage. This function validates the format before decoding.
 *
 * Performance: For large strings (>1MB), we sample characters rather than
 * checking every character, since a full regex test on 15MB+ strings can
 * cause performance issues.
 */
export function validateBase64(data: string): void {
  // Check length is valid (must be multiple of 4 after padding)
  if (data.length % 4 !== 0) {
    throw new Error("Invalid base64 encoding: incorrect padding");
  }

  // Empty string is valid base64
  if (data.length === 0) return;

  // Check padding is valid (only = at end, max 2)
  const paddingMatch = data.match(/=+$/);
  if (paddingMatch && paddingMatch[0].length > 2) {
    throw new Error("Invalid base64 encoding: too much padding");
  }

  // For small strings (<1MB), do full validation
  // For large strings, sample to avoid regex performance issues
  const SAMPLE_THRESHOLD = 1024 * 1024; // 1MB
  const SAMPLE_SIZE = 1000;

  if (data.length <= SAMPLE_THRESHOLD) {
    // Full validation for small strings
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw new Error("Invalid base64 encoding: contains invalid characters");
    }
  } else {
    // Sample-based validation for large strings
    // Check start, end, and random samples in the middle
    const samplesToCheck = [
      data.slice(0, SAMPLE_SIZE), // Start
      data.slice(-SAMPLE_SIZE - 2, -2), // End (before padding)
      data.slice(Math.floor(data.length / 2), Math.floor(data.length / 2) + SAMPLE_SIZE), // Middle
    ];

    for (const sample of samplesToCheck) {
      if (!/^[A-Za-z0-9+/]*$/.test(sample)) {
        throw new Error("Invalid base64 encoding: contains invalid characters");
      }
    }
  }
}

/**
 * Strip data URL prefix if present.
 *
 * Only base64-encoded data URLs are supported (must contain ";base64,").
 * Returns the raw base64 data without the data URL prefix.
 */
export function stripDataUrlPrefix(data: string): string {
  if (!data.startsWith("data:")) {
    return data;
  }

  if (!data.includes(";base64,")) {
    throw new Error(
      "Invalid data URL format: only base64 encoding is supported (missing ';base64,' indicator)",
    );
  }

  const match = data.match(/^data:[^,]+;base64,(.+)$/);
  if (match) {
    return match[1];
  }

  throw new Error("Invalid data URL format");
}

// ═══════════════════════════════════════════════════════════════════════════
// FILENAME SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sanitize filename by removing path traversal and special characters.
 */
export function sanitizeFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  // Remove path traversal and special characters
  return filename.replace(/[/\\:*?"<>|]/g, "_").slice(0, 255);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a media placeholder based on MIME type.
 */
export function resolveMediaPlaceholder(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "<media:image>";
  if (mimeType.startsWith("audio/")) return "<media:audio>";
  if (mimeType.startsWith("video/")) return "<media:video>";
  if (mimeType === "application/pdf") return "<media:document>";
  if (isArchiveMime(mimeType)) return "<media:archive>";
  return "<media:document>";
}

/**
 * Check if MIME type is an archive format.
 */
export function isArchiveMime(mimeType: string): boolean {
  return ARCHIVE_MIMES.has(mimeType);
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format byte size as human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT BLOCK SIZE ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

import type { McpContentBlock } from "./types.js";

/**
 * Estimate the size of a content block in bytes.
 */
export function estimateBlockSize(block: McpContentBlock): number {
  if (block.type === "text") {
    return Buffer.byteLength(block.text, "utf-8");
  }
  if (block.type === "image" || block.type === "audio") {
    // Base64 is ~4/3 the size of binary, so decode estimate
    return Math.floor(block.data.length * 0.75);
  }
  if (block.type === "resource") {
    if (block.resource.text) {
      return Buffer.byteLength(block.resource.text, "utf-8");
    }
    if (block.resource.blob) {
      return Math.floor(block.resource.blob.length * 0.75);
    }
  }
  return 0;
}
