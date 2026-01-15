# Internal Agent Hooks

Internal hooks provide an extensible event-driven system for automating actions in response to agent commands and events. Similar to Claude Code's hook system, internal hooks let you trigger custom code when specific events occur within clawdbot.

## Overview

The internal hooks system allows you to:
- Save session context to memory when `/new` is issued
- Log all commands for auditing
- Trigger custom automations on agent lifecycle events
- Extend clawdbot's behavior without modifying core code

## Configuration

Enable internal hooks in your `~/.clawdbot/config.json`:

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "handlers": [
        {
          "event": "command:new",
          "module": "./hooks/handlers/session-memory.ts"
        },
        {
          "event": "command",
          "module": "./hooks/handlers/command-logger.ts"
        }
      ]
    }
  }
}
```

### Configuration Options

- **`enabled`** (boolean): Enable or disable internal hooks
- **`handlers`** (array): List of hook handler configurations
  - **`event`** (string): Event key to listen for (e.g., `command:new`, `session:start`)
  - **`module`** (string): Path to handler module (absolute or relative to cwd)
  - **`export`** (string, optional): Named export to use (defaults to `default`)

## Event Types

### Command Events

Triggered when agent commands are issued:

- **`command`**: All command events (general listener)
- **`command:new`**: When `/new` command is issued
- **`command:reset`**: When `/reset` command is issued
- **`command:stop`**: When `/stop` command is issued

### Event Context

Each event includes:

```typescript
{
  type: 'command' | 'session' | 'agent',
  action: string,              // e.g., 'new', 'reset', 'stop'
  sessionKey: string,          // Session identifier
  timestamp: Date,             // When the event occurred
  context: {
    sessionEntry?: SessionEntry,
    sessionId?: string,
    commandSource?: string,    // e.g., 'whatsapp', 'telegram'
    senderId?: string
  }
}
```

## Writing Hook Handlers

### Basic Handler

Create a handler module that exports a default function:

```typescript
// hooks/handlers/my-handler.ts
import type { InternalHookHandler } from '../../src/hooks/internal-hooks.js';

const myHandler: InternalHookHandler = async (event) => {
  console.log(`Event triggered: ${event.type}:${event.action}`);
  console.log(`Session: ${event.sessionKey}`);

  // Your custom logic here
};

export default myHandler;
```

### Named Export Handler

Use named exports for multiple handlers in one file:

```typescript
// hooks/handlers/analytics.ts
import type { InternalHookHandler } from '../../src/hooks/internal-hooks.js';

export const trackCommand: InternalHookHandler = async (event) => {
  // Track command usage
};

export const trackSession: InternalHookHandler = async (event) => {
  // Track session lifecycle
};
```

Configuration:

```json
{
  "event": "command",
  "module": "./hooks/handlers/analytics.ts",
  "export": "trackCommand"
}
```

## Example Handlers

### Session Memory Handler

Save session context when `/new` is issued:

```typescript
// hooks/handlers/session-memory.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { InternalHookHandler } from '../../src/hooks/internal-hooks.js';

const saveSessionToMemory: InternalHookHandler = async (event) => {
  if (event.type !== 'command' || event.action !== 'new') {
    return;
  }

  const memoryDir = path.join(os.homedir(), '.clawdbot', 'memory', 'sessions');
  await fs.mkdir(memoryDir, { recursive: true });

  const timestamp = event.timestamp.toISOString().replace(/[:.]/g, '-');
  const sessionSlug = event.sessionKey.replace(/[^a-zA-Z0-9]/g, '-');
  const memoryFile = path.join(memoryDir, `${sessionSlug}_${timestamp}.json`);

  await fs.writeFile(
    memoryFile,
    JSON.stringify({
      sessionKey: event.sessionKey,
      timestamp: event.timestamp.toISOString(),
      context: event.context,
    }, null, 2),
    'utf-8'
  );

  console.log(`[session-memory] Saved to ${memoryFile}`);
};

export default saveSessionToMemory;
```

### Command Logger

Log all commands to a file:

```typescript
// hooks/handlers/command-logger.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { InternalHookHandler } from '../../src/hooks/internal-hooks.js';

const logCommand: InternalHookHandler = async (event) => {
  if (event.type !== 'command') {
    return;
  }

  const logDir = path.join(os.homedir(), '.clawdbot', 'logs');
  await fs.mkdir(logDir, { recursive: true });

  const logFile = path.join(logDir, 'commands.log');
  const logLine = JSON.stringify({
    timestamp: event.timestamp.toISOString(),
    action: event.action,
    sessionKey: event.sessionKey,
    senderId: event.context.senderId ?? 'unknown',
    source: event.context.commandSource ?? 'unknown',
  }) + '\n';

  await fs.appendFile(logFile, logLine, 'utf-8');
};

