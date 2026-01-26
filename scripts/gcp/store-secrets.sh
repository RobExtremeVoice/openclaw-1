#!/usr/bin/env bash
# Store secrets in GCP Secret Manager
# Usage: ./store-secrets.sh
set -euo pipefail

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No GCP project configured. Run: gcloud config set project PROJECT_ID"
  exit 1
fi

echo "Storing secrets for project: $PROJECT_ID"
echo ""

# Function to create or update a secret
create_secret() {
  local name="$1"
  local prompt="$2"

  echo -n "$prompt: "
  read -rs value
  echo ""

  if [[ -z "$value" ]]; then
    echo "Skipping $name (empty value)"
    return
  fi

  if gcloud secrets describe "$name" &>/dev/null; then
    echo "$value" | gcloud secrets versions add "$name" --data-file=-
    echo "Updated secret: $name"
  else
    echo "$value" | gcloud secrets create "$name" --data-file=-
    echo "Created secret: $name"
  fi
}

# Gateway token
echo "Enter your Gateway token (generate with: openssl rand -hex 32)"
create_secret "clawdbot-gateway-token" "Gateway token"

# Anthropic API key (optional)
echo ""
echo "Enter your Anthropic API key (optional, press Enter to skip)"
create_secret "anthropic-api-key" "Anthropic API key"

# OpenAI API key (optional)
echo ""
echo "Enter your OpenAI API key (optional, press Enter to skip)"
create_secret "openai-api-key" "OpenAI API key"

# Grant service account access to secrets
SA_EMAIL="clawdbot-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo "Granting secret access to service account..."

for secret in clawdbot-gateway-token anthropic-api-key openai-api-key; do
  if gcloud secrets describe "$secret" &>/dev/null; then
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:$SA_EMAIL" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet 2>/dev/null || true
  fi
done

echo ""
echo "Secrets configured!"
echo ""
echo "Verify with: gcloud secrets list"
