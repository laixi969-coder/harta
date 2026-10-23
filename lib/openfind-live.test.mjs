import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { reviewSignal } from './acquisition-workspace.mjs';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { createOpenFindService, syncSnapshot } from './openfind-live.mjs';
const root=process.cwd(),email='live@example.test';let dir,service,snapshots,calls,closed,current;
const note=(extra={})=>({id:'dy:123',nativeId:'123',platform:'douyin',source:'live',url:'https://www.douyin.com/video/123',title:'厨房翻新',body:'公开作品',author:'作者',authorId:'MS4author',type:'video',likes:1,comments:2,saves:3,publishedAt:'2026-01-01',...extra});
const comment=(extra={})=>({id:'dy:c1',noteId:'dy:123',platform:'douyin',source:'live',author:'买家',authorId:'MS4buyer',body:'想找厨房翻新',createdAt:'2026-01-02',parentId:null,...extra});
const blank=()=>({notes:[],comments:[],jobs:[],workflows:[],connections:[],protection:{}});
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-openfind-live-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{
 fs.rmSync(path.join(dir,'data'),{recursive:true,force:true});writeWorkspace(email,{customers:[{id:'c1',name:'厨房业务',hunt:'家装',packs:[],drops:[]},{id:'c2',name:'另一个业务',packs:[],drops:[]}]});snapshots=new Map();calls=[];closed=[];current=Date.now();
 service=createOpenFindService({clock:()=>current,canRun:()=>true,spawn:row=>({call:async(action,input)=>{calls.push({customerId:row.customerId,action,input});if(action==='state')return snapshots.get(row.customerId)||blank();if(action==='workflow'){const s=snapshots.get(row.customerId)||blank();s.workflows=[{id:'wf',status:'running',input:{keyword:input.keyword,platform:input.platform},logs:[]}];snapshots.set(row.customerId,s);}return {id:'result'};},close:()=>closed.push(row.customerId)})});
});
afterEach(()=>service.stop());
it('idle state creates no engine; user actions use scoped live engine and background sync without UI polling',async()=>{
 await service.state(email,'c1');expect(calls).toHaveLength(0);
 await service.action(email,{customerId:'c1',action:'workflow',platform:'douyin',keyword:'厨房',mode:'demo'});
 snapshots.set('c1',{...blank(),notes:[note()],comments:[comment()]});await service.tick();
 const s=readWorkspace(email);expect(s.acquisition.works[0]).toMatchObject({customerId:'c1',source:'openfind_live'});expect(s.acquisition.signals[0].sourceType).toBe('openfind_live');expect(s.acquisition.leads||[]).toHaveLength(0);
 const count=s.acquisition.tasks.length;await service.tick();expect(readWorkspace(email).acquisition.tasks).toHaveLength(count);
});
it('sync updates metrics, preserves verified evidence and retries idempotently',()=>{
 const state={notes:[note()],comments:[comment()]};const first=syncSnapshot(email,'c1',state);expect(first).toMatchObject({addedWorks:1,addedComments:1});
 const second=syncSnapshot(email,'c1',{notes:[note({likes:99})],comments:[comment()]},first.hashes);expect(second).toMatchObject({addedWorks:0,addedComments:0});expect(readWorkspace(email).acquisition.works[0].metrics.likes).toBe(99);
 expect(syncSnapshot(email,'c1',state).addedComments).toBe(0);
});
it('cannot attach comments or snapshots to another business or user',async()=>{
 snapshots.set('c1',{...blank(),notes:[note()]});await service.action(email,{customerId:'c1',action:'sync'});
 const id=readWorkspace(email).acquisition.works[0].id;
 await expect(service.action(email,{customerId:'c2',action:'comments',workId:id})).rejects.toThrow('实时引擎');
 await expect(service.action('other@example.test',{customerId:'c1',action:'sync'})).rejects.toThrow('业务');
 expect(readWorkspace(email).acquisition.works).toHaveLength(1);
});
it('scheduled acquisition persists and never restarts paused workflows; pause disables recurrence',async()=>{
 await service.action(email,{customerId:'c1',action:'schedule',enabled:true,minutes:15,platform:'douyin',keyword:'厨房'});
 current+=15*60000;await service.tick();expect(calls.filter(c=>c.action==='workflow')).toHaveLength(1);
 current+=15*60000;snapshots.get('c1').workflows[0].status='paused';await service.tick();expect(calls.filter(c=>c.action==='workflow')).toHaveLength(1);
 await service.action(email,{customerId:'c1',action:'pause',id:'wf'});expect((await service.state(email,'c1')).schedule.enabled).toBe(false);
});
it('disconnect stops engine and schedule without deleting saved data',async()=>{
 snapshots.set('c1',{...blank(),notes:[note()]});await service.action(email,{customerId:'c1',action:'sync'});
 await service.action(email,{customerId:'c1',action:'disconnect'});expect(closed).toContain('c1');const count=calls.length;await service.tick();expect(calls).toHaveLength(count);expect(readWorkspace(email).acquisition.works).toHaveLength(1);
});
it('rejects invalid schedule and does not expose raw notes, credentials or private account settings',async()=>{
 await expect(service.action(email,{customerId:'c1',action:'schedule',enabled:true,minutes:1,platform:'douyin',keyword:'厨房'})).rejects.toThrow('15');
 snapshots.set('c1',{...blank(),notes:[note()],settings:{cookie:'secret'},connections:[{platform:'douyin',status:'ready',cookie:'secret'}]});
 const s=await service.action(email,{customerId:'c1',action:'sync'});expect(s.notes).toBeUndefined();expect(JSON.stringify(s)).not.toContain('secret');
});
it('sync failure is visible and cannot claim successful empty results',async()=>{
 snapshots.set('c1',{...blank(),notes:[note({url:'https://evil.test/video/123'})],jobs:[{id:'done',status:'completed',count:5}]});
 await expect(service.action(email,{customerId:'c1',action:'sync'})).rejects.toThrow('链接');
 const state=await service.state(email,'c1');expect(state.error).toContain('链接');expect(state.jobs[0]).toMatchObject({status:'completed',count:5});expect(readWorkspace(email).acquisition?.works||[]).toHaveLength(0);
});

