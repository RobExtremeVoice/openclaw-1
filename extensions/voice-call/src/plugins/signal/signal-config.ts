/**
 * Signal Call Provider Plugin - Configuration
 *
 * Defines configuration schema, E2E encryption settings, and validation for Signal integration.
 * Signal's core strength is end-to-end encryption using the Double Ratchet Algorithm (Signal Protocol).
 * This configuration preserves encryption throughout the entire call lifecycle.
 */

import { z } from "zod";
import type { CallState } from "../../types.js";

// ============================================================================
// Signal Configuration Schema
// ============================================================================

/**
 * E2E encryption configuration for Signal calls
 * Signal enforces E2E encryption by default; these settings control verification
 */
export const SignalE2EEncryptionConfigSchema = z.object({
  /** Enable ZRTP verification (additional security layer) */
  enableZrtp: z.boolean().default(true),

  /** Require ZRTP authentication before answering calls */
  requireZrtpAuth: z.boolean().default(false),

  /** Store ZRTP SAS (Short Authentication String) for manual verification */
  storeZrtpSas: z.boolean().default(true),

  /** List of trusted device IDs (Signal's identity key infrastructure) */
  trustedDeviceIds: z.array(z.string()).default([]),

  /** Log encryption metadata (fingerprints, session keys) for verification */
  logEncryptionMetadata: z.boolean().default(false),
});

export type SignalE2EEncryptionConfig = z.infer<
  typeof SignalE2EEncryptionConfigSchema
>;

/**
 * Configuration for Signal group calls
 */
export const SignalGroupConfigSchema = z.object({
  /** Group ID (Signal UUID format) */
  groupId: z.string().uuid(),

  /** Group name for display */
  groupName: z.string().optional(),

  /** Maximum participants for group call */
  maxParticipants: z.number().int().min(2).max(100).default(16),

  /** Allow group members to be invited dynamically */
  allowDynamicInvite: z.boolean().default(true),

  /** Require all participants to accept before starting call */
  requireAcceptance: z.boolean().default(false),
});

export type SignalGroupConfig = z.infer<typeof SignalGroupConfigSchema>;

/**
 * Configuration for Signal call provider plugin
 */
export const SignalPluginConfigSchema = z.object({
  /** Signal phone number (E.164 format) */
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),

  /** Signal account password (used for authentication) */
  accountPassword: z.string().min(8),

  /** Path to signal-cli binary or "auto" to find in PATH */
  signalCliPath: z.string().default("signal-cli"),

  /** E2E encryption configuration */
  encryption: SignalE2EEncryptionConfigSchema.optional(),

  /** Group call configuration (optional, for group calls) */
  groupConfig: SignalGroupConfigSchema.optional(),

  /** Public URL for webhook verification (if using webhooks) */
  publicUrl: z.string().url().optional(),

  /** Path for webhook endpoint */
  webhookPath: z.string().default("/voice/signal/webhook"),

  /** Call timeout in seconds */
  callTimeoutSeconds: z.number().int().min(30).max(3600).default(600),

  /** Enable call recording (respects Signal privacy) */
  recordingEnabled: z.boolean().default(false),

  /** Preferred audio codec (opus or pcmu) */
  audioCodec: z.enum(["opus", "pcmu"]).default("opus"),

  /** Enable debug logging */
  debug: z.boolean().default(false),
});

export type SignalPluginConfig = z.infer<typeof SignalPluginConfigSchema>;

// ============================================================================
// Call Setup Options
// ============================================================================

/**
 * Options for setting up a Signal call
 */
export interface SignalCallSetupOptions {
  /** Enable recording (with consent indicators) */
  recordingEnabled?: boolean;

  /** Call timeout in seconds */
  callTimeoutSeconds?: number;

  /** Custom metadata to attach to call */
  metadata?: Record<string, string>;

  /** Participant name for display in group calls */
  participantName?: string;

  /** Enable VoIP mode (use internet connection) */
  voipMode?: boolean;

  /** Audio codec to use */
  audioCodec?: "opus" | "pcmu";
}

// ============================================================================
// Event Mapping Configuration
// ============================================================================

/**
 * Maps Signal call states to normalized call states
 * Signal uses: pending, ringing, answered, declined, failed, ended
 */
export const SIGNAL_STATUS_MAP: Record<string, CallState> = {
  pending: "initiated",
  ringing: "ringing",
  answered: "answered",
  active: "active",
  declined: "hangup-caller",
  failed: "failed",
  ended: "completed",
  cancelled: "hangup-bot",
};

