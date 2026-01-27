import type { Context } from "hono";

import type { MemoryService } from "../services/memory-service.js";
import type { ApiError, StatusResponse } from "../types.js";

export function createStatusRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service) {
      const error: ApiError = { error: "Memory service not initialized", code: "NOT_INITIALIZED" };
      return c.json(error, 503);
    }

    if (!service.isAvailable()) {
      const error: ApiError = {
        error: service.getError() ?? "Memory search unavailable",
        code: "UNAVAILABLE",
      };
      return c.json(error, 503);
    }

    try {
      const status: StatusResponse = service.getStatus();
      return c.json(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "STATUS_ERROR" };
      return c.json(error, 500);
    }
  };
}
