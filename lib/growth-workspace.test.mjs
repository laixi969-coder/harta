import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readWorkspace, writeWorkspace, editLine, setContentState } from './workspace.mjs';
import { saveGrowthSettings, saveProductionDraft, rescheduleLive, stageStudioReturn, applyStudioReturn, createProductionContent, duplicateLiveSession, applyProductionDraft, generateProductionOutline, reviewProductionFacts, saveCreationStandards, saveCreatorProfile, creatorMemoryAction, saveCreatorPackSettings, saveOutcomes, saveFactCards, preparePostRewrite, applyPostVersion, validateOutcome, postRevision, proposeFactCards } from './growth-workspace.mjs';
import { liveSources } from '../js/live-sources.js';
import { productionIssues } from '../js/production-workflow.js';
import { standardHits, standardsBrief } from '../js/creation-standards.js';
import { researchFingerprint } from './research.mjs';
import { growthGoal, outcomeAssessment } from '../js/growth.js';
import { packAsSent } from './pack-edits.mjs';
import { businessMaterialContext } from './content-context.mjs';
import { saveAccount, preparePublication, confirmPublication } from './acquisition-workspace.mjs';
import { radarHookBasis } from './radar-hook-basis.mjs';
const email='growth-test@example.com', original=process.cwd();
let dir;
const content = { title:'拆墙前核对什么',cover:'先查结构资料',coverLayout:'纸上标出待确认位置',body:'拆墙前先核对房屋原始结构资料，无法判断承重关系时请结构专业人员确认，不要仅凭墙体厚度决定施工。' };
const candidate = { content:{...content,title:'这面墙能拆吗',body:'准备改动墙体时，先找出原始结构图，标记想调整的位置。拿不准的地方请结构专业人员核对，再决定是否施工。'},execution:{order:1,purpose:'消除决策疑虑'} };
const args = {customerId:'c1',packId:'p1',platform:'小红书',index:0};
const outcome = () => ({platform:'小红书',index:0,start:'2026-01-01',end:'2026-01-07',source:'平台后台截图',metrics:{views:0},baseline:null});
const pack = () => readWorkspace(email).customers[0].drops[0];
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-growth-tests-'));fs.symlinkSync(path.join(original,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{customers:[{id:'c1',name:'测试',hunt:'家装',salesMaterial:'我们只提供杭州地区的厨房局部翻新服务。',drops:[{id:'p1',tier:'今日',origin:{mode:'organic',goal:'reach'},businessSnapshot:{name:'测试',industry:'家装',material:businessMaterialContext({salesMaterial:'我们只提供杭州地区的厨房局部翻新服务。'}).text,factCards:[]},copies:{A:[content.body]},shells:{小红书:[content]},execution:[{order:1,purpose:'说明核对方法'}]}]}],ledger:[],feedback:{},contentStates:{}}));
describe('增长目标与效果数据',()=>{
 it('可从封面文案新建未发布作品，并完整保留文字',()=>{
  const line='封面文字'.repeat(7),created=createProductionContent(email,{customerId:'c1',platform:'小红书',title:Array.from(line).slice(0,20).join(''),coverLine:line}),space=readWorkspace(email),p=space.customers[0].drops.find(x=>x.id===created.packId);
  expect(p.shells.小红书[0].cover).toBe(line);expect(p.shells.小红书[0].title).toBe(Array.from(line).slice(0,20).join(''));expect(p.origin.mode).toBe('manual');expect(space.acquisition.publications).toHaveLength(0);
  expect(()=>createProductionContent(email,{customerId:'c1',platform:'小红书',title:'主题',coverLine:' '})).toThrow('封面文字');expect(()=>createProductionContent(email,{customerId:'c1',platform:'小红书',title:'主题',coverLine:'字'.repeat(29)})).toThrow('封面文字');expect(()=>createProductionContent('other@example.com',{customerId:'c1',platform:'小红书',title:'主题',coverLine:line})).toThrow();
 });
 it('公众号长文可新建、按文章生成、核对与采用，不要求视频分镜',async()=>{
  const created=createProductionContent(email,{customerId:'c1',platform:'公众号',title:'如何比较厨房设计方案与报价'}),input={customerId:'c1',packId:created.packId,platform:'公众号',index:0},fields={title:'如何比较厨房设计方案与报价',script:'先明确使用需求。\n\n再逐项核对报价。'};
  let request;const result=await generateProductionOutline(email,{...input,format:'article'},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async value=>{request=value;return '{"script":"分节文章建议","shots":"不应采用"}';}});
  expect(request.user).toContain('公众号长文');expect(request.user).toContain('公众号·长文');expect(result.fields.script).toBe('分节文章建议');expect(result.fields.shots).toBe('');
  saveProductionDraft(email,{...input,version:0,format:'article',fields});const checked=await reviewProductionFacts(email,{...input,format:'article',fields},{budget:(_e,_c,_p,fn)=>fn(),reviewFn:async()=>[]});expect(checked.issues).toEqual([]);
  applyProductionDraft(email,{...input,version:1,confirmed:true});const saved=readWorkspace(email).customers[0].drops.find(p=>p.id===created.packId);expect(packAsSent(saved).shells.公众号[0].body).toBe(fields.script);
  editLine(email,created.packId,'公众号|0|body','第一段。\n\n第二段。');const edited=readWorkspace(email).customers[0].drops.find(p=>p.id===created.packId);expect(packAsSent(edited).shells.公众号[0].body).toBe('第一段。\n\n第二段。');
  expect(()=>saveProductionDraft(email,{...args,version:0,format:'article',fields})).toThrow('制作形式');expect(()=>createProductionContent(email,{customerId:'c1',platform:'公众号',title:'字'.repeat(65)})).toThrow('64');
 });
 it('视频号脚本生成使用视频号打法并保留平台',async()=>{
  const created=createProductionContent(email,{customerId:'c1',platform:'视频号',title:'厨房设计怎么选'}),input={customerId:'c1',packId:created.packId,platform:'视频号',index:0};let request;
  await generateProductionOutline(email,{...input,format:'video'},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async value=>{request=value;return '{"script":"视频建议"}';}});expect(request.user).toContain('视频号·清楚解释');expect(request.user).toContain('模式：短视频');
 });
 it('复制直播为独立场次，只带脚本和封面说明，不带排期、复盘和人数',()=>{
  const fields={title:'厨房答疑',cover:'厨房怎么选',coverLayout:'暖色',liveOpen:'先回答问题',liveSegments:'核对尺寸',liveInteraction:'你最关心什么',liveOffer:'预约咨询',liveClose:'下次见',liveSchedule:'2026-10-30T19:00',liveAttendance:'100',liveRetained:'30',liveInquiries:'5',liveQualifiedLeads:'2',liveReview:'第一场总结'};
  saveProductionDraft(email,{...args,version:0,fields,live:true,job:'lead'});
  expect(()=>duplicateLiveSession(email,{...args,version:0})).toThrow('已变化');expect(()=>duplicateLiveSession('other@example.com',{...args,version:1})).toThrow();
  const copy=duplicateLiveSession(email,{...args,version:1}),c=readWorkspace(email).customers[0],fresh=c.drops.find(p=>p.id===copy.packId),draft=fresh.productionDrafts['小红书|0|live'];
  expect(fresh.origin.liveCopySource).toEqual({packId:'p1',platform:'小红书',index:0,version:1});expect(draft.job).toBe('lead');expect(draft.fields).toMatchObject({title:'厨房答疑',liveOpen:'先回答问题',cover:'厨房怎么选',liveSchedule:'',liveAttendance:'',liveRetained:'',liveInquiries:'',liveQualifiedLeads:'',liveReview:''});
  expect(liveSources(c)).toHaveLength(2);expect(c.drops.find(p=>p.id==='p1').productionDrafts['小红书|0|live'].fields).toMatchObject({liveSchedule:'2026-10-30T19:00',liveReview:'第一场总结'});
  saveProductionDraft(email,{customerId:'c1',packId:copy.packId,platform:'小红书',index:0,version:1,live:true,fields:{...draft.fields,liveSchedule:'2026-11-01T19:00'}});expect(liveSources(readWorkspace(email).customers[0]).map(x=>x.time).sort()).toEqual(['2026-10-30T19:00','2026-11-01T19:00']);
  const stale=readWorkspace(email);stale.customers[0].pitch='资料变了';writeWorkspace(email,stale);expect(()=>duplicateLiveSession(email,{...args,version:1})).toThrow('业务资料已变化');
 });
 it('示例内容批次和示例发布记录不能登记为真实效果',()=>{
  let s=readWorkspace(email);s.customers[0].drops[0].demo=true;writeWorkspace(email,s);expect(()=>saveOutcomes(email,{...args,rows:[outcome()]})).toThrow('示例作品');
  s=readWorkspace(email);delete s.customers[0].drops[0].demo;s.acquisition={accounts:[{id:'a',customerId:'c1',platform:'小红书',name:'账号'}],publications:[{id:'demo-pub',customerId:'c1',packId:'p1',platform:'小红书',index:0,status:'published',accountId:'a',sourceType:'demo'}]};writeWorkspace(email,s);
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),publicationId:'demo-pub'}]})).toThrow('发布记录');expect(pack().outcomes).toBeUndefined();
  s=readWorkspace(email);s.acquisition.accounts[0].demo=true;writeWorkspace(email,s);expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),accountId:'a'}]})).toThrow('示例账号');expect(pack().outcomes).toBeUndefined();
 });
 it('无既有作品时可新建并采用制作稿，同时保留原稿及发布历史',()=>{
  const created=createProductionContent(email,{customerId:'c1',platform:'抖音',title:'厨房怎么选'}),id=created.packId,identity={customerId:'c1',packId:id,platform:'抖音',index:0};
  saveProductionDraft(email,{...identity,version:0,fields:{title:'厨房如何选择',script:'先量尺寸，再比较材料。',shots:'镜头一：测量台面',cover:'先看尺寸'},live:false});
  const s=readWorkspace(email);s.contentStates[`${id}::抖音|0|title`]={status:'published',publishedAt:'2026-01-01'};writeWorkspace(email,s);
  expect(()=>applyProductionDraft(email,{...identity,version:1,confirmed:false})).toThrow('确认');
  applyProductionDraft(email,{...identity,version:1,confirmed:true});
  const after=readWorkspace(email),p=after.customers[0].drops.find(x=>x.id===id);
  expect(packAsSent(p).shells.抖音[0].body).toBe('先量尺寸，再比较材料。');expect(p.productionApplyHistory['抖音|0'][0].content.title).toBe('厨房怎么选');
  expect(after.contentStates[`${id}::抖音|0|title`].status).toBe('selected');
  expect(()=>applyProductionDraft(email,{...identity,version:1,confirmed:true})).toThrow('变化');
  expect(()=>createProductionContent('other@example.com',{customerId:'c1',platform:'抖音',title:'主题'})).toThrow('没有这个客户');
 });
 it('图文形式随草稿保存，不能覆盖另一种既定交付形式',()=>{
  const created=createProductionContent(email,{customerId:'c1',platform:'抖音',title:'厨房怎么选'}),identity={customerId:'c1',packId:created.packId,platform:'抖音',index:0};
  saveProductionDraft(email,{...identity,version:0,fields:{title:'厨房怎么选',script:'核对尺寸。',shots:'第一页\n第二页\n第三页'},format:'image'});
  applyProductionDraft(email,{...identity,version:1,confirmed:true});
  const p=readWorkspace(email).customers[0].drops.find(x=>x.id===created.packId);expect(p.origin.format).toBe('image');expect(p.productionDrafts['抖音|0'].format).toBe('image');
  saveProductionDraft(email,{...identity,version:2,fields:{title:'厨房怎么选',script:'新口播'},format:'video'});
  expect(()=>applyProductionDraft(email,{...identity,version:3,confirmed:true})).toThrow('制作形式与原内容不同');
 });
 it('业务资料变化后不能直接采用旧制作稿，核对并重新保存后才能采用',()=>{
  saveProductionDraft(email,{...args,version:0,format:'video',fields:{title:'新标题',script:'制作稿'}});
  const space=readWorkspace(email);space.customers[0].salesMaterial='更新后的服务范围';writeWorkspace(email,space);
  expect(()=>applyProductionDraft(email,{...args,version:1,confirmed:true})).toThrow('业务资料已变化');expect(packAsSent(pack()).shells.小红书[0].title).toBe(content.title);
  saveProductionDraft(email,{...args,version:1,format:'video',fields:{title:'已核对的标题',script:'已核对的制作稿'}});
  applyProductionDraft(email,{...args,version:2,confirmed:true});expect(packAsSent(pack()).shells.小红书[0].title).toBe('已核对的标题');
 });
 it('脚本建议限制业务范围，生成期间原稿变化时拒绝旧结果',async()=>{
  const budget=(_email,_customer,_purpose,fn)=>fn();
  const result=await generateProductionOutline(email,{...args,live:true},{budget,chatFn:async()=>'{"liveOpen":"开场判断"}'});
  expect(result.fields.liveOpen).toBe('开场判断');expect(pack().productionDrafts).toBeUndefined();
  await expect(generateProductionOutline('other@example.com',{...args,live:true},{budget,chatFn:async()=>'{"liveOpen":"x"}'})).rejects.toThrow('找不到');
  await expect(generateProductionOutline(email,{...args,live:true},{budget,chatFn:async()=>{editLine(email,'p1','小红书|0|title','改过的标题');return '{"liveOpen":"过时"}';}})).rejects.toThrow('原稿已变化');
 });
 it('脚本生成使用业务、人设、打法和当前输入，资料变化后拒绝旧建议',async()=>{
  const created=createProductionContent(email,{customerId:'c1',platform:'抖音',title:'橱柜怎么选'}),identity={customerId:'c1',packId:created.packId,platform:'抖音',index:0},space=readWorkspace(email);
  Object.assign(space.customers[0],{growthGoal:'leads',growthCriteria:'吸引厨房翻新咨询',creatorProfile:{version:1,fields:{audience:'准备装修的家庭',voice:'用朴素的话解释',contactEntry:'抖音站内私信说明厨房尺寸'}},creatorPackSettings:{selected:'douyin',custom:[]}});writeWorkspace(email,space);
  let request;const opts={budget:(_e,_c,_p,fn)=>fn(),chatFn:async input=>{request=input;return '{"script":"不应覆盖原稿","hook":"建议开头"}';}};
  const result=await generateProductionOutline(email,{...identity,format:'video',workingFields:{script:'先量厨房尺寸',shots:'展示量尺'}},opts);
  expect(result.fields.script).toBe('');expect(result.fields.hook).toBe('建议开头');for(const text of ['先量厨房尺寸','展示量尺','准备装修的家庭','吸引厨房翻新咨询','抖音·单一主题口播','抖音站内私信说明厨房尺寸'])expect(request.user).toContain(text);expect(request.user).toContain('只返回需要补充的字段');expect(request.user).toContain('至少3行');expect(request.system).toContain('不得编造');
  await expect(generateProductionOutline(email,{...identity,format:'video',workingFields:{bad:'x'}},opts)).rejects.toThrow('格式');
  await expect(generateProductionOutline(email,{...identity,format:'video',workingFields:{title:'标题',cover:'封面',coverLayout:'排版',script:'口播',hook:'开头',shots:'镜头',cta:'收口'}},opts)).rejects.toThrow('已填写');
  await expect(generateProductionOutline(email,{...identity,format:'video'}, {...opts,chatFn:async()=>{const current=readWorkspace(email);current.customers[0].growthCriteria='改成别的目标';writeWorkspace(email,current);return '{"script":"过时"}';}})).rejects.toThrow('资料已变化');
 });
 it('脚本生成期间采用的咨询入口变化时拒绝旧建议',async()=>{
  const options={budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>{const space=readWorkspace(email);space.customers[0].creatorProfile={version:1,fields:{contactEntry:'改用已确认的新入口'}};writeWorkspace(email,space);return '{"script":"使用旧入口的建议"}';}};
  await expect(generateProductionOutline(email,{...args,format:'video'},options)).rejects.toThrow('资料已变化');
 });
 it('不同制作类型只接收当前空白字段，模型多余返回不会污染草稿',async()=>{
  const options={budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({script:'不应覆盖',hook:'短视频开头',liveOpen:'直播开场',liveClose:'直播结束'})};
  const video=await generateProductionOutline(email,{...args,format:'video',workingFields:{script:'用户正文'}},options);
  expect(video.fields.script).toBe('');expect(video.fields.hook).toBe('短视频开头');expect(video.fields.liveOpen).toBe('');
  const live=await generateProductionOutline(email,{...args,live:true,workingFields:{liveOpen:'用户开场'}},options);
  expect(live.fields.liveOpen).toBe('');expect(live.fields.liveClose).toBe('直播结束');expect(live.fields.hook).toBe('');expect(live.fields.script).toBe('');
  await expect(generateProductionOutline(email,{...args,format:'video'},{...options,chatFn:async()=>'{"liveOpen":"不属于视频"}'})).rejects.toThrow('结果为空');
 });
 it('图文已有逐页文字时，模型多余返回的页方案不会覆盖或写入画面建议',async()=>{
  const result=await generateProductionOutline(email,{...args,format:'image',workingFields:{shots:'用户第一页'}},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({shots:'第1页：画面：厨房；文字：旧内容',cover:'封面建议'})});
  expect(result.fields.shots).toBe('');expect(result.fields.imagePlan).toBe('');expect(result.fields.cover).toBe('封面建议');
 });
 it('制作脚本使用本批参考与当前有效开头，来源变更时不使用旧开头并拒绝在途结果',async()=>{
  const space=readWorkspace(email),customer=space.customers[0],work={id:'w1',customerId:'c1',platform:'小红书',title:'参考标题',description:'参考正文',source:'manual_paste'};
  space.acquisition ||= {};space.acquisition.works=[work];customer.radarHooks={w1:{text:'自己设计的开头',basis:radarHookBasis(customer,work)}};
  customer.drops[0].workReferences=[{workId:'w1',platform:'小红书',title:'快照标题',description:'快照正文',preferredHook:'自己设计的开头'}];writeWorkspace(email,space);
  let captured;const opts={budget:(_e,_c,_p,fn)=>fn(),chatFn:async request=>{captured=request;return '{"script":"建议"}';}};
  await generateProductionOutline(email,{...args,format:'video'},opts);expect(captured.user).toContain('快照正文');expect(captured.user).toContain('自己设计的开头');expect(captured.system).toContain('不照搬');
  const changed=readWorkspace(email);changed.acquisition.works[0].description='新正文';writeWorkspace(email,changed);
  await generateProductionOutline(email,{...args,format:'video'},opts);expect(captured.user).toContain('快照正文');expect(captured.user).not.toContain('自己设计的开头');
  const restored=readWorkspace(email);restored.acquisition.works[0].description='参考正文';writeWorkspace(email,restored);
  await expect(generateProductionOutline(email,{...args,format:'video'},{...opts,chatFn:async()=>{const latest=readWorkspace(email);latest.acquisition.works[0].description='生成途中变更';writeWorkspace(email,latest);return '{"script":"旧结果"}';}})).rejects.toThrow('参考依据已变化');
 });
 it('直播自建打法和小红书图文打法进入对应的脚本生成请求',async()=>{
  saveCreatorPackSettings(email,{customerId:'c1',selected:'',name:'直播答疑',instruction:'先收集观众问题，再逐项回应',platform:'小红书',form:'live'});
  const id=readWorkspace(email).customers[0].creatorPackSettings.custom[0].id;saveCreatorPackSettings(email,{customerId:'c1',selected:id});
  let request;const options={budget:(_e,_c,_p,fn)=>fn(),chatFn:async input=>{request=input;return '{"liveOpen":"开场","script":"正文"}';}};
  await generateProductionOutline(email,{...args,live:true},options);expect(request.user).toContain('直播答疑');expect(request.user).toContain('先收集观众问题');
  await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).toContain('小红书·图文清单');expect(request.user).not.toContain('先收集观众问题');
 });
 it('自建打法限定目标时，只在匹配目标的脚本生成中使用',async()=>{
  saveCreatorPackSettings(email,{customerId:'c1',selected:'',name:'咨询打法',instruction:'回答咨询前的疑问',platform:'小红书',form:'image',goal:'leads'});
  let space=readWorkspace(email),id=space.customers[0].creatorPackSettings.custom[0].id;saveCreatorPackSettings(email,{customerId:'c1',selected:id});
  let request;const options={budget:(_e,_c,_p,fn)=>fn(),chatFn:async input=>{request=input;return '{"script":"建议"}';}};
  await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).toContain('咨询打法');
  space=readWorkspace(email);space.customers[0].growthGoal='reach_leads';writeWorkspace(email,space);
  await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).not.toContain('咨询打法');expect(request.user).toContain('小红书·图文清单');
  expect(()=>saveCreatorPackSettings(email,{customerId:'c1',selected:'',goal:'invalid'})).toThrow('目标');
 });
 it('自建打法限定内容任务时，只在当前任务匹配时生成，未标注不猜测',async()=>{
  saveCreatorPackSettings(email,{customerId:'c1',selected:'',name:'引流打法',instruction:'说明可核实的承接方式',platform:'小红书',form:'image',job:'divert'});
  const id=readWorkspace(email).customers[0].creatorPackSettings.custom[0].id;saveCreatorPackSettings(email,{customerId:'c1',selected:id});
  let request;const options={budget:(_e,_c,_p,fn)=>fn(),chatFn:async input=>{request=input;return '{"script":"建议"}';}};
  await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).not.toContain('引流打法');
  saveProductionDraft(email,{...args,format:'image',version:0,fields:{},job:'divert'});
  await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).toContain('引流打法');
  const draft=readWorkspace(email).customers[0].drops[0].productionDrafts['小红书|0'];saveProductionDraft(email,{...args,format:'image',version:draft.version,fields:draft.fields,job:'convert'});
  await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).not.toContain('引流打法');
  expect(()=>saveCreatorPackSettings(email,{customerId:'c1',selected:'',job:'invalid'})).toThrow('内容任务');
 });
 it('本篇可独立切换打法并持久化，不适用的选择不能静默回退',async()=>{
  saveCreatorPackSettings(email,{customerId:'c1',selected:'',name:'本篇引流',instruction:'先讲清楚承接方式',platform:'小红书',form:'image',job:'divert'});
  const id=readWorkspace(email).customers[0].creatorPackSettings.custom[0].id;
  saveProductionDraft(email,{...args,format:'image',version:0,fields:{},job:'divert',playPackId:id});
  let request;const options={budget:(_e,_c,_p,fn)=>fn(),chatFn:async input=>{request=input;return '{"script":"建议"}';}};
  await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).toContain('本篇引流');
  expect(readWorkspace(email).customers[0].creatorPackSettings.selected).toBe('');
  saveProductionDraft(email,{...args,format:'image',version:1,fields:{},job:'convert'});expect(pack().productionDrafts['小红书|0'].playPackId).toBe(id);
  await expect(generateProductionOutline(email,{...args,format:'image'},options)).rejects.toThrow('不适用于');
  saveProductionDraft(email,{...args,format:'image',version:2,fields:{},job:'convert',playPackId:'off'});await generateProductionOutline(email,{...args,format:'image'},options);expect(request.user).toContain('关闭打法');
  await expect(generateProductionOutline(email,{...args,format:'image'},{...options,chatFn:async()=>{saveProductionDraft(email,{...args,format:'image',version:3,fields:{},job:'convert',playPackId:''});return '{"script":"过期建议"}';}})).rejects.toThrow('已变化');
  expect(()=>saveProductionDraft(email,{...args,format:'image',version:4,fields:{},playPackId:'missing'})).toThrow('不可用');
 });
 it('模型返回结构化分镜时保留原始时间、画面与口播',async()=>{
  const budget=(_email,_customer,_purpose,fn)=>fn();
  const result=await generateProductionOutline(email,{...args,format:'video',workingFields:{script:'量尺寸'}},{budget,chatFn:async()=>JSON.stringify({cover:{text:'先量尺寸'},shots:[{time:'0-3秒',visual:'展示厨房',voiceover:'先了解需求'},{time:'3-8秒',visual:'用尺测量',voiceover:'记录尺寸'},'8-12秒｜记在纸上｜核对尺寸']})});
  expect(result.fields.cover).toBe('先量尺寸');expect(result.fields.shots).toBe('0-3秒｜展示厨房｜先了解需求\n3-8秒｜用尺测量｜记录尺寸\n8-12秒｜记在纸上｜核对尺寸');
 });
 it('图文分离有明确页码和文字标记的模型结果，保留原始画面建议',async()=>{
  const source='第1页\n画面：厨房草图\n文字：先记录使用习惯\n\n第2页\n画面：卷尺\n文字：再量空间尺寸';
  const r=await generateProductionOutline(email,{...args,format:'image'},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({shots:source})});
  expect(r.fields.shots).toBe('先记录使用习惯\n再量空间尺寸');expect(r.fields.imagePlan).toBe(source);const array=await generateProductionOutline(email,{...args,format:'image'},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({shots:[{visual:'厨房草图',text:'先记录需求'},{visual:'卷尺',text:'测量尺寸'}]})});expect(array.fields.shots).toBe('先记录需求\n测量尺寸');expect(array.fields.imagePlan).toContain('厨房草图');const existing=await generateProductionOutline(email,{...args,format:'image',workingFields:{imagePlan:'已有画面建议'}},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({shots:source})});expect(existing.fields.shots).toBe('');expect(existing.warnings[0]).toContain('画面建议已有内容');saveProductionDraft(email,{...args,version:0,format:'image',fields:{shots:r.fields.shots,imagePlan:r.fields.imagePlan}});expect(pack().productionDrafts['小红书|0'].fields.imagePlan).toBe(source);
  const ambiguous='第1页\n文字：核对需求\n画面：不要放进正文';const safe=await generateProductionOutline(email,{...args,format:'image'},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({shots:ambiguous})});expect(safe.fields.shots).toBe('');expect(safe.fields.imagePlan).toBe(ambiguous);
  for(const inline of ['第1页：画面：厨房草图；文字：先测量','第1页：文字：先测量；画面：厨房草图','P2 - 配图：卷尺；文案：记录尺寸','3. 图片：厨房']){const result=await generateProductionOutline(email,{...args,format:'image'},{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({shots:inline})});expect(result.fields.shots).toBe('');expect(result.fields.imagePlan).toBe(inline);}
 });
 it('含画面或排版指令的逐页模型输出只留在画面建议，不直接印到图片',async()=>{
  const options={budget:(_e,_c,_p,fn)=>fn()};
  for(const shots of [['画面：厨房；文字：先量尺寸','第二页文字'],[{text:'页面文字；配色：暖色',visual:'厨房'}],'第1页\n文字：先量尺寸\n配色：暖色','第1页\n文字：先量尺寸；背景：厨房']){
   const result=await generateProductionOutline(email,{...args,format:'image'},{...options,chatFn:async()=>JSON.stringify({shots})});
   expect(result.fields.shots).toBe('');expect(result.fields.imagePlan).toMatch(/画面|配色|背景/);
  }
  const clean=await generateProductionOutline(email,{...args,format:'image'},{...options,chatFn:async()=>JSON.stringify({shots:['文字：先量尺寸','文案：再核对']})});expect(clean.fields.shots).toBe('先量尺寸\n再核对');
 });
 it('事实核对使用当前草稿及业务依据，不改写原稿，资料变化时拒绝旧结论',async()=>{
  let received;const before=packAsSent(pack()).shells.小红书[0].body,fields={title:'厨房如何选',script:'免费上门',shots:'第1页：免费上门',imagePlan:'画面：量尺'};
  const deps={budget:(_e,_c,_p,fn)=>fn(),reviewFn:async(draft,customer)=>{received={draft,customer};return ['第1篇「免费上门」：资料未支持；修改建议：删除'];}};
  const result=await reviewProductionFacts(email,{...args,format:'image',fields},deps);expect(result.issues[0]).toContain('免费上门');expect(received.draft.items[0]).toMatchObject(fields);expect(received.customer.name).toBe('测试');expect(packAsSent(pack()).shells.小红书[0].body).toBe(before);
  await expect(reviewProductionFacts('other@example.com',{...args,format:'image',fields},deps)).rejects.toThrow('找不到');
  await expect(reviewProductionFacts(email,{...args,format:'image',fields:{unexpected:'注入'}},deps)).rejects.toThrow('格式');
  await expect(reviewProductionFacts(email,{...args,format:'image',fields},{...deps,reviewFn:async()=>{const s=readWorkspace(email);s.customers[0].pitch='变更资料';writeWorkspace(email,s);return [];}})).rejects.toThrow('资料已变化');
 });
 it('直播人数校验并保留排期和复盘',()=>{
  expect(()=>saveProductionDraft(email,{...args,version:0,live:true,fields:{liveAttendance:'10',liveRetained:'11'}})).toThrow('不能超过');
  expect(()=>saveProductionDraft(email,{...args,version:0,live:true,fields:{liveSchedule:'2026-02-30T20:00'}})).toThrow('时间');
  expect(()=>saveProductionDraft(email,{...args,version:0,live:true,fields:{liveInquiries:'2',liveQualifiedLeads:'3'}})).toThrow('不能超过');
  expect(()=>saveProductionDraft(email,{...args,version:0,live:true,fields:{liveInquiries:'-1'}})).toThrow('非负整数');
  saveProductionDraft(email,{...args,version:0,live:true,fields:{liveSchedule:'2026-10-30T19:00',liveAttendance:'10',liveRetained:'4',liveInquiries:'5',liveQualifiedLeads:'2',liveReview:'开场需要更具体'}});
  expect(pack().productionDrafts['小红书|0|live'].fields).toMatchObject({liveReview:'开场需要更具体',liveInquiries:'5',liveQualifiedLeads:'2'});
 });
 it('日历改直播时间保留复盘和原稿基准，拒绝旧版本',()=>{
  saveProductionDraft(email,{...args,version:0,live:true,fields:{liveSchedule:'2026-10-30T19:00',liveReview:'复盘'}});
  const before=pack().productionDrafts['小红书|0|live'];
  rescheduleLive(email,{...args,version:1,time:'2026-10-31T20:00'});
  const after=pack().productionDrafts['小红书|0|live'];expect(after.fields.liveReview).toBe('复盘');expect(after.sourceRevision).toBe(before.sourceRevision);expect(after.fields.liveSchedule).toBe('2026-10-31T20:00');
  expect(()=>rescheduleLive(email,{...args,version:1,time:''})).toThrow('已修改');
  expect(()=>rescheduleLive(email,{...args,version:2,time:'2026-02-30T20:00'})).toThrow('时间');
  rescheduleLive(email,{...args,version:2,time:''});expect(pack().productionDrafts['小红书|0|live'].fields.liveSchedule).toBe('');
 });
 it('同一作品的直播与内容草稿独立保存并兼容旧直播数据',()=>{
  const space=readWorkspace(email),p=space.customers[0].drops.find(x=>x.id==='p1');
  p.productionDrafts={'小红书|0':{version:3,live:true,fields:{title:'旧直播',liveSchedule:'2026-10-30T19:00',liveReview:'旧复盘'}}};writeWorkspace(email,space);
  rescheduleLive(email,{...args,version:3,time:'2026-10-31T20:00'});
  saveProductionDraft(email,{...args,version:0,format:'video',fields:{title:'视频标题',script:'视频正文'}});
  expect(pack().productionDrafts['小红书|0'].fields.script).toBe('视频正文');
  expect(pack().productionDrafts['小红书|0|live'].fields).toMatchObject({liveSchedule:'2026-10-31T20:00',liveReview:'旧复盘'});
  saveProductionDraft(email,{...args,version:4,live:true,fields:{title:'直播标题',liveReview:'新复盘'}});
  expect(pack().productionDrafts['小红书|0'].fields.script).toBe('视频正文');
  expect(()=>saveProductionDraft(email,{...args,version:4,live:true,fields:{}})).toThrow('已修改');
 });
 it('工作室文案先暂存供核对，采用时保留原文格式和历史发布快照',()=>{
  saveProductionDraft(email,{...args,version:0,format:'video',fields:{title:'旧标题',script:'原文'}});
  const source={...args,draftVersion:1,sourceRevision:pack().productionDrafts['小红书|0'].sourceRevision,basisRevision:pack().productionDrafts['小红书|0'].basisRevision};
  setContentState(email,{packId:'p1',keys:['p1::小红书|0|title'],status:'published'});
  const input={source,title:'新标题',body:'第一段\n\n第二段',tagsText:'#装修 #攻略',studioPlatform:'xiaohongshu',kind:'video'};
  stageStudioReturn(email,input);let p=pack();expect(packAsSent(p).shells.小红书[0].title).toBe(content.title);
  const id=p.studioReturnDrafts['小红书|0'].id;applyStudioReturn(email,{...args,draftId:id,action:'apply'});p=pack();
  expect(packAsSent(p).shells.小红书[0]).toMatchObject({title:'新标题',body:'第一段\n\n第二段\n\n#装修 #攻略'});
  expect(p.productionApplyHistory['小红书|0'][0].content.title).toBe(content.title);expect(readWorkspace(email).contentStates['p1::小红书|0|title'].status).toBe('selected');
  expect(()=>stageStudioReturn(email,input)).toThrow('已变化');
 });
 it('拒绝跨业务、跨平台、形式不匹配及过期的工作室回传',()=>{
  saveProductionDraft(email,{...args,version:0,format:'video',fields:{title:'旧标题',script:'原文'}});const source={...args,draftVersion:1,sourceRevision:pack().productionDrafts['小红书|0'].sourceRevision,basisRevision:pack().productionDrafts['小红书|0'].basisRevision};
  const input={source,title:'标题',body:'正文',studioPlatform:'xiaohongshu',kind:'video'};
  expect(()=>stageStudioReturn('other@example.com',input)).toThrow('找不到');expect(()=>stageStudioReturn(email,{...input,studioPlatform:'douyin'})).toThrow('不一致');expect(()=>stageStudioReturn(email,{...input,kind:'image'})).toThrow('不一致');
  stageStudioReturn(email,input);const id=pack().studioReturnDrafts['小红书|0'].id;editLine(email,'p1','小红书|0|title','其他编辑');expect(()=>applyStudioReturn(email,{...args,draftId:id,action:'apply'})).toThrow('已变化');
  applyStudioReturn(email,{...args,draftId:id,action:'discard'});expect(pack().studioReturnDrafts['小红书|0']).toBeUndefined();
 });
 it('采用未改变的工作室文案不会取消已有发布状态',()=>{
  saveProductionDraft(email,{...args,version:0,format:'video',fields:{title:content.title,script:content.body}});const source={...args,draftVersion:1,sourceRevision:pack().productionDrafts['小红书|0'].sourceRevision,basisRevision:pack().productionDrafts['小红书|0'].basisRevision};
  setContentState(email,{packId:'p1',keys:['p1::小红书|0|title'],status:'published'});
  stageStudioReturn(email,{source,title:content.title,body:content.body,studioPlatform:'xiaohongshu',kind:'video'});const id=pack().studioReturnDrafts['小红书|0'].id;
  applyStudioReturn(email,{...args,draftId:id,action:'apply'});expect(readWorkspace(email).contentStates['p1::小红书|0|title'].status).toBe('published');
 });
 it('工作室交接后业务资料发生变化时拒绝回传或采用',()=>{
  saveProductionDraft(email,{...args,version:0,format:'video',fields:{title:'标题',script:'正文'}});const d=pack().productionDrafts['小红书|0'],source={...args,draftVersion:1,sourceRevision:d.sourceRevision,basisRevision:d.basisRevision},input={source,title:'新标题',body:'新正文',studioPlatform:'xiaohongshu',kind:'video'};
  let s=readWorkspace(email);s.customers[0].pitch='新的业务资料';writeWorkspace(email,s);expect(()=>stageStudioReturn(email,input)).toThrow('业务资料已变化');
  s=readWorkspace(email);delete s.customers[0].pitch;writeWorkspace(email,s);stageStudioReturn(email,input);const id=pack().studioReturnDrafts['小红书|0'].id;
  s=readWorkspace(email);s.customers[0].pitch='再次变更';writeWorkspace(email,s);expect(()=>applyStudioReturn(email,{...args,draftId:id,action:'apply'})).toThrow('已变化');
 });
 it('制作草稿按作品隔离并保留原稿基准，过期版本不覆盖',()=>{
  const fields={script:'口播',shots:'镜头',title:'标题',cover:'封面',liveOpen:'开场'};
  saveProductionDraft(email,{...args,version:0,fields,live:true});
  const saved=pack().productionDrafts['小红书|0|live'];expect(saved.fields.liveOpen).toBe('开场');expect(saved.sourceContent.title).toBe(content.title);
  expect(packAsSent(pack()).shells.小红书[0].title).toBe(content.title);
  expect(()=>saveProductionDraft(email,{...args,version:0,fields,live:true})).toThrow('已修改');
  expect(()=>saveProductionDraft('other@example.com',{...args,version:0,fields})).toThrow('找不到');
  expect(productionIssues(fields,true)).toContain('请补充直播段落与证据');
  expect(productionIssues(fields,false)).toEqual([]);
  expect(productionIssues(fields,false,'抖音',null,'image')).toContain('缺少封面排版说明');
  const warnings=productionIssues({...fields,liveOpen:'大家好',liveSegments:'效果保证有效',liveInteraction:'你觉得呢',liveClose:'结束'},true,'小红书',{forbidden:['保证有效']});
  expect(warnings.some(w=>w.includes('保证有效'))).toBe(true);
 });
 it('制作检查覆盖当前开场、收尾和画面说明，也检查业务禁用词',()=>{
  const base={title:'标题',cover:'封面',coverLayout:'纯色排版',script:'正文',shots:'镜头',hook:'开场',cta:'结束',imagePlan:'画面'};
  for(const key of ['hook','cta','coverLayout','imagePlan']) {
    const issues=productionIssues({...base,[key]:'保证有效'},false,'小红书',{forbidden:['保证有效']});
    expect(issues.some(v=>v.includes('保证有效'))).toBe(true);
  }
  for(const key of ['hook','cta','cover']) expect(productionIssues({...base,[key]:'加微信'},false,'小红书').some(v=>v.includes('站外'))).toBe(true);
 });
 it('自建、切换和移除打法，不改历史效果中的打法快照',()=>{
  saveCreatorPackSettings(email,{customerId:'c1',selected:'',name:'我的打法',instruction:'用具体场景',platform:'小红书',form:'guide'});
  const id=readWorkspace(email).customers[0].creatorPackSettings.custom[0].id;
  saveCreatorPackSettings(email,{customerId:'c1',selected:id});
  expect(readWorkspace(email).customers[0].creatorPackSettings.selected).toBe(id);
  expect(()=>saveCreatorPackSettings('other@example.com',{customerId:'c1',selected:id})).toThrow('没有这个客户');
  saveCreatorPackSettings(email,{customerId:'c1',selected:id,removeId:id});
  const settings=readWorkspace(email).customers[0].creatorPackSettings;expect(settings.custom).toEqual([]);expect(settings.selected).toBe('');
 });
 it('复盘记忆来自真实效果记录，明确采用后可停用',()=>{
  saveOutcomes(email,{...args,rows:[outcome()]});const row=pack().outcomes['小红书|0'][0];
  expect(()=>creatorMemoryAction(email,{...args,action:'adopt',outcomeId:'missing'})).toThrow('找不到');
  creatorMemoryAction(email,{...args,action:'adopt',outcomeId:row.id});creatorMemoryAction(email,{...args,action:'adopt',outcomeId:row.id});
  let c=readWorkspace(email).customers[0];expect(c.creatorMemories).toHaveLength(1);expect(c.creatorMemories[0].source).toContain('平台后台截图');
  creatorMemoryAction(email,{customerId:'c1',action:'retire',memoryId:c.creatorMemories[0].id});c=readWorkspace(email).customers[0];expect(c.creatorMemories[0].active).toBe(false);
 });
 it('效果账号必须属于当前业务及平台',()=>{
  const s=readWorkspace(email);s.acquisition={accounts:[{id:'a',customerId:'c1',platform:'小红书',name:'账号'}]};writeWorkspace(email,s);
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),accountId:'wrong'}]})).toThrow('账号');
  saveOutcomes(email,{...args,rows:[{...outcome(),accountId:'a'}]});expect(pack().outcomes['小红书|0'][0].accountName).toBe('账号');
 });
 it('效果关联已发布快照，即使当前文案和打法随后变化',()=>{
  let s=readWorkspace(email);s.customers[0].drops[0].creatorPacks=[{id:'a',name:'旧打法',version:1}];writeWorkspace(email,s);
  saveAccount(email,{customerId:'c1',platform:'小红书',name:'账号一'});const accountId=readWorkspace(email).acquisition.accounts[0].id;
  preparePublication(email,{...args,accountId});const pub=readWorkspace(email).acquisition.publications[0];confirmPublication(email,{publicationId:pub.id,confirmed:true,url:'https://example.com/post/1',publishedAt:'2026-01-01T00:00:00Z'});
  editLine(email,'p1','小红书|0|title','发布后的新标题');s=readWorkspace(email);s.customers[0].drops[0].creatorPacks=[{id:'b',name:'新打法',version:2}];writeWorkspace(email,s);
  saveOutcomes(email,{...args,rows:[{...outcome(),publicationId:pub.id}]});const record=pack().outcomes['小红书|0'][0];
  expect(record).toMatchObject({publicationId:pub.id,accountId,content:{title:content.title},creatorPack:{name:'旧打法',version:1}});
  saveAccount(email,{customerId:'c1',platform:'小红书',name:'账号二'});const other=readWorkspace(email).acquisition.accounts.find(a=>a.name==='账号二').id;
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),publicationId:pub.id,accountId:other}]})).toThrow('不一致');
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),publicationId:'missing'}]})).toThrow('发布记录');
 });
 it('手工新建作品也可以记录效果，未关联发布时明确保留当前文案快照',()=>{
  const created=createProductionContent(email,{customerId:'c1',platform:'抖音',title:'手工短视频'});
  saveOutcomes(email,{customerId:'c1',packId:created.packId,rows:[{...outcome(),platform:'抖音'}]});
  const p=readWorkspace(email).customers[0].drops.find(x=>x.id===created.packId),row=p.outcomes['抖音|0'][0];expect(row).toMatchObject({publicationId:'',content:{title:'手工短视频'}});
 });
 it('创作者资料版本隔离、可撤回且不丢失历史',()=>{
  saveCreatorProfile(email,{customerId:'c1',version:0,fields:{voice:'短句'}});
  expect(()=>saveCreatorProfile(email,{customerId:'c1',version:0,fields:{}})).toThrow('已被修改');
  expect(()=>saveCreatorProfile('other@example.com',{customerId:'c1',version:0,fields:{}})).toThrow('没有这个客户');
  expect(()=>saveCreatorProfile(email,{customerId:'c1',version:1,fields:{unknown:'x'}})).toThrow();
  saveCreatorProfile(email,{customerId:'c1',version:1,fields:{}});
  const c=readWorkspace(email).customers[0];expect(c.creatorProfile.fields.voice).toBe('');expect(c.creatorProfileHistory.at(-1).fields.voice).toBe('短句');
 });
 it('创作标准按业务隔离并保留版本，过期保存不会覆盖新标准',()=>{
  saveCreationStandards(email,{customerId:'c1',version:0,preferences:'简洁口语',forbidden:'保证有效\n必胜\n保证有效'});
  let c=readWorkspace(email).customers[0];
  expect(c.creationStandards.forbidden).toEqual(['保证有效','必胜']);
  expect(standardsBrief(c)).toContain('简洁口语');
  expect(standardHits({title:'保证有效',body:'内容'},c.creationStandards)).toEqual(['保证有效']);
  expect(()=>saveCreationStandards(email,{customerId:'c1',version:0})).toThrow('已被修改');
  expect(()=>saveCreationStandards('other@example.com',{customerId:'c1',version:0})).toThrow('没有这个客户');
  saveCreationStandards(email,{customerId:'c1',version:1,preferences:'更具体',forbidden:''});
  c=readWorkspace(email).customers[0];expect(c.creationStandardsHistory.at(-1).preferences).toBe('简洁口语');expect(c.creationStandards.version).toBe(2);
 });
 it('目标、条件与事实改变后缓存失效，旧批目标不改写',()=>{
  const c=readWorkspace(email).customers[0], before=researchFingerprint(c,{});
  const next=saveGrowthSettings(email,{customerId:'c1',goal:'sales',criteria:'成交厨房产品'}).customers[0];
  expect(researchFingerprint(next,{})).not.toBe(before);expect(next.drops[0].origin.goal).toBe('reach');
  expect(growthGoal({})).toBe('leads');
  const both=saveGrowthSettings(email,{customerId:'c1',goal:'reach_leads',criteria:'观察真实流量与有效咨询'}).customers[0];expect(growthGoal(both)).toBe('reach_leads');
  expect(()=>saveGrowthSettings(email,{customerId:'c1',goal:'__proto__'})).toThrow('目标');
 });
 it('账号隔离，跨客户与伪造篇目不能写入',()=>{
  expect(()=>saveOutcomes('other@example.com',{...args,rows:[outcome()]})).toThrow('找不到');
  expect(()=>saveOutcomes(email,{...args,customerId:'other',rows:[outcome()]})).toThrow('找不到');
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),index:-1}]})).toThrow('找不到');
  expect(pack().outcomes).toBeUndefined();
 });
 it('导入全量校验后才落盘，未知与零不同且重叠窗口不相加',()=>{
  expect(()=>saveOutcomes(email,{...args,rows:[outcome(),{...outcome(),index:10}]})).toThrow();expect(pack().outcomes).toBeUndefined();
  saveOutcomes(email,{...args,rows:[outcome()]});saveOutcomes(email,{...args,rows:[{...outcome(),metrics:{views:20,shares:null}}]});
  const rows=pack().outcomes['小红书|0'];expect(rows).toHaveLength(2);expect(rows[0].metrics).toEqual({views:20});expect(rows[1].metrics.views).toBe(0);
  expect(outcomeAssessment('reach',rows[1]).text).toContain('：0');expect(outcomeAssessment('sales',rows[1]).text).toContain('待验证');
 });
 it.each([{views:-1},{views:1.2},{views:'1'},{views:Infinity},{wrong:3}])('拒绝异常指标 %j',metrics=>expect(()=>validateOutcome({...outcome(),metrics})).toThrow());
 it('完播率按平台百分数记录，不推算播放次数，并校验范围',()=>{
  for(const rate of [0,36.75,100])expect(validateOutcome({...outcome(),metrics:{completionRate:rate}}).metrics).toEqual({completionRate:rate});
  for(const rate of [-1,100.01,Infinity,'30'])expect(()=>validateOutcome({...outcome(),metrics:{completionRate:rate}})).toThrow('完播率');
 });
 it('拒绝无效日期、未来日期、无依据的基线、未定义归因和重复篇目',()=>{
  for(const update of [{start:'2026-02-30'},{end:'2999-01-01'},{baseline:10},{metrics:{qualifiedLeads:2}},{metrics:{orders:1}}])expect(()=>validateOutcome({...outcome(),...update})).toThrow();
  expect(()=>saveOutcomes(email,{...args,rows:[outcome(),outcome()]})).toThrow('重复');
  expect(outcomeAssessment('reach',{metrics:{views:1},baseline:0}).text).not.toContain('Infinity');
  expect(outcomeAssessment('reach_leads',{metrics:{views:100,qualifiedLeads:3},baseline:2}).text).toContain('阅读 / 播放：100；有效客资（已去重）：3');
  expect(outcomeAssessment('reach_leads',{metrics:{views:100},baseline:2}).text).toContain('有效客资：未记录');
  expect(outcomeAssessment('reach_leads',{metrics:{qualifiedLeads:0},baseline:0}).text).toContain('阅读 / 播放：未记录');
  expect(outcomeAssessment('reach_leads',{metrics:{}}).text).toContain('待验证');
 });
 it('双目标的流量与客资基线分别校验、保存和比较',()=>{
  for(const value of [-1,1.2,'5',Infinity]) expect(()=>validateOutcome({...outcome(),baselineViews:value,baselineViewsNote:'同平台同周期'})).toThrow('播放基线');
  expect(()=>validateOutcome({...outcome(),baselineViews:5})).toThrow('播放基线');
  const row=validateOutcome({...outcome(),metrics:{views:100,qualifiedLeads:3},criteria:'去重',baseline:2,baselineNote:'同平台同周期',baselineViews:40,baselineViewsNote:'同平台同周期'});
  expect(row.baselineViews).toBe(40);expect(row.baselineViewsNote).toBe('同平台同周期');
  const result=outcomeAssessment('reach_leads',row).text;expect(result).toContain('阅读 / 播放相对同口径基线：2.50 倍');expect(result).toContain('有效客资相对同口径基线：1.50 倍');
  const zero=outcomeAssessment('reach_leads',{metrics:{views:0,qualifiedLeads:0},baseline:0,baselineViews:0}).text;expect(zero).toContain('阅读 / 播放基线为零');expect(zero).not.toContain('Infinity');
  expect(outcomeAssessment('reach_leads',{metrics:{qualifiedLeads:3},baselineViews:10}).text).toContain('阅读 / 播放未记录，不比较基线');
  saveOutcomes(email,{...args,rows:[{...outcome(),...row}]});expect(pack().outcomes['小红书|0'][0].baselineViews).toBe(40);
 });
 it('保存效果时拒绝目标变化造成的错误基线口径',()=>{
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),baselineMetric:'qualifiedLeads'}]})).toThrow('复盘目标已变化');
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),baselineMetric:'views',outcomeGoal:'reach_leads'}]})).toThrow('复盘目标已变化');
  saveOutcomes(email,{...args,rows:[{...outcome(),baselineMetric:'views',outcomeGoal:'reach'}]});
  expect(pack().outcomes['小红书|0'][0].goal).toBe('reach');
 });
 it('效果保存时保留实际编辑版本，后来的改稿不覆盖快照',()=>{
  editLine(email,'p1','小红书|0|body','编辑后的可见正文。');saveOutcomes(email,{...args,rows:[outcome()]});
  editLine(email,'p1','小红书|0|body','第二次编辑。');expect(pack().outcomes['小红书|0'][0].content.body).toBe('编辑后的可见正文。');
 });
 it('事实保存有历史，待确认不会冒充确认',()=>{
  const cards=[{text:'仅在杭州提供服务',source:'业务负责人确认',status:'pending'}];
  saveFactCards(email,{customerId:'c1',cards});saveFactCards(email,{customerId:'c1',cards:[{...cards[0],status:'confirmed'}]});
  const c=readWorkspace(email).customers[0];expect(c.factHistory.at(-1).cards[0].status).toBe('pending');expect(c.factCards[0].status).toBe('confirmed');
 });
});
describe('单篇改写的并发与版本',()=>{
 it('候选先保存，采用后才能改变正文，恢复保留版本且发布状态回到待发布',async()=>{
  const space=readWorkspace(email);space.contentStates['p1::小红书|0|body']={status:'published',publishedAt:'2026-01-01'};writeWorkspace(email,space);
  await preparePostRewrite(email,{...args,instruction:'开头具体一些'},async()=>candidate);
  expect(packAsSent(pack()).shells.小红书[0].body).toBe(content.body);
  applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
  expect(packAsSent(pack()).copies.A[0]).toBe(candidate.content.body);expect(readWorkspace(email).contentStates['p1::小红书|0|body'].status).toBe('selected');
  applyPostVersion(email,{...args,restoreId:pack().postVersions['小红书|0'][0].id});
  expect(packAsSent(pack()).shells.小红书[0].body).toBe(content.body);expect(pack().postVersions['小红书|0']).toHaveLength(2);
 });
 it('生成期间的人工改稿不会被候选覆盖；失败后锁被释放',async()=>{
  let release;const pending=preparePostRewrite(email,{...args,instruction:'更具体'},()=>new Promise(resolve=>release=resolve));
  await expect(preparePostRewrite(email,{...args,instruction:'再次改'},async()=>candidate)).rejects.toThrow('正在改写');
  editLine(email,'p1','小红书|0|body','用户新定稿。');release(candidate);await expect(pending).rejects.toThrow('原文已修改');
  await preparePostRewrite(email,{...args,instruction:'基于新稿'},async()=>candidate);expect(pack().rewriteDrafts).toBeTruthy();
 });
 it('采用前再次检查原文版本，不覆盖后来的编辑',async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>candidate);const id=pack().rewriteDrafts['小红书|0'].id;
  editLine(email,'p1','小红书|0|title','用户的新标题');expect(()=>applyPostVersion(email,{...args,draftId:id})).toThrow('原文已变化');
 });
 it('模型等待期间其他目标修改不会丢失',async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>{saveGrowthSettings(email,{customerId:'c1',goal:'sales'});return candidate;});
  expect(readWorkspace(email).customers[0].growthGoal).toBe('sales');expect(postRevision(pack(),'小红书',0)).toHaveLength(64);
 });
 it('事实摘录等待期间资料变化时拒绝旧结果',async()=>{
  await expect(proposeFactCards(email,{customerId:'c1'},async()=>{saveFactCards(email,{customerId:'c1',cards:[{text:'新确认的服务范围',source:'负责人',status:'confirmed'}]});return {cards:[]};})).rejects.toThrow('资料或事实已变化');
 });
});

