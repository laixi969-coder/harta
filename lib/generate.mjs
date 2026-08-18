import { chat, llmReady } from "./llm.mjs";
import { huntAge, readHunt, readReference, readTemplate, safeHuntName, writeGrownHunt } from "./industry.mjs";
import { fetchClientPage } from "./recon.mjs";
import { fieldsFor, normalizeShellItem, registerFor } from "./platform.mjs";
import { packFromHunt } from "./pack-from-hunt.mjs";
import { checkPack } from "./check.mjs";

/* 出档引擎。规矩来自 vendor/hiccai-pitch/SKILL.md：
 * 档位由证据决定，不由用户要求决定。没看过对方的东西就不许出诊断。 */

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 模型爱包 ```json 围栏，也爱在前后说两句。只取第一个完整对象。 */
export function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没返回 JSON");
  return JSON.parse(body.slice(start, end + 1));
}

const str = (v) => (typeof v === "string" ? v.trim() : "");
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** 收下模型给的东西之前先验一遍。缺件的档不如不出。 */
export function normalize(raw, { tier, customer }) {
  const out = {
    title: str(raw.title),
    gate: str(raw.gate),
    battlefields: list(raw.battlefields).slice(0, 2),
    testPath: str(raw.testPath),
    supply: str(raw.supply),
    honest: str(raw.honest),
    next: list(raw.next).slice(0, 4),
    demand: {
      who: str(raw.demand?.who),
      say: list(raw.demand?.say).slice(0, 6),
      search: list(raw.demand?.search).slice(0, 6),
      skip: list(raw.demand?.skip).slice(0, 5),
    },
    gaps: [],
    questions: [],
    landscape: str(raw.landscape),
    copies: {},
    breakdowns: [],
    shells: {},
  };

  if (Array.isArray(raw.gaps)) {
    out.gaps = raw.gaps
      .map((g) => ({
        name: str(g?.name),
        fact: str(g?.fact),
        cost: str(g?.cost),
        cause: str(g?.cause),
        verify: str(g?.verify),
      }))
      // 第五要素是硬性的：写不出验证动作的诊断，说明它基于推断，不许留下
      .filter((g) => g.name && g.fact && g.verify)
      .slice(0, 5);
  }

  if (Array.isArray(raw.questions)) {
    out.questions = raw.questions
      .map((q) => ({ ask: str(q?.ask), why: str(q?.why) }))
      .filter((q) => q.ask)
      .slice(0, 5);
  }

  if (raw.copies && typeof raw.copies === "object") {
    for (const [group, lines] of Object.entries(raw.copies)) {
      const kept = list(lines);
      if (str(group) && kept.length) out.copies[str(group)] = kept;
    }
  }

  if (Array.isArray(raw.breakdowns)) {
    out.breakdowns = raw.breakdowns
      .map((b) => ({ copy: str(b?.copy), why: str(b?.why) }))
      .filter((b) => b.copy && b.why)
      .slice(0, 3);
  }

  if (raw.shells && typeof raw.shells === "object") {
    for (const [plat, items] of Object.entries(raw.shells)) {
      const kept = (Array.isArray(items) ? items : []).map(normalizeShellItem).filter(Boolean);
      if (str(plat) && kept.length) out.shells[str(plat)] = kept;
    }
  }

  const copyCount = Object.values(out.copies).flat().length;
  const missing = [];
  if (!out.title) missing.push("标题");
  if (!out.gate) missing.push("闸门说明");
  if (!out.battlefields.length) missing.push("主战场");
  if (!out.demand.who) missing.push("该截的需求");
  if (!Object.keys(out.shells).length) missing.push("平台外壳");
  if (tier === "快档") {
    if (out.gaps.length < 3) missing.push("至少 3 条缺口");
    if (copyCount < 12) missing.push(`至少 12 条文案（只给了 ${copyCount} 条）`);
  } else {
    if (out.questions.length < 3) missing.push("至少 3 个提问");
    if (!out.landscape) missing.push("赛道格局");
    if (copyCount < 3) missing.push("3 条试探文案");
  }
  if (missing.length) throw new Error(`模型出的档缺件：${missing.join("、")}`);

  out.id = `p-${customer.id}-${Date.now()}`;
  out.createdAt = today();
  out.deliveredAt = today();
  out.sharePath = "";
  out.tier = tier;
  return out;
}

/** 一个内核，多个外壳。外壳不是同一句话改字数，是不同的字段和不同的语气。 */
function platformBrief(platforms) {
  const list = [...new Set(platforms.filter(Boolean))];
  if (!list.length) return "";
  return list
    .map((p) => {
      const r = registerFor(p);
      const fields = fieldsFor(p)
        .map((f) => {
          const cap = f.limit
            ? `硬限制约 ${f.limit} 字，超了发不出去`
            : f.advise
              ? `建议 ${f.advise} 字以内`
              : "不设上限";
          return `  - ${f.key}（${f.label}）：${cap}。${f.note}`;
        })
        .join("\n");
      return [
        `## ${p}`,
        r.scene ? `用户正在做什么：${r.scene}` : "",
        r.looks ? `素材必须像：${r.looks}` : "",
        r.warn ? `注意：${r.warn}` : "",
        r.conversion.length ? `收口方式：${r.conversion.join(" / ")}` : "",
        "字段：",
        fields,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

