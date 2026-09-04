import JSZip from "jszip";
import { copyKey, editOf, packAsSent, shellKey } from "./pack-edits.mjs";
import { contentItemKey, contentStateOf, contentStatusLabel } from "./content-workflow.mjs";

const FIELD_LABELS = { cover: "封面大字", title: "标题 / 文案", body: "正文" };

function cleanText(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function xml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeName(value) {
  return String(value || "客户")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "客户";
}

function hardRows(pack) {
  const checks = pack?.checks || {};
  return [
    ...(checks.redline || []),
    ...(checks.sensitive || []),
    ...(checks.length || []).filter((row) => row.level === "hard"),
    ...(checks.quality || []).filter((row) => row.level === "hard"),
  ];
}

function riskOf(pack, text) {
  const rows = hardRows(pack);
  const batch = rows.filter((row) => row.scope === "batch");
  const direct = rows.filter((row) => row.scope !== "batch" && String(row.text || "") === String(text || ""));
  const matched = [...batch, ...direct];
  return matched.map((row) => row.why || row.where || (row.words || []).join("、") || "硬限制").join("；");
}

function batchLabel(pack) {
  return pack?.batch ? `第 ${pack.batch} 批` : "内容批次";
}

export function collectContentRows(pack, contentStates = {}, feedback = {}) {
  const sent = packAsSent(pack);
  const copies = [];
  for (const [group, lines] of Object.entries(sent.copies || {})) {
    (lines || []).forEach((text, i) => {
      const lineKey = copyKey(group, i);
      const key = contentItemKey(pack.id, lineKey);
      const state = contentStateOf(contentStates, key);
      const edit = editOf(pack, lineKey);
      const fb = feedback[`${pack.id}-${group}-${i}`] || "";
      copies.push({
        key,
        kind: "copy",
        batch: batchLabel(pack),
        generatedAt: pack.date || pack.deliveredAt || pack.createdAt || "",
        plannedAt: state.plannedAt || "",
        publishedAt: String(state.publishedAt || "").slice(0, 10),
        status: state.status,
        statusLabel: contentStatusLabel(state.status),
        group,
        platform: "",
        number: i + 1,
        field: "文案",
        text,
        edited: edit ? "是" : "否",
        original: edit?.was || "",
        feedback: fb === "replied" ? "有回音" : fb === "dead" ? "没反应" : "",
        risk: riskOf(pack, text),
      });
    });
  }
  const shells = [];
  for (const [platform, items] of Object.entries(sent.shells || {})) {
    (items || []).forEach((raw, i) => {
      const item = typeof raw === "string" ? { title: raw } : raw || {};
      for (const field of ["cover", "title", "body"]) {
        if (!item[field]) continue;
        const lineKey = shellKey(platform, i, field);
        const key = contentItemKey(pack.id, lineKey);
        const state = contentStateOf(contentStates, key);
        const edit = editOf(pack, lineKey);
        shells.push({
          key,
          kind: "shell",
          batch: batchLabel(pack),
          generatedAt: pack.date || pack.deliveredAt || pack.createdAt || "",
          plannedAt: state.plannedAt || "",
          publishedAt: String(state.publishedAt || "").slice(0, 10),
          status: state.status,
          statusLabel: contentStatusLabel(state.status),
          group: "",
          platform,
          number: i + 1,
          field: FIELD_LABELS[field] || field,
          text: item[field],
          edited: edit ? "是" : "否",
          original: edit?.was || "",
          feedback: "",
          risk: riskOf(pack, item[field]),
        });
      }
    });
  }
  return { copies, shells };
}

export function contentExportData({ pack, customer, contentStates = {}, feedback = {}, options = {} }) {
  const { copies, shells } = collectContentRows(pack, contentStates, feedback);
  const kind = ["copies", "shells", "all"].includes(options.kind) ? options.kind : "all";
  const scope = ["all", "selected", "group"].includes(options.scope) ? options.scope : "all";
  const selected = new Set(Array.isArray(options.selection) ? options.selection.map(String) : []);
  let rows = kind === "copies" ? copies : kind === "shells" ? shells : [...copies, ...shells];
  if (scope === "selected") rows = rows.filter((row) => selected.has(row.key));
  if (scope === "group") rows = rows.filter((row) => row.kind === "copy" && row.group === String(options.group || ""));
  const considered = rows.length;
  const risky = rows.filter((row) => row.risk);
  if (options.safeOnly !== false) rows = rows.filter((row) => !row.risk);
  return {
    customer,
    pack,
    rows,
    copies: rows.filter((row) => row.kind === "copy"),
    shells: rows.filter((row) => row.kind === "shell"),
    considered,
    excluded: considered - rows.length,
    risky: risky.length,
  };
}

function copySheetRows(rows) {
  return [
    ["批次", "生成日期", "计划日期", "发布日期", "状态", "方向", "序号", "最终文案", "是否修改", "原稿", "反馈", "合规"],
    ...rows.map((row) => [row.batch, row.generatedAt, row.plannedAt, row.publishedAt, row.statusLabel, row.group, row.number, row.text, row.edited, row.original, row.feedback, row.risk || "可发布"]),
  ];
}

function shellSheetRows(rows) {
  return [
    ["批次", "生成日期", "计划日期", "发布日期", "状态", "平台", "序号", "字段", "最终内容", "是否修改", "原稿", "合规"],
    ...rows.map((row) => [row.batch, row.generatedAt, row.plannedAt, row.publishedAt, row.statusLabel, row.platform, row.number, row.field, row.text, row.edited, row.original, row.risk || "可发布"]),
  ];
}

function colName(index) {
  let n = index + 1;
  let out = "";
  while (n) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function worksheetXml(rows) {
  const widths = rows[0]?.map((_, i) => (i === 7 || i === 8 ? 56 : i === 9 || i === 10 ? 40 : 16)) || [];
  const cols = widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheetRows = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const style = r === 0 ? 1 : c === row.length - 1 && value !== "可发布" ? 3 : 2;
      const preserve = /^\s|\s$|\n/.test(String(value ?? "")) ? ' xml:space="preserve"' : "";
      return `<c r="${colName(c)}${r + 1}" t="inlineStr" s="${style}"><is><t${preserve}>${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}"${r === 0 ? ' ht="26" customHeight="1"' : ""}>${cells}</row>`;
  }).join("");
  const range = rows.length && rows[0]?.length ? `A1:${colName(rows[0].length - 1)}${rows.length}` : "A1";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="${range}"/></worksheet>`;
}

async function workbook(sheets) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder("xl").file("workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.folder("xl").folder("_rels").file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.folder("xl").file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Noto Sans CJK SC"/></font><font><b/><color rgb="FFF7FAF9"/><sz val="11"/><name val="Noto Sans CJK SC"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4D9D5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF336B66"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`);
  sheets.forEach((sheet, i) => zip.folder("xl").folder("worksheets").file(`sheet${i + 1}.xml`, worksheetXml(sheet.rows)));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function summaryRows(data, { history = false } = {}) {
  return [
    ["字段", "内容"],
    ["客户", data.customer?.name || ""],
    ["猎场", data.customer?.hunt || ""],
    ["导出范围", history ? "全部内容历史" : `${data.pack?.date || data.pack?.createdAt || ""} ${batchLabel(data.pack)}`],
    ["主战场", history ? "见各批次" : (data.pack?.battlefields || []).join("、")],
    ["导出条目", data.rows.length],
    ["排除风险", data.excluded || 0],
    ["说明", history ? "这是完整备份，风险草稿也会保留并在合规列标明。" : "导出的是当前修改后的最终版本；风险草稿默认不导出。"],
  ];
}

