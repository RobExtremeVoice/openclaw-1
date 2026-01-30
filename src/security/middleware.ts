/**
 * Security shield HTTP middleware
 * Integrates security checks into Express/HTTP request pipeline
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getSecurityShield, SecurityShield, type SecurityContext } from "./shield.js";

/**
 * Create security context from HTTP request
 */
export function createSecurityContext(req: IncomingMessage): SecurityContext {
  return {
    ip: SecurityShield.extractIp(req),
    userAgent: req.headers["user-agent"],
    requestId: (req as any).requestId, // May be set by other middleware
  };
}

/**
 * Security middleware for HTTP requests
 * Checks IP blocklist and rate limits
 */
export function securityMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const shield = getSecurityShield();

  if (!shield.isEnabled()) {
    next();
    return;
  }

  const ctx = createSecurityContext(req);

  // Check if IP is blocked
  if (shield.isIpBlocked(ctx.ip)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain");
    res.end("Forbidden: IP blocked");
    return;
  }

  // Check request rate limit
  const requestCheck = shield.checkRequest(ctx);
  if (!requestCheck.allowed) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Retry-After",
      String(Math.ceil((requestCheck.rateLimitInfo?.retryAfterMs ?? 60000) / 1000)),
    );
    res.end("Too Many Requests");
    return;
  }

  next();
}

/**
 * Connection rate limit check
 * Call this when accepting new connections
 */
export function checkConnectionRateLimit(req: IncomingMessage): {
  allowed: boolean;
  reason?: string;
} {
  const shield = getSecurityShield();

  if (!shield.isEnabled()) {
    return { allowed: true };
  }

  const ctx = createSecurityContext(req);
  const result = shield.checkConnection(ctx);

  return {
    allowed: result.allowed,
    reason: result.reason,
  };
}

/**
 * Authentication rate limit check
 * Call this before processing authentication
 */
export function checkAuthRateLimit(
  req: IncomingMessage,
  deviceId?: string,
): {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
} {
  const shield = getSecurityShield();

  if (!shield.isEnabled()) {
    return { allowed: true };
  }

  const ctx = createSecurityContext(req);
  if (deviceId) {
    ctx.deviceId = deviceId;
  }

  const result = shield.checkAuthAttempt(ctx);

  return {
    allowed: result.allowed,
    reason: result.reason,
    retryAfterMs: result.rateLimitInfo?.retryAfterMs,
  };
}

/**
 * Log failed authentication
 * Call this after authentication fails
 */
export function logAuthFailure(req: IncomingMessage, reason: string, deviceId?: string): void {
  const shield = getSecurityShield();

  if (!shield.isEnabled()) {
    return;
  }

  const ctx = createSecurityContext(req);
  if (deviceId) {
    ctx.deviceId = deviceId;
  }

  shield.logAuthFailure(ctx, reason);
}

/**
 * Pairing rate limit check
 */
export function checkPairingRateLimit(params: { channel: string; sender: string; ip: string }): {
  allowed: boolean;
  reason?: string;
} {
  const shield = getSecurityShield();

  if (!shield.isEnabled()) {
    return { allowed: true };
  }

  const result = shield.checkPairingRequest(params);

  return {
    allowed: result.allowed,
    reason: result.reason,
  };
}

/**
 * Webhook rate limit check
 */
export function checkWebhookRateLimit(params: { token: string; path: string; ip: string }): {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
} {
  const shield = getSecurityShield();

  if (!shield.isEnabled()) {
    return { allowed: true };
  }

  const result = shield.checkWebhook(params);

  return {
    allowed: result.allowed,
    reason: result.reason,
    retryAfterMs: result.rateLimitInfo?.retryAfterMs,
  };
}
