import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import JSZip from 'jszip';
import { beforeAll,afterAll,beforeEach,describe,it,expect } from 'vitest';
import { writeWorkspace,readWorkspace,editLine } from './workspace.mjs';
import { saveProductionDraft } from './growth-workspace.mjs';
import { saveProductionAssets,readProductionAsset,exportProductionAssets } from './production-assets.mjs';
import { createBackup,restoreBackup } from './backup.mjs';
import { workspaceId } from './auth.mjs';
const email='assets@example.com',args={customerId:'c',packId:'p',platform:'小红书',index:0},old=process.cwd();let dir,png;
beforeAll(async()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-assets-'));process.chdir(dir);png='data:image/png;base64,'+(await sharp({create:{width:900,height:1200,channels:3,background:'white'}}).png().toBuffer()).toString('base64');});
afterAll(()=>{process.chdir(old);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{fs.rmSync(path.join(dir,'data'),{recursive:true,force:true});writeWorkspace(email,{seedVersion:999,customers:[{id:'c',name:'业务',hunt:'家装',drops:[{id:'p',tier:'今日',origin:{mode:'manual'},shells:{小红书:[{title:'测试',body:'原稿'}]}}]}]});saveProductionDraft(email,{...args,version:0,format:'image',fields:{title:'测试',script:'正文',shots:'第一页\n第二页',imagePlan:'第一页实拍厨房',coverLayout:'标题留白'}});});
const images=()=>[{name:'page-01.png',data:png},{name:'page-02.png',data:png},{name:'cover.png',data:png}];
const bundle=()=>readWorkspace(email).customers[0].drops[0].productionAssets['小红书|0'];
describe('作品素材包',()=>{
 it('保存、隔离、打包并随备份恢复',async()=>{
  await saveProductionAssets(email,{...args,version:1,images:images()});const saved=bundle(),request={...args,bundleId:saved.id};
  expect(readProductionAsset(email,{...request,name:'cover.png'}).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(()=>readProductionAsset('other@example.com',{...request,name:'cover.png'})).toThrow('找不到');
  expect(()=>readProductionAsset(email,{...request,name:'../cover.png'})).toThrow();
  const zip=await JSZip.loadAsync(await exportProductionAssets(email,request));const doc=await zip.file('脚本与制作说明.txt').async('string');expect(doc).toContain('第一页');expect(doc).toContain('第一页实拍厨房');expect(doc).toContain('标题留白');expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['cover.png','page-01.png','page-02.png']));
  const backup=path.join(dir,'backup'),restored=path.join(dir,'restored');await createBackup(path.join(dir,'data'),backup,{offline:true});restoreBackup(backup,restored);expect(fs.readFileSync(path.join(restored,'production-media',workspaceId(email),saved.id,'cover.png')).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
 });
 it('拒绝无效图片、跳页、旧草稿和变更后的原稿',async()=>{
  await expect(saveProductionAssets(email,{...args,version:1,images:[{name:'page-02.png',data:png}]})).rejects.toThrow('连续');
  await expect(saveProductionAssets(email,{...args,version:1,images:[{name:'cover.png',data:'data:image/png;base64,YWJj'}]})).rejects.toThrow('无法读取');
  await expect(saveProductionAssets(email,{...args,version:0,images:images()})).rejects.toThrow('已变化');
  editLine(email,'p','小红书|0|title','改过的标题');await expect(saveProductionAssets(email,{...args,version:1,images:images()})).rejects.toThrow('原稿已变化');
 });
 it('直播封面独立保存、回看和下载，不覆盖同篇图文素材',async()=>{
  await saveProductionAssets(email,{...args,version:1,images:images()});const post=bundle();
  saveProductionDraft(email,{...args,version:0,live:true,fields:{title:'直播主题',cover:'直播封面',liveOpen:'直播开场',liveReview:'直播复盘'}});
  await saveProductionAssets(email,{...args,live:true,version:1,expectedBundleId:'',images:[{name:'cover.png',data:png}]});
  let c=readWorkspace(email).customers[0],live=c.drops[0].productionAssets['小红书|0|live'];
  expect(live).toMatchObject({format:'live',version:1});expect(bundle().id).toBe(post.id);
  const zip=await JSZip.loadAsync(await exportProductionAssets(email,{...args,bundleId:live.id}));expect(await zip.file('脚本与制作说明.txt').async('string')).toContain('直播复盘');expect(zip.file('cover.png')).toBeTruthy();
  await expect(saveProductionAssets(email,{...args,live:true,version:1,expectedBundleId:live.id,images:[{name:'page-01.png',data:png}]})).rejects.toThrow('图文素材');
  await expect(saveProductionAssets(email,{...args,live:true,version:1,expectedBundleId:'',images:[{name:'cover.png',data:png}]})).rejects.toThrow('素材包已变化');
  await saveProductionAssets(email,{...args,live:true,version:1,expectedBundleId:live.id,images:[{name:'cover.png',data:png}]});
  c=readWorkspace(email).customers[0];expect(c.drops[0].productionAssets['小红书|0|live'].id).not.toBe(live.id);expect(bundle().id).toBe(post.id);
  expect(readProductionAsset(email,{...args,bundleId:post.id,name:'cover.png'}).length).toBeGreaterThan(0);
 });
 it('新作品素材不会删除旧版直播素材包',async()=>{
  await saveProductionAssets(email,{...args,version:1,images:[{name:'cover.png',data:png}]});
  const old=bundle(),space=readWorkspace(email);space.customers[0].drops[0].productionAssets['小红书|0'].format='live';writeWorkspace(email,space);
  await saveProductionAssets(email,{...args,version:1,images:images()});
  expect(bundle().id).not.toBe(old.id);
  expect(readWorkspace(email).customers[0].drops[0].productionAssets['小红书|0|live'].id).toBe(old.id);
  expect(readProductionAsset(email,{...args,bundleId:old.id,name:'cover.png'}).length).toBeGreaterThan(0);
 });
 it('替换成功才删除旧素材，过期链接无法访问',async()=>{
  await saveProductionAssets(email,{...args,version:1,images:images()});const first=bundle(),oldRequest={...args,bundleId:first.id,name:'cover.png'};
  await expect(saveProductionAssets(email,{...args,version:1,images:[{name:'cover.png',data:'invalid'}]})).rejects.toThrow();expect(readProductionAsset(email,oldRequest).length).toBeGreaterThan(0);
  await saveProductionAssets(email,{...args,version:1,images:[{name:'cover.png',data:png}]});expect(bundle().id).not.toBe(first.id);expect(()=>readProductionAsset(email,oldRequest)).toThrow('已更新');expect(fs.existsSync(path.join(dir,'data','production-media',workspaceId(email),first.id))).toBe(false);
 });
 it('同版本只更新封面或完整图文页时保留另一类，拒绝漏页',async()=>{
  await saveProductionAssets(email,{...args,version:1,images:images()});const first=bundle();
  await saveProductionAssets(email,{...args,version:1,expectedBundleId:first.id,images:[{name:'cover.png',data:png}]});let next=bundle();expect(next.images.map(i=>i.name)).toEqual(['cover.png','page-01.png','page-02.png']);
  await expect(saveProductionAssets(email,{...args,version:1,expectedBundleId:first.id,images:[{name:'cover.png',data:png}]})).rejects.toThrow('素材包已变化');
  await expect(saveProductionAssets(email,{...args,version:1,expectedBundleId:next.id,images:[{name:'page-01.png',data:png}]})).rejects.toThrow('图文页不完整');expect(bundle().id).toBe(next.id);
  await saveProductionAssets(email,{...args,version:1,expectedBundleId:next.id,images:[{name:'page-01.png',data:png},{name:'page-02.png',data:png}]});next=bundle();expect(next.images.map(i=>i.name)).toEqual(['cover.png','page-01.png','page-02.png']);expect(readProductionAsset(email,{...args,bundleId:next.id,name:'cover.png'}).length).toBeGreaterThan(0);
 });
 it('历史素材包缺页时仍可导出，但脚本说明明确提醒',async()=>{
  await saveProductionAssets(email,{...args,version:1,images:images()});const saved=bundle(),space=readWorkspace(email);
  space.customers[0].drops[0].productionAssets['小红书|0'].images= saved.images.filter(i=>i.name!=='page-02.png');writeWorkspace(email,space);
  const zip=await JSZip.loadAsync(await exportProductionAssets(email,{...args,bundleId:saved.id}));
  expect(await zip.file('脚本与制作说明.txt').async('string')).toContain('已保存素材可能缺页');expect(zip.file('page-01.png')).toBeTruthy();
 });
 it('新草稿版本不自动带入旧素材',async()=>{
  await saveProductionAssets(email,{...args,version:1,images:images()});const old=bundle();
  saveProductionDraft(email,{...args,version:1,format:'image',fields:{title:'新稿',script:'新正文'}});
  await saveProductionAssets(email,{...args,version:2,expectedBundleId:old.id,images:[{name:'cover.png',data:png}]});expect(bundle().images.map(i=>i.name)).toEqual(['cover.png']);
 });
});
