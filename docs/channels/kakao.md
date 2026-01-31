---
summary: "KakaoTalk chatbot support status, capabilities, and configuration"
read_when:
  - Working on KakaoTalk features or webhooks
---
# KakaoTalk (Open Builder)

Status: experimental. Direct messages only via Kakao i Open Builder skill server.

## Plugin required
KakaoTalk ships as a plugin and is not bundled with the core install.
- Install via CLI: `openclaw plugins install @openclaw/kakao`
- Or select **KakaoTalk** during onboarding and confirm the install prompt
- Details: [Plugins](/plugin)

## Quick setup (beginner)
1) Install the KakaoTalk plugin:
   - From a source checkout: `openclaw plugins install ./extensions/kakao`
   - From npm (if published): `openclaw plugins install @openclaw/kakao`
   - Or pick **KakaoTalk** in onboarding and confirm the install prompt
2) Set the API key:
   - Env: `KAKAO_REST_API_KEY=...`
   - Or config: `channels.kakao.apiKey: "..."`.
3) Set up a Kakao i Open Builder chatbot and point the skill server URL to your gateway.
4) Restart the gateway (or finish onboarding).
5) DM access is pairing by default; approve the pairing code on first contact.

Minimal config:
```json5
{
  channels: {
    kakao: {
      enabled: true,
      apiKey: "your-rest-api-key",
      dmPolicy: "pairing"
    }
  }
}
```

## What it is
KakaoTalk is Korea's dominant messaging platform with over 50 million users.
The OpenClaw KakaoTalk channel uses **Kakao i Open Builder** to run a chatbot through a skill server (webhook).
- A KakaoTalk Channel chatbot owned by the Gateway.
- Deterministic routing: replies go back to KakaoTalk; the model never chooses channels.
- DMs share the agent's main session.
- Groups are not supported (Kakao i Open Builder chatbots are 1:1 only).

## Setup (fast path)

### 1) Create a Kakao Developers app
1) Go to **https://developers.kakao.com** and sign in.
2) Create a new application.
3) Go to **App Keys** and copy the **REST API Key**.

### 2) Set up a Kakao Talk Channel
1) Go to **https://center-pf.kakao.com** and create a channel (or use an existing one).
2) Link the channel to your Kakao Developers app under **Kakao Login > Kakao Talk Channel**.

### 3) Configure Kakao i Open Builder
1) Go to **https://i.kakao.com** and create a new chatbot.
2) Connect it to your Kakao Talk Channel.
3) Create a **Skill** with the endpoint URL pointing to your gateway:
   - URL: `https://your-gateway-domain.com/kakao-webhook`
   - The gateway must be publicly accessible (HTTPS required).
4) Create a **Block** that uses the skill for all user utterances (set as fallback block).

### 4) Configure the token (env or config)
Example:

```json5
{
  channels: {
    kakao: {
      enabled: true,
      apiKey: "your-rest-api-key",
      webhookPath: "/kakao-webhook",
      dmPolicy: "pairing"
    }
  }
}
```

Env option: `KAKAO_REST_API_KEY=...` (works for the default account only).

Multi-account support: use `channels.kakao.accounts` with per-account API keys and optional `name`.

5) Restart the gateway. KakaoTalk starts when an API key is resolved (env or config).
6) DM access defaults to pairing. Approve the code when the bot is first contacted.

## How it works (behavior)
- Kakao i Open Builder sends a **skill request** (POST) to the gateway webhook when a user messages the chatbot.
- The gateway processes the message through the agent pipeline.
- The agent's reply is returned **synchronously** in the HTTP response as a Kakao skill response JSON.
- If the agent takes longer than the configured timeout (default 4.5 seconds), a fallback message is returned.
- Replies always route back to the same KakaoTalk conversation.

### Synchronous response model
Unlike Telegram or Zalo which can send replies asynchronously, Kakao i Open Builder requires the skill server to return the response in the HTTP body. This means:
- Agent responses must complete within the timeout window (configurable via `responseTimeoutMs`).
- If the response takes too long, the user sees a fallback message asking them to try again.
- Proactive messaging (sending messages without a user prompt) is not supported.

## Limits
- Outbound text is chunked to 1000 characters (Kakao SimpleText limit).
- Maximum 3 output blocks per skill response.
- Streaming is blocked due to the synchronous response model.
- No proactive message sending (skill server is request-response only).

## Access control (DMs)

