import { chat, llmReady } from "./llm.mjs";
import { huntAge, readHunt, readReference, readTemplate, safeHuntName, writeGrownHunt } from "./industry.mjs";
import { fetchClientPage } from "./recon.mjs";
import { fieldsFor, formatFor, formatsFor, normalizeShellItem, registerFor, specFor } from "./platform.mjs";
import { copyKey, edited, editOf, packAsSent, shellKey } from "./pack-edits.mjs";
import { packFromHunt } from "./pack-from-hunt.mjs";
import { checkLength, checkPack, checkRedline, checkSensitiveFields } from "./check.mjs";

/* 出档引擎。规矩来自 vendor/hiccai-pitch/SKILL.md：
 * 档位由证据决定，不由用户要求决定。没看过对方的东西就不许出诊断。 */

import { today } from "./today.mjs";

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

const copiesCount = (copies) =>
  Object.values(copies || {}).reduce((n, lines) => n + (Array.isArray(lines) ? lines.length : 0), 0);

/** 一次调用拿 JSON。解析失败或没过验收，带着毛病原样再试一次。
 * 并行出档时一段坏掉不该整批作废；accept 返回空串算过，返回一句话就是给模型看的毛病。 */
async function chatJson({ system, user, maxTokens, accept, label = "模型输出" }) {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw;
    try {
      const prompt = attempt ? `${user}\n\n上一趟没过：${last.message}。这一趟修正。` : user;
      raw = extractJson(await chat({ system, user: prompt, maxTokens }));
    } catch (err) {
      last = err;
      continue;
    }
    const bad = accept ? accept(raw) : "";
    if (!bad) return raw;
    last = new Error(bad);
  }
  throw new Error(`${label}没出成：${last?.message || "模型没说原因"}`);
}

/* 四类平台各至少 3 条，是这个台子的出档下限：铺不满就不是一份能发的档。
 * 一个平台可以同时算两类（巨量信息流本来就是短视频版位），别为了凑数逼出四个 key。 */
const SHELL_KINDS = {
  信息流: ["juliang_feed", "baidu_feed", "qianchuan"],
  朋友圈: ["tencent_moments"],
  小红书: ["xiaohongshu_juguang"],
  短视频: ["juliang_feed", "kuaishou", "tencent_video_account", "qianchuan"],
};

/* 一份档每个平台要几条，由它是拿去干什么的决定：
 * 提案是样品，3 条够看出手艺；付了钱的补给是货，一批 50 条文案配四类各 20 条外壳——
 * 一条素材跑三五天就衰减，一个账户同时要有二十来条在跑，少于这个数等于第二周就断供。 */
const SHELL_FLOOR = { 快档: 3, 补给档: 20, 今日: 20 };
const REFILL_COPIES = 50;
/* 存量每点一次就独立出一批货：每批 50 条文案，四类平台各 20 条外壳。
 * 同一天可以出多批，不按自然日限次数。闸门和提示词使用同一个数。
 * 50 条挤一次输出，写到一半截断整份作废，还要一口气等十几分钟。
 * 拆成三段并行出，每段只写自己那一份：时长按最长的一段算，产出各自完整，
 * 完成一份就能实报一份进度。 */
const TODAY_COPIES = REFILL_COPIES;
const TODAY_PARTS = 3;
/* 每段目标 ceil(50/3)=17 条，三段都给满就是 51，硬闸门 50 一定过。 */
const TODAY_PART_TARGET = Math.ceil(TODAY_COPIES / TODAY_PARTS);
/* 每段少给 5 条的余量：去重空一两条不至于整段返工，缺的口子由补段兜住。 */
const TODAY_PART_FLOOR = TODAY_PART_TARGET - 5;
/* 最低可交线：补段轮空之后文案凑不到这个数才算失败。
 * 40 条以上照样是一批能用的货，销售等了五六分钟，不能因为差几条全部作废。 */
const TODAY_MIN_COPIES = 40;

/* 侦察档不铺四类——它只有 3 条试探文案，铺 12 条外壳是硬凑。
 * 但主战场上每条文案都得有成品：给了内核不给成品，销售还得自己翻译一遍。 */
const BATTLE_FLOOR = { 侦察档: 3 };

/* 哪个平台算哪一类，得写给模型看。
 * 实测医美那次补给：主战场是小红书 + 百度，模型铺完百度就交卷了，
 * 短视频那一类 0 条整份退回——它不知道百度只算信息流。 */
const KIND_NAMES = {
  juliang_feed: "巨量信息流（抖音 / 头条）",
  baidu_feed: "百度",
  qianchuan: "千川",
  tencent_moments: "朋友圈",
  xiaohongshu_juguang: "小红书",
  kuaishou: "快手",
  tencent_video_account: "视频号",
};

function kindsBrief(floor) {
  const lines = Object.entries(SHELL_KINDS).map(
    ([kind, keys]) => `  - ${kind}：至少 ${floor} 条。算这一类的有 ${keys.map((k) => KIND_NAMES[k] || k).join(" / ")}`,
  );
  return [
    ...lines,
    "  一个平台可以同时顶两类（巨量信息流本来就是抖音的短视频版位），但百度只算信息流，",
    "  光铺百度会缺短视频那一类，整份作废。",
  ].join("\n");
}

/** 某一类的平台键。认平台名也认类名本身：模型有时直接拿「信息流」当键。 */
function kindOfPlatform(plat, kind) {
  const key = specFor(plat)?.key;
  if (key && SHELL_KINDS[kind].includes(key)) return true;
  return String(plat || "").includes(kind);
}

function kindShellCount(shells, kind) {
  return Object.entries(shells || {}).reduce((n, [plat, items]) => {
    if (!kindOfPlatform(plat, kind)) return n;
    return n + (Array.isArray(items) ? items.length : 0);
  }, 0);
}

/** 平台外壳缺什么。返回一串人话，直接进「模型出的档缺件」。
 * shellFloors 只在缺件救场时传：某类实在没出来就记 0，让它带着记录过闸，不废整批。 */
function shellGaps(shells, tier, battlefields = [], shellFloors = {}) {
  const gaps = [];
  const entries = Object.entries(shells || {});
  if (!entries.length) return ["平台外壳"];

  const kindFloor = (kind) =>
    shellFloors[kind] !== undefined ? shellFloors[kind] : SHELL_FLOOR[tier] || 0;

  /* 主战场是这份档说要重点打的地方，它必须有素材。
   * 上一版出过「主战场：小红书、百度」但外壳里一条百度都没有——
   * 等于告诉客户去打百度，又不给他百度能发的东西。 */
  const need = BATTLE_FLOOR[tier] || 1;
  for (const b of battlefields) {
    const spec = specFor(b);
    if (!spec) continue;
    const kind = Object.keys(SHELL_KINDS).find((k) => SHELL_KINDS[k].includes(spec.key));
    if (kind && shellFloors[kind] === 0) continue; // 这一类的闸门已被救场豁免，缺件另有记录
    const n = entries
      .filter(([plat]) => specFor(plat)?.key === spec.key)
      .reduce((sum, [, items]) => sum + items.length, 0);
    if (!n) gaps.push(`${b}是主战场却一条外壳都没有`);
    else if (n < need) gaps.push(`${b}是主战场，只给了 ${n} 条外壳，至少要 ${need} 条`);
  }

  // 小红书退化成一句话硬广是这个平台最常见的死法，三个字段必须齐
  for (const [plat, items] of entries) {
    if (specFor(plat)?.key !== "xiaohongshu_juguang") continue;
    const bad = items.filter((it) => !it.cover || !it.title || !it.body).length;
    if (bad) gaps.push(`小红书有 ${bad} 条没给齐封面大字 / 标题 / 正文三样`);
  }

  // 侦察档的文案本来就只出 3 条，不逼它铺满四类
  for (const kind of Object.keys(SHELL_KINDS)) {
    const floor = kindFloor(kind);
    if (!floor) continue;
    const n = entries
      .filter(([plat]) => kindOfPlatform(plat, kind))
      .reduce((sum, [, items]) => sum + (Array.isArray(items) ? items.length : 0), 0);
    if (n < floor) gaps.push(`${kind}至少 ${floor} 条（只给了 ${n} 条）`);
  }
  return gaps;
}

/** 收下模型给的东西之前先验一遍。缺件的档不如不出。
 * copyFloor / shellFloors 只由缺件救场路径传：闸门按实际能交的数验，
 * 缺了什么由调用方记录在案（origin.shortfalls），不在结构检查里把整批炸掉。 */
