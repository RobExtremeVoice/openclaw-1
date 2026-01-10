#!/bin/bash
# Master daily build script - runs ARM (local) and x86 (k8s) in parallel
#
# This is the main entry point for daily builds, designed to be run via launchd.
# It orchestrates both architecture builds and reports combined results.
#
# Usage: ./scripts/daily-all.sh
#
# Environment variables:
#   SKIP_ARM=1       - Skip ARM build (local)
#   SKIP_X86=1       - Skip x86 build (k8s)
#   INCLUDE_E2E=1    - Also run E2E tests after builds pass

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$HOME/.clawdbot/daily-builds"
mkdir -p "$RESULTS_DIR"
SUMMARY_FILE="$RESULTS_DIR/summary-$(date +%Y-%m-%d).log"

# Trap to ensure we always write summary
cleanup() {
  echo "" >> "$SUMMARY_FILE"
  echo "Completed: $(date)" >> "$SUMMARY_FILE"
}
trap cleanup EXIT

echo "=== Daily Build Orchestrator ===" | tee "$SUMMARY_FILE"
echo "Started: $(date)" | tee -a "$SUMMARY_FILE"
echo "Running ARM build locally and x86 build on k8s in parallel..." | tee -a "$SUMMARY_FILE"
echo "" | tee -a "$SUMMARY_FILE"

ARM_STATUS=0
X86_STATUS=0
ARM_PID=""
X86_PID=""

# Start ARM build (unless skipped)
if [[ "${SKIP_ARM:-0}" != "1" ]]; then
  (
    echo "[ARM] Starting local build..."
    "$SCRIPT_DIR/daily-build.sh" 2>&1 | sed 's/^/[ARM] /'
  ) &
  ARM_PID=$!
  echo "ARM build started (PID: $ARM_PID)" | tee -a "$SUMMARY_FILE"
else
  echo "ARM build: SKIPPED" | tee -a "$SUMMARY_FILE"
fi

# Start x86 build (unless skipped)
if [[ "${SKIP_X86:-0}" != "1" ]]; then
  (
    echo "[x86] Starting k8s build..."
    "$SCRIPT_DIR/daily-build-k8s.sh" 2>&1 | sed 's/^/[x86] /'
  ) &
  X86_PID=$!
  echo "x86 build started (PID: $X86_PID)" | tee -a "$SUMMARY_FILE"
else
  echo "x86 build: SKIPPED" | tee -a "$SUMMARY_FILE"
fi

# Wait for builds to complete
echo "" | tee -a "$SUMMARY_FILE"
echo "Waiting for builds to complete..." | tee -a "$SUMMARY_FILE"

if [[ -n "$ARM_PID" ]]; then
  wait "$ARM_PID" || ARM_STATUS=$?
fi

if [[ -n "$X86_PID" ]]; then
  wait "$X86_PID" || X86_STATUS=$?
fi

# Report results
echo "" | tee -a "$SUMMARY_FILE"
echo "=== Build Results ===" | tee -a "$SUMMARY_FILE"

if [[ "${SKIP_ARM:-0}" != "1" ]]; then
  if [[ $ARM_STATUS -eq 0 ]]; then
    echo "✅ ARM (Mac): PASSED" | tee -a "$SUMMARY_FILE"
  else
    echo "❌ ARM (Mac): FAILED (exit code: $ARM_STATUS)" | tee -a "$SUMMARY_FILE"
  fi
fi

if [[ "${SKIP_X86:-0}" != "1" ]]; then
  if [[ $X86_STATUS -eq 0 ]]; then
    echo "✅ x86 (k8s): PASSED" | tee -a "$SUMMARY_FILE"
  else
    echo "❌ x86 (k8s): FAILED (exit code: $X86_STATUS)" | tee -a "$SUMMARY_FILE"
  fi
fi

# Run E2E if requested and builds passed
E2E_STATUS=0
if [[ "${INCLUDE_E2E:-0}" == "1" ]]; then
  if [[ $ARM_STATUS -eq 0 && $X86_STATUS -eq 0 ]]; then
    echo "" | tee -a "$SUMMARY_FILE"
    echo "=== Running E2E Tests ===" | tee -a "$SUMMARY_FILE"
    if "$SCRIPT_DIR/daily-e2e-k8s.sh" 2>&1 | sed 's/^/[E2E] /' | tee -a "$SUMMARY_FILE"; then
      echo "✅ E2E: PASSED" | tee -a "$SUMMARY_FILE"
    else
      E2E_STATUS=1
      echo "❌ E2E: FAILED" | tee -a "$SUMMARY_FILE"
    fi
  else
    echo "" | tee -a "$SUMMARY_FILE"
    echo "E2E tests: SKIPPED (builds failed)" | tee -a "$SUMMARY_FILE"
  fi
fi

# Final summary
echo "" | tee -a "$SUMMARY_FILE"
echo "=== Summary ===" | tee -a "$SUMMARY_FILE"
echo "Results saved to: $RESULTS_DIR/" | tee -a "$SUMMARY_FILE"

OVERALL_STATUS=0
if [[ $ARM_STATUS -ne 0 || $X86_STATUS -ne 0 || $E2E_STATUS -ne 0 ]]; then
  OVERALL_STATUS=1
  echo "" | tee -a "$SUMMARY_FILE"
  echo "❌ DAILY BUILD FAILED" | tee -a "$SUMMARY_FILE"
  exit 1
fi

echo "" | tee -a "$SUMMARY_FILE"
echo "✅ ALL BUILDS PASSED" | tee -a "$SUMMARY_FILE"