const SHARED_RULES = `
你是一位只做获客素材的资深操盘手，正在给一个潜在客户出一份提案。提案是写给这家客户看的，不是写给内部看的。

铁律，违反任何一条整份作废：
1. 绝不编造事实。没有的数据、年份、获奖、案例、客单价，一律不写。需要具体感就写场景和动作，不靠编数字。
2. 引用平台数字时写"约"，不写"严格"，并说明以投放后台为准。
3. 不用"赋能""抓手""闭环""生态位""高端""品质""匠心"这类空词。
4. 诊断必须具体到能被反驳。不能被反驳的判断都是废话。
5. 全篇至少一句真实的肯定；找不到就不夸，禁止硬夸。
6. 不碰账户结构、出价、定向，那是代运营的活。
7. 提案里不许出现"AI"两个字。
8. 主战场只选 1 到 2 个。冷启动同时铺四个平台等于每个都跑不出模型。
9. 只输出 JSON，不要任何解释文字，不要 markdown 围栏之外的话。
`.trim();

function fastPrompt({ customer, huntPack, material, compliance }) {
  return `
${SHARED_RULES}

这一份出【快档】：你已经看过这家客户自己的材料，可以出诊断。

# 客户
- 名称：${customer.name}
- 猎场：${customer.hunt}
- 城市：${customer.city || "未填"}
- 一句话卖点：${customer.pitch || "未填"}

# 这家客户自己的材料（你实际读到的，只能依据这里做具体陈述）
来源：${material.url}
"""
${material.text}
"""

对这份材料要字面理解：引用它说了什么是事实，把它升级成"这家生意实际怎么运转"是推断。
任何需要推断才成立的东西放进 next（待确认），绝不写进诊断，更不能写进你最用力的那个钩子。

# 行业包（这个猎场的方法层，钩子公式、焦虑源、诱饵、背书、红线、指标、平台都在里面）
"""
${huntPack}
"""

# 合规红线
"""
${compliance}
"""

# 要出的东西，严格按这个 JSON 结构返回
{
  "title": "提案标题，一句话，是判断不是口号，不出现客户名以外的专名",
  "gate": "一句话说明这份档的证据边界：你看过什么、没看过什么、哪些是赛道判断",
  "battlefields": ["主战场1", "主战场2"],
  "demand": {
    "who": "该截谁。一句话画出这个人的处境和决策阶段，具体到能照着投",
    "say": ["他会这么说的原话，4 到 6 条，口语，不是书面语"],
    "search": ["他在搜什么，4 到 6 条搜索词"],
    "skip": ["不该打谁，3 到 5 条，每条说明为什么这类人来了也不成交"]
  },
  "gaps": [
    {
      "name": "缺口名，4 到 6 字",
      "fact": "事实差：赛道普遍在做什么，客户真正怕的是什么",
      "cost": "代价换算：这个差距每天在吃掉什么",
      "cause": "根因归因：为什么改不动，往组织和指标上归",
      "verify": "客户 30 秒内能自己验证的动作。写不出就别写这条缺口"
    }
  ],
  "copies": {
    "A 组名": ["文案条，每条一句话，能直接复制发出去"],
    "B 组名": ["..."]
  },
  "breakdowns": [
    { "copy": "挑一条文案原句", "why": "为什么这么写，讲透钩子结构" }
  ],
  "shells": {
    "平台名": [
      { "cover": "只有小红书要，图上的大字", "title": "这个平台的标题或外层文案", "body": "只有小红书和朋友圈要，没有就不给这个键" }
    ]
  },
  "testPath": "测试路径：先测什么钩子，再测什么，最后测什么",
  "supply": "补给节奏：按衰减算出他每周需要多少条新素材，说明依据",
  "honest": "一句真话。这家做的事对不对，问题到底在定位还是在内容",
  "next": ["下一步 2 到 4 条，含需要客户补什么材料才能把缺口从判断升级成对比"]
}

数量要求：gaps 出 3 到 5 条，宁可 3 条狠的不要 5 条软的。copies 分 4 到 5 组，
每组 3 到 4 条，总数不少于 15 条。shells 覆盖 battlefields 里的每个平台，每个 3 条，
另外给 1 到 2 个换外壳平台各 3 条。breakdowns 出 3 条。

# 各平台外壳怎么写 ← 这一段决定素材跑不跑得动
一个内核，多个外壳。内核是钩子背后那个洞察，可以复用；外壳是表达形态和语气，必须换。
同一条内核在三个平台不该有任何一条能互换。只按下面每个平台自己的字段给，
不需要的键就不要出现。

{PLATFORM_BRIEF}
`.trim();
}

