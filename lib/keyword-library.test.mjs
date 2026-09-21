import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { parseDelimited, rowsToKeywords, dedupeKeywords, extractKeywordFile, prepareKeywordBatch, keywordContext, keywordScope, keywordCsv } from './keyword-library.mjs';
import { buildResearch, researchFingerprint } from './research.mjs';
import { readWorkspace, writeWorkspace, saveKeywordLibrary, removeKeywordLibrary } from './workspace.mjs';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-keyword-test-'));
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));
const scope = { type: '产品品类', name: '隔音窗' };
function file(name, text) { const p = path.join(temp, name); fs.writeFileSync(p, text); return { name, path: p }; }
describe('关键词文件与语义整理', () => {
  it('CSV 支持 BOM、转义引号、换行、零值，品牌与平台不混合去重', () => {
    const rows = parseDelimited('\uFEFF备注,关键词,品牌,搜索指数\r\n"两行\n说明",隔音窗多少钱,A,0\r\n"他说""好""",隔音窗多少钱,A,30\r\n另一个品牌,隔音窗多少钱,B,50');
    const result = dedupeKeywords(rowsToKeywords(rows, '词.csv'));
    expect(result).toHaveLength(2);
    expect(result[0].evidence).toHaveLength(2);
    expect(result[0].evidence[0].fields.find(f => f.name === '搜索指数').value).toBe('0');
    expect(result[0].intent).toBe('价格咨询');
    expect(result[0].stage).toBe('咨询');
    expect(() => parseDelimited('"未闭合')).toThrow('引号');
  });
  it('CSV 导出保留全部词，并转义公式和原始字段中的换行引号', () => {
    const items = rowsToKeywords([['关键词','备注'],['=1+1','包含"引号"和\n换行']], '样例.csv');
    const csv = keywordCsv({scope,items});
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parseDelimited(csv)[1][0]).toBe("'=1+1");
    expect(parseDelimited(csv)[1][9]).toContain('样例.csv');
  });
  it('XLSX 读取多工作表、表头中间列和公式缓存值', async () => {
    const book = new ExcelJS.Workbook();
    const first = book.addWorksheet('门窗'); first.addRow(['导出词库']); first.addRow(['品牌','关键词','指数']); first.addRow(['A','隔音窗怎么选',{ formula: '1+1', result: 2 }]);
    const second = book.addWorksheet('服务'); second.addRow(['关键词','备注']); second.addRow(['附近上门维修','原始说明']);
    const p = path.join(temp, '词.xlsx'); await book.xlsx.writeFile(p);
    const result = await extractKeywordFile({ name:'词.xlsx', path:p }, {modelReady:false});
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ keyword:'隔音窗怎么选', brand:'A', stage:'比较' });
    expect(result.items[0].evidence[0]).toMatchObject({sheet:'门窗',row:3});
    expect(result.items[0].evidence[0].fields.find(f => f.name === '指数').value).toBe('2');
  });
  it('DOCX 提取原文词，剔除模型编造词；保留语义分组的有效引用', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>业主询问隔音窗怎么选，以及临街噪音问题。</w:t></w:r></w:p></w:body></w:document>');
    const doc = file('关键词.docx', await zip.generateAsync({type:'nodebuffer'}));
    const chatFn = vi.fn(async ({user}) => user.includes('从原文提取') ? '{"keywords":["隔音窗怎么选","临街噪音","虚构词"]}' : '{"groups":[{"topic":"选窗","scenario":"临街住宅","angle":"选型问题","ids":["K1","FAKE"]}]}');
    const batch = await prepareKeywordBatch([doc], scope, {modelReady:true,chatFn});
    expect(batch.items.map(x => x.keyword)).toEqual(['隔音窗怎么选','临街噪音']);
    expect(batch.analysis.groups[0].ids).toEqual(['K1']);
    expect(batch.analysis.analyzedCount).toBe(1);
    expect(batch.warnings[0]).toContain('并非原始完整词表');
  });
  it('模型失败仍保留表格，空文件与超过行数不能伪装成功', async () => {
    const batch = await prepareKeywordBatch([file('回退.csv','关键词,指数\n隔音窗,0')], scope, {modelReady:true,chatFn:async () => {throw new Error('private-key');}});
    expect(batch.items).toHaveLength(1); expect(batch.analysis.warning).toContain('未完成'); expect(JSON.stringify(batch)).not.toContain('private-key');
    await expect(prepareKeywordBatch([file('空.csv','关键词\n')],scope,{modelReady:false})).rejects.toThrow('没有识别');
    await expect(prepareKeywordBatch([file('超限.csv','关键词\n'+Array.from({length:3001},(_,i)=>`词${i}`).join('\n'))],scope,{modelReady:false})).rejects.toThrow('3000');
    expect(() => keywordScope('不存在','a')).toThrow('请选择');
  });
  it('导入词及语义主题进入研究，导入和移除使旧缓存失效', async () => {
    const batch = await prepareKeywordBatch([file('研究.csv','关键词,品类\n隔音窗报价,隔音窗\n隔音窗怎么选,隔音窗')],scope,{modelReady:false});
    const customer = {hunt:'家装',keywordLibraries:[batch]};
    expect(keywordContext(customer)).toHaveLength(2);
    expect(researchFingerprint(customer,{})).not.toBe(researchFingerprint({...customer,keywordLibraries:[]},{}));
    const chatFn = vi.fn(async ({user}) => JSON.stringify(user.includes('最多3个') ? {seeds:['隔音窗'],queries:[]} : {audience:'业主',platform:'小红书',rationale:'根据导入需求推断'}));
    const research = await buildResearch(customer,{config:{},chatFn});
    expect(chatFn.mock.calls[0][0].user).toContain('隔音窗报价');
    expect(chatFn.mock.calls[1][0].user).toContain('用户导入');
    expect(research.importedKeywords).toHaveLength(2);
    expect(research.sources).toEqual([]);
  });
  it('工作区隔离且导入不覆盖已有方向或历史研究', async () => {
    const cwd = vi.spyOn(process,'cwd').mockReturnValue(temp);
    try {
      const email='keywords@example.com'; const other='other-keywords@example.com';
      readWorkspace(email); writeWorkspace(email,{customers:[{id:'c1',growthDirection:'刚更新的方向',packs:[{id:'old',research:{importedKeywords:[]}}]}],feedback:{},ledger:[],usingId:'c1'});
      const batch = await prepareKeywordBatch([file('归档.csv','关键词\n窗报价')],scope,{modelReady:false});
      expect(saveKeywordLibrary(other,'c1',batch).error).toBeTruthy();
      const result = saveKeywordLibrary(email,'c1',batch);
      expect(result.workspace.customers[0].growthDirection).toBe('刚更新的方向');
      expect(result.workspace.customers[0].packs[0].research.importedKeywords).toEqual([]);
      expect(removeKeywordLibrary(other,'c1',batch.id).error).toBeTruthy();
      expect(removeKeywordLibrary(email,'c1',batch.id).workspace.customers[0].keywordLibraries).toEqual([]);
    } finally {cwd.mockRestore();}
  });
});
it('压缩 Office 文件在正文解析前受解压总量限制', async()=>{
 const zip=new JSZip();zip.file('word/document.xml','x'.repeat(31*1024*1024));
 const input=file('超大.docx',await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 await expect(extractKeywordFile(input,{modelReady:false})).rejects.toThrow('解压后超过30MB');
});
it('导出防止空白字符前缀绕过公式转义',()=>{
 const items=rowsToKeywords([['关键词'],['普通词']],'原始.csv');
 const csv=keywordCsv({scope:{type:'品牌',name:' \t=1+1'},items});
 expect(parseDelimited(csv)[1][2]).toBe("' \t=1+1");
});
