---
summary: "Slack setup for socket or HTTP webhook mode"
read_when: "Setting up Slack or debugging Slack socket/HTTP mode"
---

# Slack

## Quick Start Checklist ✅

Before diving into configuration, ensure these prerequisites are met:

1. ✅ **Gateway auth token configured** - Check that `gateway.auth.token` is NOT `"undefined"`
2. ✅ **Single workspace tokens** - All tokens (botToken, appToken, userToken) must be from the same Slack workspace
3. ✅ **Agent bindings configured** - Add bindings for each Slack account to route messages to agents
4. ✅ **Group policy configured** - Set `groupPolicy: "open"` or allowlist specific channels
5. ✅ **User pairing approved** - Approve users who want to DM the bot

**Common Issues Resolved:**
- [Bot doesn't respond in channels](#troubleshooting-channel-messages)
- [Gateway crashes on startup](#troubleshooting-crashes)
- [Mixed workspace token errors](#troubleshooting-token-conflicts)

---

## Socket mode (default)

### Quick setup (beginner)
1) Create a Slack app and enable **Socket Mode**.
2) Create an **App Token** (`xapp-...`) and **Bot Token** (`xoxb-...`).
3) Set tokens for OpenClaw and start the gateway.

Minimal config:
```json5
{
  channels: {
    slack: {
      enabled: true,
      appToken: "xapp-...",
      botToken: "xoxb-...",
      groupPolicy: "open"  // 👈 Important: Allow all channels or use allowlist
    }
  },
  // 👈 Important: Add bindings to route messages to agents
  bindings: [
    {
      agentId: "main",
      match: {
        channel: "slack",
        accountId: "default"
      }
    }
  ]
}
```

### Setup
1) Create a Slack app (From scratch) in https://api.slack.com/apps.
2) **Socket Mode** → toggle on. Then go to **Basic Information** → **App-Level Tokens** → **Generate Token and Scopes** with scope `connections:write`. Copy the **App Token** (`xapp-...`).
3) **OAuth & Permissions** → add bot token scopes (use the manifest below). Click **Install to Workspace**. Copy the **Bot User OAuth Token** (`xoxb-...`).
4) Optional: **OAuth & Permissions** → add **User Token Scopes** (see the read-only list below). Reinstall the app and copy the **User OAuth Token** (`xoxp-...`).
5) **Event Subscriptions** → enable events and subscribe to:
   - `message.*` (includes edits/deletes/thread broadcasts)
   - `app_mention`
   - `reaction_added`, `reaction_removed`
   - `member_joined_channel`, `member_left_channel`
   - `channel_rename`
   - `pin_added`, `pin_removed`
6) Invite the bot to channels you want it to read.
7) Slash Commands → create `/openclaw` if you use `channels.slack.slashCommand`. If you enable native commands, add one slash command per built-in command (same names as `/help`). Native defaults to off for Slack unless you set `channels.slack.commands.native: true` (global `commands.native` is `"auto"` which leaves Slack off).
8) App Home → enable the **Messages Tab** so users can DM the bot.

Use the manifest below so scopes and events stay in sync.

