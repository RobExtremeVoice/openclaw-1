import { Type } from "@sinclair/typebox";

import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../../routing/session-key.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import {
  isUuidLike,
  resolveDisplaySessionKey,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
  stripToolMessages,
} from "./sessions-helpers.js";

const SessionsHistoryToolSchema = Type.Object({
  sessionKey: Type.String(),
  limit: Type.Optional(Type.Number({ minimum: 1 })),
  includeTools: Type.Optional(Type.Boolean()),
});

function resolveSandboxSessionToolsVisibility(cfg: ReturnType<typeof loadConfig>) {
  return cfg.agents?.defaults?.sandbox?.sessionToolsVisibility ?? "spawned";
}

/**
 * Look up a session's key by its sessionId (UUID).
 * Returns the sessionKey if found, or null if not found.
 */
async function lookupSessionKeyById(sessionId: string): Promise<string | null> {
  try {
    const list = (await callGateway({
      method: "sessions.list",
      params: {
        includeGlobal: true,
        includeUnknown: true,
        limit: 1000,
      },
    })) as { sessions?: Array<{ key?: string; sessionId?: string }> };
    const sessions = Array.isArray(list?.sessions) ? list.sessions : [];
    const match = sessions.find(
      (entry) => entry?.sessionId === sessionId && typeof entry?.key === "string",
    );
    return match?.key ?? null;
  } catch {
    return null;
  }
}

async function isSpawnedSessionAllowed(params: {
  requesterSessionKey: string;
  targetSessionKey: string;
}): Promise<boolean> {
  try {
    const list = (await callGateway({
      method: "sessions.list",
      params: {
        includeGlobal: false,
        includeUnknown: false,
        limit: 500,
        spawnedBy: params.requesterSessionKey,
      },
    })) as { sessions?: Array<Record<string, unknown>> };
    const sessions = Array.isArray(list?.sessions) ? list.sessions : [];
    return sessions.some((entry) => entry?.key === params.targetSessionKey);
  } catch {
    return false;
  }
}

export function createSessionsHistoryTool(opts?: {
  agentSessionKey?: string;
  sandboxed?: boolean;
}): AnyAgentTool {
  return {
    label: "Session History",
    name: "sessions_history",
    description: "Fetch message history for a session.",
    parameters: SessionsHistoryToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      let sessionKey = readStringParam(params, "sessionKey", {
        required: true,
      });
      const cfg = loadConfig();
      const { mainKey, alias } = resolveMainSessionAlias(cfg);
      const visibility = resolveSandboxSessionToolsVisibility(cfg);

      // If the provided sessionKey looks like a UUID (sessionId), look up the actual sessionKey
      if (isUuidLike(sessionKey)) {
        const foundKey = await lookupSessionKeyById(sessionKey);
        if (!foundKey) {
          return jsonResult({
            status: "error",
            error: `Session not found for sessionId: ${sessionKey}`,
            hint: "Use the full sessionKey (e.g., 'agent:main:telegram:dm:123') or verify the sessionId exists via sessions_list.",
          });
        }
        sessionKey = foundKey;
      }

      const requesterInternalKey =
        typeof opts?.agentSessionKey === "string" && opts.agentSessionKey.trim()
          ? resolveInternalSessionKey({
              key: opts.agentSessionKey,
              alias,
              mainKey,
            })
          : undefined;
      const resolvedKey = resolveInternalSessionKey({
        key: sessionKey,
        alias,
        mainKey,
      });
      const restrictToSpawned =
        opts?.sandboxed === true &&
        visibility === "spawned" &&
        requesterInternalKey &&
        !isSubagentSessionKey(requesterInternalKey);
      if (restrictToSpawned) {
        const ok = await isSpawnedSessionAllowed({
          requesterSessionKey: requesterInternalKey,
          targetSessionKey: resolvedKey,
        });
        if (!ok) {
          return jsonResult({
            status: "forbidden",
            error: `Session not visible from this sandboxed agent session: ${sessionKey}`,
          });
        }
      }

      const routingA2A = cfg.tools?.agentToAgent;
      const a2aEnabled = routingA2A?.enabled === true;
      const allowPatterns = Array.isArray(routingA2A?.allow) ? routingA2A.allow : [];
      const matchesAllow = (agentId: string) => {
        if (allowPatterns.length === 0) return true;
        return allowPatterns.some((pattern) => {
          const raw = String(pattern ?? "").trim();
          if (!raw) return false;
          if (raw === "*") return true;
          if (!raw.includes("*")) return raw === agentId;
          const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`^${escaped.replaceAll("\\*", ".*")}$`, "i");
          return re.test(agentId);
        });
      };
      const requesterAgentId = normalizeAgentId(
        parseAgentSessionKey(requesterInternalKey)?.agentId,
      );
      const targetAgentId = normalizeAgentId(parseAgentSessionKey(resolvedKey)?.agentId);
      const isCrossAgent = requesterAgentId !== targetAgentId;
      if (isCrossAgent) {
        if (!a2aEnabled) {
          return jsonResult({
            status: "forbidden",
            error:
              "Agent-to-agent history is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent access.",
          });
        }
        if (!matchesAllow(requesterAgentId) || !matchesAllow(targetAgentId)) {
          return jsonResult({
            status: "forbidden",
            error: "Agent-to-agent history denied by tools.agentToAgent.allow.",
          });
        }
      }

      const limit =
        typeof params.limit === "number" && Number.isFinite(params.limit)
          ? Math.max(1, Math.floor(params.limit))
          : undefined;
      const includeTools = Boolean(params.includeTools);
      const result = (await callGateway({
        method: "chat.history",
        params: { sessionKey: resolvedKey, limit },
      })) as { messages?: unknown[] };
      const rawMessages = Array.isArray(result?.messages) ? result.messages : [];
      const messages = includeTools ? rawMessages : stripToolMessages(rawMessages);
      return jsonResult({
        sessionKey: resolveDisplaySessionKey({
          key: sessionKey,
          alias,
          mainKey,
        }),
        messages,
      });
    },
  };
}
