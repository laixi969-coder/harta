import { describe, expect, it } from "vitest";
import { extractJson, normalize, validateHuntPack } from "./generate.mjs";
import { checkLength, checkRedline } from "./check.mjs";
import { hasHunt, listHunts, safeHuntName } from "./industry.mjs";

const customer = { id: "c1", name: "测试客户", hunt: "家装", city: "广州", pitch: "老房翻新" };

function fastPack(over = {}) {
  return {
    title: "报价单上真正吃人的",
    gate: "读过官网之后出的",
    battlefields: ["巨量信息流", "朋友圈"],
    demand: { who: "老小区业主", say: ["a", "b"], search: ["c"], skip: ["d"] },
    gaps: Array.from({ length: 3 }, (_, i) => ({
      name: `缺口${i}`, fact: "f", cost: "c", cause: "z", verify: "v",
    })),
    copies: { A: Array.from({ length: 8 }, (_, i) => `文案${i}`), B: Array.from({ length: 8 }, (_, i) => `乙${i}`) },
    shells: { 巨量信息流: ["s1", "s2", "s3"] },
    breakdowns: [{ copy: "文案0", why: "因为" }],
    testPath: "t", supply: "s", honest: "h", next: ["n"],
    ...over,
  };
}

describe("模型返回的解析", () => {
  it("剥掉 ```json 围栏和前后废话", () => {
    const got = extractJson('好的，这是结果：\n```json\n{"a":1}\n```\n以上。');
    expect(got).toEqual({ a: 1 });
  });

  it("不是 JSON 就报错，不能悄悄放行", () => {
    expect(() => extractJson("我觉得应该这样做")).toThrow();
  });
});

describe("出档闸门", () => {
  it("合格的快档能通过", () => {
    const p = normalize(fastPack(), { tier: "快档", customer });
    expect(p.gaps).toHaveLength(3);
    expect(p.tier).toBe("快档");
    expect(p.id).toContain("c1");
  });

  it("缺口少于 3 条的快档不许出", () => {
    expect(() => normalize(fastPack({ gaps: [] }), { tier: "快档", customer })).toThrow(/缺口/);
  });

  it("文案不够 12 条的快档不许出", () => {
    expect(() => normalize(fastPack({ copies: { A: ["就一条"] } }), { tier: "快档", customer })).toThrow(/文案/);
  });

  it("写不出验证动作的诊断被丢掉，丢到不够就整份不许出", () => {
    const bad = fastPack({
      gaps: [{ name: "n", fact: "f", cost: "c", cause: "z", verify: "" }],
    });
    expect(() => normalize(bad, { tier: "快档", customer })).toThrow(/缺口/);
  });

  it("侦察档必须有提问和赛道格局，没有就不许出", () => {
    const recon = {
      title: "t", gate: "g", battlefields: ["巨量信息流"],
      demand: { who: "w", say: ["a"], search: ["b"], skip: ["c"] },
      copies: { 试探: ["1", "2", "3"] }, shells: { 巨量信息流: ["s"] },
      landscape: "赛道怎样", questions: [{ ask: "问1", why: "y" }, { ask: "问2" }, { ask: "问3" }],
    };
    expect(normalize(recon, { tier: "侦察档", customer }).questions).toHaveLength(3);
    expect(() => normalize({ ...recon, questions: [] }, { tier: "侦察档", customer })).toThrow(/提问/);
    expect(() => normalize({ ...recon, landscape: "" }, { tier: "侦察档", customer })).toThrow(/赛道格局/);
  });

  it("主战场最多两个，铺四个平台等于每个都跑不出模型", () => {
    const p = normalize(fastPack({ battlefields: ["a", "b", "c", "d"] }), { tier: "快档", customer });
    expect(p.battlefields).toHaveLength(2);
  });
});

describe("交付前检查", () => {
  it("绝对化用语和做不到的承诺会被拦下", () => {
    expect(checkRedline("全城最便宜，零增项", "家装")).toEqual(
      expect.arrayContaining(["最便宜", "零增项"]),
    );
  });

  it("行业包自己的红线跟着包走", () => {
    expect(checkRedline("无痛安全不反弹", "医美").length).toBeGreaterThan(0);
    expect(checkRedline("做之前问医生这一句", "医美")).toEqual([]);
  });

  it("只有真会被平台拦下的才算硬限制，其余是建议", () => {
    // 小红书标题 20 字是硬限制：超了发不出去
    const hard = checkLength("老房翻新避坑清单｜承重墙到底怎么认才不会拆错墙", "小红书", "title");
    expect(hard.level).toBe("hard");
    expect(hard.max).toBe(20);
    expect(checkLength("老房翻新避坑清单｜承重墙怎么认", "小红书", "title")).toBeNull();

    // 封面大字是图上的设计，平台不管，只给建议
    expect(checkLength("老房翻新前一定要看的避坑清单", "小红书", "cover").level).toBe("advise");

    // 正文平台不卡字数，写多长是手艺不是规矩，检查器不许拦
    expect(checkLength("字".repeat(3000), "小红书", "body")).toBeNull();

    // 朋友圈超了不是发不出去，是折叠
    const fold = checkLength("字".repeat(60), "朋友圈", "title");
    expect(fold.level).toBe("advise");
  });

  it("中文一字，英文数字半字", () => {
    expect(checkLength("字".repeat(21), "小红书", "title").n).toBe(21);
    expect(checkLength("a".repeat(40), "小红书", "title")).toBeNull();
  });
});

describe("猎场跟着行业包走", () => {
  it("有包才是猎场，没包的不许出现", () => {
    const hunts = listHunts();
    expect(hunts).toContain("家装");
    expect(hunts).not.toContain("_template");
    expect(hasHunt("口腔")).toBe(false);
  });

  it("行业名要当文件名，穿越和怪字符一律挡掉", () => {
    for (const bad of ["../../etc/passwd", "_template", "a/b", "", "家装<script>", "x".repeat(30), "..", "  "]) {
      expect(safeHuntName(bad)).toBe("");
    }
    for (const ok of ["月子中心", "宠物殡葬", "SaaS", "轻食-代餐", "3C数码配件"]) {
      expect(safeHuntName(ok)).toBe(ok);
    }
  });
});

describe("现场长出来的行业包", () => {
  const good = [
    "# 行业包：月子中心", "",
    "## 1. 钩子公式库", "内容", "## 2. 焦虑源清单", "内容", "## 3. 诱饵形态", "内容",
    "## 4. 信任背书范式", "内容", "## 5. 合规红线词表", "内容",
    "## 6. 考核指标定义 ← 断层线", "- 类型：**留资型**", "## 7. 主投平台与承接", "内容",
  ].join("\n");

  it("七节齐、定了口径、包头对得上，才准存进方法库", () => {
    expect(validateHuntPack(good, "月子中心")).toContain("月子中心");
  });

  it("缺一节就不许存", () => {
    expect(() => validateHuntPack(good.replace("## 5. 合规红线词表", "## X"), "月子中心")).toThrow(/缺第/);
  });

  it("没定留资型/成交型/到店核销型就不许存，引擎口径会对不上", () => {
    expect(() => validateHuntPack(good.replace("- 类型：**留资型**", "- 类型：待定"), "月子中心")).toThrow(/口径/);
  });

  it("包头写的行业跟要的对不上就不许存", () => {
    expect(() => validateHuntPack(good, "宠物殡葬")).toThrow(/对不上/);
  });

  it("模型返回一整行没换行的垃圾，不许存", () => {
    expect(() => validateHuntPack(good.replace(/\n/g, " "), "月子中心")).toThrow();
  });
});