export function normalize(raw, { tier, customer, copyFloor, shellFloors = {} } = {}) {
  const out = {
    title: str(raw.title),
    gate: str(raw.gate),
    battlefields: list(raw.battlefields).slice(0, 2),
    battlefieldWhy: str(raw.battlefieldWhy).slice(0, 300),
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
    landing: null,
  };

  /* 承接是钩子的下半句，不是另一件事。
   * 钩子讲报价陷阱、落地页第一屏写「十年匠心品质之选」，人点进来答非所问就走了——
   * 素材跑得越好浪费越多。行业包第 7 节自己写着这条漏水点，以前没让模型输出。 */
  if (raw.landing && typeof raw.landing === "object") {
    const l = {
      way: str(raw.landing.way),
      firstScreen: str(raw.landing.firstScreen),
      form: list(raw.landing.form).slice(0, 3),
      reward: str(raw.landing.reward),
      leak: str(raw.landing.leak),
    };
    l.firstTouch = {
      open: (Array.isArray(raw.landing.firstTouch?.open) ? raw.landing.firstTouch.open : [])
        .map((x) => ({ from: str(x?.from), say: str(x?.say) }))
        .filter((x) => x.say)
        .slice(0, 4),
      pushback: (Array.isArray(raw.landing.firstTouch?.pushback) ? raw.landing.firstTouch.pushback : [])
        .map((x) => ({ said: str(x?.said), reply: str(x?.reply) }))
        .filter((x) => x.said && x.reply)
        .slice(0, 4),
    };
    l.rewardOutline = list(raw.landing.rewardOutline).slice(0, 8);
    if (l.firstScreen && l.reward) out.landing = l;
  }

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
  const missing = [...shellGaps(out.shells, tier, out.battlefields, shellFloors)];
  if (!out.title) missing.push("标题");
  if (!out.gate) missing.push("闸门说明");
  if (!out.battlefields.length) missing.push("主战场");
  if (out.battlefields.length && !out.battlefieldWhy) missing.push("主战场的依据（为什么是这两个平台）");
  if (tier !== "今日") {
    if (!out.demand.who) missing.push("该截的需求");
    /* 承接每一档都要：没有它这份档只解决点击，不解决线索。
     * 首触和兑现物目录一样是硬的——诊断出「一上来就推销会碎掉信任」却不给话术，
     * 承诺了一份清单却不给目录，等于把最后一步留给运气。 */
    if (!out.landing) missing.push("承接（第一屏那句话和兑现物）");
    else {
      if (out.landing.firstTouch.open.length < 2) missing.push("首触开场（至少 2 种来源各一句）");
      if (out.landing.firstTouch.pushback.length < 2) missing.push("被推开怎么接（至少 2 条）");
      if (out.landing.rewardOutline.length < 4) {
        missing.push(`兑现物目录（至少 4 条，只给了 ${out.landing.rewardOutline.length} 条）`);
      }
    }
  }
  if (tier === "快档") {
    if (out.gaps.length < 3) missing.push("至少 3 条缺口");
    // 提示词写 15 条、闸门卡 12 条的时候，模型给的就是 12 条。
    // 它照闸门给，不照提示词给，所以两个数字必须一样。
    if (copyCount < 15) missing.push(`至少 15 条文案（只给了 ${copyCount} 条）`);
  } else if (tier === "补给档") {
    // 缺口和该截谁是上一份带过来的，这一份只管出货
    if (copyCount < REFILL_COPIES) missing.push(`至少 ${REFILL_COPIES} 条文案（只给了 ${copyCount} 条）`);
  } else if (tier === "今日") {
    const floor = copyFloor ?? TODAY_COPIES;
    if (copyCount < floor) missing.push(`至少 ${floor} 条文案（只给了 ${copyCount} 条）`);
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
      const shape = formatFor(p);
      const forms = formatsFor(p);
      return [
        `## ${p}`,
        r.scene ? `用户正在做什么：${r.scene}` : "",
        r.looks ? `素材必须像：${r.looks}` : "",
        forms ? `形态（逻辑完全不同，不许当成一件事）：\n${forms}` : "",
        r.warn ? `注意：${r.warn}` : "",
        r.conversion.length ? `收口方式：${r.conversion.join(" / ")}` : "",
        shape ? `出片出图规格：${shape}。比例错了会被平台裁掉，文案不用管，拍和做图时按这个来` : "",
        "字段：",
        fields,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/* 说明书塞哪几个平台，跟猎场的考核口径走：
 * 行业包第 6 节定了留资型还是成交型，成交型不给千川的话，模型只会拿留资那套去打电商。 */
function platformsForPack(huntPack) {
  const base = ["巨量信息流", "朋友圈", "小红书", "百度", "视频号", "快手"];
  // 只认第 6 节「类型：」那一行。包正文里顺口提一句"成交型"不算数
  const kind = String(huntPack || "").match(/类型[：:]\s*\*{0,2}(留资型|成交型|到店核销型)/);
  return kind?.[1] === "成交型" ? [...base, "千川"] : base;
}

/* 医疗类猎场跟别的行业有一个正面冲突：
 * 小红书那套「第一人称，说自己的经历」在这里会把模型推向患者证言，
 * 而《广告法》第 16 条明禁医疗药品广告利用患者名义作证明。
 * 平台要活人感，法律不许讲疗效——这个冲突不解，早晚出事。
 * 解法是收窄不是关掉：讲我怎么跑医院可以，讲我怎么好的不行。 */
function isMedicalHunt(huntPack) {
  return /医疗广告|药品广告|处方药|执业医师|执业兽医|诊疗|患者/.test(String(huntPack || ""));
}

const MEDICAL_VOICE = `
# 这个猎场是医疗类：下面每条都是硬边界，违反一条整份作废

1. 先按行业包第 0 节分型。主体、产品/服务、是否处方药、受众、地区/渠道、审查文件
   有一项不能从客户材料里确认，就把它写进 questions / next，不准替客户补齐。
2. 处方药、靶向药、抗肿瘤药不得进入面向公众的互联网文案、平台外壳、分镜、落地页、
   兑现物或私信话术，不出现药名，不做留资、购药、加微跳转。客户只做这类业务时，
   honest 必须明说公众获客走不通，next 只给专业渠道与合规材料核验，不硬凑患者广告。
3. 不做任何个体诊断、分诊、处方、剂量、联合用药、停药、减量、加量、换药建议；
   不凭 HPV 或基因检测结果推断治疗方案。治疗决策交回有资质的医生/药师。
4. HPV 的三条断层线：疫苗是预防，不治疗既有感染或病变；不承诺清除病毒或转阴；
   感染、疣、癌前病变和癌症不能混成一个「HPV 治疗」。能写的是就医准备、术语解释、
   筛查/随访要问什么，不能写病毒怎么清、多久转阴、用了什么就好。
5. 靶向治疗不能写成「有癌就能用」或「一张基因报告配一个药」。具体用药依赖癌种、
   分期、获批适应症、生物标志物、既往治疗和个体情况；不写药物排名、跨癌种套用、
   超说明书方案、比化疗更好、副作用更小或延长生存之类公众广告说法。
6. 第一人称只写就医过程，不写治疗结果。可以写挂号、准备资料、复查时间怎么安排、
   面诊要问什么；不写我好了、转阴了、指标降了、不疼了、见效了、没再犯。
   《广告法》第 16 条禁止利用患者、专家名义推荐证明，真实经历也不能拿来证疗效。
7. landing.form 普通留资表只收一种联系方式、城市/院区偏好、希望联系时间。
   不收病历、诊断、症状、HPV 结果、基因报告、突变、用药史、过敏史或身份证。
   landing.reward 只能是通用的就医问题表、流程单、证据核验卡，不是个体用药方案。
8. 健康科普不能在同一页面或同时带相关产品/服务地址、联系方式、购物链接来变相引流。
   「仅供参考」「不构成医疗建议」不是免责符，不能让上面的禁区变成可用。
9. 所有医学说法只按客户给出的当前说明书、审查件和有版本的权威资料写；没有原文就不写。
   最终成品仍须广告主的医学、药学、法务/合规人员人工签字放行。
`.trim();

const SHARED_RULES = `
你是一位只做获客素材的资深操盘手，正在给一个潜在客户出一份提案。提案是写给这家客户看的，不是写给内部看的。

铁律，违反任何一条整份作废：
1. 绝不编造事实。没有的数据、年份、获奖、案例、客单价，一律不写。需要具体感就写场景和动作，不靠编数字。
1.1 线索成本、留资成本、转化率、ROI、投产比这类效果数字，你手上一条真实的都没有，
   所以一个都不许写——加"约""估算""以后台为准"也不行。标了估算的假数字还是假数字，
   而且客户会拿它当承诺。要谈成本就谈怎么测出来，不谈是多少。
2. 引用平台数字时写"约"，不写"严格"，并说明以投放后台为准。
3. 不用"赋能""抓手""闭环""生态位""高端""品质""匠心"这类空词。
4. 诊断必须具体到能被反驳。不能被反驳的判断都是废话。
5. 全篇至少一句真实的肯定；找不到就不夸，禁止硬夸。
6. 不碰账户结构、出价、定向，那是代运营的活。
7. 提案里不许出现"AI"两个字。
7.1 文案是站在用户那边说话，不是站在客户那边自夸。
   "我们工人不外包""我们做了十年"这种主语是"我们"的句子一条都不许出现——
   那是自我介绍，不是钩子。钩子的主语永远是用户怕的那件事。
   要讲自有工人这个优势，就写成用户怎么验证它（"进场那天问一句这批人是谁带的"），
   不写成我们有多好。这条对每一个平台都成立，不只是小红书。
7.1.1 判断和建议部分一律不许用「他」当代词。这份档里同时站着两个人：
   出钱投放的这家客户，和这家客户要截的那个人。一个「他」两边都能套，
   读的人得停下来倒推是谁——提案里最不该出现的就是让人愣一下的地方。
   这家客户一律写「你们」，要截的那个人一律写具体称呼
   （业主 / 家长 / 养宠人 / 求美者 / 想加盟的人），写不出称呼就写「要截的这个人」。
   文案本身不受这条管：那是写给要截的人看的，怎么顺口怎么写。
7.2 文案字段里只写要发出去的那一句话。不写"（镜头对着…）""（画面…）"这类拍摄提示，
   也不写旁白标注——销售是直接复制这一栏发出去的，括号会跟着发出去。
   镜头怎么拍是分镜的事，不在这里写。
8. 主战场只选 1 到 2 个。冷启动同时铺四个平台等于每个都跑不出模型。
   选哪两个不许拍脑袋：battlefieldWhy 里必须讲清依据——行业包第 7 节的平台建议、
   要截的人在哪个平台密度最高、这个生意的决策是搜出来还是刷出来的、
   当下的量级撑不撑得起铺更多。这句话销售要能当着客户的面讲出来。
9. 只输出 JSON，不要任何解释文字，不要 markdown 围栏之外的话。
`.trim();

/* 承接这一段三份提示词共用。写一处，改一处。 */
const LANDING_RULES = `
# 承接：这一批钩子对应的落地页怎么写 ← 不写这段，这份档只解决点击不解决线索
最常见的死法是钩子讲「报价单里这 3 项容易加钱」，人点进来第一屏写「十年匠心品质之选」。
答非所问，跳出，钱白花——而且素材跑得越好浪费越多。
所以承接不是通用建议，是这一批钩子的下半句：主战场那几条钩子讲什么，第一屏就先兑现什么。

只出内容，不碰技术：落地页搭在哪、用什么系统、加载多快，是客户和代运营的事，不归你管。

"landing": {
  "way": "承接方式。只能从这个平台真支持的里面选（上面每个平台的「收口方式」写了）",
  "firstScreen": "落地页第一屏的第一句话，直接能写上去的原话，不是建议。
                  必须先兑现主战场那几条钩子里最狠的那一条，一句话说完，不许出现公司简介",
  "form": ["表单问哪几项。最多 3 项，每项后面用括号说明为什么这一项非问不可。
            多一栏掉一档转化，问「预算区间」就是在把人往外赶"],
  "reward": "留了资立刻给什么。要具体到是个什么东西——一份报价拆解表、一张老房隐患清单、
             一段检测视频。不许写「专属顾问一对一服务」这种没有实体的话",
  "leak": "这行最常见的漏水点是什么，怎么堵。行业包第 7 节写了的照着来，
           没写就按这个赛道的实际情况说，具体到能当场改",
  "firstTouch": {
    "open": [
      { "from": "线索从哪来的（表单留资 / 私信 / 电话，只写上面 way 里真有的那几种）",
        "say": "接上这条线索的第一句原话。能直接复制着发出去，不是「建议先建立信任」这种废话。
                第一句必须先兑现上面承诺的那个东西，不许先问预算、先约到店、先介绍公司" }
    ],
    "pushback": [
      { "said": "这个人会怎么推开你，写他会说的原话（「我先看看」「多少钱」这类）",
        "reply": "怎么接。接的方向是把他推开的那句话变成一个具体问题，不是硬拉回来" }
    ]
  },
  "rewardOutline": ["上面 reward 承诺的那个东西，目录长什么样。一条一栏，
                     写清这一栏放什么、数据从哪来。哪几项必须客户自己填真实数据的，
                     在那一条里直接说明——你没有他们的真数据，不许替他们编"]
}

open 有几种就写几种，至少 2 种；pushback 至少 2 条；rewardOutline 4 到 6 条。

为什么这两块非有不可：上面 leak 那一栏你自己会写「留资后一上来就推销，信任直接碎掉」——
你诊断出了病却不给药，销售照样会那么干。素材的钱、落地页的钱都花完了，
最后死在第一句话上，前面每一分都白花。
而 reward 承诺了一份东西却不给目录，销售根本发不出来——承诺了给不出来，
比不承诺更伤，正是 leak 里说的那个「直接拉黑」。
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
  "battlefieldWhy": "为什么是这两个、为什么暂时不铺别的：对着行业包第 7 节的平台建议说清三件事——要截的人在哪个平台密度最高、这个生意的决策是搜出来的还是刷出来的、现在的量级撑不撑得起多平台。两到三句，销售要能当着客户的面讲出来。不许写「流量大」「效果好的平台」这种空话",
  "demand": {
    "who": "该截谁。一句话画出这个人的处境和决策阶段，具体到能照着投。这里说的是要来找你们的那个人，不是你们",
    "say": ["要截的这个人会这么说的原话，4 到 6 条，口语，不是书面语"],
    "search": ["要截的这个人在搜什么，4 到 6 条搜索词"],
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
  "landing": { "见下面「承接」那一段，五项都要给" },
  "testPath": "测试路径：先测什么钩子，再测什么，最后测什么",
  "supply": "补给节奏：按衰减算出你们每周需要多少条新素材，说明依据",
  "honest": "一句真话。这家做的事对不对，问题到底在定位还是在内容",
  "next": ["下一步 2 到 4 条，含需要客户补什么材料才能把缺口从判断升级成对比"]
}

数量要求：gaps 出 3 到 5 条，宁可 3 条狠的不要 5 条软的。copies 分 4 到 5 组，
每组 3 到 4 条，总数不少于 15 条。breakdowns 出 3 条。

shells 是硬闸门，铺不满整份作废：
{SHELL_KINDS_3}
battlefields 里写的每个平台都必须有外壳——说了去打百度又不给百度能发的东西等于没给。
小红书每一条都必须同时给出 cover（封面大字）、title（标题）、body（正文）三样，
缺一样这条就不算数。

{MEDICAL_VOICE}

{LANDING_RULES}

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
  "battlefieldWhy": "为什么是这两个、为什么暂时不铺别的：对着行业包第 7 节的平台建议说清三件事——要截的人在哪个平台密度最高、这个生意的决策是搜出来的还是刷出来的、现在的量级撑不撑得起多平台。两到三句，销售要能当着客户的面讲出来。不许写「流量大」「效果好的平台」这种空话",
  "questions": [
    {
      "ask": "问客户的一句话。要显示你认真研究过这个赛道，不能是'请介绍一下贵公司'",
      "why": "为什么问这个：你们的答案会改变哪一条打法"
    }
  ],
  "demand": {
    "who": "赛道层面该截谁",
    "say": ["要截的这个人会这么说的原话，4 到 6 条"],
    "search": ["要截的这个人在搜什么，4 到 6 条"],
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
  "landing": { "见下面「承接」那一段。侦察档也要给，只是标明这是赛道通行的承接方式，不是对这家的判断" },
  "testPath": "拿到答案之后，第一批先测什么",
  "supply": "这个赛道的素材衰减大概什么节奏",
  "honest": "一句真话：在没看过材料的前提下，你能给的判断到哪一层为止",
  "next": ["下一步：需要客户给什么，才能把侦察档升级成快档"]
}

questions 出 3 到 5 个，这是侦察档的主体。copies 只出 3 条，不要多。
shells 不用铺四类平台（就 3 条文案，铺 12 条是硬凑），但 battlefields 里的
每个平台都要给满 3 条——3 条试探文案在主战场上各有各的成品，
给了内核不给成品等于让销售自己再翻译一遍。

{MEDICAL_VOICE}

{LANDING_RULES}

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

/* ——— 交付自查：成品踩了红线或字数超限，先让模型自己改一遍 ———
 * 报告是要整份另存给甲方的：一句红线卡住整个导出口，销售就得手工当校对。
 * 这里把踩线的句子点名送回去改写，改完重查；改不动的如实带着检查结果交给人，
 * 检查区照样列出来，系统不会把风险项静默带出去。 */

/** 改一条。支持文案/外壳的 key，也支持承接的伪 key（landing|form|0 这类）。 */
function applyEdit(pack, key, now) {
  for (const [group, lines] of Object.entries(pack.copies || {})) {
    for (let i = 0; i < (lines || []).length; i += 1) {
      if (copyKey(group, i) === key) {
        lines[i] = now;
        return;
      }
    }
  }
  for (const [plat, items] of Object.entries(pack.shells || {})) {
    for (let i = 0; i < (items || []).length; i += 1) {
      const item = typeof items[i] === "string" ? { title: items[i] } : items[i];
      for (const f of ["cover", "title", "body"]) {
        if (item && item[f] && shellKey(plat, i, f) === key) {
          item[f] = now;
          return;
        }
      }
    }
  }
  if (String(key).startsWith("landing|")) applyLandingEdit(pack, key, now);
}

/** 承接的伪 key 改写。承接没有 edits 覆盖层，直接改字段，原句由修复记录留底。 */
function applyLandingEdit(pack, key, now) {
  const landing = pack.landing || {};
  const [, field, idx] = String(key).split("|");
  if (field === "firstScreen") landing.firstScreen = now;
  else if (field === "reward") landing.reward = now;
  else if (field === "form" && Array.isArray(landing.form)) landing.form[Number(idx)] = now;
  else if (field === "open" && landing.firstTouch?.open?.[Number(idx)]) landing.firstTouch.open[Number(idx)].say = now;
  else if (field === "pushback" && landing.firstTouch?.pushback?.[Number(idx)]) landing.firstTouch.pushback[Number(idx)].reply = now;
  else if (field === "rewardOutline" && Array.isArray(landing.rewardOutline)) landing.rewardOutline[Number(idx)] = now;
}

/** 能按句修的硬伤：红线词、小红书标题超限、表单收敏感信息。
 * 换皮、跨平台同句这类要通篇看的，交给人。 */
function repairableRows(pack, hunt) {
  const sent = packAsSent(pack);
  const rows = [];
  for (const [group, lines] of Object.entries(sent.copies)) {
    (lines || []).forEach((text, i) => {
      if (!text) return;
      const words = checkRedline(text, hunt);
      if (!words.length) return;
      rows.push({ key: copyKey(group, i), where: `文案 · ${group}`, text, words, max: 0 });
    });
  }
  for (const [plat, items] of Object.entries(sent.shells)) {
    (items || []).forEach((raw, i) => {
      const item = typeof raw === "string" ? { title: raw } : raw || {};
      for (const field of fieldsFor(plat)) {
        const text = item[field.key];
        if (!text) continue;
        const words = checkRedline(text, hunt);
        const over = checkLength(text, plat, field.key);
        if (!words.length && over?.level !== "hard") continue;
        rows.push({
          key: shellKey(plat, i, field.key),
          where: `${plat} · ${field.label}`,
          text,
          words,
          max: over?.level === "hard" ? over.max : 0,
        });
      }
    });
  }
  /* 承接同样会发给人：第一屏、私信第一句、兑现物都查红线；表单另过敏感信息闸门。 */
  const landing = pack.landing || {};
  const landingPieces = [
    ["landing|firstScreen", "承接 · 第一屏", landing.firstScreen],
    ["landing|reward", "承接 · 兑现物", landing.reward],
    ...((landing.form || []).map((t, i) => [`landing|form|${i}`, "承接 · 表单", t])),
    ...((landing.firstTouch?.open || []).map((x, i) => [`landing|open|${i}`, `承接 · ${x.from || "首触"}`, x.say])),
    ...((landing.firstTouch?.pushback || []).map((x, i) => [`landing|pushback|${i}`, "承接 · 被推开怎么接", x.reply])),
    ...((landing.rewardOutline || []).map((t, i) => [`landing|rewardOutline|${i}`, "承接 · 兑现物目录", t])),
  ];
  for (const [key, where, text] of landingPieces) {
    if (!text) continue;
    const words = checkRedline(text, hunt);
    const sensitive = checkSensitiveFields([text], hunt);
    if (!words.length && !sensitive.length) continue;
    rows.push({ key, where, text, words, max: 0, sensitive: sensitive.length > 0 });
  }
  return rows;
}

function repairPrompt(rows, hunt) {
  const list = rows
    .map((r, i) => {
      const problems = [
        r.words.length ? `红线词：${r.words.join("、")}` : "",
        r.max ? `超过 ${r.max} 字的硬上限` : "",
        r.sensitive ? "表单在收集医疗健康敏感信息" : "",
      ].filter(Boolean);
      return `${i + 1}. key 是 ${r.key}（${r.where}）
原句：${r.text}
问题：${problems.join("；")}`;
    })
    .join("\n\n");
  return `
这些句子是给${hunt}行业的获客素材写的，自查发现踩了线。逐句改写：意思和钩子保留，把问题全部去掉。

${list}

规则：
- 红线词不许换个说法保留（「No.1」改成「第一」一样不行）：要么删掉，要么换成做得到的具体事实
- 标了字数上限的，改完不许超
- 收集敏感信息的表单项，改成不收敏感信息的开放问题（如「您最想解决的问题是？」），
  不得收集病历、病史、检测/检验结果、用药史、身份证等
- 不许改成空话套话，不许加「专业团队」这类口号

只输出 JSON：{ "改好的句子": { "句子的 key": "改后的句子" } }，key 原样照抄，只给要改的句子。
`.trim();
}

/**
 * 收集能按句修的硬伤，送回模型改写。返回修复项数组（没有就空数组），
 * 不直接动档——应用方式由调用方定：新生成的档直接改进正文，
 * 已交付的档走 edits 覆盖层留底，承接的伪 key 直接改字段。
 */
export async function collectRepairs(pack, customer, onProgress) {
  const rows = repairableRows(pack, customer.hunt);
  if (!rows.length) return [];
  onProgress?.(96, `自查发现 ${rows.length} 处红线、超限或敏感收集，正在自动修正`);
  let fixed;
  try {
    fixed = extractJson(
      await chat({ system: "你只输出 JSON。", user: repairPrompt(rows, customer.hunt), maxTokens: 4000 }),
    );
  } catch {
    /* 修不动不拦交付：检查结果原样在，界面会点名让人改 */
    return [];
  }
  const map = fixed?.["改好的句子"] || {};
  const fixes = [];
  for (const r of rows) {
    const now = str(map[r.key]);
    if (!now || now === r.text) continue;
    fixes.push({ ...r, now });
  }
  return fixes;
}

/** 生成后自查。返回改动记录（给 origin.repairs 留底），没改就返回空。 */
async function selfRepair(pack, customer, onProgress) {
  const fixes = await collectRepairs(pack, customer, onProgress);
  for (const f of fixes) applyEdit(pack, f.key, f.now);
  return fixes.length
    ? fixes.map(({ key, where, text, now }) => ({ key, where, was: text, now }))
    : null;
}

export async function generatePack(customer, { material = "", link = "", onProgress = () => {} } = {}) {
  onProgress(10, "正在检查客户资料与行业底稿");
  let grew = false;
  let growFailed = "";
  if (!readHunt(customer.hunt) && llmReady()) {
    try {
      onProgress(18, "正在建立新行业底稿");
      await growHuntPack(customer.hunt);
      grew = true;
      onProgress(32, "行业底稿已准备好");
    } catch (err) {
      growFailed = err.message || "没说原因";
    }
  }
  const huntPack = readHunt(customer.hunt);
  const age = huntAge(customer.hunt);

  /* 退回模板只用于结构性原因：这台机器现在就是没有出档能力（没配模型、没这个行业包）。
   * 模型超时、报错、出的东西不合格，是"这次没成"，不是"没能力"——那种情况绝不能
   * 悄悄塞一份行业模板：界面上两者长得一模一样，销售会以为这是给这家客户出的，
   * 拿着赛道模板去谈一个具体客户，比什么都不给更糟。这种就抛出去，让他重出。 */
  const fallback = (why) => {
    const pack = packFromHunt(customer);
    pack.origin = { engine: "template", why };
    pack.evidence = "D";
    pack.evidenceNote = `按${customer.hunt}行业包的预置模板出的快档（${why}）。没看过${customer.name}自己的在投素材，缺口是赛道判断，不是对这家现状的断言。`;
    pack.checks = checkPack(pack, customer.hunt);
    return pack;
  };

  if (!huntPack) {
    onProgress(88, "正在整理可交付的判断模板");
    return fallback(
      growFailed ? `这个猎场没有行业包，现场也没长出来：${growFailed}` : "这个猎场还没有行业包",
    );
  }
  if (!llmReady()) {
    onProgress(88, "正在整理可交付的判断模板");
    return fallback("模型还没配好");
  }

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
    onProgress(36, "正在读取客户网页");
    const got = await fetchClientPage(link);
    if (got.ok) seen = { url: got.url, text: got.text };
    else whyNot = `打开 ${String(link).trim()} 没读到内容：${got.why}`;
  }

  const tier = seen ? "快档" : "侦察档";
  onProgress(48, seen ? "资料已读到，正在生成判断" : "正在生成赛道侦察判断");
  const compliance = readReference("compliance.md").slice(0, 6000);
  const prompt = (
    seen
      ? fastPrompt({ customer, huntPack, material: seen, compliance })
      : reconPrompt({ customer, huntPack, whyNoMaterial: whyNot, compliance })
  )
    .replace("{PLATFORM_BRIEF}", platformBrief(platformsForPack(huntPack)))
    .replace("{SHELL_KINDS_3}", kindsBrief(SHELL_FLOOR["快档"]))
    .replace("{LANDING_RULES}", LANDING_RULES)
    .replace("{MEDICAL_VOICE}", isMedicalHunt(huntPack) ? MEDICAL_VOICE : "");

  let pack;
  try {
    const text = await chat({ system: "你只输出 JSON。", user: prompt });
    onProgress(88, "判断已生成，正在检查结构与红线");
    pack = normalize(extractJson(text), { tier, customer });
  } catch (err) {
    throw new Error(`${tier}没出成：${err.message || "模型没说原因"}`);
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
  onProgress(94, "正在完成交付检查");
  pack.checks = checkPack(pack, customer.hunt);
  const repairs = await selfRepair(pack, customer, onProgress);
  if (repairs) {
    pack.origin.repairs = repairs;
    pack.checks = checkPack(pack, customer.hunt);
  }
  return pack;
}

/* ——— 补给档：客户付了钱之后的持续供货 ———
 * 提案那一份是样品，一次性的。真投起来一条素材跑三五天就衰减，
 * 一个月要几十条，一批出 50 条。所以这里不是"再随机出一批"，是拿上一批的反馈当输入：
 * 有回音的方向继续往下挖，没反应的方向不再出。
 *
 * 50 条文案加四类各 20 条外壳塞不进一次模型输出——写到一半截断，整份作废。
 * 所以拆成两次调用：先出文案，够数了再单独出外壳，最后合成一份档。
 *
 * 手动点。客户没反应的时候续出等于对着空气烧钱，而且素材是人拿去发的，
 * 攒着不发再多也没用。 */

/** 把反馈整理成模型看得懂的话。没点过反馈的不编，如实说还没发。
 *  older 是这个客户更早的几批：回音是他自己趟出来的路，不能因为中间补过一批货就忘掉。 */
export function feedbackDigest(pack, feedback = {}, older = []) {
  const groups = [];
  const byName = new Map();
  const addPack = (p, when) => {
    for (const [group, lines] of Object.entries(p.copies || {})) {
      let g = byName.get(group);
      if (!g) {
        g = { group, rows: [] };
        byName.set(group, g);
        groups.push(g);
      }
      for (let i = 0; i < (lines || []).length; i += 1) {
        const key = copyKey(group, i);
        // 喂回去的必须是销售真正发出去的那句。台子里存的那句和实际发的不是一句话时，
        // 反馈就对不上了——「有回音」说的是他改过的那版，不是模型原来写的那版。
        g.rows.push({
          text: edited(p, key, lines[i]),
          was: editOf(p, key)?.was || "",
          fb: feedback[`${p.id}-${group}-${i}`] || "",
          when,
        });
      }
    }
  };
  addPack(pack, "");
  for (const p of older) {
    addPack(p, String(p.deliveredAt || p.createdAt || "").slice(5));
  }
  for (const g of groups) {
    g.replied = g.rows.filter((r) => r.fb === "replied");
    g.dead = g.rows.filter((r) => r.fb === "dead");
  }
  const anyMark = groups.some((g) => g.replied.length || g.dead.length);
  return { groups, anyMark };
}

/* 收窄不能没有下限。提示词写三成、闸门只查"有没有这一组"的时候，
 * 模型给的是一组 5 条（14%）——它照闸门给，不照提示词给，所以比例得写进闸门。 */
const EXPLORE_FLOOR = 0.25;

/** 探索配额够不够。够就返回空字符串，不够就返回一句能直接给人看的话。 */
export function exploreShortfall(copies) {
  const all = Object.entries(copies || {});
  const total = all.reduce((n, [, v]) => n + v.length, 0);
  if (!total) return "这一批一条文案都没有";
  const tried = all.filter(([g]) => g.startsWith("试")).reduce((n, [, v]) => n + v.length, 0);
  if (!tried) return "这一批全押在已经有回音的那个方向上，没留试新方向的那一组";
  if (tried / total < EXPLORE_FLOOR) {
    return `试新方向的只有 ${tried}/${total} 条，不到四分之一，收得太窄`;
  }
  return "";
}

function refillPrompt({ customer, huntPack, prev, digest, batch, compliance }) {
  const marked = digest.groups
    .map((g) => {
      const head = `## ${g.group}（有回音 ${g.replied.length} 条 / 没反应 ${g.dead.length} 条）`;
      const rows = g.rows.map(
        (r) =>
          `- ${r.fb === "replied" ? "✓有回音" : r.fb === "dead" ? "✗没反应" : "·还没发"}${r.when ? `（${r.when}那批）` : ""} ${r.text}` +
          (r.was ? `\n    （销售发之前改过，你原来写的是「${r.was}」）` : ""),
      );
      return [head, ...rows].join("\n");
    })
    .join("\n\n");

  return `
${SHARED_RULES}

这一份出【补给档】，是第 ${batch} 批。这家客户已经在用上一批素材了，你现在要给他补货。

这不是重出一份提案：诊断、该截谁、主战场都已经定了，不要再出一遍。
你只出新素材，而且必须顺着前面几批跑出来的结果走。

# 客户
- 名称：${customer.name}
- 猎场：${customer.hunt}
- 城市：${customer.city || "未填"}
- 一句话卖点：${customer.pitch || "未填"}
- 主战场：${(prev.battlefields || []).join("、")}
- 该截谁：${prev.demand?.who || ""}
- 已经诊断出的缺口：${(prev.gaps || []).map((g) => g.name).join("、")}

# 发出去之后的实际反馈
${digest.anyMark ? `没标日期的是最近这批，标了日期的是更早补的几批——都是这家客户身上真跑出来的。没有的就是没标，不编。\n\n${marked}` : "销售还没有标过任何一条的反馈。"}

${
  digest.anyMark
    ? `这是这一份最重要的输入。规矩：
1. 标了「有回音」的那几条，是这家客户的人真正会停下来看的方向。顺着它往下挖，
   出更多同一个洞察的不同切口，不是把原句换几个字。
2. 标了「没反应」的方向不要再出。整组都没反应就把这一组砍掉，别改改再端上来。
3. 「还没发」的既不算成功也不算失败，不作为依据。
3.1 标着「销售发之前改过」的，比有回音还值钱：客户认不认还两说，
   但销售宁可动手改也不肯照发，说明你那句话有他咽不下去的地方。
   照着他改成的样子写，别改回去。这类方向继续出，只是话要按他的说法说。
4. 但不许把整批都押在这一个洞察上：**七成顺着有回音的方向，三成试没试过的新方向**。
   有回音只说明这个方向能用，不说明它是最好的那个——一直往一个方向收，
   第三批就会变成同一句话的三十种说法，而且永远发现不了更狠的钩子。
   试的那三成单独放一组，组名以「试」字开头（例如「试·工期失控」），
   让销售一眼看得出哪些是在赌，别跟已验证的混在一起。
   三成是硬闸门：试的那些不到总数的四分之一，整份作废。一组装不下就分两组，
   都以「试」开头。`
    : `销售一条都没标过，说明这批还没发出去或者还没收到反馈。
那就不要假装有依据：这一批按上一份的主战场和该截谁平铺着出，
覆盖面比上一批宽一点，把上一份没铺到的焦虑源补上。
honest 那句要如实说明这一批没有反馈可依据。`
}

# 行业包
"""
${huntPack}
"""

# 合规红线
"""
${compliance}
"""

# 要出的东西，严格按这个 JSON 返回。这一步只出文案和打法，平台外壳不出——
# 文案定了之后另有一次调用专门出外壳，你在这里出了也用不上
{
  "title": "这一批的标题，一句话说清这批往哪个方向走，以及为什么",
  "copies": {
    "组名": ["文案条，每条一句话，能直接复制发出去"]
  },
  "breakdowns": [
    { "copy": "挑一条新文案原句", "why": "为什么这么写，它接的是上一批哪条的回音" }
  ],
  "landing": { "见下面「承接」那一段。这一批钩子换了方向，第一屏那句话要跟着换" },
  "testPath": "这一批先测什么，再测什么",
  "supply": "按这批的衰减速度，下次该什么时候再补，补多少",
  "honest": "一句真话：这一批的依据有多硬，哪些是顺着反馈走的，哪些还是猜的",
  "next": ["下一步 2 到 4 条"]
}

数量要求，这是硬闸门，铺不满整份作废：
copies 分 8 到 10 组，总数不少于 ${REFILL_COPIES} 条。其中必须有「试」字开头的新方向组，
一组装不下就分两组，都以「试」开头。
breakdowns 出 3 条。

同一个钩子换几个字不算一条。五十条换皮不如二十五条真的不一样。

{MEDICAL_VOICE}

{LANDING_RULES}

# 各平台怎么收口（landing.way 只能从这里选）
{PLATFORM_BRIEF}
`.trim();
}

