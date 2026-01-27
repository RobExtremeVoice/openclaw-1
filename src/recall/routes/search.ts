import type { Context } from "hono";

import type { MemoryService } from "../services/memory-service.js";
import type { ApiError, SearchRequest, SearchResponse } from "../types.js";

export function createSearchRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      const body = await c.req.json<SearchRequest>();

      if (!body.query?.trim()) {
        const error: ApiError = { error: "Query required", code: "INVALID_QUERY" };
        return c.json(error, 400);
      }

      const results = await service.search(body.query, {
        maxResults: body.maxResults,
        minScore: body.minScore,
      });

      const response: SearchResponse = {
        results,
        query: body.query,
      };

      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "SEARCH_ERROR" };
      return c.json(error, 500);
    }
  };
}
