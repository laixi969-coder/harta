import { describe, expect, it } from 'vitest';
import { businessMaterialContext } from './content-context.mjs';
import { recentContentHistory, repeatedContent } from './content-history.mjs';

describe('内容上下文', () => {
  it('超预算附件保留每份头尾并显式标明取样，完整业务补充不被挤掉', () => {
    const sourceMaterial = ['甲', '乙', '丙'].map(name => `【${name}资料】\n${'中'.repeat(20000)}${name}结尾`).join('\n\n');
    const result = businessMaterialContext({ salesMaterial: '补'.repeat(11995) + '末尾限制', sourceMaterial });
    for (const name of ['甲', '乙', '丙']) {
      expect(result.text.includes(`【${name}资料】`)).toBe(true);
      expect(result.text.includes(`${name}结尾`)).toBe(true);
    }
    expect(result.text.includes('末尾限制')).toBe(true);
    expect(result.text.includes('中间内容未纳入')).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.text.length).toBeLessThan(43000);
  });
  it('跨报告和内容批次取最近三份，采用已编辑版本而不改写历史', () => {
    const customer = { drops: [
      { id: 'old', date: '2026-09-01', copies: { A: ['过时内容'] } },
      { id: 'new', date: '2026-10-02', origin: { mode: 'organic' }, copies: { A: ['原始草稿'] }, shells: { 小红书: [{ body: '原始草稿' }] }, edits: { '小红书|0|body': { now: '编辑后正文' } } },
    ], packs: [
      { id: 'p1', date: '2026-10-01', copies: { A: ['报告样例'] } },
      { id: 'p2', date: '2026-09-30', copies: { A: ['另一份样例'] } },
    ] };
    const before = structuredClone(customer);
    const history = recentContentHistory(customer);
    expect(history.packs.map(p => p.id)).toEqual(['new', 'p1', 'p2']);
    expect(history.texts).toEqual(['编辑后正文', '报告样例', '另一份样例']);
    expect(customer).toEqual(before);
  });
  it('改标点、空格和全半角不能绕过去重，不把不同问题当同一篇', () => {
    expect(repeatedContent([{ body: '检查 A３ 项！' }, { body: '另一个具体问题' }], ['检查A3项。'])).toHaveLength(1);
    expect(repeatedContent([{ body: '问题一' }, { body: '问题一！' }], [])).toHaveLength(1);
  });
});
