import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import type { ResolvedKakaoAccount } from "./types.js";
import { handleKakaoWebhookRequest, registerKakaoWebhookTarget } from "./monitor.js";

async function withServer(
  handler: Parameters<typeof createServer>[0],
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("missing server address");
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("handleKakaoWebhookRequest", () => {
  it("returns 405 for non-POST requests", async () => {
    const core = {} as PluginRuntime;
    const account: ResolvedKakaoAccount = {
      accountId: "default",
      enabled: true,
      token: "tok",
      tokenSource: "config",
      config: {},
    };
    const unregister = registerKakaoWebhookTarget({
      token: "tok",
      account,
      config: {} as OpenClawConfig,
      runtime: {},
      core,
      secret: "",
      path: "/kakao-webhook",
    });

    try {
      await withServer(async (req, res) => {
        const handled = await handleKakaoWebhookRequest(req, res);
        if (!handled) {
          res.statusCode = 404;
          res.end("not found");
        }
      }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/kakao-webhook`, {
          method: "GET",
        });
        expect(response.status).toBe(405);
      });
    } finally {
      unregister();
    }
  });

  it("returns 400 for invalid skill request payload", async () => {
    const core = {} as PluginRuntime;
    const account: ResolvedKakaoAccount = {
      accountId: "default",
      enabled: true,
      token: "tok",
      tokenSource: "config",
      config: {},
    };
    const unregister = registerKakaoWebhookTarget({
      token: "tok",
      account,
      config: {} as OpenClawConfig,
      runtime: {},
      core,
      secret: "",
      path: "/kakao-webhook",
    });

    try {
      await withServer(async (req, res) => {
        const handled = await handleKakaoWebhookRequest(req, res);
        if (!handled) {
          res.statusCode = 404;
          res.end("not found");
        }
      }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/kakao-webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invalid: true }),
        });
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.version).toBe("2.0");
      });
    } finally {
      unregister();
    }
  });

  it("returns 401 when secret does not match", async () => {
    const core = {} as PluginRuntime;
    const account: ResolvedKakaoAccount = {
      accountId: "default",
      enabled: true,
      token: "tok",
      tokenSource: "config",
      config: {},
    };
    const unregister = registerKakaoWebhookTarget({
      token: "tok",
      account,
      config: {} as OpenClawConfig,
      runtime: {},
      core,
      secret: "correct-secret",
      path: "/kakao-webhook",
    });

    try {
      await withServer(async (req, res) => {
        const handled = await handleKakaoWebhookRequest(req, res);
        if (!handled) {
          res.statusCode = 404;
          res.end("not found");
        }
      }, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/kakao-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-kakao-webhook-secret": "wrong-secret",
          },
          body: JSON.stringify({ userRequest: { utterance: "hello", user: { id: "u1" } } }),
        });
        expect(response.status).toBe(401);
      });
    } finally {
      unregister();
    }
  });

  it("does not handle unregistered paths", async () => {
    await withServer(async (req, res) => {
      const handled = await handleKakaoWebhookRequest(req, res);
      if (!handled) {
        res.statusCode = 404;
        res.end("not found");
      }
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/unknown-path`, {
        method: "POST",
        body: "{}",
      });
      expect(response.status).toBe(404);
    });
  });
});
