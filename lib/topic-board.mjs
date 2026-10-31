import {CONTENT_JOBS} from '../js/content-job.js';
import crypto from 'node:crypto';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {topicBoardRows,topicSource,scheduledTopicCount} from './topic-board-data.mjs';
import {createProductionContent,generateProductionOutline,saveProductionDraft} from './growth-workspace.mjs';
import {workReferences} from './work-references.mjs';
import {GROWTH_GOALS} from '../js/growth.js';
import {productionDraft} from '../js/production-workflow.js';
const locks=new Set(),now=()=>new Date().toISOString();
function load(email,customerId){const space=readWorkspace(email),customer=space.customers.find(c=>c.id===customerId);if(!customer)throw new Error('找不到当前业务');return {space,customer};}
function text(v,label,max,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error(`${label}${required?'不能为空，':''}最多${max}字`);return v.trim();}
function store(customer,plan){customer.topicPlans||=[];const index=customer.topicPlans.findIndex(p=>p.id===plan.id);if(index<0){if(customer.topicPlans.length>=500)throw new Error('选题记录已达500条，请先整理已有选题');customer.topicPlans.unshift(plan);}else customer.topicPlans[index]=plan;}
function persisted(row){const {basis,arrangement,packExists,sourceCurrent,currentSource,...plan}=row;return {...plan,bucket:arrangement||plan.bucket};}
function arrange(customer,plan,bucket){plan.bucket=bucket;if(plan.kind==='work'){customer.radarDecisions||={};Object.defineProperty(customer.radarDecisions,plan.sourceKey,{value:{action:bucket,updatedAt:now()},writable:true,configurable:true,enumerable:true});}}
export async function topicBoardAction(email,input,deps={}){
 const {customerId,action}=input,{space,customer}=load(email,customerId),lock=JSON.stringify([email.toLowerCase(),customerId]);
 if(locks.has(lock))throw new Error('本业务正在生成选题脚本，请等待完成');
 const rows=topicBoardRows(customer,space.acquisition);
 if(action==='create'){
  const kind=input.kind||'manual';if(!['manual','work','pool','sample'].includes(kind))throw new Error('选题来源不正确');
  const key=kind==='manual'?crypto.randomUUID():text(input.sourceKey,'来源标识',1000,true),source=topicSource(customer,space.acquisition,kind,key);if(!source)throw new Error('选题来源已不可用，请刷新后重选');
  if(input.insightId!==undefined){
   const insight=customer.painClusters,cluster=insight?.clusters?.find(c=>c.id===input.clusterId),angle=String(cluster?.angle||cluster?.topic||'').replace(/\s+/g,' ').trim().slice(0,200),expected=angle.replace(/[\s\p{P}]/gu,'').toLowerCase();
   if(kind!=='pool'||!insight||insight.staleReason||insight.id!==input.insightId||!cluster||expected!==key)throw new Error('评论洞察已变化，请重新查看后再加入选题库');
  }
  const id=kind+':'+key;if(rows.some(p=>p.id===id))return {workspace:space,notice:'此来源已在选题库，可继续编辑或查看制作稿'};
  const sourceTitle=Array.from(source.snapshot.title||'').reduce((out,char)=>out.length+char.length<=120?out+char:out,'');
  const title=text(input.title??sourceTitle,'选题',120,true),hook=text(input.hook||'','开头或创作意图',1000);
  const platform=input.platform||(['小红书','抖音','视频号'].includes(source.snapshot.platform)?source.snapshot.platform:'小红书'),format=input.format||'video',goal=input.goal||customer.growthGoal||'leads',bucket=input.bucket||'parked';
  validate(platform,format,goal,bucket);if(bucket==='now'&&scheduledTopicCount(customer,space.acquisition)>=5)throw new Error('本周最多安排5个选题，请先调整已有安排');
  const job=validJob(input.job??'');
  const plan={id,version:1,kind,sourceKey:key,title,hook,platform,format,goal,job,bucket,sourceBasis:source.basis,sourceSnapshot:source.snapshot,createdAt:now(),updatedAt:now()};store(customer,plan);arrange(customer,plan,bucket);writeWorkspace(email,space);return {workspace:space};
 }
 const row=rows.find(p=>p.id===input.id);
 if(['update','move','refresh','generate','generate-new','remove'].includes(action)&&(!row||!Number.isSafeInteger(input.version)||row.version!==input.version||input.basis!==row.basis))throw new Error('选题已变化，请保留所需修改，再重新载入已保存选题');
 if(action==='remove'){if(row.bucket!=='discard')throw new Error('请先舍弃此选题，再移出选题库');customer.topicPlans=(customer.topicPlans||[]).filter(p=>p.id!==row.id);if(row.kind==='work'&&customer.radarDecisions)delete customer.radarDecisions[row.sourceKey];writeWorkspace(email,space);return {workspace:space};}
 if(['update','move','refresh'].includes(action)){
  const plan=persisted(row);if(action==='refresh'){const source=topicSource(customer,space.acquisition,plan.kind,plan.sourceKey);if(!source)throw new Error('原来源已不可用，请恢复来源或另建手写选题');plan.sourceBasis=source.basis;plan.sourceSnapshot=source.snapshot;}
  else if(action==='update'){
   if(row.packExists)throw new Error('此选题已有制作稿，请在制作稿内修改，选题快照保持不变');
   plan.title=text(input.title,'选题',120,true);plan.hook=text(input.hook||'','开头或创作意图',1000);validate(input.platform,input.format,input.goal);Object.assign(plan,{platform:input.platform,format:input.format,goal:input.goal,job:validJob(input.job??plan.job??'')});
  }else{validate(row.platform,row.format,row.goal,input.bucket);if(input.bucket==='now'&&row.bucket!=='now'&&scheduledTopicCount(customer,space.acquisition)>=5)throw new Error('本周最多安排5个选题，请先调整已有安排');arrange(customer,plan,input.bucket);}
  plan.version++;plan.updatedAt=now();store(customer,plan);writeWorkspace(email,space);return {workspace:space};
 }
 if(!['generate','generate-week','generate-new'].includes(action))throw new Error('请选择有效的选题操作');
 const selected=action==='generate-week'?rows.filter(p=>p.bucket==='now'): [row];if(!selected.length)throw new Error('先把选题安排到本周');if(selected.length>5)throw new Error('本周超过5条，请先整理安排');
 if(action==='generate-week'&&(!Array.isArray(input.selection)||input.selection.length!==selected.length||selected.some(p=>!input.selection.some(s=>s.id===p.id&&s.basis===p.basis))))throw new Error('本周安排已变化，请刷新后核对再生成');
 // Validate the entire selection before creating any draft.
 for(const p of selected){if(p.bucket==='discard'||!p.sourceCurrent)throw new Error('选题已舍弃或来源已变化，请先核对来源');validate(p.platform,p.format,p.goal);}
 locks.add(lock);const results=[];
 try{for(const original of selected){
  let current=load(email,customerId),plan=topicBoardRows(current.customer,current.space.acquisition).find(p=>p.id===original.id);
  if(!plan||plan.basis!==original.basis||!plan.sourceCurrent){results.push({id:original.id,error:'选题或来源已变化，请刷新后重试'});continue;}
  let packId=plan.packExists&&action!=='generate-new'?plan.packId:'';
  if(!packId){
   const result=createProductionContent(email,{customerId,platform:plan.platform,title:Array.from(plan.title).slice(0,plan.platform==='公众号'?64:20).join('')});packId=result.packId;current=load(email,customerId);
   const pack=current.customer.drops.find(p=>p.id===packId);pack.origin={...pack.origin,goal:plan.goal,format:plan.format,criteria:current.customer.growthCriteria||''};pack.topicSnapshot={id:plan.id,title:plan.title,hook:plan.hook,job:plan.job||'',jobLabel:CONTENT_JOBS[plan.job]||'',source:plan.sourceSnapshot,sourceBasis:plan.sourceBasis,version:plan.version};
   if(plan.kind==='work')pack.workReferences=workReferences(current.space,customerId,[plan.sourceKey]);
   const saved={...persisted(plan),previousPackIds:plan.packExists?[...new Set([...(plan.previousPackIds||[]),plan.packId])].slice(-30):(plan.previousPackIds||[]),packId,version:plan.version+1,updatedAt:now()};store(current.customer,saved);writeWorkspace(email,current.space);plan=saved;
  }
  try{
   const {customer:c}=load(email,customerId),pack=c.drops.find(p=>p.id===packId),draft=productionDraft(pack,plan.platform,0,false),version=draft?.version||0;
   if(pack.topicSnapshot?.sourceBasis!==plan.sourceBasis)throw new Error('制作稿保留的是旧来源快照，请打开制作稿核对，或点击另建制作稿生成新版');
   const expectedPlanBasis=topicBoardRows(c,load(email,customerId).space.acquisition).find(p=>p.id===plan.id)?.basis;
   const workingFields=draft?.fields||{},generationFields=Object.fromEntries(Object.entries(workingFields).filter(([key])=>['script','shots','imagePlan','title','cover','coverLayout','hook','cta'].includes(key)));
   const result=await (deps.generate||generateProductionOutline)(email,{customerId,packId,platform:plan.platform,index:0,format:plan.format,workingFields:generationFields});
   const latest=load(email,customerId),latestPlan=topicBoardRows(latest.customer,latest.space.acquisition).find(p=>p.id===plan.id);
   if(!latestPlan||latestPlan.basis!==expectedPlanBasis||!latestPlan.sourceCurrent)throw new Error('生成期间选题或来源已变化，旧结果未保存');
   const fields={...workingFields,...Object.fromEntries(Object.entries(result.fields).filter(([,v])=>v))};
   saveProductionDraft(email,{customerId,packId,platform:plan.platform,index:0,version,format:plan.format,fields});results.push({id:plan.id,packId,warnings:result.warnings||[]});
  }catch(error){results.push({id:plan.id,packId,error:error.message||'生成未完成，可打开制作稿重试'});}
 }}finally{locks.delete(lock);}
 return {workspace:readWorkspace(email),results};
}
function validate(platform,format,goal,bucket){if(!(['小红书','抖音'].includes(platform)&&['image','video'].includes(format))&&!(platform==='公众号'&&format==='article')&&!(platform==='视频号'&&format==='video') || !Object.hasOwn(GROWTH_GOALS,goal))throw new Error('请选择匹配的平台与形式：公众号使用长文，视频号使用视频，小红书或抖音使用图文或视频');if(bucket!==undefined&&!['now','next','parked','discard'].includes(bucket))throw new Error('请选择本周、下一批、待定或舍弃');}

function validJob(value){if(typeof value!=='string'||(value&&!Object.hasOwn(CONTENT_JOBS,value)))throw new Error('请选择有效的内容任务');return value;}
