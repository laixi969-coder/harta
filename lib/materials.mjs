import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { IncomingForm } from "formidable";
// pdf-parse 的包入口在 ESM 测试环境会误跑它自己的示例文件，直取无副作用的解析实现。
import pdf from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import sharp from "sharp";
import { workspaceId } from "./auth.mjs";
import { chat, chatWithImages, llmReady } from "./llm.mjs";
import { fetchClientPage } from "./recon.mjs";
import { transcribeVideo } from "./transcribe.mjs";
import { INPUT_LIMITS } from "./input-limits.mjs";

const execFileAsync = promisify(execFile);
const MAX_FILE = 60 * 1024 * 1024;
const MAX_TOTAL = 120 * 1024 * 1024;
/* 份数放宽到 20：分析提示词是固定预算按份数均分（buildSourceCorpus），
 * 文件多了每份摘录变短，上下文不会爆。真正防滥用的是单文件和合计的体积上限。 */
const MAX_FILES = 20;
const MAX_LINKS = 20;
const MAX_TEXT = 18000;
const ORPHAN_BATCH_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const TEXT_EXTS = new Set([".txt", ".md", ".csv", ".json", ".html", ".htm"]);
const DOC_EXTS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".xlsx",
  ".xls",
  ".odt",
  ".rtf",
]);
const ALLOWED_EXTS = new Set([
  ...IMAGE_EXTS,
  ...VIDEO_EXTS,
  ...TEXT_EXTS,
  ...DOC_EXTS,
]);

const cleanText = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function rootFor(email) {
  const dir = path.join(process.cwd(), "data", "materials", workspaceId(email));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function batchDir(email, batchId) {
  return path.join(rootFor(email), batchId);
}

export function cleanupStaleMaterialBatches(email, now = Date.now(), ttlMs = ORPHAN_BATCH_TTL_MS) {
  const root = rootFor(email);
  const workspaceFile = path.join(process.cwd(), "data", "workspaces", `${workspaceId(email)}.json`);
  let referenced = new Set();
  try {
    const workspace = JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
    referenced = new Set((workspace.customers || []).map((c) => c.materialBatchId).filter(Boolean));
  } catch {
    // 还没有工作区时，本来就没有已引用的资料批次。
  }
  for (const name of fs.readdirSync(root)) {
    if (!/^m-\d+-[a-f0-9]{8}$/.test(name) || referenced.has(name)) continue;
    const dir = path.join(root, name);
    let createdAt = fs.statSync(dir).mtimeMs;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
      const parsed = Date.parse(manifest.createdAt || "");
      if (Number.isFinite(parsed)) createdAt = parsed;
    } catch {
      // 半截批次没有清单时按目录时间判断。
    }
    if (now - createdAt > ttlMs) fs.rmSync(dir, { recursive: true, force: true });
  }
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function fieldText(fields, key) {
  const row = first(fields[key]);
  return String(row?.value ?? row ?? "");
}

function safeName(name) {
  return (
    path
      .basename(String(name || "资料"))
      .replace(/[\u0000-\u001f]/g, "")
      .slice(0, 120) || "资料"
  );
}

function parseJsonObject(value) {
  const raw = String(value || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const a = body.indexOf("{");
  const b = body.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("模型没有返回可读取的资料梳理");
  return JSON.parse(body.slice(a, b + 1));
}

function parseAnalysisObject(value) {
  const parsed = parseJsonObject(value);
  const hasContent =
    String(parsed?.overview || parsed?.suggestedPitch || "").trim() ||
    ["offer", "audience", "proof", "risks", "missing", "sourceNotes"].some(
      (key) => Array.isArray(parsed?.[key]) && parsed[key].length > 0,
    );
  if (!hasContent) throw new Error("模型返回了空的资料梳理");
  return parsed;
}

function normalizeAnalysis(raw, warning = "") {
  const list = (value, n = 6) =>
    (Array.isArray(value) ? value : [])
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, n);
  return {
    overview: String(raw?.overview || "").trim(),
    suggestedPitch: String(raw?.suggestedPitch || "").trim(),
    offer: list(raw?.offer),
    audience: list(raw?.audience),
    proof: list(raw?.proof),
    risks: list(raw?.risks),
    missing: list(raw?.missing),
    sourceNotes: Array.isArray(raw?.sourceNotes)
      ? raw.sourceNotes
          .map((x) => ({
            id: String(x?.id || ""),
            summary: String(x?.summary || "").trim(),
          }))
          .filter((x) => x.id && x.summary)
      : [],
    warning,
  };
}

function withEngine(analysis, result, mode) {
  analysis.engine = {
    providerId: String(result?.providerId || ""),
    providerName: String(result?.providerName || ""),
    model: String(result?.model || ""),
    mode,
    visualsAvailable: Number(result?.visualsAvailable || 0),
    visualsSent: Number(result?.visualsSent || 0),
  };
  return analysis;
}

async function imageForModel(file) {
  const data = await sharp(file)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78 })
    .toBuffer();
  return { mime: "image/jpeg", data: data.toString("base64") };
}

