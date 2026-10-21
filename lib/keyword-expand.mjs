/* 关键词扩展：从一个自己想的词，长出一批真实搜索过的说法。
 *
 * 只做三件事，都不编数：
 * 1. 公开下拉词（百度 sugrec）——用户在搜索框里真的敲出过的延续词，免费、无需密钥。
 * 2. 二级扩展——把第一层里像人话的长尾再喂回去一次，拿到更细的说法。
 * 3. 自有语料交叉——这些词在本业务已有的真实评论、对标正文里出现过几次。
 *
 * 失败的种子如实记进 warnings，不拿模型幻想补位。搜索量一律留空：
 * 下拉词证明「有人说」，不证明「有多少人在搜」。 */

import crypto from 'node:crypto';
import { classifyKeyword, keywordScope } from './keyword-library.mjs';

const clean = (v, n = 160) => String(v ?? '').normalize('NFKC').trim().slice(0, n);
const MAX_SEEDS = 5;
const MAX_SECOND_LEVEL = 4;

export async function queryBaiduSuggest(seed, fetcher = fetch) {
  const term = clean(seed, 60);
  if (!term) return [];
  const url = new URL('https://www.baidu.com/sugrec');
  url.search = new URLSearchParams({ prod: 'pc', wd: term }).toString();
  const res = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.g)) throw new Error('返回格式不正确');
  return body.g.filter((row) => row?.type === 'sug' && typeof row.q === 'string').map((row) => clean(row.q)).filter((word) => word && word !== term);
}

/**
 * 两层扩展。第二层优先挑「像长尾」的词：比种子长、带疑问或修饰。
 * 全部请求串行，避免对公开接口并发施压。
 */
export async function expandKeywords(seeds, { fetcher = fetch, perSeed = 10, limit = 120 } = {}) {
  const rows = new Map();
  const requests = [];
  const add = (keyword, seed, level) => {
    if (!keyword || rows.size >= limit) return false;
    const current = rows.get(keyword);
    if (current) {
      if (!current.seeds.includes(seed)) current.seeds.push(seed);
      return false;
    }
    rows.set(keyword, { keyword, level, seeds: [seed] });
    return true;
  };
  const wanted = [...new Set(seeds.map((s) => clean(s, 60)).filter(Boolean))].slice(0, MAX_SEEDS);
  const first = [];
  for (const seed of wanted) {
    try {
      const list = (await queryBaiduSuggest(seed, fetcher)).slice(0, perSeed);
      requests.push({ seed, level: 1, ok: true, count: list.length });
      for (const keyword of list) { add(keyword, seed, 1); first.push({ keyword, seed }); }
    } catch (error) {
      requests.push({ seed, level: 1, ok: false, count: 0, error: clean(error?.message, 120) || '请求失败' });
    }
  }
  // 第二层只挑长尾特征明显的，避免把品牌名、近义词反复喂回去。
  const longTail = first
    .filter(({ keyword, seed }) => keyword.length > seed.length && /怎么|如何|多少|哪个|哪里|推荐|区别|吗|呢|效果|价格|安装|维修|避坑|测评/.test(keyword))
    .slice(0, MAX_SECOND_LEVEL);
  for (const { keyword: seed } of longTail) {
    try {
      const list = (await queryBaiduSuggest(seed, fetcher)).slice(0, perSeed);
      requests.push({ seed, level: 2, ok: true, count: list.length });
      for (const keyword of list) add(keyword, seed, 2);
    } catch (error) {
      requests.push({ seed, level: 2, ok: false, count: 0, error: clean(error?.message, 120) || '请求失败' });
    }
  }
  return { rows: [...rows.values()], requests };
}

/** 每个词在本业务真实语料里出现过几次。用于分辨「有人说过」和「只有下拉词有」。 */
export function corpusHits(keywords, texts) {
  const corpus = (Array.isArray(texts) ? texts : [texts]).filter(Boolean).join('\n');
  const hits = new Map();
  for (const keyword of keywords) {
    if (!corpus || !keyword) { hits.set(keyword, 0); continue; }
    let count = 0;
    let from = 0;
    while (count < 99) {
      const at = corpus.indexOf(keyword, from);
      if (at < 0) break;
      count += 1;
      from = at + keyword.length;
    }
    hits.set(keyword, count);
  }
  return hits;
}

