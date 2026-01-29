import { DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { resolveDefaultSessionStorePath } from "./paths.js";
import { loadSessionStore } from "./store.js";
import type { SessionEntry } from "./types.js";

type Config = {
  agents?: { list?: Array<{ id?: string }> };
};

export function loadCombinedSessionStoreForGateway(cfg: Config): {
  store: Record<string, SessionEntry>;
} {
  const agents = cfg.agents?.list ?? [];
  const agentIds = new Set<string>();
  if (agents.length === 0) {
    agentIds.add(DEFAULT_AGENT_ID);
  } else {
    for (const a of agents) {
      if (a.id) agentIds.add(a.id);
    }
  }

  const combinedStore: Record<string, SessionEntry> = {};

  for (const agentId of agentIds) {
    const storePath = resolveDefaultSessionStorePath(agentId);
    const store = loadSessionStore(storePath);
    Object.assign(combinedStore, store);
  }

  return { store: combinedStore };
}

export function resolveGatewaySessionStoreTarget(params: { cfg: Config; key: string }): {
  storePath: string;
  canonicalKey: string;
} {
  const { cfg, key } = params;
  const agents = cfg.agents?.list ?? [];
  const agentIds = new Set<string>();
  if (agents.length === 0) {
    agentIds.add(DEFAULT_AGENT_ID);
  } else {
    for (const a of agents) {
      if (a.id) agentIds.add(a.id);
    }
  }

  for (const agentId of agentIds) {
    const storePath = resolveDefaultSessionStorePath(agentId);
    const store = loadSessionStore(storePath);
    if (key in store) {
      return { storePath, canonicalKey: key };
    }
  }

  const defaultPath = resolveDefaultSessionStorePath(DEFAULT_AGENT_ID);
  return { storePath: defaultPath, canonicalKey: key };
}
