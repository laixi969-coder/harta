import { describe, expect, it } from "vitest";
import { modelCreatedAt, sortModelsNewestFirst } from "./model-order.mjs";

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
