#!/bin/bash
# Clawdbot PreToolUse Hook: STRICT read-only for non-local databases
# Based on Claude Code hooks in ~/code/yieldnest/yieldnest-api/.claude/hooks/
#
# Only SELECT allowed on remote DBs - everything else blocked

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only process Bash/exec tools
[[ "$TOOL" != "Bash" && "$TOOL" != "exec" ]] && echo '{"decision": "approve"}' && exit 0

# Known non-local DB patterns (customize as needed)
REMOTE_HOSTS="gondola|maglev|railway|\.up\.railway\.app|staging|prod|amazonaws\.com|azure|supabase|neon\.tech|planetscale"

# Check if command involves any remote database
if echo "$COMMAND" | grep -qiE "($REMOTE_HOSTS)"; then
  
  # Block any non-SELECT SQL operations
  if echo "$COMMAND" | grep -qiE "(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|COPY|VACUUM|ANALYZE|REINDEX|REFRESH|LOCK|COMMENT)\s"; then
    echo '{"decision": "deny", "reason": "🚫 Write operation blocked on remote DB. Only SELECT queries allowed on staging/prod. Use local DB for writes."}'
    exit 0
  fi
  
  # Block psql -c with non-SELECT
  if echo "$COMMAND" | grep -qiE "psql.*-c\s*['\"]?\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)"; then
    echo '{"decision": "deny", "reason": "🚫 Write operation blocked on remote DB. Only SELECT allowed."}'
    exit 0
  fi
  
  # Block piped writes
  if echo "$COMMAND" | grep -qiE "(echo|cat|printf).*\|.*psql" && echo "$COMMAND" | grep -qiE "(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)"; then
    echo '{"decision": "deny", "reason": "🚫 Piped write operation blocked on remote DB."}'
    exit 0
  fi
fi

# Block ORM/migration commands on non-local
if echo "$COMMAND" | grep -qiE "(prisma|typeorm|knex|sequelize|drizzle|migrate|seed|db:push|db:seed|sync)"; then
  if echo "$COMMAND" | grep -qiE "($REMOTE_HOSTS|APP_ENV.*(prod|staging)|NODE_ENV.*(prod|staging))"; then
    echo '{"decision": "deny", "reason": "🚫 Migrations/seeds blocked on remote DB. Only run on local."}'
    exit 0
  fi
fi

# Block connection strings pointing to remote with potential writes
if echo "$COMMAND" | grep -qiE "(DATABASE_URL|postgres://|postgresql://|mysql://|mongodb).*($REMOTE_HOSTS)"; then
  if echo "$COMMAND" | grep -qiE "(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|migrate|seed|push|sync)"; then
    echo '{"decision": "deny", "reason": "🚫 Non-read operation blocked on remote DB."}'
    exit 0
  fi
fi

echo '{"decision": "approve"}'