/* 补给的第二次调用：文案已定，只出各平台外壳。
 * 单独一趟是因为输出装不下：文案和外壳挤一次调用，后半段必被截断。
 * 四类外壳再各给一趟并行出：一趟写 80 多条照样会被截，分四趟每趟只写 20 来条。 */
function refillShellsPrompt({
  customer,
  huntPack,
  copies,
  battlefields,
  compliance,
  job = "补给档",
  count = REFILL_COPIES,
  onlyKind = "",
}) {
  const flat = Object.entries(copies)
    .map(([g, lines]) => `## ${g}\n${lines.map((t, i) => `${i + 1}. ${t}`).join("\n")}`)
    .join("\n\n");
  const total = Object.values(copies).reduce((n, lines) => n + (Array.isArray(lines) ? lines.length : 0), 0);
  const intro = onlyKind
    ? `这一份给【${job}】出【${onlyKind}】这一类平台的外壳：这一批的 ${total} 条文案已经出好了，你的活是把它们翻译成这一类平台上能直接发布的成品。其余类别由并行的另几趟负责，你只出 ${onlyKind}。`
    : `这一份给【${job}】出平台外壳：这一批的 ${total} 条文案已经出好了，你的活是把它们翻译成各平台能直接上的成品。`;
  const ask = onlyKind
    ? `# 要出的东西，严格按这个 JSON 返回，除了 shells 什么都不要
{
  "shells": {
    "${onlyKind}这一类下的具体平台名": [
      { "cover": "只有小红书要，图上的大字", "title": "这个平台的标题或外层文案", "body": "只有小红书和朋友圈要，没有就不给这个键" }
    ]
  }
}`
    : `# 要出的东西，严格按这个 JSON 返回，除了 shells 什么都不要
{
  "shells": {
    "平台名": [
      { "cover": "只有小红书要，图上的大字", "title": "这个平台的标题或外层文案", "body": "只有小红书和朋友圈要，没有就不给这个键" }
    ]
  }
}`;
  const gate = onlyKind
    ? `shells 是硬闸门，这一类铺不满整份作废：
  - ${onlyKind}：至少 ${count} 条。算这一类的有 ${(SHELL_KINDS[onlyKind] || []).map((k) => KIND_NAMES[k] || k).join(" / ")}
battlefields 里属于 ${onlyKind} 这一类的平台必须有外壳——说了去打它又不给能发的东西等于没给。`
    : `shells 是硬闸门，铺不满整份作废：
{SHELL_KINDS_REFILL}
battlefields 里写的每个平台都必须有外壳——说了去打百度又不给百度能发的东西等于没给。`;
  return `
${SHARED_RULES}

${intro}
文案是内核，外壳是表达形态和语气：同一条内核在三个平台不该有任何一条能互换。
外壳从这批文案里挑着包，不用每条都包，但下面${onlyKind ? "这一类" : "每类平台"}的下限必须铺满。

# 客户
- 名称：${customer.name}
- 猎场：${customer.hunt}
- 主战场：${battlefields.join("、")}

# 已经出好的文案
${flat}

# 行业包
"""
${huntPack}
"""

# 合规红线
"""
${compliance}
"""

${ask}

${gate}
小红书每一条都必须同时给出 cover（封面大字）、title（标题）、body（正文）三样，
缺一样这条就不算数。三样是三个不同的东西，不许互相当缩写。

{MEDICAL_VOICE}

# 各平台外壳怎么写
{PLATFORM_BRIEF}
`.trim();
}

