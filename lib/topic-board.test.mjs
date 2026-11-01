import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace,publicWorkspace} from './workspace.mjs';import {topicBoardAction} from './topic-board.mjs';import {topicBoardRows} from './topic-board-data.mjs';import {decideRadarWork,importRadarSamples} from './research-tools.mjs';import {generateProductionOutline,saveProductionDraft} from './growth-workspace.mjs';
const email='topic-board@example.test',root=process.cwd();let dir;
const get=()=>readWorkspace(email),c=()=>get().customers[0],rows=()=>topicBoardRows(c(),get().acquisition);
const run=(input,deps)=>topicBoardAction(email,{customerId:'c1',...input},deps);
const create=(extra={})=>run({action:'create',title:'厨房收纳怎么安排',platform:'小红书',format:'image',goal:'reach_leads',...extra});
const act=(action,row,extra={},deps)=>run({action,id:row.id,version:row.version,basis:row.basis,...extra},deps);
const deps={generate:async()=>({fields:{title:'厨房收纳怎么安排',script:'先核对厨房尺寸，再记录收纳需求。',shots:'先核对尺寸\n记录收纳需求',cover:'先看需求',coverLayout:'清晰排版'},warnings:[]})};
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-topic-board-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'厨房设计',pitch:'厨房设计',hunt:'家装',growthGoal:'leads',growthDirection:'用户原来的方向',drops:[],packs:[],demandTopics:[{id:'d1',kind:'comment',title:'厨房灯怎么选'}]},{id:'c2',name:'其他业务',drops:[]}],acquisition:{works:[{id:'w1',customerId:'c1',platform:'小红书',title:'参考厨房作品',description:'参考正文',source:'manual_paste'},{id:'w2',customerId:'c2',platform:'抖音',title:'其他业务参考'}]}}));
it('选题制作稿持久保存生成时的事实提示，重新读取仍可核对',async()=>{await create();await act('generate',rows()[0],{},{generate:async()=>({fields:{script:'待核对正文'},warnings:['事实核对提示：确认价格'],factReview:{status:'completed',issues:['确认价格']}})});const saved=c().drops[0].productionDrafts['小红书|0'];expect(saved.generationReview).toMatchObject({status:'completed',warnings:['事实核对提示：确认价格']});});
it('manual topics persist, retain their source, reject stale edits, and do not fabricate engagement or change business direction',async()=>{
 await create({bucket:'now'});const first=rows()[0];expect(first).toMatchObject({kind:'manual',bucket:'now',sourceCurrent:true});expect(first).not.toHaveProperty('metrics');expect(c().growthDirection).toBe('用户原来的方向');
 await act('move',first,{bucket:'next'});await expect(act('update',first,{title:'旧窗口',platform:'小红书',format:'image',goal:'leads'})).rejects.toThrow('选题已变化');
 await act('move',rows()[0],{bucket:'discard'});await act('move',rows()[0],{bucket:'parked'});expect(rows()[0].bucket).toBe('parked');await act('move',rows()[0],{bucket:'discard'});await act('remove',rows()[0]);expect(rows()).toHaveLength(0);
 await expect(topicBoardAction('another@example.test',{customerId:'c1',action:'create',title:'越权'})).rejects.toThrow('找不到');await expect(create({kind:'work',sourceKey:'w2'})).rejects.toThrow('不可用');
});
it('radar and manual topics share the same five-item weekly limit and stale arrangement protection',async()=>{
 decideRadarWork(email,{customerId:'c1',workId:'w1',action:'now'});for(let i=0;i<4;i++)await create({title:'手写'+i,bucket:'now'});await expect(create({bucket:'now'})).rejects.toThrow('最多');
 const radar=rows().find(p=>p.kind==='work');decideRadarWork(email,{customerId:'c1',workId:'w1',action:'next'});await expect(act('move',radar,{bucket:'parked'})).rejects.toThrow('已变化');await create({bucket:'now'});expect(()=>decideRadarWork(email,{customerId:'c1',workId:'w1',action:'now'})).toThrow('最多');
});
it('公众号文章样本保留段落，安排后以长文选题交接',()=>{
 const result=importRadarSamples(email,{customerId:'c1',platform:'公众号',text:'第一篇文章\n第一段正文。\n\n第二段正文。\n---\n第二篇文章\n另一篇正文。'});expect(result.added).toBe(2);
 const article=get().acquisition.works.find(w=>w.platform==='公众号');expect(article.description).toContain('\n\n');decideRadarWork(email,{customerId:'c1',workId:article.id,action:'now'});
 expect(rows().find(r=>r.sourceKey===article.id)).toMatchObject({platform:'公众号',format:'article',bucket:'now',sourceCurrent:true});
});
it('collects a demand topic once, preserves old source snapshot, and requires review after source changes',async()=>{
 await run({action:'create',kind:'pool',sourceKey:'厨房灯怎么选'});await run({action:'create',kind:'pool',sourceKey:'厨房灯怎么选'});expect(rows()).toHaveLength(1);
 const space=get();space.customers[0].demandTopics=[];writeWorkspace(email,space);expect(rows()[0].sourceCurrent).toBe(false);await expect(act('generate',rows()[0],{},deps)).rejects.toThrow('来源');expect(c().drops).toHaveLength(0);
 await create({kind:'work',sourceKey:'w1'});const s=get();s.acquisition.works[0].description='更新后的参考';writeWorkspace(email,s);const work=rows().find(p=>p.kind==='work');expect(work.sourceCurrent).toBe(false);await act('refresh',work);expect(rows().find(p=>p.kind==='work').sourceCurrent).toBe(true);
});
it('generates every weekly topic into separate drafts with snapshot and per-topic goal, without publishing or applying',async()=>{
 await create({bucket:'now'});await create({title:'拍摄厨房视频',platform:'抖音',format:'video',goal:'sales',bucket:'now'});const result=await run({action:'generate-week',selection:rows().filter(p=>p.bucket==='now').map(p=>({id:p.id,basis:p.basis}))},deps);expect(result.results).toHaveLength(2);expect(result.results.every(r=>!r.error)).toBe(true);expect(rows().every(p=>p.bucket==='drafts')).toBe(true);
 const pack=c().drops.find(p=>p.origin.goal==='sales');expect(pack.topicSnapshot.title).toBe('拍摄厨房视频');expect(pack.shells.抖音[0].body).toBe('');expect(pack.productionDrafts['抖音|0'].fields.script).toContain('核对');expect(get().acquisition.publications||[]).toHaveLength(0);
 let request;await generateProductionOutline(email,{customerId:'c1',packId:pack.id,platform:'抖音',index:0,format:'video'},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async input=>{request=input;return '{"script":"建议"}';}});expect(request.user).toContain('拍摄厨房视频');expect(request.user).toContain('卖货成交');
});
it('failed generation retains one editable draft, retries preserve existing fields and do not duplicate packs',async()=>{
 await create();let result=await act('generate',rows()[0],{},{generate:async()=>{throw new Error('模型不可用');}});expect(result.results[0].error).toContain('模型不可用');expect(c().drops).toHaveLength(1);
 const pack=c().drops[0];saveProductionDraft(email,{customerId:'c1',packId:pack.id,platform:'小红书',index:0,version:0,format:'image',fields:{script:'用户手写正文'}});
 result=await act('generate',rows()[0],{},{generate:async(_email,input)=>{expect(input.workingFields.script).toBe('用户手写正文');expect(input.workingFields).not.toHaveProperty('liveSchedule');return {fields:{cover:'补充封面',script:''},warnings:[]};}});
 expect(result.results[0].error).toBeUndefined();expect(c().drops).toHaveLength(1);expect(c().drops[0].productionDrafts['小红书|0'].fields.script).toBe('用户手写正文');expect(publicWorkspace(get()).customers[0].topicBoard[0].packExists).toBe(true);
});
it('an upstream edit during generation cannot save old results or overwrite another draft',async()=>{
 await create({kind:'work',sourceKey:'w1'});const result=await act('generate',rows()[0],{},{generate:async()=>{const s=get();s.acquisition.works[0].description='生成期间更新';writeWorkspace(email,s);return {fields:{script:'旧结果'},warnings:[]};}});expect(result.results[0].error).toContain('来源已变化');expect(c().drops[0].productionDrafts).toBeUndefined();
});

