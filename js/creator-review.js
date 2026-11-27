import {CONTENT_JOBS,contentJob} from './content-job.js';
import { GROWTH_GOALS, METRICS } from './growth-metrics.js';
import { isRealEvidence } from './evidence-kind.js';

// Keep the newest observation for each actual publication and exact window.
// Historical entries without a publication ID are grouped by post + account,
// and remain labelled as unlinked rather than being treated as verified posts.
export function latestOutcomes(customer = {}) {
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
  for (const window of customer.orderReviewWindows || []) {
    if (window.stale || !isRealEvidence(window)) continue;
    for (const row of window.rows || []) {
      const identity = JSON.stringify(['order-ledger', window.id, row.publicationId]);
      result.push({pack:null,key:'',row,identity,pendingAttribution:window.pending});
    }
  }
  return result;
}
const reviewMetrics = ['views','qualifiedLeads','completionRate','shares','orders','revenue','refunds'];
const salesMetrics = ['orders','revenue','refunds'];
function savedMeasures(row) {
  return Object.fromEntries(reviewMetrics.map(key => [key, Number.isFinite(row.metrics?.[key]) ? row.metrics[key] : null]));
}
function comparable(rows,key,needsCriteria=false) {
  const counts = new Map();
  for (const row of rows) {
    if (row[key] === null || (needsCriteria && !row.criteria)) continue;
    const definition = needsCriteria ? row.criteria : '';
    if (!counts.has(definition)) counts.set(definition,new Set());
    const ids = counts.get(definition);
    ids.add(row.publicationId);
    if (ids.size >= 2) return true;
  }
  return false;
}
export function comparableOutcomes(customer = {},filterGoal='') {
  const groups = new Map();
  for (const { row,identity,pendingAttribution } of latestOutcomes(customer)) {
    if(filterGoal && row.goal!==filterGoal) continue;
    const metrics = savedMeasures(row);
    if (!Object.values(metrics).some(Number.isFinite) || !row.accountId || !row.publicationId || !row.start || !row.end) continue;
    const seriesId = row.seriesId || '';
    const key = JSON.stringify([row.accountId,row.platform,row.start,row.end,seriesId]);
    if (!groups.has(key)) groups.set(key,{rows:[],pendingAttribution});
    const creatorPack=row.creatorPack && typeof row.creatorPack.name==='string' ? {id:row.creatorPack.id||'',name:row.creatorPack.name,version:row.creatorPack.version??null,instruction:row.creatorPack.instruction||'',...(row.creatorPack.attribution==='user-confirmed'?{attribution:'user-confirmed'}:{})} : null;
    groups.get(key).rows.push({
      id:identity, outcomeId:row.id || '', accountName:row.accountName || '未命名账号',
      title:row.content?.title || row.content?.cover || '未命名内容', ...metrics,
      criteria:typeof row.criteria==='string' ? row.criteria.trim() : '', source:row.source,
      publicationId:row.publicationId, creatorPack, contentJob:contentJob(row.contentJob),
      goal:Object.hasOwn(GROWTH_GOALS,row.goal) ? row.goal : '', revision:row.revision || row.publicationVersion || '',
      metricSources:row.metricSources || null,
    });
  }
  return [...groups.entries()].flatMap(([key,{rows,pendingAttribution}])=>{
    const comparableViews = comparable(rows,'views'), comparableLeads = comparable(rows,'qualifiedLeads',true);
    const comparableCompletion = comparable(rows,'completionRate'), comparableShares = comparable(rows,'shares');
    const comparableSales = salesMetrics.some(metric=>comparable(rows,metric,true));
    const goalAvailable={reach:comparableViews,spread:comparableShares,leads:comparableLeads,sales:comparableSales,reach_leads:comparableViews||comparableLeads};
    if(filterGoal && !goalAvailable[filterGoal]) return [];
    if (!(comparableViews || comparableLeads || comparableCompletion || comparableShares || comparableSales)) return [];
    const [accountId,platform,start,end,seriesId]=JSON.parse(key);
    const primary=GROWTH_GOALS[filterGoal]?.metric || 'views';
    // Leads and orders with different definitions cannot be ranked together.
    const sortKey=['orders','qualifiedLeads'].includes(primary) && new Set(rows.map(r=>r.criteria)).size>1 ? 'views' : primary;
    rows.sort((a,b)=>(b[sortKey]??-1)-(a[sortKey]??-1) || a.publicationId.localeCompare(b.publicationId) || a.outcomeId.localeCompare(b.outcomeId));
    return [{accountId,accountName:rows[0].accountName,platform,start,end,seriesId,filterGoal,comparableViews,comparableLeads,comparableCompletion,comparableShares,comparableSales,rows,...(pendingAttribution>0?{pendingAttribution}:{})}];
  });
}
export function sameReviewGroup(group,selection) {
  return group.accountId===selection.accountId && group.platform===selection.platform &&
    group.start===selection.start && group.end===selection.end && (group.seriesId||'')===(selection.seriesId||'') && (group.filterGoal||'')===(selection.filterGoal||'');
}
export function comparisonEvidence(group) {
  // Preserve old fingerprints for views-only memories; include lead values and
  // their definitions whenever they contribute to a newer comparison.
  const withLeads=group.rows.some(r=>r.qualifiedLeads!=null),withCompletion=group.rows.some(r=>r.completionRate!=null),withPacks=group.rows.some(r=>r.creatorPack),withJobs=group.rows.some(r=>contentJob(r.contentJob));
  const extended = group.rows.some(row => [row.shares,row.orders,row.revenue,row.refunds].some(Number.isFinite));
  return JSON.stringify([group.accountId,group.platform,group.start,group.end,group.rows.map(r=>{
    const fields=withLeads?[r.publicationId,r.outcomeId,r.views,r.title,r.source,r.qualifiedLeads??null,r.criteria||'']:[r.publicationId,r.outcomeId,r.views,r.title,r.source];
    if(withCompletion) fields.push(r.completionRate??null);
    if(withPacks) fields.push(r.creatorPack||null);
    if(withJobs) fields.push(contentJob(r.contentJob));
    if(group.filterGoal) fields.push(group.filterGoal);
    if(extended) fields.push(group.seriesId || '', r.goal || '',r.revision || '', r.criteria || '',r.metricSources || null,r.shares??null,r.orders??null,r.revenue??null,r.refunds??null);
    return fields;
  }),...(group.pendingAttribution>0?[group.pendingAttribution]:[])]);
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
  const extra = ['shares',...salesMetrics].filter(key => Number.isFinite(row[key])).map(key => {
    const source = row.metricSources?.[key];
    return METRICS[key]+' '+row[key]+(source ? '（'+source+'）' : '');
  });
  if(salesMetrics.some(key=>Number.isFinite(row[key])) && row.criteria) extra.push('成交口径 '+row.criteria);
  const goal = GROWTH_GOALS[row.goal];
  return [goal?.label, views, leads, completion, ...extra].filter(Boolean).join(' · ');
}
export function reviewGoalResult(row) {
  const goal=GROWTH_GOALS[row.goal];
  const keys=goal ? [...(goal.metrics||[goal.metric])] : reviewMetrics.filter(key=>Number.isFinite(row[key]));
  if(goal && !keys.some(key=>Number.isFinite(row[key]))) keys.push(...reviewMetrics.filter(key=>!keys.includes(key)&&Number.isFinite(row[key])));
  return keys.map(key=>METRICS[key]+' '+(Number.isFinite(row[key])?row[key]:'待登记')).join(' · ');
}
export function accountMemoryCurrent(customer,memory,comparisons) {
  if(memory?.kind!=='account-review')return true;
  const e=memory.evidence;if(!e || !Array.isArray(e.rows))return false;
  const current=(e.filterGoal ? comparableOutcomes(customer,e.filterGoal) : comparisons || comparableOutcomes(customer)).find(g=>sameReviewGroup(g,e));
  return Boolean(current && comparisonEvidence(current)===comparisonEvidence(e));
}
export function packOutcomes(customer = {}) {
  return latestOutcomes(customer).flatMap(({row})=>{
    if(!row.creatorPack || !reviewMetrics.some(metric=>Number.isFinite(row.metrics?.[metric])))return [];
    return [{name:row.creatorPack.name,version:row.creatorPack.version,attribution:row.creatorPack.attribution==='user-confirmed'?'user-confirmed':'',title:row.content?.title || '未命名内容',platform:row.platform,accountName:row.accountName || '账号未知',start:row.start,end:row.end,...savedMeasures(row),goal:row.goal,criteria:row.criteria||'',source:row.source,publicationId:row.publicationId || ''}];
  });
}
