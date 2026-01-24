/**
 * MCP Media Constants
 *
 * Shared constants, limits, and MIME type sets for MCP media processing.
 */

import {
  DEFAULT_INPUT_IMAGE_MIMES,
  DEFAULT_INPUT_FILE_MIMES,
  DEFAULT_INPUT_FILE_MAX_CHARS,
  DEFAULT_INPUT_MAX_REDIRECTS,
  DEFAULT_INPUT_TIMEOUT_MS,
  DEFAULT_INPUT_PDF_MAX_PAGES,
  DEFAULT_INPUT_PDF_MAX_PIXELS,
  DEFAULT_INPUT_PDF_MIN_TEXT_CHARS,
  normalizeMimeList,
  type InputImageLimits,
  type InputFileLimits,
} from "../../media/input-files.js";

// ═══════════════════════════════════════════════════════════════════════════
// SIZE LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/** Unified size limit for all inbound media (images, files, video, archives) - 15MB */
export const MCP_MEDIA_MAX_BYTES = 15 * 1024 * 1024;

/** Limits for inbound/outbound media counts and sizes */
export const MCP_MEDIA_LIMITS = {
  image: { maxCount: 10 },
  file: { maxCount: 5 },
  outbound: {
    maxBytesPerItem: 20 * 1024 * 1024, // 20MB per media item
    maxTotalBytes: 50 * 1024 * 1024, // 50MB total response
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SDK FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SDK Feature Flag: AudioContent support.
 *
 * Set to false if the MCP SDK version doesn't support native AudioContent blocks.
 * When false, audio files are returned as EmbeddedResource with blob instead.
 */
export const MCP_SDK_HAS_AUDIO_CONTENT = false;

// ═══════════════════════════════════════════════════════════════════════════
// MIME TYPE SETS
// ═══════════════════════════════════════════════════════════════════════════

/** Archive MIME types - explicit set for reliable detection */
export const ARCHIVE_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-compressed-tar",
]);

/** Audio MIME types supported for MCP file transfers */
export const AUDIO_MIMES = [
  "audio/mpeg", // .mp3
  "audio/wav", // .wav
  "audio/ogg", // .ogg, .oga
  "audio/mp4", // .m4a
  "audio/aac", // .aac
  "audio/flac", // .flac
  "audio/opus", // .opus
];

/** Video MIME types supported for MCP file transfers */
export const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSING LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/** Image processing limits - unified 15MB limit */
export const MCP_IMAGE_LIMITS: InputImageLimits = {
  allowUrl: false, // MCP uses base64 only
  allowedMimes: normalizeMimeList(DEFAULT_INPUT_IMAGE_MIMES, DEFAULT_INPUT_IMAGE_MIMES),
  maxBytes: MCP_MEDIA_MAX_BYTES,
  maxRedirects: DEFAULT_INPUT_MAX_REDIRECTS,
  timeoutMs: DEFAULT_INPUT_TIMEOUT_MS,
};

/** File processing limits - unified 15MB limit */
export const MCP_FILE_LIMITS: InputFileLimits = {
  allowUrl: false, // MCP uses base64 only
  allowedMimes: normalizeMimeList(
    [...DEFAULT_INPUT_FILE_MIMES, ...AUDIO_MIMES, ...VIDEO_MIMES, ...ARCHIVE_MIMES],
    DEFAULT_INPUT_FILE_MIMES,
  ),
  maxBytes: MCP_MEDIA_MAX_BYTES,
  maxChars: DEFAULT_INPUT_FILE_MAX_CHARS,
  maxRedirects: DEFAULT_INPUT_MAX_REDIRECTS,
  timeoutMs: DEFAULT_INPUT_TIMEOUT_MS,
  pdf: {
    maxPages: DEFAULT_INPUT_PDF_MAX_PAGES,
    maxPixels: DEFAULT_INPUT_PDF_MAX_PIXELS,
    minTextChars: DEFAULT_INPUT_PDF_MIN_TEXT_CHARS,
  },
};
