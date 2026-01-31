import type {
  ChannelAccountSnapshot,
  OpenClawConfig,
  ReplyPayload,
  RuntimeEnv,
} from "openclaw/plugin-sdk";
import {
  createReplyPrefixContext,
  createTypingCallbacks,
  logInboundDrop,
  logTypingFailure,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  DEFAULT_GROUP_HISTORY_LIMIT,
  recordPendingHistoryEntryIfEnabled,
  resolveControlCommandGate,
  resolveChannelMediaMaxBytes,
  registerPluginHttpRoute,
  type HistoryEntry,
} from "openclaw/plugin-sdk";

import type {
  UniversalInboundMessage,
  UniversalTransportType,
  InboundHookContext,
} from "./types.js";
import { getUniversalImRuntime } from "./runtime.js";
import { resolveUniversalImAccount, type ResolvedUniversalImAccount } from "./accounts.js";
import { getProvider, getTransport, getInboundHooks } from "./registry/index.js";
import { sendMessageUniversalIm } from "./send.js";

export type MonitorUniversalImOpts = {
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

const RECENT_MESSAGE_TTL_MS = 5 * 60_000;
const RECENT_MESSAGE_MAX = 2000;

// Simple deduplication cache
type DedupeEntry = { expiresAt: number };
const recentInboundMessages = new Map<string, DedupeEntry>();

function checkAndRecordMessage(key: string): boolean {
  const now = Date.now();

  // Clean expired entries periodically
  if (recentInboundMessages.size > RECENT_MESSAGE_MAX) {
    for (const [k, v] of recentInboundMessages) {
      if (v.expiresAt < now) {
        recentInboundMessages.delete(k);
      }
    }
  }

  const existing = recentInboundMessages.get(key);
  if (existing && existing.expiresAt > now) {
    return true; // Already seen
  }

  recentInboundMessages.set(key, { expiresAt: now + RECENT_MESSAGE_TTL_MS });
  return false;
}

function resolveRuntime(opts: MonitorUniversalImOpts): RuntimeEnv {
  return (
    opts.runtime ?? {
      log: console.log,
      error: console.error,
      exit: (code: number): never => {
        throw new Error(`exit ${code}`);
      },
    }
  );
}

function normalizeAllowEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  return trimmed
    .replace(/^(universal-im|user):/i, "")
    .replace(/^@/, "")
    .toLowerCase();
}

function normalizeAllowList(entries: Array<string | number>): string[] {
  const normalized = entries.map((entry) => normalizeAllowEntry(String(entry))).filter(Boolean);
  return Array.from(new Set(normalized));
}

function isSenderAllowed(params: {
  senderId: string;
  senderName?: string;
  allowFrom: string[];
}): boolean {
  const { allowFrom } = params;
  if (allowFrom.length === 0) return false;
  if (allowFrom.includes("*")) return true;
  const normalizedSenderId = normalizeAllowEntry(params.senderId);
  const normalizedSenderName = params.senderName ? normalizeAllowEntry(params.senderName) : "";
  return allowFrom.some(
    (entry) =>
      entry === normalizedSenderId || (normalizedSenderName && entry === normalizedSenderName),
  );
}

function formatInboundFromLabel(params: {
  isGroup: boolean;
  groupLabel: string;
  directLabel: string;
}): string {
  return params.isGroup ? `${params.groupLabel}` : params.directLabel;
}

/**
 * Main monitor function for Universal IM.
 * Handles the full pipeline: transport → provider → normalize → route → dispatch.
 */
