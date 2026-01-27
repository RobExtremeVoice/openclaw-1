#!/bin/bash
set -euo pipefail

#############################################################################
# Clawdbot Installation & Ubuntu Hardening Script
# 
# This script is idempotent and can be run multiple times safely.
# It installs Clawdbot with Docker, hardens Ubuntu 22.04, and configures
# secure access via Tailscale or SSH tunnel only (no public gateway).
#
# Required environment variables:
#   CLAWDBOT_PASSWORD - Strong password for Clawdbot auth (min 16 chars)
#   TAILSCALE_AUTH_KEY - (Optional) Tailscale auth key for auto-join
#
# Usage:
#   export CLAWDBOT_PASSWORD="your-strong-password-here"
#   export TAILSCALE_AUTH_KEY="tskey-auth-xxxxx" # optional
#   sudo -E bash install_and_harden.sh
#############################################################################

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo -E)"
   exit 1
fi

# Validate required environment variables
if [[ -z "${CLAWDBOT_PASSWORD:-}" ]]; then
    log_error "CLAWDBOT_PASSWORD environment variable is required"
    log_error "Example: export CLAWDBOT_PASSWORD='your-strong-password-here'"
    exit 1
fi

# Validate password strength (min 16 characters)
if [[ ${#CLAWDBOT_PASSWORD} -lt 16 ]]; then
    log_error "CLAWDBOT_PASSWORD must be at least 16 characters long"
    exit 1
fi

# Configuration
CLAWDBOT_USER="clawdbot"
CLAWDBOT_HOME="/home/${CLAWDBOT_USER}"
CLAWDBOT_DIR="${CLAWDBOT_HOME}/clawdbot"
INSTALL_MARKER="/var/lib/clawdbot-installed"

log_info "Starting Clawdbot installation and Ubuntu hardening..."

#############################################################################
# 1. System Updates & Security Patches
#############################################################################
log_info "Step 1: Updating system packages..."

export DEBIAN_FRONTEND=noninteractive

if [[ ! -f "${INSTALL_MARKER}.apt-updated" ]]; then
    apt-get update -qq
    apt-get upgrade -y -qq
    touch "${INSTALL_MARKER}.apt-updated"
    log_info "System packages updated"
else
    log_info "System packages already updated (skipping)"
fi

#############################################################################
# 2. Install Required Packages
#############################################################################
log_info "Step 2: Installing required packages..."

REQUIRED_PACKAGES=(
    "docker.io"
    "docker-compose"
    "ufw"
    "fail2ban"
    "unattended-upgrades"
    "apt-listchanges"
    "logrotate"
    "curl"
    "wget"
    "git"
)

for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if ! dpkg -l | grep -q "^ii  ${pkg}"; then
        log_info "Installing ${pkg}..."
        apt-get install -y -qq "${pkg}"
    else
        log_info "${pkg} already installed"
    fi
done

#############################################################################
# 3. Enable Unattended Security Updates
#############################################################################
log_info "Step 3: Configuring unattended security updates..."

cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

log_info "Unattended security updates enabled"

#############################################################################
# 4. Create Non-Root User for Clawdbot
#############################################################################
log_info "Step 4: Creating non-root user '${CLAWDBOT_USER}'..."

if ! id "${CLAWDBOT_USER}" &>/dev/null; then
    useradd -m -s /bin/bash "${CLAWDBOT_USER}"
    usermod -aG docker "${CLAWDBOT_USER}"
    log_info "User '${CLAWDBOT_USER}' created and added to docker group"
else
    log_info "User '${CLAWDBOT_USER}' already exists"
    usermod -aG docker "${CLAWDBOT_USER}" 2>/dev/null || true
fi

#############################################################################
# 5. Configure UFW Firewall
#############################################################################
log_info "Step 5: Configuring UFW firewall..."

# Reset UFW to default state (idempotent)
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (OpenSSH)
ufw allow OpenSSH

# Allow Tailscale (UDP 41641)
ufw allow 41641/udp comment 'Tailscale'

# Enable UFW
ufw --force enable

log_info "UFW firewall configured (SSH and Tailscale allowed, all else blocked)"

#############################################################################
# 6. Configure Fail2ban for SSH Protection
#############################################################################
log_info "Step 6: Configuring Fail2ban for SSH brute force protection..."

cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = root@localhost
sendername = Fail2Ban
action = %(action_mw)s

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 3
bantime = 7200
EOF

systemctl enable fail2ban
systemctl restart fail2ban

log_info "Fail2ban configured and enabled"

#############################################################################
# 7. Install Tailscale
#############################################################################
log_info "Step 7: Installing Tailscale..."

if ! command -v tailscale &>/dev/null; then
    curl -fsSL https://tailscale.com/install.sh | sh
    log_info "Tailscale installed"
else
    log_info "Tailscale already installed"
fi

# Start Tailscale if not running
if ! systemctl is-active --quiet tailscaled; then
    systemctl enable tailscaled
    systemctl start tailscaled
fi

# Authenticate with Tailscale if auth key provided
if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
    if ! tailscale status &>/dev/null; then
        log_info "Authenticating with Tailscale..."
        tailscale up --authkey="${TAILSCALE_AUTH_KEY}" --accept-routes
    else
        log_info "Tailscale already authenticated"
    fi
else
    log_warn "TAILSCALE_AUTH_KEY not provided. Run 'sudo tailscale up' manually to authenticate"
fi

#############################################################################
# 8. Enable and Start Docker
#############################################################################
log_info "Step 8: Enabling Docker service..."

systemctl enable docker
systemctl start docker

log_info "Docker service enabled and started"

#############################################################################
# 9. Create Clawdbot Directory Structure
#############################################################################
log_info "Step 9: Creating Clawdbot directory structure..."

mkdir -p "${CLAWDBOT_DIR}"
mkdir -p "${CLAWDBOT_DIR}/data"
mkdir -p "${CLAWDBOT_DIR}/logs"

#############################################################################
# 10. Create Docker Compose Configuration
#############################################################################
log_info "Step 10: Creating Docker Compose configuration..."

cat > "${CLAWDBOT_DIR}/docker-compose.yml" <<'EOF'
version: '3.8'

services:
  clawdbot:
    image: ghcr.io/anthropics/clawdbot:latest
    container_name: clawdbot
    restart: unless-stopped
    environment:
      - CLAWDBOT_AUTH_MODE=password
      - CLAWDBOT_PASSWORD=${CLAWDBOT_PASSWORD}
      - CLAWDBOT_GATEWAY_BIND=127.0.0.1
      - CLAWDBOT_GATEWAY_PORT=3000
      - CLAWDBOT_DM_POLICY=pairing
      - CLAWDBOT_CHANNEL_ALLOWLIST=
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    ports:
      - "127.0.0.1:3000:3000"
    networks:
      - clawdbot-net
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  clawdbot-net:
    driver: bridge
EOF

#############################################################################
# 11. Create Environment File
#############################################################################
log_info "Step 11: Creating environment file..."

cat > "${CLAWDBOT_DIR}/.env" <<EOF
# Clawdbot Configuration
# DO NOT COMMIT THIS FILE TO GIT

# Authentication
CLAWDBOT_PASSWORD=${CLAWDBOT_PASSWORD}

# Gateway Configuration (bind to localhost only - NOT public)
CLAWDBOT_GATEWAY_BIND=127.0.0.1
CLAWDBOT_GATEWAY_PORT=3000

# Security Settings
CLAWDBOT_AUTH_MODE=password
CLAWDBOT_DM_POLICY=pairing
CLAWDBOT_CHANNEL_ALLOWLIST=

# Generated on: $(date)
EOF

chmod 600 "${CLAWDBOT_DIR}/.env"

#############################################################################
# 12. Create Systemd Service for Clawdbot
#############################################################################
log_info "Step 12: Creating systemd service for Clawdbot..."

cat > /etc/systemd/system/clawdbot.service <<EOF
[Unit]
Description=Clawdbot Docker Service
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${CLAWDBOT_DIR}
User=${CLAWDBOT_USER}
Group=${CLAWDBOT_USER}

# Load environment variables
EnvironmentFile=${CLAWDBOT_DIR}/.env

# Start command
ExecStart=/usr/bin/docker-compose -f ${CLAWDBOT_DIR}/docker-compose.yml up -d

# Stop command
ExecStop=/usr/bin/docker-compose -f ${CLAWDBOT_DIR}/docker-compose.yml down

# Restart policy
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

#############################################################################
# 13. Configure Log Rotation
#############################################################################
log_info "Step 13: Configuring log rotation..."

cat > /etc/logrotate.d/clawdbot <<EOF
${CLAWDBOT_DIR}/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 ${CLAWDBOT_USER} ${CLAWDBOT_USER}
}
EOF

log_info "Log rotation configured"

#############################################################################
# 14. Set Proper Permissions
#############################################################################
log_info "Step 14: Setting proper permissions..."

chown -R "${CLAWDBOT_USER}:${CLAWDBOT_USER}" "${CLAWDBOT_DIR}"
chmod 700 "${CLAWDBOT_DIR}"
chmod 600 "${CLAWDBOT_DIR}/.env"

#############################################################################
# 15. Pull Docker Image and Start Clawdbot
#############################################################################
log_info "Step 15: Pulling Clawdbot Docker image..."

su - "${CLAWDBOT_USER}" -c "cd ${CLAWDBOT_DIR} && docker-compose pull"

log_info "Starting Clawdbot service..."

systemctl enable clawdbot
systemctl restart clawdbot

# Wait for service to start
sleep 5

#############################################################################
# 16. Create Clawdbot Doctor Check Script
#############################################################################
log_info "Step 16: Creating Clawdbot doctor check script..."

cat > "${CLAWDBOT_DIR}/clawdbot-doctor.sh" <<'DOCTOR_EOF'
#!/bin/bash

echo "=========================================="
echo "Clawdbot Health Check & Security Audit"
echo "=========================================="
echo ""

WARNINGS=0

# Check if Clawdbot is running
echo "[1] Checking Clawdbot container status..."
if docker ps | grep -q clawdbot; then
    echo "    ✓ Clawdbot container is running"
else
    echo "    ✗ WARNING: Clawdbot container is NOT running"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check gateway binding
echo "[2] Checking gateway binding (should be 127.0.0.1 only)..."
if docker inspect clawdbot 2>/dev/null | grep -q '"127.0.0.1:3000"'; then
    echo "    ✓ Gateway bound to localhost only (secure)"
else
    echo "    ✗ WARNING: Gateway may be exposed publicly!"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check UFW status
echo "[3] Checking UFW firewall status..."
if ufw status | grep -q "Status: active"; then
    echo "    ✓ UFW firewall is active"
else
    echo "    ✗ WARNING: UFW firewall is NOT active"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check Fail2ban status
echo "[4] Checking Fail2ban status..."
if systemctl is-active --quiet fail2ban; then
    echo "    ✓ Fail2ban is running"
else
    echo "    ✗ WARNING: Fail2ban is NOT running"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check Tailscale status
echo "[5] Checking Tailscale status..."
if tailscale status &>/dev/null; then
    echo "    ✓ Tailscale is connected"
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null)
    if [[ -n "$TAILSCALE_IP" ]]; then
        echo "    → Tailscale IP: $TAILSCALE_IP"
    fi
else
    echo "    ✗ WARNING: Tailscale is NOT connected"
    echo "    → Run: sudo tailscale up"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check unattended upgrades
echo "[6] Checking unattended security updates..."
if systemctl is-enabled unattended-upgrades &>/dev/null || [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]]; then
    echo "    ✓ Unattended security updates enabled"
