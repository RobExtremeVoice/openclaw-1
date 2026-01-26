#!/usr/bin/env bash
# SSH into Clawdbot VM via IAP
# Usage: ./ssh.sh [VM_NAME]
set -euo pipefail

VM_NAME="${1:-clawdbot-vm}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value compute/region 2>/dev/null)
ZONE="${REGION}-b"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No GCP project configured. Run: gcloud config set project PROJECT_ID"
  exit 1
fi

echo "Connecting to $VM_NAME via IAP tunnel..."
gcloud compute ssh "$VM_NAME" \
  --zone="$ZONE" \
  --tunnel-through-iap
