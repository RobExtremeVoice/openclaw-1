import WebSocket from "ws";

import type { TransportStartContext, UniversalTransport } from "../types.js";

const DEFAULT_RECONNECT_MS = 5000;

/**
 * WebSocket Transport - connects to an external WebSocket server.
 *
 * This transport maintains a persistent WebSocket connection to
 * receive real-time messages from external services.
 */
export const websocketTransport: UniversalTransport = {
  type: "websocket",
  label: "WebSocket",

  async start(ctx: TransportStartContext): Promise<void> {
    const url = ctx.config.websocket?.url;
    if (!url) {
      ctx.onError(new Error("WebSocket URL is required"));
      return;
    }

    const reconnectMs = ctx.config.websocket?.reconnectMs ?? DEFAULT_RECONNECT_MS;

    const connectOnce = async (): Promise<void> => {
      return new Promise((resolve) => {
        const ws = new WebSocket(url);

        const onAbort = () => {
          ws.close();
          resolve();
        };
        ctx.abortSignal.addEventListener("abort", onAbort, { once: true });

        ws.on("open", () => {
          ctx.onConnected?.();
        });

        ws.on("message", (data) => {
          try {
            const raw = typeof data === "string" ? data : data.toString("utf8");
            const parsed = JSON.parse(raw);
            ctx.onMessage(parsed);
          } catch (err) {
            // If not JSON, pass raw string
            ctx.onMessage(data.toString());
          }
        });

        ws.on("close", (_code, reason) => {
          const message = reason.length > 0 ? reason.toString("utf8") : "connection closed";
          ctx.onDisconnected?.(message);
          ctx.abortSignal.removeEventListener("abort", onAbort);
          resolve();
        });

        ws.on("error", (err) => {
          ctx.onError(err);
        });
      });
    };

    // Reconnect loop
    while (!ctx.abortSignal.aborted) {
      await connectOnce();
      if (ctx.abortSignal.aborted) break;
      // Wait before reconnecting
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, reconnectMs);
        ctx.abortSignal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });
    }
  },
};
