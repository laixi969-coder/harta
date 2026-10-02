import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildResearch, publicResearchConfig, queryKeywords, querySearxng, queryWeb, researchFingerprint, saveResearchConfig } from './research.mjs';
const response = (body) => ({ ok: true, json: async () => body });
const customer = { name: '商家', hunt: '门窗', pitch: '隔音窗', growthDirection: '不出镜' };
const chatFn = vi.fn(async ({ user }) => JSON.stringify(user.includes('最多3个') ? { seeds: ['隔音窗'], queries: ['隔音窗 小红书 内容'] } : { audience: '临街住户', platform: '小红书', rationale: '需求假设，待核实', opportunities: [{ need: '隔音', sourceIds: ['S1', 'FAKE'] }] }));
describe('研究数据与证据边界', () => {
  it('完整业务补充与附件分别进入查询规划和研究，长补充不会挤掉附件', async () => {
    const fn = vi.fn(chatFn);
    await buildResearch({ ...customer, salesMaterial: '补'.repeat(11990) + '不接整屋装修', sourceMaterial: '附件确认只在杭州服务' }, { config: {}, chatFn: fn });
    for (const [request] of fn.mock.calls) {
      expect(request.user).toContain('不接整屋装修');
      expect(request.user).toContain('附件确认只在杭州服务');
    }
  });
  it('5118 按文档发送鉴权、分页并保留缺失指标为 null', async () => {
    const fetcher = vi.fn(async () => response({ errcode: '0', data: { word: [{ keyword: '隔音窗多少钱', index: 0, bidword_kwc: 2 }] } }));
    const rows = await queryKeywords('隔音窗', 'private-test-key', fetcher);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://apis.5118.com/keyword/word/v2');
    expect(options.headers.Authorization).toBe('private-test-key');
    expect(new URLSearchParams(options.body).get('page_size')).toBe('30');
    expect(rows[0].metrics.index).toBe(0);
    expect(rows[0].metrics.douyin_index).toBeNull();
    expect(JSON.stringify(rows)).not.toContain('private-test-key');
  });
  it('5118 业务错误不能当成空数据成功', async () => {
    await expect(queryKeywords('窗', 'key', async () => response({ errcode: 100101 }))).rejects.toThrow('100101');
  });
  it('SearXNG 使用 JSON 接口并剔除不可点击来源', async () => {
    const fetcher = vi.fn(async () => response({ results: [{ title: '规则', url: 'https://example.com/a', content: '正文摘要' }, { url: 'javascript:alert(1)' }] }));
    const rows = await querySearxng('规则', 'http://localhost:8080', fetcher);
    expect(String(fetcher.mock.calls[0][0])).toContain('/search?q=');
    expect(String(fetcher.mock.calls[0][0])).toContain('format=json');
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toContain('未读取全文');
  });
  it('Brave 只从实际返回结果取得来源', async () => {
    const rows = await queryWeb('规则', 'key', async () => response({ web: { results: [{ url: 'https://example.com', title: '官方说明', description: '摘要' }] } }));
    expect(rows[0].excerpt).toBe('摘要');
  });
  it('没有配置也能基于知识形成方案，不伪造外部搜索', async () => {
    const fetcher = vi.fn();
    const result = await buildResearch(customer, { config: {}, chatFn, fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.status).toBe('knowledge');
    expect(result.sources).toEqual([]);
    expect(result.warnings.join(" ")).toContain("5118 未配置");
    expect(result.warnings.join(" ")).toContain("外部搜索未配置");
    expect(result.strategy.platform).toBe('小红书');
    expect(result.strategy.opportunities[0].sourceIds).toEqual([]);
  });
  it('取得来源、读取正文并清除模型虚构引用', async () => {
    const result = await buildResearch(customer, { config: { searxngUrl: 'http://localhost:8080' }, chatFn, fetcher: async () => response({ results: [{ title: '资料', url: 'https://example.com', content: '摘要' }] }), readPage: async () => ({ ok: true, text: '真实网页正文' }) });
    expect(result.sources[0].excerpt).toBe('真实网页正文');
    expect(result.strategy.opportunities[0].sourceIds).toEqual(['S1']);
    expect(result.status).toBe('partial');
  });
  it('保留模型返回的结构化研究字段，缺项必须明示', async () => {
    const result = await buildResearch(customer, { config: {}, chatFn: async ({ user }) => JSON.stringify(user.includes('最多3个') ? { seeds: ['窗'] } : { audience: '业主', platform: '小红书', rationale: '需求假设', preferences: { 表达: ['具体问题', '决策方法'] }, platformMechanism: { 证据: '未核实官方机制' } }) });
    expect(result.strategy.preferences).toContain('具体问题');
    expect(result.strategy.platformMechanism).toContain('未核实官方机制');
    expect(result.warnings.join(' ')).toContain('未完成项');
  });
  it('网络异常与模型异常可区分，不泄露错误中的密钥', async () => {
    const result = await buildResearch(customer, { config: { keywordKey: 'secret' }, chatFn: async () => { throw new Error('secret'); }, fetcher: async () => { throw new Error('secret'); } });
    expect(result.status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('方向或资料改变使缓存失效，历史快照不变', async () => {
    const config = {};
    const before = { fingerprint: researchFingerprint(customer, config), checkedAt: new Date().toISOString(), cacheable: true, status: 'knowledge', direction: '不出镜' };
    const reused = await buildResearch({ ...customer, drops: [{ research: before }] }, { config, chatFn });
    expect(reused.reused).toBe(true);
    expect(before.reused).toBeUndefined();
    const fresh = await buildResearch({ ...customer, growthDirection: '可以出镜', drops: [{ research: before }] }, { config, chatFn });
    expect(fresh.fingerprint).not.toBe(before.fingerprint);
    expect(before.direction).toBe('不出镜');
  });
  it('设置保存不回传密钥，文件限制访问，空值保留密钥', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-research-'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      saveResearchConfig({ keywordKey: 'test-secret', searxngUrl: 'http://localhost:8080' });
      saveResearchConfig({ keywordKey: '' });
      expect(JSON.stringify(publicResearchConfig())).not.toContain('test-secret');
      expect(publicResearchConfig().keywordReady).toBe(true);
      expect(fs.statSync(path.join(dir, 'data/research.json')).mode & 0o777).toBe(0o600);
      expect(() => saveResearchConfig({ searxngUrl: 'file:///etc/passwd' })).toThrow();
    } finally { cwd.mockRestore(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('搜索凭证、实际模型和渠道变化失效，管理界面的同步状态不影响缓存', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-research-model-'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      fs.mkdirSync(path.join(dir, 'data'));
      const data = { active: 'test', providers: { test: { kind: 'openai', baseUrl: 'https://example.com', model: 'a', apiKey: 'test-only-key' } } };
      const save = () => fs.writeFileSync(path.join(dir, 'data/llm.json'), JSON.stringify(data));
      save();
      const before = researchFingerprint(customer, {searchKey:'key-a'});
      expect(researchFingerprint(customer,{searchKey:'key-b'})).not.toBe(before);
      data.providers.test.lastSyncAt = '2026-10-01';save();
      expect(researchFingerprint(customer,{searchKey:'key-a'})).toBe(before);
      data.providers.test.model = 'b';save();
      const modelChanged=researchFingerprint(customer,{searchKey:'key-a'});
      expect(modelChanged).not.toBe(before);
      data.providers.test.baseUrl = 'https://other.example.com';save();
      expect(researchFingerprint(customer,{searchKey:'key-a'})).not.toBe(modelChanged);
      expect(before).not.toContain('test-only-key');
    } finally { cwd.mockRestore(); fs.rmSync(dir, {recursive:true,force:true}); }
  });
  it('复用最新研究的独立快照，过期和未来时间均不能命中', async () => {
    const now=Date.now();const fingerprint=researchFingerprint(customer,{});
    const earlier={fingerprint,checkedAt:new Date(now-1000).toISOString(),cacheable:true,status:'partial',sources:[{excerpt:'旧'}]};
    const latest={...earlier,checkedAt:new Date(now-100).toISOString(),sources:[{excerpt:'新'}]};
    const reused=await buildResearch({...customer,drops:[{research:earlier}],packs:[{research:latest}]},{config:{},now,chatFn});
    expect(reused.sources[0].excerpt).toBe('新');reused.sources[0].excerpt='被修改';
    expect(latest.sources[0].excerpt).toBe('新');
    for(const stamp of [now-86400000,now+1]) {
      const result=await buildResearch({...customer,drops:[{research:{...earlier,checkedAt:new Date(stamp).toISOString()}}]},{config:{},now,chatFn});
      expect(result.reused).toBeUndefined();
    }
  });
});
