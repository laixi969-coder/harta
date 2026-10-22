import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'harta-budget-'));process.env.OPENFIND_DATA_DIR=dir;
const {db,get,put}=await import('../server/store.ts');
const {reserveRequest,withRequestScope,saveBudget,budgetStatus}=await import('../server/request-budget.ts');
after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
test('nested children and recreated clients share persisted workflow limit; raising quota only allows difference',async()=>{
 saveBudget({flowLimit:2,dailyLimit:5,modelDailyLimit:2});
 await withRequestScope('flow-a',async()=>{reserveRequest('search');await withRequestScope('child-b',async()=>reserveRequest('comments'));});
 assert.throws(()=>withRequestScope('flow-a',()=>reserveRequest('detail')),/流程/);
 assert.equal(get<any>('requestUsage','flow:flow-a').api,2);
 saveBudget({flowLimit:3,dailyLimit:5,modelDailyLimit:2});
 withRequestScope('flow-a',()=>reserveRequest('detail'));
 assert.throws(()=>withRequestScope('flow-a',()=>reserveRequest('detail')),/流程/);
 withRequestScope('flow-b',()=>{reserveRequest('search');reserveRequest('search');});
 assert.throws(()=>withRequestScope('flow-c',()=>reserveRequest('search')),/今日/);
 assert.equal(budgetStatus().today.api,5);
});
test('model retries counted separately; day reset preserves flow usage',()=>{
 reserveRequest('model','model');reserveRequest('model-retry','model');assert.throws(()=>reserveRequest('model','model'),/模型/);
 const tomorrow=new Date(Date.now()+86400000);reserveRequest('search','api','tomorrow',tomorrow);
 assert.equal(budgetStatus(tomorrow).today.api,1);
 assert.equal(get<any>('requestUsage','flow:flow-a').api,3);
});
