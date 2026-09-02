import { describe, expect, it } from "vitest";
import { exploreShortfall, extractJson, feedbackDigest, normalize, validateHuntPack } from "./generate.mjs";
import {
  checkLength,
  checkPack,
  checkRedline,
  checkSensitiveFields,
  checkStageHint,
  checkWatch,
  hasHardBlock,
} from "./check.mjs";
import { hasHunt, huntGuardrails, huntSource, listHunts, safeHuntName } from "./industry.mjs";

const LANDING_OK = () => ({
  way: "表单留资",
  firstScreen: "先看报价单漏了哪三项",
  reward: "一份报价对照表",
  firstTouch: {
    open: [
      { from: "表单留资", say: "对照表发你了，先看第三项" },
      { from: "电话", say: "不占用时间，就说三句" },
    ],
    pushback: [
      { said: "我先看看", reply: "那我把表发你，看完有一项对不上再找我" },
      { said: "多少钱", reply: "报价得看拆改量，先按表把项对齐" },
    ],
  },
  rewardOutline: ["第一栏放什么", "第二栏放什么", "第三栏放什么", "第四栏客户自己填真实数据"],
});

const customer = { id: "c1", name: "测试客户", hunt: "家装", city: "广州", pitch: "老房翻新" };

function fastPack(over = {}) {
  return {
    title: "报价单上真正吃人的",
    gate: "读过官网之后出的",
    battlefields: ["巨量信息流", "朋友圈"],
    battlefieldWhy: "按行业包第 7 节：本地客群密度与定向匹配，冷启动先聚焦这两个平台",
    demand: { who: "老小区业主", say: ["a", "b"], search: ["c"], skip: ["d"] },
    gaps: Array.from({ length: 3 }, (_, i) => ({
      name: `缺口${i}`, fact: "f", cost: "c", cause: "z", verify: "v",
    })),
    copies: { A: Array.from({ length: 8 }, (_, i) => `文案${i}`), B: Array.from({ length: 8 }, (_, i) => `乙${i}`) },
    // 下限 15，这里给 16
    shells: {
      巨量信息流: ["s1", "s2", "s3"],
      朋友圈: ["p1", "p2", "p3"],
      小红书: Array.from({ length: 3 }, (_, i) => ({ cover: `封${i}`, title: `题${i}`, body: `正文${i}` })),
    },
    breakdowns: [{ copy: "文案0", why: "因为" }],
    landing: LANDING_OK(),
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

  it("文案不够 15 条的快档不许出：闸门比提示词松，模型就照闸门给", () => {
    const twelve = { A: Array.from({ length: 12 }, (_, i) => `文案${i}`) };
    expect(() => normalize(fastPack({ copies: twelve }), { tier: "快档", customer })).toThrow(/至少 15 条文案/);
    const fifteen = { A: Array.from({ length: 15 }, (_, i) => `文案${i}`) };
    expect(() => normalize(fastPack({ copies: fifteen }), { tier: "快档", customer })).not.toThrow();
  });

  it("写不出验证动作的诊断被丢掉，丢到不够就整份不许出", () => {
    const bad = fastPack({
      gaps: [{ name: "n", fact: "f", cost: "c", cause: "z", verify: "" }],
    });
    expect(() => normalize(bad, { tier: "快档", customer })).toThrow(/缺口/);
  });

  it("侦察档必须有提问和赛道格局，没有就不许出", () => {
    const recon = {
      title: "t", gate: "g", battlefields: ["巨量信息流"], battlefieldWhy: "行业包第 7 节：客群密度与定向匹配，冷启动聚焦",
      demand: { who: "w", say: ["a"], search: ["b"], skip: ["c"] },
      copies: { 试探: ["1", "2", "3"] }, shells: { 巨量信息流: ["s1", "s2", "s3"] },
      landing: LANDING_OK(),
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

  it("侦察档不铺四类，但主战场每个要满 3 条：3 条文案各有各的成品", () => {
    const recon = (shells) => ({
      title: "t", gate: "g", battlefields: ["巨量信息流", "小红书"], battlefieldWhy: "行业包第 7 节：客群密度与定向匹配，冷启动聚焦",
      demand: { who: "w", say: ["a"], search: ["b"], skip: ["c"] },
      copies: { 试探: ["1", "2", "3"] }, shells,
      landing: LANDING_OK(),
      landscape: "赛道怎样", questions: [{ ask: "问1" }, { ask: "问2" }, { ask: "问3" }],
    });
    // 实跑那次：每个主战场只给了 1 条
    expect(() => normalize(recon({ 巨量信息流: ["a"], 小红书: [{ cover: "c", title: "t", body: "b" }] }), { tier: "侦察档", customer }))
      .toThrow(/只给了 1 条外壳/);
    // 满 3 条就过，不要求朋友圈和短视频
    const ok = recon({
      巨量信息流: ["a", "b", "c"],
      小红书: Array.from({ length: 3 }, (_, i) => ({ cover: `c${i}`, title: `t${i}`, body: `b${i}` })),
    });
    expect(() => normalize(ok, { tier: "侦察档", customer })).not.toThrow();
  });

  it("侦察档只出 3 条试探，不逼它铺满四类", () => {
    const recon = {
      title: "t", gate: "g", battlefields: ["巨量信息流"], battlefieldWhy: "行业包第 7 节：客群密度与定向匹配，冷启动聚焦",
      demand: { who: "w", say: ["a"], search: ["b"], skip: ["c"] },
      copies: { 试探: ["1", "2", "3"] }, shells: { 巨量信息流: ["s1", "s2", "s3"] },
      landing: LANDING_OK(),
      landscape: "赛道怎样", questions: [{ ask: "问1" }, { ask: "问2" }, { ask: "问3" }],
    };
    expect(normalize(recon, { tier: "侦察档", customer }).shells["巨量信息流"]).toHaveLength(3);
  });

  it("没有承接就不许出：只解决点击不解决线索的档，等于让客户白花钱", () => {
    expect(() => normalize(fastPack({ landing: null }), { tier: "快档", customer })).toThrow(/承接/);
    // 第一屏那句话和兑现物是硬的，缺一样整个承接就不算数
    expect(() => normalize(fastPack({ landing: { way: "表单留资", firstScreen: "先看这个" } }), { tier: "快档", customer })).toThrow(/承接/);
    expect(() => normalize(fastPack({ landing: { way: "表单留资", reward: "一张表" } }), { tier: "快档", customer })).toThrow(/承接/);
  });

  it("承诺了一份东西就得给目录，诊断出漏水点就得给话术", () => {
    // leak 自己会写「一上来就推销，信任直接碎掉」——诊断出病不给药，销售照样那么干
    const noTouch = fastPack();
    noTouch.landing = { ...LANDING_OK(), firstTouch: { open: [{ from: "表单", say: "一句" }], pushback: [] } };
    expect(() => normalize(noTouch, { tier: "快档", customer })).toThrow(/首触开场/);

    const noReply = fastPack();
    noReply.landing = { ...LANDING_OK(), firstTouch: { ...LANDING_OK().firstTouch, pushback: [] } };
    expect(() => normalize(noReply, { tier: "快档", customer })).toThrow(/被推开怎么接/);

    // 承诺了一份清单却不给目录，销售根本发不出来
    const noOutline = fastPack();
    noOutline.landing = { ...LANDING_OK(), rewardOutline: ["就一栏"] };
    expect(() => normalize(noOutline, { tier: "快档", customer })).toThrow(/兑现物目录/);

    const ok = normalize(fastPack(), { tier: "快档", customer });
    expect(ok.landing.firstTouch.open).toHaveLength(2);
    expect(ok.landing.firstTouch.pushback).toHaveLength(2);
    expect(ok.landing.rewardOutline).toHaveLength(4);
  });

  it("表单最多问 3 项：多一栏掉一档转化", () => {
    const many = fastPack();
    many.landing.form = ["a", "b", "c", "d", "e"];
    expect(normalize(many, { tier: "快档", customer }).landing.form).toHaveLength(3);
  });

  it("主战场最多两个，铺四个平台等于每个都跑不出模型", () => {
    const p = normalize(fastPack({ battlefields: ["a", "b", "c", "d"] }), { tier: "快档", customer });
    expect(p.battlefields).toHaveLength(2);
  });
});

describe("补给档：付了钱之后的持续供货", () => {
  function refillPack(over = {}) {
    const shells = {};
    for (const [p, mk] of [
      ["巨量信息流", (i) => `信息流${i}`],
      ["朋友圈", (i) => `朋友圈${i}`],
      ["小红书", (i) => ({ cover: `封${i}`, title: `题${i}`, body: `正文${i}` })],
      ["快手", (i) => `快手${i}`],
    ]) {
      shells[p] = Array.from({ length: 20 }, (_, i) => mk(i));
    }
    return {
      title: "第二批往合同方向走",
      gate: "第 2 批补给",
      battlefields: ["巨量信息流", "朋友圈"],
      battlefieldWhy: "行业包第 7 节：客群密度与定向匹配，冷启动聚焦",
      demand: { who: "老小区业主", say: ["a"], search: ["b"], skip: ["c"] },
      gaps: [{ name: "n", fact: "f", cost: "c", cause: "z", verify: "v" }],
      copies: Object.fromEntries(
        ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((g) => [g, Array.from({ length: 5 }, (_, i) => `${g}${i}`)]),
      ),
      shells,
      breakdowns: [{ copy: "A0", why: "接的是上一批" }],
      landing: LANDING_OK(),
      testPath: "t", supply: "s", honest: "h", next: ["n"],
      ...over,
    };
  }

  it("主战场必须有外壳：说了去打百度又不给百度能发的东西，等于没给", () => {
    const bad = fastPack({ battlefields: ["小红书", "百度"] });
    expect(() => normalize(bad, { tier: "快档", customer })).toThrow(/百度是主战场却一条外壳都没有/);
    bad.shells["百度"] = ["b1", "b2", "b3"];
    expect(() => normalize(bad, { tier: "快档", customer })).not.toThrow();
  });

  it("主战场必须带依据：没有就不许出，超 300 字截断", () => {
    const noWhy = fastPack({ battlefieldWhy: "" });
    expect(() => normalize(noWhy, { tier: "快档", customer })).toThrow(/主战场的依据/);
    noWhy.battlefieldWhy = "依据".repeat(200);
    const ok = normalize(noWhy, { tier: "快档", customer });
    expect(ok.battlefieldWhy).toHaveLength(300);
    expect(ok.battlefieldWhy.endsWith("依据")).toBe(true);
  });

  it("四类平台各 20 条才算一批货，不是只补小红书", () => {
    const p = normalize(refillPack(), { tier: "补给档", customer });
    expect(p.shells["小红书"]).toHaveLength(20);
    expect(p.shells["巨量信息流"]).toHaveLength(20);
    expect(p.tier).toBe("补给档");
  });

  it("哪一类不够 20 条都不许出：断一类就是断供", () => {
    for (const [kind, plats] of [
      ["小红书", ["小红书"]],
      ["朋友圈", ["朋友圈"]],
      ["信息流", ["巨量信息流"]],
      ["短视频", ["巨量信息流", "快手"]],
    ]) {
      const bad = refillPack();
      for (const p of plats) bad.shells[p] = bad.shells[p].slice(0, 3);
      expect(() => normalize(bad, { tier: "补给档", customer }), kind).toThrow(
        new RegExp(`${kind}至少 20 条`),
      );
    }
  });

  it("一个平台可以顶两类：巨量满 20 条，短视频那一类就不算断供", () => {
    const only = refillPack();
    only.shells["快手"] = only.shells["快手"].slice(0, 1);
    expect(() => normalize(only, { tier: "补给档", customer })).not.toThrow();
  });

  it("提案档还是 3 条：样品就该少，别拿补货的量去做提案", () => {
    const pitch = refillPack({
      gaps: Array.from({ length: 3 }, (_, i) => ({ name: `n${i}`, fact: "f", cost: "c", cause: "z", verify: "v" })),
    });
    for (const k of Object.keys(pitch.shells)) pitch.shells[k] = pitch.shells[k].slice(0, 3);
    expect(() => normalize(pitch, { tier: "快档", customer })).not.toThrow();
  });

  it("补给档不要求重出缺口和提问，那是上一批带过来的", () => {
    const p = normalize(refillPack({ gaps: [], questions: [] }), { tier: "补给档", customer });
    expect(p.gaps).toEqual([]);
  });

  it("文案不到 50 条不算一批：闸门和提示词同一个数，模型照闸门给", () => {
    expect(() => normalize(refillPack({ copies: { A: ["就一条"] } }), { tier: "补给档", customer })).toThrow(
      /至少 50 条文案/,
    );
    // 刚好 50 条就过线
    const fifty = Object.fromEntries(["A", "B"].map((g) => [g, Array.from({ length: 25 }, (_, i) => `${g}${i}`)]));
    expect(() => normalize(refillPack({ copies: fifty }), { tier: "补给档", customer })).not.toThrow();
  });

  function todayGoods(over = {}) {
    const shells = {};
    for (const [p, mk] of [
      ["巨量信息流", (i) => `信息流${i}`],
      ["朋友圈", (i) => `朋友圈${i}`],
      ["小红书", (i) => ({ cover: `封${i}`, title: `题${i}`, body: `正文${i}` })],
      ["快手", (i) => `快手${i}`],
    ]) {
      shells[p] = Array.from({ length: 20 }, (_, i) => mk(i));
    }
    return {
      title: "今日可发",
      gate: "今日内容，还没有回音依据",
      battlefields: ["巨量信息流", "朋友圈"],
      battlefieldWhy: "行业包第 7 节：客群密度与定向匹配，冷启动聚焦",
      copies: Object.fromEntries(["A", "B"].map((g) => [g, Array.from({ length: 25 }, (_, i) => `${g}${i}`)])),
      shells,
      ...over,
    };
  }

  it("今日内容不要求判断报告那套缺口和承接，一批货是 50 条加四类各 20 条外壳", () => {
    const p = normalize(todayGoods(), { tier: "今日", customer });
    expect(p.tier).toBe("今日");
    expect(Object.values(p.copies).flat()).toHaveLength(50);
    expect(p.shells["小红书"]).toHaveLength(20);
    expect(p.gaps).toEqual([]);
    expect(p.landing).toBeNull();
  });

  it("今日内容文案不到 50 条或缺一类平台，整份作废", () => {
    expect(() => normalize(todayGoods({ copies: { A: ["就一条"] } }), { tier: "今日", customer })).toThrow(
      /至少 50 条文案/,
    );
    const thin = todayGoods();
    thin.shells.朋友圈 = [];
    thin.shells.巨量信息流 = thin.shells.巨量信息流.slice(0, 3);
    expect(() => normalize(thin, { tier: "今日", customer })).toThrow(/朋友圈至少 20 条|信息流至少 20 条/);
  });

  it("探索配额要写进闸门，不能只卡有没有：模型照闸门给，不照提示词给", () => {
    const mk = (n) => Array.from({ length: n }, (_, i) => `c${i}`);
    // 实跑那次：五组各 6 条 + 试组 5 条 = 5/35，14%，收得太窄
    expect(exploreShortfall({ A: mk(6), B: mk(6), C: mk(6), D: mk(6), E: mk(6), "试·隐私": mk(5) }))
      .toMatch(/5\/35/);
    // 一组都没留
    expect(exploreShortfall({ A: mk(20), B: mk(10) })).toMatch(/没留试新方向/);
    // 30 + 10 = 25%，刚好过线
    expect(exploreShortfall({ A: mk(30), "试·新方向": mk(10) })).toBe("");
    // 分两组装也算
    expect(exploreShortfall({ A: mk(20), "试·甲": mk(4), "试·乙": mk(4) })).toBe("");
  });

  it("反馈整理：有回音、没反应、还没发分清楚，没标过就说没标过", () => {
    const prev = { id: "p1", copies: { A: ["甲", "乙", "丙"] } };
    const none = feedbackDigest(prev, {});
    expect(none.anyMark).toBe(false);

    const some = feedbackDigest(prev, { "p1-A-0": "replied", "p1-A-1": "dead" });
    expect(some.anyMark).toBe(true);
    expect(some.groups[0].replied.map((r) => r.text)).toEqual(["甲"]);
    expect(some.groups[0].dead.map((r) => r.text)).toEqual(["乙"]);
    expect(some.groups[0].rows[2].fb).toBe("");
  });

  it("反馈整理吃得更早的批次：同组合并，标清来自哪批", () => {
    const prev = { id: "p2", deliveredAt: "2026-08-25", copies: { A: ["新"] } };
    const older = [
      { id: "p1", deliveredAt: "2026-08-18", copies: { A: ["旧一", "旧二"], B: ["另一组"] } },
    ];
    const d = feedbackDigest(prev, { "p1-A-0": "replied" }, older);
    expect(d.anyMark).toBe(true);
    const a = d.groups.find((g) => g.group === "A");
    expect(a.rows).toHaveLength(3);
    expect(a.replied.map((r) => r.text)).toEqual(["旧一"]);
    expect(a.rows[0].when).toBe("");
    expect(a.rows[1].when).toBe("08-18");
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

  it("明说不是的时候不算踩线：这个否定检测原来是死的，走到头永远返回没否定", () => {
    for (const [hunt, ok] of [
      ["招商加盟", "开实体面馆哪有什么稳赚的事，把成本算明白已经不错"],
      ["教育", "没有包过这回事"],
      ["家装", "别信零增项这种话"],
      ["家装", "谈不上最便宜，只能说明白"],
    ]) {
      expect(checkRedline(ok, hunt), `${hunt}：${ok}`).toEqual([]);
    }
    // 只否定前半句的，后半句照样拦
    expect(checkRedline("我们不是最便宜的，但是全城最低价", "家装")).toEqual(["最低价"]);
    expect(checkRedline("最便宜是假的，我们才是最便宜", "家装")).toEqual(["最便宜"]);
  });

  it("「最好」大多是副词，不拦只提示", () => {
    expect(checkRedline("怕被同事看出来，最好选在小长假前做", "医美")).toEqual([]);
    expect(checkWatch("最好选在小长假前做")).toContain("最好");
    // 真宣称的那几个还是硬拦
    expect(checkRedline("全城最便宜，最佳选择", "家装")).toEqual(
      expect.arrayContaining(["最便宜", "最佳"]),
    );
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

  it("文案里混进镜头提示要标出来：销售复制这一栏会把括号一起发出去", () => {
    expect(checkStageHint("（镜头对着刚拆开的墙面）你看这老电线")).toBe("（镜头对着刚拆开的墙面）");
    expect(checkStageHint("(画面：报价单特写)这3项最容易加钱")).toBe("(画面：报价单特写)");
    // 正常括号不许误报
    for (const ok of ["广州老房翻新（含拆改）报价单里这3项", "定金（不是全款）能退几天"]) {
      expect(checkStageHint(ok), ok).toBe("");
    }
    const r = checkPack({ copies: { A: ["（镜头对着墙）这堵墙别拆"] }, shells: {} }, "家装");
    expect(r.hints).toHaveLength(1);
    expect(r.hints[0].hint).toBe("（镜头对着墙）");
  });

  it("医疗猎场的第一人称不许写结果：平台要活人感，法律不许讲疗效", () => {
    // 《广告法》16 条禁医疗药品广告利用患者名义作证明
    expect(checkWatch("做完治疗复查那次，医生说已经转阴了", "医药")).toContain("转阴");
    expect(checkWatch("做完第三天就不疼了", "医美")).toContain("不疼了");
    expect(checkWatch("手术之后狗狗恢复得很好", "宠物医院")).toContain("恢复得很好");
    // 写过程不写结局的，放行
    for (const [hunt, ok] of [
      ["医药", "复查时间怎么排我列了个表"],
      ["医美", "面诊那天我先问了操作的人是谁"],
      ["宠物医院", "术后复查该问医生哪三句"],
    ]) {
      expect(checkWatch(ok, hunt), `${hunt}：${ok}`).toEqual([]);
    }
    // 同一句话在非医疗猎场完全正常，不许跨行业误报
    expect(checkWatch("拆完那面墙之后就不疼了", "家装")).toEqual([]);
    expect(checkWatch("学完那门课我算是全好了", "教育")).toEqual([]);
  });

  it("医药的确定性禁区直接硬拦：HPV 结果承诺和处方药公众推广不能只提醒", () => {
    for (const text of [
      "三个月清除HPV",
      "这套方案能让HPV三个月转阴",
      "靶向药点这里咨询",
      "PD-1加微了解",
      "了解 pd‑1 新方案",
      "三个月清除 HPV",
      "靶 向 药点这里咨询",
      "医生推荐，完全无副作用",
      "不要错过靶向药咨询",
    ]) {
      expect(checkRedline(text, "医药").length, text).toBeGreaterThan(0);
    }
    expect(checkRedline("复诊前把要问医生的三件事写下来", "医药")).toEqual([]);
    expect(checkRedline("请按获批说明书了解非处方药", "医药")).toEqual([]);
  });

  it("医药承接也过检查，普通表单不能收病历、HPV 结果或基因报告", () => {
    const pack = {
      copies: { A: ["复诊前先列好问题"] },
      shells: {},
      landing: {
        firstScreen: "上传报告，医生推荐靶向药",
        form: ["手机号", "上传基因报告", "填写 HPV 阳性结果"],
        reward: "个体用药表",
        firstTouch: { open: [{ from: "私信", say: "加微购药" }], pushback: [] },
        rewardOutline: [],
      },
    };
    const r = checkPack(pack, "医药");
    expect(r.redline.some((x) => x.where === "承接 · 第一屏")).toBe(true);
    expect(r.redline.some((x) => x.where === "承接 · 私信")).toBe(true);
    expect(r.sensitive.map((x) => x.text)).toEqual(
      expect.arrayContaining(["上传基因报告", "填写 HPV 阳性结果"]),
    );
    expect(hasHardBlock(r)).toBe(true);
    expect(checkSensitiveFields(["上传病历"], "家装")).toEqual([]);
  });

  it("医药安全边界每份档都带着，安全过程文案不误拦", () => {
    const r = checkPack(
      {
        copies: { A: ["复诊前把要问医生的问题列好"] },
        shells: {},
        landing: { firstScreen: "先领取问诊准备清单", form: ["手机号", "希望联系时间"] },
      },
      "医药",
    );
    expect(r.guardrails.length).toBeGreaterThanOrEqual(8);
    expect(r.guardrails.map((x) => x.label)).toEqual(expect.arrayContaining(["处方药", "HPV", "靶向药", "健康数据"]));
    expect(r.redline).toEqual([]);
    expect(r.sensitive).toEqual([]);
    expect(hasHardBlock(r)).toBe(false);
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
    expect(hunts).toContain("医药");
    expect(huntSource("医药")).toBe("策展");
    expect(huntGuardrails("医药").length).toBeGreaterThanOrEqual(8);
    expect(hunts).not.toContain("_template");
    expect(hasHunt("口腔")).toBe(true);
    expect(huntSource("口腔")).toBe("策展");
    expect(hasHunt("不存在的行业")).toBe(false);
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

  it("五份模板都得有首触话术和兑现物目录：模板不走模型，绕过闸门", async () => {
    const { packFromHunt } = await import("./pack-from-hunt.mjs");
    for (const hunt of ["家装", "口腔", "医美", "教育", "本地高客单"]) {
      const l = packFromHunt({ id: "t", name: "X", hunt, pitch: "p", city: "广州" }).landing;
      expect(l.firstTouch.open.length, hunt).toBeGreaterThanOrEqual(2);
      expect(l.firstTouch.pushback.length, hunt).toBeGreaterThanOrEqual(2);
      expect(l.rewardOutline.length, hunt).toBeGreaterThanOrEqual(4);
      // 第一句必须先兑现，不许先问预算先约到店
      expect(l.firstTouch.open[0].say.length, hunt).toBeGreaterThan(15);
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
