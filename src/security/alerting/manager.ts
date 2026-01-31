/**
 * Security alert manager
 * Coordinates alert triggers and channels
 */

import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { SecurityEvent } from "../events/schema.js";
import { SecurityActions, AttackPatterns } from "../events/schema.js";
import type { AlertChannelInterface, AlertingConfig, SecurityAlert } from "./types.js";
import { TelegramAlertChannel } from "./telegram.js";

const log = createSubsystemLogger("security:alerting");

export class AlertManager {
  private config: AlertingConfig;
  private channels: AlertChannelInterface[] = [];
  private lastAlertTime = new Map<string, number>();

  constructor(config: AlertingConfig) {
    this.config = config;
    this.initializeChannels();
  }

  private initializeChannels(): void {
    // Telegram channel
    if (this.config.channels?.telegram?.enabled) {
      const telegram = new TelegramAlertChannel({
        enabled: true,
        botToken: this.config.channels.telegram.botToken ?? "",
        chatId: this.config.channels.telegram.chatId ?? "",
      });
      if (telegram.isEnabled()) {
        this.channels.push(telegram);
        log.info("telegram alert channel enabled");
      } else {
        log.warn("telegram alert channel configured but missing botToken or chatId");
      }
    }

    if (this.channels.length === 0) {
      log.info("no alert channels enabled");
    }
  }

  /**
   * Check if alerting is enabled
   */
  isEnabled(): boolean {
    return (this.config.enabled ?? false) && this.channels.length > 0;
  }

  /**
   * Send an alert through all enabled channels
   */
  async sendAlert(alert: SecurityAlert): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    // Check throttling
    const throttleMs = this.getThrottleMs(alert.trigger);
    if (throttleMs > 0) {
      const lastTime = this.lastAlertTime.get(alert.trigger) || 0;
      const now = Date.now();
      if (now - lastTime < throttleMs) {
        log.debug(`alert throttled: trigger=${alert.trigger} throttle=${throttleMs}ms`);
        return;
      }
      this.lastAlertTime.set(alert.trigger, now);
    }

    // Send to all channels
    const results = await Promise.allSettled(this.channels.map((channel) => channel.send(alert)));

    // Log results
    let successCount = 0;
    let _failureCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        successCount++;
      } else {
        _failureCount++;
        const error = result.status === "fulfilled" ? result.value.error : String(result.reason);
        log.error(`alert send failed: ${error}`);
      }
    }

    if (successCount > 0) {
      log.info(
        `alert sent: trigger=${alert.trigger} severity=${alert.severity} channels=${successCount}`,
      );
    }
  }

  /**
   * Handle security event and trigger alerts if needed
   */
  async handleEvent(event: SecurityEvent): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    // Critical events
    if (event.severity === "critical" && this.config.triggers?.criticalEvents?.enabled) {
      await this.sendAlert({
        id: randomUUID(),
        severity: "critical",
        title: "Critical Security Event",
        message: `${event.action} on ${event.resource}`,
        timestamp: event.timestamp,
        details: {
          ip: event.ip,
          action: event.action,
          outcome: event.outcome,
          ...event.details,
        },
        trigger: "critical_event",
      });
    }

    // IP blocked
    if (event.action === SecurityActions.IP_BLOCKED && this.config.triggers?.ipBlocked?.enabled) {
      await this.sendAlert({
        id: randomUUID(),
        severity: "warn",
        title: "IP Address Blocked",
        message: `IP ${event.ip} has been blocked`,
        timestamp: event.timestamp,
        details: {
          reason: event.details.reason,
          expiresAt: event.details.expiresAt,
          source: event.details.source,
        },
        trigger: "ip_blocked",
      });
    }

    // Intrusion detected
    const criticalActions = [
      SecurityActions.BRUTE_FORCE_DETECTED,
      SecurityActions.SSRF_BYPASS_ATTEMPT,
      SecurityActions.PATH_TRAVERSAL_ATTEMPT,
      SecurityActions.PORT_SCANNING_DETECTED,
    ] as const;

    if (criticalActions.includes(event.action as (typeof criticalActions)[number])) {
      const pattern = event.attackPattern || "unknown";
      await this.sendAlert({
        id: randomUUID(),
        severity: "critical",
        title: "Intrusion Detected",
        message: `${this.getAttackName(pattern)} detected from IP ${event.ip}`,
        timestamp: event.timestamp,
        details: {
          pattern,
          ip: event.ip,
          attempts:
            event.details.failedAttempts || event.details.attempts || event.details.connections,
          threshold: event.details.threshold,
        },
        trigger: "intrusion_detected",
      });
    }
  }

  private getThrottleMs(trigger: string): number {
    switch (trigger) {
      case "critical_event":
        return this.config.triggers?.criticalEvents?.throttleMs || 0;
      case "ip_blocked":
        return this.config.triggers?.ipBlocked?.throttleMs || 0;
      case "intrusion_detected":
        return 300_000; // 5 minutes default
      default:
        return 0;
    }
  }

  private getAttackName(pattern: string): string {
    switch (pattern) {
      case AttackPatterns.BRUTE_FORCE:
        return "Brute force attack";
      case AttackPatterns.SSRF_BYPASS:
        return "SSRF bypass attempt";
      case AttackPatterns.PATH_TRAVERSAL:
        return "Path traversal attempt";
      case AttackPatterns.PORT_SCANNING:
        return "Port scanning";
      default:
        return "Security attack";
    }
  }
}

/**
 * Singleton alert manager
 */
let alertManager: AlertManager | null = null;

/**
 * Initialize alert manager with config
 */
export function initAlertManager(config: AlertingConfig): void {
  alertManager = new AlertManager(config);
}

/**
 * Get alert manager instance
 */
export function getAlertManager(): AlertManager | null {
  return alertManager;
}
