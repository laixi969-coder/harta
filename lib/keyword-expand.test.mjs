import { describe, it, expect } from 'vitest';
import { expandKeywords, expandKeywordBatch, corpusHits, queryBaiduSuggest, businessCorpus } from './keyword-expand.mjs';

const reply = (words) => ({ ok: true, json: async () => ({ q: 'seed', p: false, g: words.map((q) => ({ type: 'sug', q })) }) });
const fetcherFor = (map) => async (url) => {
  const seed = new URL(url).searchParams.get('wd');
  if (!(seed in map)) return { ok: false, status: 500, json: async () => ({}) };
  return reply(map[seed]);
};

describe('关键词扩展', () => {
  it('关键词匹配语料排除演示作品、被排除评论和未核实摘要',()=>{
    const works=[{id:'w1',customerId:'c',title:'真实标题'},{id:'demo',customerId:'c',title:'演示标题',demo:true}];
    const signals=[{customerId:'c',workId:'w1',text:'真实评论'},{customerId:'c',workId:'demo',text:'演示来源评论'},{customerId:'c',text:'未核实摘要',sourceType:'search_summary'},{customerId:'c',text:'排除评论',status:'excluded'}];
    expect(businessCorpus({},signals,works)).toEqual(['真实评论','真实标题']);
  });

  it('解析下拉词，丢掉同名和非法项', async () => {
    const words = await queryBaiduSuggest('隔音窗', fetcherFor({ 隔音窗: ['隔音窗', '隔音窗多少钱', 123] }));
    expect(words).toEqual(['隔音窗多少钱']);
  });

  it('两层扩展：去重、记录来源、失败不抛错', async () => {
    const fetcher = fetcherFor({
      隔音窗: ['隔音窗多少钱', '隔音窗哪种好'],
      隔音窗多少钱: ['隔音窗多少钱一平', '隔音窗多少钱'],
    });
    const { rows, requests } = await expandKeywords(['隔音窗', '坏种子'], { fetcher, perSeed: 5 });
    expect(rows.map((r) => r.keyword)).toEqual(['隔音窗多少钱', '隔音窗哪种好', '隔音窗多少钱一平']);
    expect(rows.find((r) => r.keyword === '隔音窗多少钱一平').level).toBe(2);
    expect(requests.filter((r) => !r.ok)).toHaveLength(1);
    expect(requests.find((r) => !r.ok).seed).toBe('坏种子');
  });

  it('语料命中按真实出现次数计', () => {
    const hits = corpusHits(['隔音窗多少钱', '没出现过的词'], ['隔音窗多少钱啊，隔音窗多少钱']);
    expect(hits.get('隔音窗多少钱')).toBe(2);
    expect(hits.get('没出现过的词')).toBe(0);
  });

  it('产出与已有词库兼容的一批，来源与命中都写清', async () => {
    const batch = await expandKeywordBatch({
      customer: { name: '测试', hunt: '门窗', pitch: '隔音窗' },
      seeds: ['隔音窗'],
      fetcher: fetcherFor({ 隔音窗: ['隔音窗多少钱'] }),
      signals: [{ id: 's1', text: '隔音窗多少钱，想了解一下' }],
    });
    expect(batch.scope).toEqual({ type: '领域', name: '门窗' });
    expect(batch.items[0]).toMatchObject({ id: 'K1', keyword: '隔音窗多少钱', corpusHit: 1, intent: '价格咨询' });
    expect(batch.items[0].evidence[0].file).toBe('百度下拉词');
    expect(batch.summary.价格咨询).toBe(1);
    expect(batch.analysis.groups[0].ids).toEqual(['K1']);
    expect(batch.warnings.join()).toContain('真实评论');
    expect(batch.warnings.join()).toContain('不代表客户人数或搜索量');
    expect(batch.items[0].evidence[0].fields[0].value).toContain('不代表真实搜索次数');
  });

  it('全部请求失败时明确报错，不返回空批', async () => {
    await expect(expandKeywordBatch({ customer: { hunt: '门窗' }, seeds: ['x'], fetcher: fetcherFor({}) })).rejects.toThrow('全部请求失败');
  });
});
