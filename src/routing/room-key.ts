import type { PluginHookResolveRoomKeyEvent } from "../plugins/types.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";

export async function resolveCanonicalRoomKey(params: {
  cfg: unknown;
  roomKey: string;
  baseRoomKey: string;
  event: Omit<PluginHookResolveRoomKeyEvent, "roomKey" | "baseRoomKey">;
}): Promise<string> {
  const roomKey = params.roomKey.trim();
  if (!roomKey) return roomKey;

  const runner = getGlobalHookRunner();
  if (!runner?.hasHooks?.("resolve_room_key")) {
    return roomKey;
  }

  const out = await runner.runResolveRoomKey(
    {
      ...params.event,
      roomKey,
      baseRoomKey: params.baseRoomKey,
    },
    {
      channelId: params.event.channel,
      sessionKey: roomKey,
    },
  );

  return typeof out?.roomKey === "string" && out.roomKey.trim() ? out.roomKey.trim() : roomKey;
}
