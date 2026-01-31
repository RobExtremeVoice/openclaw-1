---
summary: "Use OpenRouter's unified API to access many models in Moltbot"
read_when:
  - You want a single API key for many LLMs
  - You want to run models via OpenRouter in Moltbot
---
# OpenRouter

OpenRouter provides a **unified API** that routes requests to many models behind a single
endpoint and API key. It is OpenAI-compatible, so most OpenAI SDKs work by switching the base URL.

## CLI setup

**1. Set the default model** (e.g. Grok 4.1 Fast):

```bash
moltbot models set openrouter/x-ai/grok-4.1-fast
```

**2. Add your OpenRouter API key** (choose one):

- **Onboard wizard** (writes auth profile + optional env):
  ```bash
  moltbot onboard --auth-choice openrouter-api-key --openrouter-api-key "YOUR_KEY"
  ```
- **Environment variable** (gateway must see it):
  ```bash
  export OPENROUTER_API_KEY="sk-or-..."
  ```

Get an API key at [openrouter.ai](https://openrouter.ai).

## Config snippet

```json5
{
  env: { OPENROUTER_API_KEY: "sk-or-..." },
  agents: {
    defaults: {
      model: { primary: "openrouter/x-ai/grok-4.1-fast" }
    }
  }
}
```

Other examples: `openrouter/anthropic/claude-sonnet-4-5`, `openrouter/meta-llama/llama-3.3-70b:free`.

## Notes

- Model refs are `openrouter/<provider>/<model>`.
- For more model/provider options, see [/concepts/model-providers](/concepts/model-providers).
- OpenRouter uses a Bearer token with your API key under the hood.
