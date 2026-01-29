/**
 * Security Audit Event Logging
 *
 * Records security-relevant events for compliance and forensic analysis:
 * - Authentication attempts (success/failure)
 * - Authorization decisions
 * - Admin/elevated actions
 * - Configuration changes
 * - Rate limit violations
 *
 * Events are structured JSON for easy parsing by SIEM tools.
 * Supports multiple output targets: file, stdout, or custom handler.
 */

import { createWriteStream, type WriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveStateDir } from "../config/paths.js";

// Event Categories
export type AuditCategory =
  | "auth" // Authentication events
  | "authz" // Authorization events
  | "admin" // Administrative actions
  | "config" // Configuration changes
  | "rate_limit" // Rate limiting events
  | "channel" // Channel/messaging events
  | "session"; // Session lifecycle events

// Event outcomes
export type AuditOutcome = "success" | "failure" | "denied" | "error";

// Base audit event structure
export type AuditEvent = {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event category */
  category: AuditCategory;
  /** Specific action within the category */
  action: string;
  /** Outcome of the action */
  outcome: AuditOutcome;
  /** Actor who initiated the action (user ID, IP, session ID, etc.) */
  actor?: {
    type: "user" | "system" | "api" | "channel";
    id?: string;
    ip?: string;
    channel?: string;
  };
  /** Target of the action */
  target?: {
    type: string;
    id?: string;
    name?: string;
  };
  /** Additional context */
  details?: Record<string, unknown>;
  /** Error message if outcome is failure/error */
  error?: string;
  /** Request ID for correlation */
  requestId?: string;
};

// Specific event builders for type safety
export type AuthEventParams = {
  action: "login" | "logout" | "token_refresh" | "password_change" | "api_key_use";
  outcome: AuditOutcome;
  actorId?: string;
  actorIp?: string;
  method?: "token" | "password" | "tailscale" | "device";
  error?: string;
  requestId?: string;
};

export type AuthzEventParams = {
  action: "access_granted" | "access_denied" | "permission_check" | "role_assigned";
  outcome: AuditOutcome;
  actorId?: string;
  actorIp?: string;
  resource?: string;
  permission?: string;
  reason?: string;
  requestId?: string;
};

export type AdminEventParams = {
  action: "config_change" | "user_add" | "user_remove" | "channel_add" | "channel_remove" | "elevated_exec";
  outcome: AuditOutcome;
  actorId?: string;
  actorIp?: string;
  targetType?: string;
  targetId?: string;
  changes?: Record<string, unknown>;
  command?: string;
  error?: string;
  requestId?: string;
};

export type RateLimitEventParams = {
  action: "request_limited" | "channel_limited" | "auth_backoff";
  outcome: "denied";
  actorId?: string;
  actorIp?: string;
  channel?: string;
  retryAfterMs?: number;
  requestId?: string;
};

export type SessionEventParams = {
  action: "session_start" | "session_end" | "session_timeout";
  outcome: AuditOutcome;
  actorId?: string;
  sessionId?: string;
  channel?: string;
  durationMs?: number;
  requestId?: string;
};

// Configuration
export type AuditLogConfig = {
  /** Enable audit logging (default: false) */
  enabled?: boolean;
  /** Output target: 'file', 'stdout', or 'custom' (default: 'file') */
  target?: "file" | "stdout" | "custom";
  /** File path for file target (default: ~/.clawdbot/audit/audit.jsonl) */
  filePath?: string;
  /** Categories to log (default: all) */
  categories?: AuditCategory[];
  /** Minimum outcome severity to log (default: all) */
  minOutcome?: AuditOutcome;
  /** Include request IDs for correlation (default: true) */
  includeRequestIds?: boolean;
  /** Custom handler for 'custom' target */
  customHandler?: (event: AuditEvent) => void;
};

export type ResolvedAuditLogConfig = Required<Omit<AuditLogConfig, "customHandler">> & {
  customHandler?: (event: AuditEvent) => void;
};

const DEFAULT_AUDIT_CONFIG: ResolvedAuditLogConfig = {
  enabled: false,
  target: "file",
  filePath: "", // Resolved at runtime
  categories: ["auth", "authz", "admin", "config", "rate_limit", "channel", "session"],
  minOutcome: "success", // Log everything
  includeRequestIds: true,
};

function resolveDefaultAuditPath(): string {
  const stateDir = resolveStateDir();
  return join(stateDir, "audit", "audit.jsonl");
}

export function resolveAuditLogConfig(config?: Partial<AuditLogConfig>): ResolvedAuditLogConfig {
  const filePath = config?.filePath || resolveDefaultAuditPath();
  return {
    enabled: config?.enabled ?? DEFAULT_AUDIT_CONFIG.enabled,
    target: config?.target ?? DEFAULT_AUDIT_CONFIG.target,
    filePath,
    categories: config?.categories ?? DEFAULT_AUDIT_CONFIG.categories,
    minOutcome: config?.minOutcome ?? DEFAULT_AUDIT_CONFIG.minOutcome,
    includeRequestIds: config?.includeRequestIds ?? DEFAULT_AUDIT_CONFIG.includeRequestIds,
    customHandler: config?.customHandler,
  };
}

/**
 * Security audit logger for recording security-relevant events.
 * Events are written as newline-delimited JSON (JSONL) for easy parsing.
 */
export class AuditLogger {
  private config: ResolvedAuditLogConfig;
  private fileStream: WriteStream | null = null;
  private closed = false;

  constructor(config?: Partial<AuditLogConfig>) {
    this.config = resolveAuditLogConfig(config);

    if (this.config.enabled && this.config.target === "file") {
      this.initFileStream();
    }
  }

