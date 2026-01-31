import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import type { OpenClawConfig, MarkdownTableMode } from "openclaw/plugin-sdk";

import type { ResolvedKakaoAccount } from "./accounts.js";
import type { KakaoSkillRequest, KakaoSkillResponse } from "./types.js";
import {
  buildTextResponse,
  buildTimeoutResponse,
  buildErrorResponse,
} from "./api.js";
import { getKakaoRuntime } from "./runtime.js";

export type KakaoRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type KakaoMonitorOptions = {
  token: string;
  account: ResolvedKakaoAccount;
  config: OpenClawConfig;
  runtime: KakaoRuntimeEnv;
  abortSignal: AbortSignal;
  webhookPath?: string;
  webhookSecret?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export type KakaoMonitorResult = {
  stop: () => void;
};

/** Default timeout for waiting for agent response (ms). */
const DEFAULT_RESPONSE_TIMEOUT_MS = 4500;

type KakaoCoreRuntime = ReturnType<typeof getKakaoRuntime>;

function logVerbose(core: KakaoCoreRuntime, runtime: KakaoRuntimeEnv, message: string): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log?.(`[kakao] ${message}`);
  }
}

function isSenderAllowed(senderId: string, allowFrom: Array<string | number>): boolean {
  if (allowFrom.includes("*")) return true;
  const normalizedSenderId = senderId.toLowerCase();
  return allowFrom.some((entry) => {
    const normalized = String(entry).toLowerCase().replace(/^(kakao|kk):/i, "");
    return normalized === normalizedSenderId;
  });
}

// --- Pending response collector ---
// Kakao skill server is synchronous: the webhook must return the agent's reply
// in the HTTP response body. We use a pending-response map to coordinate between
// the webhook handler (which waits) and the delivery callback (which resolves).

