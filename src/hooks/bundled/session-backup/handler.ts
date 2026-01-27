/**
 * Session backup hook handler
 *
 * Creates hourly backups of conversations based on activity state.
 * Manages backup lifecycle: active → grace period → stopped
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ClawdbotConfig } from "../../../config/config.js";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import type { HookHandler } from "../../hooks.js";

// ============================================
// Types
// ============================================

interface BackupState {
  lastBackup: number | null;
  lastDistill: number | null;
  lastSessionSummary: number | null;
  lastUserMessage: number | null;
  backupActive: boolean;
}

interface HookConfig {
  graceHours?: number;
  backupIntervalMinutes?: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_GRACE_HOURS = 2;
const DEFAULT_BACKUP_INTERVAL_MINUTES = 60;
const HOUR_MS = 3600 * 1000;

// ============================================
// State Management
// ============================================

async function readState(stateFile: string): Promise<BackupState> {
  try {
    const content = await fs.readFile(stateFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      lastBackup: null,
      lastDistill: null,
      lastSessionSummary: null,
      lastUserMessage: null,
      backupActive: false,
    };
  }
}

async function writeState(stateFile: string, state: BackupState): Promise<void> {
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8");
}

// ============================================
// Session Log Parsing
// ============================================

interface SessionMessage {
  role: string;
  content: string;
  timestamp?: string;
}

async function extractSessionMessages(
  sessionsDir: string,
  sinceTimestamp: number
): Promise<SessionMessage[]> {
  try {
    // Find most recent non-probe session file
    const files = await fs.readdir(sessionsDir);
    const sessionFiles = files
      .filter((f) => f.endsWith(".jsonl") && !f.includes("probe"))
      .map((f) => path.join(sessionsDir, f));

    if (sessionFiles.length === 0) return [];

    // Get most recently modified session file
    const stats = await Promise.all(
      sessionFiles.map(async (f) => ({ file: f, mtime: (await fs.stat(f)).mtimeMs }))
    );
    stats.sort((a, b) => b.mtime - a.mtime);
    const latestSession = stats[0].file;

    // Read and parse session
    const content = await fs.readFile(latestSession, "utf-8");
    const lines = content.trim().split("\n");

    const messages: SessionMessage[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "message" && entry.message) {
          const msg = entry.message;
          const role = msg.role;
          if ((role === "user" || role === "assistant") && msg.content) {
            const text = Array.isArray(msg.content)
              ? msg.content.find((c: any) => c.type === "text")?.text
              : msg.content;
            if (text) {
              messages.push({
                role,
                content: typeof text === "string" ? text : JSON.stringify(text),
                timestamp: entry.timestamp,
              });
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    return messages;
  } catch {
    return [];
  }
}

async function getLastUserMessageTime(sessionsDir: string): Promise<number | null> {
  try {
    const files = await fs.readdir(sessionsDir);
    const sessionFiles = files
      .filter((f) => f.endsWith(".jsonl") && !f.includes("probe"))
      .map((f) => path.join(sessionsDir, f));

    if (sessionFiles.length === 0) return null;

    // Get most recently modified session file
    const stats = await Promise.all(
      sessionFiles.map(async (f) => ({ file: f, mtime: (await fs.stat(f)).mtimeMs }))
    );
    stats.sort((a, b) => b.mtime - a.mtime);
    const latestSession = stats[0].file;

    // Read last 200 lines looking for user messages
    const content = await fs.readFile(latestSession, "utf-8");
    const lines = content.trim().split("\n").slice(-200);

    let lastUserTs: number | null = null;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "message" && entry.message?.role === "user" && entry.timestamp) {
          const ts = new Date(entry.timestamp).getTime();
          if (!lastUserTs || ts > lastUserTs) {
            lastUserTs = ts;
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return lastUserTs ? Math.floor(lastUserTs / 1000) : null;
  } catch {
    return null;
  }
}

// ============================================
// Backup Creation
// ============================================

async function createBackup(
  workspaceDir: string,
  sessionsDir: string,
  state: BackupState,
  isFinal: boolean
): Promise<string> {
  const hourlyDir = path.join(workspaceDir, "memory", "hourly-backups");
  await fs.mkdir(hourlyDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const hourStr = now.getHours().toString().padStart(2, "0");
  const filename = `${dateStr}-${hourStr}00.md`;
  const backupPath = path.join(hourlyDir, filename);

  // Get messages since last backup
  const sinceTs = state.lastBackup || Math.floor(Date.now() / 1000) - 7200;
  const messages = await extractSessionMessages(sessionsDir, sinceTs);

  // Build backup content
  const lines: string[] = [
    "# Hourly Memory Backup",
    "",
    `**Generated:** ${now.toISOString()}`,
    `**Type:** ${isFinal ? "FINAL (session ending)" : "Hourly"}`,
    `**Covering:** ${new Date(sinceTs * 1000).toISOString()} to now`,
    "",
    "---",
    "",
    "## Conversation Log",
    "",
  ];

  if (messages.length > 0) {
    for (const msg of messages.slice(-50)) {
      lines.push(`### ${msg.role.toUpperCase()}`);
      lines.push("");
      // Truncate very long messages
      const content = msg.content.length > 2000 ? msg.content.slice(0, 2000) + "..." : msg.content;
      lines.push(content);
      lines.push("");
    }
  } else {
    lines.push("*No messages found in this period.*");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Key Points to Remember");
  lines.push("");
  lines.push("*This section should be filled in by reviewing the conversation above.*");
  lines.push("");
  lines.push("### Decisions Made");
  lines.push("- (none extracted yet)");
  lines.push("");
  lines.push("### Preferences Discovered");
  lines.push("- (none extracted yet)");
  lines.push("");
  lines.push("### Action Items");
  lines.push("- (none extracted yet)");
  lines.push("");

  await fs.writeFile(backupPath, lines.join("\n"), "utf-8");
  return backupPath;
}

// ============================================
// Main Hook Handler
// ============================================

const sessionBackupHandler: HookHandler = async (event) => {
  // Trigger on gateway:startup (for scheduled checks) or command:new (session end)
  const isStartup = event.type === "gateway" && event.action === "startup";
  const isNewCommand = event.type === "command" && event.action === "new";

  if (!isStartup && !isNewCommand) {
    return;
  }

  const context = event.context || {};
  const cfg = context.cfg as ClawdbotConfig | undefined;

  if (!cfg) {
    console.log("[session-backup] No config available, skipping");
    return;
  }

  const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const clawdbotDir = path.join(os.homedir(), ".clawdbot");
  const sessionsDir = path.join(clawdbotDir, "agents", agentId, "sessions");
  const memoryDir = path.join(workspaceDir, "memory");
  const stateFile = path.join(memoryDir, "heartbeat-state.json");

  await fs.mkdir(memoryDir, { recursive: true });

  // Read current state
  let state = await readState(stateFile);
  const now = Math.floor(Date.now() / 1000);

  // Update lastUserMessage from session logs
  const lastMsgTime = await getLastUserMessageTime(sessionsDir);
  if (lastMsgTime) {
    state.lastUserMessage = lastMsgTime;
  }

  // Get config options
  const hookConfig = (context.hookConfig || {}) as HookConfig;
  const graceHours = hookConfig.graceHours || DEFAULT_GRACE_HOURS;

  // Calculate time since last user message
  const timeSinceMsg = state.lastUserMessage ? now - state.lastUserMessage : Infinity;
  const graceMs = graceHours * HOUR_MS / 1000;

  console.log(`[session-backup] State: lastUserMessage=${state.lastUserMessage}, backupActive=${state.backupActive}, timeSinceMsg=${timeSinceMsg}s`);

  // Handle command:new - always do a session-end backup
  if (isNewCommand) {
    console.log("[session-backup] /new command - creating session-end backup");
    const backupPath = await createBackup(workspaceDir, sessionsDir, state, true);
    state.lastBackup = now;
    state.lastSessionSummary = now;
    await writeState(stateFile, state);
    event.messages.push(`📦 Session backup saved: ${path.basename(backupPath)}`);
    return;
  }

  // Handle gateway:startup (scheduled check)
  if (isStartup) {
    // Rule 1: If backupActive=false, skip
    if (!state.backupActive) {
      console.log("[session-backup] backupActive=false, skipping");
      return;
    }

    // Rule 2: If inactive >2 hours, skip
    if (timeSinceMsg > graceMs) {
      console.log("[session-backup] Inactive >2 hours, skipping");
      state.backupActive = false;
      await writeState(stateFile, state);
      return;
    }

    // Rule 3: If 1-2 hours inactive, do final backup
    if (timeSinceMsg > HOUR_MS / 1000) {
      console.log("[session-backup] Grace period (1-2h), doing FINAL backup");
      const backupPath = await createBackup(workspaceDir, sessionsDir, state, true);
      state.lastBackup = now;
      state.backupActive = false;
      await writeState(stateFile, state);
      console.log(`[session-backup] Final backup saved: ${backupPath}`);
      return;
    }

    // Rule 4: Active within last hour, do regular backup
    console.log("[session-backup] User active, creating hourly backup");
    const backupPath = await createBackup(workspaceDir, sessionsDir, state, false);
    state.lastBackup = now;
    await writeState(stateFile, state);
    console.log(`[session-backup] Backup saved: ${backupPath}`);
  }
};

export default sessionBackupHandler;
