# Quick Commands Extension

Fast slash commands for status queries that bypass the full conversation pipeline.

## Commands

| Command | Description |
|---------|-------------|
| `/qstatus` | Session status (model, thinking mode, usage) |
| `/board` | Open issues across repos with inline buttons |
| `/prs` | Open PRs with CI status |
| `/qralph` | Active Ralph dev sessions |
| `/qsessions` | Active tmux dev sessions |

## Features

- **Fast**: Commands execute directly without LLM call
- **Cheap**: No token consumption for status checks
- **Interactive**: Inline buttons for quick actions (Telegram)

## Configuration

Add to your `config.yaml`:

```yaml
plugins:
  quick-commands:
    repos:
      - atriumn/idynic
      - atriumn/veriumn
      - atriumn/ovrly
      - your-org/your-repo
```

## Requirements

- `gh` CLI installed and authenticated
- `tmux` for session commands
- For `/qstatus` with usage: Claude Code usage script at `~/clawd/skills/claude-code-usage`

## Why "q" prefix?

Some commands like `/status` and `/sessions` conflict with built-in Clawdbot commands.
The `q` prefix (for "quick") avoids collisions while keeping names memorable:

- `/qstatus` instead of `/status`
- `/qsessions` instead of `/sessions`
- `/qralph` instead of `/ralph`
