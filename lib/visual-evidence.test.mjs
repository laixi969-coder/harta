import { describe, expect, it } from "vitest";
import { selectVisualEvidence } from "./visual-evidence.mjs";

const image = (label) => ({ label, mime: "image/jpeg", data: label });

describe("视觉资料公平取样", () => {
  it("长视频不会挤掉后面的图片和 PDF", () => {
    const selected = selectVisualEvidence(
      [
        ...Array.from({ length: 6 }, (_, i) => image(`介绍视频.mp4 · 画面 ${i + 1}`)),
        ...Array.from({ length: 4 }, (_, i) => image(`方案.pdf · 画面 ${i + 1}`)),
        image("门店海报.jpg · 画面 1"),
      ],
      8,
    );
    expect(selected.slice(0, 3).map((x) => x.label)).toEqual([
      "介绍视频.mp4 · 画面 1",
      "方案.pdf · 画面 1",
      "门店海报.jpg · 画面 1",
    ]);
    expect(selected).toHaveLength(8);
    expect(selected.some((x) => x.label.startsWith("门店海报.jpg"))).toBe(true);
  });

  it("忽略没有图像数据的空记录", () => {
    expect(selectVisualEvidence([{ label: "空" }, image("可用.jpg · 画面 1")], 8)).toEqual([
      image("可用.jpg · 画面 1"),
    ]);
  });
});
