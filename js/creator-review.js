import {CONTENT_JOBS,contentJob} from './content-job.js';
import { isRealEvidence } from './evidence-kind.js';

// Keep the newest observation for each actual publication and exact window.
// Historical entries without a publication ID are grouped by post + account,
// and remain labelled as unlinked rather than being treated as verified posts.
function latestOutcomes(customer = {}) {
  const result=[],seen=new Set();
  for(const pack of [...(customer.drops || []), ...(customer.packs || [])]) {
    if(!isRealEvidence(pack))continue;
    for(const [key,rows] of Object.entries(pack.outcomes || {})) for(const row of rows || []) {
      if(!isRealEvidence(row) || !row.platform)continue;
      const identity=JSON.stringify([pack.id,key,row.publicationId || '',row.accountId || '',row.platform,row.start,row.end]);
      if(seen.has(identity))continue;
      seen.add(identity);result.push({pack,key,row,identity});
    }
  }
  for(const row of customer.accountReviewOutcomes || []) {
    if(!isRealEvidence(row) || !row.platform || !row.publicationId)continue;
    const identity=JSON.stringify(['external',row.publicationId,row.accountId || '',row.platform,row.start,row.end]);
    if(seen.has(identity))continue;
    seen.add(identity);result.push({pack:null,key:'',row,identity});
  }
  return result;
}
export function comparableOutcomes(customer = {}) {
  const groups=new Map();
  for(const {row,identity} of latestOutcomes(customer)) {
    const views=Number.isFinite(row.metrics?.views)?row.metrics.views:null;
    const qualifiedLeads=Number.isFinite(row.metrics?.qualifiedLeads)?row.metrics.qualifiedLeads:null;
    const completionRate=Number.isFinite(row.metrics?.completionRate)?row.metrics.completionRate:null;
    if((views===null && qualifiedLeads===null && completionRate===null) || !row.accountId || !row.publicationId || !row.start || !row.end)continue;
    const groupKey=JSON.stringify([row.accountId,row.platform,row.start,row.end]);
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    const creatorPack=row.creatorPack && typeof row.creatorPack.name==='string' ? {id:row.creatorPack.id||'',name:row.creatorPack.name,version:row.creatorPack.version??null,instruction:row.creatorPack.instruction||'',...(row.creatorPack.attribution==='user-confirmed'?{attribution:'user-confirmed'}:{})} : null;
    groups.get(groupKey).push({id:identity,outcomeId:row.id || '',accountName:row.accountName || '未命名账号',title:row.content?.title || row.content?.cover || '未命名内容',views,qualifiedLeads,completionRate,criteria:typeof row.criteria==='string'?row.criteria.trim():'',source:row.source,publicationId:row.publicationId || '',creatorPack,contentJob:contentJob(row.contentJob)});
  }
  return [...groups.entries()].flatMap(([key,rows])=>{
    const leadCounts=new Map();for(const row of rows)if(row.qualifiedLeads!==null && row.criteria)leadCounts.set(row.criteria,(leadCounts.get(row.criteria)||0)+1);
    const comparableViews=rows.filter(r=>r.views!==null).length>=2,comparableLeads=[...leadCounts.values()].some(n=>n>=2),comparableCompletion=rows.filter(r=>r.completionRate!==null).length>=2;
    if(!comparableViews && !comparableLeads && !comparableCompletion)return [];
    const [accountId,platform,start,end]=JSON.parse(key);
    rows.sort((a,b)=>(b.views??-1)-(a.views??-1) || a.publicationId.localeCompare(b.publicationId) || a.outcomeId.localeCompare(b.outcomeId));
    return [{accountId,accountName:rows[0].accountName,platform,start,end,comparableViews,comparableLeads,comparableCompletion,rows}];
  });
}
export function comparisonEvidence(group) {
  // Preserve old fingerprints for views-only memories; include lead values and
  // their definitions whenever they contribute to a newer comparison.
  const withLeads=group.rows.some(r=>r.qualifiedLeads!=null),withCompletion=group.rows.some(r=>r.completionRate!=null),withPacks=group.rows.some(r=>r.creatorPack),withJobs=group.rows.some(r=>contentJob(r.contentJob));
  return JSON.stringify([group.accountId,group.platform,group.start,group.end,group.rows.map(r=>{let fields=withLeads?[r.publicationId,r.outcomeId,r.views,r.title,r.source,r.qualifiedLeads??null,r.criteria||'']:[r.publicationId,r.outcomeId,r.views,r.title,r.source];if(withCompletion)fields=[...fields,r.completionRate??null];if(withPacks)fields=[...fields,r.creatorPack||null];if(withJobs)fields=[...fields,contentJob(r.contentJob)];return fields;})]);
}
export function reviewJobText(row){return CONTENT_JOBS[contentJob(row?.contentJob)] || '未记录任务';}
export function reviewPackText(row) {
  const pack=row?.creatorPack;
  return pack?.name ? `${pack.name}${pack.version!=null?` v${pack.version}`:''}${pack.attribution==='user-confirmed'?'（人工确认）':''}` : '未记录打法';
}
export function reviewMetricText(row) {
  const views=row.views==null?'阅读 / 播放未记录':`${row.views} 阅读 / 播放`;
  const leads=row.qualifiedLeads==null?'有效客资未记录':`${row.qualifiedLeads} 有效客资（口径：${row.criteria || '未填写'}）`;
  const completion=row.completionRate==null?'平台完播率未记录':`${row.completionRate}% 平台完播率`;
  return `${views} · ${leads} · ${completion}`;
}
export function accountMemoryCurrent(customer,memory,comparisons) {
  if(memory?.kind!=='account-review')return true;
  const e=memory.evidence;if(!e || !Array.isArray(e.rows))return false;
  const current=(comparisons || comparableOutcomes(customer)).find(g=>g.accountId===e.accountId && g.platform===e.platform && g.start===e.start && g.end===e.end);
  return Boolean(current && comparisonEvidence(current)===comparisonEvidence(e));
}
export function packOutcomes(customer = {}) {
  return latestOutcomes(customer).flatMap(({row})=>{
    if(!row.creatorPack || (row.metrics?.views == null && row.metrics?.qualifiedLeads == null && row.metrics?.completionRate == null))return [];
    return [{name:row.creatorPack.name,version:row.creatorPack.version,attribution:row.creatorPack.attribution==='user-confirmed'?'user-confirmed':'',title:row.content?.title || '未命名内容',platform:row.platform,accountName:row.accountName || '账号未知',start:row.start,end:row.end,views:row.metrics.views??null,qualifiedLeads:row.metrics.qualifiedLeads??null,completionRate:row.metrics.completionRate??null,criteria:row.criteria||'',source:row.source,publicationId:row.publicationId || ''}];
  });
}