it('existing works can collect comments without replacing unknown metadata with seed defaults',async()=>{
 syncSnapshot(email,'c1',{notes:[note()],comments:[]});
 const ws=readWorkspace(email),work=ws.acquisition.works[0];delete work.openfindIds;delete work.metrics;work.type='image';work.organization={category:'已有分类',product:'原产品',stage:'reviewed',archived:false};writeWorkspace(email,ws);
 await service.action(email,{customerId:'c1',action:'comments',workId:work.id});
 const seed=calls.find(c=>c.action==='seed-note').input.note;
 expect(seed).toMatchObject({hartaSeed:true,likes:null,id:'dy:123',organization:work.organization});
 syncSnapshot(email,'c1',{notes:[{...seed,type:'video'}],comments:[comment()]});
 const saved=readWorkspace(email).acquisition;
 expect(saved.works[0].metrics).toBeUndefined();expect(saved.works[0].type).toBe('image');expect(saved.signals).toHaveLength(1);
});
it('network recovery is scoped, validates modes, and refuses to interrupt an active platform task',async()=>{
 await expect(service.action(email,{customerId:'c1',action:'network',platform:'douyin',mode:'invalid'})).rejects.toThrow('网络模式');
 snapshots.set('c1',{...blank(),jobs:[{platform:'douyin',status:'running'}]});
 await expect(service.action(email,{customerId:'c1',action:'network',platform:'douyin',mode:'direct'})).rejects.toThrow('暂停');
 expect(calls.filter(c=>c.action==='network')).toHaveLength(0);
 snapshots.set('c1',{...blank(),connections:[{platform:'douyin',network:'direct',status:'awaiting_login'}]});
 const result=await service.action(email,{customerId:'c1',action:'network',platform:'douyin',mode:'direct'});
 expect(result.connections[0].network).toBe('direct');expect(calls.filter(c=>c.action==='network')).toHaveLength(1);
});

