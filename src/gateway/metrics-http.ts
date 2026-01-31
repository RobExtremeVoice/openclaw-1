/**
 * HTTP handler for Prometheus metrics endpoint.
 *
 * Exposes metrics at GET /metrics in Prometheus text format.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getMetricsText, getMetricsContentType } from "../infra/metrics.js";

/**
 * Handle GET /metrics requests for Prometheus scraping.
 */
export async function handleMetricsRequest(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const metricsText = await getMetricsText();
    res.writeHead(200, {
      "Content-Type": getMetricsContentType(),
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.end(metricsText);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Error collecting metrics");
  }
}

/**
 * Handle GET /health liveness probe.
 * Always returns 200 if the server is responding.
 */
export function handleHealthRequest(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Readiness check function type.
 * Returns true if the service is ready to accept traffic.
 */
export type ReadinessCheck = () => Promise<boolean> | boolean;

/**
 * Create a readiness handler with custom checks.
 *
 * @param checks - Array of check functions that must all pass
 */
export function createReadinessHandler(
  checks: ReadinessCheck[] = [],
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const results = await Promise.all(checks.map((check) => check()));
      const isReady = results.every(Boolean);

      if (isReady) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ready",
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "not_ready",
            timestamp: new Date().toISOString(),
          }),
        );
      }
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "error",
          timestamp: new Date().toISOString(),
        }),
      );
    }
  };
}

/**
 * Simple readiness handler that always returns ready.
 * Use createReadinessHandler for custom checks.
 */
export async function handleReadyRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const handler = createReadinessHandler([]);
  return handler(req, res);
}
