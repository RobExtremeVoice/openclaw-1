import type { TransportStartContext, UniversalTransport } from "../types.js";

/**
 * Webhook Transport - receives messages via HTTP POST webhooks.
 *
 * This transport registers an HTTP endpoint that external services
 * can POST messages to. The message format is provider-specific.
 */
export const webhookTransport: UniversalTransport = {
  type: "webhook",
  label: "Webhook",

  async start(ctx: TransportStartContext): Promise<void> {
    // Webhook transport is passive - it relies on the gateway HTTP server
    // to route incoming webhook requests to us.
    //
    // The actual webhook handling is done by the monitor.ts which
    // registers a gateway method handler for the webhook path.
    //
    // We just signal that we're connected and wait for abort.
    ctx.onConnected?.();

    // Wait for abort signal
    await new Promise<void>((resolve) => {
      if (ctx.abortSignal.aborted) {
        resolve();
        return;
      }
      ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
    });

    ctx.onDisconnected?.("aborted");
  },
};

/**
 * Create a webhook handler function for use in gateway method registration.
 * This is called by the monitor to handle incoming webhook requests.
 */
export function createWebhookHandler(
  onMessage: (rawEvent: unknown) => void,
  secret?: string,
): (req: WebhookRequest) => WebhookResponse {
  return (req: WebhookRequest): WebhookResponse => {
    // Verify secret if configured
    if (secret) {
      const providedSecret = req.headers?.["x-webhook-secret"] ?? req.headers?.["authorization"];
      if (providedSecret !== secret && providedSecret !== `Bearer ${secret}`) {
        return {
          status: 401,
          body: { error: "Unauthorized" },
        };
      }
    }

    // Pass the raw body to the message handler
    try {
      onMessage(req.body);
      return {
        status: 200,
        body: { ok: true },
      };
    } catch (err) {
      return {
        status: 500,
        body: { error: err instanceof Error ? err.message : "Internal error" },
      };
    }
  };
}

export type WebhookRequest = {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body: unknown;
};

export type WebhookResponse = {
  status: number;
  body: unknown;
};