it('候选准备完成后业务事实变化，采用时必须重新核对',async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>candidate);
  const draftId=pack().rewriteDrafts['小红书|0'].id;
  saveFactCards(email,{customerId:'c1',cards:[{text:'业务已变更，不再提供此服务',source:'负责人',status:'confirmed'}]});
  expect(()=>applyPostVersion(email,{...args,draftId})).toThrow('业务资料已更新');
});

it('历史恢复不能绕过业务资料变更检查，也不能恢复缺少资料基准的旧版本', async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>candidate);
  applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
  const versionId=pack().postVersions['小红书|0'][0].id;
  saveFactCards(email,{customerId:'c1',cards:[{text:'不再提供厨房翻新服务',source:'负责人',status:'confirmed'}]});
  expect(()=>applyPostVersion(email,{...args,restoreId:versionId})).toThrow('业务资料已变化');
  expect(packAsSent(pack()).shells.小红书[0].body).toBe(candidate.content.body);
  expect(pack().postVersions['小红书|0']).toHaveLength(1);
  const space=readWorkspace(email); delete space.customers[0].drops[0].postVersions['小红书|0'][0].basisRevision; writeWorkspace(email,space);
  expect(()=>applyPostVersion(email,{...args,restoreId:versionId})).toThrow('无法核对');
});