async function videoFrames(file, tempDir) {
  const pattern = path.join(tempDir, "frame-%02d.jpg");
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      "fps=1/12,scale='min(1280,iw)':-2",
      "-frames:v",
      "6",
      "-q:v",
      "4",
      pattern,
    ]);
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("当前机器缺少 FFmpeg，暂时不能读取视频画面");
    throw new Error("视频画面读取失败，可能是编码不受支持或文件已损坏");
  }
  return fs
    .readdirSync(tempDir)
    .filter((name) => /^frame-\d+\.jpg$/.test(name))
    .sort()
    .slice(0, 6)
    .map((name) => path.join(tempDir, name));
}

async function pdfFrames(file, tempDir) {
  const prefix = path.join(tempDir, "page");
  await execFileAsync("pdftoppm", [
    "-f",
    "1",
    "-l",
    "4",
    "-jpeg",
    "-scale-to",
    "1280",
    file,
    prefix,
  ]);
  return fs
    .readdirSync(tempDir)
    .filter((name) => /^page-\d+\.jpg$/.test(name))
    .sort()
    .slice(0, 4)
    .map((name) => path.join(tempDir, name));
}

async function readPdf(file, tempDir, kind = "PDF") {
  const got = await pdf(fs.readFileSync(file));
  const text = cleanText(got.text).slice(0, MAX_TEXT);
  let frames = [];
  try {
    frames = await pdfFrames(file, tempDir);
  } catch {
    // 正文已经读到时，页图只是一层补充；缺少本机 PDF 渲染器不该让整份上传失败。
  }
  const images = [];
  for (const frame of frames) images.push(await imageForModel(frame));
  const detail = [
    text && `已读取 ${got.numpages || ""} 页正文`,
    images.length && `取了 ${images.length} 页画面`,
  ]
    .filter(Boolean)
    .join("，");
  return { kind, text, note: detail || "没有抽取到正文或页图", images };
}

async function officeToPdf(file, tempDir) {
  try {
    await execFileAsync("libreoffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      tempDir,
      file,
    ]);
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("当前机器缺少 LibreOffice，暂时不能读取这类 Office 文档");
    throw new Error("Office 文档转换失败，文件可能已损坏或带有密码");
  }
  const pdfFile = fs
    .readdirSync(tempDir)
    .find((name) => path.extname(name).toLowerCase() === ".pdf");
  if (!pdfFile) throw new Error("文档转换后没有生成可读取的 PDF");
  return path.join(tempDir, pdfFile);
}

