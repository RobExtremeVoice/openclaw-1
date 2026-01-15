# Example Internal Hook Handlers

This directory contains example internal hook handlers that demonstrate how to extend clawdbot's agent behavior.

## Available Examples

### session-memory.ts

Saves session context to disk when the `/new` command is issued.

**Usage:**

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "handlers": [
        {
          "event": "command:new",
          "module": "./hooks/handlers/session-memory.ts"
        }
      ]
    }
  }
}
```

**What it does:**
- Listens for `/new` commands
- Saves session context to `~/.clawdbot/memory/sessions/`
- Generates timestamped JSON files with session state

**Output location:**
```
~/.clawdbot/memory/sessions/<session-key>_<timestamp>.json
```

### command-logger.ts

Logs all command events to a centralized log file.

**Usage:**

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "handlers": [
        {
          "event": "command",
          "module": "./hooks/handlers/command-logger.ts"
        }
      ]
    }
  }
}
```

**What it does:**
- Listens for all command events
- Appends command details to a log file
- Includes timestamp, action, session key, sender ID, and source

**Output location:**
```
~/.clawdbot/logs/commands.log
```

**Log format:**
```json
{"timestamp":"2025-01-15T10:30:00.000Z","action":"new","sessionKey":"main","senderId":"+1234567890","source":"whatsapp"}
{"timestamp":"2025-01-15T10:35:00.000Z","action":"stop","sessionKey":"main","senderId":"+1234567890","source":"telegram"}
```

## Creating Your Own Handlers

1. Create a new TypeScript file in this directory
2. Export a default function that matches the `InternalHookHandler` type
3. Add the handler to your config

**Template:**

```typescript
// hooks/handlers/my-handler.ts
import type { InternalHookHandler } from '../../src/hooks/internal-hooks.js';

const myHandler: InternalHookHandler = async (event) => {
  // Filter for specific events
  if (event.type !== 'command' || event.action !== 'new') {
    return;
  }

  // Your custom logic here
  console.log('Doing something custom!');
};

export default myHandler;
```

## Handler Best Practices

1. **Return early**: Filter out irrelevant events at the top of your handler
2. **Handle errors**: Wrap risky operations in try-catch blocks
3. **Keep it fast**: Avoid blocking operations; use fire-and-forget patterns
4. **Log clearly**: Prefix logs with `[handler-name]` for easy debugging
5. **Test locally**: Test your handlers before adding to production config

## Available Event Types

### Command Events

- `command` - All command events
- `command:new` - `/new` command
- `command:reset` - `/reset` command
- `command:stop` - `/stop` command

### Event Structure

```typescript
{
  type: 'command' | 'session' | 'agent',
  action: string,
  sessionKey: string,
  timestamp: Date,
  context: {
    sessionEntry?: SessionEntry,
    sessionId?: string,
    commandSource?: string,
    senderId?: string
  }
}
```

## More Examples

For more examples and detailed documentation, see:
- [Internal Hooks Documentation](../../docs/internal-hooks.md)
- [Configuration Guide](https://docs.clawd.bot/configuration#hooks)

## Contributing

Have a useful handler to share? Consider contributing it to the clawdbot repository!
