#!/usr/bin/env bash
set -euo pipefail

on_error() {
  echo "A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle" >&2
  echo "If this persists, verify pnpm deps and try again." >&2
}
trap on_error ERR

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HASH_FILE="$ROOT_DIR/src/canvas-host/a2ui/.bundle.hash"
OUTPUT_FILE="$ROOT_DIR/src/canvas-host/a2ui/a2ui.bundle.js"

INPUT_PATHS=(
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/pnpm-lock.yaml"
  "$ROOT_DIR/vendor/a2ui/renderers/lit"
  "$ROOT_DIR/apps/shared/ClawdbotKit/Tools/CanvasA2UI"
)

collect_files() {
  local path
  for path in "${INPUT_PATHS[@]}"; do
    if [[ -d "$path" ]]; then
      find "$path" -type f -print0
    else
      printf '%s\0' "$path"
    fi
  done
}

compute_hash() {
  local hash_cmd
  local hash_args=()
  if command -v shasum >/dev/null 2>&1; then
    hash_cmd="shasum"
    hash_args=("-a" "256")
  elif command -v sha256sum >/dev/null 2>&1; then
    hash_cmd="sha256sum"
  else
    echo "Error: shasum/sha256sum not found" >&2
    exit 1
  fi

  collect_files \
    | LC_ALL=C sort -z \
    | xargs -0 "$hash_cmd" "${hash_args[@]}" \
    | "$hash_cmd" "${hash_args[@]}" \
    | awk '{print $1}'
}

current_hash="$(compute_hash)"
if [[ -f "$HASH_FILE" ]]; then
  previous_hash="$(cat "$HASH_FILE")"
  if [[ "$previous_hash" == "$current_hash" && -f "$OUTPUT_FILE" ]]; then
    echo "A2UI bundle up to date; skipping."
    exit 0
  fi
fi

pnpm -s exec tsc -p vendor/a2ui/renderers/lit/tsconfig.json
rolldown -c apps/shared/ClawdbotKit/Tools/CanvasA2UI/rolldown.config.mjs

echo "$current_hash" > "$HASH_FILE"