/**
 * 给一份已经在用的档补一批新素材。
 * prev 是上一批（拿它的诊断和反馈），返回的是一份新的、并列存放的档。
 */
export async function generateRefill(customer, prev, feedback, batch) {
  if (!llmReady()) throw new Error("模型还没配好，出不了档。密钥只有管理员能配（设置 → 模型）；你不是管理员的话，把这句话转给他");
  const huntPack = readHunt(customer.hunt);
  if (!huntPack) throw new Error(`${customer.hunt}这个猎场还没有行业包，补不了货`);

  // 反馈不只吃上一批：这个客户身上更早几批标过的回音也是依据，最多带三批，免得提示词无限长
  const older = (customer.packs || [])
    .filter((p) => p.id !== prev.id && p.copies && Object.keys(p.copies).length)
    .slice(0, 3);
  const digest = feedbackDigest(prev, feedback, older);
  const compliance = readReference("compliance.md").slice(0, 6000);
  const prompt = refillPrompt({ customer, huntPack, prev, digest, batch, compliance })
    .replace("{PLATFORM_BRIEF}", platformBrief(platformsForPack(huntPack)))
    .replace("{LANDING_RULES}", LANDING_RULES)
    .replace("{MEDICAL_VOICE}", isMedicalHunt(huntPack) ? MEDICAL_VOICE : "");

  const raw = extractJson(await chat({ system: "你只输出 JSON。", user: prompt, maxTokens: 12000 }));

  // 文案不够数就别再花一趟模型调用出外壳：在这里先挡下，报的话跟闸门一致
  const copyCount = Object.entries(raw.copies || {}).reduce(
    (n, [, lines]) => n + (Array.isArray(lines) ? lines.length : 0),
    0,
  );
  if (copyCount < REFILL_COPIES) {
    throw new Error(`模型出的档缺件：至少 ${REFILL_COPIES} 条文案（只给了 ${copyCount} 条）`);
  }

  const shellsPrompt = refillShellsPrompt({
    customer,
    huntPack,
    copies: raw.copies,
    battlefields: prev.battlefields || [],
    compliance,
  })
    .replace("{PLATFORM_BRIEF}", platformBrief(platformsForPack(huntPack)))
    .replace("{SHELL_KINDS_REFILL}", kindsBrief(SHELL_FLOOR["补给档"]))
    .replace("{MEDICAL_VOICE}", isMedicalHunt(huntPack) ? MEDICAL_VOICE : "");
  const shellsRaw = extractJson(
    await chat({ system: "你只输出 JSON。", user: shellsPrompt, maxTokens: 12000 }),
  );

  // 诊断、该截谁、主战场是上一批定下的，原样带过来，不让模型重出一遍
  const pack = normalize(
    {
      ...raw,
      shells: shellsRaw.shells,
      gate: `第 ${batch} 批补给。诊断和主战场沿用第一份，这一批只补素材。`,
      battlefields: prev.battlefields,
      demand: prev.demand,
      gaps: prev.gaps,
    },
    { tier: "补给档", customer },
  );

  /* 有反馈的时候必须留探索配额。这条不放进 normalize：只有这里知道上一批标没标过反馈，
   * 而没反馈的那一批本来就是平铺的，不存在"收窄过头"这回事。
   *
   * 比例必须写进闸门，不能只卡"有没有这一组"。上一次实测：提示词写三成、
   * 闸门只查有没有，模型就给一组 5 条（14%）交差。它照闸门给，不照提示词给。 */
  if (digest.anyMark) {
    const short = exploreShortfall(pack.copies);
    if (short) throw new Error(short);
  }

  pack.evidence = prev.evidence;
  pack.evidenceNote = digest.anyMark
    ? `第 ${batch} 批。顺着标了有回音的方向出的（吃的是最近几批的反馈），没反应的方向已经砍掉。`
    : `第 ${batch} 批。前面几批还没有标过反馈，这一批是平铺补的，不是按效果收窄的。`;
  pack.origin = { engine: "llm", tier: "补给档", batch, from: prev.id, huntPack: `${customer.hunt}.md` };
  pack.checks = checkPack(pack, customer.hunt);
  return pack;
}