async function extractFile(file, storedPath, tempDir) {
  const ext = path.extname(file.originalFilename || storedPath).toLowerCase();
  if (!ALLOWED_EXTS.has(ext))
    throw new Error(`${file.originalFilename}：暂不支持这种格式`);

  if (ext === ".pdf") {
    return readPdf(storedPath, tempDir, "PDF");
  }
  if (ext === ".docx") {
    const got = await mammoth.extractRawText({ path: storedPath });
    const text = cleanText(got.value).slice(0, MAX_TEXT);
    return {
      kind: "Word",
      text,
      note: text ? "已读取 Word 正文" : "没有抽取到正文",
    };
  }
  if (
    [".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".rtf"].includes(ext)
  ) {
    const converted = await officeToPdf(storedPath, tempDir);
    return readPdf(
      converted,
      tempDir,
      ext.includes("ppt") ? "演示文稿" : ext.includes("xls") ? "表格" : "文档",
    );
  }
  if (TEXT_EXTS.has(ext)) {
    const text = cleanText(fs.readFileSync(storedPath, "utf8")).slice(
      0,
      MAX_TEXT,
    );
    return { kind: "文本", text, note: `已读取 ${text.length} 字` };
  }
  if (IMAGE_EXTS.has(ext)) {
    const image = await imageForModel(storedPath);
    return { kind: "图片", text: "", note: "已读取图片画面", images: [image] };
  }
  if (VIDEO_EXTS.has(ext)) {
    const frames = await videoFrames(storedPath, tempDir);
    const images = [];
    for (const frame of frames) images.push(await imageForModel(frame));
    let speech = { text: "", engine: "", warning: "", noAudio: false };
    try {
      speech = await transcribeVideo(storedPath, tempDir);
    } catch (err) {
      speech.warning = err.message || "语音转写没有完成";
    }
    const speechNote = speech.noAudio
      ? "没有音轨"
      : speech.text
        ? `已用${speech.engine}完成语音转写`
        : `语音未转成文字：${speech.warning || "没有识别到人声"}`;
    return {
      kind: "视频",
      text: speech.text ? `【视频语音转写】\n${speech.text}` : "",
      transcript: speech.text || "",
      note: `已抽取 ${images.length} 个关键画面；${speechNote}`,
      warning: speech.warning || "",
      images,
    };
  }
  throw new Error(`${file.originalFilename}：暂不支持这种格式`);
}

export function buildSourceCorpus(sources, maxChars = 42000) {
  const rows = Array.isArray(sources) ? sources : [];
  if (!rows.length) return "";
  const budget = Math.max(400, Math.floor(Number(maxChars) || 0));
  const perSource = Math.max(240, Math.floor(budget / rows.length) - 80);
  return rows
    .map((s) => {
      const text = String(s?.text || "").trim() || "（画面见随附图片）";
      return `【${s?.id || "资料"}｜${s?.name || "未命名"}｜${s?.kind || "资料"}】\n${text.slice(0, perSource)}`;
    })
    .join("\n\n")
    .slice(0, budget);
}

function analysisPrompt(sources) {
  const corpus = buildSourceCorpus(sources);
  return `
你在给销售建客户档案。只依据交给你的资料做梳理，不补写资料里没有的事实。
图片和视频帧会按资料均衡选取后附在文字后面。视频如果带有“视频语音转写”，可以把它当作音轨证据；
没有转写时只能依据关键画面，不能声称听过视频里说了什么。

资料：
${corpus}

只输出 JSON：
{
  "overview": "用 2 到 4 句说清这家公司/项目在卖什么、怎么表达自己；资料不足就直说",
  "suggestedPitch": "可放进客户档案的一句话卖点；没有依据就留空",
  "offer": ["产品、服务或方案"],
  "audience": ["资料明确提到的客户/使用者；不要猜"],
  "proof": ["资质、案例、数据、承诺等可核验依据"],
  "risks": ["表达矛盾、合规风险、信息模糊处；不要上升成经营诊断"],
  "missing": ["出营销判断前还缺哪些关键资料"],
  "sourceNotes": [{"id":"资料 id", "summary":"这份资料贡献了什么信息，一句话"}]
}`.trim();
}

async function analyzeSources(sources, images) {
  const hasText = sources.some((s) => String(s.text || "").trim());
  if (!hasText && !images.length) {
    return normalizeAnalysis(
      {
        overview: "资料已归档，但没有抽取到可供梳理的正文或画面。",
        missing: ["请换一份可公开读取的链接，或上传未加密、内容完整的文件"],
        sourceNotes: sources.map((s) => ({ id: s.id, summary: s.note })),
      },
      "没有调用模型：资料中没有可读取的内容",
    );
  }
  if (!llmReady()) {
    return normalizeAnalysis(
      {
        overview:
          "资料已经归档并完成正文抽取；管理员配置模型后，才能继续做结构化梳理。",
        missing: ["当前没有可用的分析模型"],
        sourceNotes: sources.map((s) => ({ id: s.id, summary: s.note })),
      },
      "未调用模型",
    );
  }
  const prompt = analysisPrompt(sources);
  if (images.length) {
    try {
      const answer = await chatWithImages({
        system: "你只输出 JSON。",
        user: prompt,
        images,
        returnMeta: true,
        validate: parseAnalysisObject,
      });
      return withEngine(
        normalizeAnalysis(parseAnalysisObject(answer.text)),
        answer,
        "图片 / 画面读取与资料梳理",
      );
    } catch (err) {
      if (!hasText) {
        return normalizeAnalysis(
          {
            overview: "资料已经归档，但当前模型没有成功读取图片或视频画面。",
            missing: ["换用支持视觉识别的模型后重新分析"],
            sourceNotes: sources.map((s) => ({ id: s.id, summary: s.note })),
          },
          `视觉分析未完成：${err.message}`,
        );
      }
      const answer = await chat({
        system: "你只输出 JSON。",
        user: `${prompt}\n\n注意：当前模型未能读取画面，只分析有正文的资料。`,
        maxTokens: 3000,
        returnMeta: true,
      });
      return withEngine(
        normalizeAnalysis(
          parseAnalysisObject(answer.text),
          `图片/视频画面未纳入：${err.message}`,
        ),
        answer,
        "仅正文梳理（画面读取失败）",
      );
    }
  }
  const answer = await chat({
    system: "你只输出 JSON。",
    user: prompt,
    maxTokens: 3000,
    returnMeta: true,
  });
  return withEngine(
    normalizeAnalysis(parseAnalysisObject(answer.text)),
    answer,
    "正文读取与资料梳理",
  );
}

export async function receiveAndAnalyzeMaterials(req, email) {
  cleanupStaleMaterialBatches(email);
  const batchId = `m-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const dir = batchDir(email, batchId);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const form = new IncomingForm({
      uploadDir: dir,
      keepExtensions: true,
      maxFiles: MAX_FILES,
      maxFileSize: MAX_FILE,
      maxTotalFileSize: MAX_TOTAL,
      allowEmptyFiles: false,
      filename: (_name, ext) =>
        `${crypto.randomBytes(10).toString("hex")}${String(ext || "").toLowerCase()}`,
    });
    const [fields, files] = await form.parse(req);
    let links = [];
    try {
      links = JSON.parse(fieldText(fields, "links") || "[]");
    } catch {
      throw new Error("网页链接格式不对");
    }
    if (!Array.isArray(links)) throw new Error("网页链接格式不对");
    if (links.length > MAX_LINKS) throw new Error(`网页链接最多 ${MAX_LINKS} 条`);
    links = [...new Set(links
      .map((x) => String(x || "").trim())
      .filter(Boolean))];
    if (links.some((link) => link.length > INPUT_LIMITS.materialUrl)) {
      throw new Error(`单条网页链接最多 ${INPUT_LIMITS.materialUrl} 个字符`);
    }
    const uploads = Object.values(files).flat().filter(Boolean);
    if (!uploads.length && !links.length)
      throw new Error("请先选择文件或加入网页链接");

    const sources = [];
    const images = [];
    for (const file of uploads) {
      const name = safeName(file.originalFilename);
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) throw new Error(`${name}：暂不支持这种格式`);
      const id = `s${sources.length + 1}`;
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harta-video-"));
      try {
        const got = await extractFile(file, file.filepath, tempDir);
        sources.push({
          id,
          name,
          kind: got.kind,
          mime: file.mimetype || "application/octet-stream",
          size: file.size || 0,
          note: got.note,
          text: got.text || "",
          transcript: got.transcript || "",
          warning: got.warning || "",
          storedName: path.basename(file.filepath),
        });
        images.push(
          ...(got.images || []).map((image, index) => ({
            ...image,
            label: `${name} · 画面 ${index + 1}`,
          })),
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

    for (const link of links) {
      const id = `s${sources.length + 1}`;
      const got = await fetchClientPage(link);
      sources.push({
        id,
        name: got.ok ? got.url : link,
        kind: "网页",
        mime: "text/html",
        size: 0,
        note: got.ok
          ? `已读取网页正文 ${got.text.length} 字`
          : `网页未读到：${got.why}`,
        text: got.ok ? String(got.text || "").slice(0, MAX_TEXT) : "",
        url: got.ok ? got.url : link,
      });
    }

    const analysis = await analyzeSources(sources, images);
    const manifest = {
      id: batchId,
      createdAt: new Date().toISOString(),
      sources,
      analysis,
    };
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    return publicBatch(manifest);
  } catch (err) {
    // 解析到一半失败的批次没有客户会引用，立即清掉，避免大视频留下孤儿文件。
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function publicBatch(batch) {
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    sources: (batch.sources || []).map(
      ({ text, storedName, ...source }) => source,
    ),
    analysis: batch.analysis,
  };
}

export function readMaterialBatch(email, batchId) {
  const id = String(batchId || "");
  if (!/^m-\d+-[a-f0-9]{8}$/.test(id)) return null;
  const file = path.join(batchDir(email, id), "manifest.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function editableAnalysisList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}格式不对`);
  const rows = value.map((item) => String(item || "").trim()).filter(Boolean);
  if (rows.length > 12) throw new Error(`${label}最多 12 条`);
  if (rows.some((row) => row.length > 500)) throw new Error(`${label}每条最多 500 字`);
  if (rows.join("\n").length > INPUT_LIMITS.analysisGroup) {
    throw new Error(`${label}合计最多 ${INPUT_LIMITS.analysisGroup.toLocaleString("zh-CN")} 字`);
  }
  return rows;
}

