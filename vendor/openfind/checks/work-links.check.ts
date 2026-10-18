import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseWorkLinks,workLink} from '../shared/work-links.ts';
import type {AcquisitionInput,Note,Job} from '../shared/types.ts';
const xhs='https://www.xiaohongshu.com/explore/6a603dd70000000008009c00';
const dy='https://www.douyin.com/video/7696057595248889139';
test('Paste accepts share text and deduplicates work identity while retaining XHS access tokens',()=>{
 const parsed=parseWorkLinks(`分享 ${xhs}，复制\n${xhs}?xsec_token=valid&tracking=ignored`);
 assert.equal(parsed.links.length,1);assert.equal(parsed.duplicates,1);assert.match(parsed.links[0],/xsec_token=valid/);assert.doesNotMatch(parsed.links[0],/tracking/);
 assert.equal(workLink('http://xhslink.com/o/abcDEF').platform,'xiaohongshu');
 assert.equal(workLink('https://v.douyin.com/abcDEF/').platform,'douyin');
 assert.equal(workLink('https://www.douyin.com/?modal_id=7696057595248889139').key,workLink(dy).key);
});
test('Batch caps distinct links at ten, rejects mixed platforms and cannot navigate arbitrary hosts',()=>{
 const ten=Array.from({length:10},(_,i)=>`https://www.douyin.com/video/${7696057595248889100n+BigInt(i)}`);
 assert.equal(parseWorkLinks(ten.join('\n')).links.length,10);
 assert.throws(()=>parseWorkLinks([...ten,'https://www.douyin.com/video/7696057595248889999'].join('\n')),/最多10/);
 assert.throws(()=>parseWorkLinks(xhs+'\n'+dy),/同一平台/);
 for(const url of ['https://127.0.0.1/private','https://douyin.com.evil.test/video/1234567890123','https://name@www.douyin.com/video/1234567890123','https://www.douyin.com:8080/video/1234567890123','https://www.xiaohongshu.com/user/profile/123']) assert.throws(()=>workLink(url));
 assert.throws(()=>parseWorkLinks('javascript:alert(1)'));
});
const dir=mkdtempSync(join(tmpdir(),'harta-links-'));process.env.OPENFIND_DATA_DIR=dir;
const {put,get,db}=await import('../server/store.ts');
const {createWorkflow,runWorkflow}=await import('../server/workflows.ts');
after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
const input:AcquisitionInput={keyword:'指定作品',links:[xhs,xhs.replace('6a603dd70000000008009c00','6ac8b61a0000000014039b85')],platform:'xiaohongshu',mode:'live',maxNotes:2,searchLimit:1,commentLimit:20,supplement:false};
function note(id:string):Note{return{id,nativeId:id.slice(4),platform:'xiaohongshu',source:'live',title:'沙发选购',body:'小户型沙发',author:'店铺',authorId:'store',type:'image',images:[],cover:'',likes:0,comments:0,saves:0,publishedAt:'',tags:[],url:xhs,detailState:'complete'};}
test('Explicit links collect even without search popularity, checkpoint failures and resume without repeating completed imports',async()=>{
 const w=createWorkflow(input);let reads=0,fail=true;const jobs:string[]=[];
 const reader=async(url:string)=>{reads++;if(url===input.links![1]&&fail)throw new Error('需要平台验证');return note(url===input.links![0]?'xhs:first':'xhs:second');};
 const execute=async(j:Job)=>{assert.equal(j.type,'comments');jobs.push(j.noteId!);j.status='completed';j.finishedAt=new Date().toISOString();put('jobs',j);};
 await runWorkflow(w,execute,reader);assert.equal(w.status,'paused');assert.equal(w.searchIndex,1);assert.deepEqual(w.noteIds,['xhs:first']);assert.equal(jobs.length,0);
 fail=false;await runWorkflow(w,execute,reader);assert.equal(w.status,'completed');assert.equal(reads,3);assert.deepEqual(jobs,['xhs:first','xhs:second']);assert.equal(get<Note>('notes','xhs:first')?.source,'live');
});
test('Resolved aliases are collected once; foreign-platform or demo results cannot enter a live batch',async()=>{
 const w=createWorkflow(input);let calls=0;
 await runWorkflow(w,async(j)=>{calls++;j.status='completed';put('jobs',j);},async()=>note('xhs:same'));
 assert.equal(calls,1);assert.equal(w.selectedNoteIds.length,1);
 const invalid=createWorkflow(input);await runWorkflow(invalid,async()=>{throw new Error('must not run');},async()=>({...note('dy:foreign'),platform:'douyin'}));
 assert.equal(invalid.status,'paused');assert.equal(invalid.noteIds.length,0);assert.equal(get('notes','dy:foreign'),undefined);
});
