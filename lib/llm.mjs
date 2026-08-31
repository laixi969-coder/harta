import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { maskKey } from "./auth.mjs";

const llmPath = () => path.join(process.cwd(), "data", "llm.json");

const EMPTY_PROVIDER = () => ({
  apiKey: "",
  baseUrl: "",
  model: "",
  vision: "auto",
  visionTestAt: "",
  visionTestOk: null,
  visionTestDetail: "",
  models: [],
  /* enabled（开着的模型）和 manualModels（手动补的）不预置：
   * 没写过 enabled 就当作「全开」，预置空数组会被当成「显式全关」。 */
  lastSyncAt: "",
  lastTestAt: "",
  lastTestOk: null,
  lastTestDetail: "",
});

/* 「开通教程」指到各家的密钥页。自定义渠道没有固定去处，不给这个按钮。 */
const DOCS = {
  xai: "https://console.x.ai/docs/api",
  openai: "https://platform.openai.com/docs/quickstart",
  anthropic: "https://console.anthropic.com/settings/keys",
};

function modelLooksVisual(model) {
  const name = String(model || "").toLowerCase();
  return Boolean(
    /(?:^|[-_.])(vl|vision|omni)(?:[-_.]|$)/.test(name) ||
      /glm-(?:5\.3-flash|\d+(?:\.\d+)?v(?:-|$))/.test(name) ||
      /qwen3\.[5-9]-(?:max|plus|flash)/.test(name) ||
      /doubao.*vision/.test(name),
  );
}

function modelLooksTextOnly(model) {
  const name = String(model || "").toLowerCase();
  return Boolean(
    /^(?:qwen-(?:turbo|plus|max)|qwen\d*-coder)/.test(name) ||
      /^glm-(?:4\.7(?:-flashx?)?|5(?:\.1|\.2)?|5-turbo)$/.test(name),
  );
}

function visionStatus(provider) {
  if (provider.visionTestOk === true) return "verified";
  if (provider.visionTestOk === false) return "failed";
  if (provider.vision === "on") return "on";
  if (provider.vision === "off") return "off";
  if (modelLooksVisual(provider.model)) return "likely";
  if (modelLooksTextOnly(provider.model)) return "text";
  return "unknown";
}

/* 嵌入、生图、生视频、语音这些不能对话，出档用不上。同步进来时默认关着。 */
function modelLooksNonChat(model) {
  const name = String(model || "").toLowerCase();
  return Boolean(
    /embedding|rerank|bge-|seedream|seededit|seedance|cogvideo|t2i|i2i|t2v|i2v|flf2v|whisper|tts|asr|speech|realtime|voice|3d/.test(
      name,
    ),
  );
}

/* 没写过 enabled 的老配置当作「全开」；一旦写过（哪怕全关），以写下的为准 */
function enabledList(p) {
  if (Array.isArray(p.enabled)) return p.enabled.filter((m) => (p.models || []).includes(m));
  return p.models || [];
}

function resetVisionTest(p) {
  p.visionTestAt = "";
  p.visionTestOk = null;
  p.visionTestDetail = "";
}

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
      vision: p.vision || "auto",
      visionStatus: visionStatus(p),
      visionTestAt: p.visionTestAt || "",
      visionTestOk: p.visionTestOk ?? null,
      visionTestDetail: p.visionTestDetail || "",
      models: p.models || [],
      enabled: enabledList(p),
      docsUrl: DOCS[id] || "",
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
  const nextKey = patch.apiKey ? String(patch.apiKey).trim() : p.apiKey;
  const nextBase = patch.baseUrl !== undefined ? String(patch.baseUrl || "").replace(/\/$/, "") : p.baseUrl;
  const nextModel = patch.model !== undefined ? String(patch.model || "") : p.model;
  if (nextKey !== p.apiKey || nextBase !== p.baseUrl || nextModel !== p.model) {
    resetVisionTest(p);
  }
  p.baseUrl = nextBase;
  p.model = nextModel;
  if (["auto", "on", "off"].includes(patch.vision)) p.vision = patch.vision;
  p.apiKey = nextKey;
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

