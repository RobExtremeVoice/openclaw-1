/**
 * Capabilities Tests
 *
 * Note: These tests verify the CURRENT capability values.
 * Testing TELEGRAM_MAX_MEDIA_MB env var requires subprocess tests
 * since capabilities are evaluated at module load time.
 */

import { describe, expect, it } from "vitest";
import { capabilities } from "./capabilities.js";

describe("capabilities", () => {
  it("has correct basic capabilities", () => {
    expect(capabilities.supportsDeliveryReceipts).toBe(false);
    expect(capabilities.supportsReadReceipts).toBe(false);
    expect(capabilities.supportsTypingIndicator).toBe(true);
    expect(capabilities.supportsReplies).toBe(true);
    expect(capabilities.canInitiateConversation).toBe(true);
    expect(capabilities.supportsReactions).toBe(false);
    expect(capabilities.supportsEditing).toBe(false);
    expect(capabilities.supportsDeleting).toBe(false);
  });

  it("has max media size set", () => {
    // Default is 2GB unless TELEGRAM_MAX_MEDIA_MB is set
    expect(capabilities.maxMediaSize).toBeGreaterThan(0);
    expect(capabilities.maxMediaSize).toBeLessThanOrEqual(
      2 * 1024 * 1024 * 1024,
    );
  });

  it("supports all media types", () => {
    expect(capabilities.supportedMediaTypes).toContain("*/*");
  });
});
