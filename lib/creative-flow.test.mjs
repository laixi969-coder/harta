import { beforeEach, describe, expect, it, vi } from 'vitest';
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('./llm.mjs', () => ({ chat: chatMock, llmReady: () => true }));
vi.mock('./research.mjs', () => ({
  buildResearch: async () => ({ status: 'knowledge', checkedAt: '2026-10-08', sources: [], strategy: { platform: '小红书' } }),
  researchBrief: () => '没有外部研究，不编造来源',
}));
import { generateTodayDrop } from './generate.mjs';
import { hasHardBlock } from './check.mjs';

const customer = { id: 'creative-test', name: '测试业务', hunt: '家装', city: '杭州', pitch: '厨房局部翻新', salesMaterial: '只做厨房局部翻新，不提供免费上门服务。', growthGoal: 'spread' };
const proposals = () => ({ platform: '小红书', rationale: '帮助业主核对条件，效果待验证', assets: [{ id: 'E1', sourceId: 'B2', quote: '只做厨房局部翻新', use: '限定业务范围，不推断工期' }], candidates: Array.from({ length: 6 }, (_, i) => ({
  id: `C${i+1}`, audience: '准备翻新的业主', question: `核对事项${i+1}`, angle: `具体角度${i+1}`, format: '清单', payoff: '学会核对合同条件', hook: '报价要怎么比', action: '和家人一起核对', production: '纸笔示意图', evidenceKind: 'guidance', assetIds: [], sourceIds: [],
})) });
const item = (candidateId, title, body) => ({ candidateId, title, body, cover: '先看约定再决定', coverLayout: '主题字居中，四周留白，配纸笔示意图', purpose: title, visual: '使用纸笔示意图，无需现场案例', reason: '帮助业主在签约前核对具体条件',
  brief: { audience: '准备翻新的业主', question: title, takeaway: '知道签约前要核对哪些约定', evidence: '一般决策建议，不是具体服务承诺', nextStep: '和家人核对约定', sourceIds: [] },
  growth: { role: '提供可分享的核对方法', hookReason: '签约前的具体疑问', actionReason: '和一起装修的家人核对', hypothesis: '是否带来分享有待发布验证' },
});
const content = () => ({ title: '签约前先核对', gate: '一般决策建议，未经实际发布验证', platform: '小红书', rationale: '回答具体问题', items: [
  item('C5', '水电报价怎么比', '1、先把按米计算和按点位计费的项目分开。\n2、确认数量如何复核，再对齐计费口径比较总价。'),
  item('C2', '工期约定怎么写', '合同只写天数时，需要确认是工作日还是自然日，并约定材料延迟和变更方案时如何调整。留下双方确认记录。'),
] });
let firstProposal, firstDraft, chosen, writingCalls, planningCalls, selectionCalls;
beforeEach(() => {
  firstProposal = null; firstDraft = null; chosen = ['C5', 'C2']; writingCalls = 0; planningCalls = 0; selectionCalls = 0;
  chatMock.mockReset().mockImplementation(async ({ system, user }) => {
    if (system.includes('内容事实核对编辑')) return JSON.stringify({ approved: true, issues: [] });
    if (user.includes('这一步不生成正文')) { planningCalls++; return JSON.stringify(planningCalls === 1 && firstProposal ? firstProposal : proposals()); }
    if (user.includes('独立比较候选')) {
      selectionCalls++;
      return JSON.stringify({ selected: chosen.map(candidateId => ({ candidateId, reason: '有具体核对方法且可以用纸笔制作' })), rejected: proposals().candidates.filter(c => !chosen.includes(c.id)).map(c => ({ candidateId: c.id, reason: '相对入选项不够具体' })), materialRequest: '' });
    }
    writingCalls++;
    const raw = writingCalls === 1 && firstDraft ? structuredClone(firstDraft) : content();
    raw.items = raw.items.filter(row => chosen.includes(row.candidateId));
    return JSON.stringify(raw);
  });
});