/* 模型开关。关掉正用在用的那个，就退到第一个开着的；一个不剩就空着，出档时会拦。 */
export function setModelEnabled(id, model, on) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  const name = String(model || "").trim();
  if (!name) throw new Error("没说哪个模型");
  const enabledSet = new Set(enabledList(p));
  if (on) {
    if (!(p.models || []).includes(name)) p.models.push(name);
    enabledSet.add(name);
  } else {
    enabledSet.delete(name);
  }
  p.enabled = (p.models || []).filter((m) => enabledSet.has(m));
  if (p.model && !p.enabled.includes(p.model)) {
    const next = p.enabled[0] || "";
    if (next !== p.model) resetVisionTest(p);
    p.model = next;
  }
  if (!p.model && p.enabled[0]) p.model = p.enabled[0];
  writeLlm(data);
  return publicLlm();
}

/* 点一个模型名 = 用它。没开的顺手打开；跟出档用的可能是另一个模型，所以换模型要清视觉测试记录。 */
export function useModel(id, model) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  const name = String(model || "").trim();
  if (!name) throw new Error("没说哪个模型");
  if (!(p.models || []).includes(name)) {
    p.models.push(name);
    (p.manualModels ||= []).push(name);
  }
  const enabled = [...enabledList(p)];
  if (!enabled.includes(name)) enabled.push(name);
  p.enabled = enabled;
  if (p.model !== name) {
    resetVisionTest(p);
    p.model = name;
  }
  writeLlm(data);
  return publicLlm();
}

/* 同步列表里没有的模型（火山 endpoint 这类）手动补进清单 */
export function addModel(id, model) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  const name = String(model || "").trim();
  if (!name) throw new Error("填一个模型名");
  if ((p.models || []).includes(name)) throw new Error("清单里已经有这个模型");
  p.models.push(name);
  p.models.sort();
  (p.manualModels ||= []).push(name);
  p.enabled = [...enabledList(p), name];
  if (!p.model) p.model = name;
  writeLlm(data);
  return publicLlm();
}

