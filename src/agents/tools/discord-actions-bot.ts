import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { DiscordActionConfig } from "../../config/config.js";
import {
  setNicknameDiscord,
  setPresenceDiscord,
  type DiscordActivityType,
  type DiscordPresenceStatus,
} from "../../discord/send.js";
import { type ActionGate, jsonResult, readStringParam } from "./common.js";

const validPresenceStatuses: DiscordPresenceStatus[] = ["online", "idle", "dnd", "invisible"];
const validActivityTypes: DiscordActivityType[] = [
  "playing",
  "streaming",
  "listening",
  "watching",
  "custom",
  "competing",
];

export async function handleDiscordBotAction(
  action: string,
  params: Record<string, unknown>,
  isActionEnabled: ActionGate<DiscordActionConfig>,
): Promise<AgentToolResult<unknown>> {
  const accountId = readStringParam(params, "accountId");

  switch (action) {
    case "setPresence": {
      if (!isActionEnabled("presence")) {
        throw new Error("Discord presence updates are disabled.");
      }

      const status = readStringParam(params, "status");
      const activityName = readStringParam(params, "activityName");
      const activityType = readStringParam(params, "activityType") as
        | DiscordActivityType
        | undefined;
      const activityUrl = readStringParam(params, "activityUrl");
      const afk = typeof params.afk === "boolean" ? params.afk : undefined;

      // Validate status
      if (status && !validPresenceStatuses.includes(status as DiscordPresenceStatus)) {
        throw new Error(
          `Invalid presence status: ${status}. Must be one of: ${validPresenceStatuses.join(", ")}`,
        );
      }

      // Validate activity type
      if (activityType && !validActivityTypes.includes(activityType)) {
        throw new Error(
          `Invalid activity type: ${activityType}. Must be one of: ${validActivityTypes.join(", ")}`,
        );
      }

      const presence: {
        status?: DiscordPresenceStatus;
        activity?: { name: string; type: DiscordActivityType; url?: string };
        afk?: boolean;
      } = {};

      if (status) presence.status = status as DiscordPresenceStatus;
      if (activityName) {
        presence.activity = {
          name: activityName,
          type: activityType ?? "playing",
          ...(activityUrl ? { url: activityUrl } : {}),
        };
      }
      if (afk !== undefined) presence.afk = afk;

      await (accountId
        ? setPresenceDiscord(presence, { accountId })
        : setPresenceDiscord(presence));

      return jsonResult({
        ok: true,
        presence: {
          status: presence.status ?? "online",
          activity: presence.activity?.name,
          activityType: presence.activity?.type,
        },
      });
    }

    case "setNickname": {
      if (!isActionEnabled("nickname")) {
        throw new Error("Discord nickname updates are disabled.");
      }

      const guildId = readStringParam(params, "guildId", { required: true });
      const nickname = readStringParam(params, "nickname");
      // null/empty string means reset to default (remove custom nickname)
      const effectiveNickname = nickname || null;

      await (accountId
        ? setNicknameDiscord(guildId, effectiveNickname, { accountId })
        : setNicknameDiscord(guildId, effectiveNickname));

      return jsonResult({
        ok: true,
        guildId,
        nickname: effectiveNickname,
      });
    }

    default:
      throw new Error(`Unknown bot action: ${action}`);
  }
}
