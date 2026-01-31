---
summary: "Feishu/Lark (飞书) bot support status, capabilities, and configuration"
read_when:
  - Working on Feishu features or integration
---
# Feishu (飞书 / Lark)

Status: production-ready for bot DMs + groups via WebSocket long connection.

## Quick setup

1. Create a self-built app on [Feishu Open Platform](https://open.feishu.cn) (or [Lark Developer](https://open.larksuite.com) for international).
2. Get your App ID and App Secret from the Credentials page.
3. Enable required permissions (see below).
4. Configure event subscriptions (see below).
5. Set the credentials:

```bash
openclaw config set channels.feishu.appId "cli_xxxxx"
openclaw config set channels.feishu.appSecret "your_app_secret"
openclaw config set channels.feishu.enabled true
```

Minimal config:

```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxx",
      appSecret: "secret",
      dmPolicy: "pairing"
    }
  }
}
```

## Required permissions

| Permission | Scope | Description |
|------------|-------|-------------|
| `contact:user.base:readonly` | User info | Get basic user info (required to resolve sender display names) |
| `im:message` | Messaging | Send and receive messages |
| `im:message.p2p_msg:readonly` | DM | Read direct messages to bot |
| `im:message.group_at_msg:readonly` | Group | Receive @mention messages in groups |
| `im:message:send_as_bot` | Send | Send messages as the bot |
| `im:resource` | Media | Upload and download images/files |

## Optional permissions

| Permission | Scope | Description |
|------------|-------|-------------|
| `im:message.group_msg` | Group | Read all group messages (sensitive) |
| `im:message:readonly` | Read | Get message history |
| `im:message:update` | Edit | Update/edit sent messages |
| `im:message:recall` | Recall | Recall sent messages |
| `im:message.reactions:read` | Reactions | View message reactions |

## Event subscriptions

In the Feishu Open Platform console, go to **Events & Callbacks**:

1. **Event configuration**: Select **Long connection** (recommended).
2. **Add event subscriptions**:

| Event | Description |
|-------|-------------|
| `im.message.receive_v1` | Receive messages (required) |
| `im.message.message_read_v1` | Message read receipts |
| `im.chat.member.bot.added_v1` | Bot added to group |
| `im.chat.member.bot.deleted_v1` | Bot removed from group |

3. Ensure the event permissions are approved.

## Configuration options

```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxx",
      appSecret: "secret",
      // Domain: "feishu" (China) or "lark" (International)
      domain: "feishu",
      // Connection mode: "websocket" (recommended) or "webhook"
      connectionMode: "websocket",
      // DM policy: "pairing" | "open" | "allowlist"
      dmPolicy: "pairing",
      // Group policy: "open" | "allowlist" | "disabled"
      groupPolicy: "allowlist",
      // Require @mention in groups
      requireMention: true,
      // Max media size in MB (default: 30)
      mediaMaxMb: 30,
      // Render mode for bot replies: "auto" | "raw" | "card"
      renderMode: "auto"
    }
  }
}
```

### Render mode

| Mode | Description |
|------|-------------|
| `auto` | (Default) Automatically detect: use card for messages with code blocks or tables, plain text otherwise. |
| `raw` | Always send replies as plain text. Markdown tables are converted to ASCII. |
| `card` | Always send replies as interactive cards with full markdown rendering (syntax highlighting, tables, clickable links). |

### Domain setting

- `feishu`: China mainland (open.feishu.cn)
- `lark`: International (open.larksuite.com)

## Features

- WebSocket and Webhook connection modes
- Direct messages and group chats
- Message replies and quoted message context
- Inbound media support: AI can see images, read files (PDF, Excel, etc.), and process rich text with embedded images
- Image and file uploads (outbound)
- Typing indicator (via emoji reactions)
- Pairing flow for DM approval
- User and group directory lookup
- Card render mode with syntax highlighting

## Access control

### DM access

- Default: `channels.feishu.dmPolicy = "pairing"`. Unknown senders receive a pairing code; messages are ignored until approved.
- Approve via:
  - `openclaw pairing list feishu`
  - `openclaw pairing approve feishu <CODE>`

### Group access

- `channels.feishu.groupPolicy`: `open | allowlist | disabled` (default: allowlist)
- `channels.feishu.requireMention`: Require @bot mention in groups (default: true)

## Troubleshooting

### Bot cannot receive messages

Check the following:
1. Have you configured event subscriptions?
2. Is the event configuration set to **long connection**?
3. Did you add the `im.message.receive_v1` event?
4. Are the permissions approved?

### 403 error when sending messages

Ensure `im:message:send_as_bot` permission is approved.

### How to clear history / start new conversation

Send `/new` command in the chat.

### Why is the output not streaming

Feishu API has rate limits. Streaming updates can easily trigger throttling. OpenClaw uses complete-then-send approach for stability.

### Cannot find the bot in Feishu

1. Ensure the app is published (at least to test version).
2. Search for the bot name in Feishu search box.
3. Check if your account is in the app's availability scope.

## Configuration reference

Full configuration: [Configuration](/gateway/configuration)

Provider options:
- `channels.feishu.enabled`: enable/disable channel startup.
- `channels.feishu.appId`: Feishu app ID.
- `channels.feishu.appSecret`: Feishu app secret.
- `channels.feishu.domain`: `feishu` (China) or `lark` (International).
- `channels.feishu.connectionMode`: `websocket` (default) or `webhook`.
- `channels.feishu.dmPolicy`: `pairing | allowlist | open | disabled` (default: pairing).
- `channels.feishu.allowFrom`: DM allowlist (user IDs).
- `channels.feishu.groupPolicy`: `open | allowlist | disabled` (default: allowlist).
- `channels.feishu.groupAllowFrom`: group sender allowlist.
- `channels.feishu.requireMention`: require @mention in groups (default: true).
- `channels.feishu.renderMode`: `auto | raw | card` (default: auto).
- `channels.feishu.mediaMaxMb`: inbound/outbound media cap (MB, default: 30).