Multi-account support: use `channels.slack.accounts` with per-account tokens and optional `name`. See [`gateway/configuration`](/gateway/configuration#telegramaccounts--discordaccounts--slackaccounts--signalaccounts--imessageaccounts) for the shared pattern.

### OpenClaw config (minimal)

Set tokens via env vars (recommended):
- `SLACK_APP_TOKEN=xapp-...`
- `SLACK_BOT_TOKEN=xoxb-...`

Or via config:

```json5
{
  channels: {
    slack: {
      enabled: true,
      appToken: "xapp-...",
      botToken: "xoxb-...",
      groupPolicy: "open"  // 👈 Allow all channels, or use "allowlist"
    }
  },
  // 👈 Required: Route Slack messages to your agent
  bindings: [
    {
      agentId: "main",
      match: {
        channel: "slack", 
        accountId: "default"
      }
    }
  ]
}
```

### Multi-account setup

For multiple Slack workspaces, use the `accounts` pattern:

```json5
{
  channels: {
    slack: {
      enabled: true,
      groupPolicy: "open",
      accounts: {
        "company": {
          name: "Company Workspace",
          botToken: "xoxb-111-222-CompanyToken",
          appToken: "xapp-1-A111-222-CompanyAppToken",
          groupPolicy: "open"  // 👈 Can override per-account
        },
        "personal": {
          name: "Personal Workspace", 
          botToken: "xoxb-333-444-PersonalToken",
          appToken: "xapp-1-A333-444-PersonalAppToken",
          groupPolicy: "allowlist"  // 👈 Different policy per workspace
        }
      }
    }
  },
  // 👈 Bind each account to an agent
  bindings: [
    {
      agentId: "main",
      match: {
        channel: "slack",
        accountId: "company"
      }
    },
    {
      agentId: "main", 
      match: {
        channel: "slack",
        accountId: "personal"
      }
    }
  ]
}
```

### User token (optional)
OpenClaw can use a Slack user token (`xoxp-...`) for read operations (history,
pins, reactions, emoji, member info). By default this stays read-only: reads
prefer the user token when present, and writes still use the bot token unless
you explicitly opt in. Even with `userTokenReadOnly: false`, the bot token stays
preferred for writes when it is available.

User tokens are configured in the config file (no env var support). For
multi-account, set `channels.slack.accounts.<id>.userToken`.

Example with bot + app + user tokens:
```json5
{
  channels: {
    slack: {
      enabled: true,
      appToken: "xapp-...",
      botToken: "xoxb-...",
      userToken: "xoxp-..."
    }
  }
}
```

Example with userTokenReadOnly explicitly set (allow user token writes):
```json5
{
  channels: {
    slack: {
      enabled: true,
      appToken: "xapp-...",
      botToken: "xoxb-...",
      userToken: "xoxp-...",
      userTokenReadOnly: false
    }
  }
}
```

#### Token usage
- Read operations (history, reactions list, pins list, emoji list, member info,
  search) prefer the user token when configured, otherwise the bot token.
- Write operations (send/edit/delete messages, add/remove reactions, pin/unpin,
  file uploads) use the bot token by default. If `userTokenReadOnly: false` and
  no bot token is available, OpenClaw falls back to the user token.

### History context
- `channels.slack.historyLimit` (or `channels.slack.accounts.*.historyLimit`) controls how many recent channel/group messages are wrapped into the prompt.
- Falls back to `messages.groupChat.historyLimit`. Set `0` to disable (default 50).

## HTTP mode (Events API)
Use HTTP webhook mode when your Gateway is reachable by Slack over HTTPS (typical for server deployments).
HTTP mode uses the Events API + Interactivity + Slash Commands with a shared request URL.

### Setup
1) Create a Slack app and **disable Socket Mode** (optional if you only use HTTP).
2) **Basic Information** → copy the **Signing Secret**.
3) **OAuth & Permissions** → install the app and copy the **Bot User OAuth Token** (`xoxb-...`).
4) **Event Subscriptions** → enable events and set the **Request URL** to your gateway webhook path (default `/slack/events`).
5) **Interactivity & Shortcuts** → enable and set the same **Request URL**.
6) **Slash Commands** → set the same **Request URL** for your command(s).

Example request URL:
`https://gateway-host/slack/events`

### OpenClaw config (minimal)
```json5
{
  channels: {
    slack: {
      enabled: true,
      mode: "http",
      botToken: "xoxb-...",
      signingSecret: "your-signing-secret",
      webhookPath: "/slack/events"
    }
  }
}
```

Multi-account HTTP mode: set `channels.slack.accounts.<id>.mode = "http"` and provide a unique
`webhookPath` per account so each Slack app can point to its own URL.

## Troubleshooting

### Troubleshooting: Channel Messages

**Problem**: Bot responds to DMs but not channel messages.

**Common Causes**:
1. **Wrong groupPolicy**: Bot ignores all channels
2. **Missing bindings**: Messages not routed to agent
3. **Bot not invited**: Bot must be added to channels
4. **User not paired**: User needs approval for DMs

**Solutions**:

#### 1. Check Group Policy
```bash
openclaw config get | grep -A5 "groupPolicy"
```

Fix with:
```json5
{
  channels: {
    slack: {
      groupPolicy: "open",  // Allow all channels
      accounts: {
        "yourAccount": {
          groupPolicy: "open"  // Account-level policy can override
        }
      }
    }
  }
}
```