### DM access
- Default: `channels.kakao.dmPolicy = "pairing"`. Unknown senders receive a pairing code; messages are ignored until approved.
- Approve via:
  - `openclaw pairing list kakao`
  - `openclaw pairing approve kakao <CODE>`
- Pairing is the default token exchange. Details: [Pairing](/start/pairing)
- `channels.kakao.allowFrom` accepts plusfriend user keys (the ID Kakao provides in skill requests).

## Webhook setup
KakaoTalk **only** supports webhook mode (no polling). The gateway must be publicly accessible via HTTPS.

- Default webhook path: `/kakao-webhook`
- Custom path: set `channels.kakao.webhookPath`
- Optional secret: set `channels.kakao.webhookSecret` for request verification via `X-Kakao-Webhook-Secret` header

The webhook URL you register in Kakao i Open Builder must match your gateway's public URL + webhook path.

## Supported message types
- **Text messages**: Full support with 1000 character chunking.
- **Images**: Not yet supported (planned for future release).
- **Other types**: Logged but not processed.

## Capabilities
| Feature | Status |
|---------|--------|
| Direct messages | ✅ Supported |
| Groups | ❌ Not supported |
| Media (images) | ❌ Not yet (planned) |
| Reactions | ❌ Not supported |
| Threads | ❌ Not supported |
| Polls | ❌ Not supported |
| Native commands | ❌ Not supported |
| Streaming | ❌ Blocked (synchronous model) |
| Proactive sends | ❌ Not supported |

## Troubleshooting

**Bot doesn't respond:**
- Check that the API key is valid: `openclaw channels status --probe`
- Verify the sender is approved (pairing or allowFrom)
- Check gateway logs: `openclaw logs --follow`

**Timeout responses ("Still processing your message"):**
- The agent is taking longer than `responseTimeoutMs` (default 4500ms)
- Consider increasing the timeout: `channels.kakao.responseTimeoutMs: 8000`
- Note: Kakao i Open Builder has its own timeout (typically 5-10 seconds)

**Webhook not receiving events:**
- Ensure your gateway is publicly accessible via HTTPS
- Verify the skill URL in Kakao i Open Builder matches your gateway URL + webhook path
- Check that the skill is connected to a fallback block in your chatbot
- Test the webhook manually: `curl -X POST https://your-domain/kakao-webhook -H "Content-Type: application/json" -d '{"userRequest":{"utterance":"hello","user":{"id":"test"}},"bot":{"id":"test","name":"test"},"action":{"name":"test","id":"test","params":{},"detailParams":{},"clientExtra":null}}'`

**Kakao i Open Builder setup issues:**
- Make sure the chatbot is **deployed** (not just saved) in the Open Builder console
- Verify the Kakao Talk Channel is linked to your app
- Check that the skill endpoint URL uses HTTPS (HTTP is not accepted)

## Configuration reference (KakaoTalk)
Full configuration: [Configuration](/gateway/configuration)

Provider options:
- `channels.kakao.enabled`: enable/disable channel startup.
- `channels.kakao.apiKey`: REST API Key from Kakao Developers console.
- `channels.kakao.tokenFile`: read API key from file path.
- `channels.kakao.webhookPath`: webhook path on the gateway HTTP server (default: `/kakao-webhook`).
- `channels.kakao.webhookSecret`: optional webhook secret for request verification.
- `channels.kakao.dmPolicy`: `pairing | allowlist | open | disabled` (default: pairing).
- `channels.kakao.allowFrom`: DM allowlist (plusfriend user keys). `open` requires `"*"`.
- `channels.kakao.responseTimeoutMs`: max time to wait for agent response in ms (default: 4500).

Multi-account options:
- `channels.kakao.accounts.<id>.apiKey`: per-account REST API key.
- `channels.kakao.accounts.<id>.tokenFile`: per-account token file.
- `channels.kakao.accounts.<id>.name`: display name.
- `channels.kakao.accounts.<id>.enabled`: enable/disable account.
- `channels.kakao.accounts.<id>.dmPolicy`: per-account DM policy.
- `channels.kakao.accounts.<id>.allowFrom`: per-account allowlist.
- `channels.kakao.accounts.<id>.webhookPath`: per-account webhook path.
- `channels.kakao.accounts.<id>.webhookSecret`: per-account webhook secret.
- `channels.kakao.accounts.<id>.responseTimeoutMs`: per-account response timeout.
