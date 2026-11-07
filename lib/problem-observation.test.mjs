import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace,publicWorkspace} from './workspace.mjs';
import {observationAction} from './problem-observation.mjs';
import {observationCatalog,observationSample,problemSource,problemFeedback} from './problem-observation-data.mjs';
import {topicBoardAction} from './topic-board.mjs';import {topicBoardRows} from './topic-board-data.mjs';
import {generateProductionOutline,reviewProductionFacts} from './growth-workspace.mjs';
import {isResearchComment} from '../js/evidence-kind.js';
import {painSignals,clusterPains} from './pain-clusters.mjs';
import {expandKeywordBatch} from './keyword-expand.mjs';
const email='observation@example.test',root=process.cwd();let dir;
const get=()=>readWorkspace(email),c=()=>get().customers[0],call=(action,rest={},deps={})=>observationAction(email,{customerId:'c1',action,...rest},deps);
const problem=()=>c().observedProblems[0];
const proposal={question:'报价是否含安装？',reader:'正在对比报价的人',situation:'购买前看不懂包含项',whyNow:'准备确认报价',coreAnswer:'先确认安装是否包含在报价内',takeaway:'能核对安装项目',evidence:[{id:'signal:s1',quote:'报价包含安装吗？'}],answerEvidence:[{id:'fact:f1',quote:'报价单列出安装项目与费用'}],angles:[{type:'judgment',title:'报价签字前先核对安装项',reason:'有报价条款支持'}]};
const model={modelReady:true,budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>JSON.stringify({problems:[proposal]})};
const review=(p=problem())=>call('review',{id:p.id,version:p.version,reader:p.reader,whyNow:p.whyNow,coreAnswer:p.coreAnswer,takeaway:p.takeaway,answerIds:['fact:f1'],boundaries:'仅限本业务报价流程',confirmed:true});
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-observation-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'家装',hunt:'家装',pitch:'本地厨房改造',drops:[],packs:[],factCards:[{id:'f1',text:'报价单列出安装项目与费用',status:'confirmed',source:'报价流程'},{id:'f2',text:'未核实的宣传',status:'pending'}]},{id:'c2',name:'别人的业务'}],acquisition:{works:[{id:'w1',customerId:'c1',platform:'抖音',title:'报价说明',description:'同行观点'}],signals:[{id:'s1',customerId:'c1',workId:'w1',recordId:'r1',platform:'抖音',text:'报价包含安装吗？',authorId:'a1'},{id:'s2',customerId:'c2',text:'别人的原话'}],leads:[{id:'l1',customerId:'c1',messages:[{id:'m1',direction:'inbound',text:'私有原话不送模型 电话13812345678'}]}]}}));
it('isolates business data, private inbound text and unconfirmed facts',async()=>{
 const catalog=observationCatalog(c(),get().acquisition);expect(JSON.stringify(catalog)).not.toContain('私有原话');expect(catalog.some(s=>s.id==='fact:f2')).toBe(false);expect(catalog.some(s=>s.id==='signal:s2')).toBe(false);
 await expect(observationAction('other@example.test',{customerId:'c1',action:'view'})).rejects.toThrow('找不到');
 await call('discover',{}, {...model,chatFn:async request=>{expect(request.user).not.toContain('私有原话');expect(request.user).not.toContain('别人的原话');return JSON.stringify({problems:[proposal]});}});
 expect(problem().stats).toMatchObject({records:1,knownAccounts:1,works:1});expect(publicWorkspace(get()).customers[0].problemObservation.problems).toHaveLength(1);
});
it('deduplicates repeated acquisition records, retains independent identical statements, balances work samples',()=>{
 const signal=get().acquisition.signals[0],signals=[signal,{...signal,id:'copy'},{...signal,id:'s3',recordId:'r3',authorId:'a3'}];expect(painSignals(signals)).toHaveLength(2);
 const a={...get().acquisition,signals};expect(observationCatalog(c(),a).filter(s=>s.kind==='external')).toHaveLength(2);
 const sample=observationSample([...Array.from({length:50},(_,i)=>({id:'a'+i,kind:'external',workId:'a'})),{id:'b',kind:'external',workId:'b'},{id:'customer',kind:'customer'}],6);expect(sample.map(s=>s.id)).toContain('b');expect(sample.map(s=>s.id)).toContain('customer');
});
it('only treats an excluded lead as research when explicitly preserved, and never restores fake or unverified sources',async()=>{
 let space=get();space.acquisition.signals[0].status='excluded';writeWorkspace(email,space);expect(isResearchComment(get().acquisition.signals[0])).toBe(false);
 await call('research-use',{id:'s1',expectedUse:'',use:'include',note:'不在服务地区，但报价问题有参考价值'});expect(isResearchComment(get().acquisition.signals[0],get().acquisition.works)).toBe(true);expect(get().acquisition.signals[0].status).toBe('excluded');
 await expect(call('research-use',{id:'s1',expectedUse:'',use:'exclude',note:'旧窗口'})).rejects.toThrow('变化');
 space=get();space.acquisition.signals[0].sourceType='search_summary';writeWorkspace(email,space);await expect(call('research-use',{id:'s1',expectedUse:'include',use:'include',note:'试图恢复摘要'})).rejects.toThrow('回源');
});
it('rejects invented citations, competitor answers, and unsupported claims instead of certifying a demand',async()=>{
 await call('discover',{}, {...model,chatFn:async()=>JSON.stringify({problems:[{...proposal,evidence:[{id:'signal:s2',quote:'别人的原话'},{id:'signal:s1',quote:'伪造原话'}],answerEvidence:[{id:'work:w1',quote:'同行观点'},{id:'fact:f2',quote:'未核实的宣传'}]}]})});
 expect(problem()).toMatchObject({status:'explore',coreAnswer:'',evidence:[],answerEvidence:[]});expect(problem().review).toBeNull();
 await expect(topicBoardAction(email,{customerId:'c1',action:'create',kind:'problem',sourceKey:problem().id+'|judgment'})).rejects.toThrow('核对');
});
it('review, topic, generation snapshot and changed source protection run end to end',async()=>{
 await call('discover',{},model);await review();const id=problem().id;
 await topicBoardAction(email,{customerId:'c1',action:'create',kind:'problem',sourceKey:id+'|judgment',platform:'抖音',format:'video',goal:'leads'});
 let row=topicBoardRows(c(),get().acquisition)[0];await topicBoardAction(email,{customerId:'c1',action:'generate',id:row.id,version:row.version,basis:row.basis},{generate:async()=>({fields:{script:'核对安装项',shots:'展示报价单'},warnings:[]})});
 const pack=c().drops[0];expect(pack.topicSnapshot.source).toMatchObject({problemId:id,coreAnswer:proposal.coreAnswer});expect(pack.topicSnapshot.source.answerEvidence[0].id).toBe('fact:f1');
 const space=get();space.customers[0].factCards[0].text='安装流程已改';writeWorkspace(email,space);
 expect(problemSource(c(),get().acquisition,id+'|judgment')).toBeNull();expect(topicBoardRows(c(),get().acquisition)[0].sourceCurrent).toBe(false);
 await expect(generateProductionOutline(email,{customerId:'c1',packId:pack.id,platform:'抖音',index:0,format:'video'},{chatFn:async()=>'{"script":"旧来源"}',budget:(_e,_c,_p,fn)=>fn()})).rejects.toThrow('依据已变化');expect(c().drops[0].topicSnapshot.source.coreAnswer).toBe(proposal.coreAnswer);
});
it('preserves stable IDs across discovery and protects concurrent edits, failures and old reviews',async()=>{
 await call('discover',{},model);const id=problem().id;await review();
 await call('discover',{}, {...model,chatFn:async()=>JSON.stringify({problems:[{...proposal,previousProblemId:id,question:'换一种问法'}]})});expect(c().observedProblems).toHaveLength(1);expect(problem().id).toBe(id);expect(problem().review).toBeNull();expect(problem().history).toHaveLength(1);
 const before=problem();await expect(call('discover',{}, {...model,chatFn:async()=>{await call('note',{kind:'service',text:'服务现场有新问题',source:'现场记录',confirmed:true});return JSON.stringify({problems:[proposal]});}})).rejects.toThrow('期间');expect(problem()).toEqual(before);
 await expect(call('discover',{}, {...model,chatFn:async()=>'{broken'})).rejects.toThrow('格式');expect(problem()).toEqual(before);
});
it('cold start remains exploration; missing model does not fabricate a core answer or frequency',async()=>{
 await call('discover',{}, {modelReady:false});expect(problem().coreAnswer).toBe('');expect(c().observationRuns[0].method).toContain('未调用模型');
 const space=get();space.acquisition.signals=[];space.acquisition.works=[];space.customers[0].observedProblems=[];writeWorkspace(email,space);await call('discover',{}, {modelReady:false});expect(problem()).toMatchObject({status:'explore',evidence:[]});expect(problem().answerEvidence).toHaveLength(1);
});
it('records, settings, answer supplementation, archive and merge are versioned and reversible',async()=>{
 await call('settings',{version:0,seeds:'厨房改造\n报价',scope:'本地消费者',exclude:'招聘',nextReview:'2026-11-20'});await expect(call('settings',{version:0})).rejects.toThrow('变化');
 await call('note',{kind:'answer',text:'安装项逐一核对',source:'报价单',confirmed:true});const n=c().observationNotes[0];await call('archive-note',{id:n.id,version:1});expect(observationCatalog(c(),get().acquisition).some(s=>s.id==='note:'+n.id)).toBe(false);await call('archive-note',{id:n.id,version:2});
 await call('discover',{}, {...model,chatFn:async()=>JSON.stringify({problems:[proposal,{...proposal,question:'另一种疑问',evidence:[]} ]})});const [one,two]=c().observedProblems;
 await call('merge',{id:two.id,version:two.version,targetId:one.id,targetVersion:one.version});expect(c().observedProblems[1].mergedInto).toBe(one.id);expect(problem().review).toBeNull();
 await call('archive',{id:one.id,version:problem().version});expect(problem().archived).toBe(true);await call('archive',{id:one.id,version:problem().version});expect(problem().archived).toBe(false);
});
it('feedback follows actual publication versions and keeps comments and inquiries separate',()=>{
 const customer={id:'c1',drops:[{id:'p',topicSnapshot:{title:'作品',source:{problemId:'problem',angleId:'judgment'}},outcomes:{'抖音|0':[{publicationId:'pub',start:'2026-11-01',end:'2026-11-07',metrics:{views:100}},{publicationId:'missing',metrics:{views:500}}]}}]};
 const acquisition={publications:[{id:'pub',customerId:'c1',packId:'p',status:'published'}],signals:[{id:'s',customerId:'c1',text:'进一步追问',publicationAttribution:{publicationId:'pub'}}],leads:[{id:'l',customerId:'c1',messages:[{id:'m',direction:'inbound',publicationId:'pub'},{id:'unrelated',direction:'inbound'}]}]};
 const f=problemFeedback(customer,acquisition,'problem');expect(f.outcomes).toHaveLength(1);expect(f.comments).toHaveLength(1);expect(f.inquiries).toHaveLength(1);expect(f).not.toHaveProperty('totalLeads');
});
it('keyword hits distinguish business repetition from customer language',async()=>{
 const batch=await expandKeywordBatch({customer:{pitch:'厨房报价',hunt:'家装'},seeds:['厨房'],fetcher:async()=>({ok:true,json:async()=>({g:[{type:'sug',q:'厨房报价'}]})})});expect(batch.items[0].corpusHitsBySource).toEqual({business:1,comments:0,customers:0,benchmarks:0});
});
it('model clustering cannot cite valid IDs that were outside the sent sample',async()=>{
 const rows=Array.from({length:301},(_,i)=>({id:String(i),text:'第'+i+'种独立情况',customerId:'c1',publishedAt:String(i).padStart(4,'0')}));
 const r=await clusterPains(rows,{modelReady:true,chatFn:async request=>{const sample=JSON.parse(request.user.split('评论：')[1]);const outside=rows.find(r=>!sample.some(s=>s.id===r.id));return JSON.stringify({clusters:[{topic:'非法跨样本',ids:[outside.id]}]});}});expect(r.clusters.some(c=>c.topic==='非法跨样本')).toBe(false);expect(r.sampling.modelRecords).toBe(300);
});

