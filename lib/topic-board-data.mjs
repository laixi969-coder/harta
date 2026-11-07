import {problemSource} from './problem-observation-data.mjs';
import crypto from 'node:crypto';
import {topicByKey,buildTopicPool} from './topic-pool.mjs';
import {isRealEvidence,isResearchComment} from '../js/evidence-kind.js';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function topicSource(customer,acquisition,kind,key,pool){
 if(kind==='problem')return problemSource(customer,acquisition,key);
 if(kind==='manual')return {basis:'manual',snapshot:{source:'手写选题'}};
 if(kind==='history'){
  const parts=String(key).split('|');if(parts.length!==2)return null;
  const [insightId,clusterId]=parts,insight=(customer.painClusterHistory||[]).find(item=>item.id===insightId),cluster=insight?.clusters?.find(item=>item.id===clusterId);
  if(!insight||insight.staleReason||!cluster||!Array.isArray(insight.sourceSignalIds)||!insight.sourceSignalIds.length)return null;
  const works=acquisition?.works||[],signals=acquisition?.signals||[],evidence=insight.sourceSignalIds.map(id=>signals.find(s=>s.id===id&&s.customerId===customer.id));
  if(evidence.some(s=>!s||!isResearchComment(s,works)))return null;
  const snapshot={source:'历史评论洞察',title:cluster.angle||cluster.topic,why:cluster.anxiety||'',evidence:(cluster.quotes||[]).map(q=>q.text),insightId,clusterId,generatedAt:insight.generatedAt};
  return {basis:hash([snapshot,evidence.map(s=>[s.id,s.text])]),snapshot};
 }
 if(kind==='sample'){
  const parts=String(key).split('|');if(parts.length!==2)return null;const [insightId,clusterId]=parts,insight=(customer.sampleCommentInsights||[]).find(item=>item.id===insightId),cluster=insight?.clusters?.find(item=>item.id===clusterId);if(!cluster)return null;
  const snapshot={source:'粘贴评论样本（来源未核验）',title:cluster.angle||cluster.topic,why:cluster.anxiety||'',evidence:(cluster.quotes||[]).map(q=>q.text),insightId,clusterId};return {basis:hash(snapshot),snapshot};
 }
 if(kind==='work'){
  const w=(acquisition?.works||[]).find(w=>w.customerId===customer.id&&w.id===key&&isRealEvidence(w));if(!w)return null;
  const snapshot={source:'参考作品',workId:w.id,title:w.title,description:String(w.description||'').slice(0,3000),url:w.url||'',platform:w.platform};return {basis:hash(snapshot),snapshot};
 }
 if(kind==='pool'){
  const topic=pool?pool.get(key):topicByKey(customer,key);if(!topic)return null;
  const snapshot={source:topic.source,title:topic.angle,why:topic.why,evidence:topic.evidence,keywords:topic.keywords};return {basis:hash(snapshot),snapshot};
 }
 return null;
}
export function topicBoardRows(customer,acquisition={}){
 const plans=[...(customer.topicPlans||[])],ids=new Set(plans.map(p=>p.id));
 for(const [workId,decision] of Object.entries(customer.radarDecisions||{}))if(['now','next','parked','discard'].includes(decision.action)&&!ids.has('work:'+workId)){
  const source=topicSource(customer,acquisition,'work',workId);if(!source)continue;
  plans.push({id:'work:'+workId,version:0,kind:'work',sourceKey:workId,title:source.snapshot.title,hook:'',platform:['小红书','抖音','视频号','公众号'].includes(source.snapshot.platform)?source.snapshot.platform:'小红书',format:source.snapshot.platform==='公众号'?'article':'video',goal:customer.growthGoal||'leads',bucket:decision.action,sourceBasis:source.basis,sourceSnapshot:source.snapshot,createdAt:decision.updatedAt});
 }
 const packs=[...(customer.drops||[]),...(customer.packs||[])],pool=plans.some(p=>p.kind==='pool')?new Map(buildTopicPool(customer,{limit:Number.MAX_SAFE_INTEGER}).topics.map(t=>[t.key,t])):null;
 return plans.map(p=>{const source=topicSource(customer,acquisition,p.kind,p.sourceKey,pool),packExists=!!p.packId&&packs.some(pack=>pack.id===p.packId),arranged=p.kind==='work'?(customer.radarDecisions?.[p.sourceKey]?.action||'parked'):p.bucket;
  return {...p,basis:hash([p,arranged,packExists,source?.basis]),packExists,arrangement:['now','next','parked','discard'].includes(arranged)?arranged:'parked',bucket:arranged==='discard'?'discard':packExists?'drafts':['now','next','parked'].includes(arranged)?arranged:'parked',sourceCurrent:!!source&&source.basis===p.sourceBasis,currentSource:source?.snapshot||null};
 });
}
export function scheduledTopicCount(customer,acquisition){return topicBoardRows(customer,acquisition).filter(p=>p.bucket==='now').length;}
