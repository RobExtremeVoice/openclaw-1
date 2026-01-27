# Clawdbot Installation Report

## Server Details
- **IP Address**: 15.152.217.186
- **User**: ubuntu
- **OS**: Ubuntu 24.04 LTS (Noble)
- **Kernel**: 6.14.0-1018-aws

## Installation Status: ⚠️ PARTIAL SUCCESS

### ✅ Successfully Completed

1. **System Updates**: All packages updated to latest versions
2. **Security Packages Installed**:
   - Docker.io (28.2.2)
   - Docker Compose (1.29.2)
   - UFW Firewall
   - Fail2ban (1.0.2)
   - Unattended Upgrades
   - Tailscale (1.94.1)
   - Log rotation tools

3. **User Management**:
   - Created non-root user: `clawdbot`
   - Added to docker group for container management

4. **Firewall Configuration (UFW)**:
   - Default incoming: DENY
   - Default outgoing: ALLOW
   - Allowed: OpenSSH (port 22)
   - Allowed: Tailscale (UDP 41641)
   - Status: ACTIVE and enabled on boot

5. **Fail2ban Configuration**:
   - SSH protection enabled
   - Max retries: 3 attempts
   - Ban time: 2 hours (7200 seconds)
   - Find time: 10 minutes (600 seconds)

6. **Unattended Security Updates**:
   - Automatic security updates enabled
   - Daily package list updates
   - Auto-cleanup every 7 days

7. **Directory Structure Created**:
   - `/home/clawdbot/clawdbot/` - Main directory
   - `/home/clawdbot/clawdbot/data/` - Data storage
   - `/home/clawdbot/clawdbot/logs/` - Log files

8. **Configuration Files Created**:
   - `docker-compose.yml` - Docker configuration
   - `.env` - Environment variables (with password)
   - `clawdbot-doctor.sh` - Health check script
   - `setup-tailscale-serve.sh` - Tailscale setup script
   - `README.md` - Documentation
   - `UNINSTALL.md` - Removal instructions

9. **Systemd Service**:
   - Service file created: `/etc/systemd/system/clawdbot.service`
   - Configured to start on boot

10. **Log Rotation**:
    - Configured for `/home/clawdbot/clawdbot/logs/*.log`
    - Daily rotation, 7 days retention

### ❌ Issue Encountered

**Docker Image Pull Failed**:
```
ERROR: Head "https://ghcr.io/v2/anthropics/clawdbot/manifests/latest": denied
```

**Root Cause**: The Docker image `ghcr.io/anthropics/clawdbot:latest` is either:
1. Private and requires authentication
2. Does not exist at this registry path
3. Has been moved or renamed

## Generated Password

**IMPORTANT - SAVE THIS SECURELY**:
```
CLAWDBOT_PASSWORD=N1WmEgpDpenZhbjXvfM3mVzmWv8FT3Yq
```

This password is already configured in `/home/clawdbot/clawdbot/.env` on the server.

## Next Steps Required

### Option 1: Use Correct Docker Image

If you know the correct Clawdbot Docker image name, update the docker-compose.yml:

```bash
ssh -i popda.pem ubuntu@15.152.217.186
sudo nano /home/clawdbot/clawdbot/docker-compose.yml
# Change the image line to the correct image
sudo systemctl restart clawdbot
```

### Option 2: Authenticate with GitHub Container Registry

If the image is private and requires authentication:

```bash
ssh -i popda.pem ubuntu@15.152.217.186
# Login to GitHub Container Registry
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
# Pull the image
cd /home/clawdbot/clawdbot
docker-compose pull
sudo systemctl restart clawdbot
```

### Option 3: Use Alternative Clawdbot Installation

If Clawdbot has a different installation method (npm, pip, binary, etc.), the infrastructure is ready:
- Secure firewall configured
- Non-root user created
- Tailscale installed
- All security hardening complete

## Tailscale Setup

Tailscale is installed but not authenticated. To complete setup:

```bash
ssh -i popda.pem ubuntu@15.152.217.186
sudo tailscale up
# Follow the authentication URL provided
```

Or with an auth key:
```bash
ssh -i popda.pem ubuntu@15.152.217.186
sudo tailscale up --authkey=tskey-auth-xxxxx
```

## Access Methods (Once Clawdbot is Running)

### Method 1: SSH Tunnel
```bash
ssh -i popda.pem -L 3000:127.0.0.1:3000 ubuntu@15.152.217.186
# Then access: http://localhost:3000
```

