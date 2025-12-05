import type { Api, TelegramClient } from "telegram";

// Entity type - can be User, Chat, Channel, or their empty variants
type Entity = Api.User | Api.Chat | Api.Channel;

/**
 * Resolve Telegram entity (user/chat) from identifier.
 * Supports @username, phone number, or user ID.
 */
export async function resolveEntity(
  client: TelegramClient,
  identifier: string,
): Promise<Entity> {
  // Clean identifier
  const clean = identifier.trim();

  // Try as-is first (handles @username, phone, user ID)
  try {
    return (await client.getEntity(clean)) as Entity;
  } catch (_firstErr) {
    // If not @ prefix, try adding it
    if (!clean.startsWith("@")) {
      try {
        return (await client.getEntity(`@${clean}`)) as Entity;
      } catch {
        // Fall through to error
      }
    }

    throw new Error(
      `Could not resolve Telegram entity: ${identifier}. ` +
        "Use @username, phone number (+1234567890), or user ID.",
    );
  }
}

/**
 * Extract user ID from entity as string to avoid precision loss.
 * Telegram IDs are bigint and can exceed Number.MAX_SAFE_INTEGER.
 */
export function extractUserId(entity: Entity): string {
  // Extract ID as unknown to bypass TypeScript's overly narrow type inference
  const id = ("id" in entity ? entity.id : null) as unknown;
  if (typeof id === "bigint") {
    return id.toString();
  }
  return "0";
}
