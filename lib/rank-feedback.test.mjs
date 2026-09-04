import { describe, expect, it } from "vitest";
import { lastEffective, rankCopyGroups, topRepliedLabel } from "../js/rank-feedback.js";

describe("rank feedback", () => {
  it("puts replied lines and groups first", () => {
    const copies = {
      A组: ["a0", "a1"],
      B组: ["b0", "b1"],
    };
    const feedback = { "p1-B组-1": "replied", "p1-A组-0": "dead" };
    const ranked = rankCopyGroups(copies, feedback, "p1");
    expect(ranked[0].group).toBe("B组");
    expect(ranked[0].rows[0].text).toBe("b1");
    expect(topRepliedLabel(ranked)).toContain("B组");
  });
});

describe("上次有效跨批次", () => {
  const mine = {
    packs: [
      { id: "new", deliveredAt: "2026-08-25", copies: { A组: ["n0"] } },
      { id: "old", deliveredAt: "2026-08-18", copies: { B组: ["o0", "o1"] } },
    ],
  };
  const feedback = { "old-B组-0": "replied", "old-B组-1": "replied" };

  it("刚补的新批自己没反馈，上一批的客户反馈不消失", () => {
    const line = lastEffective(mine, feedback, "new");
    expect(line).toContain("08-18");
    expect(line).toContain("B组");
    expect(line).toContain("优先参考这个方向");
  });

  it("客户反馈就在当前这份时提示已排在前面", () => {
    expect(lastEffective(mine, feedback, "old")).toContain("已排在前面");
  });

  it("一个回音都没有时什么都不说", () => {
    expect(lastEffective(mine, {}, "new")).toBe("");
  });
});
