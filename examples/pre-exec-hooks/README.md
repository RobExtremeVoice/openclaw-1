# Pre-Exec Hooks Examples

Example shell scripts that intercept Bash/exec tool calls before they run.

## Installation

Copy hooks to your workspace:

```bash
mkdir -p .clawdbot/hooks
cp safe-git.sh safe-db.sh .clawdbot/hooks/
chmod +x .clawdbot/hooks/*.sh
```

## Included Hooks

### safe-git.sh

Protects your git workflow:
- ❌ Blocks force pushes (`--force`, `-f`)
- ❌ Blocks pushes to protected branches (main, develop, staging, production)
- ❌ Blocks remote modifications
- ✅ Allows normal git operations

### safe-db.sh

Protects production databases:
- ❌ Blocks INSERT, UPDATE, DELETE, DROP on remote hosts
- ❌ Blocks migrations/seeds targeting staging/production
- ✅ Allows SELECT queries on remote DBs
- ✅ Allows all operations on localhost

### safe-rm.sh

Prevents catastrophic deletions:
- ❌ Blocks `rm -rf /`
- ❌ Blocks `rm` on system directories
- ❌ Blocks `rm -rf *` (wildcard)
- ✅ Allows normal file deletion

## Testing

```bash
# Test safe-git.sh
echo '{"tool_name":"exec","tool_input":{"command":"git push origin main"}}' | ./safe-git.sh
# → {"decision": "deny", "reason": "🚫 Pushing to protected branches is blocked..."}

# Test safe-db.sh  
echo '{"tool_name":"exec","tool_input":{"command":"psql -h prod.db.com -c \"DROP TABLE users\""}}' | ./safe-db.sh
# → {"decision": "deny", "reason": "🚫 Non-SELECT operations on remote databases are blocked."}
```

## Writing Your Own

See [Pre-Exec Hooks Documentation](../../docs/tools/pre-exec-hooks.md) for the full protocol.

Basic template:

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Your logic here
if should_block "$COMMAND"; then
  echo '{"decision": "deny", "reason": "Your message here"}'
  exit 0
fi

echo '{"decision": "approve"}'
```
