import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readWorkspace, writeWorkspace, editLine } from './workspace.mjs';
import { saveGrowthSettings, saveOutcomes, saveFactCards, preparePostRewrite, applyPostVersion, validateOutcome, postRevision, proposeFactCards } from './growth-workspace.mjs';
import { researchFingerprint } from './research.mjs';
import { growthGoal, outcomeAssessment } from '../js/growth.js';
import { packAsSent } from './pack-edits.mjs';
import { businessMaterialContext } from './content-context.mjs';
const email='growth-test@example.com', original=process.cwd();
let dir;
const content = { title:'拆墙前核对什么',cover:'先查结构资料',coverLayout:'纸上标出待确认位置',body:'拆墙前先核对房屋原始结构资料，无法判断承重关系时请结构专业人员确认，不要仅凭墙体厚度决定施工。' };
const candidate = { content:{...content,title:'这面墙能拆吗',body:'准备改动墙体时，先找出原始结构图，标记想调整的位置。拿不准的地方请结构专业人员核对，再决定是否施工。'},execution:{order:1,purpose:'消除决策疑虑'} };
const args = {customerId:'c1',packId:'p1',platform:'小红书',index:0};
const outcome = () => ({platform:'小红书',index:0,start:'2026-01-01',end:'2026-01-07',source:'平台后台截图',metrics:{views:0},baseline:null});
const pack = () => readWorkspace(email).customers[0].drops[0];
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-growth-tests-'));fs.symlinkSync(path.join(original,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{customers:[{id:'c1',name:'测试',hunt:'家装',salesMaterial:'我们只提供杭州地区的厨房局部翻新服务。',drops:[{id:'p1',tier:'今日',origin:{mode:'organic',goal:'reach'},businessSnapshot:{name:'测试',industry:'家装',material:businessMaterialContext({salesMaterial:'我们只提供杭州地区的厨房局部翻新服务。'}).text,factCards:[]},copies:{A:[content.body]},shells:{小红书:[content]},execution:[{order:1,purpose:'说明核对方法'}]}]}],ledger:[],feedback:{},contentStates:{}}));
describe('增长目标与效果数据',()=>{
 it('目标、条件与事实改变后缓存失效，旧批目标不改写',()=>{
  const c=readWorkspace(email).customers[0], before=researchFingerprint(c,{});
  const next=saveGrowthSettings(email,{customerId:'c1',goal:'sales',criteria:'成交厨房产品'}).customers[0];
  expect(researchFingerprint(next,{})).not.toBe(before);expect(next.drops[0].origin.goal).toBe('reach');
  expect(growthGoal({})).toBe('leads');
  expect(()=>saveGrowthSettings(email,{customerId:'c1',goal:'__proto__'})).toThrow('目标');
 });
 it('账号隔离，跨客户与伪造篇目不能写入',()=>{
  expect(()=>saveOutcomes('other@example.com',{...args,rows:[outcome()]})).toThrow('找不到');
  expect(()=>saveOutcomes(email,{...args,customerId:'other',rows:[outcome()]})).toThrow('找不到');
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),index:-1}]})).toThrow('找不到');
  expect(pack().outcomes).toBeUndefined();
 });
 it('导入全量校验后才落盘，未知与零不同且重叠窗口不相加',()=>{
  expect(()=>saveOutcomes(email,{...args,rows:[outcome(),{...outcome(),index:10}]})).toThrow();expect(pack().outcomes).toBeUndefined();
  saveOutcomes(email,{...args,rows:[outcome()]});saveOutcomes(email,{...args,rows:[{...outcome(),metrics:{views:20,shares:null}}]});
  const rows=pack().outcomes['小红书|0'];expect(rows).toHaveLength(2);expect(rows[0].metrics).toEqual({views:20});expect(rows[1].metrics.views).toBe(0);
  expect(outcomeAssessment('reach',rows[1]).text).toContain('：0');expect(outcomeAssessment('sales',rows[1]).text).toContain('待验证');
 });
 it.each([{views:-1},{views:1.2},{views:'1'},{views:Infinity},{wrong:3}])('拒绝异常指标 %j',metrics=>expect(()=>validateOutcome({...outcome(),metrics})).toThrow());
 it('拒绝无效日期、未来日期、无依据的基线、未定义归因和重复篇目',()=>{
  for(const update of [{start:'2026-02-30'},{end:'2999-01-01'},{baseline:10},{metrics:{qualifiedLeads:2}},{metrics:{orders:1}}])expect(()=>validateOutcome({...outcome(),...update})).toThrow();
  expect(()=>saveOutcomes(email,{...args,rows:[outcome(),outcome()]})).toThrow('重复');
  expect(outcomeAssessment('reach',{metrics:{views:1},baseline:0}).text).not.toContain('Infinity');
 });
 it('效果保存时保留实际编辑版本，后来的改稿不覆盖快照',()=>{
  editLine(email,'p1','小红书|0|body','编辑后的可见正文。');saveOutcomes(email,{...args,rows:[outcome()]});
  editLine(email,'p1','小红书|0|body','第二次编辑。');expect(pack().outcomes['小红书|0'][0].content.body).toBe('编辑后的可见正文。');
 });
 it('事实保存有历史，待确认不会冒充确认',()=>{
  const cards=[{text:'仅在杭州提供服务',source:'业务负责人确认',status:'pending'}];
  saveFactCards(email,{customerId:'c1',cards});saveFactCards(email,{customerId:'c1',cards:[{...cards[0],status:'confirmed'}]});
  const c=readWorkspace(email).customers[0];expect(c.factHistory.at(-1).cards[0].status).toBe('pending');expect(c.factCards[0].status).toBe('confirmed');
 });
});
describe('单篇改写的并发与版本',()=>{
 it('候选先保存，采用后才能改变正文，恢复保留版本且发布状态回到待发布',async()=>{
  const space=readWorkspace(email);space.contentStates['p1::小红书|0|body']={status:'published',publishedAt:'2026-01-01'};writeWorkspace(email,space);
  await preparePostRewrite(email,{...args,instruction:'开头具体一些'},async()=>candidate);
  expect(packAsSent(pack()).shells.小红书[0].body).toBe(content.body);
  applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
  expect(packAsSent(pack()).copies.A[0]).toBe(candidate.content.body);expect(readWorkspace(email).contentStates['p1::小红书|0|body'].status).toBe('selected');
  applyPostVersion(email,{...args,restoreId:pack().postVersions['小红书|0'][0].id});
  expect(packAsSent(pack()).shells.小红书[0].body).toBe(content.body);expect(pack().postVersions['小红书|0']).toHaveLength(2);
 });
 it('生成期间的人工改稿不会被候选覆盖；失败后锁被释放',async()=>{
  let release;const pending=preparePostRewrite(email,{...args,instruction:'更具体'},()=>new Promise(resolve=>release=resolve));
  await expect(preparePostRewrite(email,{...args,instruction:'再次改'},async()=>candidate)).rejects.toThrow('正在改写');
  editLine(email,'p1','小红书|0|body','用户新定稿。');release(candidate);await expect(pending).rejects.toThrow('原文已修改');
  await preparePostRewrite(email,{...args,instruction:'基于新稿'},async()=>candidate);expect(pack().rewriteDrafts).toBeTruthy();
 });
 it('采用前再次检查原文版本，不覆盖后来的编辑',async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>candidate);const id=pack().rewriteDrafts['小红书|0'].id;
  editLine(email,'p1','小红书|0|title','用户的新标题');expect(()=>applyPostVersion(email,{...args,draftId:id})).toThrow('原文已变化');
 });
 it('模型等待期间其他目标修改不会丢失',async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>{saveGrowthSettings(email,{customerId:'c1',goal:'sales'});return candidate;});
  expect(readWorkspace(email).customers[0].growthGoal).toBe('sales');expect(postRevision(pack(),'小红书',0)).toHaveLength(64);
 });
 it('事实摘录等待期间资料变化时拒绝旧结果',async()=>{
  await expect(proposeFactCards(email,{customerId:'c1'},async()=>{saveFactCards(email,{customerId:'c1',cards:[{text:'新确认的服务范围',source:'负责人',status:'confirmed'}]});return {cards:[]};})).rejects.toThrow('资料或事实已变化');
 });
});