/**
 * 拿最近几批已出过的文案当禁出清单：提示词先拦一遍，
 * 回来后再做一遍硬去重兜底（空白归一后一字不差的才算重复；
 * 「换几个字」这档机器判不了语境，交给提示词和销售的眼睛）。
 * 去完重空掉的组整个拿掉，剩下不够数由调用方如实报错。
 */
export function dedupeCopies(copies, prevLines) {
  const seen = new Set((prevLines || []).map((l) => String(l || "").replace(/\s+/g, "")));
  const out = {};
  for (const [group, lines] of Object.entries(copies || {})) {
    if (!Array.isArray(lines)) continue;
    const kept = [];
    for (const line of lines) {
      const text = String(line || "").trim();
      if (!text) continue;
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(text);
    }
    if (String(group || "").trim() && kept.length) out[String(group).trim()] = kept;
  }
  return out;
}

function todayPrompt({ customer, huntPack, digest, compliance, battlefields, avoid, part = 0, parts = 1 }) {
  const fieldLine = (battlefields || []).length
    ? `主战场已经定了：${battlefields.join("、")}。不要改，这一批只出文案。`
    : `自己定主战场，最多 2 个平台。`;
  const avoidBlock = avoid
    ? `# 这家已经出过的文案（这一批的禁出清单）
${avoid}

`
    : "";
  const avoidGate = avoid
    ? `- 禁出清单里的每一条都不许再出现，也不许只换几个字、换个说法算新的一条
`
    : "";
  /* 分段时只有第 1 段出整批的 title/gate/主战场，别的段只交文案，免得各段各说各话。 */
  const split = parts > 1 && part >= 1;
  const head = split
    ? `你在给已经合作的客户出本次这批货（一共 ${TODAY_COPIES} 条）的第 ${part} 段文案，不是出判断报告。同一天可能已经出过别的批次，这一批仍要独立给满 ${TODAY_COPIES} 条。`
    : `你在给已经合作的客户出本次这一批货，不是出判断报告。同一天可能已经出过别的批次，这一批仍要独立给满 ${TODAY_COPIES} 条。`;
  const PART_ANGLES = {
    1: "你这段多从「顾虑、误区、算账、对比」这类角度切入。",
    2: "你这段多从「场景、过程、拿到结果的路子」这类角度切入。",
    3: "你这段多从「什么人适合、什么场合用、到底怎么选」这类角度切入。",
  };
  const shareLine = split
    ? `这批文案分 ${parts} 段同时出，你只负责第 ${part} 段：4 到 5 组，合计至少 ${TODAY_PART_TARGET} 条。` +
      `别的段在出别的方向，你的组名和切入角度不要跟它们撞。${PART_ANGLES[part] || ""}`
    : "";
  const tryGate = digest.anyMark
    ? `- 有回音时至少四分之一的${split ? "条数" : "条文案"}放在组名以「试」开头的组里
`
    : "";
  const metaAsk = `  "title": "本次这一批的一句话",
  "gate": "今日内容。有回音就写顺着哪边；没有就写还没有回音依据",
  "battlefields": ["主战场平台，最多 2 个"],
  "battlefieldWhy": "为什么是这两个、为什么暂时不铺别的：对着行业包第 7 节的平台建议说清三件事——要截的人在哪个平台密度最高、这个生意的决策是搜出来的还是刷出来的、现在的量级撑不撑得起多平台。两到三句，销售要能当着客户的面讲出来。不许写「流量大」「效果好的平台」这种空话",
`;
  const ask = split && part > 1
    ? `只输出 JSON：
{
  "copies": { "组名": ["文案", "文案"] }
}`
    : `只输出 JSON：
{
${metaAsk}  "copies": { "组名": ["文案", "文案"] }
}`;
  const metaGate = split && part === 1
    ? `- title、gate、主战场和主战场的依据是整批共用的，只由这一趟出；battlefieldWhy 必填，缺了整份作废
`
    : split
      ? ""
      : `- battlefieldWhy 必填，缺了整份作废
`;
  const gates = split
    ? `- 这一趟只要第 ${part} 段的文案：4 到 5 组，合计至少 ${TODAY_PART_TARGET} 条；${parts} 段合起来整批至少 ${TODAY_COPIES} 条
${tryGate}- 同一个钩子换几个字不算一条
${avoidGate}${metaGate}`
    : `- copies 分 8 到 10 组，合计至少 ${TODAY_COPIES} 条
${tryGate}- 同一个钩子换几个字不算一条
${avoidGate}${metaGate}`;
  return `
${head}
不要写缺口、提问、赛道格局、承接。这一步只出文案；平台外壳另有调用。
${shareLine}

# 客户
${customer.name} · ${customer.city || ""} · ${customer.pitch || ""}
猎场：${customer.hunt}
${fieldLine}

# 回音
${digest || "还没有回音依据。平铺出，不要假装知道哪条有效。gate 里写明「还没有回音依据」。"}

${avoidBlock}# 行业包（只当原料，不要再诊断一遍）
"""
${String(huntPack).slice(0, 8000)}
"""

# 合规
"""
${compliance}
"""

${ask}

硬闸门：
${gates}
{PLATFORM_BRIEF}
{MEDICAL_VOICE}
`.trim();
}

