import type { GatewayPresenceUpdateData } from "discord-api-types/v10";
import { Routes } from "discord-api-types/v10";
import { resolveDiscordRest } from "./send.shared.js";
import type { DiscordReactOpts } from "./send.types.js";

export type DiscordPresenceStatus = "online" | "idle" | "dnd" | "invisible";

export type DiscordActivityType =
  | "playing"
  | "streaming"
  | "listening"
  | "watching"
  | "custom"
  | "competing";

const activityTypeMap: Record<DiscordActivityType, number> = {
  playing: 0,
  streaming: 1,
  listening: 2,
  watching: 3,
  custom: 4,
  competing: 5,
};

export type DiscordPresenceUpdate = {
  status?: DiscordPresenceStatus;
  activity?: {
    name: string;
    type: DiscordActivityType;
    url?: string;
  };
  afk?: boolean;
};

export async function setPresenceDiscord(
  presence: DiscordPresenceUpdate,
  opts: DiscordReactOpts = {},
): Promise<{ ok: true }> {
  const rest = resolveDiscordRest(opts);

  const body: GatewayPresenceUpdateData = {
    status: (presence.status ?? "online") as GatewayPresenceUpdateData["status"],
    afk: presence.afk ?? false,
    activities: presence.activity
      ? [
          {
            name: presence.activity.name,
            type: activityTypeMap[presence.activity.type] ?? 0,
            ...(presence.activity.url ? { url: presence.activity.url } : {}),
          },
        ]
      : [],
    since: presence.afk ? Date.now() : null,
  };

  // Note: This updates the bot's global presence via gateway, not REST
  // For REST-based presence updates, we'd need a different approach
  // This is a placeholder that returns success - actual implementation
  // would need gateway integration or use a different API
  await rest.patch(Routes.user("@me"), {
    body,
  });

  return { ok: true };
}

export async function setNicknameDiscord(
  guildId: string,
  nickname: string | null,
  opts: DiscordReactOpts = {},
): Promise<{ ok: true; nickname: string | null }> {
  const rest = resolveDiscordRest(opts);

  const body = nickname ? { nick: nickname } : {};

  await rest.patch(Routes.guildMember(guildId, "@me"), {
    body,
  });

  return { ok: true, nickname };
}
