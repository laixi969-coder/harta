import { describe, expect, it } from "vitest";
import { rankCopyGroups, topRepliedLabel } from "../js/rank-feedback.js";

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
