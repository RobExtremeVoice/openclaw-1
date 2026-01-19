#!/bin/bash
# Sync Anthropic OAuth token from macOS Keychain (Claude Code) to clawdbot auth-profiles.json
#
# Use this when:
# - You've re-logged into Claude Code but clawdbot still shows "token expired"
# - Clawdbot isn't picking up the refreshed token automatically
#
# Prerequisites:
# - Claude Code must be logged in (token exists in Keychain)
# - jq must be installed
#
# Usage:
#   ./sync-anthropic-keychain.sh
#   ./sync-anthropic-keychain.sh --restart   # Also restart gateway after sync

set -euo pipefail

AUTH_PROFILES="$HOME/.clawdbot/agents/main/agent/auth-profiles.json"
KEYCHAIN_SERVICE="Claude Code-credentials"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
info() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }

# Check dependencies
command -v jq >/dev/null 2>&1 || error "jq is required but not installed. Run: brew install jq"
command -v security >/dev/null 2>&1 || error "security command not found (are you on macOS?)"

# Check if auth-profiles.json exists
[ -f "$AUTH_PROFILES" ] || error "Auth profiles not found: $AUTH_PROFILES"

# Read token from Keychain
info "Reading token from macOS Keychain..."
KEYCHAIN_DATA=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null) || \
  error "Failed to read from Keychain. Is Claude Code logged in?"

# Extract OAuth fields
ACCESS=$(echo "$KEYCHAIN_DATA" | jq -r '.claudeAiOauth.accessToken // empty')
REFRESH=$(echo "$KEYCHAIN_DATA" | jq -r '.claudeAiOauth.refreshToken // empty')
EXPIRES=$(echo "$KEYCHAIN_DATA" | jq -r '.claudeAiOauth.expiresAt // empty')

[ -n "$ACCESS" ] || error "No accessToken found in Keychain data"
[ -n "$REFRESH" ] || error "No refreshToken found in Keychain data"
[ -n "$EXPIRES" ] || error "No expiresAt found in Keychain data"

# Show token info
EXPIRES_DATE=$(date -r $((EXPIRES / 1000)) '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "unknown")
info "Token expires: $EXPIRES_DATE"

# Check if token is actually newer
CURRENT_EXPIRES=$(jq -r '.profiles["anthropic:claude-cli"].expires // 0' "$AUTH_PROFILES" 2>/dev/null || echo "0")
if [ "$EXPIRES" -le "$CURRENT_EXPIRES" ] 2>/dev/null; then
  warn "Keychain token is not newer than current token. Syncing anyway..."
fi

# Update auth-profiles.json
info "Updating $AUTH_PROFILES..."
jq --arg access "$ACCESS" \
   --arg refresh "$REFRESH" \
   --argjson expires "$EXPIRES" \
   '.profiles["anthropic:claude-cli"].access = $access |
    .profiles["anthropic:claude-cli"].refresh = $refresh |
    .profiles["anthropic:claude-cli"].expires = $expires' \
   "$AUTH_PROFILES" > /tmp/auth-profiles-updated.json

mv /tmp/auth-profiles-updated.json "$AUTH_PROFILES"
info "Token synced successfully!"

# Optionally restart gateway
if [ "${1:-}" = "--restart" ]; then
  info "Restarting gateway..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -x "$SCRIPT_DIR/models.sh" ]; then
    "$SCRIPT_DIR/models.sh" restart
  elif command -v clawdmodels >/dev/null 2>&1; then
    clawdmodels restart
  else
    warn "Could not find restart command. Please restart gateway manually."
  fi
fi

info "Done! Run 'pnpm clawdbot models status' to verify."
