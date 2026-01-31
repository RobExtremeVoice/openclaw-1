import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CronService } from "./service.js";

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

async function makeStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-cron-"));
  return {
    storePath: path.join(dir, "cron", "jobs.json"),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe("CronService direct message payload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-13T00:00:00.000Z"));
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a direct message job and sends without spinning up an agent", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();
    const sendDirectMessage = vi.fn(async () => ({ ok: true, messageId: "msg123" }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
      sendDirectMessage,
    });

    await cron.start();
    const atMs = Date.parse("2025-12-13T00:00:02.000Z");
    const job = await cron.add({
      name: "birthday reminder",
      enabled: true,
      schedule: { kind: "at", atMs },
      sessionTarget: "direct",
      wakeMode: "now",
      payload: {
        kind: "message",
        text: "🎂 Emma's birthday tomorrow!",
        channel: "telegram",
        to: "6450265544",
      },
    });

    expect(job.state.nextRunAtMs).toBe(atMs);

    vi.setSystemTime(new Date("2025-12-13T00:00:02.000Z"));
    await vi.runOnlyPendingTimersAsync();

    // Direct message should have been sent
    expect(sendDirectMessage).toHaveBeenCalledWith({
      channel: "telegram",
      text: "🎂 Emma's birthday tomorrow!",
      to: "6450265544",
    });

    // Should NOT have called agent-related functions
    expect(enqueueSystemEvent).not.toHaveBeenCalled();

    const jobs = await cron.list({ includeDisabled: true });
    const updated = jobs.find((j) => j.id === job.id);
    expect(updated?.enabled).toBe(false);
    expect(updated?.state.lastStatus).toBe("ok");

    cron.stop();
    await store.cleanup();
  });

  it("reports error when sendDirectMessage is not configured", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
      // sendDirectMessage is NOT provided
    });

    await cron.start();
    const atMs = Date.parse("2025-12-13T00:00:02.000Z");
    const job = await cron.add({
      name: "direct message test",
      enabled: true,
      schedule: { kind: "at", atMs },
      sessionTarget: "direct",
      wakeMode: "now",
      payload: {
        kind: "message",
        text: "Hello!",
        channel: "telegram",
      },
    });

    vi.setSystemTime(new Date("2025-12-13T00:00:02.000Z"));
    await vi.runOnlyPendingTimersAsync();

    const jobs = await cron.list({ includeDisabled: true });
    const updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.lastStatus).toBe("error");
    expect(updated?.state.lastError).toBe("sendDirectMessage not configured");

    cron.stop();
    await store.cleanup();
  });

  it("rejects direct sessionTarget with non-message payload", async () => {
    const store = await makeStorePath();

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
      sendDirectMessage: vi.fn(async () => ({ ok: true })),
    });

    await cron.start();
    const atMs = Date.parse("2025-12-13T00:00:02.000Z");

    // Should throw when trying to create a direct job with systemEvent payload
    await expect(
      cron.add({
        name: "invalid combo",
        enabled: true,
        schedule: { kind: "at", atMs },
        sessionTarget: "direct",
        wakeMode: "now",
        payload: { kind: "systemEvent", text: "this should fail" },
      }),
    ).rejects.toThrow('direct cron jobs require payload.kind="message"');

    cron.stop();
    await store.cleanup();
  });

  it("handles sendDirectMessage failure gracefully", async () => {
    const store = await makeStorePath();
    const sendDirectMessage = vi.fn(async () => ({
      ok: false,
      error: "Channel not configured",
    }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
      sendDirectMessage,
    });

    await cron.start();
    const atMs = Date.parse("2025-12-13T00:00:02.000Z");
    const job = await cron.add({
      name: "failing message",
      enabled: true,
      schedule: { kind: "at", atMs },
      sessionTarget: "direct",
      wakeMode: "now",
      payload: {
        kind: "message",
        text: "Test message",
        channel: "discord",
      },
    });

    vi.setSystemTime(new Date("2025-12-13T00:00:02.000Z"));
    await vi.runOnlyPendingTimersAsync();

    const jobs = await cron.list({ includeDisabled: true });
    const updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.lastStatus).toBe("error");
    expect(updated?.state.lastError).toBe("Channel not configured");

    cron.stop();
    await store.cleanup();
  });

  it("runs recurring direct message jobs", async () => {
    const store = await makeStorePath();
    const sendDirectMessage = vi.fn(async () => ({ ok: true }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" })),
      sendDirectMessage,
    });

    await cron.start();
    // Create a job that will run at specific times
    const anchorMs = Date.parse("2025-12-13T00:01:00.000Z");
    const job = await cron.add({
      name: "recurring reminder",
      enabled: true,
      schedule: { kind: "every", everyMs: 60000, anchorMs },
      sessionTarget: "direct",
      wakeMode: "now",
      payload: {
        kind: "message",
        text: "Hourly check-in",
        channel: "telegram",
        to: "123456",
      },
    });

    // First run at anchor time
    vi.setSystemTime(new Date("2025-12-13T00:01:00.000Z"));
    await vi.runOnlyPendingTimersAsync();
    expect(sendDirectMessage).toHaveBeenCalledTimes(1);

    // After first run, job should be rescheduled and still enabled
    const jobsAfterFirst = await cron.list();
    const afterFirst = jobsAfterFirst.find((j) => j.id === job.id);
    expect(afterFirst?.enabled).toBe(true);
    expect(afterFirst?.state.lastStatus).toBe("ok");

    cron.stop();
    await store.cleanup();
  });
});
