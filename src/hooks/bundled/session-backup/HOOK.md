---
name: session-backup
description: "Automated hourly session backups with activity-based lifecycle management"
homepage: https://docs.clawd.bot/hooks#session-backup
metadata:
  {
    "clawdbot":
      {
        "emoji": "📦",
        "events": ["command:new", "gateway:startup"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with Clawdbot" }],
      },
  }
---

# Session Backup Hook

Automatically creates detailed hourly backups of your conversations and manages backup lifecycle based on activity.

## What It Does

1. **Tracks Activity**: Monitors when you last sent a message
2. **Hourly Backups**: Creates detailed conversation backups every hour while you're active
3. **Grace Period**: After 1-2 hours of inactivity, creates a final backup
4. **Auto-Stop**: Stops backing up after 2+ hours of inactivity until you return

## Backup Contents

Each backup file (`memory/hourly-backups/YYYY-MM-DD-HH00.md`) contains:

- Conversation log from the session
- Timestamp and session metadata
- Sections for extracted insights (decisions, preferences, action items)

## State Management

Activity is tracked in `memory/heartbeat-state.json`:

```json
{
  "lastBackup": 1234567890,
  "lastUserMessage": 1234567890,
  "backupActive": true
}
```

## Lifecycle

```
User sends message → backupActive=true, lastUserMessage=now
  ↓
Hourly cron runs → creates backup if active
  ↓
User goes idle (1-2 hours) → final backup, backupActive=false
  ↓
Hourly cron runs → skips (backupActive=false)
  ↓
User returns → backupActive=true, cycle restarts
```

## Configuration

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-backup": {
          "enabled": true,
          "graceHours": 2,
          "backupIntervalMinutes": 60
        }
      }
    }
  }
}
```

## Requirements

- **Config**: `workspace.dir` must be set

## Disabling

```bash
clawdbot hooks disable session-backup
```