else
    echo "    ✗ WARNING: Unattended security updates NOT configured"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check auth mode
echo "[7] Checking Clawdbot auth mode..."
if docker exec clawdbot env 2>/dev/null | grep -q "CLAWDBOT_AUTH_MODE=password"; then
    echo "    ✓ Auth mode is set to password"
else
    echo "    ✗ WARNING: Auth mode may not be configured correctly"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check DM policy
echo "[8] Checking DM policy (should be 'pairing' or allowlist)..."
DM_POLICY=$(docker exec clawdbot env 2>/dev/null | grep CLAWDBOT_DM_POLICY | cut -d= -f2)
if [[ "$DM_POLICY" == "pairing" ]] || [[ -n "$DM_POLICY" && "$DM_POLICY" != "open" ]]; then
    echo "    ✓ DM policy is secure: $DM_POLICY"
else
    echo "    ✗ WARNING: DM policy may be too permissive: $DM_POLICY"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check for public port exposure
echo "[9] Checking for public port exposure..."
if netstat -tuln 2>/dev/null | grep -E ':3000.*0.0.0.0|:3000.*::' | grep -v 127.0.0.1; then
    echo "    ✗ WARNING: Port 3000 may be exposed publicly!"
    WARNINGS=$((WARNINGS + 1))
