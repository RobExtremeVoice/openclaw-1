/**
 * Signal Call Provider Plugin - Webhook Handler
 *
 * Handles Signal inbound call webhooks, verifies signatures, parses events,
 * and maintains encryption verification state.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookContext, WebhookVerificationResult } from "../../types.js";

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify Signal webhook signature using HMAC-SHA256
 *
 * Signal sends webhooks with HMAC authentication:
 * - X-Signal-Body: Base64-encoded request body
 * - X-Signal-Signature: HMAC-SHA256 signature
 *
 * The signature is computed as:
 * HMAC-SHA256(accountPassword, requestBody)
 */
export function verifySignalProviderWebhook(
  ctx: WebhookContext,
  accountPassword: string,
  debug: boolean = false,
): WebhookVerificationResult {
  try {
    // Get signature from headers (Signal uses X-Signal-Signature)
    const signature = Array.isArray(ctx.headers["x-signal-signature"])
      ? ctx.headers["x-signal-signature"][0]
      : ctx.headers["x-signal-signature"];

    const bodyHeader = Array.isArray(ctx.headers["x-signal-body"])
      ? ctx.headers["x-signal-body"][0]
      : ctx.headers["x-signal-body"];

    if (!signature) {
      if (debug) {
        console.log("No X-Signal-Signature header found");
      }
      return {
        ok: false,
        reason: "Missing X-Signal-Signature header",
      };
    }

    if (!bodyHeader) {
      if (debug) {
        console.log("No X-Signal-Body header found");
      }
      return {
        ok: false,
        reason: "Missing X-Signal-Body header",
      };
    }

    // Get request body
    const body =
      typeof ctx.body === "string" ? ctx.body : JSON.stringify(ctx.body);

    if (debug) {
      console.log("Verifying webhook signature", {
        signature,
        bodyLength: body.length,
      });
    }

    // Compute expected signature
    const hmac = createHmac("sha256", accountPassword);
    hmac.update(body);
    const expectedSignature = hmac.digest("hex");

    if (debug) {
      console.log("Signature comparison", {
        expected: expectedSignature.slice(0, 16) + "...",
        actual: signature.slice(0, 16) + "...",
      });
    }

    // Use timing-safe comparison to prevent timing attacks
    try {
      const expectedBuffer = Buffer.from(expectedSignature, "hex");
      const actualBuffer = Buffer.from(signature, "hex");

      if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
        return {
          ok: false,
          reason: "Signature verification failed",
        };
      }
    } catch (error) {
      // Buffer length mismatch
      return {
        ok: false,
        reason: "Signature format invalid",
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Verification error: ${error}`,
    };
  }
}

// ============================================================================
// Webhook Payload Parsing
// ============================================================================

/**
 * Represents a Signal webhook payload
 */
export interface SignalWebhookPayload {
  type:
    | "incomingCall"
    | "callStateChanged"
    | "encryptionVerificationRequired"
    | "participantJoined"
    | "participantLeft";
  callId: string;
  from?: string;
  to?: string;
  timestamp: number;
  isGroupCall?: boolean;
  groupId?: string;
  deviceId?: string;
  remoteFingerprint?: string;
  localFingerprint?: string;
  zrtpSas?: string;
  newState?: string;
  participantNumber?: string;
  participantName?: string;
}

/**
 * Parse Signal webhook payload
 */
export function parseSignalWebhookPayload(body: string): SignalWebhookPayload {
  try {
    const payload = JSON.parse(body) as SignalWebhookPayload;

    // Validate required fields
    if (!payload.type || !payload.callId) {
      throw new Error("Missing required fields: type, callId");
    }

    return payload;
  } catch (error) {
    throw new Error(
      `Failed to parse Signal webhook payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ============================================================================
// Event State Tracking
// ============================================================================

/**
 * Tracks Signal webhook event processing state
 * Prevents duplicate processing of same event
 */
export class SignalWebhookStateTracker {
  private processedEventIds: Set<string> = new Set();
  private maxTrackedEvents: number = 1000;

  /**
   * Check if event has already been processed
   */
  isProcessed(eventId: string): boolean {
    return this.processedEventIds.has(eventId);
  }

  /**
   * Mark event as processed
   */
  markProcessed(eventId: string): void {
    this.processedEventIds.add(eventId);

    // Prevent memory growth - remove oldest entries if we exceed max
    if (this.processedEventIds.size > this.maxTrackedEvents) {
      const firstEntries = Array.from(this.processedEventIds).slice(0, 100);
      firstEntries.forEach((id) => this.processedEventIds.delete(id));
    }
  }

  /**
   * Clear all tracked events (for testing)
   */
  clear(): void {
    this.processedEventIds.clear();
  }

  /**
   * Get number of tracked events
   */
  size(): number {
    return this.processedEventIds.size;
  }
}

// ============================================================================
// Encryption Verification
// ============================================================================

/**
 * Represents Signal encryption verification state
 */
export interface EncryptionVerificationState {
  callId: string;
  deviceId: string;
  remoteFingerprint: string;
  localFingerprint: string;
  zrtpSas?: string;
  zrtpVerified: boolean;
  verifiedAt?: number;
  trustedFingerprints: Set<string>;
}

/**
 * Manager for encryption verification state during calls
 */
export class SignalEncryptionVerifier {
  private verificationState = new Map<string, EncryptionVerificationState>();
  private trustedFingerprints: Set<string>;

  constructor(trustedFingerprints: string[] = []) {
    this.trustedFingerprints = new Set(trustedFingerprints);
  }

  /**
   * Initialize verification state for a call
   * Called when call is initiated
   */
  initializeCall(
    callId: string,
    deviceId: string,
    remoteFingerprint: string,
    localFingerprint: string,
    zrtpSas?: string,
  ): void {
    this.verificationState.set(callId, {
      callId,
      deviceId,
      remoteFingerprint,
      localFingerprint,
      zrtpSas,
      zrtpVerified: this.trustedFingerprints.has(remoteFingerprint),
      trustedFingerprints: this.trustedFingerprints,
    });
  }

  /**
   * Mark ZRTP as verified by user (manual verification)
   */
  verifyZrtp(callId: string, sas: string): boolean {
    const state = this.verificationState.get(callId);
    if (!state) {
      return false;
    }

    // Validate ZRTP SAS matches
    if (state.zrtpSas !== sas) {
      return false;
    }

    state.zrtpVerified = true;
    state.verifiedAt = Date.now();
    return true;
  }

  /**
   * Add trusted fingerprint
   */
  addTrustedFingerprint(fingerprint: string): void {
    this.trustedFingerprints.add(fingerprint);

    // Update all verification states
    this.verificationState.forEach((state) => {
      if (state.remoteFingerprint === fingerprint) {
        state.zrtpVerified = true;
      }
    });
  }

  /**
   * Get verification state for call
   */
  getState(callId: string): EncryptionVerificationState | undefined {
    return this.verificationState.get(callId);
  }

  /**
   * Check if call encryption is verified
   */
  isEncryptionVerified(callId: string): boolean {
    const state = this.verificationState.get(callId);
    return state ? state.zrtpVerified : false;
  }

  /**
   * Clear verification state for call
   */
  clearCall(callId: string): void {
    this.verificationState.delete(callId);
  }

  /**
   * Get all unverified calls
   */
  getUnverifiedCalls(): EncryptionVerificationState[] {
    return Array.from(this.verificationState.values()).filter(
      (state) => !state.zrtpVerified,
    );
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Signal webhook error codes
 */
export enum SignalWebhookErrorCode {
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  INVALID_PAYLOAD = "INVALID_PAYLOAD",
  DUPLICATE_EVENT = "DUPLICATE_EVENT",
  ENCRYPTION_FAILED = "ENCRYPTION_FAILED",
  CALL_NOT_FOUND = "CALL_NOT_FOUND",
}

/**
 * Signal webhook error with code and details
 */
export class SignalWebhookError extends Error {
  constructor(
    message: string,
    readonly code: SignalWebhookErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SignalWebhookError";
  }
}

/**
 * Generate HTTP response for webhook event
 */
export function generateWebhookResponse(
  success: boolean,
  data?: Record<string, unknown>,
): { body: string; statusCode: number } {
  if (success) {
    return {
      body: JSON.stringify({ status: "ok", ...data }),
      statusCode: 200,
    };
  }

  return {
    body: JSON.stringify({ status: "error", ...data }),
    statusCode: 400,
  };
}
