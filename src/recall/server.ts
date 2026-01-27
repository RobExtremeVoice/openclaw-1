import fs from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import type { ClawdbotConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { createMemoryService, type MemoryService } from "./services/memory-service.js";
import { createStatusRoute } from "./routes/status.js";
import { createSearchRoute } from "./routes/search.js";
import {
  createMemoriesListRoute,
  createMemoryDetailRoute,
  createMemoryUpdateRoute,
  createMemoryDeleteRoute,
} from "./routes/memories.js";
import {
  createFilesListRoute,
  createFileReadRoute,
  createFileWriteRoute,
} from "./routes/files.js";
import { createSyncRoute, createExportRoute } from "./routes/sync.js";

const log = createSubsystemLogger("recall");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RecallServerOptions {
  cfg: ClawdbotConfig;
  agentId: string;
  port: number;
  host: string;
}

export interface RecallServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getUrl(): string;
}

function resolveRecallUiRoot(): string | null {
  const candidates = [
    // Production: dist/recall-ui
    path.resolve(__dirname, "../recall-ui"),
    // Dev: running from src, look in project root
    path.resolve(__dirname, "../../recall-ui/dist"),
    // Fallback: check cwd
    path.resolve(process.cwd(), "recall-ui/dist"),
    path.resolve(process.cwd(), "dist/recall-ui"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  return null;
}

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function isSafeRelativePath(relPath: string): boolean {
  if (!relPath) return false;
  const normalized = path.posix.normalize(relPath);
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("\0")) return false;
  return true;
}

function serveStaticFile(req: IncomingMessage, res: ServerResponse, root: string): boolean {
  const urlRaw = req.url;
  if (!urlRaw) return false;

  const url = new URL(urlRaw, "http://localhost");
  const pathname = url.pathname;

  // Handle API routes - not static
  if (pathname.startsWith("/api/")) {
    return false;
  }

  // Determine the file to serve
  let relPath = pathname.slice(1) || "index.html";
  if (relPath.endsWith("/")) {
    relPath += "index.html";
  }

  if (!isSafeRelativePath(relPath)) {
    return false;
  }

  const filePath = path.join(root, relPath);
  if (!filePath.startsWith(root)) {
    return false;
  }

  // Check if file exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", contentTypeForExt(ext));
    res.setHeader("Cache-Control", "no-cache");
    res.end(fs.readFileSync(filePath));
    return true;
  }

  // SPA fallback: serve index.html for unknown paths
  const indexPath = path.join(root, "index.html");
  if (fs.existsSync(indexPath)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end(fs.readFileSync(indexPath));
    return true;
  }

  return false;
}

export async function createRecallServer(options: RecallServerOptions): Promise<RecallServer> {
  const { cfg, agentId, port, host } = options;

  // Initialize memory service
  const memoryService = await createMemoryService(cfg, agentId);
  const getService = (): MemoryService | null => memoryService;

  // Create Hono app
  const app = new Hono();

  // Middleware
  app.use("*", cors());
  app.use(
    "*",
    logger((str, ...rest) => {
      log.debug(str, ...rest);
    }),
  );

  // API routes
  app.get("/api/status", createStatusRoute(getService));
  app.get("/api/health", (c) => c.json({ ok: true }));

  // Memory routes
  app.get("/api/memories", createMemoriesListRoute(getService));
  app.get("/api/memories/:id", createMemoryDetailRoute(getService));
  app.put("/api/memories/:id", createMemoryUpdateRoute(getService));
  app.delete("/api/memories/:id", createMemoryDeleteRoute(getService));

  // Search
  app.post("/api/search", createSearchRoute(getService));

  // File routes
  app.get("/api/files", createFilesListRoute(getService));
  app.get("/api/files/*", createFileReadRoute(getService));
  app.put("/api/files/*", createFileWriteRoute(getService));

  // Sync and export
  app.post("/api/sync", createSyncRoute(getService));
  app.get("/api/export", createExportRoute(getService));

  // Resolve UI root
  const uiRoot = resolveRecallUiRoot();

  let server: Server | null = null;

  return {
    async start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
          // Try to serve static files first
          if (uiRoot && serveStaticFile(req, res, uiRoot)) {
            return;
          }

          // Handle API routes via Hono
          const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

          // Convert Node.js request to Fetch API request
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value) {
              if (Array.isArray(value)) {
                for (const v of value) {
                  headers.append(key, v);
                }
              } else {
                headers.set(key, value);
              }
            }
          }

          const body =
            req.method !== "GET" && req.method !== "HEAD"
              ? new Promise<Buffer>((resolve) => {
                  const chunks: Buffer[] = [];
                  req.on("data", (chunk) => chunks.push(chunk));
                  req.on("end", () => resolve(Buffer.concat(chunks)));
                })
              : undefined;

          void (async () => {
            try {
              const fetchRequest = new Request(url.toString(), {
                method: req.method,
                headers,
                body: body ? await body : undefined,
              });

              const response = await app.fetch(fetchRequest);

              res.statusCode = response.status;
              response.headers.forEach((value, key) => {
                res.setHeader(key, value);
              });

              const responseBody = await response.arrayBuffer();
              res.end(Buffer.from(responseBody));
            } catch (err) {
              log.error("Request handler error", { error: String(err) });
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Internal server error" }));
            }
          })();
        });

        server.on("error", (err) => {
          reject(err);
        });

        server.listen(port, host, () => {
          log.info(`Recall server started at http://${host}:${port}`);
          if (!uiRoot) {
            log.warn(
              "Recall UI assets not found. Build them with `pnpm recall:build` or run `pnpm recall:dev` during development.",
            );
          }
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      if (memoryService) {
        await memoryService.close();
      }
      return new Promise((resolve) => {
        if (server) {
          server.close(() => {
            log.info("Recall server stopped");
            resolve();
          });
        } else {
          resolve();
        }
      });
    },

    getUrl(): string {
      return `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
    },
  };
}
