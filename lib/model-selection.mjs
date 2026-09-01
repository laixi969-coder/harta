import { sortModelsNewestFirst } from "./model-order.mjs";

/* v1 会在同步时把整批对话模型自动打开。v2 开始，清单只负责展示，选择权留给用户。
 * 版本号让旧配置只清一次；用户在 v2 里亲自选过的模型不会在下次启动时丢失。 */
export const MODEL_SELECTION_VERSION = 2;

export function normalizeProviderModelSelection(provider) {
  const p = provider;
  p.models = sortModelsNewestFirst(p.models || [], p.modelCreatedAt || {});
  if (p.modelSelectionVersion !== MODEL_SELECTION_VERSION) {
    p.enabled = [];
    p.model = "";
    p.modelSelectionVersion = MODEL_SELECTION_VERSION;
    return p;
  }
  const enabled = new Set(Array.isArray(p.enabled) ? p.enabled : []);
  p.enabled = p.models.filter((model) => enabled.has(model));
  if (p.model && !p.enabled.includes(p.model)) p.model = "";
  return p;
}

export function selectedModelsAfterSync(models, previousModels, previousEnabled) {
  const known = new Set(previousModels || []);
  const selected = new Set(previousEnabled || []);
  return (models || []).filter((model) => known.has(model) && selected.has(model));
}

export function providerReadiness(provider) {
  const p = provider || {};
  const missing = [];
  if (!String(p.apiKey || "").trim()) missing.push("密钥");
  if (!String(p.baseUrl || "").trim()) missing.push("接口地址");
  if (!String(p.model || "").trim()) missing.push("模型");
  return { ready: missing.length === 0, missing };
}
