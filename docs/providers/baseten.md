---
summary: "Use Baseten Model APIs for high-performance LLMs in Moltbot"
read_when:
  - You want high-performance LLM inference in Moltbot
  - You want Baseten Model APIs setup guidance
---
# Baseten

Baseten provides Model APIs for instant access to high-performance LLMs through OpenAI-compatible endpoints. Point your existing OpenAI SDK at Baseten's inference endpoint and start making calls—no model deployment required.

## Why Baseten in Moltbot

- **High-performance LLMs** with optimized serving infrastructure.
- **Wide model selection** including DeepSeek V3.2, GPT OSS 120B, Kimi K2, Qwen3 Coder, GLM-4.7, and more.
- **OpenAI-compatible API** - standard `/v1` endpoints for easy integration.
- **Serverless** - no infrastructure management, pay per token.

## Features

- **Model APIs**: Instant access to high-performance LLMs without deployment
- **OpenAI-compatible API**: Standard `/v1` endpoints for easy integration
- **Streaming**: Supported on all models
- **Function calling**: Supported on select models (check model capabilities)
- **Structured outputs**: Generate JSON that conforms to a schema
- **Reasoning**: Control extended thinking for reasoning-capable models

## Setup

### 1. Get API Key

1. Sign up at [baseten.co](https://app.baseten.co/signup/)
2. Go to **[Settings > API Keys](https://app.baseten.co/settings/api_keys) > Create API Key**
3. Copy your API key

### 2. Configure Moltbot

**Option A: Environment Variable**

```bash
export BASETEN_API_KEY="your-api-key-here"
```

**Option B: Interactive Setup (Recommended)**

```bash
moltbot onboard --auth-choice baseten-api-key
```

This will:
1. Prompt for your API key (or use existing `BASETEN_API_KEY`)
2. Configure the Baseten provider with available models
3. Let you pick your default model
4. Set up the provider automatically

**Option C: Non-interactive**

```bash
moltbot onboard --non-interactive \
  --auth-choice baseten-api-key \
  --baseten-api-key "your-api-key-here"
```

### 3. Verify Setup

```bash
moltbot chat --model baseten/deepseek-ai/DeepSeek-V3.2 "Hello, are you working?"
```

## Model Selection

Moltbot includes a curated catalog of popular Baseten Model API models. Pick based on your needs:

- **Default**: `deepseek-ai/DeepSeek-V3.2` (DeepSeek V3.2) - general purpose, 131k context.
- **Best reasoning**: `openai/gpt-oss-120b` or `moonshotai/Kimi-K2-Thinking`
- **Coding**: `Qwen/Qwen3-Coder-480B-A35B-Instruct`
- **Long context**: `moonshotai/Kimi-K2-Thinking` (262k context)

Change your default model anytime:

```bash
moltbot models set baseten/deepseek-ai/DeepSeek-V3.2
moltbot models set baseten/openai/gpt-oss-120b
```

List all available models:

```bash
moltbot models list | grep baseten
```

## Which Model Should I Use?

| Use Case | Recommended Model | Why |
|----------|-------------------|-----|
| **General chat** | `deepseek-ai/DeepSeek-V3.2` | Balanced performance, 131k context |
| **Complex reasoning** | `openai/gpt-oss-120b` | Best for step-by-step reasoning |
| **Agentic tasks** | `openai/gpt-oss-120b` | Designed for reasoning and agentic use |
| **Coding** | `Qwen/Qwen3-Coder-480B-A35B-Instruct` | Code-optimized, 262k context |
| **Long context** | `moonshotai/Kimi-K2-Thinking` | 262k context window |
| **Reasoning** | `zai-org/GLM-4.7` | Advanced thinking controls |

## Available Models (9 Total)

### Text Models

| Model ID | Name | Context | Features |
|----------|------|---------|----------|
| `openai/gpt-oss-120b` | OpenAI GPT OSS 120B | 128k | Reasoning |
| `deepseek-ai/DeepSeek-V3.2` | DeepSeek V3.2 | 131k | General |
| `deepseek-ai/DeepSeek-V3.1` | DeepSeek V3.1 | 164k | General |
| `deepseek-ai/DeepSeek-V3-0324` | DeepSeek V3 0324 | 164k | General |
| `moonshotai/Kimi-K2-Thinking` | Kimi K2 Thinking | 262k | Reasoning |
| `moonshotai/Kimi-K2-Instruct-0905` | Kimi K2 Instruct 0905 | 128k | Long context |
| `Qwen/Qwen3-Coder-480B-A35B-Instruct` | Qwen3 Coder 480B A35B Instruct | 262k | Coding |
| `zai-org/GLM-4.7` | GLM-4.7 | 200k | Reasoning |
| `zai-org/GLM-4.6` | GLM-4.6 | 200k | Reasoning |

## Model IDs

Baseten model IDs use the format:

```
<org>/<model-name>
```

When using models in Moltbot, prefix with the provider:

```bash
moltbot chat --model baseten/deepseek-ai/DeepSeek-V3.2
```

## Streaming and Tool Support

| Feature | Support |
|---------|---------|
| **Streaming** | All models |
| **Function calling** | Select models (check model capabilities) |
| **Structured outputs** | Supported via `response_format` |
| **Reasoning** | Supported on reasoning-capable models |

## Pricing

Baseten uses pay-per-token pricing. Check [baseten.co](https://baseten.co) for current rates. Generally:

- Smaller models: Lower cost, faster
- Larger models: Higher quality, higher cost
- Reasoning models: May have additional costs for extended thinking

## Usage Examples

```bash
# Use DeepSeek V3.2 (recommended default)
moltbot chat --model baseten/deepseek-ai/DeepSeek-V3.2

# Use GPT OSS 120B for reasoning
moltbot chat --model baseten/openai/gpt-oss-120b

# Use coding model
moltbot chat --model baseten/Qwen/Qwen3-Coder-480B-A35B-Instruct

# Use reasoning model
moltbot chat --model baseten/moonshotai/Kimi-K2-Thinking
```

## Troubleshooting

### API key not recognized

```bash
echo $BASETEN_API_KEY
moltbot models list | grep baseten
```

Ensure the key is valid and has not expired.

### Model not available

Run `moltbot models list` to see currently available models in the catalog. If a model you need is missing, you can add it manually to your config file.

### Connection issues

Baseten API is at `https://inference.baseten.co`. Ensure your network allows HTTPS connections.

## Config file example

```json5
{
  env: { BASETEN_API_KEY: "..." },
  agents: { defaults: { model: { primary: "baseten/deepseek-ai/DeepSeek-V3.2" } } },
  models: {
    mode: "merge",
    providers: {
      baseten: {
        baseUrl: "https://inference.baseten.co/v1",
        apiKey: "${BASETEN_API_KEY}",
        api: "openai-completions",
        models: [
          {
            id: "deepseek-ai/DeepSeek-V3.2",
            name: "DeepSeek V3.2",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 131072,
            maxTokens: 8192
          }
        ]
      }
    }
  }
}
```

## Links

- [Baseten](https://baseten.co)
- [Model APIs Documentation](https://docs.baseten.co/development/model-apis/overview)
- [API Reference](https://docs.baseten.co/reference/inference-api/chat-completions)
- [Model Library](https://app.baseten.co/model-apis/create)