/** 保存人工核对后的资料梳理。原始抽取正文、转写、模型与告警元数据都不让前端覆盖。 */
export function updateMaterialAnalysis(email, batchId, input = {}) {
  const batch = readMaterialBatch(email, batchId);
  if (!batch) throw new Error("这批资料不存在或不属于当前账号，请重新读取");
  const overview = String(input.overview || "").trim();
  const suggestedPitch = String(input.suggestedPitch || "").trim();
  if (overview.length > INPUT_LIMITS.analysisOverview) {
    throw new Error(`资料总览最多 ${INPUT_LIMITS.analysisOverview.toLocaleString("zh-CN")} 字`);
  }
  if (suggestedPitch.length > INPUT_LIMITS.pitch) {
    throw new Error(`档案卖点最多 ${INPUT_LIMITS.pitch} 字`);
  }
  if (!Array.isArray(input.sourceNotes)) throw new Error("逐份资料摘要格式不对");
  const submittedNotes = new Map(
    input.sourceNotes.map((note) => [String(note?.id || ""), String(note?.summary || "").trim()]),
  );
  const previousNotes = new Map(
    (batch.analysis?.sourceNotes || []).map((note) => [String(note.id || ""), String(note.summary || "").trim()]),
  );
  const sourceNotes = (batch.sources || []).map((source) => {
    const summary = submittedNotes.get(source.id) ?? previousNotes.get(source.id) ?? source.note ?? "";
    if (summary.length > INPUT_LIMITS.analysisSourceNote) {
      throw new Error(`${source.name || "逐份资料摘要"}最多 ${INPUT_LIMITS.analysisSourceNote.toLocaleString("zh-CN")} 字`);
    }
    return { id: source.id, summary };
  });
  batch.analysis = {
    ...(batch.analysis || {}),
    overview,
    suggestedPitch,
    offer: editableAnalysisList(input.offer, "产品 / 服务"),
    audience: editableAnalysisList(input.audience, "资料明确的人群"),
    proof: editableAnalysisList(input.proof, "可核验依据"),
    risks: editableAnalysisList(input.risks, "待核对"),
    missing: editableAnalysisList(input.missing, "还缺什么"),
    sourceNotes,
    editedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(batchDir(email, batch.id), "manifest.json"),
    JSON.stringify(batch, null, 2) + "\n",
  );
  return publicBatch(batch);
}

