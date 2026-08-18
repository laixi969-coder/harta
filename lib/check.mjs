import { readHunt, readReference } from "./industry.mjs";
import { charCount, fieldsFor, normalizeShellItem, specFor } from "./platform.mjs";

/* 交付前两道检查。文案是要被销售复制出去发的：
 * 踩红线和超字数都不是"提醒"，是当场翻车。 */

/** 《广告法》第 9 条绝对化用语。加"之一"不免责，所以只匹配词本身。 */
const ABSOLUTE_WORDS = [
  "最便宜", "最好", "最佳", "最优", "最强", "最低价", "最高",
  "第一品牌", "全国第一", "行业第一", "唯一", "首个", "首家",
  "顶级", "极致", "国家级", "冠军", "领先", "No.1", "NO.1", "终极",
  "绝对", "100%", "百分百", "史无前例", "空前绝后",
];

/** 做不到就不能写的承诺。除非写进合同并有赔付条款。 */
const PROMISE_WORDS = ["零增项", "无增项", "包过", "包就业", "保过", "稳赚", "零风险", "无风险", "零甲醛", "甲醛零排放"];

let redlineCache = null;

/** 行业包第 5 节的表格里，第一列就是禁用词。包改了这里自动跟着改。 */
function huntRedlines(hunt) {
  const text = readHunt(hunt);
  if (!text) return [];
  const section = text.match(/##\s*5\.[^\n]*\n([\s\S]*?)(?=\n##\s|\s*$)/);
  if (!section) return [];
  const words = [];
  for (const line of section[1].split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (!m) continue;
    const cell = m[1].trim();
    if (!cell || /^-+$/.test(cell) || cell === "禁用") continue;
    for (const w of cell.split(/[\/、,，]/)) {
      const clean = w.replace(/[（(].*?[)）]/g, "").trim();
      // 表格里有"承诺工期绝对达成"这种整句描述，太长的当描述不当词
      if (clean.length >= 2 && clean.length <= 10) words.push(clean);
    }
  }
  return [...new Set(words)];
}

function generalRedlines() {
  if (redlineCache) return redlineCache;
  const text = readReference("compliance.md");
  const extra = [];
  const m = text.match(/绝对化用语[\s\S]*?禁[：:]\s*([^\n]+(?:\n[^\n#]+)?)/);
  if (m) {
    for (const w of m[1].split(/[、,，\s]+/)) {
      const clean = w.trim();
      if (clean.length >= 1 && clean.length <= 10) extra.push(clean);
    }
  }
  redlineCache = [...new Set([...ABSOLUTE_WORDS, ...PROMISE_WORDS, ...extra])].filter((w) => w.length >= 2);
  return redlineCache;
}

export function checkRedline(text, hunt) {
  const words = [...generalRedlines(), ...huntRedlines(hunt)];
  const hit = words.filter((w) => String(text).includes(w));
  return [...new Set(hit)];
}

/**
 * 按字段查。分两档：
 * hard   = 超了发不出去，必须改
 * advise = 超了能发，但有代价（折叠、截断、图上读不清）
 */
export function checkLength(text, platform, fieldKey) {
  const spec = specFor(platform);
  const fields = fieldsFor(platform);
  const field = fields.find((f) => f.key === (fieldKey || fields[0].key));
  if (!field) return null;
  const n = charCount(text);
  const base = { n, field: field.label, platform: spec?.short || spec?.name || String(platform) };
  if (field.limit && n > field.limit) {
    return { ...base, level: "hard", max: field.limit, why: field.note || "平台硬限制" };
  }
  if (field.advise && n > field.advise) {
    return { ...base, level: "advise", max: field.advise, why: field.note || "超了能发，但有代价" };
  }
  return null;
}

/**
 * 整份档过一遍。返回给界面用的结果：
 * { redline:[{where,text,words}], length:[{where,text,n,max,platform}], note }
 */
export function checkPack(pack, hunt) {
  const redline = [];
  const length = [];

  for (const [group, lines] of Object.entries(pack.copies || {})) {
    for (const line of lines) {
      const words = checkRedline(line, hunt);
      if (words.length) redline.push({ where: group, text: line, words });
    }
  }
  for (const [platform, items] of Object.entries(pack.shells || {})) {
    for (const raw of items || []) {
      const item = normalizeShellItem(raw);
      if (!item) continue;
      for (const field of fieldsFor(platform)) {
        const text = item[field.key];
        if (!text) continue;
        const words = checkRedline(text, hunt);
        if (words.length) redline.push({ where: `${platform} · ${field.label}`, text, words });
        const over = checkLength(text, platform, field.key);
        if (over) length.push({ where: `${platform} · ${field.label}`, text, ...over });
      }
    }
  }

  // 发不出去的排前面，能发但有代价的排后面
  length.sort((a, b) => (a.level === "hard" ? -1 : 1) - (b.level === "hard" ? -1 : 1));
  return {
    redline,
    length,
    note: "只有标「发不出去」的是硬限制。其余是建议值，以各平台投放后台为准。",
    checkedAt: new Date().toISOString().slice(0, 10),
  };
}
