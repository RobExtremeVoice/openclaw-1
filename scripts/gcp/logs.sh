#!/usr/bin/env bash
# View Clawdbot container logs on GCP VM
# Usage: ./logs.sh [VM_NAME] [--follow]
set -euo pipefail

VM_NAME="${1:-clawdbot-vm}"
FOLLOW="${2:-}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value compute/region 2>/dev/null)
ZONE="${REGION}-b"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No GCP project configured. Run: gcloud config set project PROJECT_ID"
  exit 1
fi

echo "Fetching logs from $VM_NAME..."

if [[ "$FOLLOW" == "--follow" ]] || [[ "$FOLLOW" == "-f" ]]; then
  gcloud compute ssh "$VM_NAME" \
    --zone="$ZONE" \
    --tunnel-through-iap \
    --command="sudo journalctl -u konlet-startup -f"
else
  gcloud compute ssh "$VM_NAME" \
    --zone="$ZONE" \
    --tunnel-through-iap \
    --command="sudo journalctl -u konlet-startup -n 100"
fi
