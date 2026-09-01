import { huntGuardrails, readHunt } from "./industry.mjs";
import { packAsSent } from "./pack-edits.mjs";
import { charCount, fieldsFor, normalizeShellItem, specFor } from "./platform.mjs";
import { judgeQuality } from "./quality.mjs";
import { today } from "./today.mjs";

/* 交付前两道检查。文案是要被销售复制出去发的：
 * 踩红线和超字数都不是"提醒"，是当场翻车。 */

/* 《广告法》第 9 条绝对化用语。加"之一"不免责，所以匹配词本身。
 *
 * 只收「几乎必然是在宣称」的词。像「第一」「绝对」「唯一」这种单字词，
 * 在中文里到处都是（第一家、绝对不会、唯一的办法），单收会把正常句子全拦下来。
 * 宁可漏一条让人抓到，不可误报一次把整个检查废掉。 */
const ABSOLUTE_WORDS = [
  "最便宜", "最佳", "最优", "最强", "最低价", "最高级",
  "第一品牌", "全国第一", "行业第一", "排名第一", "销量第一",
  "唯一指定", "唯一选择", "全网唯一", "首个", "首家",
  "顶级", "极致", "国家级", "冠军", "领先", "No.1", "NO.1", "终极",
  "绝对安全", "绝对有效", "绝对领先", "100%", "百分百", "史无前例", "空前绝后",
];

/** 做不到就不能写的承诺。除非写进合同并有赔付条款。 */
const PROMISE_WORDS = ["零增项", "无增项", "包过", "包就业", "保过", "稳赚", "零风险", "无风险", "零甲醛", "甲醛零排放"];

/* 行业包第 5 节那张表里，禁用的那一列写的不全是"词"：
 * 有「参数虚标（续航、油耗、加速）」这种带括号的举例，切开之后剩下"续航""油耗"；
 * 有「承诺升学/提分/通过率」这种带前缀的说法，切开之后剩下"提分""通过率"。
 * 这些碎片在正常文案里到处都是，收进来就是误报机器。
 * 括号里的内容在切之前就整段去掉，剩下的碎片再过一遍这份名单。 */
const HUNT_NOISE = [
  "配置", "演出", "活动", "服务", "效果", "专业", "健康", "正品", "口碑", "价格", "品牌",
  "唯一", "第一", "第一家", "第一个", "续航", "油耗", "加速", "重量", "品牌历史", "营业额",
];

/* 中间档：这些词单独出现时不一定在宣称，但也不是没事。
 * 「安全」可能是在讲麻醉归谁管，也可能是在打包票；「回本周期」可能是在教人怎么问，
 * 也可能是在承诺。机器判不了语境，那就别判——降一档，把这句话摆给销售自己看。
 *
 * 拦错一次销售就不信这个检查了，漏一条被人抓到是罚款。中间档两头都不用赌：
 * 它不下结论，只说"这条里有个词你自己看一眼"。 */
const WATCH_WORDS = [
  // 「最好」在中文里绝大多数是副词：「最好提前问」「最好选在小长假前做」。
  // 当宣称用（「效果最好」）才违规，机器分不出来，所以只提示不拦。
  "最好",
  "安全", "无痛", "康复", "根治", "提分", "通过率", "成功率", "有效率",
  "客流", "收益", "月入", "回本周期", "销量", "美白", "生发", "权威", "疗效",
];

/* 医疗类猎场专有的结果词。
 * 《广告法》第 16 条禁医疗药品广告利用患者名义作证明，「我转阴了」「不疼了」
 * 这类话不管是不是真事都不能发。但它们在别的行业完全正常（「不疼了」在按摩店没问题），
 * 所以只在医疗猎场里查。整档检查会先按 MEDICAL_HARD 拦住；checkWatch 仍返回它们，
 * 供只调用提示接口的旧代码识别。 */
const MEDICAL_RESULT = [
  "转阴", "痊愈", "治好", "见效", "指标降", "不疼了", "好利索", "恢复得很好",
  "我好了", "全好了", "根除", "没再犯", "白做了", "不用去医院",
];

