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
  it('选中篇目的创作依据同时进入Markdown和Excel，不混入未选篇目', async () => {
    const organic = { ...pack, checks: {}, origin: { mode: 'organic' }, copies: { A: ['正文一'], B: ['正文二'] }, shells: { 小红书: [{ title: '标题一', body: '正文一' }, { title: '标题二', body: '正文二' }] }, execution: [
      { order: 1, brief: { audience: '准备装修的业主', question: '需要确认计费口径', takeaway: '先比较数量', evidence: '用户资料，价格待确认', nextStep: '核对合同', sourceIds: ['S1'] }, visual: '纸上列清单', reason: '先明确预算' },
      { order: 2, brief: { question: '未选篇目私有说明' } },
    ], research: { sources: [{ id: 'S1', title: '公开资料', url: 'https://example.com/source', kind: '搜索摘要，未读取全文' }] } };
    const input = { pack: organic, customer, options: { scope: 'selected', selection: [contentItemKey(pack.id, '小红书|0|body')] } };
    const md = (await exportContentBatch(input, 'md')).contents.toString();
    expect(md).toContain('需要确认计费口径');
    expect(md).toContain('https://example.com/source');
    expect(md).not.toContain('未选篇目私有说明');
    const zip = await JSZip.loadAsync((await exportContentBatch(input, 'xlsx')).contents);
    expect(await zip.file('xl/workbook.xml').async('string')).toContain('创作依据');
    const sheet = await zip.file('xl/worksheets/sheet2.xml').async('string');
    expect(sheet).toContain('需要确认计费口径');
    expect(sheet).toContain('搜索摘要，未读取全文');
    expect(sheet).not.toContain('未选篇目私有说明');
  });
  it('新版按方向导出保留标题、封面和正文，不退回只有基础文案',()=>{
    const organic={...pack,origin:{mode:'organic'},copies:{'方向一':['原始正文']}};
    const data=contentExportData({pack:organic,customer,options:{scope:'group',group:'方向一',kind:'shells'}});
    expect(data.rows).toHaveLength(3);
    expect(data.rows.map(r=>r.field)).toContain('笔记标题');
    expect(data.rows.every(r=>r.kind==='shell')).toBe(true);
  });
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

describe('增长目标与效果导出',()=>{
  it('目标、假设与选中篇目的效果进入Markdown和Excel，零值保留且不泄漏未选篇目',async()=>{
    const testPack={...pack,origin:{mode:'organic',goal:'reach',criteria:'吸引相关业主'},checks:{},shells:{小红书:[{title:'第一篇',body:'第一篇正文'},{title:'第二篇',body:'第二篇正文'}]},execution:[{order:1,brief:{question:'问题一'},growth:{hypothesis:'目标流量假设'}}],outcomes:{'小红书|0':[{platform:'小红书',index:0,start:'2026-01-01',end:'2026-01-07',source:'已选数据来源',criteria:'相关业主',metrics:{views:0},baseline:0,baselineNote:'同平台同窗口',recordedAt:'2026-01-08'}],'小红书|1':[{platform:'小红书',index:1,source:'不该导出的记录',metrics:{views:999}}]}};
    const args={pack:testPack,customer,options:{scope:'selected',selection:['d1::小红书|0|body']}};
    const md=(await exportContentBatch(args,'md')).contents.toString();expect(md).toContain('本批目标：目标流量');expect(md).toContain('目标流量假设');expect(md).toContain('阅读 / 播放：0');expect(md).not.toContain('不该导出的记录');
    const file=await exportContentBatch(args,'xlsx'),zip=await JSZip.loadAsync(file.contents);
    const workbook=await zip.file('xl/workbook.xml').async('string');expect(workbook).toContain('增长假设');expect(workbook).toContain('效果快照');
    const sheets=await Promise.all(Object.keys(zip.files).filter(k=>/^xl\/worksheets\/sheet.*xml$/.test(k)).map(k=>zip.file(k).async('string')));expect(sheets.join('')).toContain('已选数据来源');expect(sheets.join('')).not.toContain('不该导出的记录');
  });
});

it('全部历史备份保留增长记录，长业务快照分段避免Excel单元格上限',async()=>{
 const historyPack={...pack,origin:{mode:'organic',goal:'sales',criteria:'订单'},businessSnapshot:{material:'原'.repeat(40000)},outcomes:{'小红书|0':[{metrics:{orders:2},source:'业务核对记录'}]}};
 const result=await exportContentHistory({packs:[historyPack],customer},'xlsx'),zip=await JSZip.loadAsync(result.contents);
 const xml=await zip.file('xl/worksheets/sheet2.xml').async('string');expect(xml).toContain('业务核对记录');expect(xml).toContain('业务依据JSON');
 const cells=[...xml.matchAll(/<t(?: [^>]*)?>(.*?)<\/t>/gs)].map(m=>m[1]);expect(Math.max(...cells.map(t=>t.length))).toBeLessThan(32767);
});