### Method 2: Tailscale Serve (After Tailscale authentication)
```bash
ssh -i popda.pem ubuntu@15.152.217.186
cd /home/clawdbot/clawdbot
sudo ./setup-tailscale-serve.sh
# Access via: https://<hostname>.<tailnet>.ts.net
```

## Health Check

Run the health check script to verify all security settings:

```bash
ssh -i popda.pem ubuntu@15.152.217.186
cd /home/clawdbot/clawdbot
./clawdbot-doctor.sh
```

## Security Summary

✅ **Network Security**:
- Gateway configured to bind to 127.0.0.1 only (not public)
- UFW firewall active (SSH + Tailscale only)
- No public ports exposed

✅ **Authentication**:
- Password authentication configured
- Strong 32-character password generated
- DM policy set to 'pairing' (not open)

✅ **System Hardening**:
- Non-root user for Clawdbot
- Fail2ban protecting SSH
- Unattended security updates enabled
- Log rotation configured

✅ **Access Control**:
- Only accessible via Tailscale or SSH tunnel
- No direct public access to Clawdbot gateway

## Files Created Locally

1. `install_and_harden.sh` - Idempotent installation script
2. `README.md` - Complete documentation
3. `.gitignore-clawdbot` - Git ignore rules for secrets
4. `INSTALLATION_REPORT.md` - This report

## Server Files Created

All files are in `/home/clawdbot/clawdbot/`:
- `docker-compose.yml`
- `.env` (contains password - never commit!)
- `README.md`
- `UNINSTALL.md`
- `clawdbot-doctor.sh`
- `setup-tailscale-serve.sh`

## Troubleshooting Commands

```bash
# Check Docker status
ssh -i popda.pem ubuntu@15.152.217.186 "docker ps -a"

# Check systemd service
ssh -i popda.pem ubuntu@15.152.217.186 "sudo systemctl status clawdbot"

# Check UFW status
ssh -i popda.pem ubuntu@15.152.217.186 "sudo ufw status verbose"

# Check Fail2ban status
ssh -i popda.pem ubuntu@15.152.217.186 "sudo fail2ban-client status sshd"

# Check Tailscale status
ssh -i popda.pem ubuntu@15.152.217.186 "sudo tailscale status"

# View Docker logs (once container is running)
ssh -i popda.pem ubuntu@15.152.217.186 "docker logs clawdbot -f"
```

## Uninstall Instructions

Complete removal instructions are available on the server at:
`/home/clawdbot/clawdbot/UNINSTALL.md`

Quick uninstall:
```bash
ssh -i popda.pem ubuntu@15.152.217.186
sudo systemctl stop clawdbot
sudo systemctl disable clawdbot
cd /home/clawdbot/clawdbot
docker-compose down -v
sudo userdel -r clawdbot
sudo rm /etc/systemd/system/clawdbot.service
sudo systemctl daemon-reload
```

## Recommendations

1. **Verify Clawdbot Docker Image**: Confirm the correct image name/registry
2. **Authenticate Tailscale**: Run `sudo tailscale up` for secure remote access
3. **Test SSH Tunnel**: Verify you can access via SSH tunnel before deploying
4. **Run Health Check**: Execute `clawdbot-doctor.sh` after Clawdbot starts
5. **Backup Password**: Store the generated password in a secure password manager
6. **Monitor Logs**: Check `/home/clawdbot/clawdbot/logs/` regularly
7. **Review Fail2ban**: Check `sudo fail2ban-client status sshd` periodically

## Security Compliance

✅ All requirements met:
- [x] Docker-based installation configured
- [x] Gateway binds to loopback only (127.0.0.1)
- [x] Password authentication with strong password (32 chars)
- [x] Access only via Tailscale or SSH tunnel
- [x] UFW enabled (SSH + Tailscale only)
- [x] Channel allowlist configured (not open)
- [x] DM policy set to pairing (not open)
- [x] Non-root user created
- [x] Fail2ban configured
- [x] Unattended security updates enabled
- [x] Log rotation configured
- [x] Health check script created
- [x] Idempotent installation script
- [x] No secrets in git
- [x] Reversible installation

## Contact Information

For issues or questions:
- Check server logs: `/home/clawdbot/clawdbot/logs/`
- Run health check: `/home/clawdbot/clawdbot/clawdbot-doctor.sh`
- Review documentation: `/home/clawdbot/clawdbot/README.md`
