// Descriptive comparisons of user-reported observations, never causal scores.
// The caller supplies one exact account/platform/window from comparableOutcomes.
export function accountReviewSuggestions(group) {
  if (!group?.accountId || !group.platform || !group.start || !group.end) return [];
  const rows=group.rows || [];
  // Ambiguous duplicated publications are not independent samples.
  const counts=new Map();
  for(const row of rows) if(row.publicationId) counts.set(row.publicationId,(counts.get(row.publicationId)||0)+1);
  const sample=rows.filter(row=>row.publicationId && counts.get(row.publicationId)===1);
  const suggestions=[];
  const valid=(row,key)=>Number.isFinite(row[key]) && row[key]>=0 && (key!=='completionRate' || row[key]<=100);
  const title=row=>`《${String(row.title || '未命名作品').slice(0,100)}》`;
  const compare=(key,eligible,label,id,next)=>{
    const list=eligible.filter(row=>valid(row,key)).sort((a,b)=>b[key]-a[key] || a.publicationId.localeCompare(b.publicationId));
    if(list.length<2)return null;
    const high=list[0],low=list.at(-1);
    const observation=high[key]===low[key]
      ? `${list.length} 篇已记录作品的${label}均为 ${high[key]}${key==='completionRate'?'%':''}，目前无法据此区分表现。`
      : `同一统计窗口，${title(high)}的${label}为 ${high[key]}${key==='completionRate'?'%':''}，${title(low)}为 ${low[key]}${key==='completionRate'?'%':''}；这是记录差异，不代表原因。`;
    const hypothesis=high[key]===low[key]
      ? `先核对这 ${list.length} 篇作品的${label}是否完整、口径一致，再补录下一统计窗口；暂不把任一作品的写法认定为有效规律。`
      : next(high,low);
    suggestions.push({id,label,observation,hypothesis,evidenceIds:list.map(row=>row.outcomeId).filter(Boolean),publicationIds:list.map(row=>row.publicationId)});
    return {list,high,low};
  };
  const views=compare('views',sample,'阅读 / 播放','views',(high,low)=>`下一篇先对照${title(high)}与${title(low)}的选题和开头，只调整其中一项；在同账号、同口径窗口记录阅读 / 播放及有效客资，验证差异是否重现。`);
  const criteria=[...new Set(sample.filter(row=>valid(row,'qualifiedLeads') && row.criteria?.trim()).map(row=>row.criteria.trim()))].sort();
  for(const definition of criteria) {
    const criterion=definition.length>160?definition.slice(0,157)+'…':definition;
    const leads=compare('qualifiedLeads',sample.filter(row=>row.criteria?.trim()===definition),`有效客资（${criterion}）`,`leads:${definition}`,(high,low)=>`下一篇核对${title(high)}与${title(low)}的受众、业务证据和咨询入口，只修改一个承接问题；继续按「${criterion}」记录有效客资，同时记录阅读 / 播放，不把数量差异当作转化率。`);
    if(!views || !leads || views.list.filter(r=>r.views===views.high.views).length!==1 || leads.list.filter(r=>r.qualifiedLeads===leads.high.qualifiedLeads).length!==1)continue;
    const reach=views.high,lead=leads.high;
    if(reach.publicationId===lead.publicationId || !valid(reach,'qualifiedLeads') || reach.criteria?.trim()!==definition || !valid(lead,'views'))continue;
    suggestions.push({id:`dual:${definition}`,label:'流量与客资分开看',observation:`${title(reach)}的阅读 / 播放较高（${reach.views}），${title(lead)}的有效客资较高（${lead.qualifiedLeads}，${criterion}）；两项目标的领先作品不同。`,hypothesis:`下一篇同时记录流量和有效客资，先对照${title(reach)}与${title(lead)}的受众及咨询入口，只验证一个改动；保留「${criterion}」口径，不用总播放量代替获客效果。`,evidenceIds:[reach.outcomeId,lead.outcomeId].filter(Boolean),publicationIds:[reach.publicationId,lead.publicationId]});
  }
  compare('completionRate',sample,'平台完播率','completion',(high,low)=>`下一条视频仅调整开头的信息顺序，正文与时长尽量保持可比；发布后核对平台完播率定义，在同账号同窗口记录完播率与阅读 / 播放，验证是否改善。现有数据不能判断观众在哪一秒离开。`);
  return suggestions;
}
