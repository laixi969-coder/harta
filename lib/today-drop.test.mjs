import { beforeEach, describe, expect, it, vi } from "vitest";

/* 不连真模型，把 llm.mjs 整个换成剧本，专验 generateTodayDrop 自己的接线：
 * 提示词里有没有 battlefieldWhy 和禁出清单、两批之间去不去得掉重、缺件拦不拦。 */

const chatCalls = [];

vi.mock("./llm.mjs", () => ({
  llmReady: () => true,
  chat: vi.fn(async ({ user }) => {
    chatCalls.push(user);
    return chatCalls.length === 1 ? copiesReply() : shellsReply();
  }),
}));

const { generateTodayDrop } = await import("./generate.mjs");

const lineOf = (n) => `第${n}号钩子：报价单里第${n}项最坑`;
const copiesReply = () =>
  JSON.stringify({
    title: "这一批先打报价黑箱",
    gate: "还没有回音依据",
    battlefields: ["小红书", "巨量信息流"],
    battlefieldWhy: "要截的人在小红书搜得最多，决策是搜出来的；现在单城的量撑不起多平台",
    copies: {
      "A 避坑": Array.from({ length: 10 }, (_, i) => lineOf(i + 1)),
      "B 报价": Array.from({ length: 10 }, (_, i) => lineOf(i + 11)),
      "C 过程": Array.from({ length: 10 }, (_, i) => lineOf(i + 21)),
      "D 武器": Array.from({ length: 10 }, (_, i) => lineOf(i + 31)),
      "E 收口": Array.from({ length: 10 }, (_, i) => lineOf(i + 41)),
    },
  });

const xiaohongshuShells = () =>
  Array.from({ length: 20 }, (_, i) => ({ cover: `封面${i}`, title: `标题${i}`, body: `正文${i}` }));
const shellsReply = () =>
  JSON.stringify({
    shells: {
      小红书: xiaohongshuShells(),
      信息流: Array.from({ length: 20 }, (_, i) => `信息流外壳${i}`),
      朋友圈: Array.from({ length: 20 }, (_, i) => `朋友圈外壳${i}`),
      短视频: Array.from({ length: 20 }, (_, i) => `短视频外壳${i}`),
    },
  });

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

beforeEach(() => {
  chatCalls.length = 0;
});

describe("存量今日内容管线", () => {
  it("模型给了 battlefieldWhy 就能出满一整批", async () => {
    const pack = await generateTodayDrop(customer(), {});
    expect(pack.tier).toBe("今日");
    expect(pack.battlefieldWhy).toContain("小红书");
    expect(flat(pack).length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(pack.shells).length).toBe(4);
  });

  it("提示词必须向模型要 battlefieldWhy，不然那份缺件档还会再犯", async () => {
    await generateTodayDrop(customer(), {});
    expect(chatCalls[0]).toContain('"battlefieldWhy"');
  });

  it("缺 battlefieldWhy 时报的就是用户看到的那句缺件", async () => {
    chatCalls.unshift = null;
    vi.mocked((await import("./llm.mjs")).chat).mockImplementationOnce(async () =>
      JSON.stringify({
        title: "t",
        gate: "g",
        battlefields: ["小红书"],
        copies: { 组: Array.from({ length: 50 }, (_, i) => `另一种钩子${i}`) },
      }),
    );
    await expect(generateTodayDrop(customer(), {})).rejects.toThrow(/主战场的依据/);
  });

  it("再出一批：提示词带上前批禁出清单，产出里不再有前批的原句", async () => {
    const first = await generateTodayDrop(customer(), {});
    const firstLines = flat(first);
    const dupes = firstLines.slice(0, 15);

    // 第二批的模型不老实，前 15 条原样抄第一批，后面换新的
    const copiesReply2 = () => {
      const raw = {
        title: "第二批",
        gate: "还没有回音依据",
        battlefields: ["小红书", "巨量信息流"],
        battlefieldWhy: "同前",
        copies: {},
      };
      const all = [...dupes, ...Array.from({ length: 50 }, (_, i) => `全新钩子B${i}号`)];
      for (let g = 0; g < 5; g++) raw.copies[`组${g}`] = all.slice(g * 13, (g + 1) * 13);
      return JSON.stringify(raw);
    };
    vi.mocked((await import("./llm.mjs")).chat).mockImplementationOnce(async ({ user }) => {
      chatCalls.push(user);
      return copiesReply2();
    });

    const withHistory = customer();
    withHistory.drops = [first];
    const second = await generateTodayDrop(withHistory, {});

    // 这一批准点里倒数第二个调用才是文案提示词（最后一个是外壳）
    const secondPrompt = chatCalls[chatCalls.length - 2];
    expect(secondPrompt).toContain("禁出清单");
    expect(secondPrompt).toContain(firstLines[0]);

    const secondLines = flat(second);
    const firstSet = new Set(firstLines.map((l) => l.replace(/\s+/g, "")));
    expect(secondLines.length).toBeGreaterThanOrEqual(50);
    for (const l of secondLines) expect(firstSet.has(l.replace(/\s+/g, "")), l).toBe(false);
    expect(secondLines.some((l) => l.startsWith("全新钩子B"))).toBe(true);
  });
});
