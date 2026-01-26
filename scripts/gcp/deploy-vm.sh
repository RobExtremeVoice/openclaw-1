#!/usr/bin/env bash
# Deploy Clawdbot to GCP Compute Engine VM with Container-Optimized OS
# Usage: ./deploy-vm.sh [MACHINE_TYPE]
set -euo pipefail

MACHINE_TYPE="${1:-e2-micro}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value compute/region 2>/dev/null)
ZONE="${REGION}-b"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No GCP project configured. Run: gcloud config set project PROJECT_ID"
  exit 1
fi

IMAGE="gcr.io/${PROJECT_ID}/clawdbot:latest"
SA_EMAIL="clawdbot-sa@${PROJECT_ID}.iam.gserviceaccount.com"
VM_NAME="clawdbot-vm"

echo "Deploying Clawdbot Gateway"
echo "  Project: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Zone: $ZONE"
echo "  Machine type: $MACHINE_TYPE"
echo "  Image: $IMAGE"
echo ""

# Check if VM exists
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &>/dev/null; then
  echo "VM already exists. Updating container..."
  gcloud compute instances update-container "$VM_NAME" \
    --zone="$ZONE" \
    --container-image="$IMAGE"
  echo ""
  echo "Container updated. Restarting VM..."
  gcloud compute instances reset "$VM_NAME" --zone="$ZONE"
else
  echo "Creating new VM..."
  gcloud compute instances create-with-container "$VM_NAME" \
    --project="$PROJECT_ID" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --network-interface=network-tier=STANDARD,subnet=default,no-address \
    --shielded-secure-boot \
    --shielded-vtpm \
    --shielded-integrity-monitoring \
    --container-image="$IMAGE" \
    --container-restart-policy=always \
    --container-env=NODE_ENV=production,GATEWAY_PORT=18789,GATEWAY_BIND=0.0.0.0 \
    --metadata=enable-oslogin=TRUE \
    --tags=clawdbot \
    --boot-disk-size=10GB \
    --boot-disk-type=pd-standard \
    --service-account="$SA_EMAIL" \
    --scopes=https://www.googleapis.com/auth/cloud-platform
fi

echo ""
echo "Deployment complete!"
echo ""
echo "Machine type costs (approximate):"
echo "  e2-micro: Free tier eligible (1 vCPU shared, 1GB RAM)"
echo "  e2-small: ~\$13/mo (2 vCPU shared, 2GB RAM)"
echo "  e2-medium: ~\$25/mo (2 vCPU, 4GB RAM)"
echo ""
echo "Connect with: ./connect.sh"
echo "Or manually: gcloud compute start-iap-tunnel $VM_NAME 18789 --local-host-port=localhost:18789 --zone=$ZONE"