it('重复事实整理不会重复调用模型，模型失败后可以重试',async()=>{
  let reject;
  const pending=proposeFactCards(email,{customerId:'c1'},()=>new Promise((resolve,no)=>{reject=no;}));
  let called=false;
  await expect(proposeFactCards(email,{customerId:'c1'},async()=>{called=true;return {cards:[]};})).rejects.toThrow('正在整理');
  expect(called).toBe(false);
  reject(new Error('network failure')); await expect(pending).rejects.toThrow('network failure');
  await proposeFactCards(email,{customerId:'c1'},async()=>({cards:[],coverage:'test',context:'test'}));
  expect(readWorkspace(email).customers[0].factExtraction.coverage).toBe('test');
});

 it('在资料变化后改写，旧正文不会被重新标记为基于最新资料', async()=>{
  saveFactCards(email,{customerId:'c1',cards:[{text:'新服务范围仅限杭州余杭',source:'负责人',status:'confirmed'}]});
  await preparePostRewrite(email,{...args,instruction:'改成新服务范围'},async()=>candidate);
  applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
  const old=pack().postVersions['小红书|0'][0];
  expect(old.basisRevision).toBeNull();
  expect(()=>applyPostVersion(email,{...args,restoreId:old.id})).toThrow('无法核对');
 });

