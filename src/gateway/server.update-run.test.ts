import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../infra/update-runner.js", () => ({
  runGatewayUpdate: vi.fn(async () => ({
    status: "ok",
    mode: "git",
    root: "/repo",
    steps: [],
    durationMs: 12,
  })),
}));

import {
  connectOk,
  installGatewayTestHooks,
  onceMessage,
  startServerWithClient,
} from "./test-helpers.js";

installGatewayTestHooks();

describe("gateway update.run", () => {
  let testServer: Awaited<ReturnType<typeof startServerWithClient>> | null = null;

  afterEach(async () => {
    if (testServer) {
      if (testServer.ws.readyState !== WebSocket.CLOSED && testServer.ws.readyState !== WebSocket.CLOSING) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1000);
          testServer!.ws.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
          testServer!.ws.close(1000, "test cleanup");
        });
      }
      await testServer.server.close();
      testServer = null;
    }
  });

  it("writes sentinel and schedules restart", async () => {
    vi.useFakeTimers();
    const sigusr1 = vi.fn();
    process.on("SIGUSR1", sigusr1);

    try {
      testServer = await startServerWithClient();
      await connectOk(testServer.ws);

      const id = "req-update";
      testServer.ws.send(
        JSON.stringify({
          type: "req",
          id,
          method: "update.run",
          params: {
            sessionKey: "agent:main:whatsapp:dm:+15555550123",
            restartDelayMs: 0,
          },
        }),
      );
      const res = await onceMessage<{ ok: boolean; payload?: unknown }>(
        testServer.ws,
        (o) => o.type === "res" && o.id === id,
      );
      expect(res.ok).toBe(true);

      await vi.advanceTimersByTimeAsync(0);
      expect(sigusr1).toHaveBeenCalled();

      const sentinelPath = path.join(os.homedir(), ".clawdbot", "restart-sentinel.json");
      const raw = await fs.readFile(sentinelPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        payload?: { kind?: string; stats?: { mode?: string } };
      };
      expect(parsed.payload?.kind).toBe("update");
      expect(parsed.payload?.stats?.mode).toBe("git");
    } finally {
      process.off("SIGUSR1", sigusr1);
      vi.useRealTimers();
    }
  });
});
