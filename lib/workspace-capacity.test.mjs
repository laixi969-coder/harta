import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const pending=vi.hoisted(()=>[]);
vi.mock('./generate.mjs',()=>({
  collectRepairs:vi.fn(),sentenceRepairCount:()=>0,generateBoards:vi.fn(),
  generatePack:vi.fn(),
  generateTodayDrop:vi.fn(()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))),
}));
const {addCustomer,dropToday,readWorkspace,writeWorkspace,sweepStaleJobs}=await import('./workspace.mjs');
let sandbox,cwd;
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const pack=()=>({id:crypto.randomUUID(),shells:{},copies:{},checks:{}});
function seed(email,count=3){
  writeWorkspace(email,{customers:Array.from({length:count},(_,i)=>({id:`c${i}`,name:`测试${i}`,hunt:'家装',pitch:'旧改',track:'存量',packs:[],drops:[]})),ledger:[],feedback:{},usingId:'c0'});
}
beforeEach(()=>{sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'harta-capacity-'));cwd=vi.spyOn(process,'cwd').mockReturnValue(sandbox);});
afterEach(async()=>{
  for(const p of pending.splice(0))p.resolve(pack());
  await flush();cwd.mockRestore();fs.rmSync(sandbox,{recursive:true,force:true});
});
it('一个账号最多两项真实后台任务，拒绝重复建档；完成后释放容量',async()=>{
  const email='capacity@example.com';seed(email);
  expect(dropToday(email,'c0').error).toBeUndefined();
  expect(dropToday(email,'c1').error).toBeUndefined();
  expect(dropToday(email,'c2')).toMatchObject({status:429,retryAfter:30});
  expect(addCustomer(email,{name:'拒绝的新客户',hunt:'家装',pitch:'旧改',track:'拓新'}).status).toBe(429);
  expect(readWorkspace(email).customers).toHaveLength(3);
  expect(readWorkspace(email).customers[2].job).toBeUndefined();
  pending[0].resolve(pack());await flush();
  expect(dropToday(email,'c2').error).toBeUndefined();
});
it('全局最多八项后台任务，一个账号不挤占全部资源，失败也释放容量',async()=>{
  for(let i=0;i<4;i++){
    const email=`global${i}@example.com`;seed(email);
    expect(dropToday(email,'c0').error).toBeUndefined();
    expect(dropToday(email,'c1').error).toBeUndefined();
  }
  const email='global4@example.com';seed(email);
  expect(dropToday(email,'c0').status).toBe(429);
  pending[0].reject(Error('测试失败'));await flush();
  expect(dropToday(email,'c0').error).toBeUndefined();
});
it('界面超时不提前释放仍未结束的上游请求，重试无法突破真实并发上限',async()=>{
  const email='timeout@example.com';seed(email);
  dropToday(email,'c0');
  const expire=()=>{
    const space=readWorkspace(email);space.customers[0].job.startedAt=Date.now()-26*60000;
    writeWorkspace(email,space);sweepStaleJobs(email);
  };
  expire();expect(dropToday(email,'c0').error).toBeUndefined();
  expire();expect(dropToday(email,'c0').status).toBe(429);
  pending[0].resolve(pack());await flush();
  expect(readWorkspace(email).customers[0].drops).toHaveLength(0);
  expect(dropToday(email,'c0').error).toBeUndefined();
});
it('后台失败状态无法落盘时不产生未处理拒绝，仍释放资源名额',async()=>{
  const email='disk-failure@example.com';seed(email);
  dropToday(email,'c0');dropToday(email,'c1');
  const error=vi.spyOn(console,'error').mockImplementation(()=>{});
  const rename=vi.spyOn(fs,'renameSync').mockImplementation(()=>{throw Error('磁盘不可写');});
  try {
    pending[0].reject(Error('上游含敏感数据的失败'));await flush();
    expect(error).toHaveBeenCalledWith('Harta 后台任务状态保存失败，请检查工作区存储。');
  } finally {rename.mockRestore();error.mockRestore();}
  expect(dropToday(email,'c2').error).toBeUndefined();
});
