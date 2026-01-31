/**
 * Telegram alert channel
 * Sends security alerts via Telegram Bot API
 */

import type { AlertChannelInterface, SecurityAlert } from "./types.js";

export interface TelegramChannelConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export class TelegramAlertChannel implements AlertChannelInterface {
  private config: TelegramChannelConfig;
  private apiUrl: string;

  constructor(config: TelegramChannelConfig) {
    this.config = config;
    this.apiUrl = `https://api.telegram.org/bot${config.botToken}`;
  }

  isEnabled(): boolean {
    return this.config.enabled && Boolean(this.config.botToken) && Boolean(this.config.chatId);
  }

  async send(alert: SecurityAlert): Promise<{ ok: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return { ok: false, error: "telegram_channel_not_enabled" };
    }

    try {
      const message = this.formatMessage(alert);
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: message,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          ok: false,
          error: `telegram_api_error: ${response.status} ${errorText}`,
        };
      }

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: `telegram_send_failed: ${String(err)}`,
      };
    }
  }

  private formatMessage(alert: SecurityAlert): string {
    const severityEmoji = this.getSeverityEmoji(alert.severity);
    const lines: string[] = [];

    // Header
    lines.push(`${severityEmoji} *${alert.severity.toUpperCase()}*: ${alert.title}`);
    lines.push("");

    // Message
    lines.push(alert.message);

    // Details (if any)
    const detailKeys = Object.keys(alert.details);
    if (detailKeys.length > 0) {
      lines.push("");
      lines.push("*Details:*");
      for (const key of detailKeys) {
        const value = alert.details[key];
        lines.push(`• ${key}: \`${String(value)}\``);
      }
    }

    // Footer
    lines.push("");
    lines.push(`_${new Date(alert.timestamp).toLocaleString()}_`);

    return lines.join("\n");
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case "critical":
        return "🚨";
      case "warn":
        return "⚠️";
      case "info":
        return "ℹ️";
      default:
        return "📢";
    }
  }
}