it('候选准备完成后业务事实变化，采用时必须重新核对',async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>candidate);
  const draftId=pack().rewriteDrafts['小红书|0'].id;
  saveFactCards(email,{customerId:'c1',cards:[{text:'业务已变更，不再提供此服务',source:'负责人',status:'confirmed'}]});
  expect(()=>applyPostVersion(email,{...args,draftId})).toThrow('业务资料已更新');
});

it('历史恢复不能绕过业务资料变更检查，也不能恢复缺少资料基准的旧版本', async()=>{
  await preparePostRewrite(email,{...args,instruction:'更具体'},async()=>candidate);
  applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
  const versionId=pack().postVersions['小红书|0'][0].id;
  saveFactCards(email,{customerId:'c1',cards:[{text:'不再提供厨房翻新服务',source:'负责人',status:'confirmed'}]});
  expect(()=>applyPostVersion(email,{...args,restoreId:versionId})).toThrow('业务资料已变化');
  expect(packAsSent(pack()).shells.小红书[0].body).toBe(candidate.content.body);
  expect(pack().postVersions['小红书|0']).toHaveLength(1);
  const space=readWorkspace(email); delete space.customers[0].drops[0].postVersions['小红书|0'][0].basisRevision; writeWorkspace(email,space);
  expect(()=>applyPostVersion(email,{...args,restoreId:versionId})).toThrow('无法核对');
});

