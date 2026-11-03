import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';

export const MAX_ROWS = 3000;

/* 只接触不可信字节的解析器集中在这里：xlsx/docx/pdf 的第三方解析
 * （ExcelJS、mammoth、pdf-parse、JSZip 解压扫描）跑在 fork 的子进程里
 * （keyword-parser.mjs 负责 spawn），CSV/TXT/MD 只经过 TextDecoder 和
 * 纯字符串处理，留在父进程。这是资源隔离，不是针对解析器漏洞的
 * 安全沙箱；公网部署应使用受限 OS 用户。 */
async function guardOfficePackage(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter(f => !f.dir);
  if (entries.length > 2000) throw new Error('文档内部文件过多，请精简后导入');
  let bytes = 0;
  for (const entry of entries) {
    await new Promise((resolve, reject) => {
      const stream = entry.internalStream('uint8array');
      stream.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 30 * 1024 * 1024) { stream.pause(); reject(new Error('文档解压后超过30MB，请分批导入')); }
      });
      stream.on('end', resolve); stream.on('error', reject); stream.resume();
    });
  }
}

export async function readKeywordFile({ name, path: filename }) {
  const ext = path.extname(name || '').toLowerCase();
  if (ext === '.xlsx') {
    await guardOfficePackage(fs.readFileSync(filename));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filename);
    const sheets = [];
    for (const sheet of workbook.worksheets) {
      if (sheet.rowCount > MAX_ROWS + 10) throw new Error(`${name} 每张工作表最多${MAX_ROWS}行，请分批导入`);
      const rows = [];
      for (let i = 1; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        if (row.cellCount > 80) throw new Error('表格最多支持80列');
        rows.push(Array.from({ length: row.cellCount }, (_, c) => row.getCell(c + 1).text));
      }
      sheets.push({ name: sheet.name, rows });
    }
    return { kind: 'sheets', sheets };
  }
  if (ext === '.docx') {
    await guardOfficePackage(fs.readFileSync(filename));
    return { kind: 'text', text: (await mammoth.extractRawText({ path: filename })).value };
  }
  if (ext === '.pdf') return { kind: 'text', text: (await pdf(fs.readFileSync(filename))).text };
  throw new Error('不支持的文件类型');
}
