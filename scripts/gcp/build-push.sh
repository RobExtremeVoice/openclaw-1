#!/usr/bin/env bash
# Build and push production Docker image to GCR
# Usage: ./build-push.sh [local|cloud]
set -euo pipefail

BUILD_MODE="${1:-local}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No GCP project configured. Run: gcloud config set project PROJECT_ID"
  exit 1
fi

IMAGE="gcr.io/${PROJECT_ID}/clawdbot:latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building image: $IMAGE"
echo "Build mode: $BUILD_MODE"
echo ""

cd "$REPO_ROOT"

if [[ "$BUILD_MODE" == "cloud" ]]; then
  # Build on GCP Cloud Build (no local Docker needed)
  echo "Building on Cloud Build..."
  gcloud builds submit \
    --tag "$IMAGE" \
    --timeout=1800s \
    -f Dockerfile.production \
    .
else
  # Build locally and push
  echo "Building locally..."
  docker build \
    -f Dockerfile.production \
    -t "$IMAGE" \
    .

  echo ""
  echo "Pushing to GCR..."
  docker push "$IMAGE"
fi

echo ""
echo "Image pushed: $IMAGE"
echo ""
echo "Next: Deploy with ./deploy-vm.sh or ./deploy-cloudrun.sh"
