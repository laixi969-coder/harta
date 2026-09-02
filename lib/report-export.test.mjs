import { describe, expect, it } from "vitest";
import {
  exportReport,
  renderReportDocxXml,
  renderReportExportHtml,
  reportFilename,
  reportMime,
} from "./report-export.mjs";

const customer = { name: "某某旧改", hunt: "家装", city: "广州", pitch: "老房翻新" };
const pack = {
  title: "报价单上真正吃人的",
  tier: "快档",
  demand: { who: "老小区业主", say: ["怎么问"], search: ["搜索词"], skip: ["不投的人"] },
  gaps: [{ name: "作品视角", fact: "事实", cost: "代价", cause: "原因", verify: "核对方法" }],
  copies: { A: ["文案一"] },
  shells: { 巨量信息流: ["外壳一"] },
};

describe("判断报告导出", () => {
  it("沿用甲方页内容，但把资源换成可离线转换的打印样式", () => {
    const html = renderReportExportHtml(pack, customer);
    expect(html).toContain("报价单上真正吃人的");
    expect(html).toContain("作品视角");
    expect(html).toContain('alt="灵鹿线索 HARTA"');
    expect(html).not.toContain('href="/css/app.css');
    expect(html).toContain('src="logo-harta.png"');
    expect(html).toContain('width="180" height="71"');
    expect(html).not.toContain("跳到正文");
  });

  it("使用准确的文件名和 MIME 类型", () => {
    expect(reportFilename(customer, pack, "pdf")).toBe("某某旧改-报价单上真正吃人的.pdf");
    expect(reportFilename({ name: "a/b" }, { title: "x:y" }, "docx")).toBe("a-b-x-y.docx");
    expect(reportMime("pdf")).toBe("application/pdf");
    expect(reportMime("docx")).toContain("wordprocessingml.document");
  });

  it("Word 文档引用实际 Logo，并将报告正文放进文档 XML", () => {
    const documentXml = renderReportDocxXml(pack, customer);
    expect(documentXml).toContain('r:embed="rId2"');
    expect(documentXml).toContain("目标需求与排除人群");
    expect(documentXml).toContain("报价单上真正吃人的");
  });

  it("纯 Node 导出 PDF 以 %PDF 开头、DOCX 以 PK 开头", async () => {
    const pdf = await exportReport(pack, customer, "pdf");
    expect(pdf.mime).toBe("application/pdf");
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(pdf.contents.slice(0, 4).toString("utf8")).toBe("%PDF");

    const docx = await exportReport(pack, customer, "docx");
    expect(docx.mime).toContain("wordprocessingml.document");
    expect(docx.filename).toMatch(/\.docx$/);
    expect(docx.contents.slice(0, 2).toString("utf8")).toBe("PK");
  }, 30_000);
});