function reconPrompt({ customer, huntPack, whyNoMaterial, compliance }) {
  return `
${SHARED_RULES}

这一份出【侦察档】：你没有看过这家客户自己的任何材料（${whyNoMaterial}）。

因此这是一道硬闸门：**不许出诊断，不许写"你们的内容如何如何"**。
你还没资格诊断一个你不了解的人。一个精准的提问比一个错误的诊断值钱得多。
侦察档不是残次品：一份"我研究了你们的赛道，有三个问题想确认"，
比一份"我诊断出你们三个毛病"更容易开启和陌生客户的对话，而且判断错了不会当场翻车。

# 客户
- 名称：${customer.name}
- 猎场：${customer.hunt}
- 城市：${customer.city || "未填"}
- 一句话卖点：${customer.pitch || "未填"}

# 行业包（这个猎场的方法层）
"""
${huntPack}
"""

# 合规红线
"""
${compliance}
"""

# 要出的东西，严格按这个 JSON 结构返回
{
  "title": "提案标题，一句话，是赛道判断不是对这家的断言",
  "gate": "一句话说明：没查到这家客户的公开材料，下面全部是赛道层面的判断，不是对你们现状的陈述",
  "landscape": "赛道格局：这个猎场里现在谁在打、怎么打、打法的共同软肋在哪。三到五句，公开可检索层面，不涉及这家客户",
  "battlefields": ["主战场1", "主战场2"],
  "questions": [
    {
      "ask": "问客户的一句话。要显示你认真研究过这个赛道，不能是'请介绍一下贵公司'",
      "why": "为什么问这个：他的答案会改变哪一条打法"
    }
  ],
  "demand": {
    "who": "赛道层面该截谁",
    "say": ["他会这么说的原话，4 到 6 条"],
    "search": ["他在搜什么，4 到 6 条"],
    "skip": ["不该打谁，3 到 5 条"]
  },
  "copies": {
    "试探": ["3 条试探性文案，基于赛道判断，等客户确认后重出"]
  },
  "shells": {
    "平台名": [
      { "cover": "只有小红书要", "title": "这个平台的标题或外层文案", "body": "只有小红书和朋友圈要" }
    ]
  },
  "testPath": "拿到答案之后，第一批先测什么",
  "supply": "这个赛道的素材衰减大概什么节奏",
  "honest": "一句真话：在没看过材料的前提下，你能给的判断到哪一层为止",
  "next": ["下一步：需要客户给什么，才能把侦察档升级成快档"]
}

questions 出 3 到 5 个，这是侦察档的主体。copies 只出 3 条，不要多。

# 各平台外壳怎么写
{PLATFORM_BRIEF}
`.trim();
}

/**
 * 出一份档。
 * 无论走哪条路都必然返回一份可用的档，附带 origin 说明这份档是怎么来的。
 */
