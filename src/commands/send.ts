import fs from "node:fs/promises";
import path from "node:path";
import type { CliDeps } from "../cli/deps.js";
import { danger, info, success } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";
import { sendMediaMessage, sendTextMessage } from "../telegram/outbound.js";
import { loadSession } from "../telegram/session.js";
import type { Provider } from "../utils.js";
import { sendViaIpc } from "../web/ipc.js";

export async function sendCommand(
  opts: {
    to: string;
    message: string;
    wait: string;
    poll: string;
    provider: Provider;
    json?: boolean;
    dryRun?: boolean;
    media?: string;
    serveMedia?: boolean;
    verbose?: boolean;
  },
  deps: CliDeps,
  runtime: RuntimeEnv,
) {
  deps.assertProvider(opts.provider);
  const waitSeconds = Number.parseInt(opts.wait, 10);
  const pollSeconds = Number.parseInt(opts.poll, 10);

  if (Number.isNaN(waitSeconds) || waitSeconds < 0) {
    throw new Error("Wait must be >= 0 seconds");
  }
  if (Number.isNaN(pollSeconds) || pollSeconds <= 0) {
    throw new Error("Poll must be > 0 seconds");
  }

  if (opts.provider === "web") {
    if (opts.dryRun) {
      runtime.log(
        `[dry-run] would send via web -> ${opts.to}: ${opts.message}${opts.media ? ` (media ${opts.media})` : ""}`,
      );
      return;
    }
    if (waitSeconds !== 0) {
      runtime.log(info("Wait/poll are Twilio-only; ignored for provider=web."));
    }

    // Try to send via IPC to running relay first (avoids Signal session corruption)
    const ipcResult = await sendViaIpc(opts.to, opts.message, opts.media);
    if (ipcResult) {
      if (ipcResult.success) {
        runtime.log(
          success(`✅ Sent via relay IPC. Message ID: ${ipcResult.messageId}`),
        );
        if (opts.json) {
          runtime.log(
            JSON.stringify(
              {
                provider: "web",
                via: "ipc",
                to: opts.to,
                messageId: ipcResult.messageId,
                mediaUrl: opts.media ?? null,
              },
              null,
              2,
            ),
          );
        }
        return;
      }
      // IPC failed but relay is running - warn and fall back
      runtime.log(
        info(
          `IPC send failed (${ipcResult.error}), falling back to direct connection`,
        ),
      );
    }

    // Fall back to direct connection (creates new Baileys socket)
    const res = await deps
      .sendMessageWeb(opts.to, opts.message, {
        verbose: false,
        mediaUrl: opts.media,
      })
      .catch((err) => {
        runtime.error(`❌ Web send failed: ${String(err)}`);
        throw err;
      });
    if (opts.json) {
      runtime.log(
        JSON.stringify(
          {
            provider: "web",
            via: "direct",
            to: opts.to,
            messageId: res.messageId,
            mediaUrl: opts.media ?? null,
          },
          null,
          2,
        ),
      );
    }
    return;
  }

  if (opts.provider === "telegram") {
    if (opts.dryRun) {
      runtime.log(
        `[dry-run] would send via telegram -> ${opts.to}: ${opts.message}${opts.media ? ` (media ${opts.media})` : ""}`,
      );
      return;
    }

    // Load saved session
    const session = await loadSession();
    if (!session) {
      runtime.error(
        danger(
          "No Telegram session found. Run: warelay login --provider telegram",
        ),
      );
      throw new Error("Not logged in to Telegram");
    }

    // Create and connect client
    const client = await deps.createTelegramClient(
      session,
      Boolean(opts.verbose),
      runtime,
    );

    try {
      await client.connect();

      if (!client.connected) {
        throw new Error("Failed to connect to Telegram");
      }

      let result;
      if (opts.media) {
        // Determine media type from file extension
        const ext = opts.media.toLowerCase().split(".").pop() || "";
        const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
        const videoExts = ["mp4", "mov", "avi", "mkv"];
        const audioExts = ["mp3", "wav", "ogg", "m4a"];

        let type: "image" | "video" | "audio" | "document" = "document";
        if (imageExts.includes(ext)) type = "image";
        else if (videoExts.includes(ext)) type = "video";
        else if (audioExts.includes(ext)) type = "audio";

        // Check if media is a URL or local file
        const isUrl = /^https?:\/\//i.test(opts.media);
        if (isUrl) {
          // Send URL directly
          result = await sendMediaMessage(client, opts.to, opts.message, {
            type,
            url: opts.media,
          });
        } else {
          // Load local file as buffer
          const buffer = await fs.readFile(opts.media);
          result = await sendMediaMessage(client, opts.to, opts.message, {
            type,
            buffer,
            fileName: path.basename(opts.media),
          });
        }
      } else {
        result = await sendTextMessage(client, opts.to, opts.message);
      }

      if (opts.json) {
        runtime.log(
          JSON.stringify(
            {
              provider: "telegram",
              to: opts.to,
              messageId: result.messageId,
              mediaUrl: opts.media ?? null,
            },
            null,
            2,
          ),
        );
      } else {
        runtime.log(
          success(`✅ Sent to ${opts.to} via Telegram (id ${result.messageId})`),
        );
      }
    } finally {
      // Always disconnect client
      await client.disconnect();
    }
    return;
  }

  if (opts.dryRun) {
    runtime.log(
      `[dry-run] would send via twilio -> ${opts.to}: ${opts.message}${opts.media ? ` (media ${opts.media})` : ""}`,
    );
    return;
  }

  let mediaUrl: string | undefined;
  if (opts.media) {
    mediaUrl = await deps.resolveTwilioMediaUrl(opts.media, {
      serveMedia: Boolean(opts.serveMedia),
      runtime,
    });
  }

  const result = await deps.sendMessage(
    opts.to,
    opts.message,
    { mediaUrl },
    runtime,
  );
  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          provider: "twilio",
          to: opts.to,
          sid: result?.sid ?? null,
          mediaUrl: mediaUrl ?? null,
        },
        null,
        2,
      ),
    );
  }
  if (!result) return;
  if (waitSeconds === 0) return;
  await deps.waitForFinalStatus(
    result.client,
    result.sid,
    waitSeconds,
    pollSeconds,
    runtime,
  );
}
