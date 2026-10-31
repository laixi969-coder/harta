// Opt-in real-model check. All content is synthetic; only this test's workspace
// and per-business budget directory are deleted. Normal model spend is kept.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ADMIN_EMAIL, workspaceId } from '../lib/auth.mjs';
import { llmReady } from '../lib/llm.mjs';
import { writeWorkspace, readWorkspace } from '../lib/workspace.mjs';
import { withModelAccount } from '../lib/model-spend.mjs';
import { generateProductionOutline, saveProductionDraft } from '../lib/growth-workspace.mjs';
import { missingProductionFields, PRODUCTION_FIELDS } from '../js/production-workflow.js';
import { radarHookBasis } from '../lib/radar-hook-basis.mjs';

if (!llmReady()) throw new Error('尚未配置文本模型；请先在设置中完成配置');
const email=`harta-production-check-${crypto.randomUUID()}@example.invalid`, customerId='synthetic-business', packId='synthetic-pack';
const workspaceFile=path.join('data','workspaces',`${workspaceId(email)}.json`);
const budgetId=crypto.createHash('sha256').update(JSON.stringify([email.toLowerCase(),customerId])).digest('hex');
const budgetDirectory=path.join('data','openfind',budgetId);
if (fs.existsSync(workspaceFile) || fs.existsSync(budgetDirectory)) throw new Error('临时验收标识冲突，请重试');
const original={title:'厨房收纳先量哪里',body:'先记录使用习惯，再量柜体和通道尺寸。',cover:'先量尺寸',shots:''};
const scenarios=[{platform:'抖音',format:'video',label:'短视频'},{platform:'小红书',format:'image',label:'图文'},{platform:'抖音',live:true,label:'直播'}];
const selected=process.argv.slice(2);
if(selected.some(arg=>!['--video','--image','--live'].includes(arg)))throw new Error('支持的参数：--video、--image、--live');
const chosen=selected.length?scenarios.filter(s=>selected.includes(s.live?'--live':`--${s.format}`)):scenarios;
try {
  const customer={id:customerId,name:'虚构厨房规划',hunt:'厨房规划',pitch:'帮助家庭整理厨房尺寸',salesMaterial:'合成样例，不提供价格、服务范围或效果承诺。',growthGoal:'reach_leads',growthCriteria:'让观众了解尺寸核对方法，愿意提出具体问题',creatorProfile:{version:1,fields:{audience:'准备整理厨房的家庭',voice:'清晰、具体、不夸大'}},drops:[],packs:[]};
  const work={id:'synthetic-reference',customerId,platform:'小红书',title:'厨房收纳从哪里开始',description:'先观察日常使用习惯，再记录空间尺寸。',source:'manual_paste'},hook='收纳前，你量过这些位置吗？';
  customer.radarHooks={[work.id]:{text:hook,basis:radarHookBasis(customer,work)}};
  customer.drops=[{id:packId,tier:'今日',origin:{mode:'legacy',goal:'reach_leads'},workReferences:[{workId:work.id,platform:work.platform,title:work.title,description:work.description,preferredHook:hook}],shells:{小红书:[original],抖音:[original]}}];
  writeWorkspace(email,{seedVersion:999,customers:[customer],acquisition:{works:[work]}});
  for (const scenario of chosen) {
    const identity={customerId,packId,platform:scenario.platform,index:0}, live=!!scenario.live, format=scenario.format || '';
    const workingFields={title:original.title};
    const result=await withModelAccount(ADMIN_EMAIL,()=>generateProductionOutline(email,{...identity,live,format,workingFields}));
    const fields={...result.fields,...workingFields};
    saveProductionDraft(email,{...identity,version:0,live,format,fields});
    const key=`${scenario.platform}|0${live?'|live':''}`, saved=readWorkspace(email).customers[0].drops[0].productionDrafts[key];
    if (!saved || saved.fields.title!==original.title || !Object.entries(result.fields).some(([name,value])=>name!=='title' && value && saved.fields[name]===value)) throw new Error(`${scenario.label}建议未正确保存`);
    const missing=missingProductionFields(saved.fields,live,format);
    process.stdout.write(`${scenario.label}：真实模型生成并保存；${missing.length?`待补：${missing.map(key=>PRODUCTION_FIELDS[key]).join('、')}`:'必填字段已生成'}；提示 ${result.warnings.length} 条。\n`);
  }
} finally {
  fs.rmSync(workspaceFile,{force:true});
  fs.rmSync(budgetDirectory,{recursive:true,force:true});
}
