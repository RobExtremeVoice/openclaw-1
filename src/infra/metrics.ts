/**
 * Prometheus metrics for Moltbot observability.
 *
 * Usage:
 *   import { metrics } from '../infra/metrics.js';
 *   metrics.messagesTotal.inc({ channel: 'whatsapp', direction: 'inbound' });
 */

import * as promClient from "prom-client";

// Create a custom registry to avoid global state pollution
export const metricsRegistry = new promClient.Registry();

// Add default metrics (process CPU, memory, etc.)
promClient.collectDefaultMetrics({ register: metricsRegistry });

// =============================================================================
// COUNTERS - Monotonically increasing values
// =============================================================================

/** Total messages processed by channel and direction */
export const messagesTotal = new promClient.Counter({
  name: "moltbot_messages_total",
  help: "Total number of messages processed",
  labelNames: ["channel", "direction"] as const, // direction: inbound | outbound
  registers: [metricsRegistry],
});

/** Total HTTP requests by method, route, and status */
export const httpRequestsTotal = new promClient.Counter({
  name: "moltbot_http_requests_total",
  help: "Total HTTP requests received",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry],
});

/** Total errors by type and source */
export const errorsTotal = new promClient.Counter({
  name: "moltbot_errors_total",
  help: "Total errors encountered",
  labelNames: ["type", "source"] as const,
  registers: [metricsRegistry],
});

/** Total AI provider calls by provider and model */
export const aiCallsTotal = new promClient.Counter({
  name: "moltbot_ai_calls_total",
  help: "Total AI provider API calls",
  labelNames: ["provider", "model"] as const,
  registers: [metricsRegistry],
});

// =============================================================================
// HISTOGRAMS - Request duration distributions
// =============================================================================

/** HTTP request duration in seconds */
export const httpRequestDuration = new promClient.Histogram({
  name: "moltbot_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/** AI provider response latency in seconds */
export const aiLatency = new promClient.Histogram({
  name: "moltbot_ai_latency_seconds",
  help: "AI provider response latency in seconds",
  labelNames: ["provider", "model"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry],
});

/** Message processing time in seconds */
export const messageProcessingDuration = new promClient.Histogram({
  name: "moltbot_message_processing_duration_seconds",
  help: "Time to process a message end-to-end",
  labelNames: ["channel"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [metricsRegistry],
});

// =============================================================================
// GAUGES - Values that can go up and down
// =============================================================================

/** Number of active sessions in memory */
export const activeSessions = new promClient.Gauge({
  name: "moltbot_active_sessions",
  help: "Number of active sessions currently in memory",
  registers: [metricsRegistry],
});

/** Number of connected channels */
export const connectedChannels = new promClient.Gauge({
  name: "moltbot_connected_channels",
  help: "Number of channels currently connected",
  labelNames: ["channel"] as const,
  registers: [metricsRegistry],
});

/** WebSocket connections count */
export const websocketConnections = new promClient.Gauge({
  name: "moltbot_websocket_connections",
  help: "Number of active WebSocket connections",
  registers: [metricsRegistry],
});

/** Gateway uptime in seconds */
export const uptimeSeconds = new promClient.Gauge({
  name: "moltbot_uptime_seconds",
  help: "Gateway uptime in seconds",
  registers: [metricsRegistry],
});

// =============================================================================
// Helper functions
// =============================================================================

const startTime = Date.now();

/** Update the uptime gauge - call periodically */
export function updateUptime(): void {
  uptimeSeconds.set((Date.now() - startTime) / 1000);
}

/** Get metrics in Prometheus text format */
export async function getMetricsText(): Promise<string> {
  updateUptime();
  return metricsRegistry.metrics();
}

/** Get the content type for Prometheus metrics */
export function getMetricsContentType(): string {
  return metricsRegistry.contentType;
}

// Convenience export for common usage patterns
export const metrics = {
  messagesTotal,
  httpRequestsTotal,
  errorsTotal,
  aiCallsTotal,
  httpRequestDuration,
  aiLatency,
  messageProcessingDuration,
  activeSessions,
  connectedChannels,
  websocketConnections,
  uptimeSeconds,
  getMetricsText,
  getMetricsContentType,
  updateUptime,
  registry: metricsRegistry,
};

export default metrics;
