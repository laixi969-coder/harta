// Opt-in integration check: one real model request with synthetic data.
// It uses the configured model and the ordinary spend ledger, and removes only
// its own temporary workspace and per-business budget directory afterwards.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ADMIN_EMAIL, workspaceId } from '../lib/auth.mjs';
import { llmReady } from '../lib/llm.mjs';
import { writeWorkspace, readWorkspace, publicWorkspace } from '../lib/workspace.mjs';
import { withModelAccount } from '../lib/model-spend.mjs';
import { generateRadarHook, saveRadarHook } from '../lib/radar-hook.mjs';
import { workReferences } from '../lib/work-references.mjs';

if(!llmReady()) throw new Error('尚未配置文本模型；请先在设置中完成配置');
const email=`harta-radar-check-${crypto.randomUUID()}@example.invalid`, customerId='synthetic-business', workId='synthetic-reference';
const workspaceFile=path.join('data','workspaces',`${workspaceId(email)}.json`);
const budgetId=crypto.createHash('sha256').update(JSON.stringify([email.toLowerCase(),customerId])).digest('hex');
const budgetDirectory=path.join('data','openfind',budgetId);
if(fs.existsSync(workspaceFile)||fs.existsSync(budgetDirectory))throw new Error('临时验收标识冲突，请重试');
try {
  writeWorkspace(email,{seedVersion:999,customers:[{id:customerId,name:'虚构厨房咨询',hunt:'厨房规划',pitch:'帮助家庭整理厨房尺寸',salesMaterial:'这是一段合成样例，不提供价格或成交承诺。',drops:[],packs:[]}],acquisition:{works:[{id:workId,customerId,platform:'小红书',title:'厨房收纳先看什么',description:'先测量空间，再梳理日常使用需求。',source:'manual_paste'}]}});
  const result=await withModelAccount(ADMIN_EMAIL,()=>generateRadarHook(email,{customerId,workId}));
  saveRadarHook(email,{customerId,workId,text:result.hook,basis:result.basis,version:result.version});
  let workspace=readWorkspace(email);
  if(workReferences(workspace,customerId,[workId])[0].preferredHook!==result.hook || publicWorkspace(workspace).customers[0].radarHookStatuses[workId]!=='current')throw new Error('保存的开头未进入参考');
  workspace.customers[0].pitch='合成样例修改后的业务描述';writeWorkspace(email,workspace);workspace=readWorkspace(email);
  if(workReferences(workspace,customerId,[workId])[0].preferredHook || publicWorkspace(workspace).customers[0].radarHookStatuses[workId]!=='stale')throw new Error('资料变化后未暂停旧开头');
  process.stdout.write(`真实文本模型验收通过：合成样例生成、保存、引用和资料变化后的停用；模型提示 ${result.warnings.length} 条。\n`);
} finally {
  fs.rmSync(workspaceFile,{force:true});fs.rmSync(budgetDirectory,{recursive:true,force:true});
}
