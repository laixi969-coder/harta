import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addCustomProvider, addModel, saveProvider, setActive, setModelEnabled, useModel } from "./llm.mjs";

const realCwd = process.cwd();
let sandbox;

function provider(overrides = {}) {
  return {
    id: "ready",
    name: "可用渠道",
    kind: "openai",
    apiKey: "sk-test",
    baseUrl: "https://api.example.test/v1",
    model: "m1",
    models: ["m1", "m2"],
    enabled: ["m1"],
    modelSelectionVersion: 2,
    ...overrides,
  };
}

function seed() {
  fs.mkdirSync(path.join(sandbox, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, "data", "llm.json"),
    JSON.stringify({
      active: "ready",
      providers: {
        ready: provider(),
        empty: provider({ id: "empty", name: "空渠道", apiKey: "", model: "", enabled: [] }),
      },
    }),
  );
}

describe("当前模型不能被误配成不可用状态", () => {
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "harta-llm-"));
    process.chdir(sandbox);
  });
  afterAll(() => {
    process.chdir(realCwd);
    fs.rmSync(sandbox, { recursive: true, force: true });
  });
  beforeEach(seed);

  it("缺密钥或模型的渠道不能切成当前", () => {
    expect(() => setActive("empty")).toThrow(/补齐密钥、模型/);
  });

  it("正在使用的最后一个模型不能直接关掉", () => {
    expect(() => setModelEnabled("ready", "m1", false)).toThrow(/不能直接关到一个不剩/);
  });

  it("正在使用的渠道不能把接口地址清空", () => {
    expect(() => saveProvider("ready", { baseUrl: "" })).toThrow(/不能清空接口地址/);
  });

  it("先选择另一个模型后可以关掉旧模型", () => {
    useModel("ready", "m2");
    expect(() => setModelEnabled("ready", "m1", false)).not.toThrow();
  });

  it("粘贴的渠道名和模型名超过上限时明确拒绝", () => {
    expect(() => addCustomProvider("渠".repeat(21))).toThrow(/20/);
    expect(() => addModel("ready", "m".repeat(257))).toThrow(/256/);
  });
});
