import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

import type { MemoryService } from "../services/memory-service.js";
import type { ApiError, SyncProgressEvent } from "../types.js";

export function createSyncRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    const forceParam = c.req.query("force");
    const force = forceParam === "true" || forceParam === "1";

    // Use SSE for progress streaming
    return streamSSE(c, async (stream) => {
      try {
        await service.sync({
          force,
          progress: (update) => {
            const event: SyncProgressEvent = {
              type: "progress",
              completed: update.completed,
              total: update.total,
              label: update.label,
            };
            void stream.writeSSE({
              data: JSON.stringify(event),
              event: "progress",
            });
          },
        });

        const completeEvent: SyncProgressEvent = { type: "complete" };
        await stream.writeSSE({
          data: JSON.stringify(completeEvent),
          event: "complete",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorEvent: SyncProgressEvent = { type: "error", error: message };
        await stream.writeSSE({
          data: JSON.stringify(errorEvent),
          event: "error",
        });
      }
    });
  };
}

export function createExportRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      const format = (c.req.query("format") ?? "json") as "json" | "md";
      const data = await service.exportMemories(format);

      const filename = `memories-${new Date().toISOString().slice(0, 10)}.${format === "json" ? "json" : "md"}`;

      return c.json({
        format,
        data,
        filename,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "EXPORT_ERROR" };
      return c.json(error, 500);
    }
  };
}
