---
name: context-aggregator
description: "Aggregates memory context from multiple sources into CONTEXT.md for session continuity"
homepage: https://docs.clawd.bot/hooks#context-aggregator
metadata:
  {
    "clawdbot":
      {
        "emoji": "🔄",
        "events": ["gateway:startup", "command:new"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with Clawdbot" }],
      },
  }
---

# Context Aggregator Hook

Aggregates memory from multiple sources into a unified `CONTEXT.md` file that provides session continuity.

## What It Does

1. **Collects Memory Sources**:
   - Recent hourly backups (last 48 hours)
   - Daily notes (`memory/YYYY-MM-DD.md`)
   - Active projects (`memory/active-projects.md`)
   - Session summaries
   - Recent conversation excerpts from session logs

2. **Generates CONTEXT.md**: Creates a unified context file in your workspace

3. **Updates Activity State**: Tracks last user message time from session logs

## Output

`CONTEXT.md` contains:

- Memory management reminders
- Recent hourly backups
- Recent daily notes
- Active projects
- Session summaries
- Recent conversation excerpts
- Current heartbeat state

## When It Runs

- On `gateway:startup` - Refreshes context when Clawdbot starts
- On `command:new` - Refreshes context for new session

For more frequent updates, configure a cron job to trigger it.

## Requirements

- **Config**: `workspace.dir` must be set

## Configuration

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "context-aggregator": {
          "enabled": true,
          "lookbackHours": 48
        }
      }
    }
  }
}
```

## Disabling

```bash
clawdbot hooks disable context-aggregator
```