it('requires the exact weekly selection and preserves previous packs when explicitly generating a new draft',async()=>{
 await create({bucket:'now'});const old=rows().map(p=>({id:p.id,basis:p.basis}));await create({title:'另一个选题',bucket:'now'});await expect(run({action:'generate-week',selection:old},deps)).rejects.toThrow('安排已变化');expect(c().drops).toHaveLength(0);
 await act('generate',rows()[0],{},deps);const row=rows()[0],oldPackId=row.packId;await act('generate-new',row,{},deps);expect(c().drops).toHaveLength(2);expect(rows()[0].packId).not.toBe(oldPackId);expect(rows()[0].previousPackIds).toContain(oldPackId);expect(c().drops.some(p=>p.id===oldPackId)).toBe(true);
});
it('评论洞察加入选题库保留依据，旧结论和已排除依据不能加入',async()=>{
 const space=get();space.customers[0].painClusters={id:'insight-1',clusters:[{id:'P1',topic:'空间不足',angle:'厨房空间如何安排',anxiety:'担心空间不够',count:2,signalIds:['s1'],quotes:[{text:'厨房太小了'}]}]};writeWorkspace(email,space);
 await expect(run({action:'create',kind:'pool',sourceKey:'厨房空间如何安排',insightId:'old',clusterId:'P1'})).rejects.toThrow('洞察已变化');
 await run({action:'create',kind:'pool',sourceKey:'厨房空间如何安排',insightId:'insight-1',clusterId:'P1'});
 expect(rows()[0].sourceSnapshot).toMatchObject({source:'痛点',title:'厨房空间如何安排'});
 const changed=get();changed.customers[0].painClusters.staleReason='评论已排除';writeWorkspace(email,changed);
 expect(rows()[0].sourceCurrent).toBe(false);await expect(act('generate',rows()[0],{},deps)).rejects.toThrow('来源');
});
it('粘贴样本洞察可转为选题，保留未核验来源并在依据消失后停用',async()=>{
 const space=get();space.customers[0].sampleCommentInsights=[{id:'sample-1',clusters:[{id:'P1',topic:'预算',angle:'如何比较报价',anxiety:'担心价格',quotes:[{text:'报价怎么比较'}]}]}];writeWorkspace(email,space);
 await expect(run({action:'create',kind:'sample',sourceKey:'sample-1|P1|extra'})).rejects.toThrow('来源');
 await run({action:'create',kind:'sample',sourceKey:'sample-1|P1'});expect(rows()[0].sourceSnapshot).toMatchObject({source:'粘贴评论样本（来源未核验）',insightId:'sample-1'});
 const changed=get();changed.customers[0].sampleCommentInsights=[];writeWorkspace(email,changed);expect(rows()[0].sourceCurrent).toBe(false);await expect(act('generate',rows()[0],{},deps)).rejects.toThrow('来源');
});
it('独立记录内容任务，引流可与流量和线索双目标并存并进入制作快照',async()=>{
 await create({job:'divert',goal:'reach_leads'});expect(rows()[0]).toMatchObject({job:'divert',goal:'reach_leads'});
 await act('generate',rows()[0],{},deps);expect(c().drops[0].topicSnapshot).toMatchObject({job:'divert',jobLabel:'引流'});expect(c().drops[0].origin.goal).toBe('reach_leads');
 await expect(create({job:'invented'})).rejects.toThrow('内容任务');
});
it('公众号长文选题生成独立文章草稿，不接受不匹配的形式',async()=>{
 await create({title:'怎样比较厨房报价和设计方案',platform:'公众号',format:'article',job:'lead'});await act('generate',rows()[0],{},deps);const pack=c().drops[0];expect(pack.origin.format).toBe('article');expect(pack.productionDrafts['公众号|0']).toMatchObject({format:'article',job:'lead'});
 await expect(create({platform:'公众号',format:'video'})).rejects.toThrow('匹配');await expect(create({platform:'抖音',format:'article'})).rejects.toThrow('匹配');
});
it('视频号选题保留平台并生成短视频草稿',async()=>{
 await create({title:'厨房设计小技巧',platform:'视频号',format:'video'});await act('generate',rows()[0],{},deps);const pack=c().drops[0];expect(pack.productionDrafts['视频号|0']).toMatchObject({format:'video'});expect(pack.battlefields).toContain('视频号');await expect(create({platform:'视频号',format:'article'})).rejects.toThrow('匹配');
});
it('旧客户端省略任务时保留已设置值，用户可明确取消标注',async()=>{
 await create({job:'lead'});await act('update',rows()[0],{title:'修改标题',hook:'',platform:'小红书',format:'image',goal:'leads'});expect(rows()[0].job).toBe('lead');
 await act('update',rows()[0],{title:'修改标题',hook:'',platform:'小红书',format:'image',goal:'leads',job:''});expect(rows()[0].job).toBe('');
});
it('制作稿任务可独立更新并持久化，旧写入不能覆盖，选题来源快照保持不变',async()=>{
 await create({job:'divert'});await act('generate',rows()[0],{},deps);const pack=c().drops[0],base={customerId:'c1',packId:pack.id,platform:'小红书',index:0,format:'image',fields:pack.productionDrafts['小红书|0'].fields};
 saveProductionDraft(email,{...base,version:1,job:'convert'});let updated=c().drops[0];expect(updated.productionDrafts['小红书|0'].job).toBe('convert');expect(updated.topicSnapshot.job).toBe('divert');
 expect(()=>saveProductionDraft(email,{...base,version:1,job:'lead'})).toThrow('已修改');saveProductionDraft(email,{...base,version:2});updated=c().drops[0];expect(updated.productionDrafts['小红书|0'].job).toBe('convert');
});
it('生成时任务被另一窗口修改，旧建议不能返回',async()=>{
 await create({job:'traffic'});await act('generate',rows()[0],{},deps);const pack=c().drops[0],args={customerId:'c1',packId:pack.id,platform:'小红书',index:0,format:'image'};
 await expect(generateProductionOutline(email,args,{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>{const draft=c().drops[0].productionDrafts['小红书|0'];saveProductionDraft(email,{...args,version:draft.version,fields:draft.fields,job:'lead'});return '{"script":"旧任务建议"}';}})).rejects.toThrow('已变化');
});
it('生成脚本以当前已保存任务为准，同时保留选题的历史任务',async()=>{
 await create({job:'divert'});await act('generate',rows()[0],{},deps);const pack=c().drops[0],args={customerId:'c1',packId:pack.id,platform:'小红书',index:0,format:'image'},draft=pack.productionDrafts['小红书|0'];
 saveProductionDraft(email,{...args,version:draft.version,fields:draft.fields,job:'convert'});let request;
 await generateProductionOutline(email,args,{budget:(_e,_c,_p,fn)=>fn(),chatFn:async input=>{request=input;return '{"script":"建议"}';}});
 expect(request.user).toContain('"contentJob":"转化"');expect(request.user).toContain('"job":"divert"');expect(request.system).toContain('以 contentJob 为准');expect(c().drops[0].topicSnapshot.job).toBe('divert');
});
it('历史评论洞察可加入选题，依据变动、排除或跨业务后不能生成',async()=>{
 const space=get();space.acquisition.signals=[{id:'s1',customerId:'c1',workId:'w1',text:'厨房空间太小怎么办',status:'new'}];space.customers[0].painClusterHistory=[{id:'h1',generatedAt:'2026-10-01T00:00:00Z',sourceSignalIds:['s1'],clusters:[{id:'P1',topic:'空间不足',angle:'厨房空间如何安排',anxiety:'担心空间',quotes:[{text:'厨房空间太小怎么办'}]}]}];writeWorkspace(email,space);
 await expect(run({action:'create',kind:'history',sourceKey:'h1|missing'})).rejects.toThrow('来源');
 await topicBoardAction(email,{customerId:'c2',action:'create',kind:'history',sourceKey:'h1|P1'}).then(()=>{throw Error('不应跨业务引用');},e=>expect(e.message).toContain('来源'));
 await run({action:'create',kind:'history',sourceKey:'h1|P1'});expect(rows()[0].sourceSnapshot).toMatchObject({source:'历史评论洞察',insightId:'h1'});
 let changed=get();changed.acquisition.signals[0].text='原评论已修正';writeWorkspace(email,changed);expect(rows()[0].sourceCurrent).toBe(false);await expect(act('generate',rows()[0],{},deps)).rejects.toThrow('来源');await expect(act('refresh',rows()[0])).rejects.toThrow('重新归集');
 changed=get();changed.acquisition.signals[0].status='excluded';writeWorkspace(email,changed);expect(rows()[0].currentSource).toBeNull();await expect(act('refresh',rows()[0])).rejects.toThrow('重新归集');
});