/** 生成的包必须像包：六项齐、包头写清是现场生成的、样本量 0、D 级。 */
export function validateHuntPack(md, hunt) {
  const text = String(md || "").trim();
  const need = ["1.", "2.", "3.", "4.", "5.", "6.", "7."];
  const missing = need.filter((n) => !new RegExp(`^##\\s*${n.replace(".", "\\.")}`, "m").test(text));
  if (missing.length) throw new Error(`生成的行业包缺第 ${missing.join("、")} 节`);
  if (!/留资型|成交型|到店核销型/.test(text)) throw new Error("生成的行业包没定第 6 项的类型，引擎口径对不上");
  if (!text.startsWith("# 行业包：")) throw new Error("生成的行业包包头不对");
  if (!text.includes(hunt)) throw new Error("生成的行业包跟这个行业对不上");
  return text;
}

/**
 * 遇到没有包的行业：现场侦察生成一个，存进 data/industries/，
 * 从此这个猎场永久可用。这是 skill 第 1 步「没有 → 现场生成并存下」那条分支。
 */
export async function growHuntPack(hunt) {
  const name = safeHuntName(hunt);
  if (!name) throw new Error("这个行业名不能用");
  if (!llmReady()) throw new Error("模型还没配好，长不出新行业包");

  const md = await chat({
    system: "你只输出 markdown，不要任何解释。",
    user: `
你要为一个新行业生成一份「行业包」，存进方法库长期复用。

铁律：
1. 你没有这个行业的一手投放数据。**钩子公式库的「验证来源」一列一律填「D·未验证」**，
   不许编造小红书笔记、点赞数、CTR、线索成本这类看起来像数据的东西。
   混进公式库的假数据比空着危险得多。
2. 合理区间、客单价这类数字只能写区间并注明是估算，不许写成确定值。
3. 不用"赋能""抓手""闭环""生态位"这类空词。
4. 焦虑源要具体。"怕被坑"是废话，"怕签完合同增项加价三成"才算。
5. 只输出 markdown 正文，从「# 行业包：${name}」这一行开始。

# 行业
${name}

# 必须照这个结构写，七节一节不能少
${readTemplate()}

# 包头照这样写
# 行业包：${name}

- 生成日期：${today()}
- 生成场景：工作台遇到新猎场，现场侦察生成
- 情报样本量：0 条一手素材
- 情报来源：**模型判断为主（D 级）+ 行业常识（C 级）**
- ⚠️ 拿去见真客户前，必须补 10–20 条一手在投素材，把钩子公式库升级到 B 级
`.trim(),
    maxTokens: 6000,
  });

  const clean = String(md).replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
  writeGrownHunt(name, validateHuntPack(clean, name));
  return name;
}

