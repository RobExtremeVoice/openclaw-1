---
summary: "Routing rules per channel (WhatsApp, Telegram, Discord, Slack) and shared context"
read_when:
  - Changing channel routing or inbox behavior
---
# Channels & routing


Moltbot routes replies **back to the channel where a message came from**. The
model does not choose a channel; routing is deterministic and controlled by the
host configuration.

## Key terms

- **Channel**: `whatsapp`, `telegram`, `discord`, `slack`, `signal`, `imessage`, `webchat`.
- **AccountId**: per‑channel account instance (when supported).
- **AgentId**: an isolated workspace + session store (“brain”).
- **SessionKey**: the bucket key used to store context and control concurrency.

## Session key shapes (examples)

Direct messages collapse to the agent’s **main** session:

- `agent:<agentId>:<mainKey>` (default: `agent:main:main`)

Groups and channels remain isolated per channel:

- Groups: `agent:<agentId>:<channel>:group:<id>`
- Channels/rooms: `agent:<agentId>:<channel>:channel:<id>`

Threads:

- Slack/Discord threads append `:thread:<threadId>` to the base key.
- Telegram forum topics embed `:topic:<topicId>` in the group key.

Examples:

- `agent:main:telegram:group:-1001234567890:topic:42`
- `agent:main:discord:channel:123456:thread:987654`

## Routing rules (how an agent is chosen)

Routing picks **one agent** for each inbound message:

1. **Exact peer match** (`bindings` with `peer.kind` + `peer.id`).
2. **Guild match** (Discord) via `guildId`.
3. **Team match** (Slack) via `teamId`.
4. **Account match** (`accountId` on the channel).
5. **Channel match** (any account on that channel).
6. **Default agent** (`agents.list[].default`, else first list entry, fallback to `main`).

The matched agent determines which workspace and session store are used.

```mermaid
flowchart TD
    MSG[Inbound Message] --> P1{Exact Peer Match?}
    P1 -->|Yes| FOUND[Agent Found]
    P1 -->|No| P2{Guild Match?\nDiscord guildId}
    P2 -->|Yes| FOUND
    P2 -->|No| P3{Team Match?\nSlack teamId}
    P3 -->|Yes| FOUND
    P3 -->|No| P4{Account Match?\naccountId}
    P4 -->|Yes| FOUND
    P4 -->|No| P5{Channel Match?\nany account}
    P5 -->|Yes| FOUND
    P5 -->|No| P6[Default Agent\nagents.list default\nor first entry\nor 'main']
    P6 --> FOUND
    FOUND --> WS[Workspace + Session Store]
```

## Broadcast groups (run multiple agents)

Broadcast groups let you run **multiple agents** for the same peer **when Moltbot would normally reply** (for example: in WhatsApp groups, after mention/activation gating).

Config:

```json5
{
  broadcast: {
    strategy: "parallel",
    "120363403215116621@g.us": ["alfred", "baerbel"],
    "+15555550123": ["support", "logger"]
  }
}
```

See: [Broadcast Groups](/broadcast-groups).

```mermaid
flowchart TD
    MSG[Inbound Message\nfrom peer] --> BC{Peer in\nBroadcast Config?}
    BC -->|Yes| MULTI[Broadcast:\nAll listed agents process\nisolated sessions each]
    BC -->|No| BIND{Peer in\nBindings?}
    BIND -->|Yes| SINGLE[Normal Routing:\nOne matched agent]
    BIND -->|No| DEFAULT[Default Agent\nfallback routing]

    MULTI --> REPLY_M[Multiple Replies\nfrom each agent]
    SINGLE --> REPLY_S[Single Reply]
    DEFAULT --> REPLY_S
```

## Config overview

- `agents.list`: named agent definitions (workspace, model, etc.).
- `bindings`: map inbound channels/accounts/peers to agents.

Example:

```json5
{
  agents: {
    list: [
      { id: "support", name: "Support", workspace: "~/clawd-support" }
    ]
  },
  bindings: [
    { match: { channel: "slack", teamId: "T123" }, agentId: "support" },
    { match: { channel: "telegram", peer: { kind: "group", id: "-100123" } }, agentId: "support" }
  ]
}
```

## Session storage

Session stores live under the state directory (default `~/.clawdbot`):

- `~/.clawdbot/agents/<agentId>/sessions/sessions.json`
- JSONL transcripts live alongside the store

You can override the store path via `session.store` and `{agentId}` templating.

## WebChat behavior

WebChat attaches to the **selected agent** and defaults to the agent’s main
session. Because of this, WebChat lets you see cross‑channel context for that
agent in one place.

## Reply context

Inbound replies include:
- `ReplyToId`, `ReplyToBody`, and `ReplyToSender` when available.
- Quoted context is appended to `Body` as a `[Replying to ...]` block.

This is consistent across channels.
