import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";
import { loadGatewayModelCatalogWithLiveOllama } from "../server-model-catalog.js";

function normalizedModelKey(provider: string, id: string): string {
  return `${String(provider).trim().toLowerCase()}/${String(id).trim().toLowerCase()}`;
}

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const cfg = loadConfig();
      // Use catalog with live Ollama so UI list matches what session patch allows.
      let models = await context.loadGatewayModelCatalogWithLiveOllama();
      // When configuredOnly: show full catalog if no allowlist; otherwise show allowlist plus all
      // models from any provider that appears in the allowlist (so e.g. one ollama/* in allowlist
      // shows all Ollama models from catalog).
      const configuredOnly = (params as { configuredOnly?: boolean }).configuredOnly === true;
      if (configuredOnly) {
        const defaultsModels = cfg?.agents?.defaults?.models;
        if (
          defaultsModels &&
          typeof defaultsModels === "object" &&
          !Array.isArray(defaultsModels)
        ) {
          const allowKeys = Object.keys(defaultsModels)
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean);
          if (allowKeys.length > 0) {
            const allowSet = new Set(allowKeys);
            const providersInAllowlist = new Set(
              allowKeys.map((k) => k.split("/")[0]).filter(Boolean),
            );
            models = models.filter(
              (m) =>
                allowSet.has(normalizedModelKey(m.provider, m.id)) ||
                providersInAllowlist.has(m.provider.toLowerCase()),
            );
          }
        }
      }
      respond(true, { models }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
