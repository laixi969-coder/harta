import crypto from 'node:crypto';
import {requireCurrentAgentTrial} from './agent-eligibility.mjs';
import { readWorkspace, writeWorkspace, addCustomer } from './workspace.mjs';
import { productScope, scopeHash, isScopeCurrent } from './product-scope.mjs';
import { safeSourceUrl } from './research.mjs';
import { PLATFORMS, generateContactSuggestion, incomingByTime } from './acquisition-workspace.mjs';
import { agentKnowledge } from './agent-knowledge.mjs';
import { salesKnowledge } from './sales-knowledge.mjs';
import { salesStopReason } from './sales-strategy.mjs';
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
export const OPPORTUNITY_STAGES = ['待核实','了解需求','比较中','询价中','已成交','已结束'];
const active = new Set();
function text(v, label, max = 2000, required = false) {
  if (v == null && !required) return '';
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error(`${label}${required?'不能为空且':''}最多 ${max} 字`);
  return v.trim();
}
function link(v) {
  const value = safeSourceUrl(text(v, '原始链接', 2000, true));
  if (!value) throw new Error('请填写有效的公开 http/https 链接');
  return value;
}
function load(email) {
  const s = readWorkspace(email); s.acquisition ||= {};
  for (const key of ['products','skus','targets','works','opportunities','outreachRuns','salesDocuments','leads','signals','accounts','logs']) s.acquisition[key] ||= [];
  return s;
}
function find(rows, key, customerId, label) {
  const r = rows.find(r => r.id === key && r.customerId === customerId);
  if (!r) throw new Error(`找不到当前业务的${label}`);
  return r;
}
function revision(row, input) { if (row && input.baseRevision !== row.revision) throw new Error('记录已变化，请刷新核对后再保存'); }
function invalidate(a, productId) {
  for (const lead of a.leads) for (const m of lead.messages || []) if (['draft','copied'].includes(m.status) && m.productScope?.productIds.includes(productId)) { m.stale = true; m.staleReason = '产品资料已更新，请重新起草'; }
}
export function commerceWorkspace(email) {
  const s=load(email);
  let changed=false;
  for(const r of s.acquisition.outreachRuns) if(r.status==='running'&&!active.has(`${email}:${r.id}`)){r.status='interrupted';r.error='运行已中断，请重新起草';r.finishedAt=now();changed=true;}
  if(changed)writeWorkspace(email,s);
  return s;
}
export function commerceAction(email, input) {
  if(input.action==='business'){
    const result=addCustomer(email,{name:input.name,pitch:input.pitch,hunt:input.hunt||'其他行业',track:'存量'});
    if(result.error)throw new Error(result.error);return result.workspace;
  }
  const s=load(email), a=s.acquisition, c=s.customers.find(c=>c.id===input.customerId);
  if(!c)throw new Error('找不到你名下的业务');
  const action=input.action;
  if(action==='product'||action==='sku'){
    const isSku=action==='sku', rows=isSku?a.skus:a.products;
    const old=input.id?find(rows,input.id,c.id,isSku?'规格':'产品'):null;
    revision(old,input);
    const product=isSku?find(a.products,old?.productId||input.productId,c.id,'产品'):null;
    const status=input.status||'active';if(!['active','archived'].includes(status))throw new Error('产品状态无效');
    const priceExpiresAt=text(input.priceExpiresAt,'报价有效期',40);if(priceExpiresAt&&!Number.isFinite(Date.parse(priceExpiresAt)))throw new Error('报价有效期无效');
    const record={id:old?.id||id(),customerId:c.id,name:text(input.name,'名称',100,true),facts:text(input.facts,'事实资料',8000),priceTerms:text(input.priceTerms,'价格及适用条件',2000),source:text(input.source,'资料来源',2000),status,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),updatedAt:now()};
    if(isSku)Object.assign(record,{productId:product.id,attributes:text(input.attributes,'规格参数',2000),priceTerms:text(input.priceTerms,'价格及适用条件',2000)});
    record.priceExpiresAt=priceExpiresAt?new Date(priceExpiresAt).toISOString():'';
    if((record.facts||record.priceTerms||record.attributes)&&!record.source)throw new Error('请填写事实、参数或价格的资料来源');
    if(old)Object.assign(old,record);else rows.push(record);
    invalidate(a,product?.id||record.id);
  }else if(action==='sales-document'){
    const old=input.id?find(a.salesDocuments,input.id,c.id,'销售资料'):null;
    revision(old,input);
    if(!old&&a.salesDocuments.filter(d=>d.customerId===c.id).length>=200)throw new Error('每个业务最多保存 200 份销售资料');
    const productId=text(input.productId,'产品',100),skuId=text(input.skuId,'规格',100);
    const status=input.status||'draft';if(!['draft','approved','archived'].includes(status))throw new Error('资料状态无效');
    if(productId)find(a.products,productId,c.id,'产品');
    if(skuId&&find(a.skus,skuId,c.id,'规格').productId!==productId)throw new Error('规格必须属于所选产品');
    if(status==='approved')productScope(s,c.id,{productIds:productId?[productId]:[],skuIds:skuId?[skuId]:[]});
    if(status==='approved'&&input.confirmed!==true)throw new Error('请确认资料真实且可用于对外沟通');
    const expiresAt=text(input.expiresAt,'有效期',40);
    if(expiresAt&&(!Number.isFinite(Date.parse(expiresAt))||(status==='approved'&&Date.parse(expiresAt)<=Date.now())))throw new Error('有效期需晚于当前时间');
    const record={id:old?.id||id(),customerId:c.id,productId,skuId,title:text(input.title,'资料标题',150,true),body:text(input.body,'资料正文',30000,true),source:text(input.source,'资料来源',2000,true),status,expiresAt:expiresAt?new Date(expiresAt).toISOString():'',revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),updatedAt:now()};
    if(old)Object.assign(old,record);else a.salesDocuments.push(record);
    for(const l of a.leads.filter(l=>l.customerId===c.id))for(const m of l.messages||[])if(m.salesPlan&&['draft','copied'].includes(m.status)){m.stale=true;m.staleReason='销售资料已更新，请重新起草';}
  }else if(action==='content-review'){
    const pack=[...(c.drops||[]),...(c.packs||[])].find(p=>p.id===input.packId);
    if(!pack?.productScope)throw new Error('找不到带产品范围的内容');
    if(input.confirmed!==true)throw new Error('请先核对内容中的经营事实');
    const scope=productScope(s,c.id,pack.productScope);
    if(input.scopeHash!==scope.hash)throw new Error('资料已再次更新，请重新核对');
    if(input.contentHash!==scopeHash([pack.shells,pack.edits]))throw new Error('文案已变化，请重新核对');
    pack.productReviews=[...(pack.productReviews||[]),{at:now(),note:text(input.note,'核对依据',2000,true),previous:pack.productScope}];
    pack.productScope=scope;pack.productReviewRequired=false;
  }else if(action==='target'){
    const platform=text(input.platform,'平台',20,true);if(!PLATFORMS.includes(platform))throw new Error('平台无效');
    const url=link(input.url),recordId=text(input.recordId,'平台账号 ID',200);
    if(a.targets.some(t=>t.customerId===c.id&&t.platform===platform&&(t.url===url||(recordId&&t.recordId===recordId))))throw new Error('该目标账号已存在');
    a.targets.push({id:id(),customerId:c.id,platform,url,recordId,name:text(input.name,'账号名称',100,true),createdAt:now(),source:'manual'});
  }else if(action==='work'){
    const target=find(a.targets,input.targetId,c.id,'目标账号'), url=link(input.url), recordId=text(input.recordId,'平台视频 ID',200);
    if(a.works.some(w=>w.customerId===c.id&&w.platform===target.platform&&(w.url===url||(recordId&&w.recordId===recordId))))throw new Error('该视频已存在，请打开原记录');
    a.works.push({id:id(),customerId:c.id,targetId:target.id,platform:target.platform,url,recordId,title:text(input.title,'视频标题',300,true),description:text(input.description,'视频语境',3000),createdAt:now(),source:'manual_import'});
  }else if(action==='opportunity'){
    const lead=find(a.leads,input.leadId,c.id,'联系人');
    const old=input.id?find(a.opportunities,input.id,c.id,'购买需求'):null;
    revision(old,input);if(old&&old.leadId!==lead.id)throw new Error('不能更换购买需求的联系人');
    const stage=input.stage||'待核实';if(!OPPORTUNITY_STAGES.includes(stage))throw new Error('需求阶段无效');
    const note=text(input.note,'本次依据',2000,true);
    const scope=productScope(s,c.id,input);
    const signals=input.signalIds===undefined?old?.signalIds||[]:input.signalIds;
    if(!Array.isArray(signals)||signals.length>30||signals.some(key=>!lead.signalIds.includes(key)))throw new Error('需求证据必须属于当前联系人');
    const nextAt=text(input.nextAt,'下次跟进时间',40);if(nextAt&&!Number.isFinite(Date.parse(nextAt)))throw new Error('跟进时间无效');
    const record={id:old?.id||id(),customerId:c.id,leadId:lead.id,title:text(input.title,'购买需求',200,true),stage,productIds:scope.productIds,skuIds:scope.skuIds,signalIds:[...new Set(signals)],nextStep:text(input.nextStep,'下一步',1000),nextAt:nextAt?new Date(nextAt).toISOString():'',revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),updatedAt:now(),events:[...(old?.events||[]),{id:id(),at:now(),stage,note}]};
    if(old)Object.assign(old,record);else a.opportunities.push(record);
    for(const m of lead.messages||[])if(m.opportunityId===record.id&&['draft','copied'].includes(m.status)){m.stale=true;m.staleReason='购买需求已更新，请重新起草';}
  }else if(action==='handoff'||action==='resume'){
    const op=find(a.opportunities,input.opportunityId,c.id,'购买需求'),lead=find(a.leads,op.leadId,c.id,'联系人');
    if(action==='resume'&&lead.doNotContact)throw new Error('该对象已拒绝联系');
    const note=text(input.note,'操作依据',1000,true);
    op.manualTakeover=action==='handoff';op.revision++;op.updatedAt=now();op.events.push({id:id(),at:now(),type:action,note});
    for(const m of lead.messages||[])if(m.opportunityId===op.id&&['draft','copied'].includes(m.status)){m.stale=true;m.staleReason='沟通控制状态已变化，请重新核对';}
  }else if(action==='mode'){
    // Capability cannot be supplied by the browser. No production connector has been verified.
    if(input.mode!=='suggestion')throw new Error('平台接收与发送尚未验证，不能启用确认发送或自动沟通');
    const op=find(a.opportunities,input.opportunityId,c.id,'购买需求');op.mode='suggestion';
  }else throw new Error('无效业务操作');
  a.logs.push({id:id(),at:now(),type:`commerce-${action}`,customerId:c.id});
  return writeWorkspace(email,s);
}
function context(s,input){
  const a=s.acquisition,c=s.customers.find(c=>c.id===input.customerId);if(!c)throw new Error('找不到你名下的业务');
  const op=find(a.opportunities,input.opportunityId,c.id,'购买需求'),lead=find(a.leads,op.leadId,c.id,'联系人');
  if(lead.doNotContact)throw new Error('该对象已拒绝联系');
  if(op.manualTakeover||lead.manualTakeover)throw new Error('已由人工接管，先明确恢复智能体建议');
  if(['已成交','已结束'].includes(op.stage))throw new Error('已结束的购买需求不再主动营销；回访请人工处理或另建真实需求');
  const account=find(a.accounts,input.accountId,c.id,'发送账号');if(account.platform!==lead.platform)throw new Error('发送账号的平台不匹配');
  if(!['评论','私信'].includes(input.channel))throw new Error('请选择公开评论或私信');
  const agent=find(a.agents||[],input.agentId,c.id,'智能体'),version=agent.versions.at(-1);
  if(agent.status!=='enabled'||!version.config.duties.includes('接待'))throw new Error('请选择已启用接待职责的智能体');
  if(version.knowledgeHash!==agentKnowledge(input.email,c).hash)throw new Error('智能体知识已变化，请保存新版本并重新试运行');
  requireCurrentAgentTrial(agent,a.agentRuns);
  if(!version.config.platforms.includes(lead.platform)||!version.config.bindings.some(b=>b.accountId===account.id&&b.enabled))throw new Error('智能体尚未绑定这个发送账号');
  const signal=input.signalId?find(a.signals,input.signalId,c.id,'原评论'):null;
  if(input.channel==='评论'&&(!signal||!op.signalIds.includes(signal.id)||signal.isAuthorReply))throw new Error('公开回复须选择本次需求的原评论');
  if(input.channel==='私信'&&!lead.authorId)throw new Error('私信对象缺少稳定平台标识，请先核实身份');
  const scope=productScope(s,c.id,op);
  const evidence=a.signals.filter(r=>op.signalIds.includes(r.id)&&!r.isAuthorReply);
  const stop=salesStopReason({lead,op,evidence});if(stop)throw new Error(stop);
  const knowledgeHash=salesKnowledge(s,c.id,scope).hash;
  return {c,op,lead,account,agent,version,scope,signal,knowledgeHash,recipient:input.channel==='评论'?signal.url:lead.authorId};
}
export function startOutreachDraft(email,input,deps={}){
  const s=load(email), payload={...input,email}, initial=context(s,payload), a=s.acquisition;
  if(a.outreachRuns.some(r=>r.opportunityId===initial.op.id&&r.status==='running'))throw new Error('该需求正在起草，请等待完成');
  if(active.size>=8||[...active].filter(k=>k.startsWith(`${email}:`)).length>=2)throw new Error('正在运行的沟通任务较多，请稍后再试');
  const sourceHash=scopeHash(initial);
  const run={id:id(),customerId:initial.c.id,opportunityId:initial.op.id,agentId:initial.agent.id,version:initial.version.number,accountId:initial.account.id,channel:input.channel,recipient:initial.recipient,signalId:initial.signal?.id||'',status:'running',createdAt:now(),scope:initial.scope,sourceHash};
  a.outreachRuns.push(run);active.add(`${email}:${run.id}`);try{writeWorkspace(email,s);}catch(e){active.delete(`${email}:${run.id}`);throw e;}
  const work=generateContactSuggestion(email,{leadId:initial.lead.id,opportunityId:initial.op.id,accountId:initial.account.id,channel:input.channel,signalId:initial.signal?.id,agentConfig:initial.version.config},deps);
  // A visible timeout does not release a still-running provider's concurrency slot.
  work.then(()=>active.delete(`${email}:${run.id}`),()=>active.delete(`${email}:${run.id}`));
  let timer;
  const completion=(async()=>{
    try{
      const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('起草达到时长上限，请稍后重试')),deps.timeoutMs??90000);})]);
      const latest=load(email), current=context(latest,payload), record=latest.acquisition.outreachRuns.find(r=>r.id===run.id);
      if(!record||record.status!=='running')return;
      if(scopeHash(current)!==sourceHash||!isScopeCurrent(latest,current.c.id,run.scope))throw new Error('资料、会话或控制状态已变化，请重新起草');
      const inbound=incomingByTime(current.lead.messages).filter(m=>m.opportunityId===current.op.id&&m.accountId===current.account.id&&m.channel===input.channel).at(-1);
      const message={id:id(),direction:'outbound',text:result.text,status:'draft',accountId:current.account.id,channel:input.channel,recipient:current.recipient,replyTo:inbound?.id||'',createdAt:now(),source:'agent_draft',agentId:current.agent.id,agentVersion:current.version.number,knowledgeHash:current.version.knowledgeHash,opportunityId:current.op.id,opportunityRevision:current.op.revision,productScope:run.scope,signalId:current.signal?.id||'',method:result.method,salesPlan:result.salesPlan};
      current.lead.messages.push(message);current.lead.updatedAt=now();
      Object.assign(record,{status:result.method==='template'?'limited':'completed',finishedAt:now(),messageId:message.id,basis:result.basis});writeWorkspace(email,latest);
    }catch(e){const latest=load(email),record=latest.acquisition.outreachRuns.find(r=>r.id===run.id);if(record?.status==='running'){record.status='failed';record.error=['起草达到时长上限，请稍后重试','资料、会话或控制状态已变化，请重新起草','已由人工接管，先明确恢复智能体建议','该对象已拒绝联系','生成期间业务资料或会话已变化，请按最新情况重新生成'].includes(e.message)?e.message:'模型或事实核对未完成，请检查连接与当前业务状态后重试';record.finishedAt=now();writeWorkspace(email,latest);}}
    finally{clearTimeout(timer);}
  })();
  return {workspace:s,completion};
}
