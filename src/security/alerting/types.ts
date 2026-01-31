/**
 * Security alerting types
 */

export type AlertSeverity = "info" | "warn" | "critical";

export interface SecurityAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: string; // ISO 8601
  details: Record<string, unknown>;
  trigger: string; // What triggered the alert
}

export interface AlertChannelConfig {
  enabled: boolean;
}

export interface AlertChannelInterface {
  /**
   * Send an alert through this channel
   */
  send(alert: SecurityAlert): Promise<{ ok: boolean; error?: string }>;

  /**
   * Check if this channel is enabled
   */
  isEnabled(): boolean;
}

export interface AlertTriggerConfig {
  enabled?: boolean;
  throttleMs?: number;
}

export interface AlertingConfig {
  enabled?: boolean;
  triggers?: {
    criticalEvents?: AlertTriggerConfig;
    failedAuthSpike?: AlertTriggerConfig & { threshold?: number; windowMs?: number };
    ipBlocked?: AlertTriggerConfig;
  };
  channels?: {
    telegram?: {
      enabled?: boolean;
      botToken?: string;
      chatId?: string;
    };
    webhook?: {
      enabled?: boolean;
      url?: string;
    };
    slack?: {
      enabled?: boolean;
      webhookUrl?: string;
    };
    email?: {
      enabled?: boolean;
      smtp?: {
        host?: string;
        port?: number;
        secure?: boolean;
        auth?: {
          user?: string;
          pass?: string;
        };
      };
      from?: string;
      to?: string[];
    };
  };
}
