import type { ModelDefinitionConfig } from "../config/types.models.js";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export const DEEPSEEK_MODEL_CATALOG: ModelDefinitionConfig[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    reasoning: false,
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 8192,
    cost: {
      input: 0.14,
      output: 0.28,
      cacheRead: 0.14,
      cacheWrite: 0.28,
    },
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1 (Reasoner)",
    reasoning: true,
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 8192,
    cost: {
      input: 0.55,
      output: 2.19,
      cacheRead: 0.14,
      cacheWrite: 0.28,
    },
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    reasoning: false,
    input: ["text"],
    contextWindow: 16000,
    maxTokens: 8192,
    cost: {
      input: 0.14,
      output: 0.28,
      cacheRead: 0.14,
      cacheWrite: 0.28,
    },
  },
];

/** DeepSeek API supports streaming (SSE); enable by default for chat/reasoner/coder. */
const DEEPSEEK_STREAMING_PARAMS = { streaming: true };

export function buildDeepseekModelDefinition(
  model: (typeof DEEPSEEK_MODEL_CATALOG)[number],
): ModelDefinitionConfig {
  return {
    id: model.id,
    name: model.name,
    api: "openai-completions",
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    params: DEEPSEEK_STREAMING_PARAMS,
  };
}
