import { beforeEach, describe, expect, it, vi } from "vitest";

/* 不连真模型，把 llm.mjs 整个换成剧本，专验 generateTodayDrop 自己的接线：
 * 提示词里有没有 battlefieldWhy 和禁出清单、三段并行出不出得满 50 条、
 * 单段坏掉修不修得回来、差数时补不补段、补不上交不交短批、进度报不报条数。
 * 各段是并行调的，到达顺序不保证，所以剧本一律按提示词内容路由，不按调用序号。 */

const chatCalls = [];

const lineOf = (n) => `第${n}号钩子：报价单里第${n}项最坑`;

/* 每类外壳一个模板，键用真实平台名：小红书要三样，其余一类一句 */
const SHELL_TEMPLATES = {
  信息流: { 巨量信息流: (i) => `信息流外壳${i}` },
  朋友圈: { 朋友圈: (i) => `朋友圈外壳${i}` },
  小红书: { 小红书: (i) => ({ cover: `封面${i}`, title: `标题${i}`, body: `正文${i}` }) },
  短视频: { 快手: (i) => `短视频外壳${i}` },
};

/* 默认剧本：第 1 段带整批元信息 + 17 条，第 2 段 17 条，第 3 段 16 条 */
let meta = () => ({
  title: "这一批先打报价黑箱",
  gate: "还没有回音依据",
  battlefields: ["小红书", "巨量信息流"],
  battlefieldWhy: "要截的人在小红书搜得最多，决策是搜出来的；现在单城的量撑不起多平台",
});
let copiesFor = (part) => ({
  [part === 1 ? "A 避坑" : part === 2 ? "C 场景" : "E 过程"]: Array.from(
    { length: part === 3 ? 16 : 17 },
    (_, i) => lineOf(part === 1 ? i + 1 : part === 2 ? i + 101 : i + 201),
  ),
});
/* 置为数字 n 时，第 n 个提示词调用起返回坏输出（剧本里模拟模型抽风） */
let breakTopup = false;
let breakTry = false;
let breakPart3 = false;
let part3Fails = 0;

const BAD = "这不是JSON{{{";

function replyFor(user) {
  chatCalls.push(user);
  const kind = user.match(/出【(.+?)】这一类平台的外壳/);
  if (kind) {
    if (breakShell && breakShellTimes-- > 0) return BAD;
    const template = SHELL_TEMPLATES[kind[1]];
    const shells = Object.fromEntries(
      Object.entries(template).map(([plat, mk]) => [plat, Array.from({ length: 20 }, (_, i) => mk(i))]),
    );
    return JSON.stringify({ shells });
  }
  if (user.includes("收尾段")) {
    if (breakTopup) return BAD;
    return JSON.stringify({
      copies: { "G 补段": Array.from({ length: 25 }, (_, i) => lineOf(i + 301)) },
    });
  }
  if (user.includes("「试」开头")) {
    if (breakTry) return BAD;
    return JSON.stringify({
      copies: { "试·新地方": Array.from({ length: 12 }, (_, i) => `试探路线${i}号`) },
    });
  }
  if (user.includes("整批说明")) {
    return JSON.stringify({ ...meta() });
  }
  const part = Number(user.match(/第 (\d+) 段文案/)?.[1] || 1);
  if (part === 3 && breakPart3) {
    part3Fails += 1;
    if (part3Fails <= 2) return BAD;
  }
  return JSON.stringify({ ...meta(), copies: copiesFor(part) });
}

vi.mock("./llm.mjs", () => ({
  llmReady: () => true,
  chat: vi.fn(async ({ user }) => replyFor(user)),
}));

const { generateTodayDrop } = await import("./generate.mjs");

let breakShell = false;
let breakShellTimes = 0;

const customer = () => ({
  id: "t1",
  name: "测试客户",
  hunt: "家装",
  city: "广州",
  pitch: "老房翻新",
  packs: [],
  drops: [],
});

