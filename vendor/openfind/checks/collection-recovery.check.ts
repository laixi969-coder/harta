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
test('repeat search summaries retain complete content while refreshing known engagement',async()=>{
 const {saveXhsSettings}=await import('../server/xhs-data.ts');
 saveXhsSettings({provider:'tikhub',apiKey:'fixture'});
 const id='xhs:detail-keep';
 put('notes',{id,nativeId:'detail-keep',platform:'xiaohongshu',source:'live',title:'完整标题',body:'完整正文',author:'原作者',authorId:'author-id',images:['full1','full2'],tags:['完整标签'],comments:19,commentCountKnown:true,likes:1,saves:0,type:'image',publishedAt:'2026-10-01T00:00:00.000Z',detailState:'complete',url:'https://www.xiaohongshu.com/explore/detail-keep'});
 globalThis.fetch=(async()=>Response.json({code:200,data:{items:[{id:'detail-keep',note_card:{title:'新标题',desc:'搜索卡片中的摘要正文',type:'normal',user:{},interact_info:{liked_count:50},cover:{url_default:'cover'}}}],has_more:false}})) as typeof fetch;
 const input={...q,platform:'xiaohongshu' as const},j={...job('keep-detail'),platform:'xiaohongshu' as const,query:input};
 await runJob(j,input);assert.equal(j.status,'completed');
 const saved=get<any>('notes',id);assert.equal(saved.body,'完整正文');assert.deepEqual(saved.images,['full1','full2']);assert.deepEqual(saved.tags,['完整标签']);assert.equal(saved.authorId,'author-id');assert.equal(saved.comments,19);assert.equal(saved.likes,50);assert.equal(saved.title,'新标题');assert.equal(saved.detailState,'complete');
 const {saveCollectedNote}=await import('../server/collected-note.ts');
 saveCollectedNote({...saved,id:'xhs:new-search',body:'搜索摘要',detailState:'complete'}, 'search');
 assert.equal(get<any>('notes','xhs:new-search').detailState,'summary');
 saveCollectedNote({...saved,body:'新完整正文',images:['new-full'],detailState:'complete'}, 'detail');
 assert.equal(get<any>('notes',id).body,'新完整正文');assert.deepEqual(get<any>('notes',id).images,['new-full']);
});
test('unrecognized later comment pages fail and preserve the already-saved first page',async()=>{
 const {saveXhsSettings}=await import('../server/xhs-data.ts');saveXhsSettings({provider:'tikhub',apiKey:'fixture'});
 put('notes',{id:'xhs:comment-parent',nativeId:'comment-parent'});
 let calls=0;globalThis.fetch=(async()=>Response.json({code:200,data:++calls===1?{comments:[{id:'saved-before-error',content:'有效评论'}],has_more:true,cursor:'next'}:{comments:[{unexpected:'shape'}],has_more:false}})) as typeof fetch;
 const input={...q,platform:'xiaohongshu' as const},j={...job('comment-shape'),platform:'xiaohongshu' as const,type:'comments' as const,noteId:'xhs:comment-parent',query:input};
 await runJob(j,input);assert.equal(j.status,'failed');assert.equal(j.count,1);assert.equal(j.requests,2);assert.match(j.error||'',/评论字段无法识别/);assert.ok(get('comments','xhs:saved-before-error'));
});
test('HTTP link collection rejects unsupported detail before creating a workflow or browser read',async()=>{
 const {app}=await import('../server/index.ts');const {all}=await import('../server/store.ts');const {protectionStatus}=await import('../server/protection.ts');
 saveDouyinSettings({provider:'http'});const before=all('workflows').length,reads=protectionStatus('douyin').counts.search;
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{
  const response=await original('http://127.0.0.1:'+(server.address() as any).port+'/api/workflows',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyword:'指定作品',links:['https://www.douyin.com/video/7696057595248889139'],platform:'douyin',mode:'live'})});
  assert.equal(response.status,400);assert.match((await response.json()).error,/HTTP 数据源不支持/);assert.equal(all('workflows').length,before);assert.equal(protectionStatus('douyin').counts.search,reads);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('explicit RedFox detail refresh replaces completed content and stays complete in stored state',async()=>{
 const {saveXhsSettings,xhsClient}=await import('../server/xhs-data.ts');
 const {saveCollectedNote}=await import('../server/collected-note.ts');
 saveXhsSettings({provider:'redfox',apiKey:'fixture'});
 const previous={id:'xhs:redfox-detail',nativeId:'redfox-detail',platform:'xiaohongshu' as const,source:'live' as const,title:'旧标题',body:'旧完整正文',author:'作者',authorId:'author',images:[],tags:[],comments:0,likes:1,saves:0,type:'image' as const,publishedAt:'',detailState:'complete' as const,url:'https://www.xiaohongshu.com/explore/redfox-detail'};
 put('notes',previous);
 const client=xhsClient(undefined,async()=>Response.json({code:2000,data:{workId:'redfox-detail',workTitle:'新标题',workDesc:'主动读取的新完整正文'}}));
 const detail=await client.detail(previous);assert.equal(detail.detailState,'complete');
 saveCollectedNote(detail,'detail');assert.equal(get<any>('notes',previous.id).body,'主动读取的新完整正文');assert.equal(get<any>('notes',previous.id).detailState,'complete');
});
test('RedFox Douyin detail refresh replaces completed content instead of retaining the old body',async()=>{
 const {douyinClient}=await import('../server/douyin-data.ts');const {saveCollectedNote}=await import('../server/collected-note.ts');
 saveDouyinSettings({provider:'redfox',apiKey:'fixture',maxRequests:20});
 const previous={id:'dy:redfox-detail',nativeId:'redfox-detail',platform:'douyin' as const,source:'live' as const,title:'旧标题',body:'旧完整正文',author:'作者',authorId:'author',images:[],tags:[],comments:0,likes:1,saves:0,type:'video' as const,publishedAt:'',detailState:'complete' as const,url:'https://www.douyin.com/video/redfox-detail'};put('notes',previous);
 const detail=await douyinClient(undefined,async()=>Response.json({code:2000,data:{workId:'redfox-detail',title:'新标题',content:'新完整正文'}})).detail(previous);
 assert.equal(detail.detailState,'complete');assert.equal(saveCollectedNote(detail,'detail').body,'新完整正文');
});
