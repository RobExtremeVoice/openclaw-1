#!/bin/bash
# Pre-bash hook: Validate commands before execution
# Reads command from stdin as JSON

set -e

# Read the tool input from stdin
INPUT=$(cat)

# Extract the command being run
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

# Extract the base command (first word, handling paths)
BASE_CMD=$(echo "$COMMAND" | awk '{print $1}')

# Block rm -rf / (exact pattern)
if echo "$COMMAND" | grep -qE '^rm\s+.*-rf\s+/\s*$'; then
  echo '{"decision": "block", "reason": "Command blocked by pre-bash hook: rm -rf / is dangerous"}' >&2
  exit 2
fi

# Git-specific checks - only apply when actually running git
if [[ "$BASE_CMD" == "git" ]]; then
  # Extract git subcommand (second word)
  GIT_SUBCMD=$(echo "$COMMAND" | awk '{print $2}')

  # Block git push --force
  if [[ "$GIT_SUBCMD" == "push" ]] && echo "$COMMAND" | grep -qE '\s--force\b'; then
    echo '{"decision": "block", "reason": "Command blocked by pre-bash hook: git push --force is dangerous"}' >&2
    exit 2
  fi

  # Block git checkout and git switch
  if [[ "$GIT_SUBCMD" == "checkout" ]] || [[ "$GIT_SUBCMD" == "switch" ]]; then
    echo '{"decision": "block", "reason": "Command blocked by pre-bash hook: branch switching not allowed"}' >&2
    exit 2
  fi

  # Block mutating git stash operations (allow list/show/drop)
  if [[ "$GIT_SUBCMD" == "stash" ]]; then
    STASH_ACTION=$(echo "$COMMAND" | awk '{print $3}')
    if [[ "$STASH_ACTION" != "list" ]] && [[ "$STASH_ACTION" != "show" ]] && [[ "$STASH_ACTION" != "drop" ]]; then
      echo '{"decision": "block", "reason": "Command blocked by pre-bash hook: git stash mutations not allowed (use list/show/drop only)"}' >&2
      exit 2
    fi
  fi
fi

# Allow the command to proceed
exit 0