export function materialTextForPack(batch) {
  if (!batch) return "";
  const analysis = batch.analysis || {};
  const hasExtractedText = (batch.sources || []).some(
    (s) => String(s.text || "").trim().length >= 20,
  );
  const hasVisualEvidence =
    (batch.sources || []).some(
      (s) =>
        s.kind === "图片" ||
        s.kind === "视频" ||
        s.kind === "PDF" ||
        s.kind === "演示文稿",
    ) &&
    !analysis.warning &&
    String(analysis.overview || "").trim().length >= 30;
  // “已归档但没读到”不能被出档引擎当成客户证据，否则会凭一条失败提示升级成快档。
  if (!hasExtractedText && !hasVisualEvidence) return "";
  const head = [
    analysis.overview && `资料总览：${analysis.overview}`,
    analysis.offer?.length && `产品/服务：${analysis.offer.join("；")}`,
    analysis.audience?.length &&
      `资料明确提到的人群：${analysis.audience.join("；")}`,
    analysis.proof?.length && `可核验依据：${analysis.proof.join("；")}`,
    analysis.risks?.length && `待核对：${analysis.risks.join("；")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const body = (batch.sources || [])
    .filter((s) => s.text)
    .map((s) => `【${s.name}】\n${s.text}`)
    .join("\n\n");
  return `${head}\n\n${body}`.trim().slice(0, 30000);
}