type PendingResponse = {
  resolve: (text: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const pendingResponses = new Map<string, PendingResponse>();

function createPendingResponse(timeoutMs: number): { requestId: string; promise: Promise<string> } {
  const requestId = randomUUID();
  const promise = new Promise<string>((resolve) => {
    const timeout = setTimeout(() => {
      pendingResponses.delete(requestId);
      resolve("");
    }, timeoutMs);
    pendingResponses.set(requestId, { resolve, timeout });
  });
  return { requestId, promise };
}

function resolvePendingResponse(requestId: string, text: string): void {
  const pending = pendingResponses.get(requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingResponses.delete(requestId);
    pending.resolve(text);
  }
}

// --- JSON body reader ---

async function readJsonBody(req: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  return await new Promise<{ ok: boolean; value?: unknown; error?: string }>((resolve) => {
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        resolve({ ok: false, error: "payload too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw.trim()) {
          resolve({ ok: false, error: "empty payload" });
          return;
        }
        resolve({ ok: true, value: JSON.parse(raw) as unknown });
      } catch (err) {
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
    req.on("error", (err) => {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });
}

// --- Webhook target registry ---

type WebhookTarget = {
  token: string;
  account: ResolvedKakaoAccount;
  config: OpenClawConfig;
  runtime: KakaoRuntimeEnv;
  core: KakaoCoreRuntime;
  secret: string;
  path: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

const webhookTargets = new Map<string, WebhookTarget[]>();

function normalizeWebhookPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/kakao-webhook";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

export function registerKakaoWebhookTarget(target: WebhookTarget): () => void {
  const key = normalizeWebhookPath(target.path);
  const normalizedTarget = { ...target, path: key };
  const existing = webhookTargets.get(key) ?? [];
  const next = [...existing, normalizedTarget];
  webhookTargets.set(key, next);
  return () => {
    const updated = (webhookTargets.get(key) ?? []).filter(
      (entry) => entry !== normalizedTarget,
    );
    if (updated.length > 0) {
      webhookTargets.set(key, updated);
    } else {
      webhookTargets.delete(key);
    }
  };
}

// --- Webhook request handler ---

function isValidSkillRequest(value: unknown): value is KakaoSkillRequest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const userRequest = record.userRequest;
  if (!userRequest || typeof userRequest !== "object") return false;
  const ur = userRequest as Record<string, unknown>;
  return typeof ur.utterance === "string" && ur.user != null;
}

function sendJsonResponse(res: ServerResponse, statusCode: number, body: KakaoSkillResponse): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export async function handleKakaoWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = normalizeWebhookPath(url.pathname);
  const targets = webhookTargets.get(path);
  if (!targets || targets.length === 0) return false;

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return true;
  }

  // Find matching target (by secret header if configured, otherwise first)
  const headerSecret = String(req.headers["x-kakao-webhook-secret"] ?? "");
  const target = targets.find((entry) =>
    entry.secret ? entry.secret === headerSecret : true,
  );
  if (!target) {
    res.statusCode = 401;
    res.end("unauthorized");
    return true;
  }

  const body = await readJsonBody(req, 1024 * 1024);
  if (!body.ok) {
    sendJsonResponse(res, body.error === "payload too large" ? 413 : 400, buildErrorResponse());
    return true;
  }

  if (!isValidSkillRequest(body.value)) {
    sendJsonResponse(res, 400, buildErrorResponse("Invalid skill request format."));
    return true;
  }

  const skillRequest = body.value;
  target.statusSink?.({ lastInboundAt: Date.now() });

  // Create a pending response that the delivery callback will resolve
  const timeoutMs = target.account.config.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  const { requestId, promise: responsePromise } = createPendingResponse(timeoutMs);

  // Process message through the OpenClaw pipeline (async, don't await here)
  processSkillRequest(
    requestId,
    skillRequest,
    target.token,
    target.account,
    target.config,
    target.runtime,
    target.core,
    target.statusSink,
  ).catch((err) => {
    target.runtime.error?.(
      `[${target.account.accountId}] Kakao skill processing failed: ${String(err)}`,
    );
    resolvePendingResponse(requestId, "");
  });

  // Wait for agent response (or timeout)
  const replyText = await responsePromise;
  const response = replyText ? buildTextResponse(replyText) : buildTimeoutResponse();
  sendJsonResponse(res, 200, response);
  return true;
}

// --- Message processing pipeline ---

async function processSkillRequest(
  requestId: string,
  skillRequest: KakaoSkillRequest,
  token: string,
  account: ResolvedKakaoAccount,
  config: OpenClawConfig,
  runtime: KakaoRuntimeEnv,
  core: KakaoCoreRuntime,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
): Promise<void> {
  const { userRequest } = skillRequest;
  const senderId = userRequest.user.properties.plusfriendUserKey ?? userRequest.user.id;
  const senderName = undefined; // Kakao skill requests don't include display name
  const chatId = senderId; // DM-only: chat ID equals sender ID
  const rawBody = userRequest.utterance.trim();

  if (!rawBody) {
    resolvePendingResponse(requestId, "");
    return;
  }

  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const configAllowFrom = (account.config.allowFrom ?? []).map((v) => String(v));
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, config);
  const storeAllowFrom =
    dmPolicy !== "open" || shouldComputeAuth
      ? await core.channel.pairing.readAllowFromStore("kakao").catch(() => [])
      : [];
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const senderAllowedForCommands = isSenderAllowed(senderId, effectiveAllowFrom);
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          { configured: effectiveAllowFrom.length > 0, allowed: senderAllowedForCommands },
        ],
      })
    : undefined;

  // DM policy enforcement
  if (dmPolicy === "disabled") {
    logVerbose(core, runtime, `Blocked kakao DM from ${senderId} (dmPolicy=disabled)`);
    resolvePendingResponse(requestId, "");
    return;
  }

  if (dmPolicy !== "open") {
    const allowed = senderAllowedForCommands;
    if (!allowed) {
      if (dmPolicy === "pairing") {
        const { code, created } = await core.channel.pairing.upsertPairingRequest({
          channel: "kakao",
          id: senderId,
          meta: { name: senderName },
        });
        if (created) {
          logVerbose(core, runtime, `kakao pairing request sender=${senderId}`);
        }
        resolvePendingResponse(
          requestId,
          core.channel.pairing.buildPairingReply({
            channel: "kakao",
            idLine: `Your Kakao user id: ${senderId}`,
            code,
          }),
        );
      } else {
        logVerbose(
          core,
          runtime,
          `Blocked unauthorized kakao sender ${senderId} (dmPolicy=${dmPolicy})`,
        );
        resolvePendingResponse(requestId, "");
      }
      return;
    }
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "kakao",
    accountId: account.accountId,
    peer: { kind: "dm", id: chatId },
  });

  if (
    core.channel.commands.isControlCommandMessage(rawBody, config) &&
    commandAuthorized !== true
  ) {
    logVerbose(core, runtime, `kakao: drop control command from unauthorized sender ${senderId}`);
    resolvePendingResponse(requestId, "");
    return;
  }

  const fromLabel = senderName || `user:${senderId}`;
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "KakaoTalk",
    from: fromLabel,
    timestamp: Date.now(),
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const messageId = `kakao-${Date.now()}-${senderId}`;
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `kakao:${senderId}`,
    To: `kakao:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: fromLabel,
    SenderName: senderName,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "kakao",
    Surface: "kakao",
    MessageSid: messageId,
    OriginatingChannel: "kakao",
    OriginatingTo: `kakao:${chatId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`kakao: failed updating session meta: ${String(err)}`);
    },
  });

  const tableMode = core.channel.text.resolveMarkdownTableMode({
    cfg: config,
    channel: "kakao",
    accountId: account.accountId,
  });

  // Collect all reply chunks into a single string
  const replyChunks: string[] = [];

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      deliver: async (payload) => {
        const text = core.channel.text.convertMarkdownTables(
          payload.text ?? "",
          tableMode as MarkdownTableMode,
        );
        if (text) replyChunks.push(text);
        statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] Kakao ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
  });

  const fullReply = replyChunks.join("\n\n");
  resolvePendingResponse(requestId, fullReply);
}

// --- Monitor lifecycle ---

export async function monitorKakaoProvider(
  options: KakaoMonitorOptions,
): Promise<KakaoMonitorResult> {
  const {
    account,
    config,
    runtime,
    webhookPath,
    webhookSecret,
    statusSink,
  } = options;

  const core = getKakaoRuntime();
  const path = normalizeWebhookPath(webhookPath ?? account.config.webhookPath ?? "/kakao-webhook");

  const unregister = registerKakaoWebhookTarget({
    token: options.token,
    account,
    config,
    runtime,
    core,
    path,
    secret: webhookSecret ?? account.config.webhookSecret ?? "",
    statusSink: (patch) => statusSink?.(patch),
  });

  const stop = () => {
    unregister();
  };

  options.abortSignal.addEventListener("abort", stop, { once: true });

  return { stop };
}
