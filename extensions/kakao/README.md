# @openclaw/kakao

KakaoTalk channel plugin for OpenClaw (Kakao i Open Builder).

## Install (local checkout)

```bash
openclaw plugins install ./extensions/kakao
```

## Install (npm)

```bash
openclaw plugins install @openclaw/kakao
```

Onboarding: select KakaoTalk and confirm the install prompt to fetch the plugin automatically.

## Config

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

## Webhook setup

KakaoTalk uses Kakao i Open Builder skill server (webhook only, no polling).

1. Create a chatbot at https://i.kakao.com
2. Add a skill pointing to your gateway: `https://your-domain.com/kakao-webhook`
3. Connect the skill to a fallback block

```json5
{
  channels: {
    kakao: {
      webhookPath: "/kakao-webhook",
      webhookSecret: "optional-secret",
      responseTimeoutMs: 4500
    }
  }
}
```

Restart the gateway after config changes.
