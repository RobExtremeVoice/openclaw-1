#!/bin/bash
# Clawdbot PreToolUse Hook: Prevent dangerous rm operations
#
# Blocks:
# - rm -rf /
# - rm on home directory
# - rm on common system directories
# - rm without -i on important directories

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only process Bash/exec tools
[[ "$TOOL" != "Bash" && "$TOOL" != "exec" ]] && echo '{"decision": "approve"}' && exit 0

# Skip if not an rm command
if ! echo "$COMMAND" | grep -qE '(^|\s|;|\||&&)rm\s'; then
  echo '{"decision": "approve"}'
  exit 0
fi

# Block rm -rf /
if echo "$COMMAND" | grep -qE 'rm\s+.*-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+/?(\s|$|;|\||&&)'; then
  echo '{"decision": "deny", "reason": "🚫 rm -rf / is blocked. Use trash instead for safe deletion."}'
  exit 0
fi

# Block rm on home directory
if echo "$COMMAND" | grep -qE 'rm\s+.*(\$HOME|~|/home/[^/]+)\s*/?(\s|$|;|\||&&)'; then
  echo '{"decision": "deny", "reason": "🚫 rm on home directory is blocked. Use trash instead."}'
  exit 0
fi

# Block rm on system directories
if echo "$COMMAND" | grep -qE 'rm\s+.*(^|\s)/(usr|bin|sbin|etc|var|opt|lib|System|Applications)\s*/?'; then
  echo '{"decision": "deny", "reason": "🚫 rm on system directories is blocked."}'
  exit 0
fi

# Block rm -rf without explicit path (could be dangerous)
if echo "$COMMAND" | grep -qE 'rm\s+.*-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s*\*'; then
  echo '{"decision": "deny", "reason": "🚫 rm -rf * is too dangerous. Be more specific or use trash."}'
  exit 0
fi

echo '{"decision": "approve"}'
