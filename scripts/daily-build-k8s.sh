#!/bin/bash
# Daily x86 build and tests on k8s cluster
# Runs lint, build, test on x86 architecture (matches upstream CI)
#
# Prerequisites:
# - kubectl configured with access to clawdbot namespace
# - k8s cluster with x86 nodes
#
# Usage: ./scripts/daily-build-k8s.sh

set -euo pipefail

K8S_NAMESPACE="${CLAWDBOT_K8S_NAMESPACE:-clawdbot}"
JOB_NAME="daily-build-x86"
RESULTS_DIR="$HOME/.clawdbot/daily-builds"
mkdir -p "$RESULTS_DIR"

echo "=== x86 Daily Build: $(date) ==="
echo "Namespace: $K8S_NAMESPACE"

# Check kubectl access
if ! kubectl -n "$K8S_NAMESPACE" get namespace "$K8S_NAMESPACE" &>/dev/null; then
  echo "Creating namespace $K8S_NAMESPACE..."
  kubectl create namespace "$K8S_NAMESPACE" || true
fi

# Delete previous job if exists
echo "Cleaning up previous job..."
kubectl -n "$K8S_NAMESPACE" delete job "$JOB_NAME" --ignore-not-found

# Create build job
echo "Creating build job..."
kubectl -n "$K8S_NAMESPACE" apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: daily-build-x86
  labels:
    purpose: daily-build
    arch: x86
spec:
  ttlSecondsAfterFinished: 86400
  activeDeadlineSeconds: 900
  template:
    spec:
      containers:
      - name: builder
        image: node:22-bookworm
        resources:
          requests:
            memory: "2Gi"
            cpu: "2"
          limits:
            memory: "4Gi"
            cpu: "4"
        command: ["sh", "-c"]
        args:
        - |
          set -e
          echo "=== x86 Build Started: $(date) ==="
          echo "Node.js: $(node --version)"
          echo "Architecture: $(uname -m)"

          echo ""
          echo "=== Cloning upstream ==="
          git clone --depth 1 https://github.com/clawdbot/clawdbot.git /app
          cd /app
          echo "Commit: $(git rev-parse --short HEAD)"

          echo ""
          echo "=== Installing pnpm ==="
          npm install -g pnpm
          echo "pnpm: $(pnpm --version)"

          echo ""
          echo "=== Installing dependencies ==="
          pnpm install

          echo ""
          echo "=== Lint ==="
          pnpm lint

          echo ""
          echo "=== Build ==="
          pnpm build

          echo ""
          echo "=== Tests ==="
          pnpm test

          echo ""
          echo "=== Protocol Check ==="
          pnpm protocol:check

          echo ""
          echo "=== SUCCESS: x86 build passed ==="
          echo "Completed: $(date)"
      restartPolicy: Never
  backoffLimit: 1
EOF

echo "Job created. Waiting for completion (timeout: 15m)..."

# Wait for completion
if kubectl -n "$K8S_NAMESPACE" wait --for=condition=complete "job/$JOB_NAME" --timeout=900s 2>/dev/null; then
  echo ""
  echo "=== Job completed successfully ==="
  kubectl -n "$K8S_NAMESPACE" logs "job/$JOB_NAME" > "$RESULTS_DIR/x86-$(date +%Y-%m-%d).log"
  echo "Logs saved to: $RESULTS_DIR/x86-$(date +%Y-%m-%d).log"
  echo ""
  echo "=== Last 20 lines ==="
  tail -20 "$RESULTS_DIR/x86-$(date +%Y-%m-%d).log"
  echo ""
  echo "✅ x86 build PASSED"
else
  echo ""
  echo "=== Job failed or timed out ==="
  kubectl -n "$K8S_NAMESPACE" logs "job/$JOB_NAME" > "$RESULTS_DIR/x86-$(date +%Y-%m-%d)-FAILED.log" 2>/dev/null || true
  echo "Logs saved to: $RESULTS_DIR/x86-$(date +%Y-%m-%d)-FAILED.log"
  echo ""
  echo "=== Last 50 lines ==="
  kubectl -n "$K8S_NAMESPACE" logs "job/$JOB_NAME" 2>/dev/null | tail -50 || echo "(no logs available)"
  echo ""
  echo "❌ x86 build FAILED"
  exit 1
fi