  private initFileStream(): void {
    const dir = dirname(this.config.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    this.fileStream = createWriteStream(this.config.filePath, {
      flags: "a", // Append mode
      mode: 0o600, // Owner read/write only
      encoding: "utf8",
    });

    this.fileStream.on("error", (err) => {
      console.error(`[audit] File write error: ${err.message}`);
    });
  }

  /**
   * Log a raw audit event.
   */
  log(event: Omit<AuditEvent, "timestamp">): void {
    if (!this.config.enabled || this.closed) return;

    // Check category filter
    if (!this.config.categories.includes(event.category)) return;

    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // Remove requestId if disabled
    if (!this.config.includeRequestIds) {
      delete fullEvent.requestId;
    }

    this.write(fullEvent);
  }

  /**
   * Log an authentication event.
   */
  logAuth(params: AuthEventParams): void {
    this.log({
      category: "auth",
      action: params.action,
      outcome: params.outcome,
      actor: params.actorId || params.actorIp
        ? { type: "user", id: params.actorId, ip: params.actorIp }
        : undefined,
      details: params.method ? { method: params.method } : undefined,
      error: params.error,
      requestId: params.requestId,
    });
  }

  /**
   * Log an authorization event.
   */
  logAuthz(params: AuthzEventParams): void {
    this.log({
      category: "authz",
      action: params.action,
      outcome: params.outcome,
      actor: params.actorId || params.actorIp
        ? { type: "user", id: params.actorId, ip: params.actorIp }
        : undefined,
      target: params.resource
        ? { type: "resource", name: params.resource }
        : undefined,
      details: {
        ...(params.permission && { permission: params.permission }),
        ...(params.reason && { reason: params.reason }),
      },
      requestId: params.requestId,
    });
  }

  /**
   * Log an administrative action.
   */
  logAdmin(params: AdminEventParams): void {
    this.log({
      category: "admin",
      action: params.action,
      outcome: params.outcome,
      actor: params.actorId || params.actorIp
        ? { type: "user", id: params.actorId, ip: params.actorIp }
        : undefined,
      target: params.targetType
        ? { type: params.targetType, id: params.targetId }
        : undefined,
      details: {
        ...(params.changes && { changes: params.changes }),
        ...(params.command && { command: params.command }),
      },
      error: params.error,
      requestId: params.requestId,
    });
  }

  /**
   * Log a rate limit event.
   */
  logRateLimit(params: RateLimitEventParams): void {
    this.log({
      category: "rate_limit",
      action: params.action,
      outcome: params.outcome,
      actor: params.actorId || params.actorIp
        ? { type: "user", id: params.actorId, ip: params.actorIp }
        : undefined,
      details: {
        ...(params.channel && { channel: params.channel }),
        ...(params.retryAfterMs && { retryAfterMs: params.retryAfterMs }),
      },
      requestId: params.requestId,
    });
  }

  /**
   * Log a session event.
   */
  logSession(params: SessionEventParams): void {
    this.log({
      category: "session",
      action: params.action,
      outcome: params.outcome,
      actor: params.actorId
        ? { type: "user", id: params.actorId }
        : undefined,
      target: params.sessionId
        ? { type: "session", id: params.sessionId }
        : undefined,
      details: {
        ...(params.channel && { channel: params.channel }),
        ...(params.durationMs && { durationMs: params.durationMs }),
      },
      requestId: params.requestId,
    });
  }

  /**
   * Get current configuration.
   */
  getConfig(): ResolvedAuditLogConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime.
   * Merges new config with existing config values.
   */
  updateConfig(config: Partial<AuditLogConfig>): void {
    const wasEnabled = this.config.enabled;
    const wasFile = this.config.target === "file";
    const oldPath = this.config.filePath;

    // Merge new config with existing config values
    this.config = {
      enabled: config.enabled ?? this.config.enabled,
      target: config.target ?? this.config.target,
      filePath: config.filePath ?? this.config.filePath,
      categories: config.categories ?? this.config.categories,
      minOutcome: config.minOutcome ?? this.config.minOutcome,
      includeRequestIds: config.includeRequestIds ?? this.config.includeRequestIds,
      customHandler: config.customHandler ?? this.config.customHandler,
    };

    // Handle file stream changes
    if (this.config.enabled && this.config.target === "file") {
      if (!wasEnabled || !wasFile || oldPath !== this.config.filePath) {
        this.closeFileStream();
        this.initFileStream();
      }
    } else {
      this.closeFileStream();
    }
  }

  /**
   * Close the logger and release resources.
   */
  close(): void {
    this.closed = true;
    this.closeFileStream();
  }

  private closeFileStream(): void {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  private write(event: AuditEvent): void {
    const line = JSON.stringify(event) + "\n";

    switch (this.config.target) {
      case "file":
        if (this.fileStream) {
          this.fileStream.write(line);
        }
        break;
      case "stdout":
        process.stdout.write(`[audit] ${line}`);
        break;
      case "custom":
        if (this.config.customHandler) {
          this.config.customHandler(event);
        }
        break;
    }
  }
}

// Singleton instance for global access
let globalAuditLogger: AuditLogger | null = null;

/**
 * Get or create the global audit logger instance.
 */
export function getAuditLogger(config?: Partial<AuditLogConfig>): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(config);
  }
  return globalAuditLogger;
}

/**
 * Initialize the global audit logger with configuration.
 * Call this early in application startup.
 */
export function initAuditLogger(config?: Partial<AuditLogConfig>): AuditLogger {
  if (globalAuditLogger) {
    globalAuditLogger.close();
  }
  globalAuditLogger = new AuditLogger(config);
  return globalAuditLogger;
}

/**
 * Close the global audit logger.
 * Call this during application shutdown.
 */
export function closeAuditLogger(): void {
  if (globalAuditLogger) {
    globalAuditLogger.close();
    globalAuditLogger = null;
  }
}
