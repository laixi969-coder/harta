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
      builtin: BUILTIN.includes(id),
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

/* 自定义接口不止一个。同一个人可能同时挂着火山、硅基流动、一个自建的中转，
 * 换渠道比改一个渠道的地址方便，也不会把已经调通的那份配置覆盖掉。
 * 内置那四个是固定的，删不掉；自己加的随时能删。 */
const BUILTIN = ["xai", "openai", "anthropic", "custom"];

export function addCustomProvider(name) {
  const clean = String(name || "").trim().slice(0, 20);
  if (!clean) throw new Error("给这个接口起个名字，好认");
  const data = readLlm();
  let n = 2;
  while (data.providers[`custom-${n}`]) n += 1;
  const id = `custom-${n}`;
  data.providers[id] = { id, name: clean, kind: "openai", ...EMPTY_PROVIDER() };
  writeLlm(data);
  return publicLlm();
}

export function removeProvider(id) {
  const data = readLlm();
  if (BUILTIN.includes(id)) throw new Error("内置渠道删不掉，不用的留着空着就行");
  if (!data.providers[id]) throw new Error("没有这个模型渠道");
  delete data.providers[id];
  // 删掉的正好是在用的那个，就退回一个填了密钥的；一个都没有就退回第一个
  if (data.active === id) {
    const ids = Object.keys(data.providers);
    data.active = ids.find((x) => data.providers[x].apiKey) || ids[0] || "xai";
  }
  writeLlm(data);
  return publicLlm();
}

export function saveProvider(id, patch) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  if (patch.baseUrl !== undefined) p.baseUrl = String(patch.baseUrl || "").replace(/\/$/, "");
  if (patch.model !== undefined) p.model = String(patch.model || "");
  if (patch.apiKey) p.apiKey = String(patch.apiKey).trim();
  if (patch.name !== undefined && !BUILTIN.includes(id)) {
    p.name = String(patch.name || "").trim().slice(0, 20) || p.name;
  }
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

/* 出一份档要写十几条文案、几十条外壳，本来就慢。
 * 原来卡 3 分钟，实测一份最小的侦察档就要 232 秒——等于常态性地超时退回模板，
 * 而销售看不出手里这份是模板还是真出的。宁可等，不可给假的。 */
const CHAT_TIMEOUT_MS = 20 * 60 * 1000;

/* 出档是照结构填内容，不是解题。实测同一个提示词：
 * 开思考 232 秒（9169 token 里 7389 是思考），关思考 46 秒，两版内容质量没有差别，
 * 关思考那版的文案还更具体。所以对会思考的模型默认关掉。
 *
 * 只对火山方舟发这个参数：别的厂商不认，发过去会直接报错。 */
function thinkingOff(base) {
  return base.includes("volces.com") ? { thinking: { type: "disabled" } } : {};
}

/** 出档用的通用对话调用。返回纯文本。 */
export async function chat({ system, user, maxTokens = 8000 }) {
  const data = readLlm();
  const p = data.providers[data.active];
  if (!p) throw new Error("没有可用的模型渠道");
  /* 这句话绝大多数时候落在销售屏幕上，而模型设置只有管理员能进。
   * 指路要指到人身上，不能指到一个他打不开的页面。 */
  if (!p.apiKey)
    throw new Error("模型密钥还没配好，出不了档。这一项只有管理员能配（设置 → 模型）；你不是管理员的话，把这句话转给他");
  const base = (p.baseUrl || "").replace(/\/$/, "");
  if (!base || !p.model) throw new Error("模型渠道没填完接口地址和模型");

  const ctl = AbortController ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), CHAT_TIMEOUT_MS);
  try {
    let res;
    if (p.kind === "anthropic") {
      res = await fetch(`${base}/messages`, {
        method: "POST",
        signal: ctl?.signal,
        headers: {
          "x-api-key": p.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: p.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || `模型返回 ${res.status}`);
      return (json.content || []).map((c) => c.text || "").join("");
    }
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: ctl?.signal,
      headers: {
        authorization: `Bearer ${p.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: p.model,
        max_tokens: maxTokens,
        ...thinkingOff(base),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `模型返回 ${res.status}`);
    return json.choices?.[0]?.message?.content || "";
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`模型超过 ${CHAT_TIMEOUT_MS / 60000} 分钟没回`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 出档链路要知道现在能不能真的调模型。 */
export function llmReady() {
  const data = readLlm();
  const p = data.providers[data.active];
  return Boolean(p && p.apiKey && p.baseUrl && p.model);
}
