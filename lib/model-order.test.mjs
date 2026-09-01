import { describe, expect, it } from "vitest";
import { modelCreatedAt, sortModelsNewestFirst } from "./model-order.mjs";
import {
  MODEL_SELECTION_VERSION,
  normalizeProviderModelSelection,
  providerReadiness,
  selectedModelsAfterSync,
} from "./model-selection.mjs";

describe("模型按最新在上", () => {
  it("兼容六位、八位和分隔日期", () => {
    expect(
      sortModelsNewestFirst([
        "model-250528",
        "model-20260415",
        "model-260628",
        "model-2025-04-14",
      ]),
    ).toEqual(["model-260628", "model-20260415", "model-250528", "model-2025-04-14"]);
  });

  it("没有发布日期时按版本号自然倒序", () => {
    expect(sortModelsNewestFirst(["gpt-4.1", "gpt-5.4", "gpt-5.2"])).toEqual([
      "gpt-5.4",
      "gpt-5.2",
      "gpt-4.1",
    ]);
  });

  it("接口创建时间优先于模型名，并能读取常见字段", () => {
    const createdAt = {
      old_name: modelCreatedAt({ created: 1780000000 }),
      new_name: modelCreatedAt({ created_at: "2026-08-31T00:00:00Z" }),
    };
    expect(sortModelsNewestFirst(["new_name", "old_name"], createdAt)).toEqual(["new_name", "old_name"]);
  });
});

describe("模型选择只由用户决定", () => {
  it("旧版即使自动打开过整批模型，也会一次性全部清除", () => {
    const provider = {
      models: ["model-260628", "model-250528"],
      enabled: ["model-260628", "model-250528"],
      model: "model-260628",
    };
    normalizeProviderModelSelection(provider);
    expect(provider.enabled).toEqual([]);
    expect(provider.model).toBe("");
    expect(provider.modelSelectionVersion).toBe(MODEL_SELECTION_VERSION);
  });

  it("新版里用户亲自选过的模型会保留", () => {
    const provider = {
      models: ["model-250528", "model-260628"],
      enabled: ["model-250528"],
      model: "model-250528",
      modelSelectionVersion: MODEL_SELECTION_VERSION,
    };
    normalizeProviderModelSelection(provider);
    expect(provider.enabled).toEqual(["model-250528"]);
    expect(provider.model).toBe("model-250528");
  });

  it("同步新出现的模型不自动选择", () => {
    expect(
      selectedModelsAfterSync(
        ["model-260628", "model-250528"],
        ["model-250528"],
        ["model-250528"],
      ),
    ).toEqual(["model-250528"]);
  });
});

describe("渠道切成当前前必须可用", () => {
  it("明确列出缺少的配置", () => {
    expect(providerReadiness({ apiKey: "sk-x", baseUrl: "", model: "" })).toEqual({
      ready: false,
      missing: ["接口地址", "模型"],
    });
  });

  it("密钥、地址、模型齐全才算可用", () => {
    expect(providerReadiness({ apiKey: "sk-x", baseUrl: "https://api.test/v1", model: "m1" })).toEqual({
      ready: true,
      missing: [],
    });
  });
});
