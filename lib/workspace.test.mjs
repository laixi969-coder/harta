import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* generateBoards 要挂住才测得出并发：分镜没回来之前，反馈先落盘。 */
let releaseBoards;
const boardsMock = vi.fn(
  () =>
    new Promise((resolve) => {
      releaseBoards = resolve;
    }),
);
vi.mock("./generate.mjs", () => ({
  generateBoards: (...args) => boardsMock(...args),
  generatePack: vi.fn(),
  generateRefill: vi.fn(),
  generateTodayDrop: vi.fn(() => new Promise(() => {})),
}));

const {
  addCustomer,
  addLedger,
  dropToday,
  readWorkspace,
  setFeedback,
  setTrack,
  sweepStaleJobs,
  upgradeToFull,
} = await import("./workspace.mjs");
const { workspaceId } = await import("./auth.mjs");

const EMAIL = "race@x.com";
const WS_FILE = () =>
  path.join(process.cwd(), "data", "workspaces", `${workspaceId(EMAIL)}.json`);

function seedWorkspace(overrides = {}) {
  const space = {
    customers: [
      {
        id: "c1",
        name: "测试客户",
        hunt: "家装",
        pitch: "老房翻新",
        city: "广州",
        link: "",
        using: true,
        packs: [
          {
            id: "p1",
            tier: "快档",
            title: "档一",
            createdAt: "2026-01-01",
            deliveredAt: "2026-01-01",
            copies: { "A 组": ["第一条", "第二条"] },
            shells: {},
            battlefields: [],
            gaps: [],
            ...overrides.pack,
          },
        ],
        ...overrides.customer,
      },
    ],
    ledger: [],
    feedback: {},
    usingId: "c1",
    seedVersion: 999,
  };
  fs.writeFileSync(WS_FILE(), JSON.stringify(space, null, 2));
  return space;
}