function markdownFor(data, { history = false } = {}) {
  const lines = [`# ${data.customer?.name || "客户"} · ${history ? "内容库全部历史" : `${data.pack?.date || ""} ${batchLabel(data.pack)}`}`, ""];
  if (!history) {
    lines.push(`- 主战场：${(data.pack?.battlefields || []).join("、") || "未标"}`);
    lines.push(`- 导出：${data.rows.length} 条；排除风险：${data.excluded || 0} 条`, "");
  }
  let lastBatch = "";
  for (const row of data.rows) {
    const currentBatch = `${row.generatedAt} ${row.batch}`;
    if (history && currentBatch !== lastBatch) {
      lines.push(`## ${currentBatch}`, "");
      lastBatch = currentBatch;
    }
    const section = row.kind === "copy" ? row.group : `${row.platform} · ${row.number} · ${row.field}`;
    lines.push(`### ${section}`);
    lines.push(row.text, "");
    lines.push(`状态：${row.statusLabel}${row.plannedAt ? ` · 计划 ${row.plannedAt}` : ""}${row.publishedAt ? ` · 发布 ${row.publishedAt}` : ""}${row.feedback ? ` · ${row.feedback}` : ""}`);
    if (row.risk) lines.push(`合规：${row.risk}`);
    lines.push("");
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

export async function exportContentBatch(args, format = "xlsx") {
  const data = contentExportData(args);
  if (!data.considered) throw new Error("这个范围里没有可导出的内容");
  if (!data.rows.length) throw new Error(`所选内容都有风险，已排除 ${data.excluded} 条；如需留底，请勾选“包含风险草稿”`);
  const stem = `${safeName(data.customer?.name)}_${data.pack?.date || data.pack?.createdAt || "内容"}_${data.pack?.batch ? `第${data.pack.batch}批` : "内容批次"}`;
  if (format === "md") {
    return { contents: markdownFor(data), mime: "text/markdown; charset=utf-8", filename: `${stem}.md`, included: data.rows.length, excluded: data.excluded };
  }
  const sheets = [{ name: "批次说明", rows: summaryRows(data) }];
  if (data.copies.length) sheets.push({ name: "文案", rows: copySheetRows(data.copies) });
  if (data.shells.length) sheets.push({ name: "平台外壳", rows: shellSheetRows(data.shells) });
  return { contents: await workbook(sheets), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: `${stem}.xlsx`, included: data.rows.length, excluded: data.excluded };
}

export async function exportContentHistory({ packs = [], customer, contentStates = {}, feedback = {} }, format = "xlsx") {
  const all = packs.flatMap((pack) => {
    const rows = collectContentRows(pack, contentStates, feedback);
    return [...rows.copies, ...rows.shells];
  });
  if (!all.length) throw new Error("这位客户还没有内容批次");
  const data = { customer, rows: all, copies: all.filter((row) => row.kind === "copy"), shells: all.filter((row) => row.kind === "shell"), excluded: 0 };
  const stem = `${safeName(customer?.name)}_内容库_全部历史`;
  if (format === "md") return { contents: markdownFor(data, { history: true }), mime: "text/markdown; charset=utf-8", filename: `${stem}.md`, included: all.length, excluded: 0 };
  const sheets = [
    { name: "备份说明", rows: summaryRows(data, { history: true }) },
    { name: "文案", rows: copySheetRows(data.copies) },
    { name: "平台外壳", rows: shellSheetRows(data.shells) },
  ];
  return { contents: await workbook(sheets), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: `${stem}.xlsx`, included: all.length, excluded: 0 };
}
