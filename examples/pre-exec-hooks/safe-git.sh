#!/bin/bash
# Clawdbot PreToolUse Hook: Prevent pushes to protected branches
# Based on Claude Code hooks in ~/code/yieldnest/yieldnest-api/.claude/hooks/
#
# Allows: all git operations EXCEPT pushing to protected branches
# Protected branches: develop, production, staging, main

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only process Bash/exec tools
[[ "$TOOL" != "Bash" && "$TOOL" != "exec" ]] && echo '{"decision": "approve"}' && exit 0

# Block git remote modifications  
if echo "$COMMAND" | grep -qE 'git\s+remote\s+(add|remove|rm|set-url|rename)'; then
  echo '{"decision": "deny", "reason": "🚫 Modifying git remotes is blocked."}'
  exit 0
fi

# Block force push operations
# Match -f or --force as standalone arguments (preceded by whitespace, not as part of branch name)
if echo "$COMMAND" | grep -qE 'git\s+push\s+(-f\s|--force\s|-f$|--force$)'; then
  echo '{"decision": "deny", "reason": "🚫 Force push is blocked."}'
  exit 0
fi
if echo "$COMMAND" | grep -qE 'git\s+push\s+\S+\s+(-f\s|--force\s|-f$|--force$)'; then
  echo '{"decision": "deny", "reason": "🚫 Force push is blocked."}'
  exit 0
fi
if echo "$COMMAND" | grep -qE 'git\s+push\s+\S+\s+\S+\s+(-f|--force)(\s|$)'; then
  echo '{"decision": "deny", "reason": "🚫 Force push is blocked."}'
  exit 0
fi

# Block pushes to protected branches
if echo "$COMMAND" | grep -qE '(^|\s|;|\||&&)git\s+push'; then
  # Check for protected branch names in the push command
  if echo "$COMMAND" | grep -qE 'git\s+push\s+[^\s]+\s+(develop|production|staging|main)(\s|$|:)'; then
    echo '{"decision": "deny", "reason": "🚫 Pushing to protected branches (develop/production/staging/main) is blocked."}'
    exit 0
  fi
  
  # Check for push to origin with protected branch
  if echo "$COMMAND" | grep -qE 'git\s+push\s+origin\s+(develop|production|staging|main)'; then
    echo '{"decision": "deny", "reason": "🚫 Pushing to protected branches (develop/production/staging/main) is blocked."}'
    exit 0
  fi
fi

echo '{"decision": "approve"}'
