import { beforeEach, describe, expect, it, vi } from 'vitest';
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('./llm.mjs', () => ({ chat: chatMock, llmReady: () => true }));
vi.mock('./research.mjs', () => ({
  buildResearch: async () => ({ status: 'knowledge', checkedAt: '2026-10-08', sources: [], strategy: { platform: '小红书' } }),
  researchBrief: () => '没有外部研究，不编造来源',
}));
import { generateTodayDrop } from './generate.mjs';
import { hasHardBlock } from './check.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {checkpointRequest,createContentRun,runContentSteps} from './content-checkpoints.mjs';

import { customer, proposals, content } from '../scripts/fixtures/organic-content.mjs';
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
  it.each(['成稿','审读'])('供应商成功返回不合格的%s，恢复时只补失败步骤',async phase=>{
    const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'harta-content-replay-'));
    fs.symlinkSync(path.join(root,'vendor'),path.join(temp,'vendor'));
    const cwd=vi.spyOn(process,'cwd').mockReturnValue(temp),call=chatMock.getMockImplementation();
    const calls={draft:0,review:0},owner='editor@example.invalid';
    let invalid=true;
    chatMock.mockImplementation(args=>checkpointRequest(args,async()=>{
      if(args.system.includes('内容事实核对编辑')) {
        calls.review++;
        if(invalid && phase==='审读') return '空的审读结果';
      } else if(args.user.includes('本批独立筛选后的创意')) {
        calls.draft++;
        if(invalid && phase==='成稿') return '{}';
      }
      return call(args);
    }));
    try {
      const id=createContentRun(owner,'c','v1',{});
      const run=()=>runContentSteps(owner,'c',id,false,()=>generateTodayDrop(customer));
      await expect(run()).rejects.toThrow();
      const prior={...calls},plans=planningCalls;
      if(phase==='审读') expect(prior.draft).toBe(1);
      invalid=false;
      const pack=await run();
      expect(pack.execution.length).toBeGreaterThan(0);
      expect(planningCalls).toBe(plans);
      expect(calls.draft-prior.draft).toBe(phase==='成稿'?1:0);
      expect(calls.review-prior.review).toBe(1);
    } finally {
      cwd.mockRestore();
      fs.rmSync(temp,{recursive:true,force:true});
    }
  });
  it('已采用的咨询入口进入选题、正文与事实核对，作品保存当时入口且不使用未采用草稿',async()=>{
    const entry='小红书：站内私信说明厨房尺寸；公众号：菜单预约咨询',draft='尚未启用的预约链接';
    const source={...customer,creatorProfile:{version:2,fields:{contactEntry:entry}},creatorProfileDraft:{version:3,fields:{contactEntry:draft}}};
    const pack=await generateTodayDrop(source),requests=chatMock.mock.calls.map(([r])=>r);
    for(const request of [requests.find(r=>r.user.includes('这一步不生成正文')),requests.find(r=>r.user.includes('平台交付结构')),requests.find(r=>r.system.includes('内容事实核对编辑'))]){expect(request.user).toContain(entry);expect(request.user).not.toContain(draft);}
    expect(pack.creatorProfileSnapshot.fields.contactEntry).toBe(entry);source.creatorProfile.fields.contactEntry='改用其他入口';expect(pack.creatorProfileSnapshot.fields.contactEntry).toBe(entry);
  });

  it.each([['小红书','image','leads'],['抖音','video','reach_leads']])('%s %s 的可执行咨询动作进入读者看到的成品和末页／末镜，并经事实复核',async(platform,format,goal)=>{
    const answer='先慢慢合上柜门，看盒盖是否碰到门边；若是盒身顶到铰链，量铰链到侧板之间的净宽。';
    const ending='如果柜门还会卡住，私信说一下，是盒盖碰到门边，还是盒身顶到铰链？';
    const source={...customer,growthGoal:goal,requestedPlatform:platform,requestedFormat:format,
      readerQuestion:'盒子放得进，为什么柜门关不上？',salesMaterial:'厨房收纳咨询只核对柜内尺寸及开合障碍。'+answer,
      creatorProfile:{version:1,fields:{contactEntry:platform+'：可在站内私信描述柜门卡住的位置。'}}};
    chosen=['C5'];firstProposal=proposals();firstProposal.platform=platform;firstProposal.assets=[];
    for(const c of firstProposal.candidates) {c.assetIds=[];c.format=format==='image'?'图文清单':'短视频讲解';}
    firstDraft=content();firstDraft.platform=platform;
    const old=firstDraft.items.find(row=>row.candidateId==='C5');
    Object.assign(old,{title:'柜门关不上，先看哪里',cover:'先看柜门卡在哪里',body:answer+'欢迎私信咨询。',
      shots:format==='image'?'柜门卡在哪里？\n先看盒盖还是铰链。\n欢迎私信咨询。':'0–3秒｜合上柜门｜哪里卡住了？\n3–9秒｜量铰链旁的净宽｜看盒身的位置\n9–15秒｜指向门边｜欢迎私信咨询。'});
    if(format==='video') Object.assign(old,{hook:'柜门缓慢碰上盒盖：到底卡在哪里？',cta:'欢迎私信咨询。'});
    Object.assign(old.brief,{question:source.readerQuestion,takeaway:'观察碰撞点，再量铰链旁的可用宽度。',nextStep:ending});
    const pack=await generateTodayDrop(source),delivered=pack.shells[platform][0];
    expect(old.body.endsWith('欢迎私信咨询。')).toBe(true);
    expect(delivered.body).toBe(answer+ending);
    expect(delivered.shots.split('\n').at(-1)).toContain(ending);
    if(format==='video') expect(delivered.cta).toBe(ending);
    expect(Object.values(pack.copies).flat()).toContain(answer+ending);
    expect(writingCalls).toBe(1);
    const factual=chatMock.mock.calls.map(([r])=>r).find(r=>r.system.includes('内容事实核对编辑'));
    expect(factual.user.split('待核对草稿：').at(-1)).toContain(answer+ending);
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