describe('从候选到成品的完整流程', () => {
  it('已采用的咨询入口进入选题、正文与事实核对，作品保存当时入口且不使用未采用草稿',async()=>{
    const entry='小红书：站内私信说明厨房尺寸；公众号：菜单预约咨询',draft='尚未启用的预约链接';
    const source={...customer,creatorProfile:{version:2,fields:{contactEntry:entry}},creatorProfileDraft:{version:3,fields:{contactEntry:draft}}};
    const pack=await generateTodayDrop(source),requests=chatMock.mock.calls.map(([r])=>r);
    for(const request of [requests.find(r=>r.user.includes('这一步不生成正文')),requests.find(r=>r.user.includes('平台交付结构')),requests.find(r=>r.system.includes('内容事实核对编辑'))]){expect(request.user).toContain(entry);expect(request.user).not.toContain(draft);}
    expect(pack.creatorProfileSnapshot.fields.contactEntry).toBe(entry);source.creatorProfile.fields.contactEntry='改用其他入口';expect(pack.creatorProfileSnapshot.fields.contactEntry).toBe(entry);
  });

  it.each(['paid','natural','mixed'])('信息流 %s 用途进入候选与成稿提示并固化在作品',async distributionIntent=>{
    const pack=await generateTodayDrop({...customer,creationEntry:'feed',distributionIntent});
    expect(pack.origin).toMatchObject({creationEntry:'feed',distributionIntent});
    const calls=chatMock.mock.calls.map(([request])=>request);
    const planner=calls.find(r=>r.user.includes('这一步不生成正文'));
    const writer=calls.find(r=>r.user.includes('平台交付结构'));
    for(const request of [planner,writer]){
      expect(request.user).toContain('创作入口：信息流内容创作');
      expect(request.user).toContain(distributionIntent==='paid'?'传播用途：付费投放':distributionIntent==='mixed'?'传播用途：付费与自然兼用':'传播用途：自然推荐');
      if(distributionIntent!=='natural')expect(request.system+' '+request.user).not.toContain('零广告投流');
    }
  });

  it.each([['小红书','image'],['小红书','video'],['抖音','image'],['抖音','video'],['视频号','video']])('指定%s %s时生成相应交付并保存平台与形态',async(platform,format)=>{
    firstProposal=proposals();firstProposal.platform=platform;for(const candidate of firstProposal.candidates)candidate.format=format==='image'?'图文清单':'短视频讲解';
    firstDraft=content();firstDraft.platform=platform;
    for(const [i,row] of firstDraft.items.entries()){
      row.shots=format==='image'?`第一页：问题${i}\n第二页：核对${i}\n第三页：对照${i}`:`0-3秒｜问题${i}｜开场\n3-20秒｜纸笔${i}｜解释\n20-30秒｜清单${i}｜收口`;
      if(format==='video'){row.hook='展示正在核对的项目';row.cta='按合同逐项核对';}
    }
    const pack=await generateTodayDrop({...customer,requestedPlatform:platform,requestedFormat:format});
    expect(pack.origin).toMatchObject({requestedPlatform:platform,format});expect(pack.creationPlan.requestedFormat).toBe(format);
    expect(pack.shells[platform][0].shots.split('\n')).toHaveLength(3);expect(hasHardBlock(pack.checks)).toBe(false);
    const writer=chatMock.mock.calls.find(([r])=>r.user.includes('平台交付结构'))[0].user;
    expect(writer).toContain(format==='image'?'用户指定'+platform+'图文':'用户指定'+platform+'短视频');
  });
  it('信息流朋友圈创作保留用途并交付外层文案和展开内容',async()=>{
    firstProposal=proposals();firstProposal.platform='朋友圈';
    firstDraft=content();firstDraft.platform='朋友圈';
    const pack=await generateTodayDrop({...customer,creationEntry:'feed',distributionIntent:'paid',requestedPlatform:'朋友圈'});
    expect(pack.origin).toMatchObject({creationEntry:'feed',distributionIntent:'paid',requestedPlatform:'朋友圈'});
    expect(pack.shells.朋友圈[0]).toMatchObject({title:expect.any(String),body:expect.any(String)});
    expect(pack.creationPlan.platform).toBe('朋友圈');expect(hasHardBlock(pack.checks)).toBe(false);
  });
  it('按独立筛选顺序写成两篇、保存快照、真实质量检查允许清单，进度匹配实际篇数', async () => {
    const progress = vi.fn(), before = structuredClone(customer);
    const pack = await generateTodayDrop(customer, {}, { onProgress: progress });
    expect(planningCalls).toBe(1); expect(selectionCalls).toBe(1); expect(writingCalls).toBe(1);
    expect(pack.execution.map(row => row.candidateId)).toEqual(['C5', 'C2']);
    expect(pack.creationPlan.selected.map(row => row.candidateId)).toEqual(['C5', 'C2']);
    expect(pack.creationPlan.rejected).toHaveLength(4);
    expect(pack.shells.小红书).toHaveLength(2);
    expect(hasHardBlock(pack.checks)).toBe(false);
    expect(progress.mock.calls.at(-1)[2]).toEqual({ copiesGot: 2, copiesTotal: 2, shellsGot: 2, shellsTotal: 2 });
    expect(chatMock.mock.calls.find(([r]) => r.system.includes('内容事实核对编辑'))[0].user).toContain('creationIntent');
    const reviewed = JSON.parse(chatMock.mock.calls.find(([r]) => r.system.includes('内容事实核对编辑'))[0].user.split('待核对草稿：')[1]);
    expect(reviewed.creationIntent[0]).not.toHaveProperty('hook');
    expect(reviewed.creationIntent[0]).not.toHaveProperty('recommendation');
    expect(reviewed.creationIntent[0]).toHaveProperty('payoff');
    expect(customer).toEqual(before);
  });
  it('只有一项入选时交付一篇，不补齐固定篇数', async () => {
    chosen = ['C5'];
    const pack = await generateTodayDrop(customer);
    expect(pack.shells.小红书).toHaveLength(1);
    expect(Object.values(pack.copies).flat()).toHaveLength(1);
  });
  it('保留结构化依据中的事实和未知项，不因此重写整批，仍核对正文', async () => {
    firstDraft = content();
    firstDraft.gate = { verifiedFacts: ['只做厨房局部翻新'], unverifiedFacts: ['固定工期'], contentStrategy: '一般决策建议' };
    const pack = await generateTodayDrop(customer);
    expect(writingCalls).toBe(1);
    expect(pack.gate).toContain('资料提到（非独立认证）：只做厨房局部翻新');
    expect(pack.gate).toContain('未核实项：固定工期');
    expect(chatMock.mock.calls.filter(([r]) => r.system.includes('内容事实核对编辑'))).toHaveLength(1);
  });
  it('空的结构化依据仍退回修复', async () => {
    firstDraft = content(); firstDraft.gate = { verifiedFacts: [] };
    await generateTodayDrop(customer);
    expect(writingCalls).toBe(2);
    expect(chatMock.mock.calls.some(([r]) => r.user.includes('不能返回空对象'))).toBe(true);
  });
  it('逐项指出缺少的制作字段，避免泛泛报错后模型原样重发', async () => {
    firstDraft = content(); delete firstDraft.items[1].visual;
    await generateTodayDrop(customer);
    expect(writingCalls).toBe(2);
    expect(chatMock.mock.calls.some(([r]) => r.user.includes('第2篇缺少非空文字字段items[1].visual'))).toBe(true);
  });
  it('虚构业务原文会重做候选，不能混入入选快照', async () => {
    firstProposal = proposals(); firstProposal.assets[0].quote = '免费上门测量';
    const pack = await generateTodayDrop(customer);
    expect(planningCalls).toBe(2);
    expect(pack.creationPlan.assets[0].quote).toBe('只做厨房局部翻新');
    expect(chatMock.mock.calls[1][0].user).toContain('原文不在');
  });
  it('成稿擅自调换候选顺序，退回写作但不重做已完成的筛选', async () => {
    firstDraft = content(); firstDraft.items.reverse();
    const pack = await generateTodayDrop(customer);
    expect(writingCalls).toBe(2); expect(planningCalls).toBe(1); expect(selectionCalls).toBe(1);
    expect(pack.execution.map(row => row.candidateId)).toEqual(chosen);
    expect(chatMock.mock.calls.some(([r]) => r.user.includes('不得换成淘汰候选'))).toBe(true);
  });
  it('筛选服务失败时明确失败，不偷偷回退为未经筛选的六篇', async () => {
    chatMock.mockImplementation(async ({ user }) => {
      if (user.includes('这一步不生成正文')) return JSON.stringify(proposals());
      throw new Error('筛选服务暂不可用');
    });
    await expect(generateTodayDrop(customer)).rejects.toThrow('创意筛选没出成');
    expect(chatMock).toHaveBeenCalledTimes(3);
  });
});
