import { describe, expect, it, vi } from 'vitest';
import { queryRsshub, readPublicSource } from './native-sources.mjs';
import { buildResearch } from './research.mjs';
const response = body => ({ ok: true, json: async () => body });
describe('原生来源与研究联通', () => {
  it('只采用真实 RSS 项，保留查询和日期，不制造指数', async () => {
    const fetcher = vi.fn(async () => response({ items: [{ title: '业务动态', url: 'https://example.com/a', text: '原文', date: '2026-09-21' }, { url: 'javascript:alert(1)' }] }));
    const rows = await queryRsshub('隔音窗', 'http://localhost:1200', fetcher);
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('q')).toBe('隔音窗');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ excerpt: '原文', publishedAt: '2026-09-21', query: '隔音窗' });
    expect(rows[0].kind).toContain('非流量指数');
  });
  it('上游错误不能被视为成功', async () => {
    await expect(queryRsshub('窗', 'http://localhost:1200', async () => ({ ok: false, status: 502 }))).rejects.toThrow('502');
    await expect(queryRsshub('窗', 'http://localhost:1200', async () => response({}))).rejects.toThrow('格式');
  });
  it('私网和非网页地址不会启动浏览器', async () => {
    for (const url of ['http://127.0.0.1', 'http://192.168.1.1', 'file:///etc/passwd']) expect((await readPublicSource(url)).ok).toBe(false);
  });
  it('RSS 正文进入策略提示词并保留 Crawl4AI 证据标记', async () => {
    const chatFn = vi.fn(async ({ user }) => JSON.stringify(user.includes('最多3个') ? { seeds: ['窗'], queries: [] } : { audience: '业主', platform: '小红书', rationale: '需求假设', opportunities: [{ sourceIds: ['S1', '虚构'] }] }));
    const result = await buildResearch({ hunt: '家装' }, { config: { rsshubUrl: 'http://localhost:1200' }, chatFn, fetcher: async () => response({ items: [{ title: '窗行业', url: 'https://example.com/window', text: '真实摘要' }] }), readPage: async () => ({ ok: true, text: '真实完整正文', method: 'Crawl4AI 原生浏览器读取' }) });
    expect(chatFn.mock.calls.at(-1)[0].user).toContain('真实完整正文');
    expect(result.sources[0].kind).toContain('Crawl4AI');
    expect(result.strategy.opportunities[0].sourceIds).toEqual(['S1']);
  });
  it('RSS 没有匹配时保留空结果，不把其他新闻塞进研究', async () => {
    const result = await buildResearch({ hunt: '家装' }, { config: { rsshubUrl: 'http://localhost:1200' }, chatFn: async () => '{"seeds":["窗"]}', fetcher: async () => response({ items: [] }) });
    expect(result.sources).toEqual([]);
    expect(result.warnings.join(' ')).toContain('未找到「窗」');
  });
});
