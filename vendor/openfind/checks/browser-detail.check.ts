import {test,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Note} from '../shared/types.ts';
const dir=mkdtempSync(join(tmpdir(),'harta-browser-detail-'));process.env.OPENFIND_DATA_DIR=dir;process.env.NODE_ENV='test';
const {db,put,configSet}=await import('../server/store.ts');
const {readDetail,readWorkLink}=await import('../server/platforms/browser.ts');
const {freshProtection,protectionStatus}=await import('../server/protection.ts');
const note:Note={id:'dy:7696057595248889139',nativeId:'7696057595248889139',platform:'douyin',source:'live',title:'详情测试',body:'搜索摘要',author:'作者',authorId:'author',images:[],tags:[],comments:1,likes:1,saves:0,type:'video',publishedAt:'',detailState:'summary',url:'https://www.douyin.com/video/7696057595248889139'};
beforeEach(()=>{configSet('protection:douyin',JSON.stringify(freshProtection()));put('notes',note);});
after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
test('Douyin browser summary reads the official work link and charges one protected read',async()=>{
 let calls=0;const controller=new AbortController();
 const result=await readDetail(note,controller.signal,false,async(url,signal,options)=>{calls++;assert.equal(url,note.url);assert.equal(signal,controller.signal);assert.equal(options?.force,false);return {...note,body:'真实完整正文',detailState:'complete'};});
 assert.equal(calls,1);assert.equal(result.body,'真实完整正文');assert.equal(result.detailState,'complete');assert.equal(protectionStatus('douyin').counts.search,1);
});
test('complete details use cache without browser budget, explicit refresh bypasses it',async()=>{
 const complete={...note,body:'旧正文',detailState:'complete' as const};put('notes',complete);
 let calls=0;const reader=async(_url:string,_signal?:AbortSignal,options?:{force?:boolean})=>{calls++;assert.equal(options?.force,true);return {...complete,body:'新正文'};};
 assert.equal((await readDetail(note,undefined,false,reader)).body,'旧正文');
 assert.equal((await readWorkLink(note.url)).body,'旧正文');assert.equal(calls,0);assert.equal(protectionStatus('douyin').counts.search,0);
 assert.equal((await readDetail(complete,undefined,true,reader)).body,'新正文');assert.equal(calls,1);assert.equal(protectionStatus('douyin').counts.search,1);
});
test('paused and aborted detail reads never launch or charge; incomplete results are rejected',async()=>{
 let calls=0;const reader=async()=>{calls++;return note;};const controller=new AbortController();controller.abort();
 await assert.rejects(readDetail(note,controller.signal,false,reader),/abort/i);
 await assert.rejects(readWorkLink(note.url,controller.signal,{force:true}),/abort/i);
 configSet('protection:douyin',JSON.stringify({...freshProtection(),paused:true}));
 await assert.rejects(readDetail(note,undefined,false,reader),/暂停/);assert.equal(calls,0);assert.equal(protectionStatus('douyin').counts.search,0);
 configSet('protection:douyin',JSON.stringify(freshProtection()));
 await assert.rejects(readDetail(note,undefined,false,reader),/完整详情/);assert.equal(calls,1);
});
test('abort during the protected interval stops before reservation and read',async()=>{
 configSet('protection:douyin',JSON.stringify({...freshProtection(),lastReadAt:Date.now()}));const controller=new AbortController();let calls=0;
 const pending=readDetail(note,controller.signal,false,async()=>{calls++;return {...note,detailState:'complete'};});controller.abort();
 await assert.rejects(pending,/abort/i);assert.equal(calls,0);assert.equal(protectionStatus('douyin').counts.search,0);
});
