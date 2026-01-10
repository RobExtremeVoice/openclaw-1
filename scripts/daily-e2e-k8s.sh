#!/bin/bash
# Daily E2E tests on k8s cluster
# Runs E2E tests against a gateway instance in the cluster
#
# Prerequisites:
# - kubectl configured with access to clawdbot namespace
# - clawdbot-gateway deployment running (or will use internal gateway)
#
# Usage: ./scripts/daily-e2e-k8s.sh

set -euo pipefail

K8S_NAMESPACE="${CLAWDBOT_K8S_NAMESPACE:-clawdbot}"
JOB_NAME="daily-e2e"
GATEWAY_HOST="${CLAWDBOT_GATEWAY_HOST:-clawdbot-gateway.$K8S_NAMESPACE.svc.cluster.local}"
GATEWAY_PORT="${CLAWDBOT_GATEWAY_PORT:-8080}"
RESULTS_DIR="$HOME/.clawdbot/daily-builds"
mkdir -p "$RESULTS_DIR"

echo "=== E2E Tests: $(date) ==="
echo "Namespace: $K8S_NAMESPACE"
echo "Gateway: $GATEWAY_HOST:$GATEWAY_PORT"

# Check kubectl access
if ! kubectl -n "$K8S_NAMESPACE" get namespace "$K8S_NAMESPACE" &>/dev/null; then
  echo "Creating namespace $K8S_NAMESPACE..."
  kubectl create namespace "$K8S_NAMESPACE" || true
fi

# Delete previous job if exists
echo "Cleaning up previous job..."
kubectl -n "$K8S_NAMESPACE" delete job "$JOB_NAME" --ignore-not-found

# Create E2E job
echo "Creating E2E job..."
cat <<EOF | kubectl -n "$K8S_NAMESPACE" apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB_NAME
  labels:
    purpose: e2e-test
spec:
  ttlSecondsAfterFinished: 86400
  activeDeadlineSeconds: 600
  template:
    spec:
      containers:
      - name: runner
        image: node:22-bookworm
        env:
        - name: CLAWDBOT_GATEWAY_URL
          value: "ws://$GATEWAY_HOST:$GATEWAY_PORT"
        - name: CLAWDBOT_SKIP_PROVIDERS
          value: "1"
        resources:
          requests:
            memory: "1Gi"
            cpu: "1"
          limits:
            memory: "2Gi"
            cpu: "2"
        command: ["sh", "-c"]
        args:
        - |
          set -e
          echo "=== E2E Tests Started: $(date) ==="
          echo "Gateway URL: \$CLAWDBOT_GATEWAY_URL"

          echo ""
          echo "=== Cloning upstream ==="
          git clone --depth 1 https://github.com/clawdbot/clawdbot.git /app
          cd /app

          echo ""
          echo "=== Setup ==="
          npm install -g pnpm
          pnpm install

          echo ""
          echo "=== Running E2E Tests ==="
          pnpm test:e2e

          echo ""
          echo "=== SUCCESS: E2E tests passed ==="
      restartPolicy: Never
  backoffLimit: 2
EOF

echo "Job created. Waiting for completion (timeout: 10m)..."

# Wait for completion
if kubectl -n "$K8S_NAMESPACE" wait --for=condition=complete "job/$JOB_NAME" --timeout=600s 2>/dev/null; then
  echo ""
  echo "=== Job completed successfully ==="
  kubectl -n "$K8S_NAMESPACE" logs "job/$JOB_NAME" > "$RESULTS_DIR/e2e-$(date +%Y-%m-%d).log"
  echo "Logs saved to: $RESULTS_DIR/e2e-$(date +%Y-%m-%d).log"
  echo ""
  echo "✅ E2E tests PASSED"
else
  echo ""
  echo "=== Job failed or timed out ==="
  kubectl -n "$K8S_NAMESPACE" logs "job/$JOB_NAME" > "$RESULTS_DIR/e2e-$(date +%Y-%m-%d)-FAILED.log" 2>/dev/null || true
  echo ""
  echo "=== Last 50 lines ==="
  kubectl -n "$K8S_NAMESPACE" logs "job/$JOB_NAME" 2>/dev/null | tail -50 || echo "(no logs available)"
  echo ""
  echo "❌ E2E tests FAILED"
  exit 1
fi
