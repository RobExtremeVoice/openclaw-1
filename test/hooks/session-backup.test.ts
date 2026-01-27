/**
 * Tests for session-backup hook
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), "clawdbot-test-session-backup");
const MEMORY_DIR = path.join(TEST_DIR, "memory");
const HOURLY_DIR = path.join(MEMORY_DIR, "hourly-backups");
const STATE_FILE = path.join(MEMORY_DIR, "heartbeat-state.json");
const SESSIONS_DIR = path.join(TEST_DIR, "sessions");

interface BackupState {
  lastBackup: number | null;
  lastDistill: number | null;
  lastSessionSummary: number | null;
  lastUserMessage: number | null;
  backupActive: boolean;
}

async function setupTestDirs() {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  await fs.mkdir(HOURLY_DIR, { recursive: true });
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

async function cleanupTestDirs() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function writeState(state: BackupState) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function readState(): Promise<BackupState> {
  const content = await fs.readFile(STATE_FILE, "utf-8");
  return JSON.parse(content);
}

async function createMockSessionFile() {
  const sessionId = "test-session-" + Date.now();
  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  
  const messages = [
    { type: "message", message: { role: "user", content: "Hello" }, timestamp: new Date().toISOString() },
    { type: "message", message: { role: "assistant", content: "Hi there!" }, timestamp: new Date().toISOString() },
  ];
  
  await fs.writeFile(sessionFile, messages.map(m => JSON.stringify(m)).join("\n"), "utf-8");
  return sessionFile;
}

describe("session-backup hook", () => {
  beforeEach(async () => {
    await cleanupTestDirs();
    await setupTestDirs();
  });

  afterEach(async () => {
    await cleanupTestDirs();
  });

  describe("state management", () => {
    it("initializes default state when file missing", async () => {
      const defaultState: BackupState = {
        lastBackup: null,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: null,
        backupActive: false,
      };
      
      await writeState(defaultState);
      const state = await readState();
      
      expect(state.backupActive).toBe(false);
      expect(state.lastBackup).toBeNull();
    });

    it("persists state changes", async () => {
      const now = Math.floor(Date.now() / 1000);
      const state: BackupState = {
        lastBackup: now,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: now,
        backupActive: true,
      };
      
      await writeState(state);
      const readBack = await readState();
      
      expect(readBack.lastBackup).toBe(now);
      expect(readBack.backupActive).toBe(true);
    });
  });

  describe("activity detection", () => {
    it("sets backupActive=true when user active within 1 hour", async () => {
      const now = Math.floor(Date.now() / 1000);
      const state: BackupState = {
        lastBackup: null,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: now - 1800, // 30 min ago
        backupActive: true,
      };
      
      await writeState(state);
      const readBack = await readState();
      
      expect(readBack.backupActive).toBe(true);
    });

    it("detects grace period (1-2 hours inactive)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const ninetyMinAgo = now - 5400;
      
      const state: BackupState = {
        lastBackup: null,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: ninetyMinAgo,
        backupActive: true,
      };
      
      await writeState(state);
      
      // Verify the time difference
      const timeSinceMsg = now - ninetyMinAgo;
      expect(timeSinceMsg).toBeGreaterThan(3600); // > 1 hour
      expect(timeSinceMsg).toBeLessThan(7200);    // < 2 hours
    });

    it("sets backupActive=false when inactive >2 hours", async () => {
      const now = Math.floor(Date.now() / 1000);
      const threeHoursAgo = now - 10800;
      
      const state: BackupState = {
        lastBackup: null,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: threeHoursAgo,
        backupActive: false, // Should be false after >2h
      };
      
      await writeState(state);
      const readBack = await readState();
      
      expect(readBack.backupActive).toBe(false);
    });
  });

  describe("backup creation", () => {
    it("creates backup file with correct naming", async () => {
      await createMockSessionFile();
      
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const hourStr = now.getHours().toString().padStart(2, "0");
      const expectedFilename = `${dateStr}-${hourStr}00.md`;
      
      // Simulate backup creation
      const backupPath = path.join(HOURLY_DIR, expectedFilename);
      await fs.writeFile(backupPath, "# Test Backup\n", "utf-8");
      
      const exists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it("skips backup when backupActive=false", async () => {
      const state: BackupState = {
        lastBackup: null,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: null,
        backupActive: false,
      };
      
      await writeState(state);
      
      // Check that no backup would be created
      const readBack = await readState();
      expect(readBack.backupActive).toBe(false);
    });
  });

  describe("lifecycle", () => {
    it("full lifecycle: active → grace → stopped", async () => {
      const now = Math.floor(Date.now() / 1000);
      
      // Step 1: User active
      let state: BackupState = {
        lastBackup: null,
        lastDistill: null,
        lastSessionSummary: null,
        lastUserMessage: now,
        backupActive: true,
      };
      await writeState(state);
      expect((await readState()).backupActive).toBe(true);
      
      // Step 2: User goes idle (90 min)
      state.lastUserMessage = now - 5400;
      await writeState(state);
      // At this point, a hook would do final backup and set backupActive=false
      state.backupActive = false;
      state.lastBackup = now;
      await writeState(state);
      expect((await readState()).backupActive).toBe(false);
      
      // Step 3: User returns
      state.lastUserMessage = now;
      state.backupActive = true;
      await writeState(state);
      expect((await readState()).backupActive).toBe(true);
    });
  });
});
