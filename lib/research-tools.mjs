import {scheduledTopicCount} from './topic-board-data.mjs';
import { isRealEvidence, isResearchComment } from '../js/evidence-kind.js';
/* 研究类动作的统一入口：关键词扩展、痛点归集、对标拆解、写作底稿。
 *
 * 都遵守同一条规矩：读的是当前账号名下的真实数据，写回业务档案，
 * 失败如实报错，不拿模型脑补的数据补位。 */

import crypto from 'node:crypto';
import { withBusinessModelBudget } from './model-budget.mjs';
import { readWorkspace, writeWorkspace, saveKeywordLibrary } from './workspace.mjs';
import { expandKeywordBatch, businessCorpus } from './keyword-expand.mjs';
import { clusterPains, painSignals } from './pain-clusters.mjs';
import { teardownWork, teardownAccount } from './benchmark-teardown.mjs';
import { refreshPlaybook } from './writing-knowledge.mjs';
import { buildTopicPool, topicByKey, appendDirection, recordDecision } from './topic-pool.mjs';
import { calibrateHunt, huntEvidence, withCalibrationEvidence } from './hunt-calibration.mjs';
import { chat, llmReady } from './llm.mjs';

const running = new Set();
const lockKey = (email, kind, id) => `${String(email).toLowerCase()}:${kind}:${id}`;

function withLock(email, kind, id, label, task) {
  const key = lockKey(email, kind, id);
  if (running.has(key)) throw new Error(`${label}正在进行，请等本次结果`);
  running.add(key);
  return Promise.resolve().then(task).finally(() => running.delete(key));
}

function customerOf(space, customerId) {
  const customer = space.customers.find((row) => row.id === customerId);
  if (!customer) throw new Error('找不到你名下的业务客户');
  return customer;
}

export function expandKeywordsForCustomer(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || '');
  const seeds = (Array.isArray(body.seeds) ? body.seeds : String(body.seeds || '').split(/[,，、\n]/))
    .map((row) => String(row || '').trim()).filter(Boolean);
  if (!seeds.length) throw new Error('先填一个种子词');
  return withLock(email, 'keyword-expand', customerId, '关键词扩展', async () => {
    const space = readWorkspace(email), customer = customerOf(space, customerId);
    const acquisition = space.acquisition || {};
    const works = (acquisition.works || []).filter((row) => row.customerId === customerId && isRealEvidence(row));
    const signals = (acquisition.signals || []).filter((row) => row.customerId === customerId && isResearchComment(row,works));
    const basis=JSON.stringify([customer.hunt,businessCorpus(customer,signals,works)]);
    const batch = await expandKeywordBatch({
      customer,
      seeds,
      signals,
      works,
      fetcher: deps.fetcher,
      scopeType: body.scopeType || '领域',
      scopeName: body.scopeName || customer.hunt || '',
      limit: Math.min(Math.max(Number(body.limit) || 120, 10), 200),
    });
    const latest=readWorkspace(email),current=customerOf(latest,customerId);
    const currentWorks=(latest.acquisition?.works||[]).filter(row=>row.customerId===customerId && isRealEvidence(row));
    const currentSignals=(latest.acquisition?.signals||[]).filter(row=>row.customerId===customerId && isResearchComment(row,currentWorks));
    if(JSON.stringify([current.hunt,businessCorpus(current,currentSignals,currentWorks)])!==basis)throw new Error('扩展期间业务资料或评论已变化，请重新扩展');
    batch.corpusSignalIds=signals.map(row=>row.id).filter(id=>typeof id==='string');
    // 复用已有词库的容量与校验规则，扩展结果就是一批普通关键词。
    const saved = saveKeywordLibrary(email, customerId, batch);
    if (saved.error) throw new Error(saved.error);
    return { workspace: saved.workspace, batch };
  });
}

