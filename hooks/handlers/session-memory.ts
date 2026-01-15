/**
 * Example internal hook handler: Save session to memory on /new command
 *
 * This handler demonstrates how to create a custom hook that saves session
 * context to disk when a /new or /reset command is issued.
 *
 * To enable this handler, add it to your config:
 *
 * ```json
 * {
 *   "hooks": {
 *     "internal": {
 *       "enabled": true,
 *       "handlers": [
 *         {
 *           "event": "command:new",
 *           "module": "./hooks/handlers/session-memory.ts"
 *         }
 *       ]
 *     }
 *   }
 * }
 * ```
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { InternalHookHandler } from '../../src/hooks/internal-hooks.js';

/**
 * Save session context to memory when /new command is triggered
 */
const saveSessionToMemory: InternalHookHandler = async (event) => {
  // Only trigger on 'new' command
  if (event.type !== 'command' || event.action !== 'new') {
    return;
  }

  try {
    // Create memory directory
    const memoryDir = path.join(os.homedir(), '.clawdbot', 'memory', 'sessions');
    await fs.mkdir(memoryDir, { recursive: true });

    // Create timestamped memory file
    const timestamp = event.timestamp.toISOString().replace(/[:.]/g, '-');
    const sessionSlug = event.sessionKey.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown';
    const memoryFile = path.join(
      memoryDir,
      `${sessionSlug}_${timestamp}.json`
    );

    // Save session context
    const memoryData = {
      sessionKey: event.sessionKey,
      timestamp: event.timestamp.toISOString(),
      action: event.action,
      context: event.context,
    };

    await fs.writeFile(
      memoryFile,
      JSON.stringify(memoryData, null, 2),
      'utf-8'
    );

    console.log(`[session-memory] Saved session context to ${memoryFile}`);
  } catch (err) {
    console.error(
      '[session-memory] Failed to save session context:',
      err instanceof Error ? err.message : String(err)
    );
  }
};

export default saveSessionToMemory;
