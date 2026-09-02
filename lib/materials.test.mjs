import { describe, expect, it } from "vitest";
import { buildSourceCorpus, materialTextForPack } from "./materials.mjs";

describe("资料进入模型前公平分配正文额度", () => {
  it("长资料不会把后面的附件完全挤掉", () => {
    const corpus = buildSourceCorpus(
      [
        { id: "s1", name: "长文一", kind: "PDF", text: "甲".repeat(10000) },
        { id: "s2", name: "长文二", kind: "Word", text: "乙".repeat(10000) },
        { id: "s3", name: "最后一份", kind: "网页", text: "关键结论" },
      ],
      1200,
    );
    expect(corpus).toContain("长文一");
    expect(corpus).toContain("长文二");
    expect(corpus).toContain("最后一份");
    expect(corpus).toContain("关键结论");
    expect(corpus.length).toBeLessThanOrEqual(1200);
  });
});

describe("materialTextForPack", () => {
  it("把抽取到的正文和资料梳理一起交给出档引擎", () => {
    const text = materialTextForPack({
      analysis: {
        overview: "这是一家做老房翻新的本地公司，资料重点讲工期与隐蔽工程验收。",
        offer: ["老房翻新"],
        audience: ["准备改造二手房的业主"],
      },
      sources: [{ name: "简介.pdf", kind: "PDF", text: "我们提供从拆除到验收的一站式老房翻新服务，并逐项记录隐蔽工程。" }],
    });
    expect(text).toContain("资料总览");
    expect(text).toContain("简介.pdf");
    expect(text).toContain("隐蔽工程");
  });

  it("视觉识别失败时不把失败提示冒充成客户证据", () => {
    const text = materialTextForPack({
      analysis: {
        overview: "资料已经归档，但当前模型没有成功读取图片或视频画面。",
        warning: "当前模型不支持图片",
      },
      sources: [{ name: "海报.jpg", kind: "图片", text: "" }],
    });
    expect(text).toBe("");
  });

  it("视觉识别成功后可以使用有边界的画面梳理", () => {
    const text = materialTextForPack({
      analysis: {
        overview: "海报画面明确写有暑期游泳班、适合六至十二岁儿童，并列出八节课与结业测评；未看到师资资质信息。",
        warning: "",
      },
      sources: [{ name: "课程海报.jpg", kind: "图片", text: "" }],
    });
    expect(text).toContain("暑期游泳班");
  });

  it("画面失败时仍保留已经转出的音轨证据", () => {
    const text = materialTextForPack({
      analysis: {
        overview: "根据视频语音，客户明确介绍了课程价格和开课日期；画面没有成功读取，因此不判断海报中的其他内容。",
        warning: "图片/视频画面未纳入",
      },
      sources: [
        {
          name: "介绍视频.mp4",
          kind: "视频",
          text: "【视频语音转写】课程一共八节，七月十五日开课，价格是一千二百元。",
        },
      ],
    });
    expect(text).toContain("视频语音转写");
    expect(text).toContain("一千二百元");
  });
});

describe("份数放宽到 20 后预算照旧不爆", () => {
  it("20 份资料每份都有摘录，总预算不被顶破", () => {
    const sources = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i + 1}`,
      name: `资料${i + 1}`,
      kind: "PDF",
      text: `第${i + 1}份的正文。${"内容".repeat(400)}`,
    }));
    const corpus = buildSourceCorpus(sources);
    for (const s of sources) expect(corpus).toContain(s.name);
    expect(corpus.length).toBeLessThanOrEqual(42000);
  });
});
