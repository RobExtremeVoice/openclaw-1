import type { ProviderCapabilities } from "../providers/base/types.js";

/**
 * Get the maximum media size for Telegram, respecting user overrides.
 * Defaults to 2GB (Telegram's technical limit), but can be lowered via
 * TELEGRAM_MAX_MEDIA_MB env var for production safety.
 *
 * NOTE: This is evaluated once at module load time. Changing the env var
 * requires restarting the process to take effect.
 */
function getMaxMediaSize(): number {
  const defaultMax = 2 * 1024 * 1024 * 1024; // 2GB
  const envOverride = process.env.TELEGRAM_MAX_MEDIA_MB;

  if (envOverride) {
    const overrideMB = Number.parseInt(envOverride, 10);
    if (Number.isNaN(overrideMB) || overrideMB <= 0) {
      console.warn(
        `⚠️  Invalid TELEGRAM_MAX_MEDIA_MB="${envOverride}" (must be positive number). Using default 2048MB.`,
      );
      return defaultMax;
    }
    const overrideBytes = overrideMB * 1024 * 1024;
    if (overrideBytes > defaultMax) {
      console.warn(
        `⚠️  TELEGRAM_MAX_MEDIA_MB=${overrideMB} exceeds Telegram's 2048MB limit. Using 2048MB.`,
      );
      return defaultMax;
    }
    return overrideBytes;
  }

  return defaultMax;
}

/**
 * Telegram MTProto Provider Capabilities
 *
 * Declares what features the Telegram provider supports through the Provider interface.
 * Note: Telegram's API supports many features that are not yet exposed via our Provider interface.
 */
export const capabilities: ProviderCapabilities = {
  // Telegram MTProto doesn't provide reliable delivery/read receipt tracking
  // Messages are sent optimistically without guaranteed delivery confirmation
  supportsDeliveryReceipts: false,
  supportsReadReceipts: false, // Not exposed via Provider interface

  // Typing indicator is supported
  supportsTypingIndicator: true,

  // Advanced features not yet exposed via Provider interface
  // (These require peer context which the current architecture doesn't maintain)
  supportsReactions: false,
  supportsReplies: true, // Basic reply support via send()
  supportsEditing: false,
  supportsDeleting: false,

  // Telegram supports 2GB files with streaming downloads (no memory buffering).
  // Downloads stream to ~/.warelay/telegram-temp and are automatically cleaned up.
  // For safety, set TELEGRAM_MAX_MEDIA_MB to limit disk usage and download time.
  // Orphaned files cleaned on process restart (1 hour TTL).
  //
  // PRODUCTION TIP: Set TELEGRAM_MAX_MEDIA_MB to a lower value (e.g., 500) to limit
  // disk usage and download time. Example: TELEGRAM_MAX_MEDIA_MB=500 warelay relay
  maxMediaSize: getMaxMediaSize(),

  // Telegram supports virtually all file types
  supportedMediaTypes: ["*/*"],

  // Telegram allows initiating conversations with any user
  canInitiateConversation: true,
};
