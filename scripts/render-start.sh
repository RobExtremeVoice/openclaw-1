#!/bin/sh
# Render startup script - creates config and starts gateway
# Note: We use set -e but handle permission errors gracefully
set -e

echo "=== Render startup script ==="
echo "CLAWDBOT_STATE_DIR=${CLAWDBOT_STATE_DIR}"
echo "HOME=${HOME}"

# Ensure HOME is set (fallback to /tmp if not set)
if [ -z "${HOME}" ]; then
  HOME="/tmp"
  echo "Warning: HOME not set, using ${HOME}"
fi

# Determine config directory with fallback chain
# 1. Try CLAWDBOT_STATE_DIR if set
# 2. Try /data/.clawdbot (Render persistent disk)
# 3. Fall back to $HOME/.clawdbot (always writable by node user)
CONFIG_DIR=""
if [ -n "${CLAWDBOT_STATE_DIR}" ]; then
  if mkdir -p "${CLAWDBOT_STATE_DIR}" 2>/dev/null && touch "${CLAWDBOT_STATE_DIR}/.test" 2>/dev/null && rm -f "${CLAWDBOT_STATE_DIR}/.test" 2>/dev/null; then
    CONFIG_DIR="${CLAWDBOT_STATE_DIR}"
    echo "Using CLAWDBOT_STATE_DIR: ${CONFIG_DIR}"
  else
    echo "Warning: ${CLAWDBOT_STATE_DIR} is not writable"
  fi
fi

if [ -z "${CONFIG_DIR}" ]; then
  if mkdir -p "/data/.clawdbot" 2>/dev/null && touch "/data/.clawdbot/.test" 2>/dev/null && rm -f "/data/.clawdbot/.test" 2>/dev/null; then
    CONFIG_DIR="/data/.clawdbot"
    echo "Using /data/.clawdbot: ${CONFIG_DIR}"
  else
    echo "Warning: /data/.clawdbot is not writable"
  fi
fi

if [ -z "${CONFIG_DIR}" ]; then
  # Final fallback: use HOME (always writable by node user)
  CONFIG_DIR="${HOME}/.clawdbot"
  echo "Using fallback: ${CONFIG_DIR}"
fi

CONFIG_FILE="${CONFIG_DIR}/clawdbot.json"

echo "Config dir: ${CONFIG_DIR}"
echo "Config file: ${CONFIG_FILE}"

# Create config directory (should succeed now)
mkdir -p "${CONFIG_DIR}"

# Config content
CONFIG_CONTENT='{
  "gateway": {
    "mode": "local",
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
    "controlUi": {
      "allowInsecureAuth": true
    }
  }
}'

# Write config file
echo "${CONFIG_CONTENT}" > "${CONFIG_FILE}"

echo "=== Config written ==="
echo "=== ${CONFIG_FILE}: ==="
cat "${CONFIG_FILE}"
echo "=== End config ==="

# Verify file exists
echo "=== Verifying config file ==="
if [ -f "${CONFIG_FILE}" ]; then
  echo "Config file exists: ${CONFIG_FILE}"
  ls -la "${CONFIG_FILE}" || true
else
  echo "ERROR: Config file not found: ${CONFIG_FILE}"
  exit 1
fi

# Start the gateway with token from env var
# Explicitly set CLAWDBOT_CONFIG_PATH to ensure config is loaded from the file we wrote
# Also update CLAWDBOT_STATE_DIR to match the directory we're actually using
# Disable config cache to ensure fresh reads
echo "=== Starting gateway ==="
echo "=== Using config dir: ${CONFIG_DIR} ==="
echo "=== Setting CLAWDBOT_STATE_DIR=${CONFIG_DIR} ==="
echo "=== Setting CLAWDBOT_CONFIG_PATH=${CONFIG_FILE} ==="
echo "=== Disabling config cache ==="
export CLAWDBOT_STATE_DIR="${CONFIG_DIR}"
export CLAWDBOT_CONFIG_PATH="${CONFIG_FILE}"
export CLAWDBOT_CONFIG_CACHE_MS=0

# Verify config can be read
echo "=== Verifying config can be read ==="
node -e "
const fs = require('fs');
const path = '${CONFIG_FILE}';
if (fs.existsSync(path)) {
  const content = fs.readFileSync(path, 'utf-8');
  const parsed = JSON.parse(content);
  console.log('Config loaded successfully:');
  console.log('trustedProxies:', JSON.stringify(parsed.gateway?.trustedProxies));
} else {
  console.error('Config file not found:', path);
  process.exit(1);
}
"

exec node dist/index.js gateway \
  --port 8080 \
  --bind lan \
  --auth token \
  --token "$CLAWDBOT_GATEWAY_TOKEN" \
  --allow-unconfigured
