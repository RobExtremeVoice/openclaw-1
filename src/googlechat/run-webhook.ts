#!/usr/bin/env npx tsx
import { exec } from "node:child_process";
import express, { type Request, type Response } from "express";

const PORT = 18792;
const app = express();
app.use(express.json());

// Path to the gchat sender script
const GCHAT_SENDER = "/Users/justinmassa/chief-of-staff/scripts/gchat_sender.py";
const PYTHON = "/Users/justinmassa/chief-of-staff/.venv/bin/python";

// Send message via Chat API (async, no timeout concerns)
function sendChatMessage(spaceId: string, text: string): void {
  const escapedText = text.replace(/'/g, "'\\''").replace(/\n/g, "\\n");
  exec(
    `${PYTHON} -c "import sys; sys.path.insert(0, '/Users/justinmassa/chief-of-staff/scripts'); from gchat_sender import send_message; send_message('${escapedText}', '${spaceId}')"`,
    { timeout: 30000 },
    (err) => {
      if (err) console.error("[googlechat] Failed to send response:", err.message);
    }
  );
}

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, provider: "googlechat" });
});

// Google Chat webhook
app.post("/webhook/googlechat", async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const chat = event.chat || {};

    const isAddedToSpace = !!chat.addedToSpacePayload;
    const isMessage = !!chat.messagePayload;

    const eventType = isAddedToSpace ? "ADDED_TO_SPACE" : isMessage ? "MESSAGE" : "UNKNOWN";
    console.log(`[googlechat] Received event: ${eventType}`);

    if (isAddedToSpace) {
      const user = chat.user?.displayName || "there";
      res.json({
        hostAppDataAction: {
          chatDataAction: {
            createMessageAction: {
              message: {
                text: `Hello ${user}! I'm Clawdette, your AI assistant. Send me a message and I'll respond!`,
              },
            },
          },
        },
      });
      return;
    }

    if (isMessage) {
      const msg = chat.messagePayload.message;
      const senderName = msg?.sender?.displayName || "Unknown";
      const text = msg?.argumentText || msg?.text || "";
      const spaceId = msg?.space?.name?.replace("spaces/", "") || "default";

      console.log(`[googlechat] Message from ${senderName}: ${text}`);

      // Acknowledge immediately - no blocking!
      res.json({});

      // Process AI response asynchronously (can take minutes, that's fine)
      const escapedText = text.replace(/'/g, "'\\''");
      const sessionId = `googlechat:${spaceId}`;

      console.log(`[googlechat] Processing async for space ${spaceId}...`);

      exec(
        `clawdbot agent --message '${escapedText}' --session-id '${sessionId}' --local`,
        {
          timeout: 300000, // 5 minute timeout
          maxBuffer: 1024 * 1024,
        },
        (err, stdout, stderr) => {
          if (err) {
            console.error(`[googlechat] AI error:`, err.message);
            sendChatMessage(spaceId, "Sorry, I encountered an error processing your message.");
            return;
          }

          const responseText = stdout.trim() || "I processed your message but have no response.";
          console.log(`[googlechat] AI Response (${responseText.length} chars): ${responseText.slice(0, 100)}...`);

          // Send response via Chat API
          sendChatMessage(spaceId, responseText);
        }
      );

      return;
    }

    res.json({});
  } catch (error) {
    console.error("[googlechat] Error:", error);
    res.status(500).json({ error: "Internal error" });
  }
});

app.listen(PORT, () => {
  console.log(`[googlechat] Webhook server running on port ${PORT}`);
  console.log(`[googlechat] Mode: ASYNC (responds via Chat API, no timeout issues)`);
});
