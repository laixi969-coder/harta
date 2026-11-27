import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {writeWorkspace,readWorkspace} from './workspace.mjs';
import {orderReviewAction} from './order-review.mjs';
import {registerOwnedPublication,correctOwnedPublication,adoptAccountReviewMemory} from './account-review.mjs';
import {comparableOutcomes,comparisonEvidence,accountMemoryCurrent} from '../js/creator-review.js';
import {accountReviewSuggestions} from '../js/account-review-suggestions.js';
import {previewAccountCsv} from '../js/account-csv.js';
import {csvCriteria} from '../js/account-csv-carry.js';
import {appendOfficialObservation,officialObservations} from '../js/official-observations.js';
const cwd=process.cwd(), email='order-review@example.test',url='https://www.douyin.com/video/123450';
let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-order-review-'));process.chdir(dir);});
afterAll(()=>{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{
  writeWorkspace(email,{seedVersion:999,customers:[{id:'c',packs:[],drops:[]},{id:'other',packs:[],drops:[]}],acquisition:{accounts:[{id:'a',customerId:'c',name:'主号',platform:'抖音'}],publications:[]}});
  for(const n of [1,2]) registerOwnedPublication(email,{customerId:'c',accountId:'a',title:'作品'+n,url:url+n,goal:'sales',publishedAt:'2025-01-01',confirmed:true});
});
const header='订单号,退款号,日期,金额,作品链接\n';
const input=(rows,extra={})=>({customerId:'c',shop:'店A',source:'商户导出.csv',csv:header+rows.join('\n'),...extra});
const preview=payload=>orderReviewAction(email,{action:'preview',...payload});
const persist=payload=>orderReviewAction(email,{action:'import',...payload,basis:preview(payload).basis,confirmed:true});
const customer=()=>readWorkspace(email).customers[0];
const period=(start='2025-02-01',end='2025-02-28')=>orderReviewAction(email,{action:'window',shop:'店A',customerId:'c',start,end,confirmed:true,revision:customer().orderLedgerRevision});
const two=['1,,2025-02-01,102.50,'+url+'1','2,,2025-02-02,60,'+url+'2'];
it('keeps a shop refund bound to one order across files and treats the same ID in another shop independently',()=>{
  persist(input([...two,'1,refund-7,2025-02-03,8,']));
  const conflict=input(['2,refund-7,2025-02-03,8,']);
  expect(()=>persist(conflict)).toThrow('退款号已属于其他订单');
  expect(customer().orderLedger[1].refunds).toHaveLength(0);
  expect(()=>preview(input([...two,'1,same,2025-02-04,4,','2,same,2025-02-04,4,']))).toThrow('退款号已属于其他订单');
  expect(persist(input([...two,'2,refund-7,2025-02-03,8,'],{shop:'另一家店'})).counts.refunds).toBe(1);
});
it('does not let CSV row order decide between contradictory works for the same payment',()=>{
  const conflicting=['7,,2025-02-01,20,'+url+'1','7,,2025-02-01,20,'+url+'2'];
  for(const rows of [conflicting,[...conflicting].reverse()]) expect(()=>preview(input(rows))).toThrow('同一文件');
  expect(customer().orderLedger).toBeUndefined();
  const sameWork=conflicting[0].replace('/video/','/note/')+'?from=share';
  expect(preview(input([conflicting[0],sameWork])).counts.duplicates).toBe(1);
});
it('preserves a later unregistered source until the publication can be matched',()=>{
  const original='https://www.douyin.com/video/678901';
  persist(input(['3,,2025-02-05,10,']));
  const supplemental=input(['3,,2025-02-05,10,'+original],{source:'补充导出.csv'});
  persist(supplemental);
  expect(customer().orderLedger[0]).toMatchObject({sourceUrl:original,attributionSource:'补充导出.csv',publication:null});
  expect(persist(supplemental).counts.duplicates).toBe(1);
  expect(preview(input(['3,r3,2025-02-06,1,'+original])).counts.refunds).toBe(1);
  registerOwnedPublication(email,{customerId:'c',accountId:'a',title:'后来登记',url:original,goal:'sales',publishedAt:'2025-02-01',confirmed:true});
  expect(persist(supplemental).counts.linked).toBe(1);
});
it('rejects a publication date correction that would put an attributed order before the post in the shop timezone',()=>{
  persist(input(two));
  const p=readWorkspace(email).acquisition.publications.find(p=>p.url===url+'1');
  const edit={customerId:'c',publicationId:p.id,title:p.content.title,url:p.url,version:1,confirmed:true};
  expect(()=>correctOwnedPublication(email,{...edit,publishedAt:'2025-02-01T17:00:00Z'})).toThrow('支付日期');
  expect(readWorkspace(email).acquisition.publications.find(row=>row.id===p.id).metadataVersion).toBe(1);
  expect(()=>correctOwnedPublication(email,{...edit,publishedAt:'2025-02-01T12:00:00Z'})).not.toThrow();
});
it('invalidates an adopted store comparison when reconciliation reopens with more unattributed payments',()=>{
  persist(input(two));period();
  const group=comparableOutcomes(customer(),'sales')[0],fingerprint=createHash('sha256').update(comparisonEvidence(group)).digest('hex');
  adoptAccountReviewMemory(email,{customerId:'c',selection:group,fingerprint,text:'验证订单差异'});
  persist(input(['9,,2025-02-01,1000,']));period();
  expect(accountMemoryCurrent(customer(),customer().creatorMemories[0])).toBe(false);
  const updated=comparableOutcomes(customer(),'sales')[0];
  expect(updated.pendingAttribution).toBe(1);
});
it('uses the shop’s local date for receipts and windows across UTC midnight',()=>{
  vi.useFakeTimers({toFake:['Date']});
  try {
    vi.setSystemTime(new Date('2025-02-01T18:00:00Z'));
    const data=input(['1,,2025-02-02,17,'+url+'1']);
    expect(()=>preview({...data,timeZone:'America/Los_Angeles'})).toThrow('店铺当地今天');
    persist(data);
    period('2025-02-02','2025-02-02');
    expect(customer().orderReviewWindows[0].rows[0].metrics.orders).toBe(1);
  } finally {vi.useRealTimers();}
});
it('imports reordered receipts and refunds once, validates complete windows, pending identity and separate event dates',()=>{
  const data=input(['1,R1,2025-02-05,2.01,',...two,'3,,2025-02-02,9,','1,R2,2025-03-01,10,']);
  expect(preview(data).counts).toMatchObject({added:3,refunds:2,pending:1});
  expect(customer().orderLedger).toBeUndefined();
  persist(data);expect(persist(data).counts.duplicates).toBe(5);
  expect(customer().orderLedgerRevision).toBe(1);
  period();
  const c=customer(),window=c.orderReviewWindows[0],group=comparableOutcomes(c,'sales')[0];
  expect(window.pending).toBe(1);expect(group.comparableSales).toBe(true);
  expect(group.rows.find(r=>r.title==='作品1')).toMatchObject({orders:1,revenue:102.5,refunds:2.01,views:null});
  expect(accountReviewSuggestions(group).map(s=>s.id.split(':')[0])).toEqual(['orders','revenue','refunds']);
  expect(comparableOutcomes(c,'spread')).toHaveLength(0);
  period('2025-03-01','2025-03-31');
  expect(customer().orderReviewWindows[0].rows[0].metrics).toEqual({orders:0,revenue:0,refunds:10});
  expect(()=>orderReviewAction(email,{action:'window',customerId:'other',shop:'店A',revision:1,confirmed:true,start:'2025-03-01',end:'2025-03-31'})).toThrow();
});
it('invalidates published comparison memories when new refunds arrive; refresh only the changed window',()=>{
  persist(input(two));period();const group=comparableOutcomes(customer(),'sales')[0];
  const selection={...group,rows:undefined},fingerprint=createHash('sha256').update(comparisonEvidence(group)).digest('hex');
  adoptAccountReviewMemory(email,{customerId:'c',selection,fingerprint,text:'下次验证选型问题'});const memory=customer().creatorMemories[0];
  expect(accountMemoryCurrent(customer(),memory)).toBe(true);
  persist(input(['1,R,2025-03-01,1,']));expect(customer().orderReviewWindows[0].stale).toBe(false);
  persist(input(['1,R2,2025-02-15,1,']));expect(customer().orderReviewWindows[0].stale).toBe(true);
  expect(accountMemoryCurrent(customer(),memory)).toBe(false);period();
  expect(accountMemoryCurrent(customer(),memory)).toBe(false);expect(comparableOutcomes(customer(),'sales')).toHaveLength(1);
});
it('refuses a stale preview, oversize refund, conflicting identity and foreign attribution without partial writes',()=>{
  const draft=input(two),basis=preview(draft).basis;persist(input(['3,,2025-01-01,5,']));
  expect(()=>orderReviewAction(email,{...draft,action:'import',basis,confirmed:true})).toThrow('预览已变化');
  expect(()=>persist(input([...two,'1,r,2025-02-10,110,']))).toThrow('不能超过');
  expect(()=>persist(input(['1,r,2025-02-10,1,']))).toThrow('缺少原订单');
  expect(customer().orderLedger).toHaveLength(1);
  persist(draft);expect(()=>persist(input(['1,,2025-02-01,102.50,'+url+'2']))).toThrow('不同的作品来源');
  expect(preview(input(two,{customerId:'other'})).counts.pending).toBe(2);
  const p=readWorkspace(email).acquisition.publications[0];
  expect(()=>correctOwnedPublication(email,{customerId:'c',publicationId:p.id,version:1,title:'替换',url:url+'99',publishedAt:'2025-01-01',confirmed:true})).toThrow('订单或官方观测');
  persist(input(['3,,2025-01-01,5,'+url+'1']));expect(customer().orderLedger.find(o=>o.orderId==='3').publication.publicationId).toBe(p.id);
});
it('handles individual posting goals, shares only, order definitions and decimal CSV',()=>{
  const pubs=readWorkspace(email).acquisition.publications;
  const parsed=previewAccountCsv('平台,作品链接,销售额,订单数,退款金额\n抖音,'+url+'1,10.01,1,0.01',pubs,'c')[0];
  expect(parsed.metrics).toEqual({orders:1,revenue:10.01,refunds:0.01});expect(parsed.errors).toHaveLength(0);
  expect(()=>csvCriteria({criteria:'不同'},parsed.metrics,{qualifiedLeads:1},'订单口径')).toThrow();
  const rows=pubs.map((p,i)=>({...p,id:'x'+i,publicationId:p.id,start:'2025-02-01',end:'2025-02-28',goal:'spread',metrics:{shares:i}}));
  const g=comparableOutcomes({accountReviewOutcomes:rows},'spread')[0];expect(g.rows[0].shares).toBe(1);expect(accountReviewSuggestions(g)[0].id).toBe('shares');
  for(const [i,row] of rows.entries()){row.metrics={orders:i};row.criteria=i?'单件':'去重订单';}
  expect(comparableOutcomes({accountReviewOutcomes:rows})).toHaveLength(0);
});
it('migrates an existing official cumulative observation, preserves zero, and replays the same reading once',()=>{
  const first={observedAt:'2025-02-01T10:00:00Z',metrics:{shares:0}},second={observedAt:'2025-02-03T11:04:00Z',metrics:{shares:7}};
  const record={douyinOfficialSnapshot:first};appendOfficialObservation(record,second);appendOfficialObservation(record,second);
  expect(officialObservations(record)).toEqual([first,second]);expect(record.douyinOfficialSnapshot).toBe(second);
  expect(()=>appendOfficialObservation(record,{...second,metrics:{shares:10}})).toThrow('冲突');
});

it('keeps unregistered receipts and refunds together, requires confirmation to change the source, and rejects an order before publication',()=>{
  const unknown='https://example.test/not-registered';
  const draft=input(['4,,2025-01-15,10,'+unknown,'4,r4,2025-01-16,1,'+unknown]);
  expect(preview(draft).counts.pending).toBe(2);persist(draft);
  const correction=input(['4,,2025-01-15,10,'+url+'2']),checked=preview(correction);
  expect(checked.counts.corrected).toBe(1);expect(()=>persist(correction)).toThrow('不同的作品来源');
  orderReviewAction(email,{...correction,action:'import',confirmed:true,confirmCorrections:true,basis:checked.basis});
  const order=customer().orderLedger[0];
  expect(order.sourceUrl).toBe(url+'2');expect(order.attributionHistory[0].previousUrl).toBe(unknown);
  expect(()=>preview(input(['5,,2024-01-01,10,'+url+'2']))).toThrow('支付早于');
});
it('requires evidence for the chosen goal and compares official values independent of key order',()=>{
  const rows=['a','b'].map((id,i)=>({id,publicationId:id,accountId:'aa',platform:'抖音',goal:'spread',start:'2025-03-01',end:'2025-03-07',metrics:{views:100+i}}));
  expect(comparableOutcomes({accountReviewOutcomes:rows})).toHaveLength(1);
  expect(comparableOutcomes({accountReviewOutcomes:rows},'spread')).toHaveLength(0);
  rows.forEach((r,i)=>r.metrics.shares=i);
  expect(accountReviewSuggestions(comparableOutcomes({accountReviewOutcomes:rows},'spread')[0]).map(s=>s.id)).toEqual(['shares']);
  const record={};appendOfficialObservation(record,{observedAt:'2025-01-01T00:00:00Z',metrics:{likes:1,shares:0}});
  appendOfficialObservation(record,{observedAt:'2025-01-01T00:00:00Z',metrics:{shares:0,likes:1}});
  expect(record.douyinOfficialSnapshots).toHaveLength(1);
});
