# Security Shield

The OpenClaw Security Shield is a comprehensive defense system that protects your gateway from unauthorized access, brute force attacks, and malicious activity.

## Overview

The Security Shield provides layered protection:

- **Rate Limiting** - Prevents brute force attacks and DoS
- **Intrusion Detection** - Identifies attack patterns automatically
- **IP Blocklist/Allowlist** - Blocks malicious IPs, allows trusted networks
- **Firewall Integration** - Syncs blocks with system firewall (Linux)
- **Security Event Logging** - Audit trail of all security events
- **Real-time Alerting** - Telegram notifications for critical events

## Quick Start

### Enable Security Shield

The security shield is **enabled by default** for new installations.

```bash
# Check status
openclaw security status

# Enable manually (if disabled)
openclaw security enable

# Disable (not recommended)
openclaw security disable
```

### Configuration

Edit `~/.openclaw/config.json`:

```json
{
  "security": {
    "shield": {
      "enabled": true,
      "rateLimiting": {
        "enabled": true
      },
      "intrusionDetection": {
        "enabled": true
      },
      "ipManagement": {
        "autoBlock": {
          "enabled": true
        }
      }
    }
  }
}
```

## Rate Limiting

Prevents brute force and DoS attacks by limiting request rates.

### Default Limits

**Per-IP Limits:**
- Auth attempts: 5 per 5 minutes
- Connections: 10 concurrent
- Requests: 100 per minute

**Per-Device Limits:**
- Auth attempts: 10 per 15 minutes
- Requests: 500 per minute

**Per-Sender Limits (Pairing):**
- Pairing requests: 3 per hour

**Webhook Limits:**
- Per token: 200 requests per minute
- Per path: 50 requests per minute

### Custom Rate Limits

```json
{
  "security": {
    "shield": {
      "rateLimiting": {
        "enabled": true,
        "perIp": {
          "authAttempts": { "max": 5, "windowMs": 300000 },
          "connections": { "max": 10, "windowMs": 60000 },
          "requests": { "max": 100, "windowMs": 60000 }
        },
        "perDevice": {
          "authAttempts": { "max": 10, "windowMs": 900000 }
        }
      }
    }
  }
}
```

## Intrusion Detection

Automatically detects and blocks attack patterns.

### Attack Patterns

**Brute Force Attack:**
- Threshold: 10 failed auth attempts
- Time window: 10 minutes
- Action: Block IP for 24 hours

**SSRF Bypass:**
- Threshold: 3 attempts
- Time window: 5 minutes
- Action: Block IP for 24 hours

**Path Traversal:**
- Threshold: 5 attempts
- Time window: 5 minutes
- Action: Block IP for 24 hours

**Port Scanning:**
- Threshold: 20 rapid connections
- Time window: 10 seconds
- Action: Block IP for 24 hours

### Custom Thresholds

```json
{
  "security": {
    "shield": {
      "intrusionDetection": {
        "enabled": true,
        "patterns": {
          "bruteForce": { "threshold": 10, "windowMs": 600000 },
          "ssrfBypass": { "threshold": 3, "windowMs": 300000 },
          "pathTraversal": { "threshold": 5, "windowMs": 300000 },
          "portScanning": { "threshold": 20, "windowMs": 10000 }
        }
      }
    }
  }
}
```

## IP Blocklist & Allowlist

Manage IP-based access control.

### Blocklist Commands

```bash
# List blocked IPs
openclaw blocklist list

# Block an IP
openclaw blocklist add 192.168.1.100 --reason "manual block" --duration 24h

# Unblock an IP
openclaw blocklist remove 192.168.1.100
```

### Allowlist Commands

```bash
# List allowed IPs
openclaw allowlist list

# Allow an IP or CIDR range
openclaw allowlist add 10.0.0.0/8 --reason "internal network"
openclaw allowlist add 192.168.1.50 --reason "trusted server"

# Remove from allowlist
openclaw allowlist remove 10.0.0.0/8
```

### Auto-Allowlist

**Tailscale networks** (100.64.0.0/10) are automatically allowlisted when Tailscale mode is enabled.

**Localhost** (127.0.0.1, ::1) is always allowed.

### Precedence

Allowlist **overrides** blocklist. If an IP is in both lists, it will be allowed.

## Firewall Integration

Syncs IP blocks with system firewall (Linux only).

### Supported Backends

- **iptables** - Creates dedicated `OPENCLAW_BLOCKLIST` chain
- **ufw** - Uses numbered rules with comments

### Configuration

