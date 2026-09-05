import { describe, expect, it } from "vitest";
import {
  contentItemKey,
  contentStateCounts,
  contentStateOf,
  learningSummary,
} from "./content-workflow.js";

describe("content workflow", () => {
  const pack = { id: "d2", copies: { "A 风险": ["一", "二"], "B 报价": ["三"] } };

  it("treats missing state as pending and counts only base copy inventory", () => {
    const states = { [contentItemKey("d2", "A 风险|0")]: { status: "published" } };
    const counts = contentStateCounts(pack, states, { "d2-A 风险-0": "replied" });
    expect(counts).toEqual({ total: 3, pending: 2, selected: 0, published: 1, paused: 0, replied: 1, dead: 0 });
    expect(contentStateOf({}, "missing").status).toBe("pending");
  });

  it("explains which prior direction shaped the current batch", () => {
    const customer = { drops: [{ id: "d2" }, { id: "d1", copies: { "A 风险": ["一", "二"], "B 报价": ["三"] } }] };
    const current = { id: "d2", origin: { from: "d1" } };
    expect(learningSummary(customer, current, { "d1-A 风险-0": "replied", "d1-B 报价-0": "dead" }))
      .toContain("A 风险 1 条有客户反馈");
  });
});


it("生成依据使用当时快照，后补的反馈不改写过去", () => {
  const pack = { id: "d2", origin: { feedbackSources: ["d1"], feedbackSummary: [{ group: "平台反馈 · 小红书", replied: 1, dead: 0 }] } };
  const text = learningSummary({ drops: [pack] }, pack, { "d2-A-0": "dead" });
  expect(text).toContain("生成本批时参考");
  expect(text).toContain("小红书：1 条有反馈、0 条没反应");
});
