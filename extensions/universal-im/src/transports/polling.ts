import type { TransportStartContext, UniversalTransport } from "../types.js";

const DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Polling Transport - polls an HTTP endpoint for messages.
 *
 * This transport periodically fetches messages from an external
 * HTTP endpoint. Useful for services that don't support webhooks
 * or WebSocket connections.
 */
export const pollingTransport: UniversalTransport = {
  type: "polling",
  label: "Polling",

  async start(ctx: TransportStartContext): Promise<void> {
    const url = ctx.config.polling?.url;
    if (!url) {
      ctx.onError(new Error("Polling URL is required"));
      return;
    }

    const intervalMs = ctx.config.polling?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    let lastPollTime = 0;

    ctx.onConnected?.();

    // Polling loop
    while (!ctx.abortSignal.aborted) {
      try {
        const pollUrl = new URL(url);
        // Add last poll time for incremental polling support
        if (lastPollTime > 0) {
          pollUrl.searchParams.set("since", String(lastPollTime));
        }

        const response = await fetch(pollUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(ctx.config.outbound?.authHeader
              ? { Authorization: ctx.config.outbound.authHeader }
              : {}),
          },
          signal: ctx.abortSignal,
        });

        if (!response.ok) {
          ctx.onError(new Error(`Polling failed: ${response.status} ${response.statusText}`));
        } else {
          const data = await response.json();
          lastPollTime = Date.now();

          // Handle response - could be single message or array
          if (Array.isArray(data)) {
            for (const item of data) {
              ctx.onMessage(item);
            }
          } else if (data && typeof data === "object") {
            // Check for messages array in response
            const messages = (data as Record<string, unknown>).messages;
            if (Array.isArray(messages)) {
              for (const item of messages) {
                ctx.onMessage(item);
              }
            } else if (Object.keys(data).length > 0) {
              // Single message object
              ctx.onMessage(data);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          break;
        }
        ctx.onError(err instanceof Error ? err : new Error(String(err)));
      }

      // Wait for next poll interval
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, intervalMs);
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

    ctx.onDisconnected?.("stopped");
  },
};
