import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { contentExportData, exportContentBatch, exportContentHistory } from "./content-export.mjs";
import { contentItemKey } from "./content-workflow.mjs";

const customer = { name: "测试/客户", hunt: "家装" };
const pack = {
  id: "d1",
  tier: "今日",
  date: "2026-09-04",
  batch: 2,
  battlefields: ["小红书"],
  copies: { "A 风险": ["改前", "安全文案"] },
  shells: { 小红书: [{ cover: "封面", title: "标题", body: "第一行\n第二行" }] },
  edits: { "A 风险|0": { was: "改前", now: "改后" } },
  checks: { redline: [{ text: "改后", why: "命中红线" }] },
};

describe("content export", () => {
  it("exports edited safe content and excludes risky rows by default", () => {
    const data = contentExportData({ pack, customer, contentStates: {}, feedback: {}, options: { kind: "copies" } });
    expect(data.rows.map((row) => row.text)).toEqual(["安全文案"]);
    expect(data.excluded).toBe(1);
  });

  it("honors selected scope and keeps workflow fields", () => {
    const key = contentItemKey("d1", "A 风险|1");
    const data = contentExportData({
      pack,
      customer,
      contentStates: { [key]: { status: "published", plannedAt: "2026-09-05", publishedAt: "2026-09-06T12:00:00.000Z" } },
      feedback: { "d1-A 风险-1": "replied" },
      options: { scope: "selected", selection: [key], kind: "all" },
    });
    expect(data.rows[0]).toMatchObject({ statusLabel: "已发布", plannedAt: "2026-09-05", publishedAt: "2026-09-06", feedback: "有回音" });
  });

  it("creates a valid xlsx package with separate sheets", async () => {
    const file = await exportContentBatch({ pack, customer, options: { safeOnly: false } }, "xlsx");
    const zip = await JSZip.loadAsync(file.contents);
    expect(zip.file("xl/workbook.xml")).toBeTruthy();
    expect(await zip.file("xl/workbook.xml").async("string")).toContain("平台外壳");
    expect(file.filename).toBe("测试-客户_2026-09-04_第2批.xlsx");
  });

  it("backs up every batch including risky drafts", async () => {
    const file = await exportContentHistory({ packs: [pack], customer }, "md");
    expect(file.contents.toString("utf8")).toContain("改后");
    expect(file.contents.toString("utf8")).toContain("命中红线");
  });
});


it("平台整条反馈保留在 Excel 与 Markdown 导出中", async () => {
  const input = { pack, customer, feedback: { "d1-平台-小红书-0": "replied" }, options: { kind: "shells" } };
  const rows = contentExportData(input).rows;
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => row.feedback === "有回音")).toBe(true);
  const file = await exportContentBatch(input, "xlsx");
  const zip = await JSZip.loadAsync(file.contents);
  const sheets = await Promise.all(Object.values(zip.files).filter((entry) => /worksheets\/sheet.*xml$/.test(entry.name)).map((entry) => entry.async("string")));
  expect(sheets.join("")).toContain("整条反馈");
  expect(sheets.join("")).toContain("有回音");
  expect((await exportContentBatch(input, "md")).contents.toString()).toContain("有回音");
});
