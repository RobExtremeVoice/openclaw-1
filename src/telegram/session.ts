import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StringSession } from "telegram/sessions/index.js";
import { ensureDir } from "../utils.js";

// New branding path (preferred)
const TELEGRAM_SESSION_DIR_CLAWDIS = path.join(
  os.homedir(),
  ".clawdis",
  "telegram",
  "session",
);

// Legacy path (fallback for backward compatibility)
const TELEGRAM_SESSION_DIR_LEGACY = path.join(
  os.homedir(),
  ".warelay",
  "telegram",
  "session",
);

// Exported for backward compatibility
export const TELEGRAM_SESSION_DIR = TELEGRAM_SESSION_DIR_LEGACY;

/**
 * Resolve the Telegram session directory path.
 * Prefers ~/.clawdis/telegram/session, falls back to ~/.warelay/telegram/session
 */
function resolveSessionDir(): string {
  try {
    // Synchronous check for CLAWDIS path
    const clawdisSession = path.join(
      TELEGRAM_SESSION_DIR_CLAWDIS,
      "session.string",
    );
    if (fsSync.existsSync(clawdisSession)) {
      return TELEGRAM_SESSION_DIR_CLAWDIS;
    }
  } catch {
    // Fall through to legacy path
  }
  return TELEGRAM_SESSION_DIR_LEGACY;
}

/**
 * Load Telegram session from disk.
 * Returns null if no session exists.
 */
export async function loadSession(): Promise<StringSession | null> {
  try {
    const sessionDir = resolveSessionDir();
    await ensureDir(sessionDir);
    const sessionFile = path.join(sessionDir, "session.string");
    const sessionString = await fs.readFile(sessionFile, "utf-8");
    return new StringSession(sessionString.trim());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null; // No session file exists yet
    }
    throw err; // Unexpected error
  }
}

/**
 * Save Telegram session to disk.
 * Prefers saving to ~/.clawdis/telegram/session (new location).
 */
export async function saveSession(session: StringSession): Promise<void> {
  // Always save to new CLAWDIS path for new sessions
  await ensureDir(TELEGRAM_SESSION_DIR_CLAWDIS);
  const sessionString = session.save();
  const sessionFile = path.join(TELEGRAM_SESSION_DIR_CLAWDIS, "session.string");
  await fs.writeFile(sessionFile, sessionString, "utf-8");
}

/**
 * Clear Telegram session from disk.
 * Removes session from both CLAWDIS and legacy paths.
 */
export async function clearSession(): Promise<void> {
  const paths = [
    path.join(TELEGRAM_SESSION_DIR_CLAWDIS, "session.string"),
    path.join(TELEGRAM_SESSION_DIR_LEGACY, "session.string"),
  ];

  for (const sessionPath of paths) {
    try {
      await fs.unlink(sessionPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Ignore ENOENT (file doesn't exist), but throw other errors
        throw err;
      }
    }
  }
}

/**
 * Check if a Telegram session exists.
 * Checks both CLAWDIS and legacy paths.
 */
export async function telegramAuthExists(): Promise<boolean> {
  const paths = [
    path.join(TELEGRAM_SESSION_DIR_CLAWDIS, "session.string"),
    path.join(TELEGRAM_SESSION_DIR_LEGACY, "session.string"),
  ];

  for (const sessionPath of paths) {
    try {
      await fs.access(sessionPath);
      return true; // Found a session file
    } catch {
      // Continue checking other paths
    }
  }
  return false; // No session found in any path
}
