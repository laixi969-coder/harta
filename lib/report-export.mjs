import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { renderPackPage } from "./pack-page.mjs";
import { packAsSent } from "./pack-edits.mjs";
import { fieldsFor, normalizeShellItem } from "./platform.mjs";

const execFileAsync = promisify(execFile);

/** Resolve a binary by trying absolute paths and PATH entries in order. */
async function resolveBinary(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes("/") || candidate.includes("\\")) {
      try {
        await fs.access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
    for (const dir of (process.env.PATH || "").split(path.delimiter)) {
      if (!dir) continue;
      const full = path.join(dir, candidate);
      try {
        await fs.access(full, fsConstants.X_OK);
        return full;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

const LOGO_SOURCE = fileURLToPath(new URL("../images/logo-harta.png", import.meta.url));

const FORMAT = {
  pdf: {
    extension: "pdf",
    mime: "application/pdf",
    // writer_web keeps the HTML's reading order when making a PDF.
    soffice: "pdf:writer_web_pdf_Export",
  },
  docx: {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

/* LibreOffice does not load the app's relative stylesheet when the source HTML
 * is in a temporary directory. Keep this deliberately small and print-first:
 * the report remains the same report data as the share page, but pagination is
 * stable in both PDF and Word. */
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
  const { style = "", bold = false, color, size, before = 0, after = 120, keep = false } = options;
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : "",
    `<w:spacing w:before="${before}" w:after="${after}"/>`,
    keep ? "<w:keepNext/>" : "",
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
    pack.gate ? paragraph(pack.gate, { color: "60777A", size: 19, after: 220 }) : "",
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
      labelValue("主战场", (pack.battlefields || []).join(" + ")), labelValue("测试路径", pack.testPath), labelValue("补给节奏", pack.supply),
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

async function exportDocx(pack, customer, tempDir) {
  const dirs = ["_rels", "docProps", "word/_rels", "word/media"];
  await Promise.all(dirs.map((dir) => fs.mkdir(path.join(tempDir, dir), { recursive: true })));
  const now = new Date().toISOString();
  await Promise.all([
    fs.writeFile(path.join(tempDir, "[Content_Types].xml"), CONTENT_TYPES),
    fs.writeFile(path.join(tempDir, "_rels/.rels"), ROOT_RELS),
    fs.writeFile(path.join(tempDir, "word/document.xml"), renderReportDocxXml(pack, customer)),
    fs.writeFile(path.join(tempDir, "word/styles.xml"), STYLES),
    fs.writeFile(path.join(tempDir, "word/_rels/document.xml.rels"), DOC_RELS),
    fs.writeFile(path.join(tempDir, "docProps/core.xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(pack.title || "获客素材提案")}</dc:title><dc:creator>灵鹿增长 HARTA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`),
    fs.writeFile(path.join(tempDir, "docProps/app.xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>灵鹿增长 HARTA</Application></Properties>`),
    fs.copyFile(LOGO_SOURCE, path.join(tempDir, "word/media/logo-harta.png")),
  ]);
  const output = path.join(tempDir, "report.docx");
  const zipBin = await resolveBinary(["zip", "/usr/bin/zip"]);
  if (!zipBin) {
    const missing = new Error("zip");
    missing.code = "ENOENT";
    missing.path = "zip";
    throw missing;
  }
  await execFileAsync(zipBin, ["-q", "-r", output, "[Content_Types].xml", "_rels", "docProps", "word"], { cwd: tempDir, timeout: 30_000 });
  return fs.readFile(output);
}

async function exportPdf(pack, customer, tempDir) {
  const source = path.join(tempDir, "report.html");
  const logo = path.join(tempDir, "logo-harta.png");
  const output = path.join(tempDir, "report.pdf");
  await fs.writeFile(source, renderReportExportHtml(pack, customer), "utf8");
  await fs.copyFile(LOGO_SOURCE, logo);

  const soffice = await resolveBinary([
    process.env.SOFFICE_PATH,
    "soffice",
    "/opt/homebrew/bin/soffice",
    "/usr/local/bin/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ]);
  if (soffice) {
    const profile = path.join(tempDir, "libreoffice-profile");
    await fs.mkdir(profile);
    await execFileAsync(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(`${profile}/`).href}`,
        "--headless",
        "--convert-to",
        FORMAT.pdf.soffice,
        "--outdir",
        tempDir,
        source,
      ],
      { timeout: 45_000, maxBuffer: 1024 * 1024 },
    );
    return fs.readFile(output);
  }

  const chrome = await resolveBinary([
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ]);
  if (chrome) {
    await execFileAsync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${output}`,
        pathToFileURL(source).href,
      ],
      { timeout: 45_000, maxBuffer: 1024 * 1024 },
    );
    return fs.readFile(output);
  }

  const missing = new Error("pdf-export");
  missing.code = "ENOENT";
  missing.path = "pdf-export";
  throw missing;
}

export async function exportReport(pack, customer, format) {
  const spec = FORMAT[format];
  if (!spec) throw new Error("不支持这个导出格式");

  const tempDir = await fs.mkdtemp(path.join(process.cwd(), "tmp-report-export-"));
  try {
    const contents = format === "docx"
      ? await exportDocx(pack, customer, tempDir)
      : await exportPdf(pack, customer, tempDir);
    if (!contents.length) throw new Error("导出文件为空");
    return { contents, filename: reportFilename(customer, pack, format), mime: spec.mime };
  } catch (err) {
    if (err?.code === "ENOENT" && err?.path === "zip") {
      throw new Error("报告导出失败：找不到 zip，无法打包 Word 文件");
    }
    if (err?.code === "ENOENT" && (err?.path === "pdf-export" || err?.path === "soffice")) {
      throw new Error("报告导出失败：本机找不到可用的 PDF 导出工具（LibreOffice 或 Chrome）");
    }
    if (err?.code === "ENOENT") {
      throw new Error(`报告导出失败：缺少必要程序（${err?.path || "unknown"}）`);
    }
    throw new Error(`报告导出失败：${err?.message || "请稍后重试"}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
