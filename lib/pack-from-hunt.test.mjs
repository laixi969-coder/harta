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

  it("医药在没有模型时只出合规侦察，不拿通用高客单模板硬顶", () => {
    const pack = packFromHunt({ id: "cm", name: "测试药企", hunt: "医药", pitch: "HPV 与肿瘤业务", city: "广州" });
    expect(pack.tier).toBe("侦察档");
    expect(pack.questions).toHaveLength(5);
    expect(copyCount(pack)).toBe(0);
    expect(pack.shells).toEqual({});
    expect(pack.gate).toContain("不对这家机构、产品或疗效作判断");
    expect(JSON.stringify(pack)).toContain("处方药不得进入公众互联网广告");
  });
});