function painInputs(space,customerId) {
  const customer=customerOf(space,customerId),works=(space.acquisition?.works||[]).filter(w=>w.customerId===customerId && isRealEvidence(w));
  const signals=(space.acquisition?.signals||[]).filter(s=>s.customerId===customerId && isResearchComment(s,works));
  const effective=painSignals(signals),basis=JSON.stringify([[customer.name,customer.hunt,customer.pitch,customer.city],effective.map(s=>[s.id,s.text])]);
  return {customer,signals,effective,basis};
}
export function aggregatePains(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || '');
  if(body.removeSampleInsight!==undefined){
    if(typeof body.removeSampleInsight!=='string' || !body.removeSampleInsight)throw new Error('样本洞察标识不正确');
    if(running.has(lockKey(email,'pain-samples',customerId)))throw new Error('样本分析正在进行，请稍后移除');
    const space=readWorkspace(email),customer=customerOf(space,customerId),items=customer.sampleCommentInsights||[];
    if(!items.some(item=>item.id===body.removeSampleInsight))throw new Error('找不到该样本洞察');
    customer.sampleCommentInsights=items.filter(item=>item.id!==body.removeSampleInsight);writeWorkspace(email,space);return Promise.resolve({workspace:space});
  }
  if(body.sampleOnly===true){
    if(typeof body.samples!=='string' || body.samples.length>60000)throw new Error('粘贴样本格式不正确或超过 60000 字');
    const lines=body.samples.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(!lines.length || lines.length>100 || lines.some(line=>line.length>6000))throw new Error('请粘贴 1 至 100 条评论，每行一条且不超过 6000 字');
    return withLock(email,'pain-samples',customerId,'粘贴样本分析',async()=>{
      const space=readWorkspace(email),input=painInputs(space,customerId),batch=crypto.randomUUID(),samples=lines.map((text,index)=>({id:`pasted:${batch}:${index}`,customerId,text}));
      const result=await withBusinessModelBudget(email,customerId,'content-generation',()=>clusterPains(samples,{chatFn:deps.chatFn||chat,modelReady:deps.modelReady??llmReady(),business:input.customer,customerId}));
      const latest=readWorkspace(email),current=painInputs(latest,customerId);if(current.basis!==input.basis)throw new Error('分析期间业务资料或评论已变化，请重新分析');
      result.sourceType='pasted-unverified';result.inputCount=lines.length;result.samples=lines;result.warnings=(result.warnings||[]).map(w=>w.replace('真实评论','粘贴样本'));
      current.customer.sampleCommentInsights=[result,...(current.customer.sampleCommentInsights||[])].slice(0,12);writeWorkspace(email,latest);
      return {workspace:latest,clusters:result};
    });
  }
  if(body.sampleOnly!==undefined && body.sampleOnly!==false)throw new Error('评论分析类型不正确');
  return withLock(email, 'pain-clusters', customerId, '评论归集', async () => {
    const space=readWorkspace(email),input=painInputs(space,customerId);
    const result = await withBusinessModelBudget(email, customerId, 'content-generation', () => clusterPains(input.signals, { chatFn: deps.chatFn || chat, modelReady: deps.modelReady ?? llmReady(), business: input.customer, customerId }));
    const latest=readWorkspace(email),current=painInputs(latest,customerId),target=current.customer;
    if(current.basis!==input.basis)throw new Error('归集期间评论或业务资料已变化，请重新归集');
    result.sourceSignalIds=input.effective.map(s=>s.id).filter(id=>typeof id==='string');
    if (target.painClusters) target.painClusterHistory = [target.painClusters,...(target.painClusterHistory || []).filter(item=>item.id!==target.painClusters.id)].slice(0,12);
    target.painClusters = result;
    writeWorkspace(email, latest);
    return { workspace: latest, clusters: result };
  });
}

