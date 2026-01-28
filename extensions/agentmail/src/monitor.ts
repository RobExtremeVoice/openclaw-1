import type { AgentMail } from "agentmail";

import {
  getAgentMailClient,
  getResolvedCredentials,
  NOT_CONFIGURED_ERROR,
} from "./client.js";
import { getAgentMailRuntime } from "./runtime.js";
import { checkSenderAllowed, labelMessageAllowed } from "./filtering.js";
import { extractMessageBody, fetchFormattedThread } from "./thread.js";
import { parseEmailFromAddress, parseNameFromAddress } from "./utils.js";
import type { CoreConfig } from "./utils.js";

export type MonitorAgentMailOptions = {
  accountId?: string | null;
  abortSignal?: AbortSignal;
};

// Runtime state tracking
type RuntimeState = {
  running: boolean;
  lastStartAt: number | null;
  lastStopAt: number | null;
  lastError: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
};
const runtimeState = new Map<string, RuntimeState>();
const defaultState: RuntimeState = {
  running: false,
  lastStartAt: null,
  lastStopAt: null,
  lastError: null,
};

function recordState(accountId: string, state: Partial<RuntimeState>) {
  const key = `agentmail:${accountId}`;
  runtimeState.set(key, {
    ...(runtimeState.get(key) ?? defaultState),
    ...state,
  });
}

/** Returns runtime state for status checks. */
export function getAgentMailRuntimeState(accountId: string) {
  return runtimeState.get(`agentmail:${accountId}`);
}

/** Builds message body from event as fallback when thread fetch fails. */
function buildFallbackBody(message: AgentMail.messages.Message): string {
  const subject = message.subject ? `Subject: ${message.subject}\n\n` : "";
  return `${subject}${extractMessageBody(message)}`;
}

/**
 * Main monitor function that sets up WebSocket connection to AgentMail.
 */