const flat = (pack) => Object.values(pack.copies).flat();
const copyPrompts = () =>
  chatCalls.filter(
    (u) => !u.includes("这一类平台的外壳") && !u.includes("收尾段") && !u.includes("整批说明"),
  );

beforeEach(() => {
  chatCalls.length = 0;
  breakTopup = false;
  breakTry = false;
  breakPart3 = false;
  breakShell = false;
  breakShellTimes = 0;
  part3Fails = 0;
  meta = () => ({
    title: "这一批先打报价黑箱",
    gate: "还没有回音依据",
    battlefields: ["小红书", "巨量信息流"],
    battlefieldWhy: "要截的人在小红书搜得最多，决策是搜出来的；现在单城的量撑不起多平台",
  });
  copiesFor = (part) => ({
    [part === 1 ? "A 避坑" : part === 2 ? "C 场景" : "E 过程"]: Array.from(
      { length: part === 3 ? 16 : 17 },
      (_, i) => lineOf(part === 1 ? i + 1 : part === 2 ? i + 101 : i + 201),
    ),
  });
});

describe("存量今日内容管线", () => {
  it("模型给了 battlefieldWhy 就能出满一整批：三段文案并成 50 条，四类外壳各一趟", async () => {
    const pack = await generateTodayDrop(customer(), {});
    expect(pack.tier).toBe("今日");
    expect(pack.battlefieldWhy).toContain("小红书");
    expect(flat(pack).length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(pack.shells).length).toBe(4);
    expect(pack.shells["小红书"]).toHaveLength(20);
    expect(pack.origin.shortfalls).toBeUndefined();
  });

  it("提示词必须向模型要 battlefieldWhy，而且只有第 1 段出整批元信息", async () => {
    await generateTodayDrop(customer(), {});
    const withMeta = copyPrompts().filter((u) => u.includes('"battlefieldWhy"'));
    expect(withMeta).toHaveLength(1);
    expect(withMeta[0]).toContain("第 1 段");
    expect(copyPrompts()).toHaveLength(3);
    for (const part of [1, 2, 3]) {
      expect(chatCalls.filter((u) => u.includes(`第 ${part} 段文案`))).toHaveLength(1);
    }
    // 三段各有自己的切入角度，免得并行出重
    expect(copyPrompts().filter((u) => u.includes("顾虑、误区")).length).toBe(1);
    expect(copyPrompts().filter((u) => u.includes("场景、过程")).length).toBe(1);
    expect(copyPrompts().filter((u) => u.includes("怎么选")).length).toBe(1);
  });

  it("缺 battlefieldWhy 时先补票元信息；补票也不给才报用户看得到的缺件", async () => {
    meta = () => ({
      title: "t",
      gate: "g",
      battlefields: ["小红书"],
    });
    await expect(generateTodayDrop(customer(), {})).rejects.toThrow(/主战场的依据/);
    // 元信息补票那一趟真的发出去过
    expect(chatCalls.some((u) => u.includes("整批说明"))).toBe(true);
  });

  it("一段连坏两次，单独补一轮修回来，整批不报废", async () => {
    breakPart3 = true;
    const pack = await generateTodayDrop(customer(), {});
    expect(flat(pack).length).toBeGreaterThanOrEqual(50);
    // 第 3 段被问到了三轮：原始 + 内部重试 + 段级补打
    expect(chatCalls.filter((u) => u.includes("第 3 段文案")).length).toBeGreaterThanOrEqual(3);
  });

  it("两段并出来不够 50 条时，补段兜住闸门", async () => {
    copiesFor = (part) => ({
      [`组${part}`]: Array.from({ length: 12 }, (_, i) => lineOf(i + part * 100)),
    });
    const pack = await generateTodayDrop(customer(), {});
    expect(flat(pack).length).toBeGreaterThanOrEqual(50);
    expect(chatCalls.some((u) => u.includes("收尾段"))).toBe(true);
    // 补段的禁出清单带着这一批已有的句子
    const topUp = chatCalls.find((u) => u.includes("收尾段"));
    expect(topUp).toContain("禁出");
  });

  it("补段轮空也不废整批：够最低可交线就交短批，缺多少记在档上", async () => {
    copiesFor = (part) => ({
      [`组${part}`]: Array.from({ length: part === 3 ? 12 : 17 }, (_, i) => lineOf(i + part * 100)),
    });
    breakTopup = true; // 补段两次都坏
    const pack = await generateTodayDrop(customer(), {});
    expect(flat(pack).length).toBe(46);
    expect(pack.origin.shortfalls.join()).toMatch(/46\/50/);
  });

  it("「试」组不够 1/4 时定向补一组；补不上也照常交付，不再为这个废掉整批", async () => {
    const first = await generateTodayDrop(customer(), {});
    chatCalls.length = 0;
    breakTry = true;
    copiesFor = (part) => ({
      [`组${part}`]: Array.from({ length: part === 3 ? 16 : 17 }, (_, i) => `新一批钩子${part}-${i}`),
    });
    const withHistory = customer();
    withHistory.drops = [first];
    const feedback = { [`${first.id}-A 避坑-0`]: "replied" };
    const second = await generateTodayDrop(withHistory, feedback);
    expect(flat(second).length).toBeGreaterThanOrEqual(50);
    expect(chatCalls.some((u) => u.includes("「试」开头"))).toBe(true);
    expect(second.origin.shortfalls.join()).toMatch(/试/);
  });

  it("再出一批：提示词带上前批禁出清单，产出里不再有前批的原句", async () => {
    const first = await generateTodayDrop(customer(), {});
    const firstLines = flat(first);
    const dupes = firstLines.slice(0, 15);
    chatCalls.length = 0;

    // 第二批的模型不老实：前 15 条原样抄第一批，后面换新的
    copiesFor = (part) => {
      const pool = [...dupes, ...Array.from({ length: 55 }, (_, i) => `全新钩子B${i}号`)];
      const start = (part - 1) * 24;
      return { [`组${part}`]: pool.slice(start, start + 24) };
    };
    const withHistory = customer();
    withHistory.drops = [first];
    const second = await generateTodayDrop(withHistory, {});

    const secondPrompts = copyPrompts();
    expect(secondPrompts).toHaveLength(3);
    for (const p of secondPrompts) {
      expect(p).toContain("禁出清单");
      expect(p).toContain(firstLines[0]);
    }

    const secondLines = flat(second);
    const firstSet = new Set(firstLines.map((l) => l.replace(/\s+/g, "")));
    expect(secondLines.length).toBeGreaterThanOrEqual(50);
    for (const l of secondLines) expect(firstSet.has(l.replace(/\s+/g, "")), l).toBe(false);
    expect(secondLines.some((l) => l.startsWith("全新钩子B"))).toBe(true);
  });

  it("进度按条数实报：文案 17/50、34/50 一路往上，百分比只涨不跌", async () => {
    const calls = [];
    await generateTodayDrop(customer(), {}, { onProgress: (...a) => calls.push(a) });
    const unitCalls = calls.filter(([, , extra]) => extra && typeof extra === "object");
    expect(unitCalls[0][0]).toBe(30);
    expect(unitCalls[0][2]).toEqual({ copiesGot: 0, shellsGot: 0, copiesTotal: 50, shellsTotal: 80 });
    // 外壳收齐那一格：90%，条数满
    const full = unitCalls.find(([p, , extra]) => p === 90 && extra.copiesGot === 50 && extra.shellsGot === 80);
    expect(full).toBeTruthy();
    // 阶段文案里带着条数比例
    expect(calls.some(([, stage]) => String(stage).includes("已生成 17/50 条"))).toBe(true);
    expect(calls.some(([, stage]) => String(stage).includes("已生成外壳 40/80 条"))).toBe(true);
    // 百分比单调不回退
    for (let i = 1; i < calls.length; i += 1) {
      expect(calls[i][0]).toBeGreaterThanOrEqual(calls[i - 1][0]);
    }
  });
});