export async function monitorUniversalImProvider(
  opts: MonitorUniversalImOpts = {},
): Promise<void> {
  const core = getUniversalImRuntime();
  const runtime = resolveRuntime(opts);
  const cfg = opts.config ?? core.config.loadConfig();

  const account = resolveUniversalImAccount({
    cfg,
    accountId: opts.accountId,
  });

  const provider = getProvider(account.provider);
  if (!provider) {
    throw new Error(
      `Unknown provider "${account.provider}" for account "${account.accountId}". ` +
        `Register it with registerProvider() or use "custom".`,
    );
  }

  const transport = getTransport(account.transport);
  if (!transport) {
    throw new Error(
      `Unknown transport "${account.transport}" for account "${account.accountId}". ` +
        `Register it with registerTransport() or use "webhook", "websocket", or "polling".`,
    );
  }

  const logger = core.logging.getChildLogger({ module: "universal-im" });
  const logVerbose = (message: string) => {
    if (!core.logging.shouldLogVerbose()) return;
    logger.debug?.(message);
  };

  const mediaMaxBytes =
    resolveChannelMediaMaxBytes({
      cfg,
      resolveChannelLimitMb: () => undefined,
      accountId: account.accountId,
    }) ?? 8 * 1024 * 1024;

  const historyLimit = Math.max(
    0,
    cfg.messages?.groupChat?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT,
  );
  const channelHistories = new Map<string, HistoryEntry[]>();

  runtime.log?.(`universal-im starting: provider=${account.provider} transport=${account.transport}`);

  /**
   * Handle a normalized inbound message.
   */
  const handleMessage = async (msg: UniversalInboundMessage) => {
    // Dedupe
    const dedupeKey = `${account.accountId}:${msg.messageId}`;
    if (checkAndRecordMessage(dedupeKey)) {
      logVerbose(`universal-im: drop duplicate message ${msg.messageId}`);
      return;
    }

    // Skip bot messages
    if (msg.sender.isBot) {
      logVerbose(`universal-im: drop bot message from ${msg.sender.id}`);
      return;
    }

    // Run inbound hooks (afterNormalize)
    const inboundHooks = getInboundHooks();
    const hookCtx: InboundHookContext = {
      accountId: account.accountId,
      config: account.config,
      provider: account.provider,
      transport: account.transport,
    };

    for (const hook of inboundHooks) {
      try {
        hook.afterNormalize?.(msg, hookCtx);
      } catch (err) {
        logger.debug?.(`inbound hook ${hook.id} afterNormalize failed: ${String(err)}`);
      }
    }

    // Determine chat type
    const kind = msg.conversation.type;
    const chatType = kind === "direct" ? "direct" : kind === "group" ? "group" : "channel";
    const isGroup = kind !== "direct";

    // Security checks
    const senderId = msg.sender.id;
    const senderName = msg.sender.name ?? msg.sender.username ?? senderId;
    const rawText = msg.body.text?.trim() ?? "";

    const dmPolicy = account.config.dmPolicy ?? "pairing";
    const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
    const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

    const configAllowFrom = normalizeAllowList(account.config.allowFrom ?? []);
    const configGroupAllowFrom = normalizeAllowList(account.config.groupAllowFrom ?? []);
    const storeAllowFrom = normalizeAllowList(
      await core.channel.pairing.readAllowFromStore("universal-im").catch(() => []),
    );
    const effectiveAllowFrom = Array.from(new Set([...configAllowFrom, ...storeAllowFrom]));
    const effectiveGroupAllowFrom = Array.from(
      new Set([
        ...(configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom),
        ...storeAllowFrom,
      ]),
    );

    const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
      cfg,
      surface: "universal-im",
    });
    const hasControlCommand = core.channel.text.hasControlCommand(rawText, cfg);
    const isControlCommand = allowTextCommands && hasControlCommand;
    const useAccessGroups = cfg.commands?.useAccessGroups !== false;
    const senderAllowedForCommands = isSenderAllowed({
      senderId,
      senderName,
      allowFrom: effectiveAllowFrom,
    });
    const groupAllowedForCommands = isSenderAllowed({
      senderId,
      senderName,
      allowFrom: effectiveGroupAllowFrom,
    });

    const commandGate = resolveControlCommandGate({
      useAccessGroups,
      authorizers: [
        { configured: effectiveAllowFrom.length > 0, allowed: senderAllowedForCommands },
        { configured: effectiveGroupAllowFrom.length > 0, allowed: groupAllowedForCommands },
      ],
      allowTextCommands,
      hasControlCommand,
    });
    const commandAuthorized =
      kind === "direct"
        ? dmPolicy === "open" || senderAllowedForCommands
        : commandGate.commandAuthorized;

    // DM policy check
    if (kind === "direct") {
      if (dmPolicy === "disabled") {
        logVerbose(`universal-im: drop dm (dmPolicy=disabled sender=${senderId})`);
        return;
      }
      if (dmPolicy !== "open" && !senderAllowedForCommands) {
        if (dmPolicy === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "universal-im",
            id: senderId,
            meta: { name: senderName },
          });
          logVerbose(`universal-im: pairing request sender=${senderId} created=${created}`);
          if (created) {
            try {
              await sendMessageUniversalIm(
                `user:${senderId}`,
                core.channel.pairing.buildPairingReply({
                  channel: "universal-im",
                  idLine: `Your user id: ${senderId}`,
                  code,
                }),
                { accountId: account.accountId },
              );
              opts.statusSink?.({ lastOutboundAt: Date.now() });
            } catch (err) {
              logVerbose(`universal-im: pairing reply failed for ${senderId}: ${String(err)}`);
            }
          }
        }
        return;
      }
    } else {
      // Group policy check
      if (groupPolicy === "disabled") {
        logVerbose("universal-im: drop group message (groupPolicy=disabled)");
        return;
      }
      if (groupPolicy === "allowlist") {
        if (effectiveGroupAllowFrom.length === 0) {
          logVerbose("universal-im: drop group message (no group allowlist)");
          return;
        }
        if (!groupAllowedForCommands) {
          logVerbose(`universal-im: drop group sender=${senderId} (not in groupAllowFrom)`);
          return;
        }
      }
    }

    if (!isGroup && commandGate.shouldBlock) {
      logInboundDrop({
        log: logVerbose,
        channel: "universal-im",
        reason: "control command (unauthorized)",
        target: senderId,
      });
      return;
    }

    // Run inbound hooks (beforeRouting)
    for (const hook of inboundHooks) {
      try {
        hook.beforeRouting?.(msg, hookCtx);
      } catch (err) {
        logger.debug?.(`inbound hook ${hook.id} beforeRouting failed: ${String(err)}`);
      }
    }

    // Resolve route
    const conversationId = msg.conversation.id;
    const teamId = msg.conversation.teamId;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "universal-im",
      accountId: account.accountId,
      teamId,
      peer: {
        kind,
        id: kind === "direct" ? senderId : conversationId,
      },
    });

    const baseSessionKey = route.sessionKey;
    const threadId = msg.conversation.threadId;
    const sessionKey = threadId ? `${baseSessionKey}:thread:${threadId}` : baseSessionKey;
    const historyKey = isGroup ? sessionKey : null;

    // Build body text with attachments placeholder
    let bodyText = rawText;
    if (msg.body.attachments && msg.body.attachments.length > 0) {
      const mediaKind = msg.body.attachments[0].kind === "unknown" ? "file" : msg.body.attachments[0].kind;
      const placeholder = msg.body.attachments.length === 1
        ? `<media:${mediaKind}>`
        : `<media:${mediaKind}> (${msg.body.attachments.length} files)`;
      bodyText = [rawText, placeholder].filter(Boolean).join("\n");
    }

    if (!bodyText) return;

    // Record activity
    core.channel.activity.record({
      channel: "universal-im",
      accountId: account.accountId,
      direction: "inbound",
    });

    // Format from label
    const conversationName = msg.conversation.name ?? conversationId;
    const fromLabel = formatInboundFromLabel({
      isGroup,
      groupLabel: conversationName,
      directLabel: senderName,
    });

    // System event
    const preview = bodyText.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isGroup
      ? `Universal IM message in ${conversationName} from ${senderName}`
      : `Universal IM DM from ${senderName}`;
    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey,
      contextKey: `universal-im:message:${conversationId}:${msg.messageId}`,
    });

    // Build context payload
    const textWithId = `${bodyText}\n[universal-im message id: ${msg.messageId} conversation: ${conversationId}]`;
    const body = core.channel.reply.formatInboundEnvelope({
      channel: "Universal IM",
      from: fromLabel,
      timestamp: msg.timestamp,
      body: textWithId,
      chatType,
      sender: { name: senderName, id: senderId },
    });

    let combinedBody = body;
    if (historyKey) {
      combinedBody = buildPendingHistoryContextFromMap({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
        currentMessage: combinedBody,
        formatEntry: (entry) =>
          core.channel.reply.formatInboundEnvelope({
            channel: "Universal IM",
            from: fromLabel,
            timestamp: entry.timestamp,
            body: `${entry.body}${entry.messageId ? ` [id:${entry.messageId}]` : ""}`,
            chatType,
            senderLabel: entry.sender,
          }),
      });
    }

    const to =
      kind === "direct"
        ? `user:${senderId}`
        : kind === "group"
          ? `group:${conversationId}`
          : `channel:${conversationId}`;

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: combinedBody,
      RawBody: bodyText,
      CommandBody: bodyText,
      From:
        kind === "direct"
          ? `universal-im:${senderId}`
          : `universal-im:${kind}:${conversationId}`,
      To: to,
      SessionKey: sessionKey,
      ParentSessionKey: threadId ? baseSessionKey : undefined,
      AccountId: route.accountId,
      ChatType: chatType,
      ConversationLabel: fromLabel,
      GroupSubject: isGroup ? conversationName : undefined,
      GroupSpace: teamId,
      SenderName: senderName,
      SenderId: senderId,
      Provider: "universal-im" as const,
      Surface: "universal-im" as const,
      MessageSid: msg.messageId,
      ReplyToId: threadId,
      MessageThreadId: threadId,
      Timestamp: msg.timestamp,
      CommandAuthorized: commandAuthorized,
      OriginatingChannel: "universal-im" as const,
      OriginatingTo: to,
    });

    // Update session if DM
    if (kind === "direct") {
      const sessionCfg = cfg.session;
      const storePath = core.channel.session.resolveStorePath(sessionCfg?.store, {
        agentId: route.agentId,
      });
      await core.channel.session.updateLastRoute({
        storePath,
        sessionKey: route.mainSessionKey,
        deliveryContext: {
          channel: "universal-im",
          to,
          accountId: route.accountId,
        },
      });
    }

    logVerbose(
      `universal-im inbound: from=${ctxPayload.From} len=${bodyText.length} preview="${preview}"`,
    );

    // Prepare reply dispatch
    const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "universal-im", account.accountId, {
      fallbackLimit: account.config.textChunkLimit ?? 4000,
    });
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "universal-im",
      accountId: account.accountId,
    });

    const prefixContext = createReplyPrefixContext({ cfg, agentId: route.agentId });

    const typingCallbacks = createTypingCallbacks({
      start: () => {
        // Universal IM doesn't have built-in typing indicators
        // Could be added via hooks if needed
      },
      onStartError: (err) => {
        logTypingFailure({
          log: (message) => logger.debug?.(message),
          channel: "universal-im",
          target: to,
          error: err,
        });
      },
    });

    const { dispatcher, replyOptions, markDispatchIdle } =
      core.channel.reply.createReplyDispatcherWithTyping({
        responsePrefix: prefixContext.responsePrefix,
        responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
        humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
        deliver: async (payload: ReplyPayload) => {
          const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
          const text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);

          if (mediaUrls.length === 0) {
            const chunkMode = core.channel.text.resolveChunkMode(
              cfg,
              "universal-im",
              account.accountId,
            );
            const chunks = core.channel.text.chunkMarkdownTextWithMode(text, textLimit, chunkMode);
            for (const chunk of chunks.length > 0 ? chunks : [text]) {
              if (!chunk) continue;
              await sendMessageUniversalIm(to, chunk, {
                accountId: account.accountId,
                replyToId: threadId,
              });
            }
          } else {
            let first = true;
            for (const mediaUrl of mediaUrls) {
              const caption = first ? text : "";
              first = false;
              await sendMessageUniversalIm(to, caption, {
                accountId: account.accountId,
                mediaUrl,
                replyToId: threadId,
              });
            }
          }
          runtime.log?.(`delivered reply to ${to}`);
        },
        onError: (err, info) => {
          runtime.error?.(`universal-im ${info.kind} reply failed: ${String(err)}`);
        },
        onReplyStart: typingCallbacks.onReplyStart,
      });

    // Dispatch reply from config
    await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions: {
        ...replyOptions,
        disableBlockStreaming:
          typeof account.config.blockStreaming === "boolean"
            ? !account.config.blockStreaming
            : undefined,
        onModelSelected: prefixContext.onModelSelected,
      },
    });

    markDispatchIdle();

    if (historyKey) {
      clearHistoryEntriesIfEnabled({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
      });
    }
  };

  // Register webhook HTTP route if using webhook transport
  let unregisterWebhook: (() => void) | undefined;
  if (account.transport === "webhook") {
    const webhookPath = account.webhookPath ?? `/universal-im/${account.accountId}/webhook`;
    const webhookSecret = account.webhookSecret;

    unregisterWebhook = registerPluginHttpRoute({
      path: webhookPath,
      pluginId: "universal-im",
      accountId: account.accountId,
      source: "universal-im-monitor",
      log: (msg) => runtime.log?.(msg),
      handler: async (req, res) => {
        // Only accept POST
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        // Read body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const bodyText = Buffer.concat(chunks).toString("utf-8");

        // Verify secret if configured
        if (webhookSecret) {
          const providedSecret =
            req.headers["x-webhook-secret"] ??
            req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
          if (providedSecret !== webhookSecret) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
          }
        }

        // Parse and process message
        try {
          const rawEvent = JSON.parse(bodyText);
          const msg = provider.parseInbound(rawEvent, {
            accountId: account.accountId,
            config: account.config,
            transport: "webhook",
          });

          if (msg) {
            opts.statusSink?.({ lastInboundAt: Date.now() });
            // Process asynchronously
            handleMessage(msg).catch((err) => {
              runtime.error?.(`universal-im webhook handler failed: ${String(err)}`);
            });
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          runtime.error?.(`universal-im webhook parse error: ${String(err)}`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      },
    });

    runtime.log?.(`universal-im: registered webhook at ${webhookPath}`);
  }

  // Start transport
  opts.statusSink?.({
    accountId: account.accountId,
    running: true,
    lastStartAt: Date.now(),
  });

  await transport.start({
    accountId: account.accountId,
    config: account.config,
    abortSignal: opts.abortSignal ?? new AbortController().signal,
    onMessage: async (rawEvent: unknown) => {
      try {
        const msg = provider.parseInbound(rawEvent, {
          accountId: account.accountId,
          config: account.config,
          transport: account.transport,
        });

        if (msg) {
          opts.statusSink?.({ lastInboundAt: Date.now() });
          await handleMessage(msg);
        }
      } catch (err) {
        runtime.error?.(`universal-im handler failed: ${String(err)}`);
      }
    },
    onError: (error: Error) => {
      runtime.error?.(`universal-im transport error: ${error.message}`);
      opts.statusSink?.({ lastError: error.message });
    },
    onConnected: () => {
      opts.statusSink?.({
        connected: true,
        lastConnectedAt: Date.now(),
        lastError: null,
      });
      runtime.log?.(`universal-im connected: provider=${account.provider} transport=${account.transport}`);
    },
    onDisconnected: (reason?: string) => {
      opts.statusSink?.({
        connected: false,
        lastDisconnect: {
          at: Date.now(),
          error: reason,
        },
      });
      // Cleanup webhook registration
      unregisterWebhook?.();
    },
  });
}