/* 各段并出来、去重之后还差几条时的补段：只要文案，禁出清单换成这一批已有的全部。 */
function todayTopUpPrompt({ customer, huntPack, compliance, have, need, avoid }) {
  return `
你在给已经合作的客户出本次这批货的收尾段：前面已经出好 ${have} 条，还差 ${need} 条，你补 ${need + 6} 条左右（多给的几条顶掉可能重复的）。
不要写缺口、提问、赛道格局、承接。只要文案，分成 2 个组。

# 客户
${customer.name} · ${customer.city || ""} · ${customer.pitch || ""}
猎场：${customer.hunt}

# 这一批已经出好的（禁出，换几个字也不算新的一条）
${avoid}

# 行业包（只当原料）
"""
${String(huntPack).slice(0, 5000)}
"""

# 合规
"""
${compliance}
"""

只输出 JSON：
{
  "copies": { "组名": ["文案", "文案"] }
}

硬闸门：
- 合计至少 ${need} 条
- 同一个钩子换几个字不算一条
`.trim();
}

/* 第 1 段垮掉时的元信息补票：一小趟只出整批共用的那几行，别让 40 多条文案陪葬。 */
function todayMetaPrompt({ customer, huntPack, digest }) {
  return `
你在给已经合作的客户出一批获客文案的整批说明。只要下面这几行，一句文案都不要出。

# 客户
${customer.name} · ${customer.city || ""} · ${customer.pitch || ""}
猎场：${customer.hunt}

# 回音
${digest || "还没有回音依据。gate 里写明「还没有回音依据」。"}

# 行业包（只当原料）
"""
${String(huntPack).slice(0, 4000)}
"""

只输出 JSON：
{
  "title": "本次这一批的一句话",
  "gate": "今日内容。有回音就写顺着哪边；没有就写还没有回音依据",
  "battlefields": ["主战场平台，最多 2 个"],
  "battlefieldWhy": "为什么是这两个、为什么暂时不铺别的：对着行业包第 7 节说清要截的人在哪、决策靠搜还是靠刷、量级撑不撑得起。两到三句，不许写空话"
}

硬闸门：
- battlefieldWhy 必填
`.trim();
}

