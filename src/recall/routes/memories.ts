import type { Context } from "hono";

import type { MemoryService } from "../services/memory-service.js";
import type { ApiError, MemoriesListResponse, MemoryDetailResponse, MemorySource } from "../types.js";

export function createMemoriesListRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      const page = Number.parseInt(c.req.query("page") ?? "1", 10);
      const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
      const source = c.req.query("source") as MemorySource | undefined;

      const { memories, total } = await service.listMemories({ page, limit, source });
      const response: MemoriesListResponse = {
        memories,
        total,
        page,
        limit,
        hasMore: page * limit < total,
      };
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "LIST_ERROR" };
      return c.json(error, 500);
    }
  };
}

export function createMemoryDetailRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      const id = c.req.param("id");
      if (!id) {
        const error: ApiError = { error: "Memory ID required", code: "INVALID_ID" };
        return c.json(error, 400);
      }

      const memory = await service.getMemory(id);
      if (!memory) {
        const error: ApiError = { error: "Memory not found", code: "NOT_FOUND" };
        return c.json(error, 404);
      }

      const response: MemoryDetailResponse = { memory };
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "DETAIL_ERROR" };
      return c.json(error, 500);
    }
  };
}

export function createMemoryUpdateRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      const id = c.req.param("id");
      if (!id) {
        const error: ApiError = { error: "Memory ID required", code: "INVALID_ID" };
        return c.json(error, 400);
      }

      const body = await c.req.json<{ content?: string }>();
      if (!body.content) {
        const error: ApiError = { error: "Content required", code: "INVALID_CONTENT" };
        return c.json(error, 400);
      }

      const result = await service.updateMemory(id, body.content);
      if (!result.success) {
        const error: ApiError = { error: result.error ?? "Update failed", code: "UPDATE_FAILED" };
        return c.json(error, result.notFound ? 404 : 500);
      }

      return c.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "UPDATE_ERROR" };
      return c.json(error, 500);
    }
  };
}

export function createMemoryDeleteRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      const id = c.req.param("id");
      if (!id) {
        const error: ApiError = { error: "Memory ID required", code: "INVALID_ID" };
        return c.json(error, 400);
      }

      const result = await service.deleteMemory(id);
      if (!result.success) {
        const error: ApiError = { error: result.error ?? "Delete failed", code: "DELETE_FAILED" };
        return c.json(error, result.notFound ? 404 : 500);
      }

      return c.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "DELETE_ERROR" };
      return c.json(error, 500);
    }
  };
}
