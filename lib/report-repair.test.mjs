import { beforeEach, describe, expect, it, vi } from "vitest";

/* 不连真模型，专验判断报告的交付自查：模型把红线写进成品时，
 * 先让它自己改一遍；改得掉就干净交付，改不掉就如实带着检查结果给人。 */

const chatCalls = [];

const lineOf = (n) => `第${n}条：报价单里第${n}项最坑`;

function fastPackReply({ badLine = true } = {}) {
  const shells = {};
  for (const [plat, mk] of [
    ["巨量信息流", (i) => `信息流${i}`],
    ["朋友圈", (i) => `朋友圈${i}`],
    ["小红书", (i) => ({ cover: `封${i}`, title: `题${i}`, body: `正文${i}` })],
    ["快手", (i) => `快手${i}`],
  ]) {
    shells[plat] = Array.from({ length: 3 }, (_, i) => mk(i));
  }
  return JSON.stringify({
    title: "防水报价黑箱",
    gate: "看过在投素材后的快档",
    battlefields: ["小红书", "巨量信息流"],
    battlefieldWhy: "客群在小红书搜攻略密度最高，决策靠搜；现在的量级先不铺多平台",
    landscape: "",
    demand: {
      who: "老房翻新的业主",
      say: ["防水怎么做才不漏"],
      search: ["老房防水"],
      skip: ["精装新房业主"],
    },
    gaps: Array.from({ length: 3 }, (_, i) => ({
      name: `缺口${i}`,
      fact: "现状",
      cost: "代价",
      cause: "原因",
      verify: "验证动作",
    })),
    copies: {
      A: [
        badLine ? "我们承诺全城行业第一的防水质量" : lineOf(99),
        ...Array.from({ length: 7 }, (_, i) => lineOf(i + 1)),
      ],
      B: Array.from({ length: 7 }, (_, i) => lineOf(i + 20)),
    },
    shells,
    landing: {
      way: "先给一页检查清单",
      firstScreen: "先把漏水点找对",
      form: ["漏水的位置"],
      reward: "一页自查清单",
      leak: "一上来就要电话",
      firstTouch: {
        open: [
          { from: "表单", say: "您漏水的是哪一面墙" },
          { from: "电话", say: "先拍张现场照发我" },
        ],
        pushback: [
          { said: "你们先报价", reply: "漏水点没定位，报了也是虚的" },
          { said: "再考虑下", reply: "清单您先拿着，漏了再说" },
        ],
      },
      rewardOutline: ["清单一", "清单二", "清单三", "清单四"],
    },
  });
}

let packReply = () => fastPackReply();
let repairReply = () => ({});

function replyFor(user) {
  chatCalls.push(user);
  if (user.includes("改好的句子")) return JSON.stringify({ 改好的句子: repairReply() });
  return packReply();
}

vi.mock("./llm.mjs", () => ({
  llmReady: () => true,
  chat: vi.fn(async ({ user }) => replyFor(user)),
}));

const { generatePack } = await import("./generate.mjs");

const customer = () => ({
  id: "c1",
  name: "测试客户",
  hunt: "家装",
  city: "广州",
  pitch: "老房翻新防水",
  packs: [],
  drops: [],
});

const material = "这是客户自己的在投素材正文，足够长，能当快档的依据。".repeat(4);

beforeEach(() => {
  chatCalls.length = 0;
  packReply = () => fastPackReply();
  repairReply = () => ({});
});

describe("判断报告交付自查", () => {
  it("成品踩了红线先自动修：修完 checks 干净，原句留底在 origin.repairs", async () => {
    repairReply = () => ({ "A|0": "防水做完十二年，老客户介绍来的最多" });
    const pack = await generatePack(customer(), { material });
    expect(pack.checks.redline).toEqual([]);
    expect(pack.origin.repairs).toHaveLength(1);
    expect(pack.origin.repairs[0]).toMatchObject({ where: "文案 · A" });
    expect(pack.origin.repairs[0].was).toContain("行业第一");
    expect(pack.copies.A[0]).toBe("防水做完十二年，老客户介绍来的最多");
  });

  it("改不动就不拦交付：检查结果原样在，销售看到的是同一份点名", async () => {
    const pack = await generatePack(customer(), { material });
    expect(pack.checks.redline).toHaveLength(1);
    expect(pack.checks.redline[0].words).toContain("行业第一");
    expect(pack.copies.A[0]).toContain("行业第一");
    // 自查的提示词点名了红线词和原句
    const repairPrompt = chatCalls.find((u) => u.includes("改好的句子"));
    expect(repairPrompt).toContain("行业第一");
  });

  it("没踩红线就不多花一趟调用", async () => {
    packReply = () => fastPackReply({ badLine: false });
    const pack = await generatePack(customer(), { material });
    expect(pack.checks.redline).toEqual([]);
    expect(chatCalls).toHaveLength(1);
  });
});