function singleTeardownInputs(space,customerId,workId) {
  const customer=customerOf(space,customerId),acquisition=space.acquisition||{},allWorks=acquisition.works||[];
  const work=allWorks.find(row=>row.id===workId && row.customerId===customerId && isRealEvidence(row));
  if(!work)return null;
  const comments=(acquisition.signals||[]).filter(row=>row.workId===workId && row.customerId===customerId && isResearchComment(row,allWorks));
  const siblings=allWorks.filter(row=>row.customerId===customerId && isRealEvidence(row) && row.id!==workId && row.platform===work.platform && work.authorId && row.authorId===work.authorId);
  return {customer,work,comments,siblings,basis:JSON.stringify([[customer.name,customer.hunt,customer.pitch,customer.city],work,comments,siblings])};
}
function accountTeardownInputs(space,customerId,platform,authorId) {
  const customer=customerOf(space,customerId),allWorks=space.acquisition?.works||[];
  const works=allWorks.filter(row=>row.customerId===customerId && isRealEvidence(row) && row.platform===platform && row.authorId===authorId);
  const ids=new Set(works.map(row=>row.id)),comments=(space.acquisition?.signals||[]).filter(row=>row.customerId===customerId && ids.has(row.workId) && isResearchComment(row,works));
  return {customer,works,comments,basis:JSON.stringify([[customer.name,customer.hunt,customer.pitch,customer.city],works,comments])};
}
export function teardownForCustomer(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || ''), workId = String(body.workId || '');
  if (!workId) throw new Error('先选一条要拆解的作品');
  return withLock(email, 'teardown', workId, '对标拆解', async () => {
    const space=readWorkspace(email),input=singleTeardownInputs(space,customerId,workId);
    if(!input)throw new Error('找不到这条作品，或不属于当前业务');
    const result=await withBusinessModelBudget(email,customerId,'content-generation',()=>teardownWork(input.work,input.comments,{chatFn:deps.chatFn||chat,modelReady:deps.modelReady??llmReady(),business:input.customer,customerId,siblings:input.siblings}));
    const latest=readWorkspace(email),current=singleTeardownInputs(latest,customerId,workId);
    if(!current || current.basis!==input.basis)throw new Error('拆解期间作品、评论或业务资料已变化，请重新拆解');
    result.sourceSignalIds=painSignals(input.comments).map(s=>s.id).filter(id=>typeof id==='string');
    const target=current.customer;
    target.benchmarkTeardowns = [{ ...result, id: result.id || crypto.randomUUID() }, ...(target.benchmarkTeardowns || []).filter((row) => row.workId !== workId)].slice(0, 20);
    writeWorkspace(email, latest);
    return { workspace: latest, teardown: result };
  });
}

/** 博主级拆解：一个人一直怎么写，和单篇怎么写的两件事。 */
export async function teardownAccountForCustomer(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || ''), suppliedId = String(body.authorId || ''), authorName = String(body.authorName || '');
  if (!suppliedId && !authorName) throw new Error('先选一个要拆解的博主');
  const space = readWorkspace(email), customer = customerOf(space, customerId);
  const candidates = (space.acquisition?.works || []).filter(row => row.customerId === customerId && isRealEvidence(row)
    && (suppliedId ? row.authorId === suppliedId : row.authorName === authorName));
  const platforms = [...new Set(candidates.map(row => row.platform))];
  const platform = body.platform || (platforms.length === 1 ? platforms[0] : '');
  if (!platform && platforms.length > 1) throw new Error('多个平台存在相同博主标识，请明确选择平台');
  const platformWorks = candidates.filter(row => row.platform === platform);
  if (!platformWorks.length) throw new Error('这个博主在所选平台还没有采到作品');
  const ids = [...new Set(platformWorks.map(row => row.authorId).filter(Boolean))];
  if (!suppliedId && (ids.length !== 1 || platformWorks.some(row => !row.authorId))) throw new Error('同名博主身份无法确认，请使用明确的平台用户 ID');
  const authorId = suppliedId || ids[0];
  const works = platformWorks.filter(row => row.authorId === authorId);
  const identity = JSON.stringify([customerId, platform, authorId]);
  return withLock(email, 'account-teardown', identity, '博主拆解', async () => {
    const input=accountTeardownInputs(space,customerId,platform,authorId);
    const result=await withBusinessModelBudget(email,customerId,'content-generation',()=>teardownAccount({authorId,authorName:input.works[0].authorName||authorName,platform,works:input.works,comments:input.comments},
      {chatFn:deps.chatFn||chat,modelReady:deps.modelReady??llmReady(),business:input.customer,customerId}));
    const latest=readWorkspace(email),current=accountTeardownInputs(latest,customerId,platform,authorId),target=current.customer;
    if(current.basis!==input.basis)throw new Error('账号拆解期间作品、评论或业务资料已变化，请重新拆解');
    result.sourceSignalIds=painSignals(input.comments).map(s=>s.id).filter(id=>typeof id==='string');result.sourceWorkIds=input.works.map(w=>w.id);
    target.accountTeardowns = [result, ...(target.accountTeardowns || []).filter(row => row.platform !== platform || row.authorId !== authorId)].slice(0, 10);
    writeWorkspace(email, latest);
    return { workspace: latest, account: result };
  });
}

