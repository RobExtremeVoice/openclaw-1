import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessSession } from "./bash-process-registry.js";
import {
  addSession,
  listFinishedSessions,
  listRunningSessions,
  markBackgrounded,
  markExited,
  resetProcessRegistryForTests,
} from "./bash-process-registry.js";
import { createProcessTool } from "./bash-tools.process.js";

describe("process spawnedBySession tracking", () => {
  beforeEach(() => {
    resetProcessRegistryForTests();
  });

  it("stores sessionKey in ProcessSession when provided", () => {
    const session: ProcessSession = {
      id: "sess-1",
      command: "echo test",
      sessionKey: "agent:main:whatsapp:user:12345",
      child: { pid: 123 } as ChildProcessWithoutNullStreams,
      startedAt: Date.now(),
      cwd: "/tmp",
      maxOutputChars: 10000,
      pendingMaxOutputChars: 30_000,
      totalOutputChars: 0,
      pendingStdout: [],
      pendingStderr: [],
      pendingStdoutChars: 0,
      pendingStderrChars: 0,
      aggregated: "",
      tail: "",
      exited: false,
      exitCode: undefined,
      exitSignal: undefined,
      truncated: false,
      backgrounded: true,
    };

    addSession(session);
    const running = listRunningSessions();

    expect(running).toHaveLength(1);
    expect(running[0].sessionKey).toBe("agent:main:whatsapp:user:12345");
  });

  it("preserves sessionKey in finished sessions", () => {
    const session: ProcessSession = {
      id: "sess-2",
      command: "echo finished",
      sessionKey: "agent:main:subagent:abc123",
      child: { pid: 456 } as ChildProcessWithoutNullStreams,
      startedAt: Date.now(),
      cwd: "/tmp",
      maxOutputChars: 10000,
      pendingMaxOutputChars: 30_000,
      totalOutputChars: 0,
      pendingStdout: [],
      pendingStderr: [],
      pendingStdoutChars: 0,
      pendingStderrChars: 0,
      aggregated: "",
      tail: "",
      exited: false,
      exitCode: undefined,
      exitSignal: undefined,
      truncated: false,
      backgrounded: true,
    };

    addSession(session);
    markExited(session, 0, null, "completed");

    const finished = listFinishedSessions();
    expect(finished).toHaveLength(1);
    expect(finished[0].sessionKey).toBe("agent:main:subagent:abc123");
  });

  it("process list action returns spawnedBySession for running sessions", async () => {
    const session: ProcessSession = {
      id: "sess-3",
      command: "sleep 60",
      sessionKey: "agent:main:main",
      child: { pid: 789 } as ChildProcessWithoutNullStreams,
      pid: 789,
      startedAt: Date.now(),
      cwd: "/tmp",
      maxOutputChars: 10000,
      pendingMaxOutputChars: 30_000,
      totalOutputChars: 0,
      pendingStdout: [],
      pendingStderr: [],
      pendingStdoutChars: 0,
      pendingStderrChars: 0,
      aggregated: "",
      tail: "",
      exited: false,
      exitCode: undefined,
      exitSignal: undefined,
      truncated: false,
      backgrounded: true,
    };

    addSession(session);

    const tool = createProcessTool();
    const result = await tool.execute("call-1", { action: "list" });

    expect(result.details).toBeDefined();
    const details = result.details as {
      sessions: Array<{ sessionId: string; spawnedBySession?: string }>;
    };
    expect(details.sessions).toHaveLength(1);
    expect(details.sessions[0].sessionId).toBe("sess-3");
    expect(details.sessions[0].spawnedBySession).toBe("agent:main:main");
  });

  it("process list action returns spawnedBySession for finished sessions", async () => {
    const session: ProcessSession = {
      id: "sess-4",
      command: "echo done",
      sessionKey: "agent:work:telegram:group:g1",
      child: { pid: 101 } as ChildProcessWithoutNullStreams,
      pid: 101,
      startedAt: Date.now(),
      cwd: "/tmp",
      maxOutputChars: 10000,
      pendingMaxOutputChars: 30_000,
      totalOutputChars: 0,
      pendingStdout: [],
      pendingStderr: [],
      pendingStdoutChars: 0,
      pendingStderrChars: 0,
      aggregated: "done\n",
      tail: "done\n",
      exited: false,
      exitCode: undefined,
      exitSignal: undefined,
      truncated: false,
      backgrounded: true,
    };

    addSession(session);
    markBackgrounded(session);
    markExited(session, 0, null, "completed");

    const tool = createProcessTool();
    const result = await tool.execute("call-2", { action: "list" });

    expect(result.details).toBeDefined();
    const details = result.details as {
      sessions: Array<{ sessionId: string; spawnedBySession?: string }>;
    };
    expect(details.sessions).toHaveLength(1);
    expect(details.sessions[0].sessionId).toBe("sess-4");
    expect(details.sessions[0].spawnedBySession).toBe("agent:work:telegram:group:g1");
  });

  it("process list action handles sessions without sessionKey (backward compat)", async () => {
    const session: ProcessSession = {
      id: "sess-5",
      command: "legacy command",
      // No sessionKey - simulates pre-feature sessions
      child: { pid: 111 } as ChildProcessWithoutNullStreams,
      pid: 111,
      startedAt: Date.now(),
      cwd: "/tmp",
      maxOutputChars: 10000,
      pendingMaxOutputChars: 30_000,
      totalOutputChars: 0,
      pendingStdout: [],
      pendingStderr: [],
      pendingStdoutChars: 0,
      pendingStderrChars: 0,
      aggregated: "",
      tail: "",
      exited: false,
      exitCode: undefined,
      exitSignal: undefined,
      truncated: false,
      backgrounded: true,
    };

    addSession(session);

    const tool = createProcessTool();
    const result = await tool.execute("call-3", { action: "list" });

    expect(result.details).toBeDefined();
    const details = result.details as {
      sessions: Array<{ sessionId: string; spawnedBySession?: string }>;
    };
    expect(details.sessions).toHaveLength(1);
    expect(details.sessions[0].sessionId).toBe("sess-5");
    // Should be undefined, not break
    expect(details.sessions[0].spawnedBySession).toBeUndefined();
  });
});