export default logCommand;
```

### Git Commit on Session End

Automatically commit changes when starting a new session:

```typescript
// hooks/handlers/git-commit.ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { InternalHookHandler } from '../../src/hooks/internal-hooks.js';

const execAsync = promisify(exec);

const gitCommitOnNew: InternalHookHandler = async (event) => {
  if (event.action !== 'new') {
    return;
  }

  try {
    // Check if there are changes
    const { stdout: status } = await execAsync('git status --porcelain');
    if (!status.trim()) {
      return; // No changes to commit
    }

    // Commit changes
    await execAsync('git add .');
    await execAsync('git commit -m "Session checkpoint before /new"');
    console.log('[git-commit] Created checkpoint commit');
  } catch (err) {
    console.error('[git-commit] Failed:', err);
  }
};

export default gitCommitOnNew;
```

## Event Lifecycle

1. User issues a command (e.g., `/new`)
2. Command is validated and authorized
3. Internal hook event is created and triggered
4. All registered handlers for the event are called in order
5. Command processing continues
6. Handlers run asynchronously and errors are caught/logged

## Error Handling

- Handlers are wrapped in try-catch blocks
- Errors in one handler don't prevent other handlers from running
- Errors are logged to console with context
- Failed handlers don't block command processing

## Best Practices

### Keep Handlers Fast

Hooks run synchronously during command processing. Keep handlers lightweight:

```typescript
// ✓ Good - async work, returns immediately
const handler: InternalHookHandler = async (event) => {
  void processInBackground(event); // Fire and forget
};

// ✗ Bad - blocks command processing
const handler: InternalHookHandler = async (event) => {
  await slowDatabaseQuery(event);
  await evenSlowerAPICall(event);
};
```

### Handle Errors Gracefully

Always wrap risky operations:

```typescript
const handler: InternalHookHandler = async (event) => {
  try {
    await riskyOperation(event);
  } catch (err) {
    console.error('[my-handler] Failed:', err);
    // Don't throw - let other handlers run
  }
};
```

### Filter Events Early

Return early if the event isn't relevant:

```typescript
const handler: InternalHookHandler = async (event) => {
  // Only handle 'new' commands
  if (event.type !== 'command' || event.action !== 'new') {
    return;
  }

  // Your logic here
};
```

### Use Specific Event Keys

Register for specific events when possible:

```json
{
  "event": "command:new",  // Specific
  "module": "./my-handler.ts"
}
```

Rather than filtering in code:

```json
{
  "event": "command",      // General - more overhead
  "module": "./my-handler.ts"
}
```

## Debugging

### Enable Hook Logging

The gateway logs hook loading at startup:

```
[hooks] loaded 2 internal hook handlers
```

### Check Registration

In your handler, log when it's called:

```typescript
const handler: InternalHookHandler = async (event) => {
  console.log('[my-handler] Triggered:', event.type, event.action);
  // Your logic
};
```

### Verify Module Paths

Ensure module paths are correct:

```bash
# Absolute path
ls -la /home/user/.clawdbot/hooks/my-handler.ts

# Relative path (from where gateway runs)
ls -la ./hooks/my-handler.ts
```

## Testing

Test your handlers directly:

```typescript
import { test } from 'vitest';
import { createInternalHookEvent, triggerInternalHook } from './src/hooks/internal-hooks.js';
import myHandler from './hooks/handlers/my-handler.js';

test('my handler works', async () => {
  const event = createInternalHookEvent('command', 'new', 'test-session', {
    foo: 'bar'
  });

  await myHandler(event);

  // Assert side effects
});
```

## Architecture

### Core Components

- **`src/hooks/internal-hooks.ts`**: Core hook system (register, trigger, event types)
- **`src/hooks/loader.ts`**: Dynamic module loader
- **`src/gateway/server-startup.ts`**: Loads hooks at gateway start
- **`src/auto-reply/reply/commands-core.ts`**: Triggers command events
- **`src/auto-reply/reply/commands-session.ts`**: Triggers session events

### Flow

```
User sends /new
    ↓
Command validation
    ↓
Create hook event
    ↓
Trigger hook (all registered handlers)
    ↓
Command processing continues
    ↓
Session reset
```

## Migration from Webhook Hooks

If you're using webhook hooks, internal hooks complement them:

- **Webhook hooks**: External HTTP endpoints
- **Internal hooks**: In-process TypeScript functions

Internal hooks are better for:
- Local automations
- File system operations
- Direct access to session state
- Lower latency

Webhook hooks are better for:
- External integrations
- Remote services
- Language-agnostic handlers

## Roadmap

Future event types:

- **`session:start`**: When a new session begins
- **`session:end`**: When a session ends
- **`agent:error`**: When an agent encounters an error
- **`message:sent`**: When a message is sent
- **`message:received`**: When a message is received

## See Also

- [Hooks Configuration](/configuration#hooks)
- [Webhook Hooks](https://docs.clawd.bot/gateway/hooks)
- [Commands](https://docs.clawd.bot/commands)
