import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace,publicWorkspace} from './workspace.mjs';
import {generateRadarHook,saveRadarHook} from './radar-hook.mjs';
import {workReferences,workReferenceBrief} from './work-references.mjs';
const original=process.cwd(),email='radar-hook@example.test';let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'radar-hook-'));fs.symlinkSync(path.join(original,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'业务',hunt:'厨房',pitch:'厨房翻新',salesMaterial:'只提供厨房翻新',creatorProfile:{fields:{audience:'准备装修的家庭'}},drops:[],packs:[]}],acquisition:{works:[{id:'w1',customerId:'c1',platform:'小红书',title:'厨房如何选',description:'做厨房翻新之前一定先确认水电管线的位置再讨论其他细节',source:'manual_paste'}]}}));
const input={customerId:'c1',workId:'w1'},budget=(_e,_c,_p,fn)=>fn();
describe('参考开头',()=>{
 it('公众号素材库可设计开头，并保留未证明发表的来源状态',async()=>{
  const space=readWorkspace(email);Object.assign(space.acquisition.works[0],{platform:'公众号',source:'wechat_api',wechat:{source:'material'}});writeWorkspace(email,space);
  const generated=await generateRadarHook(email,input,{budget,chatFn:async()=>'{"hook":"厨房布局从哪些习惯开始？"}'});saveRadarHook(email,{...input,text:generated.hook,basis:generated.basis,version:generated.version});
  expect(workReferences(readWorkspace(email),'c1',['w1'])[0]).toMatchObject({platform:'公众号',sourceState:'素材库（不证明已发表）',preferredHook:generated.hook});
 });
 it('演示作品不能用于生成或保存开头',async()=>{
  for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}]){
   const space=readWorkspace(email);space.acquisition.works[0]={...space.acquisition.works[0],...marker};writeWorkspace(email,space);
   await expect(generateRadarHook(email,input,{budget,chatFn:async()=>'{"hook":"建议"}'})).rejects.toThrow('找不到');expect(()=>saveRadarHook(email,{...input,text:'建议',version:0})).toThrow('找不到');
   space.acquisition.works[0]={...space.acquisition.works[0],demo:false,source:'manual_paste',sourceType:''};writeWorkspace(email,space);
  }
 });
 it('用户确认并保存后才随参考进入生成，资料变化时自动停止引用',async()=>{
  let request;const generated=await generateRadarHook(email,input,{budget,chatFn:async x=>{request=x;return JSON.stringify({hook:'厨房翻新前，先核对哪些条件？'});}});
  expect(request.user).toContain('准备装修的家庭');expect(request.user).toContain('厨房如何选');expect(workReferences(readWorkspace(email),'c1',['w1'])[0].preferredHook).toBeUndefined();
  saveRadarHook(email,{...input,text:generated.hook,basis:generated.basis,version:generated.version});let space=readWorkspace(email);expect(workReferences(space,'c1',['w1'])[0].preferredHook).toBe(generated.hook);expect(publicWorkspace(space).customers[0].radarHookStatuses.w1).toBe('current');expect(workReferenceBrief(workReferences(space,'c1',['w1']))).toContain('不证明事实');
  expect(()=>saveRadarHook(email,{...input,text:'过时编辑',version:0})).toThrow('发生变化');space.customers[0].pitch='改成其他服务';writeWorkspace(email,space);space=readWorkspace(email);expect(workReferences(space,'c1',['w1'])[0].preferredHook).toBeUndefined();expect(publicWorkspace(space).customers[0].radarHookStatuses.w1).toBe('stale');expect(()=>saveRadarHook(email,{...input,text:'旧建议',basis:generated.basis,version:1})).toThrow('已变化');
 });
 it('生成前后核对权限与参考资料，模型复述和禁用词只作为提示',async()=>{
  await expect(generateRadarHook('other@example.test',input,{budget,chatFn:async()=>'{"hook":"x"}'})).rejects.toThrow('找不到');
  const generated=await generateRadarHook(email,input,{budget,chatFn:async()=>JSON.stringify({hook:'做厨房翻新之前一定先确认水电管线的位置再讨论'})});expect(generated.warnings.join('')).toContain('连续相同');
  await expect(generateRadarHook(email,input,{budget,chatFn:async()=>{const s=readWorkspace(email);s.acquisition.works[0].description='已经更改';writeWorkspace(email,s);return '{"hook":"建议"}';}})).rejects.toThrow('发生变化');
 });
 it('支持直接手写和清空，不自动创建线索',()=>{
  saveRadarHook(email,{...input,text:'自己写的开头',version:0});let space=readWorkspace(email);expect(space.customers[0].radarHooks.w1.text).toBe('自己写的开头');expect(space.acquisition.leads||[]).toHaveLength(0);
  saveRadarHook(email,{...input,text:'',version:1});space=readWorkspace(email);expect(workReferences(space,'c1',['w1'])[0].preferredHook).toBeUndefined();
 });
});
