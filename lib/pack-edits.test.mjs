import { describe, expect, it } from "vitest";
import { copyKey, edited, editOf, packAsSent, shellKey } from "./pack-edits.mjs";
import { checkPack } from "./check.mjs";

const pack = () => ({
  copies: { A: ["原句一", "原句二"] },
  shells: { 小红书: [{ cover: "封", title: "题", body: "正文" }], 朋友圈: ["一句话"] },
  edits: {
    "A|0": { was: "原句一", now: "改过的一", at: "2026-08-18" },
    "小红书|0|title": { was: "题", now: "改过的题", at: "2026-08-18" },
  },
});

describe("改一条", () => {
  it("改过的用改后那版，没改的原样", () => {
    const p = pack();
    expect(edited(p, copyKey("A", 0), "原句一")).toBe("改过的一");
    expect(edited(p, copyKey("A", 1), "原句二")).toBe("原句二");
    expect(edited(p, shellKey("小红书", 0, "title"), "题")).toBe("改过的题");
    expect(edited(p, shellKey("小红书", 0, "cover"), "封")).toBe("封");
  });

  it("原句留着，界面要显示改之前是什么", () => {
    expect(editOf(pack(), "A|0").was).toBe("原句一");
    expect(editOf(pack(), "A|1")).toBeNull();
  });

  it("要发出去的那一份：改动铺进去，字符串外壳也照样处理", () => {
    const sent = packAsSent(pack());
    expect(sent.copies.A).toEqual(["改过的一", "原句二"]);
    expect(sent.shells["小红书"][0]).toEqual({ cover: "封", title: "改过的题", body: "正文" });
    expect(sent.shells["朋友圈"][0]).toEqual({ title: "一句话" });
  });

  it("没有 edits 的老档不受影响", () => {
    const old = { copies: { A: ["就这句"] }, shells: { 朋友圈: ["一句话"] } };
    expect(packAsSent(old).copies.A).toEqual(["就这句"]);
    expect(packAsSent(old).shells["朋友圈"][0].title).toBe("一句话");
  });

  it("销售改出红线要当场抓到：查的是改后那版，不是模型出的那版", () => {
    const clean = { copies: { A: ["先问清楚恢复期要几天"] }, shells: {} };
    expect(checkPack(clean, "医美").redline).toEqual([]);
    const dirty = { ...clean, edits: { "A|0": { was: "先问清楚恢复期要几天", now: "全上海最便宜的热玛吉" } } };
    expect(checkPack(dirty, "医美").redline[0].words).toContain("最便宜");
  });
});
