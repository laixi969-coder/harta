import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workspaceId } from "./auth.mjs";
import { cleanupStaleMaterialBatches, updateMaterialAnalysis } from "./materials.mjs";

const EMAIL = "cleanup@example.com";
const realCwd = process.cwd();
let sandbox;

function makeBatch(root, id, createdAt) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ id, createdAt }));
}

describe("未建档的资料批次不会无限占盘", () => {
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "harta-material-clean-"));
    process.chdir(sandbox);
  });
  afterAll(() => {
    process.chdir(realCwd);
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it("清理一天前的孤立批次，但保留已建档和当天批次", () => {
    const id = workspaceId(EMAIL);
    const root = path.join(sandbox, "data", "materials", id);
    const workspaces = path.join(sandbox, "data", "workspaces");
    fs.mkdirSync(workspaces, { recursive: true });
    const old = "m-100-abcdef01";
    const fresh = "m-200-1234abcd";
    const kept = "m-300-deadbeef";
    makeBatch(root, old, "2026-08-29T00:00:00.000Z");
    makeBatch(root, fresh, "2026-09-01T11:00:00.000Z");
    makeBatch(root, kept, "2026-08-29T00:00:00.000Z");
    fs.writeFileSync(
      path.join(workspaces, `${id}.json`),
      JSON.stringify({ customers: [{ materialBatchId: kept }] }),
    );

    cleanupStaleMaterialBatches(EMAIL, Date.parse("2026-09-01T12:00:00.000Z"));
    expect(fs.existsSync(path.join(root, old))).toBe(false);
    expect(fs.existsSync(path.join(root, fresh))).toBe(true);
    expect(fs.existsSync(path.join(root, kept))).toBe(true);
  });

  it("人工修改梳理会保存，同时保留原始正文和模型元数据", () => {
    const root = path.join(sandbox, "data", "materials", workspaceId(EMAIL));
    const id = "m-400-feedface";
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      id,
      createdAt: "2026-09-01T12:00:00.000Z",
      sources: [{ id: "s1", name: "介绍.txt", kind: "文本", text: "不能被前端覆盖的原始正文", note: "已读取正文", storedName: "raw.txt" }],
      analysis: { overview: "旧总览", sourceNotes: [], engine: { model: "m1" }, warning: "原告警" },
    }));
    const out = updateMaterialAnalysis(EMAIL, id, {
      overview: "人工核对后的总览",
      suggestedPitch: "一句话卖点",
      offer: ["服务一"], audience: [], proof: [], risks: ["待核对一"], missing: [],
      sourceNotes: [{ id: "s1", summary: "这份资料说明了服务一" }],
    });
    expect(out.analysis.overview).toBe("人工核对后的总览");
    expect(out.analysis.editedAt).toBeTruthy();
    expect(out.sources[0].text).toBeUndefined();
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    expect(stored.sources[0].text).toContain("原始正文");
    expect(stored.analysis.engine.model).toBe("m1");
    expect(stored.analysis.warning).toBe("原告警");
  });
});
