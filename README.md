# Clawdbot Secure Installation Guide

This repository contains scripts to securely install and configure Clawdbot on Ubuntu 22.04 with comprehensive security hardening.

## Features

- ✅ **Docker-based Clawdbot installation**
- ✅ **Gateway binds to localhost only** (127.0.0.1) - NOT publicly accessible
- ✅ **Password authentication** with strong password requirements (16+ chars)
- ✅ **Tailscale integration** for secure remote access
- ✅ **UFW firewall** configured (SSH + Tailscale only, blocks everything else)
- ✅ **Fail2ban** for SSH brute force protection
- ✅ **Unattended security updates** enabled
- ✅ **Non-root user** for running Clawdbot
- ✅ **Log rotation** configured
- ✅ **DM policy** set to pairing (not open)
- ✅ **Channel allowlist** configured (not open)
- ✅ **Idempotent** - safe to run multiple times
- ✅ **Reversible** - complete uninstall instructions included

## Quick Start (One-Line Command)

### Required Environment Variables

```bash
export CLAWDBOT_PASSWORD="your-strong-password-min-16-chars"
export TAILSCALE_AUTH_KEY="tskey-auth-xxxxx"  # Optional but recommended
```

### Installation

```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/yourrepo/main/install_and_harden.sh | sudo -E bash
```

Or download and run locally:

```bash
wget https://raw.githubusercontent.com/yourusername/yourrepo/main/install_and_harden.sh
chmod +x install_and_harden.sh
export CLAWDBOT_PASSWORD="your-strong-password-min-16-chars"
export TAILSCALE_AUTH_KEY="tskey-auth-xxxxx"  # Optional
sudo -E ./install_and_harden.sh
```

## Manual Installation Steps

### 1. Prepare Environment Variables

Create a secure password (minimum 16 characters):

```bash
export CLAWDBOT_PASSWORD="$(openssl rand -base64 24)"
echo "Your Clawdbot password: $CLAWDBOT_PASSWORD"
# SAVE THIS PASSWORD SECURELY!
```

Get a Tailscale auth key from: https://login.tailscale.com/admin/settings/keys

```bash
export TAILSCALE_AUTH_KEY="tskey-auth-xxxxx"
```

### 2. Run Installation Script

```bash
sudo -E ./install_and_harden.sh
```

The script will:
- Update system packages
- Install Docker, UFW, Fail2ban, Tailscale
- Create a non-root `clawdbot` user
- Configure firewall (SSH + Tailscale only)
- Enable unattended security updates
- Install and configure Clawdbot with secure defaults
- Run a health check

### 3. Access Clawdbot

#### Option A: Tailscale Serve (Recommended)

```bash
cd /home/clawdbot/clawdbot
sudo ./setup-tailscale-serve.sh
```

Access at: `https://<hostname>.<tailnet>.ts.net`

#### Option B: SSH Tunnel

From your local machine:

```bash
ssh -L 3000:127.0.0.1:3000 ubuntu@<server-ip>
```

Access at: `http://localhost:3000`

Login with your `CLAWDBOT_PASSWORD`.

## Security Architecture

### Network Security

- **Gateway Binding**: Clawdbot gateway binds to `127.0.0.1:3000` only (not `0.0.0.0`)
- **No Public Ports**: Port 3000 is NOT exposed to the internet
- **UFW Firewall**: Only SSH (22) and Tailscale (41641/udp) are allowed
- **Access Methods**: Only via Tailscale Serve or SSH tunnel

### Authentication & Authorization

- **Auth Mode**: Password-based authentication (required)
- **Strong Password**: Minimum 16 characters enforced
- **DM Policy**: Set to `pairing` (not `open`)
- **Channel Allowlist**: Configured (not open to all)

### System Hardening

- **Non-Root User**: Clawdbot runs as dedicated `clawdbot` user
- **Fail2ban**: Protects SSH from brute force attacks (3 attempts, 2-hour ban)
- **Unattended Upgrades**: Automatic security updates enabled
- **Log Rotation**: Prevents disk space exhaustion
- **Docker Isolation**: Clawdbot runs in isolated container

## Management Commands

### Check Status

```bash
sudo systemctl status clawdbot
docker ps
```

### View Logs

```bash
docker logs clawdbot -f
```

### Restart Service

```bash
sudo systemctl restart clawdbot
```

### Stop Service

```bash
sudo systemctl stop clawdbot
```

### Health Check

```bash
cd /home/clawdbot/clawdbot
./clawdbot-doctor.sh
```

### Update Clawdbot

```bash
cd /home/clawdbot/clawdbot
docker-compose pull
sudo systemctl restart clawdbot
```

## Configuration

Configuration file: `/home/clawdbot/clawdbot/.env`

**Important**: Never commit `.env` to git! It contains your password.

To change settings:

```bash
sudo nano /home/clawdbot/clawdbot/.env
sudo systemctl restart clawdbot
```

## Troubleshooting

### Clawdbot not starting

```bash
docker logs clawdbot
sudo systemctl status clawdbot
```

### Can't access via Tailscale

```bash
sudo tailscale status
sudo tailscale up  # Re-authenticate if needed
```

### Firewall blocking connections

```bash
sudo ufw status verbose
```

### Check all security settings

```bash
cd /home/clawdbot/clawdbot
./clawdbot-doctor.sh
```

## Uninstall / Rollback

See `/home/clawdbot/clawdbot/UNINSTALL.md` for complete removal instructions.

### Quick Uninstall

```bash
sudo systemctl stop clawdbot
sudo systemctl disable clawdbot
cd /home/clawdbot/clawdbot
docker-compose down -v
sudo userdel -r clawdbot
sudo rm /etc/systemd/system/clawdbot.service
sudo systemctl daemon-reload
```

## Files Included

- `install_and_harden.sh` - Main installation script (idempotent)
- `docker-compose.yml` - Docker Compose configuration (generated)
- `.env` - Environment variables with secrets (generated, not in git)
- `README.md` - This file
- `UNINSTALL.md` - Removal instructions (generated)
- `clawdbot-doctor.sh` - Health check script (generated)
- `setup-tailscale-serve.sh` - Tailscale Serve setup (generated)

## Security Best Practices

1. **Never commit secrets to git** - `.env` file is excluded
2. **Use strong passwords** - Minimum 16 characters enforced
3. **Keep system updated** - Unattended upgrades enabled
4. **Monitor logs** - Check `docker logs clawdbot` regularly
5. **Run health checks** - Use `clawdbot-doctor.sh` periodically
6. **Limit access** - Only use Tailscale or SSH tunnel, never expose publicly
7. **Review firewall rules** - `sudo ufw status verbose`
8. **Check Fail2ban** - `sudo fail2ban-client status sshd`

## Requirements

- Ubuntu 22.04 LTS (fresh installation recommended)
- Root or sudo access
- Internet connection
- Tailscale account (optional but recommended)

## License

This script is provided as-is for secure Clawdbot deployment.

## Support

For issues with:
- **This script**: Open an issue in this repository
- **Clawdbot**: See official Clawdbot documentation
- **Tailscale**: See https://tailscale.com/kb/

## Changelog

- **v1.0.0** - Initial release with full security hardening
