import { describe, expect, it } from "vitest";
import { checkPack, hasHardBlock } from "./check.mjs";
import { judgeQuality } from "./quality.mjs";

describe("质量与平台自行判断", () => {
  it("口号和自夸过不了：专业团队、立即咨询不能当获客钩子", () => {
    const issues = judgeQuality({
      copies: { A: ["专业团队十年匠心，立即咨询"] },
      shells: {},
    });
    expect(issues.some((x) => x.level === "hard" && /专业团队|立即咨询|匠心/.test(x.why + x.hit))).toBe(true);
    const r = checkPack({ copies: { A: ["专业团队为您服务"] }, shells: {} }, "家装");
    expect(hasHardBlock(r)).toBe(true);
    expect(r.quality.some((x) => x.level === "hard")).toBe(true);
  });

  it("真钩子不误拦：具体到能对上号的那句话不是口号", () => {
    const r = checkPack(
      { copies: { A: ["报价单里这 3 项最容易加钱，进场当天问清楚"] }, shells: {} },
      "家装",
    );
    expect(r.quality.filter((x) => x.level === "hard")).toEqual([]);
    expect(hasHardBlock(r)).toBe(false);
  });

  it("同一句换皮不算一条：两句压实后一样，后一句过不了", () => {
    const issues = judgeQuality({
      copies: { A: ["老房拆改先问承重墙谁签字", "老房拆改先问承重墙谁签字！"] },
      shells: {},
    });
    expect(issues.some((x) => x.level === "hard" && x.why.includes("换皮"))).toBe(true);
  });

  it("共享一个长场景前缀但钩子不同，不误判成换皮", () => {
    const issues = judgeQuality({
      copies: {
        A: [
          "老房翻新报价单拿到手以后，先看拆除费按面积还是按项目算",
          "老房翻新报价单拿到手以后，再看水电改造有没有写封顶价",
        ],
      },
      shells: {},
    });
    expect(issues.filter((x) => x.why.includes("换皮"))).toEqual([]);
  });

  it("用户批评广告套话或讲自己的经历，不被口号闸门误杀", () => {
    const issues = judgeQuality({
      copies: {
        A: [
          "别信专业团队四个字，先问增项超预算谁承担",
          "两家报价摊开以后，我们做了逐项对比才看出差别",
        ],
      },
      shells: {},
    });
    expect(issues.filter((x) => x.why.includes("口号或自夸"))).toEqual([]);
  });

  it("『不要错过』不能伪装成否定语境绕过口号闸门", () => {
    const issues = judgeQuality({
      copies: { A: ["不要错过专业团队的限时优惠，立即咨询"] },
      shells: {},
    });
    expect(issues.some((x) => x.level === "hard" && x.why.includes("口号或自夸"))).toBe(true);
  });

  it("一批里一半以上是换皮，整批过不了", () => {
    const copies = {
      A: Array.from({ length: 8 }, () => "老房拆改先问承重墙谁签字"),
      B: ["合同里增项怎么算才不会被坑"],
    };
    const issues = judgeQuality({ copies, shells: {} });
    expect(issues.some((x) => x.scope === "batch" && x.level === "hard")).toBe(true);
  });

  it("跨平台同一句话过不了：不是改字数，是不同字段", () => {
    const issues = judgeQuality({
      copies: { A: ["报价单里这 3 项最容易加钱"] },
      shells: {
        巨量信息流: ["进场先问这批人是谁带的"],
        朋友圈: ["进场先问这批人是谁带的"],
      },
    });
    expect(issues.some((x) => x.level === "hard" && x.why.includes("跨平台"))).toBe(true);
  });

  it("跨平台检查覆盖小红书正文，不能把重复句藏在非标题字段", () => {
    const repeated = "进场先问这批人是谁带的，再看效果图";
    const issues = judgeQuality({
      copies: {},
      shells: {
        朋友圈: [{ title: repeated }],
        小红书: [{ cover: "工地避坑", title: "我在工地先问谁带班", body: repeated }],
      },
    });
    expect(issues.some((x) => x.level === "hard" && x.where.includes("body") && x.why.includes("跨平台"))).toBe(true);
  });

  it("同一平台的别名不误报成跨平台重复", () => {
    const repeated = "两家报价摊开以后才发现拆改算法不同";
    const issues = judgeQuality({
      copies: {},
      shells: {
        小红书: [{ cover: "报价差别", title: repeated, body: "我把两张单子逐项对了一遍。" }],
        小红书聚光: [{ cover: "报价对比", title: repeated, body: "我先看的是拆改算法。" }],
      },
    });
    expect(issues.filter((x) => x.why.includes("跨平台"))).toEqual([]);
  });

  it("小红书写成分点文章过不了：那是文章不是笔记", () => {
    const issues = judgeQuality({
      copies: {},
      shells: {
        小红书: [{ cover: "拆改坑", title: "老房拆改避坑", body: "首先看合同。\n其次看报价。\n1、增项怎么算" }],
      },
    });
    expect(issues.some((x) => x.level === "hard" && x.where.includes("小红书"))).toBe(true);
  });

  it("小红书没有第一人称只提示，不拦：机器不能把所有笔记都逼成「我」", () => {
    const issues = judgeQuality({
      copies: {},
      shells: {
        小红书: [{ cover: "拆改坑", title: "老房拆改避坑", body: "进场当天问这批人是谁带的，比看效果图准。" }],
      },
    });
    expect(issues.some((x) => x.level === "hard")).toBe(false);
    expect(issues.some((x) => x.level === "advise" && x.why.includes("第一人称"))).toBe(true);
  });
});
