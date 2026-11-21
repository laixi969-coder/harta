import {GROWTH_GOALS,METRICS,growthGoal} from './growth.js';
import {latestOutcomes} from './creator-review.js';
import {businessResults} from './business-results.js';
import {isRealEvidence} from './evidence-kind.js';
import {packAsSent} from './pack-edits.js';
import {calendarItems,calendarWeek,weeklyCalendarCoverage,weeklyJobSuggestion} from './content-calendar.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const action=(name,label,id='',primary=false)=>`<button type="button" class="btn ${primary?'':'ghost'}" data-cm="${name}" data-id="${esc(id)}">${label}</button>`;
export function studioPackPreview(customerId,pack){
  const entry=Object.entries(packAsSent(pack).shells||{}).find(([,items])=>items?.length);
  const platform=entry?.[0]||'',post=entry?.[1]?.[0]||{},bundle=pack.productionAssets?.[`${platform}|0`];
  const image=bundle?.images?.find(i=>i.name==='cover.png')||bundle?.images?.find(i=>i.name.startsWith('page-'));
  const url=image?'/api/production-assets?'+new URLSearchParams({customerId,packId:pack.id,platform,index:'0',bundleId:bundle.id,name:image.name}):'';
  return {title:post.title||pack.title||'未命名作品',platform,url};
}
export function studioAcquisitionOverview(customer,acquisition={},contentStates={}){
  const id=customer.id,r=businessResults(acquisition,id),works=(acquisition.works||[]).filter(w=>w.customerId===id&&isRealEvidence(w)&&!w.owned);
  const signals=(acquisition.signals||[]).filter(s=>s.customerId===id&&isRealEvidence(s)&&s.status==='pending'&&!s.isAuthorReply&&(!s.workId||works.some(w=>w.id===s.workId)));
  const packs=(customer.drops||[]).filter(isRealEvidence),recent=packs.slice(0,2);
  const goal=growthGoal(customer),metrics=GROWTH_GOALS[goal].metrics||[GROWTH_GOALS[goal].metric];
  const observations=latestOutcomes(customer).map(item=>item.row).filter(row=>row.goal===goal&&row.start&&row.end&&metrics.some(m=>Number.isFinite(row.metrics?.[m]))).sort((a,b)=>b.end.localeCompare(a.end)||String(b.recordedAt||'').localeCompare(String(a.recordedAt||'')));
  const result=observations[0];
  const outcome=result?`<div class="studio-path-result"><strong>${esc(result.metrics[metrics.find(m=>Number.isFinite(result.metrics[m]))])}</strong><span>${esc(METRICS[metrics.find(m=>Number.isFinite(result.metrics[m]))])}</span></div><p class="studio-outcome-source">${metrics.length>1?esc(metrics.map(m=>METRICS[m]+' '+(result.metrics[m]??'未登记')).join(' · '))+'<br>':''}${esc([result.content?.title,result.platform,result.accountName||'账号未登记',result.start+' 至 '+result.end,result.source||'来源未登记'].filter(Boolean).join(' · '))}</p>`:`<p class="studio-lane-empty">${esc(metrics.map(m=>METRICS[m]).join(' / '))}待登记</p>`;
  const coverage=weeklyCalendarCoverage(calendarItems(customer,contentStates).items,calendarWeek()),scheduled=coverage.reduce((sum,row)=>sum+row.image+row.video+row.article+row.live+row.unknown,0);
  return `<p class="studio-evidence-scope">当前业务的已保存记录 <span>两路重叠 ${r.overlapContacts} 位 · 来源未明 ${r.paths.unknown.contacts} 位</span></p>
  <section class="studio-paths" aria-label="两条获客主线">
    <article class="studio-lane studio-lane-active">
      <header><h2>主动截流</h2><span class="studio-path-symbol" aria-hidden="true">↗</span></header>
      <div class="studio-path-result"><strong>${r.paths.active.qualified}</strong><span>位已核实联系人</span></div>
      <dl class="studio-path-stats"><div><dt>待核实需求</dt><dd>${r.pending}</dd></div><div><dt>已保存目标作品</dt><dd>${works.length}</dd></div><div><dt>待回复联系人</dt><dd>${r.paths.active.pendingReply}</dd></div></dl>
      <div class="studio-demand-list"><h3>待核实的需求</h3>${signals.slice(0,2).map(s=>`<div class="studio-demand"><span>${esc(s.platform||'平台待核实')}</span><blockquote>${esc(String(s.text||'原文待补充').slice(0,140))}</blockquote><small>待核实${s.sourceType==='search_summary'?' · 搜索摘要，请先回源':''}</small></div>`).join('')||'<p class="studio-lane-empty">暂无待核实需求。</p>'}</div>
      <footer>${action('go-prospecting','搜索作品与需求 <span aria-hidden="true">↗</span>','',true)}${action('import-needs','导入已有需求')}</footer>
    </article>
    <article class="studio-lane studio-lane-content">
      <header><h2>内容创作</h2><span class="studio-path-symbol" aria-hidden="true">✳</span></header>
      ${outcome}
      <dl class="studio-path-stats"><div><dt>内容批次</dt><dd>${packs.length}</dd></div><div><dt>已登记发布</dt><dd>${r.published}</dd></div><div><dt>待回复联系人</dt><dd>${r.paths.content.pendingReply}</dd></div></dl>
      <div class="studio-recent-works"><h3>继续制作</h3>${recent.map(p=>{const preview=studioPackPreview(id,p);return `<button type="button" class="studio-work" data-cm="open-pack" data-id="${esc(p.id)}">${preview.url?`<img src="${esc(preview.url)}" width="60" height="80" alt="${esc(preview.title)}的已保存素材">`:'<span class="studio-no-cover" aria-hidden="true">文稿</span>'}<span><strong>${esc(preview.title)}</strong><small>${esc(preview.platform||'平台待选择')}</small></span><span aria-hidden="true">↗</span></button>`;}).join('')||'<p class="studio-lane-empty">暂无作品。</p>'}</div>
      <div class="studio-week-plan"><h3>本周内容安排</h3><p>${esc(scheduled?weeklyJobSuggestion(coverage):'本周暂无内容排期。')}</p>${action('calendar-home','查看排期')}</div>
      <footer>${action('go-content-home','创建内容 <span aria-hidden="true">↗</span>','',true)}${action('review-home',result?'查看账号复盘':'补录本期效果')}</footer>
    </article>
  </section>`;
}
export function studioCreationEntrances(){
  return `<section class="studio-creation-entries" aria-label="选择创作入口">
    <button type="button" class="studio-entry" data-cm="content-feed"><span class="studio-entry-icon" aria-hidden="true">↗</span><span><strong>信息流内容创作</strong><small>付费投放 · 自然推荐 · 兼用</small></span><span aria-hidden="true">→</span></button>
    <button type="button" class="studio-entry" data-cm="content-platform"><span class="studio-entry-icon" aria-hidden="true">▤</span><span><strong>小红书 / 抖音内容创作</strong></span><span aria-hidden="true">→</span></button>
  </section>`;
}
