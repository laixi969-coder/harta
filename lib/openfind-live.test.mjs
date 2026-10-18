import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
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
 snapshots.set('c1',{...blank(),notes:[note({url:'https://evil.test/video/123'})]});
 await expect(service.action(email,{customerId:'c1',action:'sync'})).rejects.toThrow('链接');
 expect((await service.state(email,'c1')).error).toContain('链接');expect(readWorkspace(email).acquisition?.works||[]).toHaveLength(0);
});

it('existing works can collect comments without replacing unknown metadata with seed defaults',async()=>{
 syncSnapshot(email,'c1',{notes:[note()],comments:[]});
 const ws=readWorkspace(email),work=ws.acquisition.works[0];delete work.openfindIds;delete work.metrics;work.type='image';writeWorkspace(email,ws);
 await service.action(email,{customerId:'c1',action:'comments',workId:work.id});
 const seed=calls.find(c=>c.action==='seed-note').input.note;
 expect(seed).toMatchObject({hartaSeed:true,likes:null,id:'dy:123'});
 syncSnapshot(email,'c1',{notes:[{...seed,type:'video'}],comments:[comment()]});
 const saved=readWorkspace(email).acquisition;
 expect(saved.works[0].metrics).toBeUndefined();expect(saved.works[0].type).toBe('image');expect(saved.signals).toHaveLength(1);
});
