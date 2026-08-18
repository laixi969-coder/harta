import fs from "node:fs";
import path from "node:path";
import { maskKey } from "./auth.mjs";

const llmPath = () => path.join(process.cwd(), "data", "llm.json");

const EMPTY_PROVIDER = () => ({
  apiKey: "",
  baseUrl: "",
  model: "",
  models: [],
  lastSyncAt: "",
  lastTestAt: "",
  lastTestOk: null,
  lastTestDetail: "",
});

function defaults() {
  return {
    active: "xai",
    providers: {
      xai: {
        id: "xai",
        name: "xAI",
        kind: "openai",
        ...EMPTY_PROVIDER(),
        baseUrl: "https://api.x.ai/v1",
      },
      openai: {
        id: "openai",
        name: "OpenAI",
        kind: "openai",
        ...EMPTY_PROVIDER(),
        baseUrl: "https://api.openai.com/v1",
      },
      anthropic: {
        id: "anthropic",
        name: "Anthropic",
        kind: "anthropic",
        ...EMPTY_PROVIDER(),
        baseUrl: "https://api.anthropic.com/v1",
      },
      custom: {
        id: "custom",
        name: "自定义兼容接口",
        kind: "openai",
        ...EMPTY_PROVIDER(),
        baseUrl: "",
      },
    },
  };
}

export function readLlm() {
  const file = llmPath();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const init = defaults();
    fs.writeFileSync(file, JSON.stringify(init, null, 2) + "\n");
    return init;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeLlm(data) {
  fs.mkdirSync(path.dirname(llmPath()), { recursive: true });
  fs.writeFileSync(llmPath(), JSON.stringify(data, null, 2) + "\n");
}

export function publicLlm() {
  const data = readLlm();
  const providers = {};
  for (const [id, p] of Object.entries(data.providers)) {
    providers[id] = {
      id,
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      model: p.model,
      models: p.models || [],
      hasKey: Boolean(p.apiKey),
      apiKeyMasked: maskKey(p.apiKey || ""),
      lastSyncAt: p.lastSyncAt || "",
      lastTestAt: p.lastTestAt || "",
      lastTestOk: p.lastTestOk,
      lastTestDetail: p.lastTestDetail || "",
    };
  }
  return { active: data.active, providers };
}

export function saveProvider(id, patch) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  if (patch.baseUrl !== undefined) p.baseUrl = String(patch.baseUrl || "").replace(/\/$/, "");
  if (patch.model !== undefined) p.model = String(patch.model || "");
  if (patch.apiKey) p.apiKey = String(patch.apiKey).trim();
  if (patch.active === true) data.active = id;
  writeLlm(data);
  return publicLlm();
}

export function setActive(id) {
  const data = readLlm();
  if (!data.providers[id]) throw new Error("没有这个模型渠道");
  data.active = id;
  writeLlm(data);
  return publicLlm();
}

async function fetchJson(url, headers, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json };
}

export async function syncModels(id) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  if (!p.apiKey) throw new Error("先保存密钥，才能同步模型");
  const base = (p.baseUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("先填接口地址");

  let names = [];
  if (p.kind === "anthropic") {
    const got = await fetchJson(`${base}/models`, {
      "x-api-key": p.apiKey,
      "anthropic-version": "2023-06-01",
    });
    if (!got.ok) throw new Error(`同步失败 ${got.status}`);
    names = (got.json.data || []).map((m) => m.id).filter(Boolean);
  } else {
    const got = await fetchJson(`${base}/models`, {
      authorization: `Bearer ${p.apiKey}`,
    });
    if (!got.ok) throw new Error(`同步失败 ${got.status}`);
    names = (got.json.data || []).map((m) => m.id).filter(Boolean);
  }
  names.sort();
  p.models = names;
  p.lastSyncAt = new Date().toISOString();
  if (p.model && !names.includes(p.model) && names[0]) p.model = names[0];
  if (!p.model && names[0]) p.model = names[0];
  writeLlm(data);
  return publicLlm();
}

export async function testConnection(id) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  if (!p.apiKey) throw new Error("先保存密钥，才能测连接");
  const base = (p.baseUrl || "").replace(/\/$/, "");
  const model = p.model;
  if (!base || !model) throw new Error("先填接口地址和模型");

  const started = Date.now();
  let got;
  if (p.kind === "anthropic") {
    got = await fetchJson(
      `${base}/messages`,
      {
        "x-api-key": p.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      { model, max_tokens: 8, messages: [{ role: "user", content: "只回ok" }] },
    );
  } else {
    got = await fetchJson(
      `${base}/chat/completions`,
      {
        authorization: `Bearer ${p.apiKey}`,
        "content-type": "application/json",
      },
      {
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "只回ok" }],
      },
    );
  }
  const ms = Date.now() - started;
  p.lastTestAt = new Date().toISOString();
  p.lastTestOk = got.ok;
  p.lastTestDetail = got.ok ? `连通，${ms}ms` : `失败 ${got.status}`;
  writeLlm(data);
  return {
    ok: got.ok,
    ms,
    detail: p.lastTestDetail,
    config: publicLlm(),
  };
}