export async function generatePack(customer, { material = "", link = "" } = {}) {
  let grew = false;
  let growFailed = "";
  if (!readHunt(customer.hunt) && llmReady()) {
    try {
      await growHuntPack(customer.hunt);
      grew = true;
    } catch (err) {
      growFailed = err.message || "没说原因";
    }
  }
  const huntPack = readHunt(customer.hunt);
  const age = huntAge(customer.hunt);

  // 落地路径：模型没配好、行业包没有、或者模型出的东西不合格，都退回行业包模板
  const fallback = (why) => {
    const pack = packFromHunt(customer);
    pack.origin = { engine: "template", why };
    pack.evidence = "D";
    pack.evidenceNote = `按${customer.hunt}行业包的预置模板出的快档（${why}）。没看过${customer.name}自己的在投素材，缺口是赛道判断，不是对这家现状的断言。`;
    pack.checks = checkPack(pack, customer.hunt);
    return pack;
  };

  if (!huntPack) {
    return fallback(
      growFailed ? `这个猎场没有行业包，现场也没长出来：${growFailed}` : "这个猎场还没有行业包",
    );
  }
  if (!llmReady()) return fallback("模型还没配好");

  // 第一道：看过没有。看过才配出诊断。
  let seen = null;
  let whyNot = "没填客户的链接，也没贴材料";
  const pasted = String(material || "").trim();
  if (pasted.length >= 60) {
    seen = { url: "销售手工粘贴的客户材料", text: pasted.slice(0, 12000) };
  } else if (pasted) {
    whyNot = `贴进来的材料只有 ${pasted.length} 个字，不够看出这家在讲什么`;
  }
  if (!seen && String(link || "").trim()) {
    const got = await fetchClientPage(link);
    if (got.ok) seen = { url: got.url, text: got.text };
    else whyNot = `打开 ${String(link).trim()} 没读到内容：${got.why}`;
  }

  const tier = seen ? "快档" : "侦察档";
  const compliance = readReference("compliance.md").slice(0, 6000);
  const prompt = (
    seen
      ? fastPrompt({ customer, huntPack, material: seen, compliance })
      : reconPrompt({ customer, huntPack, whyNoMaterial: whyNot, compliance })
  ).replace("{PLATFORM_BRIEF}", platformBrief(["巨量信息流", "朋友圈", "小红书", "百度", "视频号", "快手"]));

  let pack;
  try {
    const text = await chat({ system: "你只输出 JSON。", user: prompt });
    pack = normalize(extractJson(text), { tier, customer });
  } catch (err) {
    return fallback(err.message || "模型这次没出成");
  }

  pack.evidence = seen ? "B" : "D";
  pack.evidenceNote = seen
    ? `读过${seen.url}之后出的快档。诊断只依据读到的内容，需要推断才成立的都放进了下一步。`
    : `没读到${customer.name}自己的材料（${whyNot}）。下面全是${customer.hunt}赛道层面的判断，不是对这家现状的断言。`;
  pack.origin = {
    engine: "llm",
    tier,
    source: seen ? seen.url : "",
    huntPack: `${customer.hunt}.md`,
    huntGrown: grew,
    huntMadeAt: age?.madeAt || "",
    huntStale: Boolean(age?.stale),
  };
  pack.checks = checkPack(pack, customer.hunt);
  return pack;
}

/* ——— 全档：分镜脚本 ———
 * skill 明写：不要主动对没反应的客户跑全档。所以这是一个手动动作，
 * 销售看到客户有反应了才点。 */

export function normalizeBoards(raw) {
  const boards = (Array.isArray(raw?.boards) ? raw.boards : [])
    .map((b) => ({
      title: str(b?.title),
      platform: str(b?.platform),
      hook: str(b?.hook),
      close: str(b?.close),
      shots: (Array.isArray(b?.shots) ? b.shots : [])
        .map((s) => ({ at: str(s?.at), visual: str(s?.visual), line: str(s?.line) }))
        .filter((s) => s.visual)
        .slice(0, 8),
    }))
    .filter((b) => b.title && b.shots.length >= 2)
    .slice(0, 3);
  if (boards.length < 2) throw new Error("模型没出够分镜（至少 2 条，每条至少 2 个镜头）");
  return boards;
}

export async function generateBoards(pack, customer) {
  if (!llmReady()) throw new Error("模型还没配好，去「模型设置」里填");
  const huntPack = readHunt(customer.hunt);
  const picks = Object.values(pack.copies || {}).flat().slice(0, 12);
  if (!picks.length) throw new Error("这份档里没有文案，出不了分镜");

  const text = await chat({
    system: "你只输出 JSON。",
    user: `
${SHARED_RULES}

给下面这份已经出过的档补 3 条分镜脚本。脚本是拍给${customer.hunt}客户的获客短视频用的，
不是品牌片：前 3 秒必须先给一个事故感瞬间，不要先讲故事、不要先报名号。

# 客户
${customer.name} · ${customer.city || ""} · ${customer.pitch || ""}
主战场：${(pack.battlefields || []).join("、")}

# 已经出过的文案，从里面挑 3 条最狠的来拍
${picks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

# 行业包
"""
${huntPack}
"""

严格按这个 JSON 返回：
{
  "boards": [
    {
      "title": "这条拍什么，一句话",
      "platform": "拍给哪个平台",
      "hook": "前 3 秒的事故感瞬间，写成能拍的画面，不是一句判断",
      "shots": [
        { "at": "0-3s", "visual": "镜头里看到什么，具体到动作和物件", "line": "口播原话，没有就留空" }
      ],
      "close": "最后怎么收口，落到什么动作"
    }
  ]
}

出 3 条，每条 4 到 6 个镜头。画面要能被一个人拿手机拍出来，不要写需要航拍、棚拍、特效的。
`.trim(),
    maxTokens: 4000,
  });
  return normalizeBoards(extractJson(text));
}
