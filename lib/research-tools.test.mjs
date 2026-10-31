import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { reviewSignal } from './acquisition-workspace.mjs';
import { huntEvidence, customerCalibrationBrief } from './hunt-calibration.mjs';
import { expandKeywordsForCustomer, aggregatePains, teardownForCustomer, teardownAccountForCustomer, rebuildPlaybook, topicPoolFor, decideTopic, decideRadarWork, importRadarSamples, refreshPlaybookAfterFeedback, calibrateHuntFor } from './research-tools.mjs';

const email = 'research-tools@example.com', other = 'someone-else@example.com', original = process.cwd();
it('可采用第 40 条之后的候选，并拒绝错误页码且不修改方向',()=>{
  const space=readWorkspace(email),customer=space.customers.find(c=>c.id==='c1');customer.demandTopics=Array.from({length:85},(_,i)=>({kind:'comment',title:`厨房问题${i}`}));writeWorkspace(email,space);
  const second=topicPoolFor(email,{customerId:'c1',page:1}).pool;expect(second.total).toBe(85);expect(second.topics[0].angle).toBe('厨房问题40');
  expect(()=>decideTopic(email,{customerId:'c1',key:second.topics[0].key,action:'use',page:-1})).toThrow('页码');expect(readWorkspace(email).customers[0].growthDirection||'').not.toContain('厨房问题40');
  const used=decideTopic(email,{customerId:'c1',key:second.topics[0].key,action:'use',page:1});expect(used.direction).toContain('厨房问题40');expect(used.pool.total).toBe(84);expect(used.pool.page).toBe(1);
});
it('按状态分页、暂时不用并恢复，旧页面不能覆盖已变化的状态',()=>{
  const space=readWorkspace(email),c=space.customers.find(x=>x.id==='c1');c.demandTopics=[{kind:'comment',title:'厨房收纳怎么量'}];writeWorkspace(email,space);
  const topic=topicPoolFor(email,{customerId:'c1',page:0,status:'候选'}).pool.topics[0],input={customerId:'c1',key:topic.key,page:0,status:'候选'};
  const skipped=decideTopic(email,{...input,action:'skip',expectedStatus:'候选'});expect(skipped.pool.total).toBe(0);expect(skipped.pool.counts.不用).toBe(1);
  expect(()=>decideTopic(email,{...input,action:'use',expectedStatus:'候选'})).toThrow('状态已变化');
  const skippedPage=topicPoolFor(email,{customerId:'c1',page:0,status:'不用'}).pool;expect(skippedPage.topics[0].key).toBe(topic.key);
  const restored=decideTopic(email,{...input,status:'不用',action:'reset',expectedStatus:'不用'});expect(restored.pool.total).toBe(0);expect(restored.pool.counts.候选).toBe(1);
  expect(()=>decideTopic(email,{...input,status:'invalid',action:'use'})).toThrow('状态');expect(readWorkspace(email).customers[0].growthDirection||'').not.toContain('厨房收纳怎么量');
});
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
it('保留归集历史并标记被排除的评论依据',async()=>{
 const first=await aggregatePains(email,{customerId:'c1'},{modelReady:false});
 await aggregatePains(email,{customerId:'c1'},{modelReady:false});
 let c=readWorkspace(email).customers[0];expect(c.painClusterHistory).toHaveLength(1);expect(c.painClusterHistory[0].id).toBe(first.clusters.id);
 reviewSignal(email,{signalId:'s1',action:'exclude',note:'不符合业务需求'});
 c=readWorkspace(email).customers[0];expect(c.painClusterHistory[0].staleReason).toContain('已被排除');
});
it('粘贴评论样本独立分析并保留历史，不创建线索或覆盖真实评论洞察',async()=>{
 const before=readWorkspace(email),signalCount=before.acquisition.signals.length;
 const real=await aggregatePains(email,{customerId:'c1'},{modelReady:false});
 const result=await aggregatePains(email,{customerId:'c1',sampleOnly:true,samples:'这个价格怎么算？\n报价怎么比较？'},{modelReady:false});
 const space=readWorkspace(email),c=space.customers[0];expect(result.clusters.sourceType).toBe('pasted-unverified');expect(result.clusters.samples).toEqual(['这个价格怎么算？','报价怎么比较？']);expect(result.clusters.clusters.length).toBeGreaterThan(0);expect(c.painClusters.id).toBe(real.clusters.id);expect(c.sampleCommentInsights[0].id).toBe(result.clusters.id);expect(space.acquisition.signals).toHaveLength(signalCount);expect(space.acquisition.leads||[]).toHaveLength(0);
 expect(()=>aggregatePains(email,{customerId:'c1',sampleOnly:true,samples:Array(101).fill('一条评论').join('\n')},{modelReady:false})).toThrow('100');
 await expect(aggregatePains(other,{customerId:'c1',sampleOnly:true,samples:'报价怎么比较？'},{modelReady:false})).rejects.toThrow('找不到');
 const changedChat=async()=>{const latest=readWorkspace(email);latest.customers[0].pitch='修改业务';writeWorkspace(email,latest);return '{"clusters":[]}';};
 await expect(aggregatePains(email,{customerId:'c1',sampleOnly:true,samples:'报价怎么比较？\n价格怎么算？'},{modelReady:true,chatFn:changedChat})).rejects.toThrow('已变化');expect(readWorkspace(email).customers[0].sampleCommentInsights).toHaveLength(1);
 expect(()=>aggregatePains(other,{customerId:'c1',removeSampleInsight:result.clusters.id})).toThrow('找不到');await aggregatePains(email,{customerId:'c1',removeSampleInsight:result.clusters.id});expect(readWorkspace(email).customers[0].sampleCommentInsights).toHaveLength(0);expect(readWorkspace(email).customers[0].painClusters.id).toBe(real.clusters.id);
});
it('粘贴样本先完整校验、去重并标注来源，不凭样本制造线索',()=>{
  const input={customerId:'c1',platform:'抖音',text:'门窗选择\n先比较窗框和玻璃。\n\n预算怎么核对\n核对配件和安装费用。'};
  expect(()=>importRadarSamples(email,{...input,text:input.text+'\n\n只有标题'})).toThrow('标题和正文');
  expect(readWorkspace(email).acquisition.works).toHaveLength(1);
  expect(()=>importRadarSamples(other,input)).toThrow('找不到');
  const first=importRadarSamples(email,input);expect(first.added).toBe(2);expect(first.duplicates).toBe(0);
  const again=importRadarSamples(email,input);expect(again.added).toBe(0);expect(again.duplicates).toBe(2);
  const space=readWorkspace(email),sample=space.acquisition.works.find(w=>w.source==='manual_paste');
  expect(sample).toMatchObject({platform:'抖音',title:'门窗选择',url:''});expect(sample.metrics).toBeUndefined();expect(space.acquisition.signals).toHaveLength(4);
});
it('演示作品不参与雷达安排，也不会阻止用户导入真实样本',()=>{
 const space=readWorkspace(email);space.acquisition.works.push({id:'demo',customerId:'c1',platform:'抖音',title:'真实标题',description:'真实正文',demo:true});writeWorkspace(email,space);
 expect(()=>decideRadarWork(email,{customerId:'c1',workId:'demo',action:'now'})).toThrow('找不到');
 const result=importRadarSamples(email,{customerId:'c1',platform:'抖音',text:'真实标题\n真实正文'});expect(result.added).toBe(1);
});
it('雷达收藏按业务隔离，本周上限可调整，舍弃可撤回',()=>{
  const space=readWorkspace(email);for(let i=2;i<=7;i++)space.acquisition.works.push({id:`w${i}`,customerId:i===7?'other':'c1',platform:'抖音',title:`作品${i}`,source:'manual_import'});writeWorkspace(email,space);
  for(let i=1;i<=5;i++)decideRadarWork(email,{customerId:'c1',workId:`w${i}`,action:'now'});
  expect(()=>decideRadarWork(email,{customerId:'c1',workId:'w6',action:'now'})).toThrow('最多安排5');
  expect(()=>decideRadarWork(email,{customerId:'c1',workId:'w7',action:'parked'})).toThrow('找不到');
  expect(()=>decideRadarWork(other,{customerId:'c1',workId:'w1',action:'parked'})).toThrow();
  decideRadarWork(email,{customerId:'c1',workId:'w1',action:'discard'});decideRadarWork(email,{customerId:'c1',workId:'w6',action:'now'});decideRadarWork(email,{customerId:'c1',workId:'w1',action:'reset'});
  const decisions=readWorkspace(email).customers[0].radarDecisions;expect(decisions.w1).toBeUndefined();expect(decisions.w6.action).toBe('now');
});

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

  it('扩展期间资料变化时拒绝保存旧语料命中', async () => {
    let changed=false;
    const fetcher=async()=>{if(!changed){changed=true;const space=readWorkspace(email);space.customers[0].pitch='更新后的业务资料';writeWorkspace(email,space);}return {ok:true,json:async()=>({g:[{type:'sug',q:'隔音窗价格'}]})};};
    await expect(expandKeywordsForCustomer(email,{customerId:'c1',seeds:['隔音窗']},{fetcher})).rejects.toThrow('扩展期间业务资料或评论已变化');
    expect(readWorkspace(email).customers[0].keywordLibraries||[]).toHaveLength(0);
  });

  it('排除已参与比对的评论时保留建议词并提示历史命中失效', async () => {
    await expandKeywordsForCustomer(email,{customerId:'c1',seeds:['隔音窗']},{fetcher:suggest({隔音窗:['隔音窗价格']})});
    reviewSignal(email,{signalId:'s1',action:'exclude',note:'不适合当前业务'});
    const batch=readWorkspace(email).customers[0].keywordLibraries[0];
    expect(batch.items[0].keyword).toBe('隔音窗价格');expect(batch.corpusStaleReason).toContain('历史命中次数');
  });

  it('归集只吃当前业务的作品评论，结果落到客户档案', async () => {
    const chatFn = async () => JSON.stringify({ clusters: [{ topic: '怕报价不透明', anxiety: '担心加价', blocker: '不敢问', angle: '列清费用项', ids: ['s1', 's2'] }] });
    const { clusters } = await aggregatePains(email, { customerId: 'c1' }, { chatFn, modelReady: true });
    expect(clusters.clusters[0]).toMatchObject({ topic: '怕报价不透明', count: 2 });
    expect(clusters.clusters.every((c) => !c.signalIds.includes('s4'))).toBe(true);
    expect(readWorkspace(email).customers[0].painClusters.clusters[0].topic).toBe('怕报价不透明');
  });

  it('归集不使用演示来源和未回源摘要，排除已用评论后暂停旧结果',async()=>{
    const space=readWorkspace(email);space.acquisition.works.push({id:'demo-w',customerId:'c1',platform:'小红书',demo:true,title:'样例'});space.acquisition.signals.push({id:'fake',customerId:'c1',workId:'demo-w',text:'虚构价格咨询'},{id:'snippet',customerId:'c1',text:'未回源价格摘要',sourceType:'search_summary'});writeWorkspace(email,space);
    const result=await aggregatePains(email,{customerId:'c1'},{modelReady:false});expect(result.clusters.total).toBe(4);expect(result.clusters.sourceSignalIds).not.toContain('fake');expect(result.clusters.sourceSignalIds).not.toContain('snippet');
    reviewSignal(email,{signalId:'s1',action:'exclude',note:'不符合业务需求'});const saved=readWorkspace(email).customers[0];expect(saved.painClusters.staleReason).toContain('重新归集');expect(saved.painClusters.clusters.length).toBeGreaterThan(0);expect(topicPoolFor(email,{customerId:'c1'}).pool.sources.痛点).toBe(0);
  });
  it('模型归集期间评论变化时不覆盖已保存数据',async()=>{
    const space=readWorkspace(email);space.customers[0].painClusters={id:'previous',clusters:[]};writeWorkspace(email,space);
    const chatFn=async()=>{const changed=readWorkspace(email);changed.acquisition.signals[0].status='excluded';writeWorkspace(email,changed);return JSON.stringify({clusters:[{topic:'价格',ids:['s1']}]});};
    await expect(aggregatePains(email,{customerId:'c1'},{chatFn,modelReady:true})).rejects.toThrow('归集期间评论或业务资料已变化');expect(readWorkspace(email).customers[0].painClusters.id).toBe('previous');
  });
  it('演示作品不能作为对标拆解依据',async()=>{
    const space=readWorkspace(email);space.acquisition.works[0].demo=true;writeWorkspace(email,space);
    await expect(teardownForCustomer(email,{customerId:'c1',workId:'w1'},{modelReady:false})).rejects.toThrow('找不到');
  });

  it('对标拆解期间作品或评论变化时，不覆盖先前结果',async()=>{
    const space=readWorkspace(email);space.customers[0].benchmarkTeardowns=[{id:'previous',workId:'w1',topics:[]}];writeWorkspace(email,space);
    const chatFn=async()=>{const changed=readWorkspace(email);changed.acquisition.works[0].description='已修改正文';writeWorkspace(email,changed);return JSON.stringify({topics:[{angle:'新题'}]});};
    await expect(teardownForCustomer(email,{customerId:'c1',workId:'w1'},{chatFn,modelReady:true})).rejects.toThrow('拆解期间作品、评论或业务资料已变化');expect(readWorkspace(email).customers[0].benchmarkTeardowns[0].id).toBe('previous');
  });
  it('账号拆解期间样本变化时，不覆盖先前结果',async()=>{
    const space=readWorkspace(email);space.acquisition.works[0].authorId='author';space.customers[0].accountTeardowns=[{id:'previous',authorId:'author',platform:'小红书'}];writeWorkspace(email,space);
    const chatFn=async()=>{const changed=readWorkspace(email);changed.acquisition.signals[0].status='excluded';writeWorkspace(email,changed);return JSON.stringify({playbook:'建议'});};
    await expect(teardownAccountForCustomer(email,{customerId:'c1',authorId:'author',platform:'小红书'},{chatFn,modelReady:true})).rejects.toThrow('账号拆解期间作品、评论或业务资料已变化');expect(readWorkspace(email).customers[0].accountTeardowns[0].id).toBe('previous');
  });
  it('排除拆解引用的评论后保留历史，暂停对应选题和校准证据',async()=>{
    const space=readWorkspace(email);space.acquisition.works[0].authorId='author';writeWorkspace(email,space);
    const chatFn=async()=>JSON.stringify({topics:[{angle:'报价项目如何核对',why:'比较清单'}],commentFeedback:[{point:'报价',ids:['R1']} ]});
    await teardownForCustomer(email,{customerId:'c1',workId:'w1'},{chatFn,modelReady:true});await teardownAccountForCustomer(email,{customerId:'c1',authorId:'author',platform:'小红书'},{modelReady:false});
    expect(topicPoolFor(email,{customerId:'c1'}).pool.sources.对标).toBe(1);reviewSignal(email,{signalId:'s1',action:'exclude',note:'需求不适用'});
    const c=readWorkspace(email).customers[0];expect(c.benchmarkTeardowns[0].staleReason).toContain('重新拆解');expect(c.accountTeardowns[0].staleReason).toContain('重新拆解');expect(c.benchmarkTeardowns[0].topics[0].angle).toBe('报价项目如何核对');expect(topicPoolFor(email,{customerId:'c1'}).pool.sources.对标).toBe(0);expect(huntEvidence({customer:c})).toMatchObject({teardowns:0,accounts:0});
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

  it('校准只属于当前业务，评论排除后停止提供创作依据', async () => {
    const chatFn=async()=>JSON.stringify({clusters:[{topic:'私有报价问题',anxiety:'x',blocker:'y',angle:'核对费用',ids:['s1','s2']}]});
    await aggregatePains(email,{customerId:'c1'},{chatFn,modelReady:true});
    let space=readWorkspace(email);space.customers.push({id:'c2',name:'另一个业务',hunt:'门窗',packs:[]});writeWorkspace(email,space);
    calibrateHuntFor(email,{customerId:'c1'});space=readWorkspace(email);
    expect(customerCalibrationBrief(space.customers.find(c=>c.id==='c1'))).toContain('私有报价问题');
    expect(customerCalibrationBrief(space.customers.find(c=>c.id==='c2'))).toBe('');
    reviewSignal(email,{signalId:'s1',action:'exclude',note:'当前业务不适用'});space=readWorkspace(email);
    expect(space.customers.find(c=>c.id==='c1').huntCalibration.staleReason).toContain('重新校准');
    expect(customerCalibrationBrief(space.customers.find(c=>c.id==='c1'))).toBe('');
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
