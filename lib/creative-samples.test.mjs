import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {reviewProductionCraft,editProductionCraft,createKeywordComparison} from './growth-workspace.mjs';
import {previewKeywordComparison} from './keyword-comparison.mjs';
import {prepareKeywordBatch} from './keyword-library.mjs';
import {parseImagePages} from '../js/image-pages.js';
import {productionDocument} from '../js/production-workflow.js';

const original=process.cwd(),owner='public-samples@example.test';let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-creative-samples-'));process.chdir(dir);});
afterAll(()=>{process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
const issue=(field,quote,replacement,reason)=>({field,quote,replacement,reason,suggestion:reason});
const music={
 name:'音乐教育',platform:'小红书',format:'image',title:'第一次音乐试听带什么',
 source:'Orpheus Academy 首次上课提供乐器和乐谱，以前弹过的乐谱可以自愿带来。来源 https://www.orpheusacademy.com/faqs.html',
 before:{script:'第一次来试听，提前准备好学习用品。有过学习经验的孩子，出门前再检查一下。',shots:'第一次音乐试听带什么？\n做好课前准备。\n有经验也要事先准备。'},
 issues:[
  issue('script','提前准备好学习用品','上课要用的琴和谱，学校会准备','回答家长是否需要另买乐器或乐谱。'),
  issue('script','出门前再检查一下','可以带上以前弹过的乐谱','让学过的孩子知道哪一样东西可以带来。'),
  issue('shots','做好课前准备。\n有经验也要事先准备。','琴和谱由学校准备。\n以前弹过的乐谱，可以带来。','把出门前能检查的两种情况放到对应页。')],
};
const kitchen={
 name:'厨房收纳',platform:'抖音',format:'video',title:'柜门为什么关不上',
 source:'验收布景：一个人、一台可固定的手机、柜门和带盖盒。盒子靠前时柜门接触盒盖，往里挪后两者分开。拍摄前需在自家橱柜试位。',
 before:{hook:'先记录使用习惯，再决定收纳方式。',shots:'镜头对准杂乱的台面或打开的柜门，手部动作示意混乱。\n切换至视角跟随人物在厨房走动，模拟拿取高处或远处物品的动作。',script:'先看看柜内物品的摆放。再看看怎样放得更好。'},
 issues:[
  issue('hook','先记录使用习惯，再决定收纳方式。','手轻合柜门，碰到盒盖就停住。','首镜让观众直接看到门为何停下。'),
  issue('shots','镜头对准杂乱的台面或打开的柜门，手部动作示意混乱。\n切换至视角跟随人物在厨房走动，模拟拿取高处或远处物品的动作。','手机固定在柜外侧面，让门沿和盒盖同时入画。手轻轻合门，在接触处停一下。\n同一机位，把盒子往里挪，再合一次门，让门沿从原来碰到的位置通过。','同一只手能复现动作，机位能看清接触点和挪动后的变化。'),
  issue('script','先看看柜内物品的摆放。再看看怎样放得更好。','字幕：门沿碰到了哪里？\n字幕：把盒子往里挪，再合一次。','让无口播版本的两句字幕对应两个可见动作。')],
};
for(const sample of [music,kitchen])it(sample.name+'同稿逐项采用并逐项还原',async()=>{
  const {platform,format}=sample,input={customerId:'c',packId:'p',platform,index:0,format};
  const originalFields={title:sample.title,cover:sample.title,...sample.before};
  writeWorkspace(owner,{seedVersion:999,customers:[{id:'c',name:sample.name,hunt:sample.name,salesMaterial:sample.source,drops:[{id:'p',tier:'今日',origin:{mode:'manual',format},shells:{[platform]:[{title:sample.title,body:sample.before.script}]}}]}]});
  // Frozen editorial responses test the product contract without spending customer model credits in CI.
  const {review}=await reviewProductionCraft(owner,{...input,fields:originalFields,version:0},{record:true,budget:(_e,_c,_p,fn)=>fn(),chatFn:async prompt=>{
    expect(prompt.user).toContain(sample.before.script);expect(prompt.user).toContain(sample.source);return JSON.stringify({issues:sample.issues});
  }});
  let fields=originalFields,version=0;
  function edit(row,action){
    editProductionCraft(owner,{...input,fields,version,action,issueId:row.id,reviewId:review.id});
    const d=readWorkspace(owner).customers[0].drops[0].productionDrafts[platform+'|0'];version=d.version;fields=d.fields;
  }
  for(const row of review.issues)edit(row,'apply');
  expect(review.issues).toHaveLength(3);
  if(sample===music){expect(fields.script).toContain('学校会准备');expect(fields.script).toContain('可以带上以前弹过的乐谱');expect(parseImagePages(fields.shots)).toHaveLength(3);}
  else{const [first,reveal]=fields.shots.split('\n');expect(first).toMatch(/手机固定.*门沿和盒盖同时入画/);expect(reveal).toMatch(/同一机位.*往里挪.*再合一次/);}
  for(const row of review.issues)edit(row,'undo');
  for(const [k,v] of Object.entries(originalFields))expect(fields[k]).toBe(v);
});
it('电商品类词表生成两组可回查的差异和四页可排版成稿',async()=>{
  fs.writeFileSync('选型词.csv','关键词,产品品类\n两款带盖玻璃盒怎么选,食物盒');
  const batch=await prepareKeywordBatch([{name:'选型词.csv',path:'选型词.csv'}],{type:'产品品类',name:'食物盒'},{modelReady:false});
  const sources=['https://www.ikea.com.hk/zh/products/storing-and-washing/food-containers/ikea-365%20-spr-69269072','https://www.ikea.com.hk/zh/products/storing-and-washing/food-containers/ikea-365%2B-spr-99269075'];
  const products=['1.0 升款','1.8 升款'].map((name,i)=>({id:'p'+i,customerId:'c',name,facts:'连盖高度：'+(i?12:7)+' 厘米\n容量：'+(i?'1.8':'1.0')+' 升\n长度：21 厘米\n宽度：15 厘米',source:sources[i],revision:1,status:'active'}));
  writeWorkspace(owner,{seedVersion:999,customers:[{id:'c',name:'食物盒',hunt:'电商',keywordLibraries:[batch],drops:[]}],acquisition:{products,skus:[]}});
  const input={customerId:'c',batchId:batch.id,keywordId:batch.items[0].id,left:'product:p0',right:'product:p1'},view=previewKeywordComparison(readWorkspace(owner),input);
  createKeywordComparison(owner,{...input,basis:view.basis,rows:view.matches,platform:'小红书'});
  const pack=readWorkspace(owner).customers[0].drops[0],d=pack.productionDrafts['小红书|0'];
  expect(pack.productComparison.rows.map(r=>r.dimension)).toEqual(['连盖高度','容量']);expect(parseImagePages(d.fields.shots)).toHaveLength(4);
  const handoff=productionDocument(d.fields,'image','小红书',[],[],pack.productComparison);
  for(const row of pack.productComparison.rows)for(const side of ['left','right'])expect(handoff).toContain(row[side].quote);
  for(const url of sources)expect(handoff).toContain(url);
  expect(handoff).toContain('选型词.csv');expect(d.fields.script).not.toMatch(/更好|更耐用|更便宜/);
});