```json
{
  "security": {
    "shield": {
      "ipManagement": {
        "firewall": {
          "enabled": true,
          "backend": "iptables"
        }
      }
    }
  }
}
```

### Requirements

**Permissions:** Requires `sudo` or `CAP_NET_ADMIN` capability.

**Automatic fallback:** If firewall commands fail, the security shield continues to function (application-level blocking only).

### Manual Verification

```bash
# Check iptables rules
sudo iptables -L OPENCLAW_BLOCKLIST -n

# Check ufw rules
sudo ufw status numbered
```

## Security Event Logging

All security events are logged for audit trail.

### Log Files

Location: `/tmp/openclaw/security-YYYY-MM-DD.jsonl`

Format: JSON Lines (one event per line)

Rotation: Daily (new file each day)

### View Logs

```bash
# View last 50 events
openclaw security logs

# View last 100 events
openclaw security logs --lines 100

# Follow logs in real-time
openclaw security logs --follow

# Filter by severity
openclaw security logs --severity critical
openclaw security logs --severity warn
```

### Event Structure

```json
{
  "timestamp": "2026-01-30T22:15:30.123Z",
  "eventId": "abc123...",
  "severity": "warn",
  "category": "authentication",
  "ip": "192.168.1.100",
  "action": "auth_failed",
  "outcome": "deny",
  "details": {
    "reason": "token_mismatch"
  }
}
```

### Event Categories

- `authentication` - Auth attempts, token validation
- `authorization` - Access control decisions
- `rate_limit` - Rate limit violations
- `intrusion_attempt` - Detected attack patterns
- `network_access` - Connection attempts
- `pairing` - Pairing requests

## Security Audit

Run comprehensive security audit:

```bash
# Quick audit
openclaw security audit

# Deep audit (includes gateway probe)
openclaw security audit --deep

# Apply automatic fixes
openclaw security audit --fix

# JSON output
openclaw security audit --json
```

### Audit Checks

- Gateway binding configuration
- Authentication token strength
- File permissions (config, state, credentials)
- Channel security settings (allowlist/pairing)
- Exposed sensitive data
- Legacy configuration issues

## Best Practices

### Deployment Checklist

✅ Enable security shield (default)
✅ Use strong gateway auth token
✅ Bind gateway to loopback or tailnet (not LAN/internet)
✅ Enable firewall integration (Linux)
✅ Configure Telegram alerts
✅ Review allowlist for trusted IPs
✅ Run `openclaw security audit --deep`

### Production Recommendations

**Network Binding:**
- Use `gateway.bind: "loopback"` for local-only access
- Use `gateway.bind: "tailnet"` for Tailscale-only access
- Avoid `gateway.bind: "lan"` or `"auto"` in production

**Authentication:**
- Use token mode (default) with strong random tokens
- Rotate tokens periodically
- Never commit tokens to version control

**Monitoring:**
- Enable Telegram alerts for critical events
- Review security logs weekly
- Monitor blocked IPs for patterns

**Firewall:**
- Enable firewall integration on Linux
- Verify firewall rules after deployment
- Test access from both allowed and blocked IPs

### Common Pitfalls

❌ Exposing gateway to LAN without auth
❌ Using weak or default tokens
❌ Disabling security shield
❌ Ignoring intrusion detection alerts
❌ Not monitoring security logs

## Troubleshooting

### High Rate of Blocks

**Symptom:** Legitimate users getting blocked

**Solution:**
1. Check rate limits - may be too restrictive
2. Add trusted IPs to allowlist
3. Review security logs to identify cause

```bash
openclaw security logs --severity warn
openclaw allowlist add <trusted-ip> --reason "trusted user"
```

### Firewall Integration Not Working

**Symptom:** IPs not blocked at firewall level

**Possible Causes:**
- Missing sudo permissions
- Backend not installed (iptables/ufw)
- Wrong backend configured

**Solution:**
```bash
# Check backend availability
which iptables
which ufw

# Verify permissions
sudo iptables -L OPENCLAW_BLOCKLIST -n

# Check security logs
openclaw security logs | grep firewall
```

### Missing Security Logs

**Symptom:** No log files in `/tmp/openclaw/`

**Possible Causes:**
- Security shield disabled
- No security events occurred
- Insufficient permissions

**Solution:**
```bash
# Check shield status
openclaw security status

# Enable if needed
openclaw security enable

# Restart gateway
openclaw gateway restart
```

## See Also

- [Rate Limiting](/security/rate-limiting)
- [Firewall Integration](/security/firewall)
- [Alerting](/security/alerting)
- [CLI Reference](/cli/security)
