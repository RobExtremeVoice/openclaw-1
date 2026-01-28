import type { MoltbotConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { setAzureApiKey } from "./onboard-auth.credentials.js";

export const AZURE_DEFAULT_MODEL_ID = "gpt-5.2";
export const AZURE_DEFAULT_MODEL_REF = `azure/${AZURE_DEFAULT_MODEL_ID}`;

export async function applyAzureConfig(params: {
  prompter: WizardPrompter;
  agentDir?: string;
}): Promise<MoltbotConfig> {
  const { prompter, agentDir } = params;

  await prompter.note(
    [
      "Azure provider supports OpenAI-compatible models on Azure infrastructure:",
      "",
      "• OpenAI models: GPT-4, GPT-5.2, o1/o3",
      "• DeepSeek models: DeepSeek-V3, DeepSeek-Chat",
      "• Other compatible models deployed on Azure",
      "",
      "You'll need:",
      "1. Azure endpoint (e.g., https://eastus2.api.cognitive.microsoft.com)",
      "2. Azure API key",
      "3. Deployment name (e.g., gpt-5.2, deepseek-chat)",
      "4. API version (default: 2024-08-01-preview)",
      "",
      "Find these in Azure Portal under your resource's 'Keys and Endpoint'.",
    ].join("\n"),
    "Azure Setup",
  );

  const endpoint = await prompter.text({
    message: "Azure endpoint URL",
    placeholder: "https://your-resource.cognitiveservices.azure.com",
    validate: (value) => {
      if (!value?.trim()) return "Endpoint is required";
      try {
        new URL(value);
        return undefined;
      } catch {
        return "Invalid URL format";
      }
    },
  });

  const deployment = await prompter.text({
    message: "Deployment name",
    placeholder: "gpt-5.2",
    validate: (value) => (!value?.trim() ? "Deployment name is required" : undefined),
  });

  const apiKey = await prompter.text({
    message: "Azure API key",
    validate: (value: string) => (!value?.trim() ? "API key is required" : undefined),
  });

  const apiVersion = await prompter.text({
    message: "API version (optional)",
    placeholder: "2024-08-01-preview",
    initialValue: "2024-08-01-preview",
  });

  await setAzureApiKey(apiKey, agentDir);

  const baseUrl = `${endpoint.trim()}/openai/deployments/${deployment.trim()}?api-version=${apiVersion.trim()}`;

  return {
    models: {
      providers: {
        azure: {
          baseUrl,
          apiKey: "AZURE_API_KEY",
          api: "openai-completions",
          headers: {
            "api-key": "${AZURE_API_KEY}",
          },
          models: [
            {
              id: deployment.trim(),
              name: `Azure ${deployment.trim()}`,
              reasoning:
                deployment.toLowerCase().includes("o1") || deployment.toLowerCase().includes("o3"),
              input: deployment.toLowerCase().includes("vision") ? ["text", "image"] : ["text"],
              cost: {
                input: 10,
                output: 30,
                cacheRead: 2.5,
                cacheWrite: 12.5,
              },
              contextWindow: 200000,
              maxTokens: 16384,
              compat: {
                maxTokensField: "max_completion_tokens",
              },
            },
          ],
        },
      },
    },
  };
}

export function applyAzureProviderConfig(): MoltbotConfig {
  return {
    models: {
      providers: {
        azure: {
          baseUrl:
            "${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}?api-version=${AZURE_API_VERSION}",
          apiKey: "AZURE_API_KEY",
          api: "openai-completions",
          headers: {
            "api-key": "${AZURE_API_KEY}",
          },
          models: [
            {
              id: "${AZURE_DEPLOYMENT}",
              name: "Azure ${AZURE_DEPLOYMENT}",
              reasoning: false,
              input: ["text"],
              cost: {
                input: 10,
                output: 30,
                cacheRead: 2.5,
                cacheWrite: 12.5,
              },
              contextWindow: 200000,
              maxTokens: 16384,
              compat: {
                maxTokensField: "max_completion_tokens",
              },
            },
          ],
        },
      },
    },
  };
}
