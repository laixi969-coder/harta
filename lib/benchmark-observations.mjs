import {accountProfile} from './benchmark-teardown.mjs';
import {isRealEvidence,isResearchComment} from '../js/evidence-kind.js';
// Observations describe the selected records, not verified account ownership or causality.
export function benchmarkObservation(group,customerId,acquisition={}) {
 const metric=value=>!['number','string'].includes(typeof value) || (typeof value==='string'&&!value.trim()) || !Number.isFinite(Number(value)) || Number(value)<0 ? null : Number(value);
 const ids=new Set(Array.isArray(group.workIds)?group.workIds:[]),works=(acquisition.works||[]).filter(w=>ids.has(w.id)&&w.customerId===customerId&&w.platform===group.platform&&isRealEvidence(w)).map(w=>({...w,tags:Array.isArray(w.tags)?w.tags:[],metrics:Object.fromEntries(['likes','comments','saves'].map(k=>[k,metric(w.metrics?.[k])]))}));
 const valid=new Set(works.map(w=>w.id)),comments=(acquisition.signals||[]).filter(s=>s.customerId===customerId&&valid.has(s.workId)&&isResearchComment(s,works));
 const profile=accountProfile(works,[]),withBody=works.filter(w=>typeof w.description==='string'&&w.description.trim());
 const likesSum=profile.coverage.likes?works.reduce((sum,w)=>sum+(w.metrics.likes??0),0):null,likesMean=likesSum===null?null:likesSum/profile.coverage.likes;
 const likesComparison=profile.coverage.likes>=2&&likesMean>0?works.filter(w=>w.metrics.likes!==null).map(w=>({workId:w.id,ratio:Math.round(w.metrics.likes/likesMean*100)/100})):[];
 return {works:works.length,missing:ids.size-works.length,likesCoverage:profile.coverage.likes,likesSum,likesMean,likesComparison,medianLikes:profile.medianLikes,titlePatterns:profile.titlePatterns,topTags:profile.topTags,bodyCoverage:withBody.length,numberedShare:withBody.length?accountProfile(withBody,[]).numberedShare:null,commentCount:comments.length};
}