it('重复事实整理不会重复调用模型，模型失败后可以重试',async()=>{
  let reject;
  const pending=proposeFactCards(email,{customerId:'c1'},()=>new Promise((resolve,no)=>{reject=no;}));
  let called=false;
  await expect(proposeFactCards(email,{customerId:'c1'},async()=>{called=true;return {cards:[]};})).rejects.toThrow('正在整理');
  expect(called).toBe(false);
  reject(new Error('network failure')); await expect(pending).rejects.toThrow('network failure');
  await proposeFactCards(email,{customerId:'c1'},async()=>({cards:[],coverage:'test',context:'test'}));
  expect(readWorkspace(email).customers[0].factExtraction.coverage).toBe('test');
});

 it('在资料变化后改写，旧正文不会被重新标记为基于最新资料', async()=>{
  saveFactCards(email,{customerId:'c1',cards:[{text:'新服务范围仅限杭州余杭',source:'负责人',status:'confirmed'}]});
  await preparePostRewrite(email,{...args,instruction:'改成新服务范围'},async()=>candidate);
  applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
  const old=pack().postVersions['小红书|0'][0];
  expect(old.basisRevision).toBeNull();
  expect(()=>applyPostVersion(email,{...args,restoreId:old.id})).toThrow('无法核对');
 });

it('适用范围与归因说明过长时明确拒绝，不静默清空后保存',()=>{
  expect(()=>saveFactCards(email,{customerId:'c1',cards:[{text:'杭州限定服务',source:'负责人',status:'confirmed',scope:'甲'.repeat(501)}]})).toThrow('最多500字');
  expect(readWorkspace(email).customers[0].factCards).toBeUndefined();
  expect(()=>saveOutcomes(email,{...args,rows:[{...outcome(),note:'甲'.repeat(1001)}]})).toThrow('1000字');
  expect(pack().outcomes).toBeUndefined();
});

it('产品改写使用所选资料，产品更新后不能采用或恢复旧候选',async()=>{
 const {commerceAction}=await import('./commerce-workspace.mjs');const {productScope}=await import('./product-scope.mjs');
 commerceAction(email,{action:'product',customerId:'c1',name:'阅读灯',facts:'适合书桌，插座供电',source:'说明书'});
 let s=readWorkspace(email);const p=s.acquisition.products[0];s.customers[0].drops[0].productScope=productScope(s,'c1',{productIds:[p.id]});writeWorkspace(email,s);
 let received;await preparePostRewrite(email,{...args,instruction:'调整表达'},async(_pack,c)=>{received=c;return candidate;});
 expect(received.salesMaterial).toContain('插座供电');expect(received.sourceMaterial).not.toContain('厨房');expect(received.factCards).toEqual([]);
 const draftId=pack().rewriteDrafts['小红书|0'].id;
 commerceAction(email,{action:'product',customerId:'c1',id:p.id,baseRevision:p.revision,name:p.name,facts:'新参数',source:'新版说明书'});
 expect(()=>applyPostVersion(email,{...args,draftId})).toThrow('业务资料已更新');
 await preparePostRewrite(email,{...args,instruction:'依据新版'},async()=>candidate);applyPostVersion(email,{...args,draftId:pack().rewriteDrafts['小红书|0'].id});
 expect(()=>applyPostVersion(email,{...args,restoreId:pack().postVersions['小红书|0'][0].id})).toThrow('无法核对');
});
