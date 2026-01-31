/**
 * OpenTelemetry SDK initialization for Moltbot.
 *
 * This module sets up distributed tracing with automatic HTTP instrumentation.
 * Import this at the very start of your application entry point.
 *
 * Usage:
 *   import './infra/otel.js'; // Must be first import
 *   import { trace } from '@opentelemetry/api';
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

// SDK configuration - only enable if OTEL_ENABLED is set
const isOtelEnabled = process.env.OTEL_ENABLED === "true" || process.env.OTEL_ENABLED === "1";

let sdk: NodeSDK | null = null;

if (isOtelEnabled) {
  sdk = new NodeSDK({
    serviceName: "moltbot",
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable some noisy instrumentations
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    sdk
      ?.shutdown()
      .then(() => console.log("[otel] Tracing terminated"))
      .catch((error) => console.error("[otel] Error terminating tracing", error))
      .finally(() => process.exit(0));
  });

  console.log("[otel] OpenTelemetry SDK initialized");
} else {
  console.log("[otel] OpenTelemetry disabled (set OTEL_ENABLED=true to enable)");
}

// =============================================================================
// Helper functions for manual instrumentation
// =============================================================================

/**
 * Get the current tracer for manual span creation.
 */
export function getTracer(name: string = "moltbot") {
  return trace.getTracer(name);
}

/**
 * Get the current span context for correlation.
 */
export function getCurrentSpan() {
  return trace.getActiveSpan();
}

/**
 * Get the current trace ID for log correlation.
 */
export function getCurrentTraceId(): string | undefined {
  const span = getCurrentSpan();
  if (!span) return undefined;
  return span.spanContext().traceId;
}

/**
 * Get the current span ID for log correlation.
 */
export function getCurrentSpanId(): string | undefined {
  const span = getCurrentSpan();
  if (!span) return undefined;
  return span.spanContext().spanId;
}

/**
 * Create a custom span for a specific operation.
 *
 * @example
 * await withSpan('ai.completion', { provider: 'openai' }, async (span) => {
 *   const result = await callOpenAI();
 *   span.setAttribute('tokens', result.usage.total_tokens);
 *   return result;
 * });
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean> = {},
  fn: (
    span: ReturnType<typeof trace.getTracer>["startSpan"] extends (name: string) => infer R
      ? R
      : never,
  ) => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name);

  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute(key, value);
  }

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add trace context to a log record.
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  return {
    traceId: getCurrentTraceId(),
    spanId: getCurrentSpanId(),
  };
}

export { sdk as otelSdk };