it('an anonymized question and its original comment count as one observed source',()=>{
 const space=get();space.customers[0].demandTopics=[{id:'d1',kind:'comment',evidenceId:'s1',title:'安装费包含在报价中吗？'}];
 const catalog=observationCatalog(space.customers[0],space.acquisition);expect(catalog.some(s=>s.id==='signal:s1')).toBe(false);expect(catalog.filter(s=>s.kind==='external')).toHaveLength(1);
});
it('answer evidence reaches fact review and changes during generation invalidate results',async()=>{
 await call('discover',{},model);await review();await topicBoardAction(email,{customerId:'c1',action:'create',kind:'problem',sourceKey:problem().id+'|judgment',platform:'抖音',format:'video',goal:'leads'});
 const row=topicBoardRows(c(),get().acquisition)[0];await topicBoardAction(email,{customerId:'c1',action:'generate',id:row.id,version:row.version,basis:row.basis},{generate:async()=>({fields:{script:'核对报价'},warnings:[]})});
 const pack=c().drops[0],input={customerId:'c1',packId:pack.id,platform:'抖音',index:0,format:'video'};
 await reviewProductionFacts(email,{...input,fields:{script:'核对报价'}},{budget:(_e,_c,_p,fn)=>fn(),reviewFn:async(_draft,business)=>{expect(business.factCards.some(f=>f.id==='problem:fact:f1'&&f.text==='报价单列出安装项目与费用')).toBe(true);return [];}});
 await expect(generateProductionOutline(email,input,{budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>{await call('archive',{id:problem().id,version:problem().version});return '{"script":"晚到的旧结果"}';}})).rejects.toThrow('依据已变化');
});
