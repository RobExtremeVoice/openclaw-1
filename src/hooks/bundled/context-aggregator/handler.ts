/**
 * Context aggregator hook handler
 *
 * Aggregates memory from multiple sources into CONTEXT.md
 * for session continuity across /new resets.
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
  lookbackHours?: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_LOOKBACK_HOURS = 48;

// ============================================
// Helpers
// ============================================

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function getFilesModifiedSince(
  dir: string,
  sinceTimestamp: number,
  pattern?: RegExp
): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    const results: string[] = [];
    
    for (const file of files) {
      if (pattern && !pattern.test(file)) continue;
      
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);
      
      if (stat.mtimeMs / 1000 > sinceTimestamp) {
        results.push(filePath);
      }
    }
    
    // Sort by modification time, newest first
    results.sort((a, b) => b.localeCompare(a));
    return results;
  } catch {
    return [];
  }
}

async function getRecentConversation(sessionsDir: string, limit: number = 20): Promise<string[]> {
  try {
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
    const lines = content.trim().split("\n").slice(-100);

    const messages: string[] = [];
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
            if (text && typeof text === "string") {
              const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
              messages.push(`**${role}:** ${truncated}`);
            }
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return messages.slice(-limit);
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

    const stats = await Promise.all(
      sessionFiles.map(async (f) => ({ file: f, mtime: (await fs.stat(f)).mtimeMs }))
    );
    stats.sort((a, b) => b.mtime - a.mtime);
    const latestSession = stats[0].file;

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
// Context Generation
// ============================================

async function generateContext(
  workspaceDir: string,
  sessionsDir: string,
  lookbackHours: number
): Promise<string> {
  const memoryDir = path.join(workspaceDir, "memory");
  const hourlyDir = path.join(memoryDir, "hourly-backups");
  const stateFile = path.join(memoryDir, "heartbeat-state.json");

  const now = new Date();
  const lookbackTimestamp = Math.floor(Date.now() / 1000) - lookbackHours * 3600;

  const lines: string[] = [
    "# CONTEXT.md - Auto-Generated Session Context",
    "",
    `**Generated:** ${now.toISOString()}`,
    "",
  ];

  // Section 1: Memory Management Reminders
  lines.push("## 🧠 Memory Management Reminders");
  lines.push("");
  lines.push("**On EVERY user message:**");
  lines.push("1. Update `memory/heartbeat-state.json` with current timestamp + `backupActive=true`");
  lines.push("2. Actively use `memory_store` for decisions, preferences, context, opinions");
  lines.push("");
  lines.push("**On session end (/new or gap detected):**");
  lines.push("1. Write session summary to `memory/YYYY-MM-DD-session-summary.md`");
  lines.push("2. Update `memory/active-projects.md`");
  lines.push("3. Final `memory_store` calls for anything not captured");
  lines.push("");
  lines.push("**During conversation:**");
  lines.push("- Use `memory_recall` before responding to complex questions");
  lines.push("- Aim for 2-5 `memory_store` calls per substantial conversation");
  lines.push("");

  // Section 2: Recent Hourly Backups
  lines.push("## 📁 Recent Hourly Backups (Last 48h)");
  lines.push("");
  
  if (await fileExists(hourlyDir)) {
    const backupFiles = await getFilesModifiedSince(hourlyDir, lookbackTimestamp, /\.md$/);
    
    if (backupFiles.length > 0) {
      for (const file of backupFiles.slice(0, 20)) {
        const content = await readFileIfExists(file);
        if (content) {
          lines.push(`### ${path.basename(file)}`);
          lines.push("");
          // Truncate very long backups
          const truncated = content.length > 3000 ? content.slice(0, 3000) + "\n\n*[truncated]*" : content;
          lines.push(truncated);
          lines.push("");
        }
      }
    } else {
      lines.push("*No hourly backups in last 48 hours.*");
      lines.push("");
    }
  } else {
    lines.push("*Hourly backups directory not found.*");
    lines.push("");
  }

  // Section 3: Recent Daily Notes
  lines.push("## 📅 Recent Daily Notes");
  lines.push("");

  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  for (const date of [today, yesterday]) {
    const dailyFile = path.join(memoryDir, `${date}.md`);
    const content = await readFileIfExists(dailyFile);
    if (content) {
      lines.push(`### ${date}`);
      lines.push("");
      lines.push(content);
      lines.push("");
    }
  }

  // Section 4: Active Projects
  lines.push("## 🎯 Active Projects");
  lines.push("");

  const projectsFile = path.join(memoryDir, "active-projects.md");
  const projectsContent = await readFileIfExists(projectsFile);
  if (projectsContent) {
    lines.push(projectsContent);
  } else {
    lines.push("*No active projects file.*");
  }
  lines.push("");

  // Section 5: Recent Session Summaries
  lines.push("## 📋 Recent Session Summaries");
  lines.push("");

  const summaryFiles = await getFilesModifiedSince(memoryDir, lookbackTimestamp, /-session-summary\.md$/);
  if (summaryFiles.length > 0) {
    for (const file of summaryFiles.slice(0, 5)) {
      const content = await readFileIfExists(file);
      if (content) {
        lines.push(`### ${path.basename(file)}`);
        lines.push("");
        lines.push(content);
        lines.push("");
      }
    }
  } else {
    lines.push("*No recent session summaries.*");
    lines.push("");
  }

  // Section 6: Current State
  lines.push("## ⚡ Current State");
  lines.push("");

  const stateContent = await readFileIfExists(stateFile);
  if (stateContent) {
    lines.push("```json");
    lines.push(stateContent);
    lines.push("```");
  } else {
    lines.push("*No state file found.*");
  }
  lines.push("");

  // Section 7: Recent Conversation
  lines.push("## 💬 Recent Conversation Excerpts");
  lines.push("");

  const recentMessages = await getRecentConversation(sessionsDir);
  if (recentMessages.length > 0) {
    for (const msg of recentMessages) {
      lines.push(msg);
      lines.push("");
    }
  } else {
    lines.push("*No recent conversation found.*");
    lines.push("");
  }

  lines.push("---");
  lines.push("*End of auto-generated context.*");

  return lines.join("\n");
}

// ============================================
// Main Hook Handler
// ============================================

const contextAggregatorHandler: HookHandler = async (event) => {
  // Trigger on gateway:startup or command:new
  const isStartup = event.type === "gateway" && event.action === "startup";
  const isNewCommand = event.type === "command" && event.action === "new";

  if (!isStartup && !isNewCommand) {
    return;
  }

  const context = event.context || {};
  const cfg = context.cfg as ClawdbotConfig | undefined;

  if (!cfg) {
    console.log("[context-aggregator] No config available, skipping");
    return;
  }

  const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const clawdbotDir = path.join(os.homedir(), ".clawdbot");
  const sessionsDir = path.join(clawdbotDir, "agents", agentId, "sessions");
  const memoryDir = path.join(workspaceDir, "memory");
  const stateFile = path.join(memoryDir, "heartbeat-state.json");
  const contextFile = path.join(workspaceDir, "CONTEXT.md");

  await fs.mkdir(memoryDir, { recursive: true });

  // Get config options
  const hookConfig = (context.hookConfig || {}) as HookConfig;
  const lookbackHours = hookConfig.lookbackHours || DEFAULT_LOOKBACK_HOURS;

  console.log(`[context-aggregator] Generating context (lookback: ${lookbackHours}h)`);

  // Update activity state from session logs
  const lastMsgTime = await getLastUserMessageTime(sessionsDir);
  if (lastMsgTime) {
    const now = Math.floor(Date.now() / 1000);
    const timeSinceMsg = now - lastMsgTime;
    const hourInSeconds = 3600;

    let state: BackupState;
    try {
      const stateContent = await fs.readFile(stateFile, "utf-8");
      state = JSON.parse(stateContent);
    } catch {
      state = {
        lastBackup: null,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: null,
        backupActive: false,
      };
    }

    state.lastUserMessage = lastMsgTime;

    if (timeSinceMsg < hourInSeconds) {
      state.backupActive = true;
    } else if (timeSinceMsg > 2 * hourInSeconds) {
      state.backupActive = false;
    }

    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8");
  }

  // Generate and write context
  const content = await generateContext(workspaceDir, sessionsDir, lookbackHours);
  await fs.writeFile(contextFile, content, "utf-8");

  console.log(`[context-aggregator] Context written to ${contextFile}`);
};

export default contextAggregatorHandler;