#### 2. Check Agent Bindings
```bash
openclaw config get | grep -A10 "bindings"
```

Add missing bindings:
```json5
{
  bindings: [
    {
      agentId: "main",
      match: {
        channel: "slack",
        accountId: "default"  // Or your account ID
      }
    }
  ]
}
```

#### 3. Invite Bot to Channel
In Slack: `/invite @YourBotName`

#### 4. Check User Pairing (for DMs)
If user gets pairing code:
```bash
openclaw pairing approve slack PWNPX4M8
```

### Troubleshooting: Crashes

**Problem**: Gateway crashes on startup.

**Common Causes**:
1. **Gateway auth token undefined**: `gateway.auth.token: "undefined"`
2. **Mixed workspace tokens**: Tokens from different Slack workspaces
3. **Invalid token format**: Malformed or expired tokens

**Solutions**:

#### 1. Fix Gateway Auth Token
```bash
# Generate secure token
openssl rand -hex 32

# Update config
openclaw config patch '{"gateway": {"auth": {"token": "YOUR_SECURE_TOKEN_HERE"}}}'
```

#### 2. Check Token Workspace Consistency
All tokens must be from the same workspace:
- ✅ `botToken: "xoxb-6859017778738-..."` (workspace 6859017778738)
- ✅ `appToken: "xapp-1-A0AC15K9V70-..."` (workspace A0AC15K9V70)
- ❌ Mixed: `botToken` from workspace A, `appToken` from workspace B

**Fix**: Use tokens from a single Slack workspace.

#### 3. Verify Token Format
- Bot Token: `xoxb-{workspace}-{bot}-{secret}`
- App Token: `xapp-1-{app}-{id}-{secret}`
- User Token: `xoxp-{workspace}-{user}-{id}-{secret}`

### Troubleshooting: Token Conflicts

**Problem**: Authentication errors with multiple tokens configured.

**Symptoms**:
- "invalid_auth" errors in logs
- Bot connects but doesn't respond
- Mixed workspace IDs in tokens

**Solution**: Ensure workspace consistency
```json5
{
  channels: {
    slack: {
      accounts: {
        "workspace1": {
          // ✅ All from workspace 6859017778738
          botToken: "xoxb-6859017778738-...",
          appToken: "xapp-1-A0AC15K9V70-...",
          userToken: "xoxp-6859017778738-..."
        }
      }
    }
  }
}
```

### Debugging Commands

**Check gateway status**:
```bash
openclaw status
```

**View live logs**:
```bash
openclaw logs --follow
```

**Test Slack connection**:
```bash
openclaw status --deep
```

**Check configuration**:
```bash
openclaw config get | jq '.channels.slack'
```

## Group Policy Deep Dive

The `groupPolicy` setting controls whether the bot responds in channels:

### Policy Options
- **`"open"`**: Respond in any channel the bot is invited to
- **`"allowlist"`**: Only respond in explicitly allowed channels
- **`"disabled"`**: Never respond in channels (DMs only)

### Policy Hierarchy
1. **Account-level** (`channels.slack.accounts.{id}.groupPolicy`)
2. **Channel-level** (`channels.slack.groupPolicy`) 
3. **Global default** (`channels.defaults.groupPolicy`)

### Configuration Examples

**Allow all channels**:
```json5
{
  channels: {
    slack: {
      groupPolicy: "open",
      accounts: {
        "main": { groupPolicy: "open" }
      }
    }
  }
}
```

**Allowlist specific channels**:
```json5
{
  channels: {
    slack: {
      groupPolicy: "allowlist",
      channels: {
        "#general": { allow: true },
        "#bot-testing": { allow: true, requireMention: true }
      }
    }
  }
}
```

**DMs only (no channels)**:
```json5
{
  channels: {
    slack: {
      groupPolicy: "disabled"
    }
  }
}
```

### Manifest (optional)
Use this Slack app manifest to create the app quickly (adjust the name/command if you want). Include the
user scopes if you plan to configure a user token.

