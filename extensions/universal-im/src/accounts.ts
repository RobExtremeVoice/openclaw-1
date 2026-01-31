import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId as sdkNormalizeAccountId } from "openclaw/plugin-sdk";

import type { UniversalImAccountConfig, UniversalImConfig } from "./types.js";
import { getUniversalImRuntime } from "./runtime.js";

export type ResolvedUniversalImAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  provider: string;
  transport: "webhook" | "websocket" | "polling";
  config: UniversalImAccountConfig;
  // Derived fields
  webhookPath?: string;
  webhookSecret?: string;
  outboundUrl?: string;
  outboundAuthHeader?: string;
};

/**
 * List all configured Universal IM account IDs.
 */
export function listUniversalImAccountIds(cfg: OpenClawConfig): string[] {
  const channelConfig = cfg.channels?.["universal-im"] as UniversalImConfig | undefined;
  if (!channelConfig) return [];

  const ids = new Set<string>();

  // Check if base config has any meaningful settings
  if (channelConfig.provider || channelConfig.webhook || channelConfig.websocket) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  // Add explicit accounts
  const accounts = channelConfig.accounts ?? {};
  for (const accountId of Object.keys(accounts)) {
    if (accountId && accounts[accountId]) {
      ids.add(sdkNormalizeAccountId(accountId));
    }
  }

  return Array.from(ids);
}

/**
 * Resolve the default account ID.
 */
export function resolveDefaultUniversalImAccountId(cfg: OpenClawConfig): string {
  const ids = listUniversalImAccountIds(cfg);
  if (ids.length === 0) return DEFAULT_ACCOUNT_ID;
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0];
}

/**
 * Resolve a Universal IM account configuration.
 */
export function resolveUniversalImAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedUniversalImAccount {
  const { cfg, accountId } = params;
  const effectiveAccountId = accountId ? sdkNormalizeAccountId(accountId) : DEFAULT_ACCOUNT_ID;

  const channelConfig = cfg.channels?.["universal-im"] as UniversalImConfig | undefined;
  const baseConfig = channelConfig ?? {};
  const accountConfig =
    effectiveAccountId !== DEFAULT_ACCOUNT_ID
      ? channelConfig?.accounts?.[effectiveAccountId] ?? {}
      : {};

  // Merge base and account config (account takes precedence)
  const merged: UniversalImAccountConfig = {
    ...baseConfig,
    ...accountConfig,
    // Merge nested objects
    webhook: { ...baseConfig.webhook, ...accountConfig.webhook },
    websocket: { ...baseConfig.websocket, ...accountConfig.websocket },
    polling: { ...baseConfig.polling, ...accountConfig.polling },
    outbound: { ...baseConfig.outbound, ...accountConfig.outbound },
    providerConfig: { ...baseConfig.providerConfig, ...accountConfig.providerConfig },
  };

  const enabled = merged.enabled !== false;
  const provider = merged.provider ?? "custom";
  const transport = merged.transport ?? "webhook";

  return {
    accountId: effectiveAccountId,
    name: merged.name,
    enabled,
    provider,
    transport,
    config: merged,
    webhookPath: merged.webhook?.path ?? `/universal-im/${effectiveAccountId}/webhook`,
    webhookSecret: merged.webhook?.secret,
    outboundUrl: merged.outbound?.url,
    outboundAuthHeader: merged.outbound?.authHeader,
  };
}

/**
 * Get the normalized account ID.
 */
export function normalizeAccountId(accountId?: string): string {
  return accountId ? sdkNormalizeAccountId(accountId) : DEFAULT_ACCOUNT_ID;
}

/**
 * Check if an account is configured (has required settings).
 */
export function isUniversalImAccountConfigured(account: ResolvedUniversalImAccount): boolean {
  const { transport, config } = account;

  // Webhook transport is always "configured" (uses default path)
  if (transport === "webhook") {
    return true;
  }

  // WebSocket requires URL
  if (transport === "websocket") {
    return Boolean(config.websocket?.url);
  }

  // Polling requires URL
  if (transport === "polling") {
    return Boolean(config.polling?.url);
  }

  return false;
}
