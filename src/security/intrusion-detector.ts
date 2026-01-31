/**
 * Intrusion detection system
 * Pattern-based attack detection with configurable thresholds
 */

import { securityEventAggregator } from "./events/aggregator.js";
import { securityLogger } from "./events/logger.js";
import { SecurityActions, AttackPatterns, type SecurityEvent } from "./events/schema.js";
import { ipManager } from "./ip-manager.js";
import type { SecurityShieldConfig } from "../config/types.security.js";

export interface AttackPatternConfig {
  threshold: number;
  windowMs: number;
}

export interface IntrusionDetectionResult {
  detected: boolean;
  pattern?: string;
  count?: number;
  threshold?: number;
}

/**
 * Intrusion detector
 */
export class IntrusionDetector {
  private config: Required<NonNullable<SecurityShieldConfig["intrusionDetection"]>>;

  constructor(config?: SecurityShieldConfig["intrusionDetection"]) {
    this.config = {
      enabled: config?.enabled ?? true,
      patterns: {
        bruteForce: config?.patterns?.bruteForce ?? { threshold: 10, windowMs: 600_000 },
        ssrfBypass: config?.patterns?.ssrfBypass ?? { threshold: 3, windowMs: 300_000 },
        pathTraversal: config?.patterns?.pathTraversal ?? { threshold: 5, windowMs: 300_000 },
        portScanning: config?.patterns?.portScanning ?? { threshold: 20, windowMs: 10_000 },
      },
      anomalyDetection: config?.anomalyDetection ?? {
        enabled: false,
        learningPeriodMs: 86_400_000,
        sensitivityScore: 0.95,
      },
    };
  }

  /**
   * Check for brute force attack pattern
   */
  checkBruteForce(params: { ip: string; event: SecurityEvent }): IntrusionDetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    const { ip, event } = params;
    const pattern = this.config.patterns.bruteForce;
    if (!pattern || !pattern.threshold || !pattern.windowMs) {
      return { detected: false };
    }
    const key = `brute_force:${ip}`;

    const crossed = securityEventAggregator.trackEvent({
      key,
      event,
      threshold: pattern.threshold,
      windowMs: pattern.windowMs,
    });

    if (crossed) {
      const count = securityEventAggregator.getCount({ key, windowMs: pattern.windowMs });

      // Log intrusion
      securityLogger.logIntrusion({
        action: SecurityActions.BRUTE_FORCE_DETECTED,
        ip,
        resource: event.resource,
        attackPattern: AttackPatterns.BRUTE_FORCE,
        details: {
          failedAttempts: count,
          threshold: pattern.threshold,
          windowMs: pattern.windowMs,
        },
      });

      // Auto-block if configured
      this.autoBlock(ip, AttackPatterns.BRUTE_FORCE);

      return {
        detected: true,
        pattern: AttackPatterns.BRUTE_FORCE,
        count,
        threshold: pattern.threshold,
      };
    }

    return { detected: false };
  }

  /**
   * Check for SSRF bypass attempts
   */
  checkSsrfBypass(params: { ip: string; event: SecurityEvent }): IntrusionDetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    const { ip, event } = params;
    const pattern = this.config.patterns.ssrfBypass;
    if (!pattern || !pattern.threshold || !pattern.windowMs) {
      return { detected: false };
    }
    const key = `ssrf_bypass:${ip}`;

    const crossed = securityEventAggregator.trackEvent({
      key,
      event,
      threshold: pattern.threshold,
      windowMs: pattern.windowMs,
    });

    if (crossed) {
      const count = securityEventAggregator.getCount({ key, windowMs: pattern.windowMs });

      securityLogger.logIntrusion({
        action: SecurityActions.SSRF_BYPASS_ATTEMPT,
        ip,
        resource: event.resource,
        attackPattern: AttackPatterns.SSRF_BYPASS,
        details: {
          attempts: count,
          threshold: pattern.threshold,
        },
      });

      this.autoBlock(ip, AttackPatterns.SSRF_BYPASS);

      return {
        detected: true,
        pattern: AttackPatterns.SSRF_BYPASS,
        count,
        threshold: pattern.threshold,
      };
    }

    return { detected: false };
  }

  /**
   * Check for path traversal attempts
   */
  checkPathTraversal(params: { ip: string; event: SecurityEvent }): IntrusionDetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    const { ip, event } = params;
    const pattern = this.config.patterns.pathTraversal;
    if (!pattern || !pattern.threshold || !pattern.windowMs) {
      return { detected: false };
    }
    const key = `path_traversal:${ip}`;

    const crossed = securityEventAggregator.trackEvent({
      key,
      event,
      threshold: pattern.threshold,
      windowMs: pattern.windowMs,
    });

    if (crossed) {
      const count = securityEventAggregator.getCount({ key, windowMs: pattern.windowMs });

      securityLogger.logIntrusion({
        action: SecurityActions.PATH_TRAVERSAL_ATTEMPT,
        ip,
        resource: event.resource,
        attackPattern: AttackPatterns.PATH_TRAVERSAL,
        details: {
          attempts: count,
          threshold: pattern.threshold,
        },
      });

      this.autoBlock(ip, AttackPatterns.PATH_TRAVERSAL);

      return {
        detected: true,
        pattern: AttackPatterns.PATH_TRAVERSAL,
        count,
        threshold: pattern.threshold,
      };
    }

    return { detected: false };
  }

  /**
   * Check for port scanning
   */
  checkPortScanning(params: { ip: string; event: SecurityEvent }): IntrusionDetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    const { ip, event } = params;
    const pattern = this.config.patterns.portScanning;
    if (!pattern || !pattern.threshold || !pattern.windowMs) {
      return { detected: false };
    }
    const key = `port_scan:${ip}`;

    const crossed = securityEventAggregator.trackEvent({
      key,
      event,
      threshold: pattern.threshold,
      windowMs: pattern.windowMs,
    });

    if (crossed) {
      const count = securityEventAggregator.getCount({ key, windowMs: pattern.windowMs });

      securityLogger.logIntrusion({
        action: SecurityActions.PORT_SCANNING_DETECTED,
        ip,
        resource: event.resource,
        attackPattern: AttackPatterns.PORT_SCANNING,
        details: {
          connections: count,
          threshold: pattern.threshold,
          windowMs: pattern.windowMs,
        },
      });

      this.autoBlock(ip, AttackPatterns.PORT_SCANNING);

      return {
        detected: true,
        pattern: AttackPatterns.PORT_SCANNING,
        count,
        threshold: pattern.threshold,
      };
    }

    return { detected: false };
  }

  /**
   * Auto-block IP if configured
   */
  private autoBlock(ip: string, pattern: string): void {
    // Use default 24h block duration
    const durationMs = 86_400_000; // Will be configurable later

    ipManager.blockIp({
      ip,
      reason: pattern,
      durationMs,
      source: "auto",
    });
  }
}

/**
 * Singleton intrusion detector
 */
export const intrusionDetector = new IntrusionDetector();