```json
{
  "display_information": {
    "name": "OpenClaw",
    "description": "Slack connector for OpenClaw"
  },
  "features": {
    "bot_user": {
      "display_name": "OpenClaw",
      "always_online": false
    },
    "app_home": {
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    },
    "slash_commands": [
      {
        "command": "/openclaw",
        "description": "Send a message to OpenClaw",
        "should_escape": false
      }
    ]
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "chat:write",
        "channels:history",
        "channels:read",
        "groups:history",
        "groups:read",
        "groups:write",
        "im:history",
        "im:read",
        "im:write",
        "mpim:history",
        "mpim:read",
        "mpim:write",
        "users:read",
        "app_mentions:read",
        "reactions:read",
        "reactions:write",
        "pins:read",
        "pins:write",
        "emoji:read",
        "commands",
        "files:read",
        "files:write"
      ],
      "user": [
        "channels:history",
        "channels:read",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "mpim:history",
        "mpim:read",
        "users:read",
        "reactions:read",
        "pins:read",
        "emoji:read",
        "search:read"
      ]
    }
  },
  "settings": {
    "socket_mode_enabled": true,
    "event_subscriptions": {
      "bot_events": [
        "app_mention",
        "message.channels",
        "message.groups",
        "message.im",
        "message.mpim",
        "reaction_added",
        "reaction_removed",
        "member_joined_channel",
        "member_left_channel",
        "channel_rename",
        "pin_added",
        "pin_removed"
      ]
    }
  }
}
```

If you enable native commands, add one `slash_commands` entry per command you want to expose (matching the `/help` list). Override with `channels.slack.commands.native`.

## Scopes (current vs optional)
Slack's Conversations API is type-scoped: you only need the scopes for the
conversation types you actually touch (channels, groups, im, mpim). See
https://docs.slack.dev/apis/web-api/using-the-conversations-api/ for the overview.

### Bot token scopes (required)
- `chat:write` (send/update/delete messages via `chat.postMessage`)
  https://docs.slack.dev/reference/methods/chat.postMessage
- `im:write` (open DMs via `conversations.open` for user DMs)
  https://docs.slack.dev/reference/methods/conversations.open
- `channels:history`, `groups:history`, `im:history`, `mpim:history`
  https://docs.slack.dev/reference/methods/conversations.history
- `channels:read`, `groups:read`, `im:read`, `mpim:read`
  https://docs.slack.dev/reference/methods/conversations.info
- `users:read` (user lookup)
  https://docs.slack.dev/reference/methods/users.info
- `reactions:read`, `reactions:write` (`reactions.get` / `reactions.add`)
  https://docs.slack.dev/reference/methods/reactions.get
  https://docs.slack.dev/reference/methods/reactions.add
- `pins:read`, `pins:write` (`pins.list` / `pins.add` / `pins.remove`)
  https://docs.slack.dev/reference/scopes/pins.read
  https://docs.slack.dev/reference/scopes/pins.write
- `emoji:read` (`emoji.list`)
  https://docs.slack.dev/reference/scopes/emoji.read
- `files:write` (uploads via `files.uploadV2`)
  https://docs.slack.dev/messaging/working-with-files/#upload

### User token scopes (optional, read-only by default)
Add these under **User Token Scopes** if you configure `channels.slack.userToken`.

- `channels:history`, `groups:history`, `im:history`, `mpim:history`
- `channels:read`, `groups:read`, `im:read`, `mpim:read`
- `users:read`
- `reactions:read`
- `pins:read`
- `emoji:read`
- `search:read`