/* 卡片拖动排序：providers 的键序就是显示序，照新顺序重摆一遍 */
export function reorderProviders(ids) {
  const data = readLlm();
  const keys = Object.keys(data.providers);
  const wanted = Array.isArray(ids) ? ids.map(String) : [];
  if (!wanted.length || wanted.length !== keys.length || !wanted.every((x) => keys.includes(x))) {
    throw new Error("渠道顺序对不上");
  }
  const next = {};
  for (const id of wanted) next[id] = data.providers[id];
  data.providers = next;
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
  /* 手动加过的（同步列表里不出现的火山 endpoint 之类）留在清单里，不能一次同步就冲掉 */
  const all = [...new Set([...names, ...(p.manualModels || [])])].sort();
  const prevEnabled = new Set(enabledList(p));
  const prevList = new Set(p.models || []);
  p.models = all;
  /* 老名字保持原来的开关；这次新冒出来的，能对话的默认开，其余默认关 */
  p.enabled = all.filter((m) => (prevList.has(m) ? prevEnabled.has(m) : !modelLooksNonChat(m)));
  p.lastSyncAt = new Date().toISOString();
  if (p.model && !p.enabled.includes(p.model)) p.model = p.enabled[0] || "";
  if (!p.model && p.enabled[0]) p.model = p.enabled[0];
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

/**
 * 资料建档用的视觉调用。图片由资料层压缩后交进来。这个口只负责兼容
 * OpenAI / Anthropic 两套图片协议；模型不支持视觉时，由上层降级并提示。
 */
async function chatWithProviderImages(p, { system, user, images = [], maxTokens = 3000 }) {
  const base = (p.baseUrl || "").replace(/\/$/, "");
  const kept = images.slice(0, 8).filter((x) => x?.data && x?.mime);
  const ctl = AbortController ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), CHAT_TIMEOUT_MS);
  try {
    let res;
    if (p.kind === "anthropic") {
      const content = [{ type: "text", text: user }];
      for (const image of kept) {
        if (image.label) content.push({ type: "text", text: `下面这张图属于：${image.label}` });
        content.push({
          type: "image",
          source: { type: "base64", media_type: image.mime, data: image.data },
        });
      }
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
          messages: [{ role: "user", content }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || `模型返回 ${res.status}`);
      return (json.content || []).map((c) => c.text || "").join("");
    }

    const content = [{ type: "text", text: user }];
    for (const image of kept) {
      if (image.label) content.push({ type: "text", text: `下面这张图属于：${image.label}` });
      content.push({
        type: "image_url",
        image_url: { url: `data:${image.mime};base64,${image.data}` },
      });
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
          { role: "user", content },
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

export async function testVisionConnection(id) {
  const data = readLlm();
  const p = data.providers[id];
  if (!p) throw new Error("没有这个模型渠道");
  if (!p.apiKey || !p.baseUrl || !p.model) throw new Error("先保存密钥、接口地址和模型");
  const sample = await sharp({
    create: { width: 320, height: 320, channels: 3, background: { r: 145, g: 116, b: 72 } },
  })
    .png()
    .toBuffer();
  const started = Date.now();
  try {
    const answer = await chatWithProviderImages(p, {
      system: "简短回答。",
      user: "图中央是什么颜色？只回颜色名。",
      images: [{ mime: "image/png", data: sample.toString("base64"), label: "视觉能力测试图" }],
      maxTokens: 24,
    });
    if (!String(answer || "").trim()) throw new Error("模型没有返回图片识别结果");
    p.visionTestAt = new Date().toISOString();
    p.visionTestOk = true;
    p.visionTestDetail = `图片可读，${Date.now() - started}ms`;
    writeLlm(data);
    return { ok: true, detail: p.visionTestDetail, config: publicLlm() };
  } catch (err) {
    p.visionTestAt = new Date().toISOString();
    p.visionTestOk = false;
    p.visionTestDetail = `图片不可读：${err.message || "没有说明原因"}`;
    writeLlm(data);
    return { ok: false, detail: p.visionTestDetail, config: publicLlm() };
  }
}

export async function chatWithImages(args) {
  const data = readLlm();
  const configured = Object.values(data.providers || {}).filter(
    (p) => p.apiKey && p.baseUrl && p.model,
  );
  const active = data.providers?.[data.active];
  const candidates = [];
  // 当前渠道优先；明确标成“仅文本”的不试。失败后自动换到其他已知视觉渠道。
  if (
    active &&
    active.vision !== "off" &&
    (active.vision === "on" || active.visionTestOk === true || !modelLooksTextOnly(active.model)) &&
    configured.includes(active)
  )
    candidates.push(active);
  for (const p of configured) {
    if (candidates.includes(p)) continue;
    if (p.visionTestOk === true || p.vision === "on" || modelLooksVisual(p.model)) candidates.push(p);
  }
  if (!candidates.length) {
    throw new Error("没有可用的视觉模型；请在设置里把支持图片的渠道标成“支持图片”");
  }

  const errors = [];
  for (const p of candidates) {
    try {
      return await chatWithProviderImages(p, args);
    } catch (err) {
      errors.push(`${p.name || p.id}：${err.message || "视觉调用失败"}`);
    }
  }
  throw new Error(errors.join("；"));
}

/** 出档链路要知道现在能不能真的调模型。 */
export function llmReady() {
  const data = readLlm();
  const p = data.providers[data.active];
  return Boolean(p && p.apiKey && p.baseUrl && p.model);
}