/* 医疗广告里不存在「看语境也许能用」的那一批。
 * 这些要么是法律直接禁止的疗效/推荐证明，要么是处方药公众互联网推广，
 * 要么会把 HPV、靶向治疗写成一个能在线承诺的结果。行业包第 5 节仍是主库；
 * 这里是独立安全网，避免表格里的分类词被通用解析器当成说明文字丢掉。 */
const MEDICAL_HARD = [
  "治愈率", "有效率", "成功率", "患者证言", "专家推荐", "医生推荐", "药师推荐",
  ...MEDICAL_RESULT,
  "无副作用", "不良反应为零", "无需就医", "免处方", "代开处方",
  "清除HPV", "根治HPV", "HPV转阴", "转阴率", "疫苗治疗HPV", "疫苗促转阴",
  "靶向药", "抗肿瘤药", "处方药", "PD-1", "盲试靶向药", "不做检测也能用",
  "人人适用", "比化疗好", "替代化疗", "点击买药", "加微购药", "私信买药", "联系买药",
];

/* 这一组不是「宣称被否定就能放行」，而是不能出现在公众投放成品里的产品/购买入口。
 * 例如「不要错过靶向药」不能因为前面有「不要」就绕开。 */
const MEDICAL_NO_PUBLIC = [
  "靶向药", "抗肿瘤药", "处方药", "PD-1",
  "点击买药", "加微购药", "私信买药", "联系买药",
];

/* 不是看到就违法，但已经越过普通营销文案能自己判断的边界。
 * 尤其停换药、剂量和联合用药，必须交回医生/药师，不能让模型顺口给建议。 */
const MEDICAL_WATCH = ["停药", "减量", "加量", "换药", "剂量", "联合用药", "耐药"];

const MEDICAL_SENSITIVE_FIELD =
  /(病历|病史|诊断|症状|用药史|过敏史|检查(?:报告|结果)|检验(?:报告|结果)|基因(?:报告|结果|突变)|HPV.{0,4}(?:型别|结果|阳性|阴性|报告)|身份证)/i;

const medicalCache = new Map();
function isMedicalHunt(hunt) {
  const key = String(hunt || "");
  if (!medicalCache.has(key)) {
    medicalCache.set(key, /医疗广告|药品广告|处方药|执业医师|执业兽医|诊疗|患者/.test(readHunt(key)));
  }
  return medicalCache.get(key);
}

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
    // 先去掉加粗号和括号举例，再切。切完再去括号就晚了：切开的碎片括号是残的，去不掉。
    const cell = m[1].replace(/\*+/g, "").replace(/[（(][^)）]*[)）]?/g, "").trim();
    if (!cell || /^-+$/.test(cell) || cell === "禁用") continue;
    for (const w of cell.split(/[\/、,，]/)) {
      const clean = w.trim();
      // 表格里有"承诺工期绝对达成"这种整句描述，太长的当描述不当词；
      // "疗效承诺""患者证言"这类是在说一类说法，不是能直接 grep 的字面词
      const meta = /(承诺|证言|推荐|案例数|有效率)$/.test(clean);
      if (clean.length >= 2 && clean.length <= 10 && !meta && !HUNT_NOISE.includes(clean) && !WATCH_WORDS.includes(clean)) {
        words.push(clean);
      }
    }
  }
  return [...new Set(words)];
}

/* 原来还从 compliance.md 的散文里抓词，抓出「第一」「绝对」这种在中文里到处都是的单
 * 词，于是「第一家」「绝对不」全被当成违规。误报一次，销售就再也不信这个检查了。
 * 现在只用上面这份写死的词表，和行业包第 5 节那张真表格。文档改了要同步的是词表，
 * 不是让机器去猜散文。 */
function generalRedlines() {
  if (redlineCache) return redlineCache;
  redlineCache = [...new Set([...ABSOLUTE_WORDS, ...PROMISE_WORDS])];
  return redlineCache;
}

