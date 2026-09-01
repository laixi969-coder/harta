import { describe, expect, it } from "vitest";
import {
  artifactsForCustomer,
  clientPacksForCustomer,
  latestAttributablePack,
} from "./customer-view.js";

describe("客户档案在不同用户路径里的边界", () => {
  const retained = {
    track: "存量",
    drops: [{ id: "today" }],
    packs: [{ id: "judgment" }],
  };

  it("存量工作台和台账优先使用最新今日内容", () => {
    expect(artifactsForCustomer(retained).map((p) => p.id)).toEqual(["today", "judgment"]);
    expect(latestAttributablePack(retained)?.id).toBe("today");
  });

  it("甲方包裹只列可分享的判断档，不把今日内容伪装成包裹", () => {
    expect(clientPacksForCustomer(retained).map((p) => p.id)).toEqual(["judgment"]);
  });

  it("拓新客户仍只使用判断档", () => {
    const prospect = { track: "拓新", drops: [{ id: "legacy" }], packs: [{ id: "judgment" }] };
    expect(artifactsForCustomer(prospect).map((p) => p.id)).toEqual(["judgment"]);
  });
});
