#!/usr/bin/env bash
# Deploy Clawdbot to Cloud Run (pay-per-request, scales to zero)
# Usage: ./deploy-cloudrun.sh
set -euo pipefail

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value compute/region 2>/dev/null)

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No GCP project configured. Run: gcloud config set project PROJECT_ID"
  exit 1
fi

IMAGE="gcr.io/${PROJECT_ID}/clawdbot:latest"
SA_EMAIL="clawdbot-sa@${PROJECT_ID}.iam.gserviceaccount.com"
SERVICE_NAME="clawdbot"

echo "Deploying Clawdbot to Cloud Run"
echo "  Project: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Image: $IMAGE"
echo ""

# Build secret references
SECRETS=""
if gcloud secrets describe anthropic-api-key &>/dev/null; then
  SECRETS="${SECRETS}ANTHROPIC_API_KEY=anthropic-api-key:latest,"
fi
if gcloud secrets describe openai-api-key &>/dev/null; then
  SECRETS="${SECRETS}OPENAI_API_KEY=openai-api-key:latest,"
fi
if gcloud secrets describe clawdbot-gateway-token &>/dev/null; then
  SECRETS="${SECRETS}CLAWDBOT_GATEWAY_TOKEN=clawdbot-gateway-token:latest,"
fi

# Remove trailing comma
SECRETS="${SECRETS%,}"

# Deploy
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=1 \
  --port=18789 \
  --no-allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  ${SECRETS:+--set-secrets="$SECRETS"}

echo ""
echo "Deployment complete!"
echo ""

# Get service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
echo "Service URL: $SERVICE_URL"
echo ""
echo "Note: Cloud Run requires authentication. Use:"
echo "  gcloud run services add-iam-policy-binding $SERVICE_NAME \\"
echo "    --region=$REGION \\"
echo "    --member='user:YOUR_EMAIL' \\"
echo "    --role='roles/run.invoker'"
echo ""
echo "Or for public access (not recommended):"
echo "  gcloud run services add-iam-policy-binding $SERVICE_NAME \\"
echo "    --region=$REGION \\"
echo "    --member='allUsers' \\"
echo "    --role='roles/run.invoker'"