/* 文案明说「不是 X」的时候，X 不算踩线。
 *
 * 原来只看紧挨着的 6 个字，于是「开实体面馆哪有什么稳赚的事」被判踩线——
 * 否定词离得远一点就抓不到。改成看这个词所在的整个小句：句读之间只要出现否定，
 * 就算否定。这样「不是最便宜，是全城最低价」里，前半句放行、后半句照样拦。 */
const NEGATIONS = [
  "不是", "不算", "没有", "没什么", "并非", "而非", "绝非", "哪有", "哪来", "谈不上",
  "不存在", "不写", "不说", "禁止", "别说", "别想", "别信", "不能说", "不做", "不敢",
];
const CLAUSE_BREAK = /[，。！？；：、\n“”"]/;

function isNegated(text, word) {
  let from = 0;
  // 走完所有出现的地方，全都在否定里才算否定。
  // 原来这里走到头返回 false，等于"每一处都是否定"也判成踩线——整个否定检测是死的。
  let allNegated = false;
  for (;;) {
    const at = text.indexOf(word, from);
    if (at < 0) return allNegated;
    // 往回退到上一个句读，就在这一小句里找否定
    let head = 0;
    for (let i = at - 1; i >= 0; i -= 1) {
      if (CLAUSE_BREAK.test(text[i])) { head = i + 1; break; }
    }
    const clause = text.slice(head, at);
    if (!NEGATIONS.some((n) => clause.includes(n))) return false;
    allNegated = true;
    from = at + word.length;
  }
}

function containsWord(body, word) {
  if (word !== "处方药") return body.includes(word);
  let from = 0;
  for (;;) {
    const at = body.indexOf(word, from);
    if (at < 0) return false;
    // OTC 的规范中文名本身含「处方药」三个字，不能把「非处方药」误拦成 Rx。
    if (body[at - 1] !== "非") return true;
    from = at + word.length;
  }
}

function hits(body, words) {
  return [...new Set(words.filter((w) => containsWord(body, w) && !isNegated(body, w)))];
}

function compactMedical(text) {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\u2060._·\-‐‑‒–—―]+/g, "");
}

/** 医疗硬词额外做一次紧凑扫描，拦住空格、大小写和异体连字符拆词。 */
function compactMedicalHits(body, words) {
  const compact = compactMedical(body);
  return [...new Set(words.filter((word) => containsWord(compact, compactMedical(word))))];
}

/** 拦死的那一档：确凿的违法宣称，无论什么语境都不该出现在投放素材里。 */
export function checkRedline(text, hunt) {
  const body = String(text);
  const found = hits(body, [...generalRedlines(), ...huntRedlines(hunt)]);
  if (!isMedicalHunt(hunt)) return found;
  return [
    ...new Set([
      ...found,
      ...hits(body, MEDICAL_HARD),
      ...compactMedicalHits(body, MEDICAL_HARD),
      // 公众禁用词即使放在否定句里也不进成品，不能被通用否定逻辑豁免。
      ...compactMedicalHits(body, MEDICAL_NO_PUBLIC),
    ]),
  ];
}

/** 看一眼的那一档：不拦，只把句子摆出来让销售自己判断。 */
export function checkWatch(text, hunt) {
  const words = isMedicalHunt(hunt)
    ? [...WATCH_WORDS, ...MEDICAL_RESULT, ...MEDICAL_WATCH]
    : WATCH_WORDS;
  return hits(String(text), words);
}

/** 医疗健康信息是敏感个人信息，普通获客表单不该在第一步收。 */
export function checkSensitiveFields(fields, hunt) {
  if (!isMedicalHunt(hunt)) return [];
  return (Array.isArray(fields) ? fields : [])
    .map((text) => String(text || "").trim())
    .filter((text) => text && MEDICAL_SENSITIVE_FIELD.test(text))
    .map((text) => ({ where: "承接 · 表单", text, words: ["医疗健康敏感信息"] }));
}

/* 销售是直接复制这一栏发出去的。文案里混进「（镜头对着…）」这种拍摄提示，
 * 括号会跟着一起发出去。不是违规，是当场丢人，归「会有代价」那一档。 */
