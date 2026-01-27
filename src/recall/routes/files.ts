import type { Context } from "hono";

import type { MemoryService } from "../services/memory-service.js";
import type { ApiError, FileContentResponse, FilesListResponse } from "../types.js";

export function createFilesListRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      const files = await service.listFiles();
      const response: FilesListResponse = { files };
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error: ApiError = { error: message, code: "LIST_FILES_ERROR" };
      return c.json(error, 500);
    }
  };
}

export function createFileReadRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      // Get the path from the URL after /api/files/
      const url = new URL(c.req.url);
      const pathMatch = url.pathname.match(/^\/api\/files\/(.+)$/);
      const filePath = pathMatch?.[1];
      if (!filePath) {
        const error: ApiError = { error: "File path required", code: "INVALID_PATH" };
        return c.json(error, 400);
      }

      // Decode the URL-encoded path
      const decodedPath = decodeURIComponent(filePath);

      const result = await service.readFile(decodedPath);
      const response: FileContentResponse = {
        path: result.path,
        content: result.text,
      };
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ENOENT") || message.includes("not found")) {
        const error: ApiError = { error: "File not found", code: "NOT_FOUND" };
        return c.json(error, 404);
      }
      if (message.includes("escapes workspace") || message.includes("path required")) {
        const error: ApiError = { error: message, code: "INVALID_PATH" };
        return c.json(error, 400);
      }
      const error: ApiError = { error: message, code: "READ_FILE_ERROR" };
      return c.json(error, 500);
    }
  };
}

export function createFileWriteRoute(getService: () => MemoryService | null) {
  return async (c: Context): Promise<Response> => {
    const service = getService();
    if (!service?.isAvailable()) {
      const error: ApiError = { error: "Memory service unavailable", code: "UNAVAILABLE" };
      return c.json(error, 503);
    }

    try {
      // Get the path from the URL after /api/files/
      const url = new URL(c.req.url);
      const pathMatch = url.pathname.match(/^\/api\/files\/(.+)$/);
      const filePath = pathMatch?.[1];
      if (!filePath) {
        const error: ApiError = { error: "File path required", code: "INVALID_PATH" };
        return c.json(error, 400);
      }

      const decodedPath = decodeURIComponent(filePath);
      const body = await c.req.json<{ content?: string }>();

      if (typeof body.content !== "string") {
        const error: ApiError = { error: "Content required", code: "INVALID_CONTENT" };
        return c.json(error, 400);
      }

      const result = await service.writeFile(decodedPath, body.content);
      if (!result.success) {
        const error: ApiError = { error: result.error ?? "Write failed", code: "WRITE_FAILED" };
        return c.json(error, 500);
      }

      return c.json({ success: true, path: decodedPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("escapes workspace") || message.includes("path required")) {
        const error: ApiError = { error: message, code: "INVALID_PATH" };
        return c.json(error, 400);
      }
      const error: ApiError = { error: message, code: "WRITE_FILE_ERROR" };
      return c.json(error, 500);
    }
  };
}
