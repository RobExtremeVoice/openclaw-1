# Security Alerting

Get real-time notifications when security events occur.

## Overview

The OpenClaw security alerting system sends notifications through multiple channels when critical security events are detected:

- Intrusion attempts (brute force, SSRF, port scanning)
- IP address blocks
- Failed authentication spikes
- Critical security events

## Supported Channels

- **Telegram** (recommended) - Instant push notifications
- **Webhook** - Generic HTTP POST to any endpoint
- **Slack** (planned)
- **Email** (planned)

## Telegram Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Save the **bot token** (format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. Get Your Chat ID

**Option A: Use @userinfobot**
1. Message [@userinfobot](https://t.me/userinfobot)
2. It will reply with your user ID (chat ID)

**Option B: Manual method**
1. Send a message to your bot
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for `"chat":{"id":123456789}` in the JSON response

### 3. Configure OpenClaw

Set environment variables:

```bash
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
export TELEGRAM_CHAT_ID="123456789"
```

Or configure directly in `~/.openclaw/config.json`:

```json
{
  "security": {
    "alerting": {
      "enabled": true,
      "channels": {
        "telegram": {
          "enabled": true,
          "botToken": "${TELEGRAM_BOT_TOKEN}",
          "chatId": "${TELEGRAM_CHAT_ID}"
        }
      }
    }
  }
}
```

### 4. Restart Gateway

```bash
openclaw gateway restart
```

### 5. Test Alerts

```bash
# Trigger a test by blocking an IP
openclaw blocklist add 192.0.2.1 --reason "test alert"

# You should receive a Telegram notification
```

## Alert Types

### 1. Intrusion Detected

Sent when an attack pattern is identified.

**Example Message:**
```
🚨 CRITICAL: Intrusion Detected

Brute force attack detected from IP 192.168.1.100

Details:
• pattern: brute_force
• ip: 192.168.1.100
• attempts: 10
• threshold: 10

2026-01-30 10:30:45 PM
```

**Triggers:**
- Brute force (10 failed auth in 10 min)
- SSRF bypass (3 attempts in 5 min)
- Path traversal (5 attempts in 5 min)
- Port scanning (20 connections in 10 sec)

### 2. IP Blocked

Sent when an IP is auto-blocked.

**Example Message:**
```
⚠️ WARN: IP Address Blocked

IP 192.168.1.100 has been blocked

Details:
• reason: brute_force
• expiresAt: 2026-01-31 10:30:45 PM
• source: auto

2026-01-30 10:30:45 PM
```

### 3. Critical Security Event

Sent for any security event with severity=critical.

**Example Message:**
```
🚨 CRITICAL: Critical Security Event

auth_failed on gateway_auth

Details:
• ip: 192.168.1.100
• action: auth_failed
• outcome: deny
• reason: token_mismatch

2026-01-30 10:30:45 PM
```

## Configuration

### Alert Triggers

Configure which events trigger alerts:

```json
{
  "security": {
    "alerting": {
      "enabled": true,
      "triggers": {
        "criticalEvents": {
          "enabled": true,
          "throttleMs": 300000
        },
        "ipBlocked": {
          "enabled": true,
          "throttleMs": 3600000
        },
        "failedAuthSpike": {
          "enabled": true,
          "threshold": 20,
          "windowMs": 600000,
          "throttleMs": 600000
        }
      }
    }
  }
}
```

### Throttling

Prevents alert spam by limiting frequency:

- **criticalEvents**: Max 1 alert per 5 minutes
- **ipBlocked**: Max 1 alert per hour (per IP)
- **failedAuthSpike**: Max 1 alert per 10 minutes
- **intrusionDetected**: Max 1 alert per 5 minutes

**Example:** If 3 brute force attacks are detected within 5 minutes, only 1 alert is sent.

### Disable Specific Alerts

```json
{
  "security": {
    "alerting": {
      "enabled": true,
      "triggers": {
        "criticalEvents": {
          "enabled": false
        },
        "ipBlocked": {
          "enabled": true
        }
      }
    }
  }
}
```

## Webhook Channel

Send alerts to any HTTP endpoint.

### Configuration

```json
{
  "security": {
    "alerting": {
      "enabled": true,
      "channels": {
        "webhook": {
          "enabled": true,
          "url": "https://hooks.example.com/security"
        }
      }
    }
  }
}
```

### Webhook Payload

Alerts are sent as JSON POST requests:

```json
{
  "id": "abc123...",
  "severity": "critical",
  "title": "Intrusion Detected",
  "message": "Brute force attack detected from IP 192.168.1.100",
  "timestamp": "2026-01-30T22:30:45.123Z",
  "details": {
    "pattern": "brute_force",
    "ip": "192.168.1.100",
    "attempts": 10,
    "threshold": 10
  },
  "trigger": "intrusion_detected"
}
```

### Headers

Add custom headers:

```json
{
  "security": {
    "alerting": {
      "channels": {
        "webhook": {
          "enabled": true,
          "url": "https://hooks.example.com/security",
          "headers": {
            "Authorization": "Bearer ${WEBHOOK_TOKEN}",
            "X-Custom-Header": "value"
          }
        }
      }
    }
  }
}
```

## Multiple Channels

Enable multiple alert channels simultaneously:

```json
{
  "security": {
    "alerting": {
      "enabled": true,
      "channels": {
        "telegram": {
          "enabled": true,
          "botToken": "${TELEGRAM_BOT_TOKEN}",
          "chatId": "${TELEGRAM_CHAT_ID}"
        },
        "webhook": {
          "enabled": true,
          "url": "https://hooks.example.com/security"
        }
      }
    }
  }
}
```

Alerts will be sent to **all enabled channels**.

## Troubleshooting

### Not Receiving Telegram Alerts

**Check configuration:**
```bash
openclaw security status
```

**Verify bot token:**
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

**Verify chat ID:**
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates"
```

**Check security logs:**
```bash
openclaw security logs --follow
```

Look for lines containing `"alert"` or `"telegram"`.

### Alerts Are Throttled

**Symptom:** Not receiving all alerts

This is expected behavior. Alerts are throttled to prevent spam.

**Adjust throttle settings:**
```json
{
  "security": {
    "alerting": {
      "triggers": {
        "criticalEvents": {
          "throttleMs": 60000
        }
      }
    }
  }
}
```

### Webhook Timeouts

**Symptom:** Webhook alerts fail or delay

**Solutions:**
- Ensure webhook endpoint responds quickly (<5 seconds)
- Check network connectivity
- Verify webhook URL is correct
- Review webhook endpoint logs

## Best Practices

### Telegram

✅ Use a dedicated bot for OpenClaw
✅ Keep bot token secret (use environment variables)
✅ Test alerts after setup
✅ Use a group chat for team notifications

### Webhook

✅ Use HTTPS endpoints only
✅ Implement webhook signature verification
✅ Handle retries gracefully
✅ Monitor webhook endpoint availability

### General

✅ Enable alerting in production
✅ Configure at least one alert channel
✅ Test alerts during setup
✅ Review alert frequency (adjust throttling if needed)
✅ Monitor alert delivery (check logs)

## See Also

- [Security Shield](/security/security-shield)
- [Security Logs](/security/security-shield#security-event-logging)
- [CLI Reference](/cli/security)
