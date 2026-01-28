import { AgentMailClient } from "agentmail";

import { resolveCredentials } from "./accounts.js";
import { getAgentMailRuntime } from "./runtime.js";
import type { CoreConfig } from "./utils.js";

export const NOT_CONFIGURED_ERROR = "AgentMail not configured (missing token or email address)";

let sharedClient: AgentMailClient | null = null;
let sharedClientKey: string | null = null;

/** Resolves credentials from current config. */
export function getResolvedCredentials() {
  return resolveCredentials(getAgentMailRuntime().config.loadConfig() as CoreConfig);
}

/** Creates or returns a shared AgentMailClient instance. Recreates if key changed. */
export function getAgentMailClient(apiKey?: string): AgentMailClient {
  const key = apiKey ?? getResolvedCredentials().apiKey;
  if (!key) throw new Error("AgentMail token is required");

  if (sharedClient && sharedClientKey === key) return sharedClient;

  sharedClient = new AgentMailClient({ apiKey: key });
  sharedClientKey = key;
  return sharedClient;
}

/** Returns client and inboxId, or throws if not configured. */
export function getClientAndInbox(): { client: AgentMailClient; inboxId: string } {
  const { apiKey, inboxId } = getResolvedCredentials();
  if (!apiKey || !inboxId) throw new Error(NOT_CONFIGURED_ERROR);
  return { client: getAgentMailClient(apiKey), inboxId };
}
