import { readHunt } from "./industry.mjs";
import { packAsSent } from "./pack-edits.mjs";
import { charCount, fieldsFor, normalizeShellItem, specFor } from "./platform.mjs";

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

function hits(body, words) {
  return [...new Set(words.filter((w) => body.includes(w) && !isNegated(body, w)))];
}

/** 拦死的那一档：确凿的违法宣称，无论什么语境都不该出现在投放素材里。 */
export function checkRedline(text, hunt) {
  return hits(String(text), [...generalRedlines(), ...huntRedlines(hunt)]);
}

/** 看一眼的那一档：不拦，只把句子摆出来让销售自己判断。跟猎场无关，这些词在哪行都两可。 */
export function checkWatch(text) {
  return hits(String(text), WATCH_WORDS);
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
 * { redline:[{where,text,words}], length:[{where,text,n,max,platform}], note }
 */
export function checkPack(pack, hunt) {
  const redline = [];
  const watch = [];
  const hints = [];
  const length = [];

  // 踩了红线的那句不用再提醒看一眼，已经要改了
  const scan = (where, text) => {
    const hint = checkStageHint(text);
    if (hint) hints.push({ where, text, hint });
    const words = checkRedline(text, hunt);
    if (words.length) return redline.push({ where, text, words });
    const soft = checkWatch(text);
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

  // 发不出去的排前面，能发但有代价的排后面
  length.sort((a, b) => (a.level === "hard" ? -1 : 1) - (b.level === "hard" ? -1 : 1));
  return {
    redline,
    watch,
    hints,
    length,
    note: "标「红线」和「发不出去」的必须改。「看一眼」是这句里有个两可的词，机器判不了语境，你自己定。字数建议值以各平台投放后台为准。",
    checkedAt: new Date().toISOString().slice(0, 10),
  };
}
