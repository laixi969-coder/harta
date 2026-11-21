import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeAll, afterAll, beforeEach, describe, expect, it} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {reviewProductionCraft,editProductionCraft,createKeywordComparison,verifyProductionDownload} from './growth-workspace.mjs';
import {previewKeywordComparison} from './keyword-comparison.mjs';
import {comparisonNotes} from '../js/comparison-copy.js';
import {productionDocument} from '../js/production-workflow.js';
import {quotePosition,alignCraftReview,changeCraftReview,craftKey} from '../js/craft-edits.js';
const original=process.cwd(),email='creative-review@example.test',base={customerId:'c',packId:'p',platform:'小红书',index:0,format:'image'},key=craftKey('小红书',0,'image');
const selection={customerId:'c',batchId:'terms',keywordId:'word',left:'product:a',right:'product:b'};
const docs=[{id:'d',title:'蓝款说明',customerId:'c',productId:'b',status:'approved',body:'容量：1.8 升\n清洁：手洗',source:'蓝款手册.pdf',revision:3}];
const batch={id:'terms',sources:['导入表格'],scope:{type:'品牌',name:'厨房'},items:[{id:'word',keyword:'收纳盒怎么选',evidence:[{file:'选题.csv',sheet:'需求',row:3,fields:[{name:'指数',value:'99999'}]}]}]};
function product(id,facts,extra={}){return {id,customerId:'c',name:id+'款',facts,source:id+'标签.pdf',revision:1,status:'active',...extra};}
const source=()=>({seedVersion:999,customers:[{id:'c',name:'厨房',hunt:'收纳',keywordLibraries:[batch],drops:[{id:'p',tier:'今日',origin:{mode:'manual'},shells:{小红书:[{title:'初稿',body:'原稿留在作品内'}]}}]},{id:'other',drops:[]}],
 acquisition:{products:[product('a','容量：1.0 升\n高度：7厘米\n宽度：15 cm\n清洁：可机洗'),product('b','高度：12厘米\n宽度：150 mm'),product('hidden','惊喜', {customerId:'other'})],salesDocuments:structuredClone(docs),skus:[]},usingId:'c'});