it('适用范围与归因说明过长时明确拒绝，不静默清空后保存',()=>{
  expect(()=>saveFactCards(email,{customerId:'c1',cards:[{text:'杭州限定服务',source:'负责人',status:'confirmed',scope:'甲'.repeat(501)}]})).toThrow('最多500字');
  expect(readWorkspace(email).customers[0].factCards).toBeUndefined();
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),note:'甲'.repeat(1001)}]})).toThrow('1000字');
  expect(pack().outcomes).toBeUndefined();
});

it('产品改写使用所选资料，产品更新后不能采用或恢复旧候选',async()=>{
 const {commerceAction}=await import('./commerce-workspace.mjs');const {productScope}=await import('./product-scope.mjs');
 commerceAction(email,{action:'product',customerId:'c1',name:'阅读灯',facts:'适合书桌，插座供电',source:'说明书'});
 let s=readWorkspace(email);const p=s.acquisition.products[0];s.customers[0].drops[0].productScope=productScope(s,'c1',{productIds:[p.id]});writeWorkspace(email,s);
 let received;await preparePostRewrite(email,{...args,instruction:'调整表达'},async(_pack,c)=>{received=c;return candidate;});
 expect(received.salesMaterial).toContain('插座供电');expect(received.sourceMaterial).not.toContain('厨房');expect(received.factCards).toEqual([]);
 const draftId=pack().rewriteDrafts['小红书|0'].id;
 commerceAction(email,{action:'product',customerId:'c1',id:p.id,baseRevision:p.revision,name:p.name,facts:'新参数',source:'新版说明书'});
 expect(()=>applyPostVersion(email,{...args,draftId})).toThrow('业务资料已更新');
 await preparePostRewrite(email,{...args,instruction:'依据新版'},async()=>candidate);applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
 expect(()=>applyPostVersion(email,{...args,restoreId:pack().postVersions['小红书|0'][0].id})).toThrow('无法核对');
});
it('标题候选基于当前制作稿生成并去重，期间依据变化不得返回旧建议',async()=>{
 const input={...args,format:'video',titleIdeas:true,workingFields:{title:'现有标题',script:'先核对房屋结构资料'}},budget=(_e,_c,_p,fn)=>fn();let request;
 const result=await generateProductionOutline(email,input,{budget,chatFn:async p=>{request=p;return JSON.stringify({titles:['先看结构图','先看结构图','怎样判断这面墙','现场先核对什么']});}});expect(result).toEqual({titles:['先看结构图','怎样判断这面墙','现场先核对什么']});expect(request.user).toContain('先核对房屋结构资料');expect(pack().productionDrafts).toBeUndefined();
 await expect(generateProductionOutline(email,input,{budget,chatFn:async()=>'{"titles":[]}'})).rejects.toThrow('没有生成可用标题');await expect(generateProductionOutline(email,input,{budget,chatFn:async()=>{editLine(email,'p1','小红书|0|title','另一标题');return '{"titles":["旧标题"]}';}})).rejects.toThrow('原稿已变化');
});
