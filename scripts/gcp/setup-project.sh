#!/usr/bin/env bash
# Create and setup a NEW GCP project for Clawdbot deployment
# Usage: ./setup-project.sh PROJECT_ID [REGION]
set -euo pipefail

PROJECT_ID="${1:-}"
REGION="${2:-us-east1}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Usage: $0 PROJECT_ID [REGION]"
  echo "Example: $0 clawdbot-$(date +%Y%m%d) us-east1"
  exit 1
fi

echo "Creating NEW GCP project: $PROJECT_ID in region: $REGION"
echo ""

# Create the project
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  echo "Project $PROJECT_ID already exists, using it..."
else
  echo "Creating project $PROJECT_ID..."
  gcloud projects create "$PROJECT_ID" --name="Clawdbot Gateway"
fi

# Set as active project
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"

# Check billing
echo ""
echo "Checking billing..."
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || echo "false")
if [[ "$BILLING" != "True" ]]; then
  echo ""
  echo "WARNING: Billing is not enabled for this project."
  echo "Enable billing at: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
  echo ""
  read -rp "Press Enter after enabling billing to continue..."
fi

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
    compute.googleapis.com \
    secretmanager.googleapis.com \
    containerregistry.googleapis.com \
    cloudbuild.googleapis.com \
    iap.googleapis.com

# Create service account
SA_NAME="clawdbot-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Creating service account: $SA_NAME"
if ! gcloud iam service-accounts describe "$SA_EMAIL" &>/dev/null; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Clawdbot Service Account"
else
  echo "Service account already exists"
fi

# Create firewall rule for IAP
echo "Creating firewall rule for IAP..."
if ! gcloud compute firewall-rules describe allow-iap-clawdbot &>/dev/null; then
  gcloud compute firewall-rules create allow-iap-clawdbot \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:18789,tcp:22 \
    --source-ranges=35.235.240.0/20 \
    --target-tags=clawdbot
else
  echo "Firewall rule already exists"
fi

echo ""
echo "Project setup complete!"
echo ""
echo "Next steps:"
echo "  1. Store secrets: ./store-secrets.sh"
echo "  2. Build and push image: ./build-push.sh"
echo "  3. Deploy VM: ./deploy-vm.sh"
