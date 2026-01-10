#!/bin/bash
# Check status of all registered Clawdbot instances
#
# Usage:
#   ./scripts/clawdbot-status.sh          # Check all instances
#   ./scripts/clawdbot-status.sh -v       # Verbose (show version info)
#   ./scripts/clawdbot-status.sh -j       # Output as JSON
#   ./scripts/clawdbot-status.sh <id>     # Check specific instance
#
# Reads from: scripts/clawdbot-instances.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCES_FILE="$SCRIPT_DIR/clawdbot-instances.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse args
VERBOSE=false
JSON_OUTPUT=false
SPECIFIC_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -v|--verbose) VERBOSE=true; shift ;;
    -j|--json) JSON_OUTPUT=true; shift ;;
    -h|--help)
      echo "Usage: $0 [-v|--verbose] [-j|--json] [instance-id]"
      echo ""
      echo "Options:"
      echo "  -v, --verbose   Show detailed info including versions"
      echo "  -j, --json      Output as JSON"
      echo "  instance-id     Check only this instance"
      echo ""
      echo "Instances are defined in: $INSTANCES_FILE"
      exit 0
      ;;
    *) SPECIFIC_ID="$1"; shift ;;
  esac
done

# Check dependencies
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required. Install with: brew install jq"
  exit 1
fi

if [[ ! -f "$INSTANCES_FILE" ]]; then
  echo "Error: Instances file not found: $INSTANCES_FILE"
  exit 1
fi

# Function to check instance health
check_instance() {
  local id="$1"
  local name="$2"
  local platform="$3"
  local arch="$4"
  local host="$5"
  local port="$6"
  local health_endpoint="$7"
  local version_configured="$8"
  local environment="$9"

  local status="unknown"
  local version_actual=""
  local response_time=""

  # Check health based on platform
  if [[ "$platform" == "k8s" ]]; then
    # For k8s, use kubectl to check if pod is running
    local pod_status
    pod_status=$(kubectl -n clawdbot get pods -l "app=${id}" -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "NotFound")

    if [[ "$pod_status" == "Running" ]]; then
      status="running"
    elif [[ "$pod_status" == "NotFound" ]]; then
      status="not_deployed"
    else
      status="$pod_status"
    fi
  else
    # For local instances, curl the health endpoint
    local start_time end_time

    # macOS compatible timing (seconds precision)
    start_time=$(date +%s)

    if curl -sf --connect-timeout 2 --max-time 5 "$health_endpoint" &>/dev/null; then
      end_time=$(date +%s)
      local elapsed=$((end_time - start_time))
      response_time="${elapsed}s"
      if [[ $elapsed -eq 0 ]]; then
        response_time="<1s"
      fi
      status="healthy"

      # Try to get version from health endpoint
      if $VERBOSE; then
        version_actual=$(curl -sf --max-time 2 "$health_endpoint" 2>/dev/null | jq -r '.version // empty' 2>/dev/null || echo "")
      fi
    else
      # Check if port is in use at all
      if lsof -i ":$port" &>/dev/null; then
        status="unhealthy"
      else
        status="stopped"
      fi
    fi
  fi

  # Output
  if $JSON_OUTPUT; then
    echo "{\"id\":\"$id\",\"name\":\"$name\",\"status\":\"$status\",\"platform\":\"$platform\",\"arch\":\"$arch\",\"port\":$port,\"environment\":\"$environment\",\"response_time\":\"$response_time\",\"version\":\"${version_actual:-$version_configured}\"}"
  else
    local status_icon status_color
    case "$status" in
      healthy|running) status_icon="✅"; status_color="$GREEN" ;;
      unhealthy) status_icon="⚠️"; status_color="$YELLOW" ;;
      stopped|not_deployed) status_icon="⭘"; status_color="$NC" ;;
      *) status_icon="❌"; status_color="$RED" ;;
    esac

    printf "${status_color}${status_icon} %-18s${NC}" "$id"
    printf "%-14s" "$status"
    printf "%-8s" "$platform"
    printf "%-8s" "$arch"
    printf ":%-6s" "$port"
    printf "%-12s" "$environment"

    if $VERBOSE && [[ -n "$version_actual" ]]; then
      printf " v%s" "$version_actual"
    fi
    if [[ -n "$response_time" ]]; then
      printf " (%s)" "$response_time"
    fi
    echo ""
  fi
}

# Header
if ! $JSON_OUTPUT; then
  echo ""
  echo "=== Clawdbot Instance Status ==="
  echo ""
  printf "%-20s" "ID"
  printf "%-14s" "STATUS"
  printf "%-8s" "PLATFORM"
  printf "%-8s" "ARCH"
  printf "%-7s" "PORT"
  printf "%-12s" "ENV"
  if $VERBOSE; then
    printf "VERSION"
  fi
  echo ""
  printf "%-20s" "────────────────────"
  printf "%-14s" "────────────"
  printf "%-8s" "────────"
  printf "%-8s" "────────"
  printf "%-7s" "──────"
  printf "%-12s" "──────────"
  echo ""
fi

# JSON array start
if $JSON_OUTPUT; then
  echo "["
  first=true
fi

# Read and check each instance
while IFS= read -r instance; do
  id=$(echo "$instance" | jq -r '.id')

  # Skip if specific ID requested and doesn't match
  if [[ -n "$SPECIFIC_ID" && "$id" != "$SPECIFIC_ID" ]]; then
    continue
  fi

  name=$(echo "$instance" | jq -r '.name')
  platform=$(echo "$instance" | jq -r '.platform')
  arch=$(echo "$instance" | jq -r '.arch')
  host=$(echo "$instance" | jq -r '.host')
  port=$(echo "$instance" | jq -r '.port')
  health_endpoint=$(echo "$instance" | jq -r '.healthEndpoint')
  version=$(echo "$instance" | jq -r '.version')
  environment=$(echo "$instance" | jq -r '.environment')

  if $JSON_OUTPUT; then
    if ! $first; then echo ","; fi
    first=false
  fi

  check_instance "$id" "$name" "$platform" "$arch" "$host" "$port" "$health_endpoint" "$version" "$environment"

done < <(jq -c '.instances[]' "$INSTANCES_FILE")

# JSON array end
if $JSON_OUTPUT; then
  echo ""
  echo "]"
fi

# Footer
if ! $JSON_OUTPUT; then
  echo ""
  echo "Legend: ✅ healthy  ⚠️ unhealthy  ⭘ stopped  ❌ error"
  echo ""
  echo "Commands:"
  echo "  View logs:    jq -r '.instances[] | select(.id==\"<id>\") | .logsCommand' $INSTANCES_FILE | bash"
  echo "  Edit config:  \$EDITOR $INSTANCES_FILE"
  echo ""
fi