/* 反馈收窄后「试」字头的条数不够 1/4 时的定向补组：补上了就满闸门，补不上也照常交付。 */
function todayTryPrompt({ customer, huntPack, compliance, need, avoid }) {
  return `
你在给已经合作的客户出本次这批货里「试新方向」的那部分：之前出的都顺着已有回音的方向，还差至少 ${need} 条探路的，你来补，组名必须以「试」开头，分成 1 到 2 个组。
不要写缺口、提问、赛道格局、承接。

# 客户
${customer.name} · ${customer.city || ""} · ${customer.pitch || ""}
猎场：${customer.hunt}

# 已经出好的（禁出，换几个字也不算新的一条）
${avoid}

# 行业包（只当原料）
"""
${String(huntPack).slice(0, 4000)}
"""

# 合规
"""
${compliance}
"""

只输出 JSON：
{
  "copies": { "试·组名": ["文案", "文案"] }
}

硬闸门：
- 组名全部以「试」开头，合计至少 ${need} 条
- 探路的是没人发过的方向，不是顺着已回音方向的第 4 种变体
`.trim();
}

/**
 * 存量客户的今日内容。不要求这家先有判断报告。
 * 有历史产出就吃回音；没有就吃猎场包，并如实说没依据。
 *
 * 50 条文案拆三段并行出，外壳按四类平台各一趟并行出：
 * 单次 12000 token 的大调用动辄十几分钟还常被截断（有的渠道根本不收这么大的
 * max_tokens，直接报错），拆小之后每一趟都短，坏一段也只重那一段，
 * 完成一份就能实报一份进度。
 */
