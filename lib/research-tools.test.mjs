import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { expandKeywordsForCustomer, aggregatePains, teardownForCustomer, teardownAccountForCustomer, rebuildPlaybook, topicPoolFor, decideTopic, refreshPlaybookAfterFeedback, calibrateHuntFor } from './research-tools.mjs';

const email = 'research-tools@example.com', other = 'someone-else@example.com', original = process.cwd();
let dir;
const shell = { title: '同样90平少花9万', body: '先说结论：报价差在三处。后面展开。' };
const pack = { id: 'p1', date: '2026-10-02', origin: { mode: 'organic', createdAt: '2026-10-01' }, shells: { 小红书: [shell] }, copies: {}, execution: [{ brief: { question: '客户怕报价不透明', evidence: '真实报价区间', nextStep: '评论区问面积' } }], edits: {} };
const seed = () => ({
  customers: [{ id: 'c1', name: '测试门窗', hunt: '门窗', pitch: '隔音窗', city: '杭州', packs: [pack] }],
  ledger: [], contentStates: {}, feedback: { 'p1-平台-小红书-0': 'replied' },
  acquisition: {
    signals: [
      { id: 's1', customerId: 'c1', workId: 'w1', text: '隔音窗多少钱一平啊', platform: '小红书' },
      { id: 's2', customerId: 'c1', workId: 'w1', text: '报价差这么多，怕被坑', platform: '小红书' },
      { id: 's3', customerId: 'c1', workId: 'w1', text: '装的时候要几天', platform: '小红书' },
      { id: 's4', customerId: 'c1', text: '别人家的评论，属于另一条作品', platform: '小红书' },
    ],
    works: [{ id: 'w1', customerId: 'c1', platform: '小红书', title: '同样90平少花9万', description: '第1步别急着定窗。第2步看型材。报价从480到1200。', tags: ['装修'], metrics: { likes: 1200, comments: 88, saves: 600 }, url: 'https://www.xiaohongshu.com/explore/w1' }],
  },
});
const suggest = (map) => async (url) => {
  const seedWord = new URL(url).searchParams.get('wd');
  if (!(seedWord in map)) return { ok: false, status: 503, json: async () => ({}) };
  return { ok: true, json: async () => ({ g: map[seedWord].map((q) => ({ type: 'sug', q })) }) };
};

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-research-tools-')); fs.symlinkSync(path.join(original, 'vendor'), path.join(dir, 'vendor')); process.chdir(dir); });
afterAll(() => { process.chdir(original); fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => writeWorkspace(email, seed()));

describe('研究类动作', () => {
  it('扩展结果直接进词库，并带上自有语料命中', async () => {
    const { batch, workspace } = await expandKeywordsForCustomer(email, { customerId: 'c1', seeds: ['隔音窗'] }, { fetcher: suggest({ 隔音窗: ['隔音窗多少钱', '隔音窗价格'] }) });
    expect(batch.items).toHaveLength(2);
    expect(workspace.customers[0].keywordLibraries).toHaveLength(1);
    const saved = readWorkspace(email).customers[0].keywordLibraries[0];
    expect(saved.scope).toEqual({ type: '领域', name: '门窗' });
    expect(saved.items.map((r) => r.keyword)).toContain('隔音窗多少钱');
    expect(saved.warnings.join()).toContain('真实评论');
  });

  it('归集只吃当前业务的作品评论，结果落到客户档案', async () => {
    const chatFn = async () => JSON.stringify({ clusters: [{ topic: '怕报价不透明', anxiety: '担心加价', blocker: '不敢问', angle: '列清费用项', ids: ['s1', 's2'] }] });
    const { clusters } = await aggregatePains(email, { customerId: 'c1' }, { chatFn, modelReady: true });
    expect(clusters.clusters[0]).toMatchObject({ topic: '怕报价不透明', count: 2 });
    expect(clusters.clusters.every((c) => !c.signalIds.includes('s4'))).toBe(true);
    expect(readWorkspace(email).customers[0].painClusters.clusters[0].topic).toBe('怕报价不透明');
  });

  it('拆解写回作品维度，同一作品重拆只留最新一份', async () => {
    const first = await teardownForCustomer(email, { customerId: 'c1', workId: 'w1' }, { modelReady: false });
    expect(first.teardown.method).toBe('规则拆解');
    const second = await teardownForCustomer(email, { customerId: 'c1', workId: 'w1' }, { modelReady: false });
    expect(second.teardown.workId).toBe('w1');
    const rows = readWorkspace(email).customers[0].benchmarkTeardowns;
    expect(rows).toHaveLength(1);
    expect(rows[0].workId).toBe('w1');
  });

  it('写作底稿来自有回音的内容', () => {
    const { playbook } = rebuildPlaybook(email, { customerId: 'c1' });
    expect(playbook.coverage.replied).toBe(1);
    expect(playbook.cards[0].angle).toBe('客户怕报价不透明');
    expect(readWorkspace(email).customers[0].playbook.cards[0].opener).toContain('先说结论');
  });

  it('别的账号动不了这个业务', async () => {
    await expect(expandKeywordsForCustomer(other, { customerId: 'c1', seeds: ['x'] }, { fetcher: suggest({}) })).rejects.toThrow('找不到');
    await expect(aggregatePains(other, { customerId: 'c1' }, { modelReady: false })).rejects.toThrow('找不到');
    await expect(teardownForCustomer(other, { customerId: 'c1', workId: 'w1' }, { modelReady: false })).rejects.toThrow('找不到');
    expect(() => rebuildPlaybook(other, { customerId: 'c1' })).toThrow('找不到');
  });

  it('没有作品时拆解明确报错，不编结果', async () => {
    await expect(teardownForCustomer(email, { customerId: 'c1', workId: 'w2' }, { modelReady: false })).rejects.toThrow('找不到这条作品');
  });

  it('选题池汇总已归集的痛点，用了就写进保存的方向', async () => {
    const chatFn = async () => JSON.stringify({ clusters: [{ topic: '怕报价不透明', anxiety: '担心加价', blocker: '不敢问', angle: '把费用项拆开讲', ids: ['s1', 's2'] }] });
    await aggregatePains(email, { customerId: 'c1' }, { chatFn, modelReady: true });
    const { pool } = topicPoolFor(email, { customerId: 'c1' });
    expect(pool.topics.length).toBeGreaterThan(0);
    const key = pool.topics[0].key;
    const used = decideTopic(email, { customerId: 'c1', key, action: 'use' });
    expect(used.direction).toContain('把费用项拆开讲');
    expect(topicPoolFor(email, { customerId: 'c1' }).pool.topics.find((t) => t.key === key).status).toBe('已用');
    expect(() => decideTopic(email, { customerId: 'c1', key: '不存在', action: 'use' })).toThrow('不在池子里');
  });

  it('标记反馈后底稿立刻重算，不用再点刷新', () => {
    const space = readWorkspace(email);
    space.feedback['p1-平台-小红书-0'] = 'dead';
    writeWorkspace(email, space);
    const latest = readWorkspace(email);
    expect(latest.customers[0].playbook).toBeUndefined();
    refreshPlaybookAfterFeedback(email, latest, 'p1-平台-小红书-0');
    const after = readWorkspace(email).customers[0].playbook;
    expect(after).toBeTruthy();
    expect(after.cards).toEqual([]);
    expect(after.warnings.join()).toContain('还没有「有回音」的内容');
  });

  it('同一博主的其他作品进雷达做参照；博主拆解按作者聚合', async () => {
    const space = readWorkspace(email);
    space.acquisition.works = [
      { id: 'w1', customerId: 'c1', platform: '小红书', authorId: 'a1', authorName: '博主A', title: '同样90平少花9万', description: '第1步拆墙。第2步换窗。', metrics: { likes: 100, comments: 10, saves: 50 }, publishedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'w2', customerId: 'c1', platform: '小红书', authorId: 'a1', authorName: '博主A', title: '别急着定窗', description: '先说结论。', metrics: { likes: 40, comments: 4, saves: 20 }, publishedAt: '2026-09-08T00:00:00.000Z' },
      { id: 'w3', customerId: 'c1', platform: '小红书', authorId: 'a1', authorName: '博主A', title: '隔音窗多少钱', description: '报价构成。', metrics: { likes: 20, comments: 2, saves: 10 }, publishedAt: '2026-09-15T00:00:00.000Z' },
    ];
    space.acquisition.signals = [
      { id: 's1', customerId: 'c1', workId: 'w1', text: '多少钱一平', platform: '小红书' },
      { id: 's2', customerId: 'c1', workId: 'w1', text: '报价怎么算', platform: '小红书' },
    ];
    writeWorkspace(email, space);
    const one = await teardownForCustomer(email, { customerId: 'c1', workId: 'w1' }, { modelReady: false });
    expect(one.teardown.radar.sampleSize).toBe(3);
    expect(one.teardown.radar.comparable).toBe(true);
    const account = await teardownAccountForCustomer(email, { customerId: 'c1', authorId: 'a1', authorName: '博主A' }, { modelReady: false });
    expect(account.account.profile.works).toBe(3);
    expect(account.account.profile.hits.map((h) => h.id)).toEqual(['w1']);
    expect(readWorkspace(email).customers[0].accountTeardowns).toHaveLength(1);
  });

  it('拆解别的账号会拒绝，不跨业务读数据', async () => {
    await expect(teardownAccountForCustomer(other, { customerId: 'c1', authorId: 'a1' }, { modelReady: false })).rejects.toThrow('找不到');
  });

  it('行业包校准按真实证据给等级，差多少写多少', async () => {
    const chatFn = async () => JSON.stringify({ clusters: [{ topic: '怕报价', anxiety: 'x', blocker: 'y', angle: '拆费用', ids: ['s1', 's2'] }] });
    await aggregatePains(email, { customerId: 'c1' }, { chatFn, modelReady: true });
    const { calibration, workspace } = calibrateHuntFor(email, { customerId: 'c1' });
    expect(calibration.hunt).toBe('门窗');
    expect(calibration.grade).toBe('D');
    expect(calibration.gaps.find((g) => g.key === 'comments')).toMatchObject({ have: 4, need: 30 });
    expect(workspace.customers[0].huntCalibration.grade).toBe('D');
    expect(readWorkspace(email).customers[0].huntCalibration.gaps.length).toBeGreaterThan(0);
  });

  it('没填行业的业务不能校准', () => {
    const space = readWorkspace(email);
    space.customers[0].hunt = '';
    writeWorkspace(email, space);
    expect(() => calibrateHuntFor(email, { customerId: 'c1' })).toThrow('还没填行业');
  });
});

it('选题超过方向上限时不截断原方向，也不标成已用', () => {
 const space=readWorkspace(email);space.customers[0].growthDirection='原'.repeat(2000);
 space.customers[0].painClusters={clusters:[{topic:'报价',angle:'把价格分项讲清楚'}]};writeWorkspace(email,space);
 const key=topicPoolFor(email,{customerId:'c1'}).pool.topics[0].key;
 expect(()=>decideTopic(email,{customerId:'c1',key,action:'use'})).toThrow('2000字');
 const saved=readWorkspace(email).customers[0];expect(saved.growthDirection).toBe('原'.repeat(2000));expect(saved.topicDecisions).toBeUndefined();
 expect(topicPoolFor(email,{customerId:'c1'}).pool.topics[0].status).toBe('候选');
});

it('博主按平台和稳定用户 ID 隔离，旧调用仅在无歧义时自动补平台', async () => {
 const space=readWorkspace(email);space.acquisition.works=['小红书','抖音'].flatMap((platform,n)=>[0,1,2].map(i=>({id:`w${n}-${i}`,customerId:'c1',platform,authorId:'same',authorName:'同名',title:'测试作品',description:'真实正文',metrics:{likes:i+1}})));
 writeWorkspace(email,space);
 await expect(teardownAccountForCustomer(email,{customerId:'c1',authorId:'same'},{modelReady:false})).rejects.toThrow('明确选择平台');
 for(const platform of ['小红书','抖音']) {
  const result=await teardownAccountForCustomer(email,{customerId:'c1',authorId:'same',platform},{modelReady:false});
  expect(result.account.profile.works).toBe(3);expect(result.account.platform).toBe(platform);
 }
 expect(readWorkspace(email).customers[0].accountTeardowns).toHaveLength(2);
 const one=await teardownForCustomer(email,{customerId:'c1',workId:'w0-0'},{modelReady:false});expect(one.teardown.radar.sampleSize).toBe(3);
 const latest=readWorkspace(email);latest.acquisition.works.push({id:'another',customerId:'c1',platform:'小红书',authorId:'other',authorName:'同名',title:'另一个人'});writeWorkspace(email,latest);
 await expect(teardownAccountForCustomer(email,{customerId:'c1',authorName:'同名',platform:'小红书'},{modelReady:false})).rejects.toThrow('身份无法确认');
 const identified=await teardownAccountForCustomer(email,{customerId:'c1',authorName:'同名',platform:'抖音'},{modelReady:false});expect(identified.account.authorId).toBe('same');
});

it('仅同名而无稳定身份不能合并博主或作为同账号雷达样本', async () => {
 const space=readWorkspace(email);space.acquisition.works=[0,1,2].map(i=>({id:`unknown-${i}`,customerId:'c1',platform:'小红书',authorName:'小王',title:'内容',description:'待核实作者',metrics:{likes:i+1}}));writeWorkspace(email,space);
 await expect(teardownAccountForCustomer(email,{customerId:'c1',authorName:'小王'},{modelReady:false})).rejects.toThrow('身份无法确认');
 const one=await teardownForCustomer(email,{customerId:'c1',workId:'unknown-0'},{modelReady:false});expect(one.teardown.radar.sampleSize).toBe(1);expect(one.teardown.radar.comparable).toBe(false);
});
