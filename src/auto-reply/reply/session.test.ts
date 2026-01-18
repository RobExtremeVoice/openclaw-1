import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ClawdbotConfig } from "../../config/config.js";
import { saveSessionStore } from "../../config/sessions.js";
import { initSessionState } from "./session.js";

describe("initSessionState thread forking", () => {
  it("forks a new session from the parent session file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-thread-session-"));
    const sessionsDir = path.join(root, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const parentSessionId = "parent-session";
    const parentSessionFile = path.join(sessionsDir, "parent.jsonl");
    const header = {
      type: "session",
      version: 3,
      id: parentSessionId,
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
    };
    const message = {
      type: "message",
      id: "m1",
      parentId: null,
      timestamp: new Date().toISOString(),
      message: { role: "user", content: "Parent prompt" },
    };
    await fs.writeFile(
      parentSessionFile,
      `${JSON.stringify(header)}\n${JSON.stringify(message)}\n`,
      "utf-8",
    );

    const storePath = path.join(root, "sessions.json");
    const parentSessionKey = "agent:main:slack:channel:C1";
    await saveSessionStore(storePath, {
      [parentSessionKey]: {
        sessionId: parentSessionId,
        sessionFile: parentSessionFile,
        updatedAt: Date.now(),
      },
    });

    const cfg = {
      session: { store: storePath },
    } as ClawdbotConfig;

    const threadSessionKey = "agent:main:slack:channel:C1:thread:123";
    const threadLabel = "Slack thread #general: starter";
    const result = await initSessionState({
      ctx: {
        Body: "Thread reply",
        SessionKey: threadSessionKey,
        ParentSessionKey: parentSessionKey,
        ThreadLabel: threadLabel,
      },
      cfg,
      commandAuthorized: true,
    });

    expect(result.sessionKey).toBe(threadSessionKey);
    expect(result.sessionEntry.sessionId).not.toBe(parentSessionId);
    expect(result.sessionEntry.sessionFile).toBeTruthy();
    expect(result.sessionEntry.displayName).toBe(threadLabel);

    const newSessionFile = result.sessionEntry.sessionFile;
    if (!newSessionFile) {
      throw new Error("Missing session file for forked thread");
    }
    const [headerLine] = (await fs.readFile(newSessionFile, "utf-8"))
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    const parsedHeader = JSON.parse(headerLine) as {
      parentSession?: string;
    };
    expect(parsedHeader.parentSession).toBe(parentSessionFile);
  });

  it("records topic-specific session files when MessageThreadId is present", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-topic-session-"));
    const storePath = path.join(root, "sessions.json");

    const cfg = {
      session: { store: storePath },
    } as ClawdbotConfig;

    const result = await initSessionState({
      ctx: {
        Body: "Hello topic",
        SessionKey: "agent:main:telegram:group:123:topic:456",
        MessageThreadId: 456,
      },
      cfg,
      commandAuthorized: true,
    });

    const sessionFile = result.sessionEntry.sessionFile;
    expect(sessionFile).toBeTruthy();
    expect(path.basename(sessionFile ?? "")).toBe(
      `${result.sessionEntry.sessionId}-topic-456.jsonl`,
    );
  });
});

describe("initSessionState RawBody", () => {
  it("triggerBodyNormalized correctly extracts commands when Body contains context but RawBody is clean", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-rawbody-"));
    const storePath = path.join(root, "sessions.json");
    const cfg = { session: { store: storePath } } as ClawdbotConfig;

    const groupMessageCtx = {
      Body: `[Chat messages since your last reply - for context]\n[WhatsApp ...] Someone: hello\n\n[Current message - respond to this]\n[WhatsApp ...] Jake: /status\n[from: Jake McInteer (+6421807830)]`,
      RawBody: "/status",
      ChatType: "group",
      SessionKey: "agent:main:whatsapp:group:G1",
    };

    const result = await initSessionState({
      ctx: groupMessageCtx,
      cfg,
      commandAuthorized: true,
    });

    expect(result.triggerBodyNormalized).toBe("/status");
  });

  it("Reset triggers (/new, /reset) work with RawBody", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-rawbody-reset-"));
    const storePath = path.join(root, "sessions.json");
    const cfg = { session: { store: storePath } } as ClawdbotConfig;

    const groupMessageCtx = {
      Body: `[Context]\nJake: /new\n[from: Jake]`,
      RawBody: "/new",
      ChatType: "group",
      SessionKey: "agent:main:whatsapp:group:G1",
    };

    const result = await initSessionState({
      ctx: groupMessageCtx,
      cfg,
      commandAuthorized: true,
    });

    expect(result.isNewSession).toBe(true);
    expect(result.bodyStripped).toBe("");
  });

  it("falls back to Body when RawBody is undefined", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-rawbody-fallback-"));
    const storePath = path.join(root, "sessions.json");
    const cfg = { session: { store: storePath } } as ClawdbotConfig;

    const ctx = {
      Body: "/status",
      SessionKey: "agent:main:whatsapp:dm:S1",
    };

    const result = await initSessionState({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(result.triggerBodyNormalized).toBe("/status");
  });
});

describe("initSessionState thread idle timeout bypass", () => {
  it("thread sessions bypass idle timeout and reuse existing session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-thread-idle-"));
    const storePath = path.join(root, "sessions.json");
    const threadKey = "agent:main:slack:channel:C1:thread:123";
    const existingSessionId = "existing-thread-session-id";

    // Pre-seed a "stale" session (2 hours old, past default 60min idle)
    await saveSessionStore(storePath, {
      [threadKey]: {
        sessionId: existingSessionId,
        updatedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      },
    });

    const cfg = { session: { store: storePath, idleMinutes: 60 } } as ClawdbotConfig;
    const result = await initSessionState({
      ctx: { Body: "follow-up message", SessionKey: threadKey },
      cfg,
      commandAuthorized: true,
    });

    // Should reuse existing session despite being "stale"
    expect(result.isNewSession).toBe(false);
    expect(result.sessionId).toBe(existingSessionId);
  });

  it("non-thread sessions still expire after idle timeout", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-dm-idle-"));
    const storePath = path.join(root, "sessions.json");
    const dmKey = "agent:main:whatsapp:+1234567890";

    // Pre-seed a "stale" DM session (2 hours old)
    await saveSessionStore(storePath, {
      [dmKey]: {
        sessionId: "old-dm-session",
        updatedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      },
    });

    const cfg = { session: { store: storePath, idleMinutes: 60 } } as ClawdbotConfig;
    const result = await initSessionState({
      ctx: { Body: "hello", SessionKey: dmKey },
      cfg,
      commandAuthorized: true,
    });

    // Should create new session (idle expired)
    expect(result.isNewSession).toBe(true);
    expect(result.sessionId).not.toBe("old-dm-session");
  });

  it("fresh non-thread sessions are reused within idle timeout", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-dm-fresh-"));
    const storePath = path.join(root, "sessions.json");
    const dmKey = "agent:main:whatsapp:+1234567890";
    const existingSessionId = "fresh-dm-session";

    // Pre-seed a "fresh" DM session (10 minutes old)
    await saveSessionStore(storePath, {
      [dmKey]: {
        sessionId: existingSessionId,
        updatedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      },
    });

    const cfg = { session: { store: storePath, idleMinutes: 60 } } as ClawdbotConfig;
    const result = await initSessionState({
      ctx: { Body: "hello", SessionKey: dmKey },
      cfg,
      commandAuthorized: true,
    });

    // Should reuse existing session (within idle timeout)
    expect(result.isNewSession).toBe(false);
    expect(result.sessionId).toBe(existingSessionId);
  });
});
