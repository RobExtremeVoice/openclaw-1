#!/usr/bin/env npx tsx
/**
 * Vertex Proxy Adapter
 *
 * A local proxy that converts standard Anthropic API requests to Vertex AI format.
 * This enables OpenClaw to use a Vertex-compatible Claude proxy (e.g., Claude Code proxy).
 *
 * Usage:
 *   npx tsx scripts/vertex-proxy-adapter.ts
 *
 * Environment variables:
 *   ANTHROPIC_VERTEX_BASE_URL - The upstream Vertex proxy URL (required)
 *   ADAPTER_PORT - Local port to listen on (default: 18888)
 *
 * OpenClaw configuration:
 *   baseUrl: http://localhost:18888
 *   api: anthropic-messages
 */

import http from "node:http";

const VERTEX_PROXY_URL = process.env.ANTHROPIC_VERTEX_BASE_URL;
if (!VERTEX_PROXY_URL) {
  console.error("[vertex-proxy-adapter] Error: ANTHROPIC_VERTEX_BASE_URL environment variable is required");
  console.error("  Example: export ANTHROPIC_VERTEX_BASE_URL=https://your-vertex-proxy.example.com/vertex");
  process.exit(1);
}
const ADAPTER_PORT = parseInt(process.env.ADAPTER_PORT || "18888", 10);

// Model ID mapping: OpenClaw model ID -> Vertex model ID
const MODEL_MAP: Record<string, string> = {
  "claude-opus-4-5": "claude-opus-4-5",
  "claude-sonnet-4": "claude-sonnet-4",
  "claude-3-5-sonnet-20241022": "claude-3-5-sonnet-v2@20241022",
  "claude-3-5-sonnet": "claude-3-5-sonnet-v2@20241022",
};

interface AnthropicRequest {
  model: string;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; source?: unknown }> }>;
  max_tokens: number;
  system?: string | Array<{ type: string; text: string; cache_control?: unknown }>;
  stream?: boolean;
  [key: string]: unknown;
}

interface VertexRequest {
  anthropic_version: string;
  messages: Array<{ role: string; content: string | Array<unknown> }>;
  max_tokens: number;
  system?: string;
  stream?: boolean;
  [key: string]: unknown;
}

function transformRequest(anthropicReq: AnthropicRequest): { vertexReq: VertexRequest; modelId: string } {
  const modelId = MODEL_MAP[anthropicReq.model] || anthropicReq.model;

  // Convert system prompt if it's an array
  let system: string | undefined;
  if (Array.isArray(anthropicReq.system)) {
    system = anthropicReq.system.map((s) => s.text).join("\n");
  } else if (typeof anthropicReq.system === "string") {
    system = anthropicReq.system;
  }

  const vertexReq: VertexRequest = {
    anthropic_version: "vertex-2023-10-16",
    messages: anthropicReq.messages,
    max_tokens: anthropicReq.max_tokens,
    stream: anthropicReq.stream,
  };

  if (system) {
    vertexReq.system = system;
  }

  // Copy other fields (tools, metadata, etc.)
  for (const key of Object.keys(anthropicReq)) {
    if (!["model", "messages", "max_tokens", "system", "stream"].includes(key)) {
      vertexReq[key] = anthropicReq[key];
    }
  }

  return { vertexReq, modelId };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = req.url || "/";

  // Health check
  if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Only handle POST /v1/messages
  if (req.method !== "POST" || !url.endsWith("/messages")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  try {
    const apiKey = req.headers["x-api-key"] as string || (req.headers["authorization"] as string)?.replace("Bearer ", "");
    if (!apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API key required" }));
      return;
    }

    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody) as AnthropicRequest;
    const { vertexReq, modelId } = transformRequest(body);

    // Build Vertex endpoint URL
    const vertexUrl = `${VERTEX_PROXY_URL}/publishers/anthropic/models/${modelId}:${body.stream ? "streamRawPredict" : "rawPredict"}`;

    console.log(`[adapter] ${body.model} -> ${modelId} @ ${vertexUrl}`);

    // Forward to Vertex proxy
    const vertexResponse = await fetch(vertexUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(vertexReq),
    });

    // For streaming responses, pipe through
    if (body.stream && vertexResponse.body) {
      res.writeHead(vertexResponse.status, {
        "Content-Type": vertexResponse.headers.get("Content-Type") || "text/event-stream",
        "Transfer-Encoding": "chunked",
      });

      const reader = vertexResponse.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      await pump();
      return;
    }

    // For non-streaming, return as-is
    const responseBody = await vertexResponse.text();
    res.writeHead(vertexResponse.status, { "Content-Type": "application/json" });
    res.end(responseBody);
  } catch (error) {
    console.error("[adapter] Error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(error) }));
  }
}

console.log(`[vertex-proxy-adapter] Starting on port ${ADAPTER_PORT}`);
console.log(`[vertex-proxy-adapter] Upstream: ${VERTEX_PROXY_URL}`);

const server = http.createServer(handleRequest);
server.listen(ADAPTER_PORT, () => {
  console.log(`[vertex-proxy-adapter] Listening on http://localhost:${ADAPTER_PORT}`);
});
