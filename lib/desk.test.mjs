import { describe, expect, it } from "vitest";
import { buildDesk, daysMissed, hasJudgment, hasMaterials, isTrack, pickOpened } from "./desk.mjs";

describe("desk 双轨", () => {
  it("种类只认拓新或存量", () => {
    expect(isTrack("拓新")).toBe(true);
    expect(isTrack("存量")).toBe(true);
    expect(isTrack("合作中")).toBe(false);
    expect(isTrack("")).toBe(false);
  });

  it("没标明种类的不进两列待办", () => {
    const desk = buildDesk(
      {
        customers: [
          { id: "a", name: "未标", hunt: "家装" },
          { id: "b", name: "恒基", hunt: "家装", track: "存量" },
        ],
      },
      "2026-08-31",
    );
    expect(desk.unmarked.map((c) => c.id)).toEqual(["a"]);
    expect(desk.send.map((c) => c.id)).toEqual(["b"]);
    expect(desk.judge).toEqual([]);
    expect(desk.hook.line).toContain("存量今天还差 1 家");
    expect(desk.hook.line).toContain("先做恒基");
    expect(desk.namedId).toBe("b");
  });

  it("存量没有今日内容就进该发，有了就从待办拿掉", () => {
    const desk = buildDesk(
      {
        customers: [
          {
            id: "b",
            name: "恒基",
            track: "存量",
            lastDropAt: "2026-08-31",
            drops: [{ id: "d1", deliveredAt: "2026-08-31" }],
          },
          { id: "c", name: "橙美", track: "存量" },
        ],
      },
      "2026-08-31",
    );
    expect(desk.send.map((c) => c.name)).toEqual(["橙美"]);
    expect(desk.done.map((c) => c.name)).toEqual(["恒基"]);
    expect(desk.done[0]).not.toHaveProperty("drops");
  });

  it("拓新没资料不算该出判断；有资料且没报告才算", () => {
    const desk = buildDesk(
      {
        customers: [
          { id: "p1", name: "缺料诊所", track: "拓新" },
          { id: "p2", name: "齐料诊所", track: "拓新", link: "https://example.com" },
          {
            id: "p3",
            name: "已出判断",
            track: "拓新",
            link: "https://example.com",
            packs: [{ id: "p", tier: "快档" }],
          },
        ],
      },
      "2026-08-31",
    );
    expect(desk.judge.map((c) => c.name)).toEqual(["齐料诊所", "缺料诊所"]);
    expect(desk.judge.find((c) => c.id === "p2").ready).toBe(true);
    expect(desk.judge.find((c) => c.id === "p1").ready).toBe(false);
    expect(desk.namedId).toBe("p2");
    expect(desk.hook.line).toContain("资料齐了该出判断");
  });

  it("存量优先于拓新成为先做谁", () => {
    const desk = buildDesk(
      {
        customers: [
          { id: "p", name: "新客", track: "拓新", link: "https://a.com" },
          { id: "r", name: "恒基", track: "存量", lastDropAt: "2026-08-29" },
        ],
      },
      "2026-08-31",
    );
    expect(desk.namedId).toBe("r");
    expect(desk.hook.line).toContain("先做恒基");
    expect(desk.hook.line).toContain("已连 2 天没出");
  });

  it("成交之类的结果不在 desk 里改种类——desk 只读 track", () => {
    const desk = buildDesk({
      customers: [{ id: "p", name: "还是拓新", track: "拓新", link: "https://a.com" }],
      ledger: [{ client: "还是拓新", result: "成交" }],
    });
    expect(desk.judge[0].track).toBe("拓新");
    expect(desk.send).toEqual([]);
  });

  it("有材料、有判断史的判定", () => {
    expect(hasMaterials({ link: "https://a.com" })).toBe(true);
    expect(hasMaterials({ materials: [{ name: "a.pdf" }] })).toBe(true);
    expect(hasMaterials({ name: "空" })).toBe(false);
    expect(hasJudgment({ packs: [{ tier: "侦察档" }] })).toBe(true);
    expect(hasJudgment({ packs: [{ tier: "今日" }] })).toBe(false);
    expect(hasJudgment({ drops: [{ tier: "今日" }] })).toBe(false);
  });

  it("有人点开某家就展开那家，否则展开今天最急的，旧的先用不作数", () => {
    const customers = [
      { id: "old", name: "旧先用", track: "拓新" },
      { id: "hot", name: "恒基", track: "存量" },
    ];
    expect(pickOpened(customers, "", "hot").name).toBe("恒基");
    expect(pickOpened(customers, "old", "hot").name).toBe("旧先用");
    expect(pickOpened(customers, "gone", "hot").name).toBe("恒基");
  });

  it("连着没出的天数按上次出今日算", () => {
    expect(daysMissed({ lastDropAt: "2026-08-29" }, "2026-08-31")).toBe(2);
    expect(daysMissed({ lastDropAt: "2026-08-31", drops: [{ deliveredAt: "2026-08-31" }] }, "2026-08-31")).toBe(0);
    expect(daysMissed({}, "2026-08-31")).toBe(99);
  });

  it("兼容 ISO 时间戳，不会把今天已出的内容再次列为待办", () => {
    const customer = {
      id: "iso",
      name: "时间戳客户",
      track: "存量",
      lastDropAt: "2026-08-31T12:30:00.000Z",
      drops: [{ deliveredAt: "2026-08-31T12:30:00.000Z" }],
    };
    expect(daysMissed(customer, "2026-08-31")).toBe(0);
    expect(buildDesk({ customers: [customer] }, "2026-08-31").send).toEqual([]);
  });
});
