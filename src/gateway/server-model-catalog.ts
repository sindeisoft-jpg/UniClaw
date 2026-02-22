import {
  loadModelCatalog,
  type ModelCatalogEntry,
  resetModelCatalogCacheForTest,
} from "../agents/model-catalog.js";
import { loadConfig } from "../config/config.js";
import type { OpenClawConfig } from "../config/config.js";

export type GatewayModelChoice = ModelCatalogEntry;

const OLLAMA_API_BASE_DEFAULT = "http://127.0.0.1:11434";

function ollamaApiBase(cfg: OpenClawConfig): string {
  const base = (cfg?.models?.providers as Record<string, { baseUrl?: string }> | undefined)?.ollama
    ?.baseUrl;
  if (typeof base !== "string" || !base.trim()) {
    return OLLAMA_API_BASE_DEFAULT;
  }
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.replace(/\/v1$/i, "");
}

/** Fetch current model list from Ollama server so catalog matches UI (models.list) and session patch allows those models. */
export async function fetchOllamaModelsFromServer(
  cfg: OpenClawConfig,
): Promise<ModelCatalogEntry[]> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return [];
  }
  try {
    const apiBase = ollamaApiBase(cfg);
    const response = await fetch(`${apiBase}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const list = data?.models ?? [];
    return list
      .filter((m) => m?.name && String(m.name).trim())
      .map((m) => {
        const id = String(m.name).trim();
        const lower = id.toLowerCase();
        const isReasoning =
          lower.includes("r1") || lower.includes("reasoning");
        // Many Ollama models are vision-capable; infer from common name patterns so
        // uploaded images are passed to the model (modelSupportsImages uses input).
        const hasVision =
          lower.includes("vl") ||
          lower.includes("vision") ||
          lower.includes("llava") ||
          lower.includes("pixtral") ||
          lower.includes("ministral") ||
          lower.includes("minicpm-v") ||
          lower.includes("moondream") ||
          lower.includes("bakllava") ||
          lower.includes("minicpm-vl") ||
          lower.includes("qwen2-vl") ||
          lower.includes("qwen3-vl") ||
          /llava.*:/.test(lower) ||
          /^llava-/.test(lower);
        return {
          id,
          name: id,
          provider: "ollama",
          reasoning: isReasoning,
          input: hasVision ? (["text", "image"] as const) : (["text"] as const),
        };
      });
  } catch {
    return [];
  }
}

// Test-only escape hatch: model catalog is cached at module scope for the
// process lifetime, which is fine for the real gateway daemon, but makes
// isolated unit tests harder. Keep this intentionally obscure.
export function __resetModelCatalogCacheForTest() {
  resetModelCatalogCacheForTest();
}

export async function loadGatewayModelCatalog(): Promise<GatewayModelChoice[]> {
  return await loadModelCatalog({ config: loadConfig() });
}

/** Same as loadGatewayModelCatalog but merges in live Ollama models so session model resolution matches models.list and UI selection works. */
export async function loadGatewayModelCatalogWithLiveOllama(): Promise<GatewayModelChoice[]> {
  const cfg = loadConfig();
  let catalog = await loadGatewayModelCatalog();
  const ollamaLive = await fetchOllamaModelsFromServer(cfg);
  catalog = catalog.filter((m) => m.provider.toLowerCase() !== "ollama");
  catalog = [...catalog, ...ollamaLive].sort((a, b) => {
    const p = a.provider.localeCompare(b.provider);
    if (p !== 0) return p;
    return a.name.localeCompare(b.name);
  });
  return catalog;
}
