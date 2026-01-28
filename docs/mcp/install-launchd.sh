#!/usr/bin/env bash
set -euo pipefail

LABEL="com.bvisible.mcp-ssh-manager"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/mcp-ssh-manager"
OUT_LOG="$LOG_DIR/out.log"
ERR_LOG="$LOG_DIR/err.log"

fail_cleanup() {
  if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
  fi
  if [ -f "$PLIST_PATH" ]; then
    rm -f "$PLIST_PATH" || true
  fi
}

usage() {
  echo "usage: $0 {install|uninstall|status|logs}"
}

pick_node() {
  if [ -x /opt/homebrew/bin/node ]; then
    echo /opt/homebrew/bin/node
  elif [ -x /usr/local/bin/node ]; then
    echo /usr/local/bin/node
  elif command -v node >/dev/null 2>&1; then
    command -v node
  else
    echo ""
  fi
}

find_repo_up() {
  local dir="$PWD"
  for _ in 0 1 2 3 4 5; do
    local pj="$dir/package.json"
    if [ -f "$pj" ] && /usr/bin/grep -E '"name"[[:space:]]*:[[:space:]]*"[^\"]*mcp-ssh-manager' "$pj" >/dev/null 2>&1; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

find_repo_search() {
  local base
  for base in "$HOME/code" "$HOME/projects" "$HOME/src"; do
    if [ -d "$base" ]; then
      local hit
      hit="$(find "$base" -maxdepth 3 -type d -name '*mcp-ssh-manager*' 2>/dev/null | head -n 1)"
      if [ -n "$hit" ]; then
        echo "$hit"
        return 0
      fi
    fi
  done
  return 1
}

find_binary_under() {
  local base
  for base in /usr/local /opt/homebrew; do
    if [ -d "$base" ]; then
      local hit
      hit="$(find "$base" -maxdepth 4 -type f -name 'mcp-ssh-manager' 2>/dev/null | head -n 1)"
      if [ -n "$hit" ]; then
        echo "$hit"
        return 0
      fi
    fi
  done
  return 1
}

write_plist() {
  local workdir="$1"
  shift
  local -a args=("$@")

  mkdir -p "$(dirname "$PLIST_PATH")" "$LOG_DIR"

  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0">'
    echo '<dict>'
    echo '  <key>Label</key>'
    echo "  <string>${LABEL}</string>"
    echo ''
    echo '  <key>ProgramArguments</key>'
    echo '  <array>'
    for arg in "${args[@]}"; do
      echo "    <string>${arg}</string>"
    done
    echo '  </array>'
    if [ -n "$workdir" ]; then
      echo ''
      echo '  <key>WorkingDirectory</key>'
      echo "  <string>${workdir}</string>"
    fi
    echo ''
    echo '  <key>EnvironmentVariables</key>'
    echo '  <dict>'
    echo '    <key>PATH</key>'
    echo '    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>'
    echo '  </dict>'
    echo ''
    echo '  <key>RunAtLoad</key>'
    echo '  <true/>'
    echo ''
    echo '  <key>KeepAlive</key>'
    echo '  <true/>'
    echo ''
    echo '  <key>StandardOutPath</key>'
    echo "  <string>${OUT_LOG}</string>"
    echo ''
    echo '  <key>StandardErrorPath</key>'
    echo "  <string>${ERR_LOG}</string>"
    echo '</dict>'
    echo '</plist>'
  } > "$PLIST_PATH"
}

install() {
  trap 'fail_cleanup' ERR

  local binary_path=""
  if command -v mcp-ssh-manager >/dev/null 2>&1; then
    binary_path="$(command -v mcp-ssh-manager)"
  else
    binary_path="$(find_binary_under || true)"
  fi

  if [ -n "$binary_path" ]; then
    echo "using binary: $binary_path"
    write_plist "" "$binary_path"
  else
    local repo=""
    repo="$(find_repo_up || true)"
    if [ -z "$repo" ]; then
      repo="$(find_repo_search || true)"
    fi

    if [ -z "$repo" ]; then
      echo "could not find mcp-ssh-manager binary or repo" >&2
      exit 1
    fi

    local pj="$repo/package.json"
    local has_start=""
    if [ -f "$pj" ] && /usr/bin/grep -E '"start"[[:space:]]*:' "$pj" >/dev/null 2>&1; then
      has_start=1
    fi

    if [ -n "$has_start" ]; then
      local pm=""
      if [ -f "$repo/pnpm-lock.yaml" ] && command -v pnpm >/dev/null 2>&1; then
        pm="$(command -v pnpm)"
        echo "using pnpm start in repo: $repo"
        write_plist "$repo" "$pm" "start"
      elif command -v npm >/dev/null 2>&1; then
        pm="$(command -v npm)"
        echo "using npm run start in repo: $repo"
        write_plist "$repo" "$pm" "run" "start"
      else
        echo "start script exists but npm or pnpm not found" >&2
        exit 1
      fi
    else
      local node
      node="$(pick_node)"
      if [ -z "$node" ]; then
        echo "node not found" >&2
        exit 1
      fi
      local entry=""
      for p in "dist/index.js" "build/index.js" "index.js" "src/index.ts"; do
        if [ -f "$repo/$p" ]; then
          entry="$repo/$p"
          break
        fi
      done
      if [ -z "$entry" ]; then
        echo "no entry file found in repo" >&2
        exit 1
      fi
      echo "using node entry: $entry"
      write_plist "$repo" "$node" "$entry"
    fi
  fi

  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  launchctl kickstart -k "gui/$(id -u)/${LABEL}"

  echo "installed: $PLIST_PATH"
  echo "logs: $LOG_DIR"
}

uninstall() {
  launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  echo "removed: $PLIST_PATH"
}

status() {
  launchctl print "gui/$(id -u)/${LABEL}"
}

logs() {
  tail -f "$OUT_LOG" "$ERR_LOG"
}

case "${1:-}" in
  install) install ;;
  uninstall) uninstall ;;
  status) status ;;
  logs) logs ;;
  *) usage; exit 1 ;;
esac
