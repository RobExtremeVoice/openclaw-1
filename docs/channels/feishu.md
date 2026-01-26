---
summary: "Feishu (Lark) bot support via WebSocket long connection with markdown card messages"
read_when:
  - Working on Feishu features
  - Integrating with Chinese enterprise messaging
  - Setting up Lark bot
---
# Feishu (飞书/Lark)

Status: experimental. Supports direct messages and groups via Bot API using WebSocket long connection.

## Key Features

- **WebSocket long connection**: No public IP or webhook setup required
- **Markdown support**: Rich formatting via interactive card messages
- **Multi-account**: Support for multiple Feishu bot accounts
- **Access control**: Pairing-based DM access and group allowlists

## Plugin Required

Feishu ships as a plugin and is not bundled with the core install.

```bash
clawdbot plugins install @clawdbot/feishu
```

Or select **Feishu** during onboarding and confirm the install prompt. Details: [Plugins](/plugin)

## Quick Start

### 1. Create a Feishu App

1. Go to [Feishu Open Platform](https://open.feishu.cn/app) and sign in
2. Click **Create App** > **Enterprise Self-built App**
3. Fill in basic info (name, description, icon)
4. Add **Bot** capability in "Add Application Capabilities"
5. Get your **App ID** and **App Secret** from "Credentials and Basic Info"

### 2. Configure Permissions

In your app's "Permission Management", add these permissions:

| Permission | Description |
|------------|-------------|
| `im:message` | Send messages |
| `im:message.receive_v1` | Receive messages (event subscription) |
| `im:chat` | Access chat information |
| `contact:user.id:readonly` | Read user info (optional) |

Request approval if required by your organization.

### 3. Enable WebSocket Event Subscription

1. Go to **Events and Callbacks** page
2. Set subscription method to **Long Connection** (WebSocket)
3. Add event: `im.message.receive_v1` (Receive messages)
4. Click Save

> **Note**: WebSocket mode requires no public IP. Events are pushed directly to the gateway.

### 4. Configure Credentials

**Option A: Environment variables**

```bash
export FEISHU_APP_ID=cli_xxxxxxxxxx
export FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

**Option B: Configuration file**

```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxxxxxxx",
      appSecret: "xxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

### 5. Publish and Start

1. Go to "Version Management and Release" in Feishu console
2. Create a new version and submit for review
3. Start the gateway: `clawdbot gateway run`

## How It Works

```
┌─────────────┐    WebSocket    ┌─────────────┐
│   Feishu    │ ◄─────────────► │   Gateway   │
│   Server    │   Long Conn     │             │
└─────────────┘                 └─────────────┘
       │                              │
       │ Events pushed               │ Card messages
       │ (no public IP)              │ with markdown
       ▼                              ▼
```

- Gateway establishes WebSocket connection to Feishu servers
- Events are pushed in real-time (no polling, no webhook)
- Replies use interactive card format with full markdown support
- Long responses are automatically chunked (3800 chars per card)

## Markdown Support

All outbound messages use Feishu interactive card format with markdown:

| Syntax | Example | Result |
|--------|---------|--------|
| Bold | `**text**` | **text** |
| Italic | `*text*` | *text* |
| Strikethrough | `~~text~~` | ~~text~~ |
| Code | `` `code` `` | `code` |
| Link | `[text](url)` | [text](url) |
| List | `- item` | bullet list |
| Code block | ` ```code``` ` | code block |

## Access Control

### Direct Messages

| Policy | Behavior |
|--------|----------|
| `pairing` (default) | Unknown senders receive pairing code; approve via CLI |
| `allowlist` | Only users in `allowFrom` can message |
| `open` | Anyone can message (requires `allowFrom: ["*"]`) |
| `disabled` | DMs blocked |

**Approve pairing requests:**

```bash
clawdbot pairing list feishu
clawdbot pairing approve feishu <CODE>
```

### Groups

- Default policy: `allowlist` - only allowed groups receive responses
- Configure via `groupAllowFrom` or `groups.<chat_id>`
- Groups require @mention by default

```json5
{
  channels: {
    feishu: {
      groupPolicy: "allowlist",
      groupAllowFrom: ["oc_xxx", "oc_yyy"],
      groups: {
        "oc_xxx": {
          name: "Team Chat",
          requireMention: true
        }
      }
    }
  }
}
```

## Capabilities

| Feature | Status |
|---------|--------|
| Direct messages | Supported |
| Group messages | Supported |
| Markdown formatting | Supported (card messages) |
| WebSocket connection | Supported (default) |
| Multi-account | Supported |
| Image messages | Partial (requires image_key) |
| Reactions | Not supported |
| Threads | Not supported |
| Streaming | Not supported |

## CLI Usage

**Send a message:**

```bash
# To user (open_id)
clawdbot message send --channel feishu --target ou_xxx --message "Hello!"

# To group (chat_id)
clawdbot message send --channel feishu --target oc_xxx --message "Hello team!"
```

**Check status:**

```bash
clawdbot channels status --probe
```

## Troubleshooting

### Bot does not respond

1. Verify credentials: `clawdbot channels status --probe`
2. Check event subscription is set to "Long Connection" in Feishu console
3. Verify sender is approved (pairing or allowFrom)
4. Check logs: `clawdbot logs --follow`

### WebSocket connection fails

1. Ensure gateway has network access to `open.feishu.cn`
2. Verify App ID and App Secret are correct
3. Check app is published and active in Feishu console

### Permission errors

1. Verify required permissions are added
2. Check if permissions need admin approval
3. Ensure app version is published

### Cannot send messages

1. Verify bot is added to the group chat
2. Check target ID format:
   - User: `ou_xxx` (open_id) or `on_xxx` (union_id)
   - Group: `oc_xxx` (chat_id)
3. Check API quota limits in Feishu console

## Configuration Reference

### Basic Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable channel |
| `appId` | string | - | App ID from Feishu console |
| `appSecret` | string | - | App Secret from Feishu console |
| `appSecretFile` | string | - | Path to file containing app secret |
| `dmPolicy` | string | "pairing" | DM access policy |
| `allowFrom` | string[] | [] | DM allowlist (user IDs) |
| `groupPolicy` | string | "allowlist" | Group access policy |
| `groupAllowFrom` | string[] | [] | Group allowlist (chat IDs) |
| `mediaMaxMb` | number | 20 | Max media size in MB |

### Multi-account

```json5
{
  channels: {
    feishu: {
      defaultAccount: "main",
      accounts: {
        main: {
          name: "Main Bot",
          appId: "cli_xxx",
          appSecret: "xxx"
        },
        support: {
          name: "Support Bot",
          appId: "cli_yyy",
          appSecret: "yyy"
        }
      }
    }
  }
}
```

## Lark (International)

For Lark (international version), use the same configuration. The API is compatible.

```bash
# Use 'lark' or 'fs' as channel alias
clawdbot message send --channel lark --target ou_xxx --message "Hello!"
```

## Related

- [Feishu Open Platform](https://open.feishu.cn)
- [Feishu Bot API Documentation](https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app)
- [Pairing](/start/pairing) - DM access control
- [Configuration](/gateway/configuration) - Full config reference