/**
 * Signal call event types
 */
export const SIGNAL_EVENT_TYPES = {
  CALL_INCOMING: "incoming",
  CALL_OUTGOING: "outgoing",
  CALL_RINGING: "ringing",
  CALL_ANSWERED: "answered",
  CALL_DECLINED: "declined",
  CALL_FAILED: "failed",
  CALL_ENDED: "ended",
  PARTICIPANT_JOINED: "participant-joined",
  PARTICIPANT_LEFT: "participant-left",
  ENCRYPTION_VERIFIED: "encryption-verified",
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate Signal configuration
 */
export function validateSignalConfig(config: unknown): SignalPluginConfig {
  return SignalPluginConfigSchema.parse(config);
}

/**
 * Validate E.164 phone number format
 */
export function validatePhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Validate Signal UUID format (for group IDs)
 */
export function validateGroupId(groupId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    groupId,
  );
}

/**
 * Validate ZRTP SAS (Short Authentication String) format
 */
export function validateZrtpSas(sas: string): boolean {
  // ZRTP SAS is typically 4 words from a dictionary or hex string
  return /^[a-z]{4}\s[a-z]{4}\s[a-z]{4}\s[a-z]{4}$/i.test(sas) ||
    /^[0-9a-f]{16}$/i.test(sas);
}

// ============================================================================
// E2E Encryption Metadata
// ============================================================================

/**
 * Represents E2E encryption verification state for a call
 * Signal Protocol: every message is encrypted with a unique key derived from
 * the Double Ratchet Algorithm, ensuring perfect forward secrecy.
 */
export interface EncryptionMetadata {
  /** Signal device ID (identity key infrastructure) */
  deviceId: string;

  /** Fingerprint of the remote party's identity key (for verification) */
  remoteFingerprint: string;

  /** Local identity key fingerprint */
  localFingerprint: string;

  /** ZRTP Short Authentication String (optional additional verification) */
  zrtpSas?: string;

  /** Whether ZRTP has been verified by user */
  zrtpVerified?: boolean;

  /** Session key derivation chain (for forensics) */
  sessionKeyChain?: string[];

  /** Timestamp when encryption was established */
  encryptionStartedAt: number;

  /** Whether perfect forward secrecy is active */
  perfectForwardSecrecy: boolean;
}

/**
 * Extract encryption metadata from Signal call
 * CRITICAL: This preserves encryption guarantees while providing verification proof
 */
export function extractEncryptionMetadata(
  deviceId: string,
  remoteFingerprint: string,
  localFingerprint: string,
  zrtpSas?: string,
): EncryptionMetadata {
  return {
    deviceId,
    remoteFingerprint,
    localFingerprint,
    zrtpSas,
    zrtpVerified: false, // User must verify ZRTP manually if required
    encryptionStartedAt: Date.now(),
    perfectForwardSecrecy: true, // Signal Protocol guarantees this
  };
}

/**
 * Verify encryption metadata (compare fingerprints)
 * Returns true if fingerprints are trusted
 */
export function verifyEncryptionMetadata(
  metadata: EncryptionMetadata,
  trustedFingerprints: string[] = [],
): boolean {
  // Check if remote fingerprint is in trusted list
  return trustedFingerprints.includes(metadata.remoteFingerprint);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate Signal call connection string (for debugging/logging)
 */
export function generateCallConnectionString(
  from: string,
  to: string,
  callId: string,
): string {
  return `signal://${from}-->${to}#${callId}`;
}

/**
 * Parse Signal error code to user-friendly message
 */
export function parseSignalErrorCode(
  errorCode: string,
): { message: string; retryable: boolean } {
  const errorMap: Record<
    string,
    { message: string; retryable: boolean }
  > = {
    NETWORK_ERROR: {
      message: "Network connection failed",
      retryable: true,
    },
    INVALID_PHONE: {
      message: "Invalid phone number format",
      retryable: false,
    },
    NOT_REGISTERED: {
      message: "Phone number not registered with Signal",
      retryable: false,
    },
    CALL_DECLINED: {
      message: "Call was declined",
      retryable: false,
    },
    ENCRYPTION_FAILURE: {
      message: "Encryption verification failed",
      retryable: true,
    },
    TIMEOUT: {
      message: "Call timed out",
      retryable: true,
    },
  };

  return (
    errorMap[errorCode] || {
      message: `Signal error: ${errorCode}`,
      retryable: true,
    }
  );
}