else
    echo "    ✓ No public port exposure detected"
fi
echo ""

# Summary
echo "=========================================="
if [[ $WARNINGS -eq 0 ]]; then
    echo "✓ All checks passed! No warnings."
else
    echo "⚠ Total warnings: $WARNINGS"
    echo "Please review the warnings above."
fi
echo "=========================================="
DOCTOR_EOF

chmod +x "${CLAWDBOT_DIR}/clawdbot-doctor.sh"
chown "${CLAWDBOT_USER}:${CLAWDBOT_USER}" "${CLAWDBOT_DIR}/clawdbot-doctor.sh"

#############################################################################
# 17. Create Tailscale Serve Configuration Script
#############################################################################
log_info "Step 17: Creating Tailscale Serve setup script..."

cat > "${CLAWDBOT_DIR}/setup-tailscale-serve.sh" <<'SERVE_EOF'
#!/bin/bash
# Setup Tailscale Serve to expose Clawdbot on your Tailnet

echo "Setting up Tailscale Serve for Clawdbot..."

# Enable Tailscale Serve on port 3000
sudo tailscale serve https / http://127.0.0.1:3000

echo ""
echo "Tailscale Serve configured!"
echo "Access Clawdbot at: https://$(hostname).$(tailscale status --json | jq -r '.MagicDNSSuffix')"
echo ""
echo "To disable: sudo tailscale serve reset"
SERVE_EOF

