import { describe, expect, it } from "vitest";
import { extractJson, normalize, validateHuntPack } from "./generate.mjs";
import { checkLength, checkPack, checkRedline, checkWatch } from "./check.mjs";
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
    shells: {
      巨量信息流: ["s1", "s2", "s3"],
      朋友圈: ["p1", "p2", "p3"],
      小红书: Array.from({ length: 3 }, (_, i) => ({ cover: `封${i}`, title: `题${i}`, body: `正文${i}` })),
    },
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

  it("四类平台铺不满就不是一份能发的档", () => {
    const thin = fastPack({ shells: { 巨量信息流: ["s1", "s2", "s3"] } });
    expect(() => normalize(thin, { tier: "快档", customer })).toThrow(/朋友圈至少 3 条/);
  });

  it("小红书缺封面大字或正文，等于退回一句话硬广，不许出", () => {
    const flat = fastPack();
    flat.shells["小红书"] = [{ title: "只有标题" }, { cover: "封", title: "题", body: "文" }, { cover: "封", title: "题", body: "文" }];
    expect(() => normalize(flat, { tier: "快档", customer })).toThrow(/三样/);
  });

  it("侦察档只出 3 条试探，不逼它铺满四类", () => {
    const recon = {
      title: "t", gate: "g", battlefields: ["巨量信息流"],
      demand: { who: "w", say: ["a"], search: ["b"], skip: ["c"] },
      copies: { 试探: ["1", "2", "3"] }, shells: { 巨量信息流: ["s"] },
      landscape: "赛道怎样", questions: [{ ask: "问1" }, { ask: "问2" }, { ask: "问3" }],
    };
    expect(normalize(recon, { tier: "侦察档", customer }).shells["巨量信息流"]).toHaveLength(1);
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

  it("正常中文不许误报：误报一次这个检查就没人信了", () => {
    for (const ok of [
      "第一家说能打", "第一步先看合同", "绝对不会这样说",
      "唯一的办法是先问", "这是过程，不是疗效承诺", "最后一步",
    ]) {
      expect(checkRedline(ok, "医美")).toEqual([]);
    }
  });

  it("真宣称一条都不许漏", () => {
    expect(checkRedline("全国第一品牌", "家装")).toContain("第一品牌");
    expect(checkRedline("绝对安全无风险", "医美")).toContain("绝对安全");
    expect(checkRedline("唯一指定机构", "教育")).toContain("唯一指定");
    expect(checkRedline("承诺100%见效", "教育")).toContain("100%");
  });

  it("行业包自己的红线跟着包走", () => {
    expect(checkRedline("无痛安全不反弹", "医美").length).toBeGreaterThan(0);
    expect(checkRedline("做之前问医生这一句", "医美")).toEqual([]);
    expect(checkRedline("保底年薪写进合同了吗", "教育")).toContain("保底年薪");
    expect(checkRedline("限时价长期挂着不换", "汽车")).toContain("限时价长期挂");
  });

  it("行业表里切碎的常用词不许当红线：这类误报最伤这个检查", () => {
    for (const [hunt, ok] of [
      ["汽车", "同样的配置，为什么两家差三万"],
      ["汽车", "续航和油耗按哪个工况标的"],
      ["本地生活", "开了十年的第一家老店，老板还在后厨"],
      ["城市更新-青年社区", "周末有演出，先问是不是每周都有"],
      ["家装", "先看合同第一条，再看报价"],
    ]) {
      expect(checkRedline(ok, hunt), `${hunt}：${ok}`).toEqual([]);
      expect(checkWatch(ok), `${hunt}：${ok}`).toEqual([]);
    }
  });

  it("两可的词降一档：不拦，只让销售自己看一眼", () => {
    for (const [hunt, text, word] of [
      ["医美", "麻醉谁做的，安全这块归谁管", "安全"],
      ["医美", "无痛这两个字，问清楚是哪种麻醉", "无痛"],
      ["宠物医院", "术后康复期怎么护理", "康复"],
      ["教育", "通过率是怎么算的，分母是谁", "通过率"],
      ["招商加盟", "回本周期他是按几成上座率算的", "回本周期"],
    ]) {
      expect(checkRedline(text, hunt), `${hunt}：${text}`).toEqual([]);
      expect(checkWatch(text), `${hunt}：${text}`).toContain(word);
    }
  });

  it("分镜的口播也要过检查：那也是要拍出来发的话", () => {
    const pack = {
      copies: {}, shells: {},
      boards: [{ platform: "巨量信息流", hook: "全城最便宜的报价单", close: "现在问", shots: [{ line: "承诺治愈" }] }],
    };
    const r = checkPack(pack, "宠物医院");
    expect(r.redline.map((x) => x.words).flat()).toEqual(expect.arrayContaining(["最便宜", "承诺治愈"]));
    expect(r.redline[0].where).toContain("分镜1");
  });

  it("同一句踩了红线就不再提醒看一眼，已经要改了", () => {
    const pack = { copies: { A: ["绝对安全，做完不反弹"] }, shells: {} };
    const r = checkPack(pack, "医美");
    expect(r.redline).toHaveLength(1);
    expect(r.watch).toEqual([]);
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

describe("手写行业模板", () => {
  it("小红书出封面大字、标题、正文三样，不是一句话", async () => {
    const { hengjiFastPack, bochiFastPack, chengmeiFastPack } = await import("./pitch-seed.mjs");
    const { packFromHunt } = await import("./pack-from-hunt.mjs");
    const packs = [
      hengjiFastPack(), bochiFastPack(), chengmeiFastPack(),
      packFromHunt({ id: "t", name: "X", hunt: "教育", pitch: "p", city: "广州" }),
      packFromHunt({ id: "t", name: "X", hunt: "本地高客单", pitch: "p", city: "广州" }),
    ];
    for (const p of packs) {
      for (const item of p.shells["小红书"] || []) {
        expect(typeof item).toBe("object");
        expect(item.cover).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.body).toBeTruthy();
      }
    }
  });

  it("模板自己不许踩红线，也不许超硬限制", async () => {
    const { hengjiFastPack, bochiFastPack, chengmeiFastPack } = await import("./pitch-seed.mjs");
    const { checkPack } = await import("./check.mjs");
    for (const [hunt, pack] of [
      ["家装", hengjiFastPack()], ["口腔", bochiFastPack()], ["医美", chengmeiFastPack()],
    ]) {
      const r = checkPack(pack, hunt);
      expect(r.redline).toEqual([]);
      expect(r.length.filter((x) => x.level === "hard")).toEqual([]);
    }
  });
});
