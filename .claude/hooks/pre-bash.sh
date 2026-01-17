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

  # Detect if we're operating on a git worktree (not the main working tree)
  IN_WORKTREE=0

  # Simple heuristic: if command includes "cd" to a path containing ".worktrees/", allow it
  # Use .* instead of [^&]* to properly capture paths in compound commands
  if echo "$COMMAND" | grep -qE 'cd\s+.*\.worktrees'; then
    IN_WORKTREE=1
  # Or if the current directory is a worktree
  elif git rev-parse --git-dir &>/dev/null 2>&1; then
    GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
    if [[ -f ".git" ]] || [[ "$GIT_DIR" == *"/worktrees/"* ]]; then
      IN_WORKTREE=1
    fi
  fi

  # Block git checkout and git switch in main working tree only
  # Allow in worktrees since they're isolated
  if [[ "$GIT_SUBCMD" == "checkout" ]] || [[ "$GIT_SUBCMD" == "switch" ]]; then
    if [[ "$IN_WORKTREE" -eq 0 ]]; then
      echo '{"decision": "block", "reason": "Command blocked by pre-bash hook: branch switching not allowed in main working tree (use worktrees for isolated work)"}' >&2
      exit 2
    fi
    # Allow in worktrees - they're isolated
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