it('media-only comments do not block text comments or become invented demand evidence',()=>{
 const snapshot={notes:[note()],comments:[comment(),comment({id:'dy:media',body:'  '})]};
 const first=syncSnapshot(email,'c1',snapshot);expect(first).toMatchObject({addedComments:1,skippedComments:1});
 expect(syncSnapshot(email,'c1',snapshot,first.hashes)).toMatchObject({addedComments:0,skippedComments:1});
 snapshot.comments[1].body='请问怎么预约';
 expect(syncSnapshot(email,'c1',snapshot,first.hashes)).toMatchObject({addedComments:1,skippedComments:0});
 expect(readWorkspace(email).acquisition.signals).toHaveLength(2);
});

it('syncs current model citations without confirming contacts and clears stale model evidence',()=>{
 const c=comment(),n=note();
 const review={noteId:n.id,commentId:c.id,managedBy:'harta',model:'shared',providerName:'Harta',verdict:'service',reason:'咨询服务',quotes:[c.body],limitations:['地点待核实'],reviewedAt:new Date().toISOString(),inputHash:'review-1'};
 const snapshot={notes:[n],comments:[c],semanticReviews:[review]};
 const first=syncSnapshot(email,'c1',snapshot);expect(first.semanticSynced).toBe(1);
 const a=readWorkspace(email).acquisition;expect(a.signals[0].openfindSemantic).toMatchObject({model:'shared',quotes:[c.body]});expect(a.signals[0].leadId).toBeFalsy();expect(a.leads||[]).toHaveLength(0);
 const tasks=a.tasks.length;
 expect(syncSnapshot(email,'c1',snapshot,first.hashes).semanticSynced).toBe(0);expect(readWorkspace(email).acquisition.tasks).toHaveLength(tasks);
 expect(syncSnapshot(email,'c1',{...snapshot,semanticReviews:[]},first.hashes).semanticSynced).toBe(1);expect(readWorkspace(email).acquisition.signals[0].openfindSemantic).toBeUndefined();
 expect(syncSnapshot(email,'c1',{...snapshot,semanticReviews:[{...review,quotes:['伪造的引用']}]},first.hashes).semanticSynced).toBe(0);
});

it('workbench access checks ownership, never silently reconnects a disabled engine, and hands off only synchronized real works',async()=>{
 await expect(service.endpoint('other@example.test','c1',{activate:true})).rejects.toThrow('业务');
 await expect(service.endpoint(email,'c1')).rejects.toThrow('已关闭');
 await service.endpoint(email,'c1',{activate:true});expect(calls.at(-1)).toMatchObject({customerId:'c1',action:'endpoint'});
 snapshots.set('c1',{...blank(),notes:[note()],comments:[comment()]});
 const handoff=await service.handoff(email,'c1',{noteId:note().id,commentId:comment().id,intent:'reference'});
 expect(handoff).toMatchObject({customerId:'c1',intent:'reference'});expect(handoff.workId).toBeTruthy();expect(handoff.signalId).toBeTruthy();
 await expect(service.handoff(email,'c1',{noteId:'demo:fake'})).rejects.toThrow('尚未同步');
 await service.action(email,{customerId:'c1',action:'disconnect'});
 await expect(service.endpoint(email,'c1')).rejects.toThrow('已关闭');
});

