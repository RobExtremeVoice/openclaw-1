import type { ModelDefinitionConfig } from "../config/types.js";

export const BASETEN_BASE_URL = "https://inference.baseten.co/v1";
export const BASETEN_DEFAULT_MODEL_ID = "zai-org/GLM-4.7";
export const BASETEN_DEFAULT_MODEL_REF = `baseten/${BASETEN_DEFAULT_MODEL_ID}`;

// Baseten uses pay-per-token pricing; rates vary by model.
// Set to 0 as a default; override in models.json for accurate costs.
export const BASETEN_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/**
 * Static catalog of Baseten Model API models.
 *
 * Only includes LLM models available through Baseten's Model APIs.
 * Model IDs use the format: <org>/<model-name>
 */
export const BASETEN_MODEL_CATALOG = [
  // OpenAI GPT OSS models
  {
    id: "openai/gpt-oss-120b",
    name: "OpenAI GPT OSS 120B",
    reasoning: true,
    input: ["text"] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },

  // DeepSeek models
  {
    id: "deepseek-ai/DeepSeek-V3.2",
    name: "DeepSeek V3.2",
    reasoning: false,
    input: ["text"] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "deepseek-ai/DeepSeek-V3.1",
    name: "DeepSeek V3.1",
    reasoning: false,
    input: ["text"] as const,
    contextWindow: 163840,
    maxTokens: 8192,
  },
  {
    id: "deepseek-ai/DeepSeek-V3-0324",
    name: "DeepSeek V3 0324",
    reasoning: false,
    input: ["text"] as const,
    contextWindow: 163840,
    maxTokens: 8192,
  },

  // Kimi models
  {
    id: "moonshotai/Kimi-K2-Thinking",
    name: "Kimi K2 Thinking",
    reasoning: true,
    input: ["text"] as const,
    contextWindow: 262144,
    maxTokens: 8192,
  },
  {
    id: "moonshotai/Kimi-K2-Instruct-0905",
    name: "Kimi K2 Instruct 0905",
    reasoning: false,
    input: ["text"] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },

  // Qwen models
  {
    id: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    name: "Qwen3 Coder 480B A35B Instruct",
    reasoning: false,
    input: ["text"] as const,
    contextWindow: 262144,
    maxTokens: 8192,
  },

  // GLM models
  {
    id: "zai-org/GLM-4.7",
    name: "GLM-4.7",
    reasoning: true,
    input: ["text"] as const,
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "zai-org/GLM-4.6",
    name: "GLM-4.6",
    reasoning: true,
    input: ["text"] as const,
    contextWindow: 200000,
    maxTokens: 8192,
  },
] as const;

export type BasetenCatalogEntry = (typeof BASETEN_MODEL_CATALOG)[number];

/**
 * Build a ModelDefinitionConfig from a Baseten catalog entry.
 */
export function buildBasetenModelDefinition(entry: BasetenCatalogEntry): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name,
    reasoning: entry.reasoning,
    input: [...entry.input],
    cost: BASETEN_DEFAULT_COST,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
  };
}

/**
 * Returns Baseten models from the static catalog.
 */
export function discoverBasetenModels(): ModelDefinitionConfig[] {
  return BASETEN_MODEL_CATALOG.map(buildBasetenModelDefinition);
}
