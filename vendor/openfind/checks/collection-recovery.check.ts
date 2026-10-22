import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import type {Job} from '../shared/types.ts';
const dir=mkdtempSync(join(tmpdir(),'harta-recovery-'));process.env.OPENFIND_DATA_DIR=dir;process.env.NODE_ENV='test';
const {db,get,put}=await import('../server/store.ts');const {saveDouyinSettings}=await import('../server/douyin-data.ts');const {runJob}=await import('../server/index.ts');const {cachedJob}=await import('../server/jobs-cache.ts');
const original=globalThis.fetch;after(()=>{globalThis.fetch=original;db.close();rmSync(dir,{recursive:true,force:true});});
const q={keyword:'恢复分页',platform:'douyin' as const,limit:10,sort:'latest' as const,noteType:'all' as const,interval:250,mode:'live' as const,forceRefresh:true};
const job=(id:string):Job=>({id,type:'search',status:'running',keyword:q.keyword,count:0,pages:0,elapsed:0,resultIds:[],logs:[],source:'live',platform:'douyin',query:q,createdAt:new Date().toISOString()});
const response=(id:string,cursor:number,more:boolean)=>Response.json({code:200,data:{data:[{aweme_info:{aweme_id:id,desc:'恢复分页',author:{uid:'author',nickname:'作者'},statistics:{comment_count:2},video:{cover:{url_list:[]}}}}],cursor,has_more:more}});
test('paid pages resume at persisted cursor, preserving counts and not refetching prior page',async()=>{
 saveDouyinSettings({provider:'tikhub',apiKey:'fixture',maxRequests:20});const cursors:number[]=[];let fail=true;
 globalThis.fetch=(async(_u,init)=>{const c=JSON.parse(String(init?.body)).cursor;cursors.push(c);if(c===10&&fail){fail=false;throw new Error('network');}return response(c===0?'9001':'9002',10,c===0);}) as typeof fetch;
 const j=job('recover');await runJob(j,q);assert.equal(j.status,'failed');assert.equal(j.count,1);assert.ok(j.cursor);put('jobs',j);
 const restored=get<Job>('jobs',j.id)!;await runJob(restored,q);assert.equal(restored.status,'completed');assert.equal(restored.count,2);assert.deepEqual(cursors,[0,10,10]);assert.equal(restored.requests,3);assert.equal(restored.stopReason,'source_exhausted');
 assert.ok(cachedJob({...job('new'),keyword:q.keyword},{...q,forceRefresh:false}));
 put('jobs',{...restored,cacheInvalidatedAt:new Date().toISOString()});assert.equal(cachedJob({...job('new'),keyword:q.keyword},{...q,forceRefresh:false}),undefined);
});
test('new records accompanying invalid pagination are saved before stopping',async()=>{
 let calls=0;globalThis.fetch=(async()=>{calls++;return response(calls===1?'9003':'9004',10,true);}) as typeof fetch;
 const j=job('cycle');await runJob(j,q);assert.equal(calls,2);assert.equal(j.count,2);assert.equal(j.received,2);assert.equal(j.status,'failed');assert.match(j.error||'',/分页/);assert.ok(get('notes','dy:9004'));
});
test('explicit RedFox new batch expires matching job cache but preserves results and task history',async()=>{
 const {app}=await import('../server/index.ts');
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{
  const fingerprint='redfox:fixture',id=fingerprint+':fixture-note:20';
  put('notes',{id:'xhs:fixture-note',nativeId:'fixture-note'});put('xhs-api-tasks',{id,state:'completed',result:[]});
  put('jobs',{...job('redfox-batch'),type:'comments',platform:'xiaohongshu',dataProvider:fingerprint,noteId:'xhs:fixture-note',query:{...q,limit:20},status:'completed'});
  const response=await original('http://127.0.0.1:'+(server.address() as any).port+'/api/xhs-data/new-batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});
  assert.equal(response.status,200);assert.equal(get('xhs-api-tasks',id),undefined);assert.ok(get<Job>('jobs','redfox-batch')?.cacheInvalidatedAt);assert.ok(get('notes','xhs:fixture-note'));
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
