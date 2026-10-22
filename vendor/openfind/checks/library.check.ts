import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import express from 'express';
const dir=mkdtempSync(join(tmpdir(),'harta-library-'));process.env.OPENFIND_DATA_DIR=dir;
const {db,put}=await import('../server/store.ts');const {default:router,organizationFor}=await import('../server/library.ts');const {businessFit}=await import('../shared/business-fit.ts');
const app=express();app.use(express.json());app.use(router);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));db.close();rmSync(dir,{recursive:true,force:true});});
const call=(path:string,body:unknown,method='PUT')=>fetch(origin+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('bulk archive is reversible and stale revisions cannot overwrite later edits',async()=>{
 put('notes',{id:'a'});put('notes',{id:'b'});
 const first=await call('/library/organize',{items:[{id:'a',revision:0},{id:'b',revision:0}],change:{archived:true,category:'询价'}});assert.equal(first.status,200);const {undoId}=await first.json();
 assert.equal(organizationFor('a').archived,true);assert.equal((await call('/library/undo',{id:undoId},'POST')).status,200);assert.equal(organizationFor('a').archived,false);
 assert.equal((await call('/library/organize',{items:[{id:'a',revision:0}],change:{archived:true}})).status,409);
 assert.equal((await call('/library/undo',{id:undoId},'POST')).status,409);
 assert.equal((await call('/library/organize',{items:[{id:'missing',revision:0}],change:{archived:true}})).status,409);
});
test('business matching uses explicit text; unknown location never becomes an inferred address',()=>{
 assert.equal(businessFit('代理加盟报价',{excludeTerms:'加盟'}).eligible,false);
 assert.equal(businessFit('请问床垫多少钱',{needTerms:'床垫,沙发',serviceArea:'上海'}).eligible,true);
 assert.match(businessFit('请问床垫多少钱',{serviceArea:'上海'}).reason,/人工核实/);
 assert.equal(businessFit('不错',{needTerms:'床垫'}).eligible,false);
});
