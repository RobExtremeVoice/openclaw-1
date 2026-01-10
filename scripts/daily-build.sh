#!/bin/bash
# Daily upstream sync, build, and test validation (ARM/Apple Silicon)
# Run via launchd at 06:00 daily or manually: ./scripts/daily-build.sh
#
# This script:
# 1. Syncs from upstream main
# 2. Reinstalls deps if lockfile changed
# 3. Runs the full quality gate (lint, build, test)
# 4. Optionally builds macOS app (set INCLUDE_MACOS_BUILD=1)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_DIR="$HOME/.clawdbot/daily-builds"
mkdir -p "$RESULTS_DIR"
RESULTS_FILE="$RESULTS_DIR/arm-$(date +%Y-%m-%d).log"

cd "$REPO_ROOT"

log() {
  echo "$1" | tee -a "$RESULTS_FILE"
}

log "=== Daily Build (ARM): $(date) ==="
log "Repository: $REPO_ROOT"

# 1. Sync from upstream
log ""
log "=== Syncing from upstream ==="
git fetch upstream
git checkout main

if ! git merge upstream/main --no-edit; then
  log "FAIL: Merge conflict with upstream"
  log "Manual intervention required"
  exit 1
fi

log "Synced to upstream/main"

# 2. Install deps (if lockfile changed)
if git diff HEAD~1 --name-only 2>/dev/null | grep -q "pnpm-lock.yaml"; then
  log ""
  log "=== Dependencies changed, reinstalling ==="
  pnpm install 2>&1 | tee -a "$RESULTS_FILE"
fi

# 3. Quality gate
log ""
log "=== Lint ==="
if pnpm lint 2>&1 | tee -a "$RESULTS_FILE"; then
  log "Lint: PASSED"
else
  log "Lint: FAILED (continuing...)"
fi

log ""
log "=== Build ==="
if pnpm build 2>&1 | tee -a "$RESULTS_FILE"; then
  log "Build: PASSED"
else
  log "FAIL: Build failed"
  mv "$RESULTS_FILE" "${RESULTS_FILE%.log}-FAILED.log"
  exit 1
fi

log ""
log "=== Tests ==="
if pnpm test 2>&1 | tee -a "$RESULTS_FILE"; then
  log "Tests: PASSED"
else
  log "FAIL: Tests failed"
  mv "$RESULTS_FILE" "${RESULTS_FILE%.log}-FAILED.log"
  exit 1
fi

# 4. macOS app build (optional, slower)
if [[ "${INCLUDE_MACOS_BUILD:-0}" == "1" ]]; then
  log ""
  log "=== macOS App Build ==="
  if swift build --package-path apps/macos 2>&1 | tee -a "$RESULTS_FILE"; then
    log "macOS Build: PASSED"
  else
    log "macOS Build: FAILED (non-fatal)"
  fi
fi

log ""
log "=== SUCCESS: Daily build (ARM) passed ==="
log "Results saved to: $RESULTS_FILE"