export async function monitorAgentMailProvider(
  opts: MonitorAgentMailOptions = {}
): Promise<void> {
  const core = getAgentMailRuntime();
  const cfg = core.config.loadConfig() as CoreConfig;
  const agentmailConfig = cfg.channels?.agentmail;

  if (agentmailConfig?.enabled === false) {
    return;
  }

  const logger = core.logging.getChildLogger({ module: "agentmail-monitor" });
  const logVerbose = (msg: string) => {
    if (core.logging.shouldLogVerbose()) (logger.debug ?? logger.info)(msg);
  };

  const accountId = opts.accountId ?? "default";
  const { apiKey, inboxId } = getResolvedCredentials();
  if (!apiKey || !inboxId) {
    logger.warn(NOT_CONFIGURED_ERROR);
    return;
  }

  const client = getAgentMailClient(apiKey);
  const allowFrom = agentmailConfig?.allowFrom ?? [];

  recordState(accountId, {
    running: true,
    lastStartAt: Date.now(),
    lastError: null,
  });
  logger.info(`AgentMail: connecting WebSocket for ${inboxId}`);

  let socket: Awaited<ReturnType<typeof client.websockets.connect>> | null =
    null;
  let connectionCount = 0;

  const subscribe = () => {
    socket?.sendSubscribe({
      type: "subscribe",
      inboxIds: [inboxId],
      eventTypes: ["message.received"],
    });
  };

  try {
    socket = await client.websockets.connect({ authToken: apiKey });

    socket.on("open", () => {
      connectionCount++;
      const isReconnect = connectionCount > 1;
      logger.info(
        `AgentMail: WebSocket ${
          isReconnect ? "reconnected" : "connected"
        }, subscribing to ${inboxId}`
      );
      subscribe();
      if (isReconnect) {
        recordState(accountId, { lastError: null }); // Clear error on successful reconnect
      }
    });

    socket.on("message", async (event) => {
      if (event.type === "subscribed") {
        const sub = event as AgentMail.Subscribed;
        logger.info(
          `AgentMail: subscribed to ${sub.inboxIds?.join(", ") ?? "inbox"}`
        );
        return;
      }

      // Only handle message.received events
      if (event.type !== "event") return;
      const msgEvent = event as AgentMail.MessageReceivedEvent;
      if (msgEvent.eventType !== "message.received") return;

      const message = msgEvent.message;
      if (!message) return;

      const senderEmail = parseEmailFromAddress(message.from);
      logVerbose(`agentmail: received message from ${senderEmail}`);

      // Apply sender filtering
      if (!checkSenderAllowed(senderEmail, { allowFrom })) {
        logVerbose(`agentmail: sender ${senderEmail} not in allowFrom`);
        return;
      }

      // Label message as allowed (best effort)
      try {
        await labelMessageAllowed(client, inboxId, message.messageId);
      } catch (labelErr) {
        logVerbose(`agentmail: failed to label message: ${String(labelErr)}`);
      }

      recordState(accountId, { lastInboundAt: Date.now() });

      // Fetch the full thread from API
      const threadBody = await fetchFormattedThread(
        client,
        inboxId,
        message.threadId
      );
      const messageBody = extractMessageBody(message);
      const fullBody = threadBody || buildFallbackBody(message);

      // Resolve routing
      const route = core.channel.routing.resolveAgentRoute({
        cfg,
        channel: "agentmail",
        peer: { kind: "dm", id: senderEmail },
      });

      const senderName = parseNameFromAddress(message.from);
      const timestamp = new Date(message.timestamp).getTime();

      // Format envelope
      const storePath = core.channel.session.resolveStorePath(
        cfg.session?.store,
        { agentId: route.agentId }
      );
      const envelopeOptions =
        core.channel.reply.resolveEnvelopeFormatOptions(cfg);
      const previousTimestamp = core.channel.session.readSessionUpdatedAt({
        storePath,
        sessionKey: route.sessionKey,
      });
      const formattedBody = core.channel.reply.formatAgentEnvelope({
        channel: "Email",
        from: senderName,
        timestamp,
        previousTimestamp,
        envelope: envelopeOptions,
        body: `${fullBody}\n[email message_id: ${message.messageId} thread: ${message.threadId}]\n[Note: Your response will be sent automatically as an email reply. Do not use reply_to_message or send_message tools to respond to this email.]`,
      });

      // Build inbound context
      const ctxPayload = core.channel.reply.finalizeInboundContext({
        Body: formattedBody,
        RawBody: messageBody,
        CommandBody: messageBody,
        From: senderEmail,
        To: inboxId,
        SessionKey: route.sessionKey,
        AccountId: route.accountId,
        ChatType: "direct" as const,
        ConversationLabel: senderName,
        SenderName: senderName,
        SenderId: senderEmail,
        SenderUsername: senderEmail.split("@")[0],
        Provider: "agentmail" as const,
        Surface: "agentmail" as const,
        MessageSid: message.messageId,
        MessageThreadId: message.threadId,
        Timestamp: timestamp,
        CommandAuthorized: true,
        CommandSource: "text" as const,
        OriginatingChannel: "agentmail" as const,
        OriginatingTo: inboxId,
      });

      // Record session
      await core.channel.session.recordInboundSession({
        storePath,
        sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
        ctx: ctxPayload,
        updateLastRoute: {
          sessionKey: route.mainSessionKey,
          channel: "agentmail",
          to: inboxId,
          accountId: route.accountId,
        },
        onRecordError: (err) =>
          logger.warn(`Failed updating session meta: ${String(err)}`),
      });

      const preview = messageBody.slice(0, 200).replace(/\n/g, "\\n");
      logVerbose(`agentmail inbound: from=${senderEmail} preview="${preview}"`);

      const { dispatcher, replyOptions, markDispatchIdle } =
        core.channel.reply.createReplyDispatcherWithTyping({
          humanDelay: core.channel.reply.resolveHumanDelayConfig(
            cfg,
            route.agentId
          ),
          deliver: async (payload) => {
            const { sendAgentMailReply } = await import("./outbound.js");
            const text = payload.text ?? "";
            if (!text) return;
            await sendAgentMailReply({
              client,
              inboxId,
              messageId: message.messageId,
              text,
            });
            recordState(accountId, { lastOutboundAt: Date.now() });
          },
          onError: (err, info) =>
            logger.error(`agentmail ${info.kind} reply failed: ${String(err)}`),
        });

      const { queuedFinal, counts } =
        await core.channel.reply.dispatchReplyFromConfig({
          ctx: ctxPayload,
          cfg,
          dispatcher,
          replyOptions,
        });

      markDispatchIdle();

      if (queuedFinal) {
        logVerbose(
          `agentmail: delivered ${counts.final} reply(ies) to ${senderEmail}`
        );
        core.system.enqueueSystemEvent(`Email from ${senderName}: ${preview}`, {
          sessionKey: route.sessionKey,
          contextKey: `agentmail:message:${message.messageId}`,
        });
      }
    });

    socket.on("error", (error) => {
      logger.error(`AgentMail WebSocket error: ${String(error)}`);
      recordState(accountId, { lastError: String(error) });
    });

    socket.on("close", (event) => {
      // SDK's ReconnectingWebSocket will auto-reconnect (default 30 attempts)
      // On reconnect, "open" fires again and we resubscribe
      logger.warn(
        `AgentMail: WebSocket closed (code: ${event.code}), will attempt reconnect`
      );
    });

    // Wait for abort signal
    await new Promise<void>((resolve) => {
      const onAbort = () => {
        logVerbose("agentmail: stopping monitor");
        socket?.close();
        recordState(accountId, { running: false, lastStopAt: Date.now() });
        resolve();
      };

      if (opts.abortSignal?.aborted) {
        onAbort();
        return;
      }

      opts.abortSignal?.addEventListener("abort", onAbort, { once: true });
    });
  } catch (err) {
    logger.error(`AgentMail WebSocket connection failed: ${String(err)}`);
    recordState(accountId, {
      running: false,
      lastError: String(err),
      lastStopAt: Date.now(),
    });
  }
}
