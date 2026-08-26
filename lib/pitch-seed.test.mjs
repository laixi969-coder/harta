import { describe, expect, it } from "vitest";
import { adminSeedWorkspace, copyCount, SEED_VERSION } from "./pitch-seed.mjs";

describe("served-client seed", () => {
  it("keeps three served brands each with a 15-copy 快档", () => {
    const space = adminSeedWorkspace();
    expect(space.seedVersion).toBe(SEED_VERSION);
    const names = space.customers.map((c) => c.name);
    expect(names).toEqual(["恒基旧改", "南洲柏齿", "南岸澄美"]);
    for (const c of space.customers) {
      expect(c.packs).toHaveLength(1);
      expect(copyCount(c.packs[0])).toBe(15);
      expect(c.packs[0].tier).toBe("快档");
      expect(c.packs[0].gaps).toHaveLength(3);
      expect(c.packs[0].demand.who.length).toBeGreaterThan(8);
      expect(c.packs[0].demand.say.length).toBeGreaterThan(1);
      expect(c.packs[0].demand.search.length).toBeGreaterThan(1);
      expect(c.packs[0].demand.skip.length).toBeGreaterThan(0);
    }
  });

  it("does not share battlefields across hunts", () => {
    const space = adminSeedWorkspace();
    const byHunt = Object.fromEntries(space.customers.map((c) => [c.hunt, c.packs[0].battlefields]));
    expect(byHunt["家装"]).toEqual(["巨量信息流", "朋友圈"]);
    expect(byHunt["口腔"]).toEqual(["巨量信息流", "朋友圈"]);
    expect(byHunt["医美"]).toEqual(["小红书", "百度"]);
  });

  it("keeps ledger lines only for these three", () => {
    const space = adminSeedWorkspace();
    const clients = space.ledger.map((r) => r.client);
    expect(clients).toContain("恒基旧改");
    expect(clients).toContain("南洲柏齿");
    expect(clients).toContain("南岸澄美");
    expect(clients).not.toContain("启航考证");
  });

  it("种子台账行全部带演示标记，不混进真账", () => {
    const space = adminSeedWorkspace();
    expect(space.ledger.length).toBeGreaterThan(0);
    for (const r of space.ledger) expect(r.demo).toBe(true);
  });
});
