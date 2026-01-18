/**
 * Twilio Call Provider Plugin - Webhook Handling
 *
 * Handles Twilio webhook events, parses them, and converts to normalized format.
 * Supports StatusCallback, speech recognition, DTMF, and recording events.
 */

import { randomUUID, createHmac } from "node:crypto";
import type {
  CallId,
  NormalizedEvent,
  ProviderWebhookParseResult,
  WebhookContext,
  WebhookVerificationResult,
} from "../../types.js";
import {
  extractCallMetadata,
  isDtmfEvent,
  isCallStateEvent,
  isSpeechEvent,
  TWILIO_STATUS_MAP,
} from "./twilio-config.js";

// ============================================================================
// Webhook Event Types
// ============================================================================

interface TwilioWebhookPayload {
  CallSid: string;
  CallStatus: string;
  Direction: string;
  From: string;
  To: string;
  Timestamp?: string;
  SpeechResult?: string;
  Confidence?: string;
  Digits?: string;
  RecordingUrl?: string;
  RecordingStatus?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify Twilio webhook signature using HMAC-SHA1
 *
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioProviderWebhook(params: {
  ctx: WebhookContext;
  authToken: string;
  currentPublicUrl?: string | null;
  options?: {
    allowNgrokFreeTier?: boolean;
    skipVerification?: boolean;
  };
}): WebhookVerificationResult {
  const { ctx, authToken, currentPublicUrl, options = {} } = params;

  // Skip verification if explicitly disabled (dev only)
  if (options.skipVerification) {
    return { ok: true };
  }

  const twilioSignature = ctx.headers["x-twilio-signature"];
  if (!twilioSignature || typeof twilioSignature !== "string") {
    return {
      ok: false,
      reason: "Missing X-Twilio-Signature header",
    };
  }

  // Reconstruct the public URL for verification
  // Twilio signs based on the original request URL (before any proxies)
  const url = reconstructUrlForVerification(ctx, currentPublicUrl);

  // Build the string to sign: URL + body params (in order they appear)
  const stringToSign = url + ctx.rawBody;

  // Compute HMAC-SHA1 signature
  const hmac = createHmac("sha1", authToken)
    .update(stringToSign)
    .digest("base64");

  // Compare with provided signature
  if (hmac !== twilioSignature) {
    return {
      ok: false,
      reason: `Signature mismatch. Expected: ${hmac}, got: ${twilioSignature}`,
    };
  }

  return { ok: true };
}

/**
 * Reconstruct the full URL used by Twilio for signature verification
 * Handles reverse proxies (Tailscale, nginx, ngrok, etc.)
 */
function reconstructUrlForVerification(
  ctx: WebhookContext,
  currentPublicUrl?: string | null,
): string {
  // If we have an explicit public URL, use it as the base
  if (currentPublicUrl) {
    try {
      const publicUrl = new URL(currentPublicUrl);
      // Use the full URL but update path to match the webhook path
      publicUrl.pathname = new URL(ctx.url).pathname;
      return publicUrl.toString();
    } catch {
      // Fall through to default logic
    }
  }

  // Reconstruct from context headers (handles proxies)
  const forwardedProto =
    ctx.headers["x-forwarded-proto"] || ctx.headers["x-proto"] || "https";
  const forwardedHost =
    ctx.headers["x-forwarded-host"] || ctx.headers["host"] || "localhost";

  // Handle lists (AWS ALB/ELB sends multiple values)
  let proto = forwardedProto;
  let host = forwardedHost;

  if (Array.isArray(forwardedProto)) {
    proto = forwardedProto[0];
  }
  if (Array.isArray(forwardedHost)) {
    host = forwardedHost[0];
  }

  // Extract path from URL (not from Host header)
  const url = new URL(ctx.url, `${proto}://${host}`);
  return url.toString();
}

// ============================================================================
// Event Parsing
// ============================================================================

/**
 * Parse Twilio webhook payload into normalized events
 */
export function parseTwilioWebhookPayload(
  params: URLSearchParams,
  callIdOverride?: CallId,
): NormalizedEvent | null {
  // Extract common fields
  const callSid = params.get("CallSid") || "";
  const callStatus = params.get("CallStatus");
  const from = params.get("From");
  const to = params.get("To");
  const direction = params.get("Direction");

  const baseEvent = {
    id: randomUUID(),
    callId: callIdOverride || callSid,
    providerCallId: callSid,
    timestamp: Date.now(),
    direction: direction
      ? (direction as "inbound" | "outbound")
      : undefined,
    from: from || undefined,
    to: to || undefined,
  };

  // Handle speech result (from <Gather> with speech input)
  if (isSpeechEvent(params)) {
    const speechResult = params.get("SpeechResult") || "";
    const confidence = parseFloat(params.get("Confidence") || "0.9");

    return {
      ...baseEvent,
      type: "call.speech",
      transcript: speechResult,
      isFinal: true,
      confidence,
    };
  }

  // Handle DTMF input (from <Gather> with dtmf input)
  if (isDtmfEvent(params)) {
    const digits = params.get("Digits") || "";

    return {
      ...baseEvent,
      type: "call.dtmf",
      digits,
    };
  }

  // Handle call status changes
  if (isCallStateEvent(params)) {
    const mappedStatus = TWILIO_STATUS_MAP[callStatus];

    if (!mappedStatus) {
      return null;
    }

    // Call state change events
    if (
      callStatus === "initiated" ||
      callStatus === "ringing" ||
      callStatus === "in-progress"
    ) {
      return {
        ...baseEvent,
        type: `call.${callStatus === "in-progress" ? "answered" : callStatus}` as any,
      };
    }

    // Call completion events
    if (
      callStatus === "completed" ||
      callStatus === "busy" ||
      callStatus === "no-answer" ||
      callStatus === "failed"
    ) {
      return {
        ...baseEvent,
        type: "call.ended",
        reason: mappedStatus,
      };
    }

    // Hangup events
    if (callStatus === "canceled") {
      return {
        ...baseEvent,
        type: "call.ended",
        reason: "hangup-bot",
      };
    }
  }

  // Handle recording completion
  const recordingStatus = params.get("RecordingStatus");
  if (recordingStatus === "completed") {
    return {
      ...baseEvent,
      type: "call.ended",
      reason: "completed",
    };
  }

  return null;
}

// ============================================================================
// TwiML Response Generation
// ============================================================================

/**
 * Generate minimal TwiML response for webhook (keep call alive)
 */
export function generateMinimalTwimlResponse(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`;
}

/**
 * Generate TwiML pause response (for status callbacks)
 */
export function generatePauseTwimlResponse(seconds: number = 30): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="${Math.min(Math.max(seconds, 1), 60)}"/>
</Response>`;
}

/**
 * Generate TwiML response with streaming instruction
 */
export function generateStreamingTwimlResponse(
  streamUrl: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXmlAttr(streamUrl)}" />
  </Connect>
</Response>`;
}

// ============================================================================
// Recording Event Handling
// ============================================================================

/**
 * Extract recording metadata from webhook payload
 */
export function extractRecordingMetadata(params: URLSearchParams): {
  recordingUrl?: string;
  recordingStatus?: string;
  recordingDuration?: number;
  recordingChannels?: number;
} {
  return {
    recordingUrl: params.get("RecordingUrl") || undefined,
    recordingStatus: params.get("RecordingStatus") || undefined,
    recordingDuration: parseInt(
      params.get("RecordingDuration") || "0",
      10,
    ) || undefined,
    recordingChannels: parseInt(
      params.get("RecordingChannels") || "1",
      10,
    ) || undefined,
  };
}

// ============================================================================
// Media Stream Event Handling
// ============================================================================

/**
 * Parse media stream connected event
 */
export function parseMediaStreamConnected(params: URLSearchParams): {
  streamSid: string;
  callSid: string;
  startTime?: string;
} | null {
  const streamSid = params.get("StreamSid");
  const callSid = params.get("CallSid");

  if (!streamSid || !callSid) {
    return null;
  }

  return {
    streamSid,
    callSid,
    startTime: params.get("StartTime") || undefined,
  };
}

/**
 * Parse media stream event (audio mark, dtmf, etc.)
 */
export function parseMediaStreamEvent(params: URLSearchParams): {
  eventType: string;
  streamSid: string;
  sequenceNumber?: string;
  payload?: Record<string, string>;
} | null {
  const eventType = params.get("EventType");
  const streamSid = params.get("StreamSid");

  if (!eventType || !streamSid) {
    return null;
  }

  // Collect all other parameters as payload
  const payload: Record<string, string> = {};
  const entries = Array.from(params.entries());
  for (const [key, value] of entries) {
    if (!["EventType", "StreamSid"].includes(key) && value) {
      payload[key] = value;
    }
  }

  return {
    eventType,
    streamSid,
    sequenceNumber: params.get("SequenceNumber") || undefined,
    payload: Object.keys(payload).length > 0 ? payload : undefined,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape XML attribute value
 */
function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Validate Twilio webhook payload structure
 */
export function validateTwilioWebhookPayload(
  params: URLSearchParams,
): {
  valid: boolean;
  reason?: string;
} {
  const callSid = params.get("CallSid");
  if (!callSid) {
    return { valid: false, reason: "Missing CallSid" };
  }

  const callStatus = params.get("CallStatus");
  if (!callStatus) {
    return { valid: false, reason: "Missing CallStatus" };
  }

  return { valid: true };
}
