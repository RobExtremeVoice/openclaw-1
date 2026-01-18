import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  connectOk,
  installGatewayTestHooks,
  rpcReq,
  startServerWithClient,
} from "./test-helpers.js";

const loadConfigHelpers = async () => await import("../config/config.js");

installGatewayTestHooks();

describe("gateway server channels", () => {
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

  test("channels.status returns snapshot without probe", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    testServer = await startServerWithClient();
    await connectOk(testServer.ws);

    const res = await rpcReq<{
      channels?: Record<
        string,
        | {
            configured?: boolean;
            tokenSource?: string;
            probe?: unknown;
            lastProbeAt?: unknown;
          }
        | { linked?: boolean }
      >;
    }>(testServer.ws, "channels.status", { probe: false, timeoutMs: 2000 });
    expect(res.ok).toBe(true);
    const telegram = res.payload?.channels?.telegram;
    const signal = res.payload?.channels?.signal;
    expect(res.payload?.channels?.whatsapp).toBeTruthy();
    expect(telegram?.configured).toBe(false);
    expect(telegram?.tokenSource).toBe("none");
    expect(telegram?.probe).toBeUndefined();
    expect(telegram?.lastProbeAt).toBeNull();
    expect(signal?.configured).toBe(false);
    expect(signal?.probe).toBeUndefined();
    expect(signal?.lastProbeAt).toBeNull();
  });

  test("channels.logout reports no session when missing", async () => {
    testServer = await startServerWithClient();
    await connectOk(testServer.ws);

    const res = await rpcReq<{ cleared?: boolean; channel?: string }>(testServer.ws, "channels.logout", {
      channel: "whatsapp",
    });
    expect(res.ok).toBe(true);
    expect(res.payload?.channel).toBe("whatsapp");
    expect(res.payload?.cleared).toBe(false);
  });

  test("channels.logout clears telegram bot token from config", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    const { readConfigFileSnapshot, writeConfigFile } = await loadConfigHelpers();
    await writeConfigFile({
      channels: {
        telegram: {
          botToken: "123:abc",
          groups: { "*": { requireMention: false } },
        },
      },
    });

    testServer = await startServerWithClient();
    await connectOk(testServer.ws);

    const res = await rpcReq<{
      cleared?: boolean;
      envToken?: boolean;
      channel?: string;
    }>(testServer.ws, "channels.logout", { channel: "telegram" });
    expect(res.ok).toBe(true);
    expect(res.payload?.channel).toBe("telegram");
    expect(res.payload?.cleared).toBe(true);
    expect(res.payload?.envToken).toBe(false);

    const snap = await readConfigFileSnapshot();
    expect(snap.valid).toBe(true);
    expect(snap.config?.channels?.telegram?.botToken).toBeUndefined();
    expect(snap.config?.channels?.telegram?.groups?.["*"]?.requireMention).toBe(false);
  });
});
