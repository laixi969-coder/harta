import { describe,it,expect } from 'vitest';
import { previewSignalCsv } from './signal-csv.js';
describe('真实需求 CSV 预览',()=>{
 it('保留带逗号和换行的原文、身份与时间，空平台使用默认值',()=>{
  const text='\ufeff平台,需求原文,原始链接,昵称,用户ID,评论ID,发表时间,作者回复\r\n,"想买厨房灯，\n多少钱？",https://www.xiaohongshu.com/explore/abc123,访客,00123,r1,2026-01-01T12:00:00+08:00,否';
  const [r]=previewSignalCsv(text,'小红书');expect(r.errors).toEqual([]);expect(r.row).toMatchObject({platform:'小红书',text:'想买厨房灯，\n多少钱？',authorId:'00123',recordId:'r1',isAuthorReply:false});
 });
 it('标识无效链接、时间和作者回复，不将异常行视为可导入',()=>{
  const rows=previewSignalCsv('平台,需求原文,原始链接,发表时间,作者回复\n抖音,请问价格,javascript:alert(1),2026-02-30T10:00:00Z,不确定\n无效平台,原文,https://example.com,,是','小红书');
  expect(rows[0].errors.join('；')).toContain('链接无效');expect(rows[0].errors.join('；')).toContain('发表时间');expect(rows[0].errors.join('；')).toContain('作者回复');expect(rows[1].errors.join('；')).toContain('平台');expect(rows[1].row.isAuthorReply).toBe(true);
 });
 it('拒绝重复表头和损坏的 CSV',()=>{
  expect(()=>previewSignalCsv('需求原文,text,原始链接\na,b,https://example.com','抖音')).toThrow('重复');
  expect(()=>previewSignalCsv('需求原文,原始链接\n"未闭合,https://example.com','抖音')).toThrow('引号');
 });
});
