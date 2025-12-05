import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { readEnv } from "../env.js";
import { getChildLogger } from "../logging.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";

/**
 * Create a Telegram client with the given session.
 * If session is null, creates a new unauthenticated session.
 */
export async function createTelegramClient(
  session: StringSession | null,
  verbose: boolean,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<TelegramClient> {
  const env = readEnv(runtime);

  if (!env.telegram?.apiId || !env.telegram?.apiHash) {
    throw new Error(
      "Telegram API credentials not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables. " +
        "Get credentials from https://my.telegram.org/apps",
    );
  }

  const _logger = getChildLogger(
    { module: "telegram-client" },
    { level: verbose ? "info" : "silent" },
  );

  const client = new TelegramClient(
    session || new StringSession(""),
    Number.parseInt(env.telegram.apiId, 10),
    env.telegram.apiHash,
    {
      connectionRetries: 5,
      useWSS: true, // Use WebSocket for better reliability
    },
  );

  return client;
}

/**
 * Check if the given client is connected.
 */
export function isClientConnected(client: TelegramClient): boolean {
  return client.connected ?? false;
}