let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-creative-test-'));process.chdir(dir);});
afterAll(()=>{process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,source()));
const pack=()=>readWorkspace(email).customers[0].drops[0];
const row=(quote,replacement,extra={})=>({field:'script',quote,replacement,reason:'句子笼统',suggestion:'具体写出动作',...extra});
const generate=(fields,items)=>reviewProductionCraft(email,{...base,fields,version:0},{record:true,budget:(_e,_c,_p,f)=>f(),chatFn:async()=>JSON.stringify({issues:items})});
describe('逐条采用与撤回',()=>{
 it('同字段逆序采用、刷新后逐条撤回，手写旁注与原作品均保留',async()=>{
   const fields={script:'先想想。再看看。',cover:'  手写封面  '},r=await generate(fields,[row('先想想','打开柜门'),row('再看看','量一量净高')]);
   const [first,second]=r.review.issues;
   const edit=(id,action,version,values)=>editProductionCraft(email,{...base,fields:values,issueId:id,reviewId:r.review.id,version,action});
   expect(pack().productionDrafts).toBeUndefined();
   edit(second.id,'apply',0,fields);let d=pack().productionDrafts['小红书|0'];expect(d.fields.script).toBe('先想想。量一量净高。');
   edit(first.id,'apply',1,{...d.fields,script:'笔记：'+d.fields.script});d=pack().productionDrafts['小红书|0'];
   expect(d.fields.script).toBe('笔记：打开柜门。量一量净高。');expect(pack().craftReviews[key].issues.every(i=>i.applied)).toBe(true);
   expect(()=>edit(second.id,'undo',1,d.fields)).toThrow(/已修改/);
   edit(first.id,'undo',2,d.fields);edit(second.id,'undo',3,pack().productionDrafts['小红书|0'].fields);
   expect(pack().productionDrafts['小红书|0'].fields).toMatchObject({script:'笔记：先想想。再看看。',cover:'  手写封面  '});
   expect(pack().shells.小红书[0].body).toBe('原稿留在作品内');
 });
 it('有一条可用就保留；缺依据的笼统建议不能冒充改稿',async()=>{
   const fields={script:'开门看看。'},opts={record:true,budget:(_e,_c,_p,f)=>f()};
   let calls=0;
   const result=await reviewProductionCraft(email,{...base,fields,version:0},{...opts,chatFn:async()=>JSON.stringify({issues:++calls===1?[row('开门看看',null)]:[row('看不到的句子','不采用'),row('开门看看','手轻推柜门')]})});
   expect(calls).toBe(2);expect(result.review.issues).toHaveLength(1);expect(result.review.issues[0].replacement).toBe('手轻推柜门');
 });
 it('兼容围栏 JSON，重新诊断保留已采用项的撤回位置',async()=>{
   const fields={script:'先想想。再看看。'};
   const opts={record:true,budget:(_e,_c,_p,fn)=>fn(),chatFn:async()=>['`'.repeat(3)+'json',JSON.stringify([row('先想想','打开柜门')]),'`'.repeat(3)].join('\n')};
   const first=await reviewProductionCraft(email,{...base,fields,version:0},opts);
   const adopted=first.review.issues[0];
   editProductionCraft(email,{...base,fields,version:0,reviewId:first.review.id,issueId:adopted.id,action:'apply'});
   const draft=pack().productionDrafts['小红书|0'];
   const next=await reviewProductionCraft(email,{...base,fields:draft.fields,version:1},{...opts,chatFn:async()=>JSON.stringify({issues:[row('打开柜门','开柜'),row('再看看','量净高')]})});
   expect(next.review.issues.map(r=>r.quote)).toEqual(['先想想','再看看']);
   editProductionCraft(email,{...base,fields:draft.fields,version:1,reviewId:next.review.id,issueId:adopted.id,action:'undo'});
   expect(pack().productionDrafts['小红书|0'].fields.script).toBe(fields.script);
 });
 it('重复原句须定位；重叠和手改过的原句不可覆盖',()=>{
   expect(quotePosition('盖子 / 盖子','盖子')).toBe(-1);expect(quotePosition('盖子 / 盖子','盖子',2)).toBe(5);
   const fields={script:'左边。右边。'},review={texts:fields,issues:[{...row('左边。','左侧'),id:'a',start:0,applied:false},{...row('边。右','中间'),id:'b',start:1,applied:false}]};
   const next=changeCraftReview(review,fields,'a','apply');
   expect(()=>changeCraftReview(next.review,next.fields,'b','apply')).toThrow(/已被编辑/);
   expect(alignCraftReview(review,{script:'南边。右边。'}).issues[0].start).toBe(-1);
 });
 it('补资料项不提供采用；业务资料更新后阻止旧建议；并发响应不覆盖已完成的诊断',async()=>{
   const fields={script:'先想想再看看'},r=await generate(fields,[row('先想想','看柜门'),row('再看看',null,{missingEvidence:'请补充该柜门的带盖净高记录。'})]);
   const input={...base,version:0,fields,reviewId:r.review.id,action:'apply'};
   expect(()=>editProductionCraft(email,{...input,issueId:r.review.issues[1].id})).toThrow();
   const space=readWorkspace(email);space.customers[0].pitch='业务资料更新';writeWorkspace(email,space);
   expect(()=>editProductionCraft(email,{...input,issueId:r.review.issues[0].id})).toThrow(/依据/);
   expect(()=>editProductionCraft(email,{...input,customerId:'other',issueId:r.review.issues[0].id})).toThrow();
   let release;const wait=new Promise(resolve=>{release=resolve;});
   const earlier=reviewProductionCraft(email,{...base,fields,version:0},{record:true,budget:(_e,_c,_p,f)=>f(),chatFn:async()=>{await wait;return '{"issues":[]}';}});
   const later=await generate(fields,[]);release();await expect(earlier).rejects.toThrow(/已更新/);expect(pack().craftReviews[key].id).toBe(later.review.id);
 });
});
describe('从需求词制作有出处的选型稿',()=>{
 it('从同一业务的两份资料配对差异，逐页、下载和重试保持相同出处',()=>{
   const preview=previewKeywordComparison(readWorkspace(email),selection);
   expect(preview.matches).toHaveLength(3);
   const body={...selection,basis:preview.basis,rows:preview.matches};
   const result=createKeywordComparison(email,body),p=pack(),d=p.productionDrafts['小红书|0'];
   expect(createKeywordComparison(email,body).packId).toBe(result.packId);
   expect(d.fields.script).toContain('容量\na款：1.0 升\nb款：1.8 升');expect(d.fields.script).not.toMatch(/99999|宽度/);
   const notes=comparisonNotes(p.productComparison);expect(notes).toContain('蓝款说明 · v3 · 第1行 · 蓝款手册.pdf');expect(notes).toContain('选题.csv · 需求 · 第3行');
   expect(productionDocument(d.fields,'image','小红书',[],[],p.productComparison)).toContain(notes);
   expect(()=>verifyProductionDownload(email,{...base,packId:p.id,fields:d.fields})).not.toThrow();
   expect(()=>verifyProductionDownload(email,{...base,packId:p.id,fields:{...d.fields,script:d.fields.script.replace('1.8 升','3 升')}})).toThrow(/不一致/);
   const space=readWorkspace(email);space.acquisition.salesDocuments[0].status='archived';writeWorkspace(email,space);
   expect(()=>verifyProductionDownload(email,{...base,packId:p.id,fields:d.fields})).toThrow(/更新|到期/);
   expect(()=>createKeywordComparison(email,body)).toThrow(/变化/);
 });
 it('选型原料停用后仍能撤回已采用的标题，旧稿继续要求核对',async()=>{
   const view=previewKeywordComparison(readWorkspace(email),selection);
   const {packId}=createKeywordComparison(email,{...selection,basis:view.basis,rows:view.matches});
   const d=pack().productionDrafts['小红书|0'],input={...base,packId,job:'convert',fields:d.fields,version:d.version};
   const {review}=await reviewProductionCraft(email,input,{record:true,budget:(_e,_c,_p,f)=>f(),chatFn:async()=>JSON.stringify({issues:[row(d.fields.title,'收纳盒先看高度',{field:'title'})]})});
   const action={...input,issueId:review.issues[0].id,reviewId:review.id};
   editProductionCraft(email,{...action,action:'apply'});const applied=pack().productionDrafts['小红书|0'];
   const s=readWorkspace(email);s.acquisition.products[0].status='archived';writeWorkspace(email,s);
   editProductionCraft(email,{...action,fields:applied.fields,version:applied.version,action:'undo'});
   expect(pack().productionDrafts['小红书|0'].fields.title).toBe(d.fields.title);
   expect(()=>verifyProductionDownload(email,{...input,fields:d.fields})).toThrow();
 });
 it('排除跨业务、过期、重复、冲突及无据项；同产品的两规格独立核对',()=>{
   const s=source();s.acquisition.salesDocuments.push({...docs[0],id:'expired',body:'陈列：旧陈列',expiresAt:'2019-01-01'}, {...docs[0],id:'conflict',body:'容量：2 升'});
   const p=previewKeywordComparison(s,selection);
   expect(p.matches.some(m=>p.left.passages.find(x=>x.id===m.left).dimension==='容量')).toBe(false);
   expect(p.right.passages.some(x=>x.recordId==='expired')).toBe(false);
   for(const data of [{left:'product:hidden'},{left:selection.right},{customerId:'other'}])expect(()=>previewKeywordComparison(s,{...selection,...data})).toThrow();
   const wrong={...selection,basis:p.basis,rows:[{left:p.left.passages[0].id,right:p.right.passages.find(x=>x.dimension==='高度').id}]};writeWorkspace(email,s);
   expect(()=>createKeywordComparison(email,wrong)).toThrow();
   const variants=['x','y'].map((id,i)=>({...product(id,'', {priceTerms:i?'有条件优惠':'旧价格',priceExpiresAt:'2019-01-01'}),productId:'a',attributes:'接口：'+(i?'USB-C':'USB-A')}));
   s.acquisition.skus=variants;const skus=previewKeywordComparison(s,{...selection,left:'sku:x',right:'sku:y'});
   expect(skus.left.passages).toHaveLength(1);expect(skus.right.passages).toHaveLength(1);expect(skus.matches).toHaveLength(1);
   expect(()=>previewKeywordComparison(s,selection)).toThrow();
 });
});