### Not needed today (but likely future)
- `mpim:write` (only if we add group-DM open/DM start via `conversations.open`)
- `groups:write` (only if we add private-channel management: create/rename/invite/archive)
- `chat:write.public` (only if we want to post to channels the bot isn't in)
  https://docs.slack.dev/reference/scopes/chat.write.public
- `users:read.email` (only if we need email fields from `users.info`)
  https://docs.slack.dev/changelog/2017-04-narrowing-email-access
- `files:read` (only if we start listing/reading file metadata)

## Config
Slack uses Socket Mode only (no HTTP webhook server). Provide both tokens:

```json
{
  "slack": {
    "enabled": true,
    "botToken": "xoxb-...",
    "appToken": "xapp-...",
    "groupPolicy": "allowlist",
    "dm": {
      "enabled": true,
      "policy": "pairing",
      "allowFrom": ["U123", "U456", "*"],
      "groupEnabled": false,
      "groupChannels": ["G123"],
      "replyToMode": "all"
    },
    "channels": {
      "C123": { "allow": true, "requireMention": true },
      "#general": {
        "allow": true,
        "requireMention": true,
        "users": ["U123"],
        "skills": ["search", "docs"],
        "systemPrompt": "Keep answers short."
      }
    },
    "reactionNotifications": "own",
    "reactionAllowlist": ["U123"],
    "replyToMode": "off",
    "actions": {
      "reactions": true,
      "messages": true,
      "pins": true,
      "memberInfo": true,
      "emojiList": true
    },
    "slashCommand": {
      "enabled": true,
      "name": "openclaw",
      "sessionPrefix": "slack:slash",
      "ephemeral": true
    },
    "textChunkLimit": 4000,
    "mediaMaxMb": 20
  }
}
```

Tokens can also be supplied via env vars:
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`

Ack reactions are controlled globally via `messages.ackReaction` +
`messages.ackReactionScope`. Use `messages.removeAckAfterReply` to clear the
ack reaction after the bot replies.

## Limits
- Outbound text is chunked to `channels.slack.textChunkLimit` (default 4000).
- Optional newline chunking: set `channels.slack.chunkMode="newline"` to split on blank lines (paragraph boundaries) before length chunking.
- Media uploads are capped by `channels.slack.mediaMaxMb` (default 20).

## Reply threading
By default, OpenClaw replies in the main channel. Use `channels.slack.replyToMode` to control automatic threading:

| Mode | Behavior |
| --- | --- |
| `off` | **Default.** Reply in main channel. Only thread if the triggering message was already in a thread. |
| `first` | First reply goes to thread (under the triggering message), subsequent replies go to main channel. Useful for keeping context visible while avoiding thread clutter. |
| `all` | All replies go to thread. Keeps conversations contained but may reduce visibility. |

The mode applies to both auto-replies and agent tool calls (`slack sendMessage`).

### Per-chat-type threading
You can configure different threading behavior per chat type by setting `channels.slack.replyToModeByChatType`:

```json5
{
  channels: {
    slack: {
      replyToMode: "off",        // default for channels
      replyToModeByChatType: {
        direct: "all",           // DMs always thread
        group: "first"           // group DMs/MPIM thread first reply
      },
    }
  }
}
```

Supported chat types:
- `direct`: 1:1 DMs (Slack `im`)
- `group`: group DMs / MPIMs (Slack `mpim`)
- `channel`: standard channels (public/private)

Precedence:
1) `replyToModeByChatType.<chatType>`
2) `replyToMode`
3) Provider default (`off`)

Legacy `channels.slack.dm.replyToMode` is still accepted as a fallback for `direct` when no chat-type override is set.

Examples:

Thread DMs only:
```json5
{
  channels: {
    slack: {
      replyToMode: "off",
      replyToModeByChatType: { direct: "all" }
    }
  }
}
```

Thread group DMs but keep channels in the root:
```json5
{
  channels: {
    slack: {
      replyToMode: "off",
      replyToModeByChatType: { group: "first" }
    }
  }
}
```

Make channels thread, keep DMs in the root:
```json5
{
  channels: {
    slack: {
      replyToMode: "first",
      replyToModeByChatType: { direct: "off", group: "off" }
    }
  }
}
```

### Manual threading tags
For fine-grained control, use these tags in agent responses:
- `[[reply_to_current]]` — reply to the triggering message (start/continue thread).
- `[[reply_to:<id>]]` — reply to a specific message id.

## Sessions + routing
- DMs share the `main` session (like WhatsApp/Telegram).
- Channels map to `agent:<agentId>:slack:channel:<channelId>` sessions.
- Slash commands use `agent:<agentId>:slack:slash:<userId>` sessions (prefix configurable via `channels.slack.slashCommand.sessionPrefix`).
- If Slack doesn't provide `channel_type`, OpenClaw infers it from the channel ID prefix (`D`, `C`, `G`) and defaults to `channel` to keep session keys stable.
- Native command registration uses `commands.native` (global default `"auto"` → Slack off) and can be overridden per-workspace with `channels.slack.commands.native`. Text commands require standalone `/...` messages and can be disabled with `commands.text: false`. Slack slash commands are managed in the Slack app and are not removed automatically. Use `commands.useAccessGroups: false` to bypass access-group checks for commands.
- Full command list + config: [Slash commands](/tools/slash-commands)

## DM security (pairing)
- Default: `channels.slack.dm.policy="pairing"` — unknown DM senders get a pairing code (expires after 1 hour).
- Approve via: `openclaw pairing approve slack <code>`.
- To allow anyone: set `channels.slack.dm.policy="open"` and `channels.slack.dm.allowFrom=["*"]`.
- `channels.slack.dm.allowFrom` accepts user IDs, @handles, or emails (resolved at startup when tokens allow). The wizard accepts usernames and resolves them to ids during setup when tokens allow.

## Group policy
- `channels.slack.groupPolicy` controls channel handling (`open|disabled|allowlist`).
- `allowlist` requires channels to be listed in `channels.slack.channels`.
 - If you only set `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN` and never create a `channels.slack` section,
   the runtime defaults `groupPolicy` to `open`. Add `channels.slack.groupPolicy`,
   `channels.defaults.groupPolicy`, or a channel allowlist to lock it down.
 - The configure wizard accepts `#channel` names and resolves them to IDs when possible
   (public + private); if multiple matches exist, it prefers the active channel.
 - On startup, OpenClaw resolves channel/user names in allowlists to IDs (when tokens allow)
   and logs the mapping; unresolved entries are kept as typed.
 - To allow **no channels**, set `channels.slack.groupPolicy: "disabled"` (or keep an empty allowlist).

Channel options (`channels.slack.channels.<id>` or `channels.slack.channels.<name>`):
- `allow`: allow/deny the channel when `groupPolicy="allowlist"`.
- `requireMention`: mention gating for the channel.
- `tools`: optional per-channel tool policy overrides (`allow`/`deny`/`alsoAllow`).
- `toolsBySender`: optional per-sender tool policy overrides within the channel (keys are sender ids/@handles/emails; `"*"` wildcard supported).
- `allowBots`: allow bot-authored messages in this channel (default: false).
- `users`: optional per-channel user allowlist.
- `skills`: skill filter (omit = all skills, empty = none).
- `systemPrompt`: extra system prompt for the channel (combined with topic/purpose).
- `enabled`: set `false` to disable the channel.

## Delivery targets
Use these with cron/CLI sends:
- `user:<id>` for DMs
- `channel:<id>` for channels

## Tool actions
Slack tool actions can be gated with `channels.slack.actions.*`:

| Action group | Default | Notes |
| --- | --- | --- |
| reactions | enabled | React + list reactions |
| messages | enabled | Read/send/edit/delete |
| pins | enabled | Pin/unpin/list |
| memberInfo | enabled | Member info |
| emojiList | enabled | Custom emoji list |

## Security notes
- Writes default to the bot token so state-changing actions stay scoped to the
  app's bot permissions and identity.
- Setting `userTokenReadOnly: false` allows the user token to be used for write
  operations when a bot token is unavailable, which means actions run with the
  installing user's access. Treat the user token as highly privileged and keep
  action gates and allowlists tight.
- If you enable user-token writes, make sure the user token includes the write
  scopes you expect (`chat:write`, `reactions:write`, `pins:write`,
  `files:write`) or those operations will fail.

## Notes
- Mention gating is controlled via `channels.slack.channels` (set `requireMention` to `true`); `agents.list[].groupChat.mentionPatterns` (or `messages.groupChat.mentionPatterns`) also count as mentions.
- Multi-agent override: set per-agent patterns on `agents.list[].groupChat.mentionPatterns`.
- Reaction notifications follow `channels.slack.reactionNotifications` (use `reactionAllowlist` with mode `allowlist`).
- Bot-authored messages are ignored by default; enable via `channels.slack.allowBots` or `channels.slack.channels.<id>.allowBots`.
- Warning: If you allow replies to other bots (`channels.slack.allowBots=true` or `channels.slack.channels.<id>.allowBots=true`), prevent bot-to-bot reply loops with `requireMention`, `channels.slack.channels.<id>.users` allowlists, and/or clear guardrails in `AGENTS.md` and `SOUL.md`.
- For the Slack tool, reaction removal semantics are in [/tools/reactions](/tools/reactions).
- Attachments are downloaded to the media store when permitted and under the size limit.