it('sales sync preserves evidence, requires a verified Harta contact, deduplicates revisions and propagates opt-out',()=>{
 const sales={id:'sales1',revision:1,stage:'new',need:'',timing:'',budget:'',objection:'',nextAction:'',nextFollowUp:'',orderReference:'',amount:0,updatedAt:new Date().toISOString(),events:[{kind:'note',content:'内部记录'}]};
 const snapshot={...blank(),notes:[note()],comments:[comment()],leads:[{id:'sales1',source:'live',platform:'douyin',noteId:note().id,commentId:comment().id,authorId:comment().authorId}],salesCases:[sales]};
 let result=syncSnapshot(email,'c1',snapshot);expect(result.salesSynced).toBe(0);expect(readWorkspace(email).acquisition.leads||[]).toHaveLength(0);
 const signal=readWorkspace(email).acquisition.signals[0];reviewSignal(email,{signalId:signal.id,action:'confirm',note:'测试：核对原文与业务匹配'});
 const initial=readWorkspace(email);initial.acquisition.leads[0].nextStep='已有下一步';initial.acquisition.leads[0].nextAt='2026-10-19T10:00:00Z';writeWorkspace(email,initial);
 result=syncSnapshot(email,'c1',snapshot,result.hashes);expect(result.salesSynced).toBe(1);
 let lead=readWorkspace(email).acquisition.leads[0];expect(lead.nextStep).toBe('已有下一步');expect(lead.signalIds).toContain(signal.id);expect(lead.events.at(-1).note).toContain('非平台发送回执');
 const count=lead.events.length;result=syncSnapshot(email,'c1',snapshot,result.hashes);expect(result.salesSynced).toBe(0);expect(readWorkspace(email).acquisition.leads[0].events).toHaveLength(count);
 snapshot.salesCases=[{...sales,revision:2,stage:'contacted',nextAction:'等待约定回复',nextFollowUp:'2026-10-20T12:00:00Z',events:[{kind:'outgoing',content:'测试夹具：人工登记实际沟通'}]}];
 result=syncSnapshot(email,'c1',snapshot,result.hashes);lead=readWorkspace(email).acquisition.leads[0];expect(lead).toMatchObject({stage:'已联系',nextStep:'等待约定回复',nextAt:'2026-10-20T12:00:00Z'});
 snapshot.salesCases=[{...sales,revision:3,stage:'replied',events:[{kind:'incoming',content:'测试夹具：平台真实来信',platformMessage:{platform:'douyin',threadId:'thread',messageId:'message',timeLabel:'昨天 10:00'}}]}];
 result=syncSnapshot(email,'c1',snapshot,result.hashes);lead=readWorkspace(email).acquisition.leads[0];expect(lead.events.at(-1).note).toContain('平台私信记录同步（平台时间：昨天 10:00）');expect(lead.events.at(-1).note).not.toContain('人工登记客户回复');expect(lead.events.at(-1).openfindPlatformMessage).toMatchObject({messageId:'message',platform:'douyin'});
 snapshot.salesCases=[{...sales,revision:4,stopped:true,events:[{kind:'optout',content:'请勿联系'}]}];
 result=syncSnapshot(email,'c1',snapshot,result.hashes);expect(readWorkspace(email).acquisition.leads[0]).toMatchObject({doNotContact:true,stage:'暂不跟进',nextAt:''});
 expect(syncSnapshot(email,'c2',{...snapshot,notes:[],comments:[]}).salesSynced).toBe(0);expect(readWorkspace(email).acquisition.leads).toHaveLength(1);
});

it('pausing from the full workbench suspends the persistent Harta schedule',async()=>{
 await service.action(email,{customerId:'c1',action:'schedule',enabled:true,minutes:15,platform:'douyin',keyword:'厨房'});
 service.suspendSchedule(email,'c1');expect((await service.state(email,'c1')).schedule.enabled).toBe(false);
 current+=16*60000;await service.tick();expect(calls.filter(c=>c.action==='workflow')).toHaveLength(0);
 expect(()=>service.suspendSchedule('another@example.test','c1')).toThrow('业务');
});
it('one account cannot occupy all workers and idle engines release their capacity',async()=>{
 const space=readWorkspace(email);space.customers.push({id:'c3',name:'third',packs:[],drops:[]});writeWorkspace(email,space);
 await service.endpoint(email,'c1',{activate:true});await service.endpoint(email,'c2',{activate:true});
 await expect(service.endpoint(email,'c3',{activate:true})).rejects.toThrow('每个账号');
 current+=11*60000;await service.tick();expect(closed).toContain('c1');expect(closed).toContain('c2');
 await expect(service.endpoint(email,'c3',{activate:true})).resolves.toBeDefined();
});
it('foreground reads refresh idle time and maintenance refuses running platform jobs',async()=>{
 await service.endpoint(email,'c1',{activate:true});current+=9*60000;
 await service.endpoint(email,'c1');current+=2*60000;await service.tick();expect(closed).not.toContain('c1');
 snapshots.set('c1',{...blank(),jobs:[{id:'busy',status:'running'}]});expect(await service.prepareMaintenance()).toBe(false);
 snapshots.set('c1',blank());expect(await service.prepareMaintenance()).toBe(true);
});