export async function generateTodayDrop(customer, feedback = {}, { onProgress = () => {} } = {}) {
  onProgress(10, "正在检查模型与客户资料");
  if (!llmReady()) {
    throw new Error("模型还没配好，出不了今日内容。密钥只有管理员能配（设置 → 模型）；你不是管理员的话，把这句话转给他");
  }
  /* 存量建完就直接出今日内容，不走拓新那条出档路，所以这里往往才是这个猎场第一次被用到。
   * 和 generatePack 同一条承诺：没有包就现场长一个存下，永久可用；长不出来才拦，并说清原因。 */
  if (!readHunt(customer.hunt)) {
    try {
      onProgress(16, "正在建立新行业底稿");
      await growHuntPack(customer.hunt);
      onProgress(26, "行业底稿已准备好");
    } catch (err) {
      throw new Error(`${customer.hunt}这个猎场还没有行业包，现场也没长出来：${err.message || "没说原因"}`);
    }
  }
  const huntPack = readHunt(customer.hunt);
  if (!huntPack) throw new Error(`${customer.hunt}这个猎场还没有行业包，出不了今日内容`);

  const history = [...(customer.drops || []), ...(customer.packs || [])].filter(
    (p) => p.copies && Object.keys(p.copies).length,
  );
  const prev = history[0];
  onProgress(30, "正在整理历史内容与客户回音");
  const older = history.slice(1, 4);
  const digest = prev ? feedbackDigest(prev, feedback, older) : { groups: [], anyMark: false };
  const digestText = digest.anyMark
    ? digest.groups
        .map((g) => {
          const rows = g.rows.map(
            (r) => `- ${r.fb === "replied" ? "有回音" : r.fb === "dead" ? "没反应" : "还没发"} ${r.text}`,
          );
          return `## ${g.group}\n${rows.join("\n")}`;
        })
        .join("\n\n")
    : "";
  const compliance = readReference("compliance.md").slice(0, 6000);
  const lockedFields = (prev?.battlefields || []).slice(0, 2);
  /* 不满意就再点一批，点出来的得是新货：最近三批的文案原样列进提示词当禁出清单。 */
  const prevLines = history.slice(0, 3).flatMap((p) => Object.values(p.copies || {}).flat());
  const avoid = prevLines.length
    ? prevLines.slice(0, 150).map((l) => `- ${String(l).trim()}`).join("\n")
    : "";
  const platformBriefText = platformBrief(platformsForPack(huntPack));
  const medicalVoice = isMedicalHunt(huntPack) ? MEDICAL_VOICE : "";
  const base = { customer, huntPack, digest: digestText, compliance, battlefields: lockedFields, avoid };
  const render = (prompt) => prompt.replace("{PLATFORM_BRIEF}", platformBriefText).replace("{MEDICAL_VOICE}", medicalVoice);

  /* 进度按「条数」实报：每收一段/一类就把已生成条数报上去（如 文案 34/50 条）。
   * 百分比 = 已完成的份数（3 段文案 + 4 类外壳共 7 份，摊在 30→90），
   * 条数和百分比都来自真实收到的货，不靠猜。 */
  const TOTAL_UNITS = TODAY_PARTS + Object.keys(SHELL_KINDS).length;
  const SHELLS_TOTAL = SHELL_FLOOR["今日"] * Object.keys(SHELL_KINDS).length;
  let unitsDone = 0;
  let copiesGot = 0;
  let shellsGot = 0;
  const unitPct = () => 30 + Math.round((60 * unitsDone) / TOTAL_UNITS);
  const counts = () => ({ copiesGot, shellsGot, copiesTotal: TODAY_COPIES, shellsTotal: SHELLS_TOTAL });
  /* 救场记录：哪里缺了如实写下来随档交付，不因为缺件把整批炸掉。 */
  const shortfalls = [];

  /* 文案段。三段并行；哪一段没给出来就单独再补一轮，坏一段不牵连其他段。 */
  onProgress(unitPct(), `${TODAY_PARTS} 段文案同时开写（共 ${TOTAL_UNITS} 份活）`, counts());
  const askPart = (i) =>
    chatJson({
      system: "你只输出 JSON。",
      user: render(todayPrompt({ ...base, part: i + 1, parts: TODAY_PARTS })),
      accept: (raw) => {
        const n = copiesCount(raw.copies);
        return n >= TODAY_PART_FLOOR
          ? ""
          : `第 ${i + 1} 段只有 ${n} 条文案（这一段至少 ${TODAY_PART_FLOOR} 条）`;
      },
      label: `第 ${i + 1} 段文案`,
    });
  const notePart = (i, reply) => {
    unitsDone += 1;
    copiesGot += copiesCount(reply.copies);
    onProgress(unitPct(), `文案第 ${i + 1} 段已收到，已生成 ${copiesGot}/${TODAY_COPIES} 条`, counts());
    return reply;
  };
  const settledParts = await Promise.allSettled(
    Array.from({ length: TODAY_PARTS }, (_, i) => askPart(i).then((r) => notePart(i, r))),
  );
  const replies = new Array(TODAY_PARTS).fill(null);
  for (let i = 0; i < TODAY_PARTS; i += 1) {
    const settled = settledParts[i];
    if (settled.status === "fulfilled") {
      replies[i] = settled.value;
      continue;
    }
    try {
      replies[i] = await askPart(i).then((r) => notePart(i, r));
    } catch {
      shortfalls.push(`第 ${i + 1} 段文案没出来（重试过了），差的那部分靠补段和最低可交线兜住`);
    }
  }

  const merged = {};
  for (const reply of replies) {
    for (const [group, lines] of Object.entries(reply?.copies || {})) {
      if (Array.isArray(lines) && lines.length) merged[group] = [...(merged[group] || []), ...lines];
    }
  }
  let copies = dedupeCopies(merged, prevLines);
  let copyCount = Object.values(copies).flat().length;

  /* 第 1 段垮了但别的段活着时，元信息（标题/主战场）没人出：补一小趟，别让几十条文案陪葬。 */
  let raw = replies[0];
  if (!raw || !str(raw.title) || !str(raw.battlefieldWhy) || !list(raw.battlefields).length) {
    try {
      const meta = await chatJson({
        system: "你只输出 JSON。",
        user: render(todayMetaPrompt({ customer, huntPack, digest: digestText })),
        accept: (m) => (str(m.battlefieldWhy) ? "" : "缺 battlefieldWhy"),
        label: "整批元信息",
      });
      raw = { ...meta, copies: raw?.copies || {} };
    } catch {
      /* 元信息也补不上就按缺件如实报错——那确实什么都组不起来了 */
    }
  }

  /* 各段并出来还差几条：补段收尾，最多两轮，禁出清单换成这一批已有的全部。 */
  let topupRounds = 0;
  while (copyCount < TODAY_COPIES && topupRounds < 2) {
    topupRounds += 1;
    onProgress(unitPct(), `文案还差 ${TODAY_COPIES - copyCount} 条，第 ${topupRounds} 次补段收尾`, counts());
    const haveLines = Object.values(copies).flat();
    const avoidAll = [...prevLines, ...haveLines]
      .slice(0, 200)
      .map((l) => `- ${String(l).trim()}`)
      .join("\n");
    const need = TODAY_COPIES - copyCount;
    try {
      const extra = await chatJson({
        system: "你只输出 JSON。",
        user: todayTopUpPrompt({ customer, huntPack, compliance, have: copyCount, need, avoid: avoidAll }),
        accept: (raw2) => {
          const n = copiesCount(raw2.copies);
          return n >= need ? "" : `只给了 ${n} 条（要 ${need} 条）`;
        },
        label: "补文案",
      });
      copiesGot += copiesCount(extra.copies);
      for (const [group, lines] of Object.entries(extra.copies || {})) {
        if (Array.isArray(lines) && lines.length) copies[group] = [...(copies[group] || []), ...lines];
      }
      copies = dedupeCopies(copies, prevLines);
      copyCount = Object.values(copies).flat().length;
      onProgress(unitPct(), `补段已收到，已生成 ${copyCount}/${TODAY_COPIES} 条`, counts());
    } catch {
      /* 这轮补不上，直接看总数够不够最低可交线 */
      break;
    }
  }
  if (copyCount < TODAY_COPIES) {
    if (copyCount < TODAY_MIN_COPIES) {
      throw new Error(
        `这次模型给得太少：连补几段之后也只有 ${copyCount} 条文案（一批要 ${TODAY_COPIES} 条），没法当一批交。再点一次会换一批新的`,
      );
    }
    shortfalls.push(`文案凑到 ${copyCount}/${TODAY_COPIES} 条：补的几段没给够，差几条先照发`);
  }
  onProgress(unitPct(), `文案已收到 ${copyCount}/${TODAY_COPIES} 条，四类平台外壳同时开写`, counts());

  /* 外壳按四类平台并行，每类一趟只写自己那 20 条；哪类垮了单独补一轮，不牵连整批。 */
  const battlefields = lockedFields.length
    ? lockedFields
    : (Array.isArray(raw.battlefields) ? raw.battlefields : []).slice(0, 2);
  const askKind = (kind, { lenient = false } = {}) =>
    chatJson({
      system: "你只输出 JSON。",
      user: render(
        refillShellsPrompt({
          customer,
          huntPack,
          copies,
          battlefields,
          compliance,
          job: "今日内容",
          count: SHELL_FLOOR["今日"],
          onlyKind: kind,
        }),
      ),
      accept: (shellsRaw) => {
        const n = kindShellCount(shellsRaw.shells, kind);
        if (lenient) return n ? "" : `${kind}一条外壳都没给`;
        return n >= SHELL_FLOOR["今日"] ? "" : `${kind}只给了 ${n} 条外壳（至少 ${SHELL_FLOOR["今日"]} 条）`;
      },
      label: `${kind}外壳`,
    });
  const noteKind = (kind, reply) => {
    unitsDone += 1;
    shellsGot += kindShellCount(reply.shells, kind);
    onProgress(unitPct(), `${kind}外壳已收到，已生成外壳 ${shellsGot}/${SHELLS_TOTAL} 条`, counts());
    return reply;
  };
  const settledKinds = await Promise.allSettled(
    Object.keys(SHELL_KINDS).map((kind) => askKind(kind).then((r) => noteKind(kind, r))),
  );
  const shells = {};
  Object.keys(SHELL_KINDS).forEach((kind, i) => {
    const settled = settledKinds[i];
    if (settled.status === "fulfilled") Object.assign(shells, settled.value.shells || {});
  });
  /* 失败的和没铺满的类各补一轮（放宽验收：有几条收几条）；补不上的记下来随档交付。 */
  const toRepair = Object.keys(SHELL_KINDS).filter(
    (kind) => kindShellCount(shells, kind) < SHELL_FLOOR["今日"],
  );
  for (const kind of toRepair) {
    try {
      const reply = await askKind(kind, { lenient: true }).then((r) => noteKind(kind, r));
      Object.assign(shells, reply.shells || {});
    } catch {
      /* 补一轮还不出就记下来，别为这一类废掉整批 */
    }
  }
  const underKinds = Object.keys(SHELL_KINDS).filter(
    (kind) => kindShellCount(shells, kind) < SHELL_FLOOR["今日"],
  );
  for (const kind of underKinds) {
    shortfalls.push(
      `${kind}外壳只有 ${kindShellCount(shells, kind)}/${SHELL_FLOOR["今日"]} 条，这一类先少投点`,
    );
  }
  onProgress(unitPct(), `外壳已生成 ${shellsGot}/${SHELLS_TOTAL} 条，正在核对齐套`, counts());

  const relaxed = copyCount < TODAY_COPIES || underKinds.length > 0;
  let pack;
  try {
    pack = normalize(
      { ...raw, copies, battlefields, shells },
      {
        tier: "今日",
        customer,
        ...(relaxed ? { copyFloor: Math.max(copyCount, 1), shellFloors: Object.fromEntries(underKinds.map((k) => [k, 0])) } : {}),
      },
    );
  } catch (err) {
    throw new Error(`今日内容没出成：${err.message || "模型没说原因"}`);
  }

  /* 反馈收窄后「试」字头的量不够 1/4：定向补一组。补上了满闸门，补不上也不再为这个废整批。 */
  if (digest.anyMark) {
    const short = exploreShortfall(pack.copies);
    if (short) {
      onProgress(92, "试新方向的条数不够，正在补一组", counts());
      const haveLines = Object.values(pack.copies || {}).flat();
      const total = haveLines.length;
      const need = Math.ceil(total * 0.25) - Object.entries(pack.copies || {}).reduce(
        (n, [g, lines]) => n + (g.startsWith("试") ? lines.length : 0),
        0,
      );
      try {
        const extra = await chatJson({
          system: "你只输出 JSON。",
          user: todayTryPrompt({
            customer,
            huntPack,
            compliance,
            need: Math.max(need, 1),
            avoid: haveLines.slice(0, 150).map((l) => `- ${String(l).trim()}`).join("\n"),
          }),
          accept: (raw2) => {
            const got = Object.entries(raw2.copies || {}).reduce(
              (n, [g, lines]) => n + (String(g).startsWith("试") && Array.isArray(lines) ? lines.length : 0),
              0,
            );
            return got >= Math.max(need, 1) ? "" : `「试」开头的只给了 ${got} 条（要 ${Math.max(need, 1)} 条）`;
          },
          label: "补试新方向",
        });
        copiesGot += copiesCount(extra.copies);
        for (const [group, lines] of Object.entries(extra.copies || {})) {
          if (Array.isArray(lines) && lines.length) {
            pack.copies[str(group)] = [...(pack.copies[str(group)] || []), ...lines.map((t) => str(t))];
          }
        }
        onProgress(92, `补的试新方向已收到，共 ${Object.values(pack.copies).flat().length} 条`, counts());
      } catch {
        /* 补不上就带着话交付，不再为这个废掉整批 */
      }
      const still = exploreShortfall(pack.copies);
      if (still) shortfalls.push(still);
    }
  }

  pack.evidence = prev?.evidence || "C";
  pack.evidenceNote = digest.anyMark
    ? "今日内容。顺着标了有回音的方向出，没反应的方向已经砍掉。"
    : "今日内容。还没有回音依据，这一批是平铺补的。";
  pack.origin = { engine: "llm", tier: "今日", from: prev?.id || "", huntPack: `${customer.hunt}.md` };
  if (shortfalls.length) {
    pack.origin.shortfalls = shortfalls;
    pack.evidenceNote += `这一批有缺：${shortfalls.join("；")}。`;
  }
  pack.date = today();
  onProgress(94, "正在完成合规检查", counts());
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

/** 分镜要拍给哪些平台，就给哪些平台的比例。拍成横的等于白拍。 */
function boardFormats(pack) {
  const plats = [...new Set([...(pack.battlefields || []), ...Object.keys(pack.shells || {})])];
  return plats
    .map((p) => [p, formatFor(p)])
    .filter(([, shape]) => shape)
    .map(([p, shape]) => `- ${p}：${shape}`)
    .join("\n");
}

export async function generateBoards(pack, customer, { onProgress = () => {} } = {}) {
  onProgress(18, "正在挑选适合拍摄的文案");
  if (!llmReady()) throw new Error("模型还没配好，出不了档。密钥只有管理员能配（设置 → 模型）；你不是管理员的话，把这句话转给他");
  const huntPack = readHunt(customer.hunt);
  const picks = Object.values(pack.copies || {}).flat().slice(0, 12);
  if (!picks.length) throw new Error("这份档里没有文案，出不了分镜");

  onProgress(42, "正在生成分镜脚本");
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

${isMedicalHunt(huntPack) ? MEDICAL_VOICE : ""}

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

# 各平台出片规格，按 platform 那一栏对号入座，构图要留出这个比例
${boardFormats(pack)}
`.trim(),
    maxTokens: 4000,
  });
  onProgress(90, "分镜已生成，正在检查镜头是否齐全");
  return normalizeBoards(extractJson(text));
}
