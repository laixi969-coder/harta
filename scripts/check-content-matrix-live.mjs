// Opt-in paid-model evaluation. Synthetic workspaces only; never touches user work.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ADMIN_EMAIL,workspaceId} from '../lib/auth.mjs';
import {llmReady} from '../lib/llm.mjs';
import {writeWorkspace} from '../lib/workspace.mjs';
import {withModelAccount} from '../lib/model-spend.mjs';
import {generateProductionReviewed,reviewProductionCraft} from '../lib/growth-workspace.mjs';
import {missingProductionFields,PRODUCTION_FIELDS} from '../js/production-workflow.js';
import {parseImagePages} from '../js/image-pages.js';

if(!llmReady())throw new Error('未配置文本模型');
const email=`harta-content-matrix-${crypto.randomUUID()}@example.invalid`,file=path.join('data','workspaces',`${workspaceId(email)}.json`),reportFile=process.env.HARTA_CONTENT_EVAL_OUTPUT||path.join('output','content-quality','matrix-live.json');
const cases=[];
for(const format of ['image','video'])for(const goal of ['reach','leads']){
 for(const platform of ['小红书','抖音'])cases.push({entry:'platform',distribution:'natural',platform,format,goal});
 for(const distribution of ['natural','paid'])cases.push({entry:'feed',distribution,platform:'抖音',format,goal});
}
const selected=process.argv.slice(2);if(selected.some(s=>!/^\d+$/.test(s)||Number(s)<1||Number(s)>cases.length))throw Error('参数应为需要运行的场景序号 1–16');
const chosen=cases.map((value,i)=>({...value,n:i+1})).filter(c=>!selected.length||selected.includes(String(c.n)));
if(fs.existsSync(file))throw Error('临时验收标识冲突');
const dirs=[];
const customers=chosen.map(c=>{
 const customerId=`scenario-${c.n}`,budgetId=crypto.createHash('sha256').update(JSON.stringify([email.toLowerCase(),customerId])).digest('hex');dirs.push(path.join('data','openfind',budgetId));
 if(fs.existsSync(dirs.at(-1)))throw Error('临时预算标识冲突');
 return {id:customerId,name:'合成厨房收纳工作室',hunt:'厨房收纳规划',city:'杭州',pitch:'为杭州家庭提供厨房收纳布局建议',salesMaterial:'合成样本：服务为厨房收纳布局建议。先核对厨房尺寸与使用习惯；不提供施工安装。价格、交付时间未确认；可以通过站内私信询问是否适合。',growthGoal:c.goal,growthCriteria:c.goal==='reach'?'吸引准备整理厨房的家庭观看实用方法':'帮助杭州有收纳规划需求的家庭判断是否值得咨询',creatorProfile:{version:1,fields:{audience:'准备整理厨房、担心收纳盒买错的家庭',voice:'清楚、自然、有判断，不制造恐惧',contactEntry:'站内私信询问是否适合'}},packs:[],drops:[{id:'synthetic-post',tier:'今日',origin:{mode:'manual',creationEntry:c.entry,distributionIntent:c.distribution},shells:{[c.platform]:[{title:'厨房收纳先检查哪几处',body:'先记录使用习惯，再测量柜体内部和过道。',cover:'先看使用习惯'}]}}]};
});
const report={generatedAt:new Date().toISOString(),synthetic:true,note:'真实模型对合成材料生成与辅助审读；不代表实际平台数据或效果。',cases:[]};
function safeError(error){return String(error?.message||'请求失败').replace(/Bearer\s+\S+/gi,'Bearer [隐藏]').replace(/(api[_-]?key|token|secret)=([^&\s]+)/gi,'$1=[隐藏]').slice(0,400);}
async function run(c){
 const identity={customerId:`scenario-${c.n}`,packId:'synthetic-post',platform:c.platform,index:0},title='厨房收纳先检查哪几处';const row={...c};
 try{
  const result=await withModelAccount(ADMIN_EMAIL,()=>generateProductionReviewed(email,{...identity,format:c.format,workingFields:{title}}));
  const fields={...result.fields,title};row.fields=fields;row.generationWarnings=result.warnings;row.missing=missingProductionFields(fields,false,c.format).map(k=>PRODUCTION_FIELDS[k]);
  try{row.craft=await withModelAccount(ADMIN_EMAIL,()=>reviewProductionCraft(email,{...identity,format:c.format,fields}));}catch(error){row.craftError=safeError(error);}
  row.facts=result.factReview;if(!row.facts||row.facts.status!=='completed')row.factError='生成后的事实核对未完成';
  if(c.format==='image')try{row.imagePages=parseImagePages(fields.shots).length;}catch(error){row.pageError=safeError(error);}
 }catch(error){row.generationError=safeError(error);}
 report.cases.push(row);fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
 process.stdout.write(`场景 ${c.n}/16 ${c.entry==='feed'?'信息流·'+c.distribution:c.platform} ${c.format} ${c.goal}：${row.generationError?'生成失败':`生成完成；缺 ${row.missing.length} 项；图文页 ${row.pageError?'需整理':row.imagePages??'不适用'}；内容建议 ${row.craft?.issues?.length??'未完成'} 条；事实提示 ${row.factError?'未完成':row.facts?.issues?.length??'未完成'} 条`}\n`);
}
try{writeWorkspace(email,{seedVersion:999,customers,acquisition:{works:[]}});let cursor=0;await Promise.all(Array.from({length:Math.min(2,chosen.length)},async()=>{while(cursor<chosen.length){const c=chosen[cursor++];await run(c);}}));report.cases.sort((a,b)=>a.n-b.n);fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));if(report.cases.some(r=>r.generationError||r.craftError||r.factError||r.pageError||r.missing.length))process.exitCode=1;}
finally{fs.rmSync(file,{force:true});for(const dir of dirs)fs.rmSync(dir,{recursive:true,force:true});}