const STAGE_HINT = /[（(](镜头|画面|字幕|旁白|特写|近景|远景|配音|背景音|BGM|片头|片尾)[^)）]*[)）]/;

/** 这条文案里有没有混进拍摄提示。有就返回那一段原文。 */
export function checkStageHint(text) {
  const m = String(text).match(STAGE_HINT);
  return m ? m[0] : "";
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
 * { guardrails, redline, sensitive, watch, hints, length, note }
 */
export function checkPack(pack, hunt) {
  const guardrails = huntGuardrails(hunt);
  const redline = [];
  const sensitive = [];
  const watch = [];
  const hints = [];
  const length = [];

  // 踩了红线的那句不用再提醒看一眼，已经要改了
  const scan = (where, text) => {
    const hint = checkStageHint(text);
    if (hint) hints.push({ where, text, hint });
    const words = checkRedline(text, hunt);
    if (words.length) return redline.push({ where, text, words });
    const soft = checkWatch(text, hunt);
    if (soft.length) watch.push({ where, text, words: soft });
  };

  /* 查的是销售改完之后那一份，不是模型出的那一份。
   * 他把「先问清楚恢复期」改成「恢复期最短」就是踩线了，台子必须当场说。 */
  const sent = packAsSent(pack);
  for (const [group, lines] of Object.entries(sent.copies)) {
    for (const line of lines) scan(group, line);
  }
  for (const [platform, items] of Object.entries(sent.shells)) {
    for (const raw of items || []) {
      const item = normalizeShellItem(raw);
      if (!item) continue;
      for (const field of fieldsFor(platform)) {
        const text = item[field.key];
        if (!text) continue;
        scan(`${platform} · ${field.label}`, text);
        const over = checkLength(text, platform, field.key);
        if (over) length.push({ where: `${platform} · ${field.label}`, text, ...over });
      }
    }
  }

  // 分镜的口播和收口也是要拍出来发的话，同样得过一遍
  for (const [i, b] of (pack.boards || []).entries()) {
    const where = `分镜${i + 1}${b.platform ? ` · ${b.platform}` : ""}`;
    for (const t of [b.hook, b.close, ...(b.shots || []).map((s) => s.line)]) {
      if (t) scan(where, t);
    }
  }

  /* 承接里的第一屏、私信第一句和兑现物同样会发给人，不能只查上面的广告文案。
   * 表单另过一遍敏感信息闸门：这里的问题不是话术，而是收集动作本身。 */
  const landing = pack.landing || {};
  for (const [where, text] of [
    ["承接 · 第一屏", landing.firstScreen],
    ["承接 · 兑现物", landing.reward],
    ...((landing.form || []).map((text) => ["承接 · 表单", text])),
    ...((landing.firstTouch?.open || []).map((x) => [`承接 · ${x.from || "首触"}`, x.say])),
    ...((landing.firstTouch?.pushback || []).map((x) => ["承接 · 被推开怎么接", x.reply])),
    ...((landing.rewardOutline || []).map((text) => ["承接 · 兑现物目录", text])),
  ]) {
    if (text) scan(where, text);
  }
  sensitive.push(...checkSensitiveFields(landing.form, hunt));

  // 发不出去的排前面，能发但有代价的排后面
  length.sort((a, b) => (a.level === "hard" ? -1 : 1) - (b.level === "hard" ? -1 : 1));
  const quality = judgeQuality({ copies: sent.copies, shells: sent.shells });
  return {
    guardrails,
    redline,
    sensitive,
    watch,
    hints,
    length,
    quality,
    note: "标「红线」「发不出去」「质量过不了」的必须改。「看一眼」和「不像这个平台」是机器判不了语境，你自己定。字数建议值以各平台投放后台为准。",
    checkedAt: today(),
  };
}

/** 这些问题没有改掉之前，不能复制成品，也不能打开对外分享页。 */
export function hasHardBlock(checks) {
  const c = checks || {};
  return Boolean(
    (c.redline || []).length ||
      (c.sensitive || []).length ||
      (c.length || []).some((row) => row.level === "hard") ||
      (c.quality || []).some((row) => row.level === "hard"),
  );
}
