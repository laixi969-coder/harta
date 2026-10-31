import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {writeWorkspace,readWorkspace} from './workspace.mjs';
import {registerOwnedPublication,correctOwnedPublication,recordOwnedPublicationOutcome,importOwnedPublicationOutcomes,adoptAccountReviewMemory} from './account-review.mjs';
import {comparableOutcomes,comparisonEvidence,accountMemoryCurrent} from '../js/creator-review.js';
import {recordInquiry,correctInquiryPublicationSource,importSignals,reviewSignal} from './acquisition-workspace.mjs';
import {publicationIdentity} from './publication-identity.mjs';
import {profileBrief} from '../js/creator-profile.js';
import {researchFingerprint} from './research.mjs';
import {creatorMemoryAction} from './growth-workspace.mjs';
const email='review-own@example.com',old=process.cwd();let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-owned-review-'));process.chdir(dir);});
afterAll(()=>{process.chdir(old);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{customers:[{id:'c1',name:'业务',drops:[],packs:[]},{id:'c2',name:'其他业务',drops:[],packs:[]}],acquisition:{accounts:[{id:'a1',customerId:'c1',platform:'抖音',name:'账号一'},{id:'a2',customerId:'c2',platform:'抖音',name:'账号二'}],publications:[]},seedVersion:999}));
const registration=(id='1')=>({customerId:'c1',accountId:'a1',title:`作品${id}`,body:'原始正文',url:`https://example.com/video/${id}`,publishedAt:'2026-01-01T12:00:00Z',confirmed:true});
const state=()=>readWorkspace(email),metrics={start:'2026-01-01',end:'2026-01-07',source:'后台截图',metrics:{views:0,likes:2}};
describe('自有作品账号复盘',()=>{
 it('支持登记公众号自有文章和手工后台数据',()=>{
  const space=state();space.acquisition.accounts.push({id:'wx',customerId:'c1',platform:'公众号',name:'公众号账号'});writeWorkspace(email,space);
  registerOwnedPublication(email,{...registration(),accountId:'wx',url:'https://mp.weixin.qq.com/s/example'});const p=state().acquisition.publications[0];expect(p.platform).toBe('公众号');
  recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics});expect(state().customers[0].accountReviewOutcomes[0]).toMatchObject({platform:'公众号',publicationId:p.id,metrics:{views:0,likes:2}});
 });
 it('视频号自有作品可人工登记并记录效果',()=>{
  const space=state();space.acquisition.accounts.push({id:'channels',customerId:'c1',platform:'视频号',name:'视频号账号'});writeWorkspace(email,space);
  registerOwnedPublication(email,{...registration(),accountId:'channels',url:'https://example.com/channels/one'});const p=state().acquisition.publications[0];recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics});expect(state().customers[0].accountReviewOutcomes[0]).toMatchObject({platform:'视频号',publicationId:p.id,metrics:{views:0,likes:2}});
 });
 it('示例发布链接不会阻碍登记或更正真实作品',()=>{
  let s=state();s.acquisition.publications.push({id:'demo',customerId:'c1',platform:'抖音',status:'published',url:registration().url,demo:true});writeWorkspace(email,s);
  registerOwnedPublication(email,registration());const pub=state().acquisition.publications.find(p=>!p.demo);expect(pub).toBeTruthy();
  correctOwnedPublication(email,{...registration(),publicationId:pub.id,version:1});expect(state().acquisition.publications.find(p=>p.id===pub.id).metadataVersion).toBe(2);
  expect(()=>registerOwnedPublication(email,registration())).toThrow('已经登记');
 });
 it('登记实际作品，指标保存为可追溯快照，更新同窗口不累加',()=>{
  registerOwnedPublication(email,registration());let p=state().acquisition.publications[0];expect(p).toMatchObject({status:'published',origin:'manual_external',accountId:'a1',creatorPack:null});expect(p.content.title).toBe('作品1');
  recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics});recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics,metrics:{views:8}});
  registerOwnedPublication(email,registration('2'));p=state().acquisition.publications[1];recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics,metrics:{views:0}});
  const c=state().customers[0],groups=comparableOutcomes(c);expect(c.accountReviewOutcomes).toHaveLength(3);expect(groups).toHaveLength(1);expect(groups[0].rows.map(r=>r.views)).toEqual([8,0]);
 });
 it('示例账号和示例发布不能生成真实效果快照或混入批量导入',()=>{
  let s=state();s.acquisition.accounts[0].demo=true;writeWorkspace(email,s);expect(()=>registerOwnedPublication(email,registration())).toThrow('真实账号');
  s=state();delete s.acquisition.accounts[0].demo;writeWorkspace(email,s);registerOwnedPublication(email,registration());const p=state().acquisition.publications[0];
  const input={customerId:'c1',publicationId:p.id,...metrics},csv={customerId:'c1',rows:[{publicationId:p.id,version:1,url:p.url,...metrics}],confirmed:true};
  for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}]){
   s=state();Object.assign(s.acquisition.publications[0],marker);writeWorkspace(email,s);
   expect(()=>recordOwnedPublicationOutcome(email,input)).toThrow('真实');expect(()=>importOwnedPublicationOutcomes(email,csv)).toThrow('示例');
   expect(state().customers[0].accountReviewOutcomes).toBeUndefined();
   s=state();delete s.acquisition.publications[0].demo;delete s.acquisition.publications[0].source;delete s.acquisition.publications[0].sourceType;writeWorkspace(email,s);
  }
  s=state();s.acquisition.accounts[0].sourceType='demo';writeWorkspace(email,s);expect(()=>recordOwnedPublicationOutcome(email,input)).toThrow('示例账号');expect(()=>importOwnedPublicationOutcomes(email,csv)).toThrow('示例');
 });
 it('拒绝跨业务、重复链接、未确认、伪造指标与未知作品',()=>{
  expect(()=>registerOwnedPublication(email,{...registration(),accountId:'a2'})).toThrow('账号');expect(()=>registerOwnedPublication(email,{...registration(),confirmed:false})).toThrow('确认');
  expect(()=>registerOwnedPublication(email,{...registration(),url:'javascript:alert(1)'})).toThrow('链接');registerOwnedPublication(email,registration());
  expect(()=>registerOwnedPublication(email,registration())).toThrow('已经登记');const p=state().acquisition.publications[0];
  expect(()=>recordOwnedPublicationOutcome(email,{customerId:'c2',publicationId:p.id,...metrics})).toThrow('找不到');
  expect(()=>recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics,metrics:{views:-1}})).toThrow();expect(state().customers[0].accountReviewOutcomes).toBeUndefined();
 });
 it('批量导入先验证全部记录，版本变化或任何一行错误都不写入',()=>{
  registerOwnedPublication(email,registration());registerOwnedPublication(email,registration('2'));
  const pubs=state().acquisition.publications,rows=pubs.map(p=>({publicationId:p.id,version:1,url:p.url,...metrics}));
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',rows,confirmed:false})).toThrow('确认');
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',rows:[rows[0],{...rows[1],version:2}],confirmed:true})).toThrow('变化');
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',rows:[rows[0],{...rows[1],metrics:{views:-1}}],confirmed:true})).toThrow();
  expect(state().customers[0].accountReviewOutcomes).toBeUndefined();
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c2',rows,confirmed:true})).toThrow();
  importOwnedPublicationOutcomes(email,{customerId:'c1',rows,confirmed:true});expect(state().customers[0].accountReviewOutcomes).toHaveLength(2);
 });
 it('同批导入自有作品和 Harta 发布作品，错误时两类均不写入',()=>{
  registerOwnedPublication(email,registration());let space=state();const outside=space.acquisition.publications[0];
  space.customers[0].drops.push({id:'pack',tier:'今日',origin:{mode:'organic'},shells:{'抖音':[{title:'生成稿',body:'正文'}]}});
  const generated={id:'generated',customerId:'c1',status:'published',platform:'抖音',packId:'pack',index:0,accountId:'a1',accountName:'账号一',url:'https://www.douyin.com/video/123456',revision:'original',publishedAt:'2026-01-01T00:00:00Z',content:{title:'发布稿',body:'正文'},creatorPack:{name:'方法',version:2},goal:'reach'};
  space.acquisition.publications.push(generated);writeWorkspace(email,space);
  const external={publicationId:outside.id,version:1,url:outside.url,...metrics},internal={publicationId:generated.id,version:1,revision:'original',accountId:'a1',url:generated.url,...metrics};
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,rows:[external,{...internal,revision:'changed'}]})).toThrow('变化');
  expect(state().customers[0].accountReviewOutcomes).toBeUndefined();expect(state().customers[0].drops[0].outcomes).toBeUndefined();
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,rows:[external,internal]});space=state();
  expect(space.customers[0].accountReviewOutcomes).toHaveLength(1);
  expect(space.customers[0].drops[0].outcomes['抖音|0'][0]).toMatchObject({publicationId:'generated',content:{title:'发布稿'},creatorPack:{name:'方法',version:2},metrics:{views:0,likes:2}});
 });
 it('可按同一发布和窗口补充 CSV 指标，保留各指标来源并拒绝过期预览',()=>{
  registerOwnedPublication(email,registration());const p=state().acquisition.publications[0];
  recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics,source:'播放后台',metrics:{views:100,qualifiedLeads:0},criteria:'按人去重'});
  let before=state().customers[0].accountReviewOutcomes[0];const row={publicationId:p.id,version:1,url:p.url,start:metrics.start,end:metrics.end,source:'完播后台',metrics:{completionRate:35.5},priorId:before.id};
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[{...row,priorId:'old'}]})).toThrow('已变化');
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[row]});let saved=state().customers[0].accountReviewOutcomes[0];
  expect(saved.metrics).toEqual({views:100,qualifiedLeads:0,completionRate:35.5});expect(saved.criteria).toBe('按人去重');expect(saved.metricSources).toEqual({views:'播放后台',qualifiedLeads:'播放后台',completionRate:'完播后台'});
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[row]})).toThrow('已变化');
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[{...row,priorId:saved.id,source:'播放更新',metrics:{views:110}}]});saved=state().customers[0].accountReviewOutcomes[0];expect(saved.metricSources).toEqual({views:'播放更新',qualifiedLeads:'播放后台',completionRate:'完播后台'});
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[{...row,start:'2026-01-02',priorId:'',metrics:{completionRate:40}}]});expect(state().customers[0].accountReviewOutcomes[0].metrics).toEqual({completionRate:40});
 });
 it('CSV 流量和线索并存，线索新口径独立校验，不能与旧成交口径混用',()=>{
  registerOwnedPublication(email,registration());const p=state().acquisition.publications[0];
  const row={publicationId:p.id,version:1,url:p.url,...metrics,metrics:{views:100,inquiries:4,qualifiedLeads:0}};
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,rows:[row]})).toThrow('去重口径');
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,rows:[{...row,criteria:'按联系人去重'}]});
  let saved=state().customers[0].accountReviewOutcomes[0];expect(saved.metrics).toEqual({views:100,inquiries:4,qualifiedLeads:0});expect(saved.criteria).toBe('按联系人去重');
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[{...row,priorId:saved.id,metrics:{qualifiedLeads:2},criteria:'按意向去重'}]});saved=state().customers[0].accountReviewOutcomes[0];expect(saved.metrics).toEqual({views:100,inquiries:4,qualifiedLeads:2});expect(saved.criteria).toBe('按意向去重');
  recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics,metrics:{orders:1},criteria:'订单按人去重'});saved=state().customers[0].accountReviewOutcomes[0];
  expect(()=>importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[{...row,priorId:saved.id,metrics:{qualifiedLeads:2},criteria:'另一口径'}]})).toThrow('口径不同');
 });
 it('Harta 发布作品也能沿用同窗口指标和来源',()=>{
  let s=state();s.customers[0].drops.push({id:'pack',tier:'今日',origin:{mode:'organic'},shells:{'抖音':[{title:'稿'}]}});const p={id:'generated',customerId:'c1',status:'published',platform:'抖音',packId:'pack',index:0,accountId:'a1',accountName:'账号一',url:'https://www.douyin.com/video/123456',revision:'rev',publishedAt:'2026-01-01T00:00:00Z',content:{title:'发布稿'},goal:'reach'};s.acquisition.publications.push(p);writeWorkspace(email,s);
  const row={publicationId:p.id,version:1,revision:'rev',accountId:'a1',url:p.url,...metrics};importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,rows:[row]});const prior=state().customers[0].drops[0].outcomes['抖音|0'][0];
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,carryExisting:true,rows:[{...row,priorId:prior.id,source:'完播表',metrics:{completionRate:30}}]});const result=state().customers[0].drops[0].outcomes['抖音|0'][0];expect(result.metrics).toEqual({views:0,likes:2,completionRate:30});expect(result.metricSources).toEqual({views:'后台截图',likes:'后台截图',completionRate:'完播表'});
 });
 it('小红书主页作品链接可去重，并关联评论和效果',()=>{
  const workUrl='https://www.xiaohongshu.com/explore/abc123',profileUrl='https://www.xiaohongshu.com/user/profile/user123/abc123';let s=state();s.acquisition.accounts.push({id:'xhs',customerId:'c1',platform:'小红书',name:'小红书账号'});s.acquisition.works=[{id:'work',customerId:'c1',platform:'小红书',url:workUrl+'?x=1'}];writeWorkspace(email,s);
  registerOwnedPublication(email,{...registration(),accountId:'xhs',url:profileUrl+'?share=1'});const p=state().acquisition.publications[0];
  expect(()=>registerOwnedPublication(email,{...registration('2'),accountId:'xhs',url:workUrl+'?share=2'})).toThrow('已经登记');
  importSignals(email,{customerId:'c1',source:'评论原文',workId:'work',rows:[{platform:'小红书',url:workUrl+'?comment=1',text:'请问怎么选',authorId:'buyer',recordId:'c1'}]});const signal=state().acquisition.signals[0];reviewSignal(email,{signalId:signal.id,action:'confirm',note:'已核对原文',publicationId:p.id});
  expect(state().acquisition.signals[0].publicationAttribution.publicationId).toBe(p.id);
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,rows:[{publicationId:p.id,version:1,url:workUrl+'?share=3',...metrics,metrics:{views:100}}]});expect(state().customers[0].accountReviewOutcomes[0].metrics.views).toBe(100);
 });
 it('抖音图文不同参数去重，评论和效果可关联到同一作品',()=>{
  const url='https://www.douyin.com/note/123456';let s=state();s.acquisition.works=[{id:'image-work',customerId:'c1',platform:'抖音',url:url+'?work=1'}];writeWorkspace(email,s);
  registerOwnedPublication(email,{...registration(),url:url+'?share=one'});const p=state().acquisition.publications[0];
  expect(()=>registerOwnedPublication(email,{...registration('2'),url:url+'?share=two'})).toThrow('已经登记');
  importSignals(email,{customerId:'c1',source:'评论原文',workId:'image-work',rows:[{platform:'抖音',url:url+'?comment=1',text:'请问怎么选',authorId:'buyer',recordId:'c1'}]});const signal=state().acquisition.signals[0];reviewSignal(email,{signalId:signal.id,action:'confirm',note:'已核对原文',publicationId:p.id});
  expect(state().acquisition.signals[0].publicationAttribution.publicationId).toBe(p.id);
  importOwnedPublicationOutcomes(email,{customerId:'c1',confirmed:true,rows:[{publicationId:p.id,version:1,url:url+'?share=three',...metrics,metrics:{views:100}}]});
  expect(state().customers[0].accountReviewOutcomes[0].metrics.views).toBe(100);
 });
 it('同一平台作品的跟踪参数不产生重复记录，未知网址不误合并',()=>{
  registerOwnedPublication(email,{...registration(),url:'https://www.douyin.com/video/123456?share=one'});
  expect(()=>registerOwnedPublication(email,{...registration('2'),url:'https://www.douyin.com/video/123456?share=two'})).toThrow('已经登记');
  registerOwnedPublication(email,{...registration('3'),url:'https://example.com/view?id=1'});registerOwnedPublication(email,{...registration('4'),url:'https://example.com/view?id=2'});expect(state().acquisition.publications).toHaveLength(3);
  expect(publicationIdentity('小红书','https://www.xiaohongshu.com/explore/abc123?xsec_token=one')).toBe(publicationIdentity('小红书','https://www.xiaohongshu.com/discovery/item/abc123?xsec_token=two'));
  expect(publicationIdentity('抖音','https://example.com/video/123?a=1')).not.toBe(publicationIdentity('抖音','https://example.com/video/123?a=2'));
 });
 it('Harta 内发布和自有历史作品在相同账号及窗口一起对照',()=>{
  registerOwnedPublication(email,registration());const p=state().acquisition.publications[0];recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics,metrics:{views:100}});
  const s=state(),c=s.customers[0];c.drops.push({id:'generated',outcomes:{'抖音|0':[{...metrics,publicationId:'harta-published',accountId:'a1',accountName:'账号一',platform:'抖音',content:{title:'Harta 作品'},metrics:{views:25}}]}});writeWorkspace(email,s);
  expect(comparableOutcomes(state().customers[0])[0].rows.map(x=>x.views)).toEqual([100,25]);
 });
 it('更正作品时保留旧指标快照并拒绝覆盖过期版本或更换已归因账号',()=>{
  let s=state();s.acquisition.accounts.push({id:'a3',customerId:'c1',platform:'抖音',name:'另一账号'});writeWorkspace(email,s);registerOwnedPublication(email,registration());
  const p=state().acquisition.publications[0];recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics});
  const change={...registration(),publicationId:p.id,version:1,title:'更正标题',url:'https://example.com/video/new'};
  expect(()=>correctOwnedPublication(email,{...change,accountId:'a3'})).toThrow('不能更换账号');correctOwnedPublication(email,change);
  const updated=state();expect(updated.acquisition.publications[0]).toMatchObject({metadataVersion:2,content:{title:'更正标题'}});expect(updated.customers[0].accountReviewOutcomes[0]).toMatchObject({publicationVersion:1,content:{title:'作品1'}});
  expect(()=>correctOwnedPublication(email,change)).toThrow('已变更');
 });
 it('自有作品可关联真实咨询，已有咨询后不能换账号',()=>{
  const s=state();s.acquisition.accounts.push({id:'a3',customerId:'c1',platform:'抖音',name:'另一账号'});writeWorkspace(email,s);registerOwnedPublication(email,registration());const p=state().acquisition.publications[0];
  recordInquiry(email,{customerId:'c1',platform:'抖音',accountId:'a1',publicationId:p.id,authorId:'u1',authorName:'咨询者',text:'请问服务范围？',channel:'评论',evidence:'原评论记录',receivedAt:'2026-01-02T00:00:00Z'});
  const lead=state().acquisition.leads[0];expect(lead.sourcePaths).toContain('content');expect(lead.messages[0].publicationId).toBe(p.id);
  expect(()=>correctOwnedPublication(email,{...registration(),publicationId:p.id,version:1,accountId:'a3'})).toThrow('不能更换账号');
 });
 it('已关联咨询时不能改指向另一作品，先更正咨询来源后可改',()=>{
  const first='https://www.douyin.com/video/123456?share=one';registerOwnedPublication(email,{...registration(),url:first});const p=state().acquisition.publications[0];
  recordInquiry(email,{customerId:'c1',platform:'抖音',accountId:'a1',publicationId:p.id,authorName:'咨询者',text:'请问服务范围？',channel:'评论',evidence:'原评论记录',receivedAt:'2026-01-02T00:00:00Z'});
  const edit={...registration(),publicationId:p.id,version:1,url:'https://www.douyin.com/video/999999'};
  expect(()=>correctOwnedPublication(email,edit)).toThrow('已关联咨询或评论');expect(state().acquisition.publications[0].url).toBe(first);
  correctOwnedPublication(email,{...edit,url:'https://www.douyin.com/video/123456?share=two'});expect(state().acquisition.publications[0].metadataVersion).toBe(2);
  const lead=state().acquisition.leads[0];correctInquiryPublicationSource(email,{leadId:lead.id,messageId:lead.messages[0].id,expectedPublicationId:p.id,publicationId:'',note:'原链接登记错误',confirmed:true});
  correctOwnedPublication(email,{...edit,version:2});expect(state().acquisition.publications[0].url).toBe('https://www.douyin.com/video/999999');expect(state().acquisition.leads[0].messages[0].publicationId).toBe('');
 });
 it('已关联评论的自有作品不能更换成另一篇作品链接或其他账号',()=>{
  let s=state();s.acquisition.accounts.push({id:'a3',customerId:'c1',platform:'抖音',name:'另一账号'});s.acquisition.works=[{id:'w1',customerId:'c1',platform:'抖音',url:'https://www.douyin.com/video/123456'}];writeWorkspace(email,s);
  registerOwnedPublication(email,{...registration(),url:'https://www.douyin.com/video/123456?share=one'});const p=state().acquisition.publications[0];
  importSignals(email,{customerId:'c1',source:'评论原文',workId:'w1',rows:[{platform:'抖音',url:'https://www.douyin.com/video/123456?comment=1',text:'请问价格',authorId:'u1',recordId:'r1'}]});const signal=state().acquisition.signals[0];reviewSignal(email,{signalId:signal.id,action:'confirm',note:'核对来源',publicationId:p.id});
  const edit={...registration(),publicationId:p.id,version:1,url:'https://www.douyin.com/video/999999'};expect(()=>correctOwnedPublication(email,edit)).toThrow('不能更换为另一篇');expect(()=>correctOwnedPublication(email,{...edit,url:p.url,accountId:'a3'})).toThrow('不能更换账号');
  correctOwnedPublication(email,{...edit,url:'https://www.douyin.com/video/123456?share=two'});expect(state().acquisition.publications[0].metadataVersion).toBe(2);
 });
 it('仅有有效客资时也可按相同口径对照并采用记忆，口径变化后暂停',()=>{
  for(const n of ['1','2']){registerOwnedPublication(email,registration(n));const pub=state().acquisition.publications.at(-1);recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:pub.id,...metrics,criteria:'按联系人去重',metrics:{qualifiedLeads:n==='1'?0:2}});}
  let c=state().customers[0],group=comparableOutcomes(c)[0];expect(group.comparableLeads).toBe(true);expect(group.rows.map(r=>r.qualifiedLeads).sort()).toEqual([0,2]);
  const selection={accountId:group.accountId,platform:group.platform,start:group.start,end:group.end},fingerprint=crypto.createHash('sha256').update(comparisonEvidence(group)).digest('hex');adoptAccountReviewMemory(email,{customerId:'c1',selection,fingerprint,text:'继续核对有效客资'});
  c=state().customers[0];expect(profileBrief(c)).toContain('继续核对有效客资');const p=state().acquisition.publications[0];recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:p.id,...metrics,criteria:'按咨询次数',metrics:{qualifiedLeads:0}});
  c=state().customers[0];expect(accountMemoryCurrent(c,c.creatorMemories[0])).toBe(false);expect(profileBrief(c)).not.toContain('继续核对有效客资');
 });
 it('用户采用账号对照假设；证据更新后暂停用于创作并可停用',()=>{
  for(const n of ['1','2']){registerOwnedPublication(email,registration(n));const pub=state().acquisition.publications.at(-1);recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:pub.id,...metrics,metrics:{views:n==='1'?10:20}});}
  let c=state().customers[0],group=comparableOutcomes(c)[0],selection={accountId:group.accountId,platform:group.platform,start:group.start,end:group.end},fingerprint=crypto.createHash('sha256').update(comparisonEvidence(group)).digest('hex');
  const input={customerId:'c1',selection,fingerprint,text:'下次验证更具体的开场，记录投流差异'};
  expect(()=>adoptAccountReviewMemory('other@example.com',input)).toThrow('业务');expect(()=>adoptAccountReviewMemory(email,{...input,fingerprint:'0'.repeat(64)})).toThrow('已变化');
  adoptAccountReviewMemory(email,input);adoptAccountReviewMemory(email,input);c=state().customers[0];expect(c.creatorMemories).toHaveLength(1);expect(c.creatorMemories[0].evidence.rows).toHaveLength(2);expect(profileBrief(c)).toContain('下次验证更具体的开场');const before=researchFingerprint(c,{});
  const pub=state().acquisition.publications[0];recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:pub.id,...metrics,metrics:{views:99}});c=state().customers[0];expect(accountMemoryCurrent(c,c.creatorMemories[0])).toBe(false);expect(profileBrief(c)).not.toContain('下次验证更具体的开场');expect(researchFingerprint(c,{})).not.toBe(before);
  expect(()=>adoptAccountReviewMemory(email,input)).toThrow('已变化');creatorMemoryAction(email,{customerId:'c1',action:'retire',memoryId:c.creatorMemories[0].id});expect(state().customers[0].creatorMemories[0].active).toBe(false);
 });
 it('复盘依据标记为示例后，已采用的人设记忆暂停用于创作',()=>{
  for(const n of ['1','2']){registerOwnedPublication(email,registration(n));const pub=state().acquisition.publications.at(-1);recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:pub.id,...metrics,metrics:{views:Number(n)*10}});}
  let c=state().customers[0],group=comparableOutcomes(c)[0],selection={accountId:group.accountId,platform:group.platform,start:group.start,end:group.end},fingerprint=crypto.createHash('sha256').update(comparisonEvidence(group)).digest('hex');
  adoptAccountReviewMemory(email,{customerId:'c1',selection,fingerprint,text:'继续验证真实客户反馈'});expect(profileBrief(state().customers[0])).toContain('继续验证真实客户反馈');
  const space=state();space.customers[0].accountReviewOutcomes[0].sourceType='demo';writeWorkspace(email,space);c=state().customers[0];
  expect(accountMemoryCurrent(c,c.creatorMemories[0])).toBe(false);expect(profileBrief(c)).not.toContain('继续验证真实客户反馈');
  expect(()=>adoptAccountReviewMemory(email,{customerId:'c1',selection,fingerprint,text:'不应采用'})).toThrow();
 });
 it('打法快照随账号对照写入记忆，打法依据变化时暂停',()=>{
  for(const n of ['1','2']){registerOwnedPublication(email,registration(n));const pub=state().acquisition.publications.at(-1);recordOwnedPublicationOutcome(email,{customerId:'c1',publicationId:pub.id,...metrics,metrics:{views:Number(n)*10}});}
  let s=state();s.customers[0].accountReviewOutcomes[0].creatorPack={id:'pack',name:'问答打法',version:1,instruction:'先回答问题'};writeWorkspace(email,s);
  let c=state().customers[0],group=comparableOutcomes(c)[0],selection={accountId:group.accountId,platform:group.platform,start:group.start,end:group.end},fingerprint=crypto.createHash('sha256').update(comparisonEvidence(group)).digest('hex');
  adoptAccountReviewMemory(email,{customerId:'c1',selection,fingerprint,text:'下次对比问答开场'});c=state().customers[0];expect(c.creatorMemories[0].evidence.rows.some(r=>r.creatorPack?.name==='问答打法')).toBe(true);expect(profileBrief(c)).toContain('下次对比问答开场');
  s=state();s.customers[0].accountReviewOutcomes[0].creatorPack.version=2;writeWorkspace(email,s);c=state().customers[0];expect(accountMemoryCurrent(c,c.creatorMemories[0])).toBe(false);expect(profileBrief(c)).not.toContain('下次对比问答开场');
 });
});