describe("工作区", () => {
  // workspace.mjs 认 process.cwd()/data，不换目录就会写进真实工作区
  const realCwd = process.cwd();
  let sandbox;
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "harta-ws-"));
    fs.mkdirSync(path.join(sandbox, "data", "workspaces"), { recursive: true });
    process.chdir(sandbox);
  });
  afterAll(() => {
    process.chdir(realCwd);
    fs.rmSync(sandbox, { recursive: true, force: true });
  });
  beforeEach(() => {
    boardsMock.mockClear();
  });

  it("补分镜是后台活：分镜没回来之前记的反馈不能丢", async () => {
    seedWorkspace();
    const started = upgradeToFull(EMAIL, "p1");
    expect(started.error).toBeUndefined();
    // 请求立刻返回，客户身上挂着「补分镜」的活
    expect(readWorkspace(EMAIL).customers[0].job?.kind).toBe("补分镜");

    // 分镜还在生成，销售同时记了一条有回音
    setFeedback(EMAIL, "p1-A 组-0", "replied");
    expect(readWorkspace(EMAIL).feedback["p1-A 组-0"]).toBe("replied");

    releaseBoards([
      {
        title: "镜头一",
        platform: "抖音",
        hook: "前 3 秒",
        shots: [
          { at: "0-3s", visual: "画面", line: "口播" },
          { at: "3-8s", visual: "画面二", line: "" },
        ],
        close: "收口",
      },
      {
        title: "镜头二",
        platform: "抖音",
        hook: "前 3 秒",
        shots: [
          { at: "0-3s", visual: "画面", line: "" },
          { at: "3-8s", visual: "画面二", line: "口播" },
        ],
        close: "收口",
      },
    ]);
    // 后台写回是异步的，等它落地
    for (let i = 0; i < 50 && readWorkspace(EMAIL).customers[0].job; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const done = readWorkspace(EMAIL);
    expect(done.customers[0].job).toBeNull();
    expect(done.customers[0].packs[0].boards?.length).toBe(2);
    expect(done.customers[0].packs[0].tier).toBe("全档");
    // 关键：反馈还在
    expect(done.feedback["p1-A 组-0"]).toBe("replied");
  });

  it("已经有分镜的档再点补分镜，不动它", () => {
    seedWorkspace({
      pack: { boards: [{ title: "已在", shots: [{ visual: "a" }, { visual: "b" }] }] },
    });
    const result = upgradeToFull(EMAIL, "p1");
    expect(result.error).toBeUndefined();
    expect(boardsMock).not.toHaveBeenCalled();
  });

  it("找不到的档报错，不开任务", () => {
    seedWorkspace();
    const result = upgradeToFull(EMAIL, "no-such-pack");
    expect(result.error).toBe("找不到这份档");
  });

  it("服务重启留下的僵尸任务，过宽限期就判死", () => {
    seedWorkspace();
    // 直接改盘上的文件：一条 3 分钟前的旧任务（这台进程从没跑过它）
    const space = JSON.parse(fs.readFileSync(WS_FILE(), "utf8"));
    space.customers[0].job = { kind: "出档", startedAt: Date.now() - 3 * 60 * 1000 };
    fs.writeFileSync(WS_FILE(), JSON.stringify(space));
    const swept = sweepStaleJobs(EMAIL);
    expect(swept.customers[0].job).toBeNull();
    expect(swept.customers[0].lastFail).toContain("中断");
  });

  it("刚起步的任务不在宽限期内，不误杀", () => {
    seedWorkspace();
    const space = JSON.parse(fs.readFileSync(WS_FILE(), "utf8"));
    space.customers[0].job = { kind: "出档", startedAt: Date.now() - 5 * 1000 };
    fs.writeFileSync(WS_FILE(), JSON.stringify(space));
    const swept = sweepStaleJobs(EMAIL);
    expect(swept.customers[0].job).not.toBeNull();
  });

  it("台账日期用本地口径", () => {
    seedWorkspace();
    const { workspace: space } = addLedger(EMAIL, { client: "测试客户", hunt: "家装", result: "问了价", quote: "", talk: "多少钱" });
    const local = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const localMD = `${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
    expect(space.ledger[0].date).toBe(localMD);
  });

  it("台账记问价并挂了行，那条自动算有回音", () => {
    seedWorkspace();
    const out = addLedger(EMAIL, {
      client: "测试客户", hunt: "家装", result: "问了价", quote: "", talk: "多少钱",
      line: "p1-A 组-0",
    });
    expect(out.marked).toBe(true);
    expect(out.workspace.feedback["p1-A 组-0"]).toBe("replied");
  });

  it("没下文不回写；不属于这个客户的行不回写", () => {
    seedWorkspace();
    const a = addLedger(EMAIL, { client: "测试客户", result: "没下文", talk: "算了", line: "p1-A 组-0" });
    expect(a.marked).toBe(false);
    expect(a.workspace.feedback["p1-A 组-0"]).toBeUndefined();
    const b = addLedger(EMAIL, { client: "测试客户", result: "成交", talk: "成了", line: "pX-别的组-0" });
    expect(b.marked).toBe(false);
    expect(b.workspace.feedback["pX-别的组-0"]).toBeUndefined();
  });

  it("建档必须说清拓新还是存量", () => {
    seedWorkspace();
    const miss = addCustomer(EMAIL, { name: "新店", hunt: "家装", pitch: "旧改" });
    expect(miss.error).toMatch(/拓新还是存量/);
  });

  it("粘贴内容超过页面标注的上限时拒绝，不静默截断", () => {
    seedWorkspace();
    expect(addCustomer(EMAIL, {
      name: "新店", hunt: "家装", pitch: "旧改", track: "拓新", material: "字".repeat(12001),
    }).error).toMatch(/12,000/);
    expect(addLedger(EMAIL, {
      client: "测试客户", result: "问了价", talk: "字".repeat(4001),
    }).error).toMatch(/4,000/);
  });

  it("销售补充会随客户保存，重出时仍可继续使用", () => {
    seedWorkspace();
    const made = addCustomer(EMAIL, {
      name: "补充资料客户", hunt: "家装", pitch: "旧改", track: "拓新", material: "这是销售粘贴的客户原话和会议信息。".repeat(4),
    });
    expect(made.error).toBeUndefined();
    const created = readWorkspace(EMAIL).customers.find((c) => c.name === "补充资料客户");
    expect(created.salesMaterial).toContain("销售粘贴");
  });

  it("存量建档不走出判断，成交也不改种类", () => {
    seedWorkspace();
    const made = addCustomer(EMAIL, { name: "老客户", hunt: "家装", pitch: "还在发", track: "存量" });
    expect(made.error).toBeUndefined();
    const created = readWorkspace(EMAIL).customers.find((c) => c.name === "老客户");
    expect(created.track).toBe("存量");
    expect(created.job?.kind).toBe("出今日");
    const { workspace } = addLedger(EMAIL, { client: "测试客户", result: "成交", talk: "成了" });
    expect(workspace.customers.find((c) => c.name === "测试客户").track).toBeUndefined();
    const tagged = setTrack(EMAIL, "c1", "拓新");
    expect(tagged.workspace.customers[0].track).toBe("拓新");
    const afterDeal = addLedger(EMAIL, { client: "测试客户", result: "成交", talk: "又成了" });
    expect(afterDeal.workspace.customers.find((c) => c.id === "c1").track).toBe("拓新");
  });

  it("存量出今日不要求先有判断报告", () => {
    seedWorkspace({ customer: { track: "存量", packs: [] } });
    const space = JSON.parse(fs.readFileSync(WS_FILE(), "utf8"));
    space.customers[0].packs = [];
    fs.writeFileSync(WS_FILE(), JSON.stringify(space));
    const out = dropToday(EMAIL, "c1");
    expect(out.error).toBeUndefined();
    expect(readWorkspace(EMAIL).customers[0].job?.kind).toBe("出今日");
  });

  it("拓新不能出今日；没标明种类也不能出活", () => {
    seedWorkspace({ customer: { track: "拓新" } });
    expect(dropToday(EMAIL, "c1").error).toMatch(/拓新/);
    seedWorkspace();
    expect(dropToday(EMAIL, "c1").error).toMatch(/先标明/);
    expect(setTrack(EMAIL, "c1", "合作中").error).toMatch(/拓新还是存量/);
  });
});
