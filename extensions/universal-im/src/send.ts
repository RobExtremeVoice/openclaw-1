import type { UniversalOutboundPayload } from "./types.js";
import { getUniversalImRuntime } from "./runtime.js";
import { resolveUniversalImAccount } from "./accounts.js";
import { getProvider } from "./registry/index.js";
import { getOutboundHooks } from "./registry/hook-registry.js";

export type UniversalImSendOpts = {
  accountId?: string;
  mediaUrl?: string;
  replyToId?: string;
  threadId?: string;
  meta?: Record<string, unknown>;
};

export type UniversalImSendResult = {
  messageId: string;
  to: string;
};

/**
 * Send a message via Universal IM.
 */
export async function sendMessageUniversalIm(
  to: string,
  text: string,
  opts: UniversalImSendOpts = {},
): Promise<UniversalImSendResult> {
  const core = getUniversalImRuntime();
  const logger = core.logging.getChildLogger({ module: "universal-im" });
  const cfg = core.config.loadConfig();

  const account = resolveUniversalImAccount({
    cfg,
    accountId: opts.accountId,
  });

  const provider = getProvider(account.provider);
  if (!provider) {
    throw new Error(`Unknown provider: ${account.provider}`);
  }

  const outboundUrl = account.outboundUrl;
  if (!outboundUrl) {
    throw new Error(
      `Universal IM outbound URL missing for account "${account.accountId}". ` +
        `Set channels.universal-im.outbound.url in config.`,
    );
  }

  // Build universal payload
  const payload: UniversalOutboundPayload = {
    provider: account.provider,
    to,
    text: text?.trim() ?? "",
    mediaUrl: opts.mediaUrl?.trim(),
    replyToId: opts.replyToId?.trim(),
    threadId: opts.threadId?.trim(),
    meta: opts.meta,
  };

  // Run outbound hooks (beforeBuild)
  const outboundHooks = getOutboundHooks();
  const hookCtx = {
    accountId: account.accountId,
    config: account.config,
    provider: account.provider,
  };

  for (const hook of outboundHooks) {
    try {
      hook.beforeBuild?.(payload, hookCtx);
    } catch (err) {
      logger.debug?.(`outbound hook ${hook.id} beforeBuild failed: ${String(err)}`);
    }
  }

  // Build provider-specific payload
  const providerPayload = provider.buildOutbound(payload, {
    accountId: account.accountId,
    config: account.config,
  });

  // Send to outbound URL
  const response = await fetch(outboundUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(account.outboundAuthHeader
        ? { Authorization: account.outboundAuthHeader }
        : {}),
    },
    body: JSON.stringify(providerPayload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Universal IM send failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  const messageId =
    (result as Record<string, unknown>)?.messageId ??
    (result as Record<string, unknown>)?.id ??
    `sent-${Date.now()}`;

  // Run outbound hooks (afterSend)
  for (const hook of outboundHooks) {
    try {
      hook.afterSend?.(payload, result, hookCtx);
    } catch (err) {
      logger.debug?.(`outbound hook ${hook.id} afterSend failed: ${String(err)}`);
    }
  }

  // Record activity
  core.channel.activity.record({
    channel: "universal-im",
    accountId: account.accountId,
    direction: "outbound",
  });

  return {
    messageId: String(messageId),
    to,
  };
}