/** 把业务已有的真实文本拼成语料：评论原话 + 对标正文标题 + 业务资料。 */
export function businessCorpus(customer, signals = [], works = []) {
  const business = [customer?.pitch, customer?.salesMaterial, customer?.growthDirection, ...(customer?.factCards || []).map((c) => c.text)];
  const comments = (signals || []).filter((s) => !s.isAuthorReply).map((s) => s.text);
  const benchmark = (works || []).flatMap((w) => [w.title, w.description, ...(w.tags || [])]);
  return [...business, ...comments, ...benchmark].filter((t) => typeof t === 'string' && t.trim());
}

export function groupExpanded(rows, scope) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.intent}/${row.stage}`;
    if (!groups.has(key)) groups.set(key, { topic: `${row.intent} · ${row.stage}`, scenario: scope.name, angle: '', ids: [] });
    groups.get(key).ids.push(row.id);
  }
  return [...groups.values()].map((group) => ({ ...group, angle: `按「${group.topic}」出一批内容，优先用原话开头`, scenario: `${scope.name}，共 ${group.ids.length} 个词` }));
}

/**
 * 生成一批可直接并入关键词库的扩展结果。
 * 结构沿用已导入词库，研究、导出、意向分类都能直接复用。
 */
export async function expandKeywordBatch(input, deps = {}) {
  const { customer, seeds, fetcher = fetch, chatFn = null, modelReady = false, signals = [], works = [], now = Date.now() } = { ...deps, ...input };
  const scope = keywordScope(input.scopeType || '领域', input.scopeName || customer?.hunt || '');
  const seedList = [...new Set((seeds || []).map((s) => clean(s, 60)).filter(Boolean))];
  if (!seedList.length) throw new Error('先填一个种子词，比如你的产品名或客户会搜的说法');
  if (seedList.length > MAX_SEEDS) throw new Error(`一次最多 ${MAX_SEEDS} 个种子词`);
  const { rows, requests } = await expandKeywords(seedList, { fetcher, limit: input.limit || 120 });
  const warnings = [];
  const failed = requests.filter((r) => !r.ok);
  if (requests.length && failed.length === requests.length) throw new Error('下拉词接口全部请求失败，请检查网络后重试');
  if (!rows.length) throw new Error('没有取到下拉词；这些种子可能没有搜索建议，换一个更常用的说法再试');
  const hits = corpusHits(rows.map((r) => r.keyword), businessCorpus(customer, signals, works));
  if (failed.length) warnings.push(`${failed.length} 次下拉词请求失败（${failed.map((r) => r.seed).slice(0, 3).join('、')}${failed.length > 3 ? ' 等' : ''}），这些种子的扩展不完整。`);
  const items = rows.map((row, index) => {
    const classified = classifyKeyword(row.keyword);
    const hit = hits.get(row.keyword) || 0;
    return {
      id: `K${index + 1}`,
      keyword: row.keyword,
      category: scope.type === '产品品类' ? scope.name : '',
      brand: scope.type === '品牌' ? scope.name : '',
      platform: '',
      ...classified,
      classification: '规则推断 · 下拉词',
      corpusHit: hit,
      level: row.level,
      seeds: row.seeds,
      evidence: [{
        file: '百度下拉词',
        sheet: `第${row.level}层 · 种子「${row.seeds[0]}」`,
        row: index + 1,
        fields: [
          { name: '来源', value: '搜索引擎下拉建议（真实输入过的说法）' },
          { name: '搜索量', value: '未提供，本批不含指数数据' },
          { name: '自有语料命中', value: hit ? `${hit} 次` : '未出现' },
        ],
      }],
    };
  });
  const summary = {};
  for (const item of items) summary[item.intent] = (summary[item.intent] || 0) + 1;
  const withHits = items.filter((i) => i.corpusHit > 0).length;
  if (withHits) warnings.push(`${withHits}/${items.length} 个扩展词在本业务真实评论或对标正文里出现过，已标命中次数；其余只证明有人这样搜。`);
  if (!withHits) warnings.push('本业务暂无真实评论文本可比对，扩展词只有下拉词来源，尚不能证明与客户语言一致。');
  return {
    id: crypto.randomUUID(),
    scope,
    createdAt: new Date(now).toISOString(),
    sources: ['百度下拉词'],
    inputCount: seedList.length,
    duplicateCount: 0,
    items,
    warnings,
    summary,
    analysis: { groups: groupExpanded(items, scope), analyzedCount: items.length, warning: modelReady && chatFn ? '' : '未配置模型，按规则分意图；扩展与来源不受影响。' },
    expansion: { seeds: seedList, requests, levels: [...new Set(items.map((i) => i.level))].sort() },
  };
}
