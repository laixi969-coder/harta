import { describe, expect, it } from "vitest";
import { copyCount, packFromHunt } from "./pack-from-hunt.mjs";

describe("pack from hunt", () => {
  it("issues a 15-copy 快档 for 家装/口腔/医美/教育", () => {
    for (const hunt of ["家装", "口腔", "医美", "教育", "本地高客单"]) {
      const pack = packFromHunt({ id: "cx", name: "测试客户", hunt, pitch: "卖点", city: "广州" });
      expect(pack.tier).toBe("快档");
      expect(copyCount(pack)).toBe(15);
      expect(pack.gaps).toHaveLength(3);
      expect(pack.demand.who).toBeTruthy();
      expect(JSON.stringify(pack)).toContain("测试客户");
    }
  });
});
