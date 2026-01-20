---
summary: "Claude Code integration: start and manage Claude Code sessions via chat"
read_when:
  - Starting Claude Code sessions from chat
  - Managing project aliases
---
# Claude Code

Start and manage [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions directly from chat.

## Quick start

```
/claude juzi          # Start session in project "juzi"
/claude juzi @main    # Start in worktree
/claude status        # Show active sessions
/claude cancel abc123 # Cancel session by token
```

## Project resolution

Projects are resolved in this order:

1. **Absolute paths** (starts with `/`)
2. **Registered aliases** (from config)
3. **Auto-discovered** (from search directories)

### Absolute paths

```
/claude /Users/dydo/Documents/agent/myproject
```

### Registered aliases

Register custom project names:

```
/claude register acme /work/clients/acme/main-app
/claude acme  # Uses the registered path
```

### Worktrees

Use `@` to specify a git worktree:

```
/claude juzi @experimental
```

This looks for `.worktrees/experimental` inside the project directory.

## Commands

| Command | Description |
|---------|-------------|
| `/claude <project>` | Start a session |
| `/claude <project> @<worktree>` | Start in worktree |
| `/claude status` | Show active sessions |
| `/claude cancel <token>` | Cancel a session |
| `/claude say <token> <msg>` | Send message to session |
| `/claude projects` | List known projects |
| `/claude register <name> <path>` | Register project alias |
| `/claude unregister <name>` | Remove project alias |

## Configuration

Add to `clawdbot.json`:

```json5
{
  claudeCode: {
    // Additional directories to scan for projects (searched first)
    projectDirs: [
      "~/work/clients",
      "~/repos"
    ],
    // Explicit project aliases (take priority over auto-discovery)
    projects: {
      acme: "/work/clients/acme/main-app",
      exp: "~/Documents/agent/juzi/.worktrees/experimental"
    },
    // Default permission mode: "default" | "acceptEdits" | "bypassPermissions"
    permissionMode: "bypassPermissions",
    // Default model for Claude Code sessions
    model: "opus"
  }
}
```

### Default search directories

When no `projectDirs` are configured, these directories are searched:

- `~/clawd/projects`
- `~/Documents/agent`
- `~/projects`
- `~/code`
- `~/dev`

Config directories are searched first, then defaults.

## Session status (Telegram)

On Telegram, sessions show a live status bubble with:

- Current phase/status
- Runtime
- **Continue** / **Cancel** buttons

The bubble updates automatically as the session progresses.

## Message forwarding

Session activity is forwarded to chat with emoji indicators:

- **🐶** User/DyDo messages
- **💬** Claude Code responses
- **▸** Tool in progress (reading, writing, running)
- **✓** Tool completed

This lets you follow the conversation between DyDo and Claude Code in real-time.

## Chiming in

To send a message to an active session (e.g., provide context or instructions):

```
/claude say abc123 Please also add error handling
```

Where `abc123` is the first 8 characters of the session token (shown in status bubble).

## Runtime limits

Sessions automatically pause after **3 hours** to prevent runaway execution. When paused:

1. A warning message is sent to chat
2. Use the **Continue** button to resume (resets the timer)
3. Or use `/claude cancel <token>` to stop

## Notes

- Sessions run in `bypassPermissions` mode by default (no permission prompts)
- Only authorized senders can use `/claude`
- Use `/claude projects` to see all known projects and search directories
- Questions from Claude Code are forwarded to chat - reply with `/claude say`
