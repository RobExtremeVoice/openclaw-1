#!/usr/bin/env bash
# Connect to Clawdbot Gateway via IAP tunnel
# Usage: ./connect.sh [VM_NAME]
set -euo pipefail

VM_NAME="${1:-clawdbot-vm}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value compute/region 2>/dev/null)
ZONE="${REGION}-b"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No GCP project configured. Run: gcloud config set project PROJECT_ID"
  exit 1
fi

echo "Starting IAP tunnel to Clawdbot Gateway"
echo "  VM: $VM_NAME"
echo "  Zone: $ZONE"
echo ""
echo "Access at: http://localhost:18789"
echo "Press Ctrl+C to disconnect"
echo ""

gcloud compute start-iap-tunnel "$VM_NAME" 18789 \
  --local-host-port=localhost:18789 \
  --zone="$ZONE" \
  --project="$PROJECT_ID"