export function rebuildPlaybook(email, body = {}) {
  const customerId = String(body.customerId || '');
  const space = readWorkspace(email), customer = customerOf(space, customerId);
  const playbook = refreshPlaybook(space, customer, space.feedback || {});
  writeWorkspace(email, space);
  return { workspace: space, playbook };
}

/** 选题池每次现算，不存快照：痛点、拆解、关键词一变，题目跟着变。 */
export function topicPoolFor(email, body = {}) {
  const space = readWorkspace(email), customer = customerOf(space, body.customerId);
  return { workspace: space, pool: requestedTopicPool(customer,body.page,body.status) };
}
function requestedTopicPool(customer,page,status) {
  validateTopicStatus(status);
  if(page===undefined)return buildTopicPool(customer);
  validateTopicPage(page);
  const selected=status || '候选',pool=buildTopicPool(customer,{limit:40,offset:page*40,status:selected});
  return {...pool,page:Math.floor(pool.offset/40),status:selected};
}
function validateTopicPage(page){if(page!==undefined && (!Number.isSafeInteger(page) || page<0 || page>100000))throw new Error('选题页码不正确');}
function validateTopicStatus(status){if(status!==undefined && !['候选','已用','不用'].includes(status))throw new Error('选题状态不正确');}

export function decideRadarWork(email, {customerId,workId,action} = {}) {
  if(!['now','next','parked','discard','reset'].includes(action)) throw new Error('请选择本周、下一批、待定或舍弃');
  const space=readWorkspace(email),customer=customerOf(space,customerId);
  const works=(space.acquisition?.works || []).filter(w=>w.customerId===customerId && isRealEvidence(w) && ['小红书','抖音','公众号'].includes(w.platform));
  if(typeof workId!=='string' || !works.some(w=>w.id===workId))throw new Error('找不到当前业务的参考作品');
  const decisions={...(customer.radarDecisions || {})};
  if(action==='now') {
    const valid=new Set(works.map(w=>w.id));
    const count=scheduledTopicCount({...customer,radarDecisions:Object.fromEntries(Object.entries(decisions).filter(([id])=>id!==workId))},space.acquisition);
    if(count>=5)throw new Error('本周最多安排5个参考作品，请先调整已有安排');
  }
  if(action==='reset')delete decisions[workId];else Object.defineProperty(decisions,workId,{value:{action,updatedAt:new Date().toISOString()},enumerable:true,configurable:true,writable:true});
  if(Object.keys(decisions).length>500)throw new Error('参考作品记录已达上限，请先清理不再需要的安排');
  customer.radarDecisions=decisions;writeWorkspace(email,space);return {workspace:space};
}

