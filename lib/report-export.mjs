import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";
import JSZip from "jszip";

import { renderPackPage } from "./pack-page.mjs";
import { packAsSent } from "./pack-edits.mjs";
import { fieldsFor, normalizeShellItem } from "./platform.mjs";

const LOGO_SOURCE = fileURLToPath(new URL("../images/logo-harta.png", import.meta.url));

const FORMAT = {
  pdf: {
    extension: "pdf",
    mime: "application/pdf",
  },
  docx: {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

/* Kept for offline HTML snapshot / tests. Export itself uses pure Node PDF/DOCX. */
const EXPORT_CSS = `
@page { size: A4; margin: 18mm 17mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #203235; background: #fff; font: 10.5pt/1.65 "PingFang SC", "Microsoft YaHei", sans-serif; }
.pack { max-width: none; margin: 0; padding: 0; }
.letterhead { display: table; width: 100%; margin: 0 0 18pt; padding: 0 0 12pt; border-bottom: 1.2pt solid #37686a; }
.letterhead > div, .letterhead > span { display: table-cell; vertical-align: bottom; }
.letterhead > span { text-align: right; color: #657b7d; font: 8pt/1.4 "SF Mono", Menlo, monospace; letter-spacing: .08em; }
.letterhead .logo { display: block; width: 122pt; height: auto; }
.brand-line { margin: 4pt 0 0; color: #657b7d; font-size: 8pt; letter-spacing: .08em; }
h1 { margin: 9pt 0 13pt; color: #183134; font-size: 22pt; line-height: 1.34; }
h2 { margin: 28pt 0 9pt; color: #183134; font-size: 13pt; line-height: 1.35; page-break-after: avoid; }
h3 { margin: 0 0 6pt; color: #234e51; font-size: 11pt; line-height: 1.4; page-break-after: avoid; }
p { margin: 0 0 6pt; }
.meta { color: #60777a; font-size: 9pt; }
.k, .field-k { margin-bottom: 3pt; color: #527073; font: 8pt/1.35 "SF Mono", Menlo, monospace; letter-spacing: .08em; }
.folio { width: 100%; margin: 8pt 0 10pt; border: 1px solid #b9c9c9; }
.folio-cell { display: inline-block; width: 49.5%; min-height: 65pt; padding: 9pt 10pt; vertical-align: top; border-right: 1px solid #d5dfdf; border-bottom: 1px solid #d5dfdf; page-break-inside: avoid; }
.folio-cell:nth-child(2n) { border-right: 0; }
.folio-cell:nth-last-child(-n+2) { border-bottom: 0; }
.folio-3 .folio-cell { width: 33%; border-bottom: 0; }
.folio-3 .folio-cell:nth-child(2n) { border-right: 1px solid #d5dfdf; }
.folio-3 .folio-cell:nth-child(3n) { border-right: 0; }
.is-who { background: #edf7f5; }
.is-skip { background: #fbf1ee; }
.sleeves { margin: 5pt 0 9pt; }
.sleeve { margin: 0 0 12pt; page-break-inside: avoid; }
.sleeve-tab { padding: 0 0 5pt; border-bottom: 1px solid #aac0c1; color: #315e61; font: 8.5pt/1.4 "SF Mono", Menlo, monospace; letter-spacing: .08em; }
.sleeve-body { padding: 7pt 0 0; }
.sleeve-fields { margin: 6pt 0; padding: 8pt 10pt 2pt; border: 1px solid #d5dfdf; }
.sleeve-fields > div { margin-bottom: 7pt; }
.line { margin: 7pt 0 0; padding: 8pt 10pt; border: 1px solid #d5dfdf; background: #f7faf9; page-break-inside: avoid; }
.asis { white-space: pre-line; }
.plat { margin: 14pt 0; page-break-inside: avoid; }
.plat h3 { padding-bottom: 5pt; border-bottom: 1px solid #aac0c1; color: #315e61; font-size: 9pt; letter-spacing: .08em; }
.plat h3 span { float: right; color: #60777a; font-weight: normal; }
section { break-inside: auto; }
.pack section:last-child h2 { margin-top: 12pt; }
`;

/* 首选仓库自带字体，保证无系统中文字体的机器（如精简 Ubuntu 服务器）也能导出；
   postscriptName 供 .ttc 字体集合挑出简体中文字面。 */
const BUNDLED_CJK_FONT = fileURLToPath(new URL("../fonts/wqy-microhei.ttc", import.meta.url));

const CJK_FONT_CANDIDATES = [
  { path: BUNDLED_CJK_FONT, postscriptName: "WenQuanYiMicroHei" },
  { path: "/Library/Fonts/Arial Unicode.ttf" },
  { path: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf" },
  { path: "/System/Library/Fonts/Hiragino Sans GB.ttc", postscriptName: "HiraginoSansGB-W3" },
  { path: "/System/Library/Fonts/Supplemental/Songti.ttc", postscriptName: "STSongti-SC-Regular" },
  { path: "C:\\Windows\\Fonts\\msyh.ttc", postscriptName: "MicrosoftYaHei" },
  { path: "C:\\Windows\\Fonts\\simhei.ttf" },
  { path: "C:\\Windows\\Fonts\\simsun.ttc", postscriptName: "SimSun" },
  { path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", postscriptName: "NotoSansCJKsc-Regular" },
  { path: "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", postscriptName: "NotoSansCJKsc-Regular" },
  { path: "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf" },
  { path: "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", postscriptName: "WenQuanYiMicroHei" },
];

function safeFilenamePart(value) {
  return String(value || "报告")
    .replace(/[\\/:*?"<>|\r\n]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72) || "报告";
}

export function reportFilename(customer, pack, format) {
  const spec = FORMAT[format];
  if (!spec) throw new Error("不支持这个导出格式");
  return `${safeFilenamePart(customer?.name)}-${safeFilenamePart(pack?.title)}.${spec.extension}`;
}

export function reportMime(format) {
  const spec = FORMAT[format];
  if (!spec) throw new Error("不支持这个导出格式");
  return spec.mime;
}

export function renderReportExportHtml(pack, customer) {
  return renderPackPage(pack, customer)
    .replace(/<link rel="stylesheet" href="[^"]+">/, `<style>${EXPORT_CSS}</style>`)
    .replace(/<a class="skip"[^>]*>[^<]*<\/a>\s*/, "")
    .replace(/src="\/images\/logo-harta\.png"/, 'src="logo-harta.png"')
    .replace('width="1210" height="480"', 'width="180" height="71"');
}

const xml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function docxText(value) {
  return Array.from(String(value ?? "")).map((char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\n") return "</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space=\"preserve\">";
    return char;
  }).join("");
}

function textRun(value, { bold = false, color = "203235", size = 21 } = {}) {
  const text = docxText(value);
  if (!text) return "";
  return `<w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:color w:val=\"${color}\"/><w:sz w:val=\"${size}\"/><w:szCs w:val=\"${size}\"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function paragraph(value = "", options = {}) {
  const { style = "", bold = false, color, size, before = 0, after = 120, keep = false, shd = "" } = options;
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : "",
    `<w:spacing w:before="${before}" w:after="${after}"/>`,
    keep ? "<w:keepNext/>" : "",
    shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${pPr}</w:pPr>${textRun(value, { bold, color, size })}</w:p>`;
}

function labelValue(label, value) {
  if (!value) return "";
  return `<w:p><w:pPr><w:spacing w:after="90"/></w:pPr>${textRun(`${label}：`, { bold: true, color: "315E61", size: 19 })}${textRun(value, { size: 21 })}</w:p>`;
}

function documentLogo() {
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="2743200" cy="1088064"/><wp:docPr id="1" name="灵鹿增长 Logo" descr="灵鹿增长 HARTA 标志"/>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo-harta.png"/><pic:cNvPicPr/></pic:nvPicPr>
        <pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
        <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2743200" cy="1088064"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
        </pic:pic>
      </a:graphicData></a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>`;
}

/** Word 版本保留同一份实际发送内容，但用线性阅读结构，便于客户打印和批注。 */
export function renderReportDocxXml(pack, customer) {
  const sent = packAsSent(pack);
  const out = [
    documentLogo(),
    paragraph("助力线索｜引流｜获客", { color: "60777A", size: 17, after: 240 }),
    paragraph(pack.title || "获客素材提案", { style: "Title", after: 120, keep: true }),
    paragraph([customer.name, customer.pitch, customer.city, pack.tier].filter(Boolean).join(" · "), { color: "60777A", size: 19, after: 100 }),
    pack.gate ? paragraph(pack.gate, { color: "315E61", size: 19, after: 220, shd: "EDF6F3" }) : "",
  ];
  const section = (title, rows) => {
    const content = rows.filter(Boolean);
    if (content.length) out.push(paragraph(title, { style: "Heading1", keep: true }), ...content);
  };

  if (pack.demand?.who) {
    section("目标需求与排除人群", [
      labelValue("目标人群（要截住）", pack.demand.who),
      labelValue("目标人群会这样问", (pack.demand.say || []).join("；")),
      labelValue("目标人群会搜索这些", (pack.demand.search || []).join(" · ")),
      labelValue("排除人群（不投）", (pack.demand.skip || []).join("；")),
    ]);
  }
  if (pack.questions?.length) {
    section("赛道格局", [pack.landscape ? paragraph(pack.landscape) : ""]);
    section("想先跟你确认的", pack.questions.flatMap((q, index) => [
      paragraph(`问${index + 1} · ${q.ask}`, { style: "Heading2", keep: true }),
      q.why ? paragraph(q.why, { color: "60777A", size: 19 }) : "",
    ]));
  } else if (pack.gaps?.length) {
    section("我们看到的", pack.gaps.flatMap((gap, index) => [
      paragraph(`缺口${index + 1} · ${gap.name}`, { style: "Heading2", keep: true }),
      labelValue("现状", gap.fact), labelValue("代价", gap.cost), labelValue("为什么改不动", gap.cause), labelValue("你自己可以", gap.verify),
    ]));
  }
  if (pack.honest) section("一句真话", [paragraph(pack.honest)]);
  if (pack.checks?.guardrails?.length) {
    section("上线边界", pack.checks.guardrails.map((row) => labelValue(`${row.label}（发布前核验）`, row.text)));
  }
  const copyRows = Object.entries(sent.copies || {}).flatMap(([name, lines]) => [
    paragraph(`${name} · ${lines.length} 条`, { style: "Heading2", keep: true }),
    ...lines.map((line) => paragraph(line, { after: 100 })),
  ]);
  section(pack.questions?.length ? "样品 · 试探文案" : "样品 · 素材文案", copyRows);
  const shellRows = Object.entries(sent.shells || {}).flatMap(([platform, items]) => [
    paragraph(platform, { style: "Heading2", keep: true }),
    ...(items || []).flatMap((raw) => {
      const item = normalizeShellItem(raw);
      if (!item) return [];
      return fieldsFor(platform).map((field) => labelValue(field.label, item[field.key]));
    }),
  ]);
  section("各平台外壳", shellRows);
  if (pack.boards?.length) {
    section("样品 · 分镜脚本", pack.boards.flatMap((board) => [
      paragraph(`${board.title}${board.platform ? ` · ${board.platform}` : ""}`, { style: "Heading2", keep: true }),
      board.hook ? labelValue("前 3 秒", board.hook) : "",
      ...(board.shots || []).map((shot) => labelValue(shot.at || "镜头", `${shot.visual || ""}${shot.line ? `　口播：${shot.line}` : ""}`)),
      board.close ? labelValue("收口", board.close) : "",
    ]));
  }
  const landing = pack.landing;
  if (landing?.firstScreen) {
    section("承接：人点进来之后", [
      labelValue("落地页第一屏", landing.firstScreen), labelValue("留了资立刻给", landing.reward),
      labelValue("承接方式", landing.way), labelValue("表单只问", (landing.form || []).join("；")), labelValue("最常漏的地方", landing.leak),
      ...(landing.firstTouch?.open || []).map((row) => labelValue(row.from || "线索来了第一句", row.say)),
      ...(landing.firstTouch?.pushback || []).map((row) => labelValue(`对方说「${row.said}」`, row.reply)),
      ...(landing.rewardOutline || []).map((row, index) => labelValue(`资料目录 ${index + 1}`, row)),
    ]);
  }
  if (pack.battlefields?.length || pack.testPath || pack.supply) {
    section("怎么投", [
      labelValue("主战场", (pack.battlefields || []).join(" + ")),
      pack.battlefieldWhy ? labelValue("为什么是这两个", pack.battlefieldWhy) : "",
      labelValue("测试路径", pack.testPath), labelValue("补给节奏", pack.supply),
      paragraph("出价和定向让你们代运营定，我们负责让他们有好素材可投。", { color: "60777A", size: 19 }),
    ]);
  }
  if (pack.next?.length) section("下一步", pack.next.map((next, index) => paragraph(`${index + 1}. ${next}`)));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>
${out.filter(Boolean).join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1020" w:right="1020" w:bottom="1134" w:left="1020" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo-harta.png"/></Relationships>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Microsoft YaHei" w:hAnsi="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:color w:val="183134"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:color w:val="183134"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:color w:val="315E61"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style></w:styles>`;


export async function resolveCjkFont() {
  const override = String(process.env.HARTA_CJK_FONT || "").trim();
  if (override) {
    try {
      await fs.access(override, fsConstants.R_OK);
      return { path: override };
    } catch {
      /* fall through to known candidates */
    }
  }
  for (const candidate of CJK_FONT_CANDIDATES) {
    try {
      await fs.access(candidate.path, fsConstants.R_OK);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function exportDocx(pack, customer) {
  const zip = new JSZip();
  const now = new Date().toISOString();
  const logo = await fs.readFile(LOGO_SOURCE);
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels").file(".rels", ROOT_RELS);
  zip.folder("docProps")
    .file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(pack.title || "获客素材提案")}</dc:title><dc:creator>灵鹿增长 HARTA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`)
    .file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>灵鹿增长 HARTA</Application></Properties>`);
  const word = zip.folder("word");
  word.file("document.xml", renderReportDocxXml(pack, customer));
  word.file("styles.xml", STYLES);
  word.folder("_rels").file("document.xml.rels", DOC_RELS);
  word.folder("media").file("logo-harta.png", logo);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/* —— PDF 排版 —— 和甲方页同一套青绿色系。分节 + 提示框 + 双列格子 + 页脚，
 * 不再用文字流：销售拿去打印、发甲方，它得像一份做过排版的东西。 */
const PDF_C = {
  deep: "#183134",
  ink: "#203235",
  teal: "#315E61",
  brand: "#37686A",
  meta: "#60777A",
  border: "#D5DFDF",
  rule: "#AAC0C1",
  tint: "#EDF6F3",
  warm: "#FBF1EE",
  warnBar: "#C97B5D",
  white: "#FFFFFF",
};

export async function exportPdf(pack, customer) {
  const font = await resolveCjkFont();
  if (!font) {
    throw new Error("报告导出失败：本机找不到可用的中文字体（可把任意中文字体 TTF/TTC 的完整路径设到环境变量 HARTA_CJK_FONT 后重试）");
  }
  const sent = packAsSent(pack);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 58, right: 50, bottom: 66, left: 50 },
    /* 页脚要回头补画页码，页必须留在缓冲区里，不能每加一页就把前面的 flush 掉 */
    bufferPages: true,
    info: {
      Title: pack?.title || "获客素材提案",
      Author: "灵鹿增长 HARTA",
      Creator: "灵鹿增长 HARTA",
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("CJK", font.path, font.postscriptName);
  doc.font("CJK");

  const M = doc.page.margins;
  const CW = doc.page.width - M.left - M.right;
  const need = (h) => {
    if (doc.y + h > doc.page.height - M.bottom - 40) doc.addPage();
  };
  const measure = (t, size, width, lineGap = 2.5) => {
    doc.fontSize(size);
    return doc.heightOfString(t, { width, lineGap });
  };
  const para = (t, { size = 10, color = PDF_C.ink, after = 7, lineGap = 3 } = {}) => {
    doc.fillColor(color).fontSize(size).text(t, M.left, doc.y, { width: CW, lineGap });
    doc.y += after;
  };
  const kv = (label, body, { labelW = 92 } = {}) => {
    if (!body) return;
    need(20);
    const y = doc.y;
    doc.fillColor(PDF_C.teal).fontSize(8.5).text(label, M.left, y + 1, { width: labelW, characterSpacing: 0.5 });
    doc.fillColor(PDF_C.ink).fontSize(9.8).text(body, M.left + labelW + 8, y, { width: CW - labelW - 8, lineGap: 2.5 });
    doc.y += 8;
  };
  const sectionHeader = (title) => {
    need(64);
    doc.y += 13;
    const y = doc.y;
    doc.rect(M.left, y + 2, 3.5, 13).fill(PDF_C.brand);
    doc.fillColor(PDF_C.deep).fontSize(13.5).text(title, M.left + 11, y, { characterSpacing: 0.6, lineBreak: false });
    const lineY = y + 22;
    doc.moveTo(M.left, lineY).lineTo(M.left + CW, lineY).lineWidth(0.8).stroke(PDF_C.border);
    doc.y = lineY + 14;
  };
  const callout = (label, body, { fill = PDF_C.tint, bar = PDF_C.brand } = {}) => {
    if (!body) return;
    const padX = 13;
    const textW = CW - padX * 2 - 4;
    const h = 15 + measure(body, 9.5, textW) + 15;
    need(h + 8);
    const y = doc.y;
    doc.rect(M.left, y, CW, h).fill(fill);
    doc.rect(M.left, y, 3, h).fill(bar);
    doc.fillColor(PDF_C.teal).fontSize(7.5).text(label, M.left + padX, y + 9, { characterSpacing: 1.2, lineBreak: false });
    doc.fillColor(PDF_C.ink).fontSize(9.5).text(body, M.left + padX, y + 24, { width: textW, lineGap: 2.5 });
    doc.y = y + h + 13;
  };
  const grid2 = (cells) => {
    const gap = 10;
    const w = (CW - gap) / 2;
    for (let i = 0; i < cells.length; i += 2) {
      const row = cells.slice(i, i + 2);
      const h = 26 + Math.max(...row.map((c) => measure(c.body, 9.5, w - 22))) + 8;
      need(h + 4);
      const y = doc.y;
      row.forEach((c, j) => {
        const x = M.left + j * (w + gap);
        doc.rect(x, y, w, h).fill(c.fill || PDF_C.tint);
        doc.fillColor(c.ink || PDF_C.teal).fontSize(7.5).text(c.label, x + 11, y + 10, { characterSpacing: 1.2, lineBreak: false });
        doc.fillColor(PDF_C.ink).fontSize(9.5).text(c.body, x + 11, y + 26, { width: w - 22, lineGap: 2.5 });
      });
      doc.y = y + h + 10;
    }
  };
  const numbered = (items, { color = PDF_C.ink } = {}) => {
    items.forEach((t, i) => {
      need(18);
      const y = doc.y;
      doc.fillColor(PDF_C.brand).fontSize(9).text(String(i + 1), M.left + 2, y, { lineBreak: false });
      doc.fillColor(color).fontSize(9.8).text(t, M.left + 20, y, { width: CW - 20, lineGap: 2.5 });
      doc.y += 6;
    });
  };
  const kicker = (label) => {
    need(16);
    doc.fillColor(PDF_C.brand).fontSize(8).text(label, M.left, doc.y, { characterSpacing: 1, lineBreak: false });
    doc.y += 15;
  };

  /* 信头 */
  try {
    await fs.access(LOGO_SOURCE, fsConstants.R_OK);
    doc.image(LOGO_SOURCE, M.left, 46, { width: 118 });
  } catch {
    /* logo optional */
  }
  doc.fillColor(PDF_C.meta).fontSize(7.5).text("助力线索｜引流｜获客", M.left, 99, { characterSpacing: 1.5, lineBreak: false });
  doc.moveTo(M.left, 115).lineTo(M.left + CW, 115).lineWidth(1.1).stroke(PDF_C.rule);
  doc.y = 130;

  /* 标题区 */
  doc.fillColor(PDF_C.deep).fontSize(21).text(pack.title || "获客素材提案", M.left, doc.y, { width: CW, lineGap: 4, characterSpacing: 0.3 });
  doc.y += 9;
  para([customer?.name, customer?.pitch, customer?.city, pack.tier].filter(Boolean).join(" · "), { size: 9, color: PDF_C.meta, after: 3 });
  para(`出档日期 ${new Date().toLocaleDateString("zh-CN")}`, { size: 8, color: PDF_C.meta, after: 13 });
  callout("这份档的证据边界", pack.gate);

  if (pack.demand?.who) {
    sectionHeader("目标需求与排除人群");
    grid2([
      { label: "目标人群（要截住）", body: pack.demand.who, fill: PDF_C.tint },
      { label: "他们会这么说", body: (pack.demand.say || []).join("；"), fill: PDF_C.paper },
      { label: "他们在搜什么", body: (pack.demand.search || []).join(" · "), fill: PDF_C.paper },
      { label: "不该打谁", body: (pack.demand.skip || []).join("；"), fill: PDF_C.warm, ink: PDF_C.warnBar },
    ]);
  }

  if (pack.landscape) {
    sectionHeader("赛道格局");
    para(pack.landscape, { size: 9.8 });
  }
  if (pack.questions?.length) {
    sectionHeader("想先跟你确认的");
    pack.questions.forEach((q, i) => {
      need(46);
      kicker(`问 ${i + 1}`);
      para(q.ask, { size: 10.5, color: PDF_C.deep, after: 3 });
      if (q.why) para(q.why, { size: 9, color: PDF_C.meta, after: 11 });
    });
  } else if (pack.gaps?.length) {
    sectionHeader("我们看到的");
    pack.gaps.forEach((g, i) => {
      need(64);
      kicker(`缺口 ${i + 1}`);
      para(g.name, { size: 11, color: PDF_C.deep, after: 5 });
      kv("现状", g.fact);
      kv("代价", g.cost);
      kv("为什么改不动", g.cause);
      if (g.verify) para(`你自己可以：${g.verify}`, { size: 9, color: PDF_C.meta, after: 13 });
    });
  }

  callout("一句真话", pack.honest, { fill: PDF_C.warm, bar: PDF_C.warnBar });

  if (pack.checks?.guardrails?.length) {
    sectionHeader("上线边界（发布前核验）");
    pack.checks.guardrails.forEach((row) => kv(row.label, row.text));
  }

  const copyGroups = Object.entries(sent.copies || {});
  if (copyGroups.length) {
    sectionHeader(pack.questions?.length ? "样品 · 试探文案" : "样品 · 素材文案");
    for (const [name, lines] of copyGroups) {
      need(34);
      para(`${name} · ${lines.length} 条`, { size: 10, color: PDF_C.teal, after: 6 });
      numbered(lines);
      doc.y += 8;
    }
  }

  const shellEntries = Object.entries(sent.shells || {});
  if (shellEntries.length) {
    sectionHeader("各平台外壳");
    const mains = new Set(pack.battlefields || []);
    for (const [platform, items] of shellEntries) {
      need(46);
      const y = doc.y;
      doc.fillColor(PDF_C.deep).fontSize(10.5).text(platform, M.left, y, { characterSpacing: 0.4, lineBreak: false });
      if (mains.has(platform)) {
        const wName = doc.widthOfString(platform) + 9;
        doc.rect(M.left + wName, y + 1.5, 46, 12).fill(PDF_C.brand);
        doc.fillColor(PDF_C.white).fontSize(7).text("主战场", M.left + wName, y + 3.5, { width: 46, align: "center", characterSpacing: 1.5, lineBreak: false });
      }
      doc.y = y + 21;
      for (const raw of items || []) {
        const item = normalizeShellItem(raw);
        if (!item) continue;
        for (const f of fieldsFor(platform)) {
          if (item[f.key]) kv(f.label, item[f.key], { labelW: 60 });
        }
        doc.y += 4;
      }
      doc.y += 8;
    }
  }

  if (pack.boards?.length) {
    sectionHeader("样品 · 分镜脚本");
    pack.boards.forEach((board, i) => {
      need(50);
      kicker(`分镜 ${i + 1} · ${board.title}${board.platform ? ` · ${board.platform}` : ""}`);
      kv("前 3 秒", board.hook);
      for (const shot of board.shots || []) {
        kv(shot.at || "镜头", `${shot.visual || ""}${shot.line ? `　口播：${shot.line}` : ""}`);
      }
      kv("收口", board.close);
      doc.y += 8;
    });
  }

  const landing = pack.landing;
  if (landing?.firstScreen) {
    sectionHeader("承接：人点进来之后");
    kv("第一屏", landing.firstScreen);
    kv("留了资立刻给", landing.reward);
    kv("承接方式", landing.way);
    if ((landing.form || []).length) kv("表单只问", landing.form.join("；"));
    kv("最常漏的地方", landing.leak);
    for (const row of landing.firstTouch?.open || []) kv(row.from || "线索来了第一句", row.say);
    for (const row of landing.firstTouch?.pushback || []) kv(`对方说「${row.said}」`, row.reply);
    if ((landing.rewardOutline || []).length) {
      para("给的东西，目录长这样", { size: 9, color: PDF_C.teal, after: 6 });
      numbered(landing.rewardOutline);
    }
  }

  if (pack.battlefields?.length || pack.testPath || pack.supply) {
    sectionHeader("怎么投");
    kv("主战场", (pack.battlefields || []).join(" + "));
    kv("为什么是这两个", pack.battlefieldWhy);
    kv("测试路径", pack.testPath);
    kv("补给节奏", pack.supply);
    para("出价和定向让你们代运营定，我们负责让他们有好素材可投。", { size: 8.5, color: PDF_C.meta, after: 4 });
  }

  if (pack.next?.length) {
    sectionHeader("下一步");
    numbered(pack.next);
  }

  /* 页脚：每页一条细线 + 品牌字 + 页码。内容排完才知道总页数，回头补画。
   * 不能先 flushPages——那会把缓冲页清空，switchToPage 就没有可回写的页了。 */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 40;
    doc.moveTo(M.left, y).lineTo(doc.page.width - M.right, y).lineWidth(0.7).stroke(PDF_C.border);
    doc.fillColor(PDF_C.meta).fontSize(7).text("灵鹿增长 HARTA · 判断报告", M.left, y + 7, { lineBreak: false });
    const pageNo = `第 ${i + 1} 页`;
    doc.text(pageNo, doc.page.width - M.right - doc.widthOfString(pageNo), y + 7, { lineBreak: false });
  }

  doc.end();
  return finished;
}

export async function exportReport(pack, customer, format) {
  const spec = FORMAT[format];
  if (!spec) throw new Error("不支持这个导出格式");

  try {
    const contents = format === "docx"
      ? await exportDocx(pack, customer)
      : await exportPdf(pack, customer);
    if (!contents?.length) throw new Error("导出文件为空");
    return {
      contents: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
      filename: reportFilename(customer, pack, format),
      mime: spec.mime,
    };
  } catch (err) {
    const message = String(err?.message || "");
    if (message.startsWith("报告导出失败：")) throw err;
    throw new Error(`报告导出失败：${message || "请稍后重试"}`);
  }
}
