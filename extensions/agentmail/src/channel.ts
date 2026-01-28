import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "clawdbot/plugin-sdk";

import { resolveAgentMailAccount } from "./accounts.js";
import { getAgentMailClient, getResolvedCredentials, NOT_CONFIGURED_ERROR } from "./client.js";
import { AgentMailConfigSchema } from "./config-schema.js";
import { agentmailOnboardingAdapter } from "./onboarding.js";
import { agentmailOutbound } from "./outbound.js";
import { createAgentMailTools } from "./tools.js";
import type { CoreConfig, ResolvedAgentMailAccount } from "./utils.js";

const meta = {
  id: "agentmail",
  label: "AgentMail",
  selectionLabel: "AgentMail (Email Inbox API)",
  detailLabel: "AgentMail",
  docsPath: "/channels/agentmail",
  docsLabel: "agentmail",
  blurb: "email channel via AgentMail; dedicated agent inbox API.",
  systemImage: "envelope",
  quickstartAllowFrom: true,
};

export const agentmailPlugin: ChannelPlugin<ResolvedAgentMailAccount> = {
  id: "agentmail",
  meta,
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    threads: true,
    polls: false,
    reactions: false,
  },
  reload: { configPrefixes: ["channels.agentmail"] },
  configSchema: buildChannelConfigSchema(AgentMailConfigSchema),

  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg, accountId) =>
      resolveAgentMailAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "agentmail",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "agentmail",
        accountId,
        clearBaseFields: ["name", "token", "emailAddress", "allowFrom"],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      emailAddress: account.inboxId,
    }),
    resolveAllowFrom: ({ cfg }) =>
      ((cfg as CoreConfig).channels?.agentmail?.allowFrom ?? []).map(String),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((e) => String(e).toLowerCase().trim()).filter(Boolean),
  },

  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: "open",
      allowFrom: account.config.allowFrom ?? [],
      policyPath: "channels.agentmail.allowFrom",
      allowFromPath: "channels.agentmail.allowFrom",
      approveHint:
        "Add email addresses or domains to channels.agentmail.allowFrom",
      normalizeEntry: (raw) => raw.toLowerCase().trim(),
    }),
    collectWarnings: ({ account }) =>
      (account.config.allowFrom?.length ?? 0) === 0
        ? ["- AgentMail: No allowFrom configured. All senders will be allowed."]
        : [],
  },

  messaging: {
    normalizeTarget: (raw) => raw.trim() || undefined,
    targetResolver: {
      looksLikeId: (raw) => /\S+@\S+\.\S+/.test(raw.trim()),
      hint: "<email@example.com>",
    },
  },

  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as CoreConfig,
        channelKey: "agentmail",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      if (input.useEnv) return null;
      if (!input.token?.trim()) return "AgentMail requires --token";
      if (!input.emailAddress?.trim())
        return "AgentMail requires --email-address";
      return null;
    },
    applyAccountConfig: ({ cfg, input }) => {
      const existing = (cfg as CoreConfig).channels?.agentmail ?? {};
      const updates: Record<string, unknown> = { enabled: true };
      if (!input.useEnv) {
        if (input.token?.trim()) updates.token = input.token.trim();
        if (input.emailAddress?.trim()) updates.emailAddress = input.emailAddress.trim();
      }
      return { ...cfg, channels: { ...(cfg as CoreConfig).channels, agentmail: { ...existing, ...updates } } };
    },
  },

  outbound: agentmailOutbound,

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts
        .filter((a) => typeof a.lastError === "string" && a.lastError.trim())
        .map((a) => ({
          channel: "agentmail",
          accountId: a.accountId,
          kind: "runtime" as const,
          message: `Channel error: ${a.lastError}`,
        })),
    buildChannelSummary: ({ snapshot: s }) => ({
      configured: s.configured ?? false,
      emailAddress: s.emailAddress ?? null,
      running: s.running ?? false,
      lastStartAt: s.lastStartAt ?? null,
      lastStopAt: s.lastStopAt ?? null,
      lastError: s.lastError ?? null,
      probe: s.probe,
      lastProbeAt: s.lastProbeAt ?? null,
    }),
    probeAccount: async () => {
      try {
        const { apiKey, inboxId } = getResolvedCredentials();
        if (!apiKey || !inboxId) return { ok: false, error: NOT_CONFIGURED_ERROR, elapsedMs: 0 };
        const start = Date.now();
        const inbox = await getAgentMailClient(apiKey).inboxes.get(inboxId);
        return { ok: true, elapsedMs: Date.now() - start, meta: { inboxId: inbox.inboxId } };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), elapsedMs: 0 };
      }
    },
    buildAccountSnapshot: ({ account: a, runtime: r, probe }) => ({
      accountId: a.accountId,
      name: a.name,
      enabled: a.enabled,
      configured: a.configured,
      emailAddress: a.inboxId,
      running: r?.running ?? false,
      lastStartAt: r?.lastStartAt ?? null,
      lastStopAt: r?.lastStopAt ?? null,
      lastError: r?.lastError ?? null,
      probe,
      lastProbeAt: r?.lastProbeAt ?? null,
      lastInboundAt: r?.lastInboundAt ?? null,
      lastOutboundAt: r?.lastOutboundAt ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const { accountId, inboxId } = ctx.account;
      ctx.setStatus({ accountId, emailAddress: inboxId });
      ctx.log?.info(
        `[${accountId}] starting AgentMail provider (email: ${
          inboxId ?? "unknown"
        })`
      );
      const { monitorAgentMailProvider } = await import("./monitor.js");
      return monitorAgentMailProvider({
        accountId,
        abortSignal: ctx.abortSignal,
      });
    },
  },

  onboarding: agentmailOnboardingAdapter,

  agentTools: () => createAgentMailTools(),
};
