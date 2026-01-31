#!/usr/bin/env node
/**
 * Test server for Universal IM webhook integration.
 *
 * Usage:
 *   bun extensions/universal-im/src/test-server.ts
 *
 * Then send a POST request:
 *   curl -X POST http://localhost:3456/universal-im/webhook \
 *     -H "Content-Type: application/json" \
 *     -d '{"messageId":"test-1","sender":{"id":"user-1","name":"Test User"},"conversation":{"type":"direct","id":"conv-1"},"text":"Hello!"}'
 */
import http from "node:http";

import { customProvider } from "./providers/index.js";
import { createWebhookHandler } from "./transports/webhook.js";
import {
  providerRegistry,
  hookRegistry,
  registerProvider,
  registerInboundHook,
} from "./registry/index.js";

// Initialize
if (!providerRegistry.has("custom")) {
  registerProvider(customProvider);
}

// Register a test hook to log processed messages
registerInboundHook({
  id: "test-logger",
  afterNormalize: (msg, ctx) => {
    console.log("\n📨 Received message:");
    console.log("  Provider:", msg.provider);
    console.log("  Transport:", msg.transport);
    console.log("  Message ID:", msg.messageId);
    console.log("  Sender:", msg.sender.name ?? msg.sender.id);
    console.log("  Conversation:", msg.conversation.type, msg.conversation.id);
    console.log("  Text:", msg.body.text ?? "(no text)");
    if (msg.body.attachments?.length) {
      console.log("  Attachments:", msg.body.attachments.length);
    }
  },
});

// Create webhook handler
const webhookHandler = createWebhookHandler((rawEvent) => {
  const msg = customProvider.parseInbound(rawEvent, {
    accountId: "test",
    config: {},
    transport: "webhook",
  });

  if (!msg) {
    console.log("⚠️  Could not parse message");
    return;
  }

  // Run hooks
  const hooks = hookRegistry.getInboundHooks();
  for (const hook of hooks) {
    try {
      hook.afterNormalize?.(msg, {
        accountId: "test",
        config: {},
        provider: "custom",
        transport: "webhook",
      });
    } catch (err) {
      console.error(`Hook ${hook.id} failed:`, err);
    }
  }
});

// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Webhook-Secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      const parsed = JSON.parse(body);

      const result = webhookHandler({
        method: req.method ?? "POST",
        path: req.url ?? "/",
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
        ),
        body: parsed,
      });

      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("Error processing request:", err);
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
});

const PORT = process.env.PORT ?? 3456;
server.listen(PORT, () => {
  console.log(`
🚀 Universal IM Test Server running on http://localhost:${PORT}

Send a test message:
  curl -X POST http://localhost:${PORT}/universal-im/webhook \\
    -H "Content-Type: application/json" \\
    -d '{"messageId":"test-1","sender":{"id":"user-1","name":"Test User"},"conversation":{"type":"direct","id":"conv-1"},"text":"Hello!"}'

Message format:
{
  "messageId": "unique-id",
  "sender": {
    "id": "user-id",
    "name": "User Name" (optional)
  },
  "conversation": {
    "type": "direct" | "group" | "channel",
    "id": "conversation-id",
    "threadId": "thread-id" (optional)
  },
  "text": "Message text",
  "attachments": [ (optional)
    { "kind": "image", "url": "https://..." }
  ]
}

Press Ctrl+C to stop.
`);
});
