import crypto from 'node:crypto';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {isRealEvidence} from '../js/evidence-kind.js';

// User-curated group membership is not proof of platform account ownership.
export function benchmarkGroupAction(email,{customerId,action,id,version,name,platform,handle,workId,workIds}={}) {
 const space=readWorkspace(email),customer=space.customers.find(c=>c.id===customerId);
 if(!customer)throw new Error('找不到当前业务');
 const groups=customer.benchmarkGroups ||= [],active=()=>groups.filter(g=>!g.archived);
 if(action==='create'){
  if(typeof name!=='string'||!name.trim()||name.trim().length>100)throw new Error('请填写不超过100字的对标账号名称');
  if(!['小红书','抖音','公众号','视频号','TikTok'].includes(platform))throw new Error('请选择有效的平台');
  if(typeof handle!=='string'||handle.length>200)throw new Error('账号标识不能超过200字');
  if(active().length>=12)throw new Error('当前业务最多保留12个对标账号，请先归档不用的账号');
  if(groups.length>=100)throw new Error('对标账号历史已达100条，请先整理');
  groups.push({id:crypto.randomUUID(),name:name.trim(),platform,handle:handle.trim(),workIds:[],version:1,createdAt:new Date().toISOString(),archived:false});
 }else{
  const group=groups.find(g=>g.id===id);if(!group)throw new Error('找不到当前业务的对标账号');
  if(!Number.isSafeInteger(version)||version!==group.version)throw new Error('对标账号已变化，请刷新后重试');
  if(action==='archive')group.archived=true;
  else if(action==='restore'){if(active().length>=12)throw new Error('当前业务最多保留12个对标账号，请先归档不用的账号');group.archived=false;}
  else if(action==='attach'||action==='attach-many'){
   if(group.archived)throw new Error('请先恢复对标账号');
   const ids=action==='attach'?[workId]:workIds;
   if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(value=>typeof value!=='string'||!value)||new Set(ids).size!==ids.length)throw new Error('请选择1至100篇不同的作品');
   if(ids.some(id=>!(space.acquisition?.works||[]).some(w=>w.id===id&&w.customerId===customerId&&w.platform===group.platform&&isRealEvidence(w))))throw new Error('请选择当前业务中同平台的有效作品');
   if(ids.some(id=>group.workIds.includes(id)))throw new Error('此作品已关联');
   if(group.workIds.length+ids.length>100)throw new Error('每个对标账号最多关联100篇作品');
   group.workIds.push(...ids);
  }else if(action==='detach'){
   if(group.archived||!group.workIds.includes(workId))throw new Error('作品关联已变化，请刷新后重试');
   group.workIds=group.workIds.filter(id=>id!==workId);
  }else throw new Error('请选择有效的对标账号操作');
  group.version++;group.updatedAt=new Date().toISOString();
 }
 return {workspace:writeWorkspace(email,space)};
}