chmod +x "${CLAWDBOT_DIR}/setup-tailscale-serve.sh"
chown "${CLAWDBOT_USER}:${CLAWDBOT_USER}" "${CLAWDBOT_DIR}/setup-tailscale-serve.sh"

#############################################################################
# 18. Create README
#############################################################################
log_info "Step 18: Creating README..."

cat > "${CLAWDBOT_DIR}/README.md" <<'README_EOF'
# Clawdbot Installation

## Access Methods

### Option 1: Tailscale Serve (Recommended)
```bash
cd /home/clawdbot/clawdbot
sudo ./setup-tailscale-serve.sh
```

Then access at: `https://<hostname>.<tailnet-name>.ts.net`

### Option 2: SSH Tunnel
```bash
ssh -L 3000:127.0.0.1:3000 ubuntu@<server-ip>
```

Then access at: `http://localhost:3000`

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

### Run Health Check
```bash
cd /home/clawdbot/clawdbot
./clawdbot-doctor.sh
```

## Security Features

- ✓ Gateway bound to localhost only (127.0.0.1)
- ✓ Password authentication enabled
- ✓ UFW firewall (SSH + Tailscale only)
- ✓ Fail2ban for SSH brute force protection
- ✓ Unattended security updates enabled
- ✓ Non-root user for running Clawdbot
- ✓ Log rotation configured
- ✓ DM policy set to pairing (not open)