export function importRadarSamples(email, {customerId,platform,text} = {}) {
  if(!['小红书','抖音','公众号'].includes(platform))throw new Error('请选择小红书、抖音或公众号');
  if(typeof text!=='string' || !text.trim() || text.length>40000)throw new Error('请粘贴参考样本，总长度最多40000字');
  const blocks=text.trim().split(platform==='公众号'?/\r?\n[ \t]*---[ \t]*\r?\n/:/\r?\n[ \t]*\r?\n+/).map(s=>s.trim()).filter(Boolean);
  if(blocks.length>10)throw new Error('一次最多导入10条样本，请分批粘贴');
  const parsed=blocks.map((block,i)=>{
    const lines=block.split(/\r?\n/),title=lines.shift().trim(),description=lines.join('\n').trim();
    if(!title || title.length>300 || !description || description.length>3000)throw new Error(`第${i+1}条需有标题和正文；标题最多300字，正文最多3000字`);
    return {title,description};
  });
  const space=readWorkspace(email),customer=customerOf(space,customerId);space.acquisition ||= {};space.acquisition.works ||= [];
  const works=space.acquisition.works, fingerprint=(title,description)=>JSON.stringify([platform,title.trim(),description.trim()]);
  const seen=new Set(works.filter(w=>w.customerId===customer.id && w.platform===platform && isRealEvidence(w)).map(w=>fingerprint(String(w.title||''),String(w.description||''))));
  let added=0,duplicates=0;
  for(const item of parsed){const key=fingerprint(item.title,item.description);if(seen.has(key)){duplicates++;continue;}seen.add(key);works.push({id:crypto.randomUUID(),customerId:customer.id,platform,title:item.title,description:item.description,url:'',source:'manual_paste',createdAt:new Date().toISOString()});added++;}
  if(added)writeWorkspace(email,space);
  return {workspace:space,added,duplicates};
}

/** 用或不用一个选题。用 = 写进保存的方向，下一批生成直接采用。 */
export function decideTopic(email, body = {}) {
  const key = String(body.key || ''), action = String(body.action || 'use');
  if (!['use', 'skip', 'reset'].includes(action)) throw new Error('请选择使用、不用或恢复候选');
  validateTopicPage(body.page);
  validateTopicStatus(body.status);validateTopicStatus(body.expectedStatus);
  const space = readWorkspace(email), customer = customerOf(space, body.customerId);
  const topic = topicByKey(customer,key);
  if (!topic) throw new Error('这个选题已经不在池子里了，请刷新后重选');
  if(body.expectedStatus && body.expectedStatus!==topic.status)throw new Error('选题状态已变化，请刷新后重试');
  customer.topicDecisions = recordDecision(customer.topicDecisions, key, action === 'use' ? 'used' : action === 'skip' ? 'skipped' : '候选');
  if (action === 'use') {
    customer.growthDirection = appendDirection(customer.growthDirection, topic);
    customer.directionUpdatedAt = new Date().toISOString();
  }
  writeWorkspace(email, space);
  return { workspace: space, pool: requestedTopicPool(customer,body.page,body.status), direction: customer.growthDirection || '' };
}

/** 行业包校准：按真实语料决定这个包能不能从 D 顶到 C/B，差什么也写清楚。 */
export function calibrateHuntFor(email, body = {}) {
  const space = readWorkspace(email), customer = customerOf(space, body.customerId);
  if (!customer.hunt) throw new Error('这个业务还没填行业，先补业务资料');
  const works = (space.acquisition?.works || []).filter((row) => row.customerId === customer.id && isRealEvidence(row));
  const signals = (space.acquisition?.signals || []).filter((row) => row.customerId === customer.id && isResearchComment(row,works));
  const evidence = huntEvidence({ customer, signals, works });
  const calibration = withCalibrationEvidence(calibrateHunt(customer.hunt, evidence), customer);
  customer.huntCalibration = calibration;
  writeWorkspace(email, space);
  return { workspace: space, calibration };
}

/** 标记有回音 / 没反应之后，底稿当场重算，不用等人再点一次刷新。
 * 反馈键形如 `<packId>-<组名>-<下标>`，而 packId 是带连字符的 UUID，只能按前缀匹配。 */
export function refreshPlaybookAfterFeedback(email, workspace, feedbackKey) {
  const key = String(feedbackKey || '');
  const targets = (workspace.customers || []).filter((customer) => [...(customer.packs || []), ...(customer.drops || [])].some((pack) => pack.id && key.startsWith(`${pack.id}-`)));
  if (!targets.length) return workspace;
  const before = new Map(targets.map((customer) => [customer.id, customer.playbook ? JSON.stringify(customer.playbook.cards || []) : null]));
  for (const customer of targets) refreshPlaybook(workspace, customer, workspace.feedback || {});
  const changed = targets.some((customer) => (customer.playbook ? JSON.stringify(customer.playbook.cards || []) : null) !== before.get(customer.id));
  if (changed) writeWorkspace(email, workspace);
  return workspace;
}
