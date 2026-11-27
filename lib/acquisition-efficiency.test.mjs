import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { batchReview } from './acquisition-efficiency.mjs';
import { businessResults } from '../js/business-results.js';
import { saveLeadQualification,saveQualificationPolicy } from './lead-qualification.mjs';

const at=n=>new Date(Date.now()+n).toISOString();
let db,flow,acq;
const put=(kind,value)=>db.prepare('INSERT OR REPLACE INTO entities VALUES(?,?,?)').run(kind,value.id,JSON.stringify(value));
const call=(action,extra={})=>batchReview(db,acq,'b',{action,flowId:'f',...extra});
beforeEach(()=>{
  db=new DatabaseSync(':memory:');db.exec('CREATE TABLE entities(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
  flow={id:'f',tracksFlowRequests:true,status:'completed',input:{keyword:'收纳',mode:'live',platform:'douyin'},createdAt:at(-20000),finishedAt:at(-10000),selectedNoteIds:['dy:note'],commentIds:['dy:1','dy:2','dy:3']};
  put('workflows',flow);
  put('notes',{id:'dy:note',source:'live',platform:'douyin',title:'收纳配件',body:'',tags:[],authorId:'seller'});
  for(const [i,body] of ['这个哪里买求链接','收纳这个怎么买求链接','无关评论'].entries())put('comments',{id:'dy:'+(i+1),noteId:'dy:note',source:'live',platform:'douyin',body,author:'私人昵称',authorId:'person'+i,createdAt:at(-32000+i)});
  acq={works:[{id:'work',customerId:'b',platform:'抖音',openfindIds:['dy:note']}],
    signals:[{id:'signal',customerId:'b',workId:'work',platform:'抖音',leadId:'lead',recordId:'1',status:'confirmed',text:'这个哪里买求链接',publishedAt:at(-32000),review:{at:at(-8500)}}],
    leads:[{id:'lead',customerId:'b',platform:'抖音',authorId:'person0',stage:'已联系',sourcePaths:['active'],createdAt:at(-8000),signalIds:['signal'],messages:[{status:'sent_manual',direction:'outbound'}],events:[]}]};
});
afterEach(()=>db.close());
function qualify(commitment='appointment',baseRevision=0,policyRevision=0) {
  saveLeadQualification(acq,'b',{action:'qualify-lead',leadId:'lead',fit:'yes',need:'specific',commitment,note:'本人核对这次购买需求与可服务范围',sourceKey:'signal:signal',sourceQuote:acq.signals[0].text,baseRevision,policyRevision});
}
it('按业务标准、适配与证据核实；实际联系不增加有效人数；撤销、改版与失效立即生效',()=>{
  const current=()=>businessResults(acq,'b').paths.active;
  expect(current()).toMatchObject({contacted:1,qualified:0});
  qualify('none');expect(current().qualified).toBe(0);
  saveQualificationPolicy(acq,'b',{effectiveCondition:'fit-need',fitCriteria:'本市可上门服务',actions:['appointment'],reviewDays:10,baseRevision:0});
  expect(current().qualified).toBe(0);
  qualify('none',1,1);expect(current().qualified).toBe(1);
  acq.signals[0].text='原评论已更正';expect(current().qualified).toBe(0);
  qualify('appointment',2,1);expect(current().qualified).toBe(1);
  acq.leads[0].qualification.observedAt=at(-11*86400000);expect(current().qualified).toBe(0);
  acq.leads[0].qualification.observedAt=at(-1000);
  acq.leads.push({...acq.leads[0],id:'second',doNotContact:true});expect(current().qualified).toBe(0);
  acq.leads.pop();
  saveLeadQualification(acq,'b',{action:'clear-qualification',leadId:'lead',note:'撤销',baseRevision:3,policyRevision:1});expect(current().qualified).toBe(0);
});
it('盲核隐藏排序、保存可重进、避免重复覆盖、匿名导出可直接用于离线前十对照',()=>{
  const start=call('start').review;
  expect(start.total).toBe(3);expect(start.results).toBeNull();expect(Object.keys(start.next).sort()).toEqual(['id','quote','title']);
  expect(call('start').review).toEqual(start);
  expect(()=>call('export')).toThrow('先完成');
  let review=start;
  while(review.next){
    const input={sampleId:review.next.id,revision:review.revision,verdict:review.next.quote==='无关评论'?'incomplete':'fit',seconds:8};
    review=call('judge',input).review;
    expect(()=>call('judge',input)).toThrow('已更新');
  }
  expect(review.seconds).toBe(24);
  expect(review.results.current).toEqual({total:2,hits:2,judged:2});
  expect(review.results).toMatchObject({sampled:1,sampleJudged:0,sampleHits:0,rejected:1});
  const files=call('export');
  expect(files.current.split('\n')).toHaveLength(2);expect(files.qrels.split('\n')).toHaveLength(2);
  expect(JSON.stringify(files)).not.toMatch(/私人昵称|person0|dy:|无关评论|收纳/);
  expect(call('open').review.completed).toBe(true);
});
it('零客资保留真实投入，费率留空，重复批次、已存在的联系人不领取新增信用',()=>{
  put('requestUsage',{id:'flow:f',api:8,model:1});const later={...flow,id:'f2',createdAt:at(-12000)};put('workflows',later);
  call('start');let r=call('time',{revision:0,minutes:15});
  expect(r.batches.find(b=>b.id==='f')).toMatchObject({count:0,api:8,model:1,minutes:15,perApi:null,perMinutes:null});
  qualify();r=call('open');
  expect(r.batches.find(b=>b.id==='f')).toMatchObject({count:1,perApi:8,perMinutes:15});expect(r.batches.find(b=>b.id==='f2').count).toBe(0);
  acq.leads[0].authorId='';expect(call('open').batches.every(b=>b.count===0)).toBe(true);
  acq.leads[0].authorId='person0';acq.leads[0].createdAt=at(-33000);expect(call('open').batches.every(b=>b.count===0)).toBe(true);
  put('workflows',{...flow,id:'historic',tracksFlowRequests:undefined,commentIds:[]});expect(call('open').batches.find(b=>b.id==='historic')).toMatchObject({api:null,model:null});
  put('workflows',{...flow,id:'demo',input:{...flow.input,mode:'demo'}});expect(()=>call('open',{flowId:'demo'})).toThrow('真实采集');
});
it('同池前十按平台身份去重，词匹配试验可能调入原榜末位，排除抽样有上限',()=>{
  const ids=[];
  for(let i=0;i<24;i++) {
    const id='dy:many-'+i;ids.push(id);
    // Two comments share a buyer; lower-ranked business-specific evidence can enter the trial top ten.
    const body=i<13 ? (i===12?'收纳怎么买求链接':'这个怎么买求链接') : '普通讨论';
    put('comments',{id,noteId:'dy:note',source:'live',platform:'douyin',body,authorId:i===1?'buyer0':'buyer'+i,createdAt:at(-30000-i*100)});
  }
  put('workflows',{...flow,commentIds:ids});
  let view=call('start').review;
  expect(view.total).toBe(16);
  while(view.next) view=call('judge',{sampleId:view.next.id,revision:view.revision,verdict:view.next.quote.includes('收纳')?'fit':'irrelevant',seconds:2}).review;
  expect(view.results.current).toEqual({total:10,judged:10,hits:0});
  expect(view.results.trial).toEqual({total:10,judged:10,hits:1});
  expect(view.results).toMatchObject({rejected:11,sampled:5});
});