## Configuration

Edit `/home/clawdbot/clawdbot/.env` to change settings (requires restart).

## Uninstall

See `UNINSTALL.md` for removal instructions.
README_EOF

chown "${CLAWDBOT_USER}:${CLAWDBOT_USER}" "${CLAWDBOT_DIR}/README.md"

#############################################################################
# 19. Create Uninstall Script
#############################################################################
log_info "Step 19: Creating uninstall script..."

cat > "${CLAWDBOT_DIR}/UNINSTALL.md" <<'UNINSTALL_EOF'
# Uninstall / Rollback Instructions

## Complete Removal

```bash
# Stop and disable Clawdbot service
sudo systemctl stop clawdbot
sudo systemctl disable clawdbot
sudo rm /etc/systemd/system/clawdbot.service
sudo systemctl daemon-reload

# Remove Docker containers and images
cd /home/clawdbot/clawdbot
docker-compose down -v
docker rmi ghcr.io/anthropics/clawdbot:latest

# Remove Clawdbot user and files
sudo userdel -r clawdbot

# Remove Tailscale (optional)
sudo tailscale down
sudo apt-get remove -y tailscale

# Remove Fail2ban (optional)
sudo systemctl stop fail2ban
sudo systemctl disable fail2ban
sudo apt-get remove -y fail2ban

# Reset UFW (optional - WARNING: this opens all ports)
sudo ufw disable
sudo ufw --force reset

# Remove log rotation config
sudo rm /etc/logrotate.d/clawdbot

# Remove installation markers
sudo rm -f /var/lib/clawdbot-installed*
```

## Partial Rollback (Keep Security Hardening)

If you want to remove Clawdbot but keep the security hardening:

```bash
# Stop and remove Clawdbot only
sudo systemctl stop clawdbot
sudo systemctl disable clawdbot
sudo rm /etc/systemd/system/clawdbot.service
sudo systemctl daemon-reload

cd /home/clawdbot/clawdbot
docker-compose down -v
docker rmi ghcr.io/anthropics/clawdbot:latest

sudo userdel -r clawdbot
sudo rm /etc/logrotate.d/clawdbot
```

This keeps UFW, Fail2ban, Tailscale, and unattended upgrades active.
UNINSTALL_EOF

chown "${CLAWDBOT_USER}:${CLAWDBOT_USER}" "${CLAWDBOT_DIR}/UNINSTALL.md"

#############################################################################
# 20. Mark Installation Complete
#############################################################################
touch "${INSTALL_MARKER}"

#############################################################################
# 21. Run Doctor Check
#############################################################################
log_info "Step 20: Running health check..."
echo ""

su - "${CLAWDBOT_USER}" -c "${CLAWDBOT_DIR}/clawdbot-doctor.sh"

#############################################################################
# Final Summary
#############################################################################
echo ""
echo "=========================================="
log_info "Installation Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo ""
echo "1. Authenticate with Tailscale (if not done):"
echo "   sudo tailscale up"
echo ""
echo "2. Setup Tailscale Serve for secure access:"
echo "   cd ${CLAWDBOT_DIR}"
echo "   sudo ./setup-tailscale-serve.sh"
echo ""
echo "3. Or use SSH tunnel:"
echo "   ssh -L 3000:127.0.0.1:3000 ubuntu@<server-ip>"
echo ""
echo "4. Access Clawdbot and login with your password"
echo ""
echo "Documentation: ${CLAWDBOT_DIR}/README.md"
echo "Health Check: ${CLAWDBOT_DIR}/clawdbot-doctor.sh"
echo "Uninstall: ${CLAWDBOT_DIR}/UNINSTALL.md"
echo ""
echo "=========================================="
