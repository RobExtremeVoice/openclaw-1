import { AgentMailClient } from "agentmail";
import type { ChannelOnboardingAdapter, MoltbotConfig } from "clawdbot/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "clawdbot/plugin-sdk";

import { resolveAgentMailAccount } from "./accounts.js";
import type { AgentMailConfig, CoreConfig } from "./utils.js";

const channel = "agentmail" as const;
const DEFAULT_DOMAIN = "agentmail.to";

/** Parses input into username and domain. Supports "user" or "user@domain". */
export function parseInboxInput(input: string): { username: string; domain: string } {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.includes("@")) {
    const [username, domain] = trimmed.split("@");
    return { username, domain };
  }
  return { username: trimmed, domain: DEFAULT_DOMAIN };
}

/** Creates a new inbox via AgentMail API. */
async function createInbox(
  client: AgentMailClient,
  username: string,
  domain: string,
  displayName?: string
): Promise<string> {
  const inbox = await client.inboxes.create({ username, domain, displayName });
  return inbox.inboxId;
}

/** Lists existing inboxes for the user. */
async function listInboxes(client: AgentMailClient): Promise<string[]> {
  const response = await client.inboxes.list();
  return response.inboxes.map((i) => i.inboxId);
}

/** Helper to build config with agentmail channel updates. */
export function updateAgentMailConfig(
  cfg: MoltbotConfig,
  updates: Partial<AgentMailConfig>
): MoltbotConfig {
  const channels = (cfg.channels ?? {}) as Record<string, unknown>;
  const agentmail = (channels.agentmail ?? {}) as AgentMailConfig;
  return {
    ...cfg,
    channels: { ...channels, agentmail: { ...agentmail, ...updates } },
  } as MoltbotConfig;
}

export const agentmailOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,

  getStatus: async ({ cfg }) => {
    const account = resolveAgentMailAccount({ cfg: cfg as CoreConfig });
    return {
      channel,
      configured: account.configured,
      statusLines: [`AgentMail: ${account.configured ? `configured (${account.inboxId})` : "needs token"}`],
      selectionHint: account.configured ? "configured" : "not configured",
      quickstartScore: account.configured ? 1 : 5,
    };
  },

  configure: async ({ cfg, prompter, accountOverrides }) => {
    const accountId = accountOverrides.agentmail
      ? normalizeAccountId(accountOverrides.agentmail)
      : DEFAULT_ACCOUNT_ID;

    let next = cfg as MoltbotConfig;
    const account = resolveAgentMailAccount({ cfg: next as CoreConfig, accountId });
    const canUseEnv = accountId === DEFAULT_ACCOUNT_ID && Boolean(process.env.AGENTMAIL_TOKEN?.trim());

    // If env var token is available and not already configured, offer to use it
    if (canUseEnv && !account.configured) {
      const useEnv = await prompter.confirm({
        message: "AGENTMAIL_TOKEN detected. Use env var?",
        initialValue: true,
      });
      if (useEnv) {
        const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_TOKEN!.trim() });
        const emailAddress = await selectOrCreateInbox(client, prompter);
        return { cfg: updateAgentMailConfig(next, { enabled: true, emailAddress }) };
      }
    }

    // If already configured, ask to keep
    if (account.configured) {
      const keep = await prompter.confirm({
        message: `AgentMail already configured (${account.inboxId}). Keep current settings?`,
        initialValue: true,
      });
      if (keep) return { cfg: next };
    }

    // Show help
    await prompter.note(
      [
        "AgentMail is free to use at https://agentmail.to",
        "",
        "Get your API token from the dashboard, then we'll help you",
        "create an inbox. No webhooks needed - we use WebSockets!",
      ].join("\n"),
      "AgentMail Setup"
    );

    // Prompt for token
    const token = String(
      await prompter.text({
        message: "AgentMail API token",
        placeholder: "am_...",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      })
    ).trim();

    // Create client and select/create inbox
    const client = new AgentMailClient({ apiKey: token });
    const emailAddress = await selectOrCreateInbox(client, prompter);

    // Apply config
    next = updateAgentMailConfig(next, { enabled: true, token, emailAddress });

    // Ask about allowFrom
    const addAllowFrom = await prompter.confirm({
      message: "Add senders to allowFrom? (Empty = allow all)",
      initialValue: false,
    });

    if (addAllowFrom) {
      const entry = String(
        await prompter.text({
          message: "Email or domain to allow (e.g., user@example.com or example.com)",
        })
      ).trim();
      if (entry) {
        const existing = (next as CoreConfig).channels?.agentmail?.allowFrom ?? [];
        next = updateAgentMailConfig(next, { allowFrom: [...existing, entry] });
      }
    }

    return { cfg: next };
  },
};

type Prompter = Parameters<ChannelOnboardingAdapter["configure"]>[0]["prompter"];

/** Prompts user to select an existing inbox or create a new one. */
async function selectOrCreateInbox(client: AgentMailClient, prompter: Prompter): Promise<string> {
  let existingInboxes: string[] = [];
  try {
    existingInboxes = await listInboxes(client);
  } catch {
    // API error - proceed with create flow
  }

  if (existingInboxes.length > 0) {
    const choices = [
      ...existingInboxes.map((email) => ({ value: email, label: email })),
      { value: "__create__", label: "Create a new inbox" },
    ];
    const selection = await prompter.select({ message: "Select an inbox or create a new one", options: choices });
    if (selection !== "__create__") return selection as string;
  }

  return promptForNewInbox(client, prompter);
}

/** Prompts for inbox address and creates it, with retry on conflict. */
async function promptForNewInbox(client: AgentMailClient, prompter: Prompter): Promise<string> {
  while (true) {
    const input = String(
      await prompter.text({
        message: "Inbox address (username or full email)",
        placeholder: `my-agent or my-agent@${DEFAULT_DOMAIN}`,
        validate: (v) => {
          if (!v?.trim()) return "Required";
          const { username } = parseInboxInput(v);
          if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/.test(username))
            return "Username must use lowercase letters, numbers, dots, underscores, or hyphens";
          return undefined;
        },
      })
    ).trim();

    const { username, domain } = parseInboxInput(input);
    const targetEmail = `${username}@${domain}`;

    const displayName = String(await prompter.text({ message: "Display name (optional)", placeholder: "My Agent" })).trim() || undefined;

    try {
      const emailAddress = await createInbox(client, username, domain, displayName);
      await prompter.note(`Your new inbox: ${emailAddress}`, "Inbox Created");
      return emailAddress;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes("already") || lower.includes("taken") || lower.includes("exists") || msg.includes("409")) {
        await prompter.note(`${targetEmail} is already taken. Please try a different address.`, "Address Unavailable");
        continue;
      }
      throw new Error(`Failed to create inbox: ${msg}`);
    }
  }
}
