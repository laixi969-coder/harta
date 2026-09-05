import { describe, expect, it } from "vitest";
import { attributionEntries, customerAttributions, dueContent, platformOutcomes, shellFeedbackKey } from "./acquisition.js";

const pack = { id: "old", tier: "今日", copies: { A: ["原句"] }, shells: { 小红书: [{ cover: "封面", title: "标题", body: "正文" }], 朋友圈: ["朋友圈文案"] }, edits: { "小红书|0|body": { now: "实际发布的正文" } } };
const customer = { id: "c1", drops: [{ id: "new" }, pack], packs: [] };

describe("平台获客归因", () => {
  it("封面、标题、正文归为一篇，读修改后的正文，并保留旧批次", () => {
    const entry = attributionEntries(pack).find((entry) => entry.platform === "小红书");
    expect(entry.contentKeys).toHaveLength(3);
    expect(entry.text).toContain("实际发布的正文");
    expect(customerAttributions(customer).map((entry) => entry.key)).toContain(shellFeedbackKey("old", "小红书", 0));
  });

  it("仅复制一个字段不算整篇发布；字段全部发布后只计一篇", () => {
    const entry = attributionEntries(pack).find((entry) => entry.platform === "小红书");
    const partial = { [entry.contentKeys[0]]: { status: "published" } };
    expect(platformOutcomes(customer, partial)[0].published).toBe(0);
    const states = Object.fromEntries(entry.contentKeys.map((key) => [key, { status: "published" }]));
    const events = [
      { customerId: "c1", platform: "小红书", result: "问了价" },
      { customerId: "other", platform: "小红书", result: "成交" },
      { customerId: "c1", platform: "小红书", result: "成交", demo: true },
    ];
    expect(platformOutcomes(customer, states, { [entry.key]: "replied" }, events)[0]).toMatchObject({ published: 1, replied: 1, asked: 1, deals: 0 });
  });

  it("跨天仍保留未发布排期，忽略删除行、未来排期和暂不用", () => {
    const states = {
      "old::A|0": { status: "selected", plannedAt: "2026-09-01" },
      "old::小红书|0|body": { status: "selected", plannedAt: "2026-09-05" },
      "old::小红书|0|title": { status: "paused", plannedAt: "2026-09-01" },
      "old::小红书|0|cover": { status: "selected", plannedAt: "2026-09-06" },
      "old::已删行|0": { status: "selected", plannedAt: "2026-09-01" },
    };
    expect(dueContent(customer, states, "2026-09-05").map((item) => item.key)).toEqual(["old::A|0", "old::小红书|0|body"]);
  });
});
