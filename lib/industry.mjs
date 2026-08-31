import fs from "node:fs";
import path from "node:path";

/* 行业包是运行时数据，不是代码。改包直接改 vendor/hiccai-pitch/industries/*.md，
 * 不用动这里。加一个包就多一个猎场。 */

/* 包有两个来源：
 * vendor/  是上游 hiccai-pitch 仓库带来的，策展过的，只读
 * data/    是这台机器上遇到新行业现场长出来的，会被覆盖、会被你手改
 * 同名时 vendor 赢：手写的包永远压过机器长的。 */
const vendorDir = () => path.join(process.cwd(), "vendor", "hiccai-pitch", "industries");
const grownDir = () => path.join(process.cwd(), "data", "industries");
const refDir = () => path.join(process.cwd(), "vendor", "hiccai-pitch", "references");

function namesIn(d) {
  try {
    return fs
      .readdirSync(d)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

/** 猎场名要当文件名用，是外部输入。只放行中英数字和少数连接符。 */
export function safeHuntName(raw) {
  const name = String(raw || "").trim().replace(/\s+/g, "");
  if (!name || name.length > 24) return "";
  if (!/^[\u4e00-\u9fa5A-Za-z0-9·\-—+&]+$/.test(name)) return "";
  if (name.startsWith("_") || name.includes("..")) return "";
  return name;
}

export function huntSource(hunt) {
  const name = safeHuntName(hunt);
  if (!name) return null;
  if (fs.existsSync(path.join(vendorDir(), `${name}.md`))) return "策展";
  if (fs.existsSync(path.join(grownDir(), `${name}.md`))) return "现场生成";
  return null;
}

/** 猎场就是行业包的文件名。两处合并，去重。 */
export function listHunts() {
  return [...new Set([...namesIn(vendorDir()), ...namesIn(grownDir())])].sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN"),
  );
}

export function hasHunt(hunt) {
  return listHunts().includes(String(hunt || ""));
}

/** 整包原文喂给模型。不解析 markdown：包的结构会变，解析器会烂。 */
export function readHunt(hunt) {
  const name = safeHuntName(hunt);
  if (!name) return "";
  for (const d of [vendorDir(), grownDir()]) {
    const file = path.join(d, `${name}.md`);
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  return "";
}

/**
 * 高风险行业可以在行业包第 0 节声明每次出档都必须摆在台面上的边界。
 * 只解析「- 【标签】正文」这一种显式格式，不从散文里猜规则。
 * 这样医疗、金融等行业可以各自在包里维护边界，检查器不用硬编码整段行业知识。
 */
export function huntGuardrails(hunt) {
  const text = readHunt(hunt);
  if (!text) return [];
  const section = text.match(/##\s*0\.[^\n]*\n([\s\S]*?)(?=\n##\s*1\.)/);
  if (!section) return [];
  return section[1]
    .split("\n")
    .map((line) => line.match(/^\s*-\s*【([^】]+)】\s*(.+?)\s*$/))
    .filter(Boolean)
    .map((m) => ({ label: m[1].trim(), text: m[2].trim() }))
    .filter((row) => row.label && row.text);
}

/** 现场长出来的包存这里。vendor 是上游的，不往里写。 */
export function writeGrownHunt(hunt, markdown) {
  const name = safeHuntName(hunt);
  if (!name) throw new Error("这个行业名不能当文件名");
  fs.mkdirSync(grownDir(), { recursive: true });
  fs.writeFileSync(path.join(grownDir(), `${name}.md`), markdown.trim() + "\n");
  return name;
}

export function readTemplate() {
  const file = path.join(vendorDir(), "_template.md");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

export function readReference(name) {
  const file = path.join(refDir(), name);
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

export function readSpecs() {
  try {
    return JSON.parse(readReference("platform-specs.json") || "{}");
  } catch {
    return {};
  }
}

/** 包头写着生成日期，超 90 天的钩子公式库该重新抽样。出档时如实告诉销售。 */
export function huntAge(hunt) {
  const text = readHunt(hunt);
  const m = text.match(/生成日期[：:]\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const days = Math.floor((Date.now() - new Date(m[1]).getTime()) / 86400000);
  return { madeAt: m[1], days, stale: days > 90 };
}
