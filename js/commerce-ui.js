import {topicBoardView} from './topic-board-ui.js';
import {suggestedLeadIntents,leadIntentEventLabel} from './lead-intent.js';
import {refreshWechatState,wechatConnectionsView,wechatArticlesView,initWechatUI} from './wechat-ui.js';
import { studioAcquisitionOverview, studioCreationEntrances } from './studio-overview.js';
import { CREATION_ENTRIES, DISTRIBUTION_INTENTS, creationIntentLabel } from './creation-intent.js';
import { accountReviewSuggestions } from './account-review-suggestions.js';
import { isRealEvidence, isResearchComment } from './evidence-kind.js';
import { priorPublicationOutcome, carriedCsvMetrics, csvCriteria, metricSourceText } from './account-csv-carry.js';
import { previewAccountCsv } from './account-csv.js';
import { carryOutcome } from './outcome-carry.js';
import { liveSources } from './live-sources.js';
import { productionDraft } from './production-workflow.js';
import { liveReviewSummary, liveAttributionCounts } from './live-review.js';
import { businessResults, businessActions, actionPage } from './business-results.js';
import { manualDraftScope } from './draft-scope.js';
import { initNativeWorkMedia, refreshNativeWorkPreview } from './work-media.js';
import { mountOpenFindWorkbench, nativeWorkCover, nativeWorkGallery, installAcquisitionShell, openAcquisitionPage, canLeaveAcquisition } from './openfind-workbench.js';
import { initOpenFindUI, openFindPanel, openFindWorkActions, refreshOpenFindWork } from './openfind-ui.js';
import { discoveryWorks, demandEvidence, recentDemandQueue } from './discovery.js';
import {refreshHostedState,hostedConnectionsView,initHostedUI} from './hosted-browser-ui.js';
import { SIMPLE_GOALS, reconcileLiveScheduleInput, openProductionEditor } from './growth-ui.js';
import { growthGoal, METRICS, interactionReview } from './growth.js';
import { creatorRadar } from './creator-radar.js';
import { comparableOutcomes, comparisonEvidence, accountMemoryCurrent, reviewMetricText, reviewPackText, reviewJobText } from './creator-review.js';
import { matchingPublications } from './publication-identity.js';
import { calendarItems, calendarWeek, localDay, weeklyCalendarCoverage, weeklyJobSuggestion } from './content-calendar.js';
import { nextAction } from './journey.js';
import { pendingPublicationReviews, publicationReviewCurrent } from './publication-review.js';
import { publicationAttributionCounts } from './publication-attribution.js';
// Business context, product facts and purchasing needs are independent scopes.
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp = value => value?new Date(value).toLocaleString('zh-CN'):'时间未知';
const opts=(rows,value)=>rows.map(r=>{const [id,label]=Array.isArray(r)?r:[r,r];return `<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`;}).join('');
const field=(name,label,value='',required=false,type='text',max=2000)=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="${max}" ${required?'required':''}></label>`;
const area=(name,label,value='',required=false,max=3000)=>`<label>${esc(label)}<textarea name="${name}" rows="3" maxlength="${max}" ${required?'required':''}>${esc(value)}</textarea></label>`;
const select=(name,label,rows,value='')=>`<label>${esc(label)}<select name="${name}">${opts(rows,value)}</select></label>`;
const button=(act,label,id='',main=false)=>`<button type="button" class="btn ${main?'':'ghost'}" data-cm="${act}" data-id="${esc(id)}">${esc(label)}</button>`;
const anchor=(url,label)=>{try{const u=new URL(url);if(['https:','http:'].includes(u.protocol))return `<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${esc(u.href)}">${esc(label)} ↗</a>`;}catch{}return '';};
const empty=(title,note,action='')=>`<div class="cm-empty ui-empty"><h2 class="ui-empty-title">${esc(title)}</h2><p class="ui-empty-description">${esc(note)}</p>${action?`<div class="ui-empty-actions">${action}</div>`:''}</div>`;
const topicBoardStates=new Map();
const topicPools=new Map(), accountCsvPreviews=new Map();
const followupPages=new Map(), contentPackPages=new Map(), referencePages=new Map(), demandPages=new Map(), contentTabs=new Map();
let pendingOpenFindHandoff = null, performOpenFindHandoff;
let reviewSignalId='';
let ctx, businessId='', targetId='', workId='', contactId='', opId='', editProduct='', editSku='', poll;
const drafts=new Map(), openDetails=new Set();
const renderedPanels=new WeakMap();
const discoveryFilters=new Map(), discoveryTabs=new Map(), discoveryPages=new Map();
const radarHookNotices=new Map(), radarHookGenerating=new Set(), radarFilters=new Map();
let deliveryTab='publish';
let platformAuth={providers:[],connections:[]}, authFlow=null, authTimer;
let delivery={jobs:[],assets:[],rules:[],events:[]};
let busy=0, browserState={connections:[],jobs:[]}, pairing=null, contactPreview=null, browserPoll;
let radarBusy=false;
let calendarOffset=0;
const jobLabels={queued:'等待浏览器读取',running:'正在读取',partial:'已读取可见范围',completed:'读取完成',login_required:'需要登录',challenge:'需要平台验证',unsupported:'未识别到内容',failed:'读取失败',cancelled:'已取消',interrupted:'浏览器未回传'};
const ws=()=>ctx.getWorkspace();
const data=()=>ws().acquisition||{};
const rows=key=>(data()[key]||[]).filter(r=>r.customerId===businessId);
const customer=()=>ws().customers.find(c=>c.id===businessId);
const productName=id=>rows('products').find(p=>p.id===id)?.name||'历史产品';
const scopeNames=o=>o?.productIds?.length?o.productIds.map(productName).join('、'):'品牌通用';
const submit=label=>`<button class="btn" type="submit">${esc(label)}</button>`;
const form=(action,body,id='',extra='',contextKey='')=>`<form class="cm-form" data-cm-form="${action}" data-key="${esc(`${businessId}:${action}:${id}${contextKey?':'+contextKey:''}`)}" data-id="${esc(id)}" ${extra}>${body}<p class="cm-error" role="alert"></p></form>`;
const panel=(key,title,body)=>`<details class="cm-panel" data-cm-detail="${esc(`${businessId}:${key}`)}"><summary>${esc(title)}</summary>${body}</details>`;
export function preserveCommerceDrafts(){stash();}
function stash(){document.querySelectorAll('[data-cm-form]').forEach(f=>{if(!f.getClientRects().length)return;const values={};for(const el of f.elements)if(el.name)values[el.name]=el.type==='checkbox'?el.checked:el.type==='file'?null:el.value;const checks=[...f.querySelectorAll('input[type=checkbox]')].map(el=>[el.name,el.value,el.checked]);drafts.set(f.dataset.key,{values,checks});});document.querySelectorAll('[data-cm-detail]').forEach(d=>{if(d.open)openDetails.add(d.dataset.cmDetail);else openDetails.delete(d.dataset.cmDetail);});}
function restore(){document.querySelectorAll('[data-cm-form]').forEach(f=>{const d=drafts.get(f.dataset.key);if(!d)return;const currentBasis=f.elements.basis?.value;for(const el of f.elements)if(el.name&&el.type!=='file'&&el.type!=='checkbox'&&Object.hasOwn(d.values,el.name))el.value=d.values[el.name];if(f.dataset.cmForm==='account-review-memory'&&!String(d.values.text||'').trim())f.elements.basis.value=currentBasis;if(f.dataset.cmForm==='sales-document'){const selected=f.querySelector('[name=productId]').value;f.querySelector('[name=skuId]').innerHTML=opts([['','产品所有规格通用'],...rows('skus').filter(s=>s.productId===selected).map(s=>[s.id,s.name])],d.values.skuId||'');}for(const [name,value,checked]of d.checks){const el=[...f.elements].find(e=>e.name===name&&e.value===value&&e.type==='checkbox');if(el)el.checked=checked;}});document.querySelectorAll('[data-cm-detail]').forEach(d=>d.open=openDetails.has(d.dataset.cmDetail));}
const picker=()=>`<label class="cm-business">业务<select data-cm-business>${opts(ws().customers.map(c=>[c.id,c.name]),businessId)}</select></label>`;
const heading=(title,subtitle)=>`<header class="cm-heading"><div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${picker()}</header>`;
function scopeFields(value={},forNeed=false){
  value ||= {};
  const products=rows('products').filter(p=>p.status==='active');
  return `<fieldset class="cm-scope"><legend>${forNeed?'涉及的产品（尚未明确可不选）':'这次涉及的产品（不选则为品牌通用）'}</legend>${products.map(p=>`<label class="cm-check"><input type="checkbox" name="productIds" value="${p.id}" ${(value.productIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')||'<p>还没有产品，可先使用业务资料。</p>'}<details><summary>具体规格（需要报价或参数时再选）</summary>${rows('skus').filter(s=>s.status==='active'&&products.some(p=>p.id===s.productId)).map(s=>`<label class="cm-check"><input type="checkbox" name="skuIds" value="${s.id}" ${(value.skuIds||[]).includes(s.id)?'checked':''}>${esc(productName(s.productId))} · ${esc(s.name)}</label>`).join('')||'<p>规格尚未添加，不影响品牌或产品内容。</p>'}</details></fieldset>`;
}
function businessForm(){return panel('business-new','添加业务',form('business',`${field('name','业务名称','',true)}${field('pitch','一句话介绍','',true)}${field('hunt','行业（选填）','',false)}${submit('建立业务')}`));}
export function setContentWorkspaceTab(tab){contentTabs.set(ctx?.getBusiness?.()||businessId,tab);}
export function contentWorkspaceTab(){return contentTabs.get(ctx?.getBusiness?.()||businessId)||'library';}
function today(){
  const c=customer(), next=nextAction(c,data(),ws().contentStates || {}), packs=[...(c.drops||[]),...(c.packs||[])];
  return heading('经营总览','需求与作品，汇入同一条客户跟进链路。')+studioAcquisitionOverview(c,data(),ws().contentStates)+`
    <section class="cm-next studio-action-strip"><div><h2>${esc(next.title)}</h2>${next.note?`<p>${esc(next.note)}</p>`:''}</div>${button(next.action,next.label,next.id,true)}</section>
    <div class="cm-convergence">${button('go-conversations','查看客户跟进')}</div>
    ${followupQueue()}
    <details class="cm-panel" data-cm-detail="${businessId}:all-results"><summary>全部业务结果</summary>${resultCards()}</details>
    ${packs.some(p=>p.productReview?.required)?`<section class="cm-panel"><h2>资料更新后，核对待用内容</h2>${packs.filter(p=>p.productReview?.required).map(p=>`<article class="cm-row"><strong>${esc(p.title||'内容批次')}</strong>${button('open-pack','核对内容',p.id)}</article>`).join('')}</section>`:''}
    <details class="cm-support" data-cm-detail="${businessId}:business-support"><summary>补充业务资料</summary><div class="acts">${button('go-products','维护产品与服务')}${button('knowledge','查看业务资料')}</div>${businessForm()}</details>`;
}
function contentHome(){
  const c=customer(),packs=c.drops||[],packPage=actionPage(packs,contentPackPages.get(businessId)||0,8);
  const livePlans=liveSources(c).map(item=>{const p=[...(c.drops||[]),...(c.packs||[])].find(pack=>pack.id===item.packId),draft=productionDraft(p,item.platform,item.index,true),attribution=liveAttributionCounts(item.id,businessId,rows('leads'));return {...item,version:draft?.version,review:draft?.fields?.liveReview||'',metrics:liveReviewSummary(draft?.fields),messageCount:attribution.messages,contacts:attribution.contacts,linkedContacts:attribution.linkedContacts};}).sort((a,b)=>(a.time||'9999').localeCompare(b.time||'9999'));
  const radarPlatform=radarFilters.get(c.id)||'all',radar=creatorRadar(c,rows('works'),{platform:radarPlatform}),weeklyTopics=Array.isArray(c.topicBoard)?c.topicBoard.filter(p=>p.bucket==='now').length:radar.nowCount;
  const radarRow=({work,hits,action})=>`<article class="cm-row"><div><strong>${esc(work.title||'未命名作品')}</strong><p>${esc(work.platform)}${work.authorName?` · ${esc(work.authorName)}`:''}${work.source==='manual_paste'?' · 粘贴样本，未独立核实':work.source==='wechat_api'?(work.wechat?.source==='published'?' · 已发表文章':' · 素材库，未证明发表'):''} · ${hits.length?`匹配词：${hits.slice(0,3).map(esc).join('、')}`:'当前资料未匹配到词语，请自行判断'}</p>${anchor(work.url,'回查原作品')}<label>安排<select data-radar-work="${esc(work.id)}" data-radar-customer="${esc(c.id)}" data-previous="${esc(action)}">${opts([['reset','候选'],['now','本周'],['next','下一批'],['parked','待定'],['discard','舍弃']],action)}</select></label></div>${button('reference-work','参考此作品创作',work.id)}${panel(`radar-hook-${work.id}`,'设计自己的开头',`<p class="meta">可直接写，也可让 AI 参考当前业务资料与该样本提出建议；事实和参考来源需自行核对。保存后仅在业务及参考资料未变化时带入后续创作。</p>${c.radarHooks?.[work.id]?.text?`<p class="meta">${c.radarHookStatuses?.[work.id]==='current'?'已保存 · 当前会随参考作品用于创作':'资料已变化 · 此开头暂不带入创作，请核对后重新保存'}</p>`:''}${button('radar-hook-generate','AI 换开头',work.id)}${radarHookNotices.get(`${c.id}:${work.id}`)?`<p class="meta">${esc(radarHookNotices.get(`${c.id}:${work.id}`))}</p>`:''}${form('radar-hook',`${area('text','自己的开头',c.radarHooks?.[work.id]?.text||'',false,200)}<input type="hidden" name="basis" value=""><input type="hidden" name="version" value="${esc(c.radarHooks?.[work.id]?.version||0)}">${submit('保存开头')}`,work.id)}`)}</article>`;
  const activeTab=contentTabs.get(businessId)||'library';
  const tabs=[['library','内容库'],['schedule','排期与直播'],['review','账号复盘'],['ideas','选题与雷达']];
  const tabPanel=(id,html)=>`<div id="content-panel-${id}" class="cm-content-tab-panel" role="tabpanel" aria-labelledby="content-tab-${id}" ${activeTab===id?'':'hidden'}>${html}</div>`;
  return heading(activeTab==='review'?'账号复盘':'内容创作',activeTab==='review'?'把实际发布结果，沉淀为下一次创作的依据。':'从一个想法，到一篇能发布的作品。')+`
    <div class="cm-content-toolbar"><p>从业务资料出发，准备下一篇内容。</p><div class="acts">${button('content',packs.length?'创作新内容':'开始创作','',true)}${button('creator-profile','创作者资料')}${button('contact-entry','咨询承接')}${button('creation-standards','创作标准')}<button type="button" class="btn ghost" data-acq-page="studio">作品草稿</button></div></div>
    ${studioCreationEntrances()}
    <div class="cm-content-tabs" role="tablist" aria-label="内容工作区">${tabs.map(([id,label])=>`<button type="button" id="content-tab-${id}" role="tab" data-cm="content-tab" data-content-tab="${id}" data-id="${id}" aria-selected="${activeTab===id}" aria-controls="content-panel-${id}" tabindex="${activeTab===id?'0':'-1'}">${label}</button>`).join('')}</div>
    ${tabPanel('library',`<section class="cm-panel cm-content-library" id="content-library" tabindex="-1"><h2>内容库</h2><p class="meta">打开内容批次后，在每个有平台版本的作品下方选择「脚本、直播与封面制作」。</p>${packPage.items.map(p=>`<article class="cm-row"><div><strong>${esc(p.title||'内容批次')}</strong><p>${esc(p.date||p.createdAt||'')} · ${esc((p.battlefields||[]).join('、'))}</p>${creationIntentLabel(p.origin)?`<p class="meta">创作用途：${esc(creationIntentLabel(p.origin))}</p>`:''}</div>${button('open-pack','查看与制作',p.id)}</article>`).join('')||'<p class="cm-library-empty">还没有作品。可以先生成内容，或新建一份脚本。</p>'}<p role="status">共 ${packPage.total} 个批次 · 第 ${packPage.page+1} / ${packPage.pages} 页</p><div class="acts">${packPage.page>0?button('content-pack-page','上一页',String(packPage.page-1)):''}${packPage.page+1<packPage.pages?button('content-pack-page','下一页',String(packPage.page+1)):''}</div></section>
<details class="cm-panel" id="content-production" tabindex="-1" data-cm-detail="${esc(`${businessId}:production-create`)}"><summary>新建脚本或直播场次 / 公众号长文</summary><p class="meta">不需要已有作品。选择公众号可制作长文，其他平台可制作图文、短视频或直播。</p>${form('production-create',`${field('title','主题（公众号最多64字，其他平台最多20字）','',true,'text',64)}${select('platform','平台',['小红书','抖音','视频号','公众号'])}${submit('新建并打开')}`)}</details>
${wechatArticlesView(businessId,rows('works'))}
<section class="cm-after"><h2>发布与咨询</h2><div class="acts">${button('execution-publish','手动发布说明')}${button('legacy','查看发布与来源')}${button('new-inquiry','登记收到的咨询')}</div></section>`)}
    ${tabPanel('schedule',`${contentCalendar(c)}
<section class="cm-panel" id="content-live" tabindex="-1"><h2>直播排期与复盘</h2><p class="meta">直播时间按填写时的本地时间显示；排期、复盘和手工统计在作品的制作草稿中维护。咨询人数为汇总数字，不会自动创建联系人。复制场次会沿用脚本，时间和统计需重新填写。</p>${livePlans.length?livePlans.map(p=>`<article class="cm-row"><div><strong>${esc(p.title)}</strong><p>${p.time?esc(p.time.replace('T',' ')):'未排期'} · ${p.review?'已记录复盘':'待复盘'}</p><p class="meta">进场 ${esc(p.metrics.attendance ?? '未记录')} · 留存 ${esc(p.metrics.retained ?? '未记录')} · 咨询 ${esc(p.metrics.inquiries ?? '未记录')} · 有效咨询 ${esc(p.metrics.qualified ?? '未记录')}</p><p class="meta">留存 / 进场：${esc(p.metrics.retention)} · 有效咨询 / 咨询：${esc(p.metrics.qualifiedShare)}（手工统计，同口径时可参考）</p><p class="meta">已人工关联咨询 ${p.messageCount} 条 / ${p.contacts} 个联系人记录，与手工汇总可能重叠。</p>${p.linkedContacts.length?`<div class="acts">${p.linkedContacts.slice(0,5).map(l=>button('open-contact-history',`查看 ${l.name}`,l.id)).join('')}${p.linkedContacts.length>5?button('go-conversations',`还有 ${p.linkedContacts.length-5} 位，查看客户跟进`):''}</div>`:''}</div><div class="acts">${button('open-live','查看场次',p.id)}${button('duplicate-live','复制为新场次',JSON.stringify([p.packId,p.platform,p.index,p.version]))}${button('new-live-inquiry','登记直播咨询',p.id)}</div></article>`).join(''):'<p>暂无排期。打开内容批次，在作品下方的「脚本、直播与封面制作」中填写时间并保存。</p>'}</section>`)}
    ${tabPanel('review',`${ownAccountReview(c)}
${publicationReviewPanel()}`)}
    ${tabPanel('ideas',`${topicBoardView(c,topicBoardStates.get(c.id)||{})}${demandTopics()}
<section class="cm-panel" id="content-radar" tabindex="-1"><h2>内容雷达</h2><p class="meta">从本业务已保存的小红书、抖音和公众号作品中，按业务介绍和创作者资料的词语匹配；不是热度排名，也不代表能带来线索。已检查 ${radar.sampleSize} 条${radar.truncated?'（最多最近 500 条）':''}；本周选题共安排 ${weeklyTopics}/5（含其他来源）。</p><label>查看平台<select data-radar-filter aria-label="筛选雷达平台">${opts([['all','全部平台'],['小红书','小红书'],['抖音','抖音'],['公众号','公众号']],radarPlatform)}</select></label>${panel('radar-import','粘贴参考样本',form('radar-import',`${select('platform','样本平台',['小红书','抖音','公众号'])}${area('text','每条首行为标题，其余为正文；小红书和抖音样本以空行分隔，公众号文章以单独一行 --- 分隔','',true,40000)}<p class="meta">一次最多10条，每条标题最多300字、正文最多3000字；粘贴的样本及来源需自行核对，不会自动视为客户线索。</p>${submit('导入样本')}`))}${radar.items.length?radar.items.map(radarRow).join(''):`<p>${radar.hasProfile?'暂无匹配作品。可以先从主动获客读取或导入作品，再回来查看。':'先在业务资料或创作者资料中补充行业、受众和内容方向。'}</p>`}${radar.moreCandidates.length?`<details data-cm-detail="${esc(`${businessId}:radar-more`)}"><summary>更多候选（${radar.moreCandidates.length}）</summary>${radar.moreCandidates.map(radarRow).join('')}</details>`:''}${radar.discarded.length?`<details data-cm-detail="${esc(`${businessId}:radar-discarded`)}"><summary>已舍弃的作品（${radar.discarded.length}）</summary>${radar.discarded.map(w=>`<p>${esc(w.title||'未命名作品')} <label>恢复<select data-radar-work="${esc(w.id)}" data-radar-customer="${esc(c.id)}" data-previous="discard">${opts([['discard','已舍弃'],['reset','恢复候选'],['parked','移到待定']], 'discard')}</select></label></p>`).join('')}</details>`:''}</section>`)}
  `;
}

function publicationReviewPanel(){
  const published=rows('publications').filter(p=>p.status==='published' && p.url && !p.demo && p.source!=='demo' && p.sourceType!=='demo');
  const due=pendingPublicationReviews(data(),businessId), dueIds=new Set(due.map(p=>p.id));
  const ordered=[...due,...published.filter(p=>!dueIds.has(p.id)).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))];
  return `<section class="cm-panel" aria-label="发布后回看评论"><h2>发布后回看评论</h2><p class="meta">${due.length} 篇发布满两天尚未记录回看。请打开原作品核对评论和咨询；未采集不代表没有需求，回看不会自动建立线索。</p>${ordered.map(p=>panel(`publication-review-${p.id}`,`${p.platform} · ${p.content?.title || p.content?.cover || '已发布作品'} · ${dueIds.has(p.id)?'待回看':publicationReviewCurrent(p)?'已记录回看':'尚未记录回看'}`,`<p>${esc(p.accountName || '账号未知')} · 发布 ${esc(stamp(p.publishedAt))}</p>${anchor(p.url,'打开原作品')}${button('new-publication-inquiry','登记这篇作品收到的咨询',p.id)}${publicationReviewCurrent(p)?`<p class="meta">上次人工回看：${esc(stamp(p.commentReview.checkedAt))}${p.commentReview.note?` · ${esc(p.commentReview.note)}`:''}</p>`:''}${form('publication-review',`<input type="hidden" name="expectedUrl" value="${esc(p.url)}"><input type="hidden" name="expectedPublishedAt" value="${esc(p.publishedAt)}"><input type="hidden" name="expectedAccountId" value="${esc(p.accountId)}">${area('note','回看备注（选填）','',false,1000)}<label class="cm-check"><input type="checkbox" name="confirmed" required>我已回看此作品的评论和咨询</label>${submit('记录本次回看')}`,p.id)}`)).join('')||'<p>尚未登记发布作品。发布后登记实际链接，就能在这里回看。</p>'}</section>`;
}
function ownAccountReview(c){
  const accounts=rows('accounts').filter(a=>isRealEvidence(a)&&['小红书','抖音','视频号','公众号'].includes(a.platform));
  const publications=rows('publications').filter(p=>isRealEvidence(p)&&p.origin==='manual_external' && p.status==='published').sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt)));
  const comparisons=comparableOutcomes(c);
  const memoryCard=g=>{
    const selection={accountId:g.accountId,platform:g.platform,start:g.start,end:g.end},id=JSON.stringify(selection);
    const canSave=g.rows.length<=200 && g.rows.every(r=>r.outcomeId);
    const suggestions=accountReviewSuggestions(g);
    const suggestionPanel=suggestions.length?`<details class="cm-review-suggestions"><summary>查看按数据整理的复盘建议（${suggestions.length}）</summary><p class="meta">根据当前记录提出下一步测试方向；请先核对统计口径与发布条件，选择后可修改。</p>${suggestions.map(s=>`<article><h4>${esc(s.label)}</h4><p>${esc(s.observation)}</p><p class="meta">下一步：${esc(s.hypothesis)}</p>${button('use-account-suggestion','填入此建议（替换输入框）',s.id)}</article>`).join('')}</details>`:'';
    return `<article><p><strong>${esc(g.accountName)} · ${esc(g.platform)} · ${esc(g.start)} 至 ${esc(g.end)}</strong><br>${g.rows.map(r=>`${esc(r.title)}：${esc(reviewMetricText(r))} · 打法：${esc(reviewPackText(r))} · 内容任务：${esc(reviewJobText(r))} · ${esc(r.source)}`).join('<br>')}</p>${canSave?panel(`account-review-memory:${id}`,'写下复盘假设',form('account-review-memory',`<input type="hidden" name="selection" value="${esc(id)}"><input type="hidden" name="basis" value="${esc(comparisonEvidence(g))}">${suggestionPanel}${area('text','下一步准备验证什么？（可选建议后修改）','',true,1000)}${button('refresh-account-evidence','我已重新核对当前对照')}<p class="meta">保存的是你的假设和本次数据快照，不代表平台已核验，也不证明数据差异的原因。</p>${submit('采用为创作记忆')}`,id)):'<p class="meta">本组超过200条或缺少记录标识，暂不能保存为记忆。</p>'}</article>`;
  };
  const memories=(c.creatorMemories||[]).filter(m=>m.active && m.kind==='account-review').map(m=>`<article class="cm-row"><div><strong>${esc(m.text)}</strong><p class="meta">${esc(m.source)} · ${accountMemoryCurrent(c,m,comparisons)?'当前证据可用':'对照已变化，暂停用于创作'}</p><details><summary>查看保存时的依据</summary>${(m.evidence?.rows||[]).map(r=>`<p>${esc(r.title)}：${esc(reviewMetricText(r))} · 打法：${esc(reviewPackText(r))} · 内容任务：${esc(reviewJobText(r))} · ${esc(r.source)}</p>`).join('')}</details></div>${form('retire-account-memory',submit('停用记忆'),m.id)}</article>`).join('');
  const importForm=accounts.length?form('owned-publication',`${select('accountId','选择发布账号',accounts.map(a=>[a.id,`${a.platform} · ${a.name}`]))}${field('title','作品标题','',true,'text',200)}${field('url','实际作品链接','',true,'url',2000)}${field('publishedAt','实际发布时间','',true,'datetime-local')}${area('body','正文或口播（选填）','',false,12000)}<label class="cm-check"><input type="checkbox" name="confirmed" required>我确认这是上述账号实际发布的作品</label>${submit('登记作品')}`):'<p>请先在下方登记自己的发布账号。</p>';
  const csvPreview=accountCsvPreviews.get(c.id);
  const csvImport=panel('owned-csv','批量导入作品效果 CSV',form('owned-csv-preview',`${field('start','统计开始','',true,'date')}${field('end','统计结束','',true,'date')}${field('source','数据来源（文件名或后台记录）','',true)}${area('criteria','有效线索筛选与去重口径（导入有效线索时必填）','',false,1000)}<label>选择 UTF-8 CSV 文件<input type="file" name="file" accept=".csv,text/csv"></label>${area('csv','或粘贴 CSV 文本','',false,1000000)}<label class="cm-check"><input type="checkbox" name="carryExisting">沿用同一作品、账号和统计窗口中已有的空缺指标</label><p class="meta">表头需包含“平台、作品链接”和至少一列指标（播放量、完播率、点赞、评论、收藏、分享、咨询次数、有效线索）；完播率填写百分数，如 18.5 或 18.5%。先登记已发布的作品，最多 100 行；不按标题猜测匹配。数据应属于所填的同一统计窗口。</p>${submit('预览匹配')}`));
  const csvResult=csvPreview?`<section class="cm-panel" aria-label="CSV 导入预览"><h3>导入预览 · ${csvPreview.rows.length} 条</h3><p class="meta">${esc(csvPreview.start)} 至 ${esc(csvPreview.end)} · ${esc(csvPreview.source)}${csvPreview.carryExisting?'。已选择沿用同窗口旧指标，请核对每项来源。':'。空指标不会从旧记录自动补齐。'}保存后形成新的独立快照。</p>${csvPreview.rows.map(r=>`<article class="cm-row"><div><strong>第 ${r.line} 行 · ${esc(r.title||r.url||'未匹配')}</strong><p>${esc(r.platform)} · ${esc(r.accountName||'账号未匹配')}</p><p>${Object.entries(r.metrics).map(([k,v])=>`${esc(METRICS[k])}：${esc(v)}`).join(' · ')}</p>${r.criteria?`<p class="meta">线索 / 成交口径：${esc(r.criteria)}</p>`:''}${r.carried&&Object.keys(r.carried).length?`<p class="meta">沿用：${Object.entries(r.carried).map(([k,v])=>`${esc(METRICS[k])}：${esc(v)}（来源：${esc(r.priorSources[k]||'未记录')}）`).join('；')}</p>`:csvPreview.carryExisting?'<p class="meta">无可沿用的空缺指标。</p>':''}${r.errors.length?`<p class="cm-error">${r.errors.map(esc).join('；')}</p>`:''}</div></article>`).join('')}${csvPreview.rows.some(r=>r.errors.length)?'<p>请更正文件后重新预览；有错误时不会导入任何行。</p>':form('owned-csv-confirm',`<label class="cm-check"><input type="checkbox" name="confirmed" required>我已核对作品、账号和统计口径</label>${submit('确认导入全部记录')}`)}${button('owned-csv-cancel','清除预览')}</section>`:'';
  const metricFields=Object.entries(METRICS).map(([key,label])=>`<label>${esc(label)}<input type="number" name="metric-${esc(key)}" min="0" step="${['revenue','refunds','cost','completionRate'].includes(key)?'any':'1'}" ${key==='completionRate'?'max="100"':''} placeholder="未知留空"></label>`).join('');
  const cards=publications.map(p=>{const history=(c.accountReviewOutcomes||[]).filter(r=>isRealEvidence(r)&&r.publicationId===p.id),latest=history[0],linked=publicationAttributionCounts(p.id,c.id,rows('leads'),rows('signals'),rows('works')),date=new Date(p.publishedAt),localTime=Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';return panel(`owned-${p.id}`,`${p.content?.title || '未命名作品'} · ${p.platform} · ${p.accountName || '账号'}`,`<p class="meta">${esc(p.publishedAt)} · 人工登记，平台未自动核验</p>${anchor(p.url,'查看原作品')}<p class="meta">当前已登记咨询 ${linked.messages} 条 / ${linked.contacts} 个联系人记录；已人工关联评论 ${linked.comments} 条 / ${linked.commentContacts} 个联系人记录。两类可能重叠，不相加；仅统计本地记录。</p>${panel(`owned-correct-${p.id}`,'更正作品信息',form('owned-correct',`${select('accountId','发布账号',accounts.filter(a=>a.platform===p.platform).map(a=>[a.id,a.name]),p.accountId)}${field('title','作品标题',p.content?.title || '',true,'text',200)}${field('url','实际作品链接',p.url,true,'url',2000)}${field('publishedAt','实际发布时间',localTime,true,'datetime-local')}${area('body','正文或口播（选填）',p.content?.body || '',false,12000)}<input type="hidden" name="version" value="${esc(p.metadataVersion || 1)}"><p class="meta">已有历史效果、咨询或关联评论的作品不能更换账号；已关联咨询或评论时不能更换为另一篇作品的链接，请先更正来源。历史效果保留录入时的作品快照。</p><label class="cm-check"><input type="checkbox" name="confirmed" required>我已核对更正后的信息</label>${submit('保存更正')}`,p.id))}${latest?`<p>最新记录：${esc(latest.start)} 至 ${esc(latest.end)} · ${Object.entries(latest.metrics||{}).map(([k,v])=>`${esc(METRICS[k]||k)} ${esc(v)}`).join(' · ')} · 来源 ${esc(latest.source)}${metricSourceText(latest,METRICS)?`<br>指标来源：${esc(metricSourceText(latest,METRICS))}`:''}${(latest.publicationVersion||1)!==(p.metadataVersion||1)?' · 基于更正前的作品信息':''}</p>`:'<p>尚未记录效果。</p>'}${interactionReview(latest).map(note=>`<p class="meta">${esc(note)}</p>`).join('')}<details data-cm-detail="${esc(`${businessId}:owned-metrics:${p.id}`)}"><summary>记录 / 更新效果</summary>${form('owned-outcome',`${field('start','统计开始','',true,'date')}${field('end','统计结束','',true,'date')}${field('source','数据来源（后台截图 / 文件名）','',true)}${latest?button('carry-owned-outcome','沿用上次记录',p.id):''}<p class="meta">沿用只填空白项；补录前请核对统计日期、来源及口径。平台完播率按后台百分数填写，与完整播放次数 / 播放的手工比值分别保存；比较前请核对统计口径。</p><div class="growth-fields">${metricFields}</div>${area('criteria','客资去重或订单归因口径（录入客资或成交时必填）','',false,1000)}${area('note','备注（选填）','',false,1000)}${submit('保存效果记录')}`,p.id)}</details>${history.length>1?`<details><summary>历史记录（${history.length}）</summary>${history.map(r=>`<p>${esc(r.start)} 至 ${esc(r.end)} · ${esc(r.source)} · ${Object.entries(r.metrics||{}).map(([k,v])=>`${esc(METRICS[k]||k)} ${esc(v)}`).join(' · ')}</p>`).join('')}</details>`:''}`);}).join('');
  return `<section class="cm-panel" id="content-review" tabindex="-1" aria-label="账号复盘"><h2>账号复盘</h2><p class="meta">登记自己实际发布的作品和后台数据；归属与数据由你核对，系统不会自动发布或核验平台。历史记录不会因重新录入指标而相加。</p>${button('owned-review-export','导出自有作品与效果记录')}${panel('owned-account','登记发布账号',form('review-account',`${select('platform','平台',['小红书','抖音','视频号','公众号'])}${field('name','账号名称','',true,'text',200)}${submit('登记账号')}`))}${panel('owned-import','登记自己已发布的作品',importForm)}${csvImport}${csvResult}<h3>同账号、同窗口对照</h3><p class="meta">仅比较关联已发布记录的最新手工数据，不推断原因；有效客资需核对去重口径；平台完播率需核对后台定义和统计口径是否一致。未记录不等于零；不同发布时间或投流条件可能影响结果。</p>${comparisons.length?comparisons.map(memoryCard).join(''):'<p>同一账号至少两条作品填写相同统计窗口的阅读 / 播放，填写相同去重口径的有效客资，或填写平台完播率后，在此显示对照。</p>'}${panel('account-review-memories','已采用的账号复盘记忆',memories||'<p>尚无已采用的账号复盘记忆。</p>')}${cards||'<p>暂无手工登记的自有作品。</p>'}</section>`;
}
function contentCalendar(c){
  const {items,candidates}=calendarItems(c,ws().contentStates), days=calendarWeek(new Date(),calendarOffset), todayKey=localDay(new Date()), coverage=weeklyCalendarCoverage(items,days);
  const card=(item,i)=>{
    const id=`${item.kind}:${item.packId}:${item.platform}:${item.index ?? i}:${item.date}:${item.status || ''}`;
    const data=esc(JSON.stringify(item));
    const label=item.kind==='live'?`直播 · ${item.platform} · ${item.review?'已记录复盘':'待复盘'}`:`${item.platform} · ${{image:'图文',video:'短视频',article:'长文'}[item.format]||'形式未标注'} · ${{pending:'待筛选',selected:'已选用',paused:'暂不用',published:'已发布'}[item.status] || item.status}${item.partial?' · 部分字段':''}`;
    const editable=item.kind==='live'||item.status!=='published';
    const editor=editable?form('calendar-schedule',`<input type="hidden" name="item" value="${data}">${field('time',item.kind==='live'?'直播时间':'计划日期',item.kind==='live'?item.time:item.date,false,item.kind==='live'?'datetime-local':'date')}<p class="meta">清空时间并保存可取消排期。</p>${submit('保存排期')}`,id):'<p class="meta">已发布内容保留历史排期。</p>';
    return `<article class="cm-calendar-card"><strong>${esc(item.title)}</strong><p class="meta">${esc(label)} · 内容任务：${esc(reviewJobText({contentJob:item.job}))}</p>${item.kind==='live'?button('open-live','查看直播',JSON.stringify([item.packId,item.platform,item.index])):button('open-pack','打开作品',item.packId)}<details><summary>${editable?'调整排期':'查看状态'}</summary>${editor}</details></article>`;
  };
  return `<section class="cm-panel" id="content-calendar" tabindex="-1" aria-label="内容与直播排期"><h2>内容与直播排期</h2><p class="meta">按本地日期查看；只记录计划，不会自动发布或开播。直播时间在作品制作草稿中维护。</p><div class="acts">${button('calendar-week','上一周','-1')}${button('calendar-week','本周','0')}${button('calendar-week','下一周','1')}</div><p role="status">${esc(days[0])} 至 ${esc(days[6])}</p><div aria-label="本周平台与形式"><p class="meta">以下为本周有日期的作品记录，含已发布的历史排期；同一作品的不同字段只计一次，暂不用不计。不代表平台实际发布或效果。</p>${coverage.map(r=>`<p><strong>${esc(r.platform)}</strong> · 图文 ${r.image} · 短视频 ${r.video} · 长文 ${r.article} · 直播 ${r.live} · 形式未标注 ${r.unknown}<br><span class="meta">流量 ${r.goals.reach} · 传播 ${r.goals.spread} · 有效线索 ${r.goals.leads} · 流量与线索 ${r.goals.reach_leads} · 成交 ${r.goals.sales} · 目标未标注 ${r.goals.unknown}<br>内容任务：流量 ${r.jobs.traffic} · 获客 ${r.jobs.lead} · 引流 ${r.jobs.divert} · 转化 ${r.jobs.convert} · 未标注 ${r.jobs.unknown}</span></p>`).join('')}<p>${esc(weeklyJobSuggestion(coverage))}</p>${button('calendar-topics','去选题库安排内容')}</div><div class="cm-calendar-week">${days.map((day,i)=>`<section class="cm-calendar-day"><h3>${['周一','周二','周三','周四','周五','周六','周日'][i]} · ${esc(day.slice(5))}${day===todayKey?' · 今天':''}</h3>${items.filter(x=>x.date===day).map(card).join('')||'<p class="meta">暂无安排</p>'}</section>`).join('')}</div>${panel('calendar-unscheduled',`待排期内容（${candidates.length}）`,candidates.length?candidates.map(card).join(''):'<p>暂无待排期的平台作品。</p>')}<p class="meta">直播请先在作品制作区选择直播、填写时间并保存；排期后可在此调整。</p></section>`;
}
function demandTopics(){
 const pool=topicPools.get(businessId),c=customer(),comments=(c.demandTopics||[]).filter(t=>t.kind==='comment'),topics=pool?.topics||[],status=pool?.status||'候选';
 const topicCard=t=>`<article class="cm-row"><div><strong>${esc(t.angle)}</strong><p>${esc(t.source)} · ${esc(t.why||'待验证的内容方向')}</p>${t.evidence?.quote?`<blockquote>${esc(t.evidence.quote)}</blockquote>`:''}${t.evidence?.workTitle?`<p>来源作品：${esc(t.evidence.workTitle)}</p>`:''}</div><div class="acts">${t.status==='候选'?button('collect-topic','加入选题库',t.key)+button('use-topic','采用并创作',t.key)+button('skip-topic','暂时不用',t.key):button('reset-topic','恢复候选',t.key)}</div></article>`;
 const manage=comments.length?panel('manage-comment-topics',`管理评论灵感（${comments.length}）`,`<p class="meta">在此更正或移除匿名选题；已生成内容不会自动修改。</p>${comments.map(t=>panel(`manage-comment-topic-${t.id}`,t.title,topicRevisionForm(t,''))).join('')}`):'';
 return `<section class="cm-panel" id="content-demand" tabindex="-1"><h2>从真实需求选题</h2><p>汇总人工匿名提炼的客户问题、评论问题、对标和研究证据，采用后进入当前业务创作方向；可分页查看选题。</p>${c.painClusters?.staleReason?`<p class="cm-notice">${esc(c.painClusters.staleReason)} 旧归集已暂停进入选题池；历史方向不会自动修改。</p>`:''}${(c.benchmarkTeardowns||[]).some(t=>t.staleReason)?'<p class="cm-notice">部分对标拆解的评论依据已被排除，旧拆解已暂停进入选题池；已写入的创作方向需人工核对。</p>':''}${button('load-topics','查看 / 更新需求选题')}${pool?`<div class="acts" aria-label="选题状态">${['候选','已用','不用'].map(value=>button('topic-status',`${value}（${pool.counts[value]||0}）`,value,value===status)).join('')}</div>${status==='已用'?'<p class="meta">恢复候选不会移除已写入的创作方向或改动已生成内容。</p>':''}${topics.length?topics.slice(0,8).map(topicCard).join('')+(topics.length>8?panel(`more-demand-topics-${status}`,`本页更多选题（${topics.length-8}）`,topics.slice(8).map(topicCard).join('')):''):`<p>暂无${esc(status)}选题。</p>`}<p role="status">${esc(status)} ${esc(pool.total ?? topics.length)} 条 · 第 ${esc((pool.page||0)+1)} / ${esc(Math.max(1,Math.ceil((pool.total||0)/40)))} 页</p><div class="acts">${(pool.page||0)>0?button('topic-page','上一页',String(pool.page-1)):''}${(pool.page||0)+1<Math.ceil((pool.total||0)/40)?button('topic-page','下一页',String(pool.page+1)):''}</div>`:''}${manage}</section>`;
}
function productForm(p,isSku=false){
  return form(isSku?'sku':'product',`${field('name',isSku?'规格名称':'产品或服务名称',p?.name||'',true)}${isSku?field('attributes','规格参数',p?.attributes||''):''}${area('facts','已确认的事实、适用场景与限制',p?.facts||'',false,8000)}<details class="cm-optional" data-cm-detail="${businessId}:price:${isSku?'sku':'product'}:${p?.id||'new'}"><summary>价格、有效期与推广状态（选填）</summary>${area('priceTerms',isSku?'价格、单位及适用条件（未知留空）':'基础价格与适用条件（有规格时使用规格报价）',p?.priceTerms||'')}${field('priceExpiresAt','报价有效至（长期有效可留空）',p?.priceExpiresAt?new Date(new Date(p.priceExpiresAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',false,'datetime-local')}${select('status','推广状态',[['active','正常使用'],['archived','停止推广，保留历史']],p?.status||'active')}</details>${field('source','资料来源（填写事实时必填）',p?.source||'')}<input type="hidden" name="baseRevision" value="${p?.revision||0}">${isSku?`<input type="hidden" name="productId" value="${esc(p?.productId||editProduct)}">`:''}${submit(p?.id?'保存修改':'添加')}`,p?.id||'','',isSku&&!p?.id?(p?.productId||editProduct):'');
}
function salesDocumentForm(d){
  const selected=d?.productId||editProduct||'';
  return form('sales-document',`${field('title','资料标题',d?.title||'',true)}${select('productId','适用产品',[['','整个业务通用'],...rows('products').filter(p=>p.status==='active'||p.id===selected).map(p=>[p.id,p.name])],selected)}${select('skuId','适用规格',[['','产品所有规格通用'],...rows('skus').filter(s=>s.productId===selected).map(s=>[s.id,s.name])],d?.skuId||'')}${area('body','FAQ、适用条件、使用说明或已获准公开的案例',d?.body||'',true,30000)}${field('source','可追溯的原始资料或核对依据',d?.source||'',true)}${field('expiresAt','失效时间（长期有效可留空）',d?.expiresAt?new Date(new Date(d.expiresAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',false,'datetime-local')}${select('status','使用状态',[['draft','待确认，不用于沟通'],['approved','已确认，可用于沟通'],['archived','停用，保留历史']],d?.status||'draft')}<label class="cm-check"><input type="checkbox" name="confirmed">我已核实内容，且允许用于对外沟通</label><input type="hidden" name="baseRevision" value="${d?.revision||0}">${submit('保存资料')}`,d?.id||'');
}
function salesDocuments(){
  return `<section class="cm-panel"><h2>销售知识库</h2><p class="meta">报价以产品或规格价格为准。</p>${panel('document-new','添加销售资料',salesDocumentForm())}${rows('salesDocuments').map(d=>panel(`document-${d.id}`,`${d.title} · ${d.status==='approved'?(d.expiresAt&&Date.parse(d.expiresAt)<=Date.now()?'已到期':'可用于沟通'):d.status==='archived'?'已停用':'待确认'}`,`<p class="meta">${esc(d.productId?productName(d.productId):'业务通用')} · v${d.revision} · ${esc(d.source)}</p>${salesDocumentForm(d)}`)).join('')||''}</section>`;
}
function salesPlanView(plan,method){
  if(!plan)return '';
  return `<details class="cm-sales-plan"><summary>${esc(plan.name)} · ${method==='template'?'基础模板':'沟通建议'}</summary><p><strong>本轮目标：</strong>${esc(plan.goal)}</p><p>${esc(plan.rationale)}</p><p><strong>下一步：</strong>${esc(plan.nextStep)}</p>${plan.missing.map(t=>`<p class="meta">待核对：${esc(t)}</p>`).join('')}${plan.understanding?`<h4>客户说过什么</h4><p class="cm-quote">${esc(plan.understanding.currentQuestion||'暂无明确原话')}</p><p class="meta">${esc(plan.understanding.relationship)}</p>${plan.understanding.hypotheses.length?`<h4>还需要验证</h4>${plan.understanding.hypotheses.map(h=>`<p>${h.possibilities.map(esc).join('；')}。</p><p class="meta">${esc(h.resolution||h.question)}</p>`).join('')}<p class="meta">以下原因待核实。</p>`:''}`:''}<h4>本轮提供的依据</h4>${plan.references.map(r=>`<p class="meta">${esc(r.title)} · v${r.revision} · ${esc(r.source||'来源待补')}</p>${r.text?`<blockquote class="cm-evidence">${esc(r.text)}</blockquote>`:''}`).join('')||'<p class="meta">尚无产品资料，先澄清需求。</p>'}<p class="meta">${esc(plan.version)} · 建议不会自动改变阶段或标记成交。</p></details>`;
}
function resultCards(){
 const r=businessResults(data(),businessId);
 return `<section class="cm-panel"><h2>当前业务结果</h2><div class="cm-result-grid">${[['已保存作品',r.works],['待核实需求',r.pending],['去重联系人',r.contacts],['已核实值得跟进',r.qualified],['有发送记录的人',r.contacted],['有来信记录的人',r.replied],['登记成交的购买需求',r.wonNeeds],['登记成交人数',r.wonContacts]].map(([label,n])=>`<article><strong>${n}</strong><p>${label}</p></article>`).join('')}</div><p class="meta">仅当前业务累计记录；复制不算发送，成交由人工登记。曝光、收入及退款未核实，不记为零。不同阶段不相加，不据此推断转化率。</p><p class="meta">人工记录的咨询类型：购买 ${r.intents.buy.contacts} 人（标记成交 ${r.intents.buy.completed}） · 商务合作 ${r.intents.ad.contacts} 人（标记签约 ${r.intents.ad.completed}） · 私域承接 ${r.intents.divert.contacts} 人（标记转入 ${r.intents.divert.completed}）。同一联系人可能有多类，不相加；这些事项不自动计入上方购买成交。</p>${button('legacy','查看发布与来源记录')}</section>`;
}
function followupQueue(){
 const result=actionPage(businessActions(data(),businessId),followupPages.get(businessId)||0);
 followupPages.set(businessId,result.page);
 return `<section class="cm-panel" aria-label="今天值得处理"><h2>今天值得处理</h2>${result.items.map(a=>`<article class="cm-row"><div><span class="cm-tag">${esc(a.label)}</span><strong>${esc(a.title)}</strong><p>${esc(a.note)}</p></div>${button(a.action,a.action==='open-need'?'继续跟进':'处理',a.id)}</article>`).join('')||'<p>暂无待处理事项。</p>'}${result.total?`<p role="status">共 ${result.total} 项 · 第 ${result.page+1} / ${result.pages} 页</p><div class="acts">${result.page>0?button('followup-page','上一页',String(result.page-1)):''}${result.page+1<result.pages?button('followup-page','下一页',String(result.page+1)):''}</div>`:''}</section>`;
}

function products(){
  const list=rows('products'),p=list.find(p=>p.id===editProduct),s=rows('skus').find(s=>s.id===editSku);
  return heading('产品与服务','')+`<div class="cm-columns ${list.length?'':'cm-first-product'}"><div class="cm-catalog"><div class="cm-panel"><h2>产品目录</h2>${list.map(p=>`<div class="cm-product"><div class="cm-row"><button type="button" class="cm-link" data-cm="select-product" data-id="${p.id}">${esc(p.name)}</button><span>${p.status==='archived'?'已停止推广':''}</span>${button('write-product','写内容',p.id)}</div><details><summary>${rows('skus').filter(s=>s.productId===p.id).length} 个规格</summary>${rows('skus').filter(s=>s.productId===p.id).map(s=>`<div class="cm-sku">${button('select-sku',s.name,s.id)}<span>${esc(s.attributes)}${s.status==='archived'?' · 已停止推广':''}</span></div>`).join('')}${button('add-sku','添加规格',p.id)}</details><details><summary>资料来源 · v${p.revision}</summary><p>${esc(p.source||'待补充资料')}</p></details></div>`).join('')||empty('先添加一款产品或服务','可先填写名称和介绍。')}</div>${list.length?button('new-product','添加另一款产品'):''}</div><div class="cm-panel"><h2>${editSku==='new'?'添加规格':s?'编辑规格':p?'编辑产品':'添加产品或服务'}</h2>${productForm(editSku==='new'?{productId:editProduct}:s||p,Boolean(s)||editSku==='new')}<p class="meta">资料更新后，请核对引用它的草稿。</p></div></div>${list.length?`<div class="cm-convergence"><div class="acts">${button('go-content-home','去内容获客')}${button('go-prospecting','去主动获客')}</div></div>`:''}<details class="cm-support" data-cm-detail="${businessId}:sales-library"><summary>常见问题与销售资料（选填）</summary>${salesDocuments()}</details>`;
}
async function browserApi(action,payload){const r=await fetch('/api/browser-connections'+(action?'/'+action:''),action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{}),v=await r.json();if(!r.ok)throw new Error(v.error||'连接操作失败');return v;}
async function browserRefresh(){clearTimeout(browserPoll);try{[browserState,delivery,platformAuth]=await Promise.all([browserApi(),deliveryApi(),platformAuthApi(),refreshHostedState(),refreshWechatState()]);if(pairing&&(Date.parse(pairing.expiresAt)<Date.now()||browserState.connections.some(c=>c.id===pairing.code.split('.')[0])))pairing=null;if(browserState.jobs.some(j=>['queued','running'].includes(j.status))||delivery.jobs.some(j=>['queued','preparing','submitting'].includes(j.status))||delivery.rules.some(r=>r.enabled)){browserPoll=setTimeout(browserRefresh,5000);}const r=await fetch('/api/acquisition');if(r.ok)ctx.setWorkspace((await r.json()).workspace);renderCommerceUI();}catch(e){ctx.toast(e.message);}}
async function deliveryApi(action,payload){const r=await fetch('/api/delivery'+(action?'/'+action:''),action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{});const v=await r.json();if(!r.ok)throw new Error(v.error||'执行操作失败');return v;}
const deliveryLabels={queued:'等待浏览器执行',preparing:'正在核对并填写',submitting:'正在提交平台',succeeded:'平台回读成功',submitted:'平台已受理，等待作品结果',unknown:'结果不明，禁止自动重发',failed:'提交前失败',unsupported:'页面暂不支持，未提交',login_required:'需要登录',challenge:'需要验证码',cancelled:'已取消'};
function sendForm(){return '<p class="meta">复制草稿后，到官方平台自行发送。</p>';}
function deliveryView(){const jobs=delivery.jobs.filter(j=>j.customerId===businessId);return heading('人工发送与发布','')+`<section class="cm-panel"><h2>文案可生成，发送由你完成</h2><p>平台托管、自动回复和代发已关闭。请在客户跟进中复制草稿，或在内容工作室下载素材后，前往官方平台发送与发布。</p><div class="acts">${button('go-conversations','客户跟进')}${button('execution-jobs','刷新历史记录')}</div></section><section class="cm-panel"><h2>历史执行记录</h2>${jobs.map(j=>`<article><strong>${esc(j.kind)} · ${esc(j.status)}</strong><p>${esc(j.error||'')}</p></article>`).join('')||'<p>暂无历史记录。</p>'}</section>`;}

function browserJobs(){const list=browserState.jobs.filter(j=>j.customerId===businessId);return list.length?`<section class="cm-support"><h3>最近读取任务</h3>${list.slice(0,6).map(j=>`<article class="cm-row"><div><strong>${esc(j.platform)} · ${j.kind==='works'?'作品':'评论'} · ${esc(jobLabels[j.status]||j.status)}</strong><p>读取 ${j.read||0} · 新增 ${j.added||0} · 重复 ${j.duplicate||0} · 条件排除 ${j.filtered||0}</p><p class="meta">${esc(j.error||j.scope||'打开浏览器连接器，点击「读取待办任务」；开启自动读取后每 30 秒检查一次。')}</p></div>${['queued','running'].includes(j.status)?button('browser-cancel','取消',j.id):''}</article>`).join('')}</section>`:'';}
function collectionForm(kind,source){if(!source)return '';if(kind==='works'&&!source.url)return '<p class="meta">来源中没有可核对的账号主页，可直接打开已保存作品并读取评论。</p>';const available=browserState.connections.filter(c=>c.customerId===businessId&&c.platform===source.platform&&c.status==='paired');return panel(`collect-${kind}-${source.id}`,kind==='works'?'从浏览器读取作品':'从浏览器读取评论',available.length?form('browser-collect',`<input type="hidden" name="kind" value="${kind}"><input type="hidden" name="${kind==='works'?'targetId':'workId'}" value="${source.id}">${select('connectionId','使用我的平台账号',available.map(c=>[c.id,c.name+' · '+c.deviceName]))}${field('limit','本次最多读取条数（1–100）','50',true,'number')}${kind==='comments'?`${field('keyword','评论关键词（选填）')}${field('region','页面显示的 IP 属地（选填，不代表常住地）')}${field('since','起始日期（选填；时间不明确的评论会被排除）','',false,'date')}`:''}<p class="meta">连接账号后读取作品与评论；遇到登录或验证时暂停。</p>${submit('创建读取任务')}`,source.id):`<p>先连接当前业务的${esc(source.platform)}浏览器账号。</p>${button('go-connections','连接平台账号')}`);}
async function platformAuthApi(action,payload){const r=await fetch('/api/platform-auth'+(action?'/'+action:''),action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{});const v=await r.json();if(!r.ok)throw new Error(v.error||'授权连接失败');return v;}
const authLabels={pending:'等待扫码',scanned:'已扫码，请在手机上确认',authorized:'已授权账号',expired:'已过期，请重新连接',cancelled:'已取消',failed:'授权未完成',disconnected:'已从 Harta 断开',superseded:'已被新的授权替代',exchanging:'正在确认授权'};
async function pollAuth(){
  clearTimeout(authTimer);const flow=authFlow;if(!flow)return;
  try{const result=await platformAuthApi('poll',{id:flow.id});if(authFlow?.id!==flow.id)return;authFlow={...flow,...result};
    if(['pending','scanned','exchanging'].includes(result.status))authTimer=setTimeout(pollAuth,(result.interval||3)*1000);
    else {if(result.status==='authorized'){authFlow=null;ctx.toast('平台账号授权已保存');}await browserRefresh();}
  }catch(e){if(authFlow?.id===flow.id)authFlow={...flow,error:e.message,status:'failed'};}
  renderCommerceUI();
}
function platformLoginCards(){return `<section class="cm-panel"><h2>连接你的获客账号</h2><p>用对应平台 App 扫码授权。</p><div class="cm-platform-grid">${[['douyin','抖音'],['xiaohongshu','小红书']].map(([key,name])=>{const ready=platformAuth.providers.find(p=>p.platform===key)?.ready;const linked=platformAuth.connections.filter(c=>c.platform===key&&c.customerId===businessId&&c.status==='authorized');return `<article class="cm-platform-card"><h3>${name}</h3><p>${linked.length?'已授权 '+linked.length+' 个账号':ready?'扫码后自动保存账号':'扫码授权待开通'}</p><button type="button" class="btn" data-cm="platform-connect" data-id="${key}" ${ready?'':'disabled'}>${linked.length?'连接另一个账号':'扫码连接'+name}</button>${!ready?'':''}</article>`;}).join('')}</div></section>`;}
function authConnectionsView(){const flow=authFlow?.customerId===businessId?authFlow:null;return platformLoginCards()+`${flow?`<section class="cm-panel cm-auth-flow" aria-live="polite"><h2>${esc(authLabels[flow.status]||'连接平台')}</h2>${['pending','scanned'].includes(flow.status)?`${flow.qrDataUrl?`<img src="${esc(flow.qrDataUrl)}" width="256" height="256" alt="使用小红书 App 扫码授权 Harta"><p>核对授权码：${esc(flow.userCode)}</p>`:'<p>在抖音授权页扫码，完成后自动更新。</p>'}${anchor(flow.authorizeUrl,'打开平台授权页')}<p class="meta">有效至 ${stamp(flow.expiresAt)}</p>${button('platform-cancel','取消本次连接',flow.id)}`:''}<p>${esc(flow.error||'')}</p>${flow.status==='authorized'?'':''}</section>`:''}<section class="cm-panel"><h2>已授权的平台账号</h2>${platformAuth.connections.filter(c=>c.customerId===businessId&&c.tokenExpiresAt&&['authorized','expired'].includes(c.status)).map(c=>`<article class="cm-message"><strong>${esc(c.name)} · ${esc(authLabels[c.status])}</strong><p class="meta">授权有效至 ${stamp(c.tokenExpiresAt)}</p><p>发布 · 评论采集 · 回复 · 私信：尚未接通官方执行通道</p>${button('platform-disconnect','从 Harta 断开',c.id)}</article>`).join('')||'<p>暂无已连接账号。</p>'}<p class="meta">断开会清除本地凭证；平台授权请在对应 App 中撤销。</p></section>`;}
function connectionsView(){return heading('平台账号','')+`<section class="cm-panel"><h2>搜索与评论采集</h2><button type="button" class="btn" data-acq-page="settings">管理抖音与小红书数据源</button></section>`+wechatConnectionsView(businessId)+hostedConnectionsView(businessId)+`<details class="cm-support" data-cm-detail="${businessId}:official-auth"><summary>官方应用授权（需要平台应用资质）</summary>${authConnectionsView()}</details><details class="cm-support" data-cm-detail="${businessId}:browser-advanced"><summary>浏览器连接器（已有连接与测试接入）</summary><section class="cm-panel"><h2>首次连接，按这三步完成</h2><ol><li><a href="/api/browser-extension">下载浏览器连接器</a>，解压后在 Chrome 的扩展程序页面开启开发者模式，选择「加载已解压的扩展程序」。</li><li>在同一个浏览器中登录你自己的抖音或小红书账号。不同账号建议使用不同 Chrome 个人资料。</li><li>在下方登记账号并生成配对码，打开连接器，填写 Harta 地址 <code>${esc(location.origin)}</code> 和配对码。</li></ol><p class="meta">配对仅用于读取，不授予发布或私信权限。登录状态保留在你的浏览器。</p></section>${panel('browser-account','登记我的平台账号',form('browser-account',`${select('platform','平台',['抖音','小红书'])}${field('name','账号名称（请与浏览器当前登录账号对应）','',true)}${submit('保存账号')}`))}<section class="cm-panel"><h2>我的账号</h2>${rows('accounts').filter(a=>['抖音','小红书'].includes(a.platform)).map(a=>`<article class="cm-row"><div><strong>${esc(a.name)}</strong><p>${esc(a.platform)} · ${browserState.connections.some(c=>c.accountId===a.id&&c.status==='paired')?'浏览器已配对，平台登录需在浏览器核对':'尚未连接浏览器'}</p></div>${button('browser-pair','生成配对码',a.id)}</article>`).join('')||'<p>先登记一个你自己使用的平台账号。</p>'}${pairing&&pairing.customerId===businessId?`<div class="cm-notice"><strong>一次性配对码 · 有效至 ${stamp(pairing.expiresAt)}</strong><textarea readonly aria-label="一次性配对码">${esc(pairing.code)}</textarea><p>仅粘贴到你安装的 Harta 连接器中。</p></div>`:''}</section><section class="cm-panel"><h2>已配对的浏览器</h2>${button('browser-refresh','刷新连接与任务')}${browserState.connections.filter(c=>c.customerId===businessId).map(c=>`<article class="cm-row"><div><strong>${esc(c.name)} · ${esc(c.deviceName)}</strong><p>${esc({paired:'已配对',revoked:'已断开',expired:'已过期'}[c.status])} · 最近连接 ${stamp(c.lastSeenAt)}</p></div>${c.status==='paired'?button('browser-revoke','断开连接',c.id):''}</article>`).join('')||'<p>配对后点击刷新，确认连接状态。</p>'}</section>${browserJobs()}</details><div class="cm-convergence">${button('go-content-home','去内容获客')}${button('go-prospecting','去主动获客')}</div>`;}
function contactPanel(){return contactPreview&&contactPreview.customerId===businessId?`<section class="cm-panel" aria-label="平台联系指引"><h2>在${esc(contactPreview.platform)}联系 ${esc(contactPreview.authorName)}</h2><p>${esc(contactPreview.note)}</p><blockquote>${esc(contactPreview.originalText)}</blockquote>${contactPreview.text?`<p class="cm-quote">${esc(contactPreview.text)}</p><p>使用会话中的「复制草稿」按钮复制，发送前再次核对账号与接收人。</p>`:''}${anchor(contactPreview.url,contactPreview.channel==='私信'?'打开评论者主页':'打开原作品并找到这条评论')}<p class="meta">尚未发送。请在平台发送后登记；无法私信时可回复原评论。</p></section>`:'';}
function semanticEvidence(s){
  const r=s.openfindSemantic;if(!r)return '';
  const verdict={purchase:'购买咨询',service:'服务咨询',interest:'一般关注',discussion:'讨论交流',resolved:'需求可能已结束'}[r.verdict]||r.verdict;
  return `<details class="cm-support"><summary>模型复核 · ${esc(verdict)}</summary><p class="meta">${esc(r.providerName)} · ${esc(r.model)} · ${stamp(r.reviewedAt)} · 模型建议，业务适配和联系决定仍需人工核实</p><p>${esc(r.reason)}</p>${r.quotes.map(q=>`<blockquote>${esc(q)}</blockquote>`).join('')}${r.limitations.length?`<p class="meta">待核实：${r.limitations.map(esc).join('；')}</p>`:''}</details>`;
}
function comment(s,depth=0,includeReplies=true){
  const sourceWork=s.workId?rows('works').find(w=>w.id===s.workId):null;if(!isRealEvidence(s) || (s.workId && !isRealEvidence(sourceWork)))return `<article class="cm-comment"><strong>演示或来源不可用</strong><p class="cm-quote">${esc(s.text)}</p><p class="meta">此评论不能作为真实线索或选题。</p></article>`;
  const parent=s.parentRecordId&&rows('signals').find(r=>r.workId===s.workId&&r.recordId===s.parentRecordId);
  const children=includeReplies?rows('signals').filter(r=>r.workId===s.workId&&r.parentRecordId&&r.parentRecordId===s.recordId):[];
  const matches=matchingPublications(s,rows('works'),rows('publications'));
  const choices=matches.map(p=>[p.id,`${p.platform} · ${p.accountName || '账号'} · ${p.content?.title || '已发布作品'}`]);
  const attribution=s.publicationAttribution;
  const attributionPanel=s.leadId && !s.isAuthorReply ? attribution?`<p class="meta">已人工关联发布：${esc(attribution.publicationTitle || '作品')} · ${esc(attribution.note)} ${anchor(attribution.publicationUrl,'关联时的作品')}</p>${panel(`unlink-publication-${s.id}`,'撤销内容来源关联',form('signal-publication',`${area('note','撤销原因','',true)}<input type="hidden" name="action" value="unlink"><label class="cm-check"><input type="checkbox" name="confirmed" required>我已核对撤销原因</label>${submit('撤销关联')}`,s.id))}`:choices.length?panel(`link-publication-${s.id}`,'关联自己的已发布作品',form('signal-publication',`${select('publicationId','确认评论来自哪篇作品',[['','请选择'],...choices])}${area('note','核对依据','',true)}<input type="hidden" name="action" value="link"><label class="cm-check"><input type="checkbox" name="confirmed" required>我已核对作品与评论来源</label><p class="meta">已有主动发现来源会保留；不会自动发送消息。</p>${submit('关联发布记录')}`,s.id)):'':'';
  return `<article tabindex="-1" data-signal-id="${esc(s.id)}" class="cm-comment ${depth?'cm-reply':''}"><header><strong>${esc(s.authorName||'昵称未知')}</strong><span class="cm-tag">${s.isAuthorReply?'视频作者':s.status==='confirmed'?'已保存':s.status==='excluded'?'已排除':'待核实'}</span></header><p class="cm-quote">${esc(s.text)}</p>${semanticEvidence(s)}${!includeReplies&&parent?`<p class="meta">回复的原评论：${esc(parent.text.slice(0,220))}</p>`:''}<p class="meta">${esc(s.publishedAt?stamp(s.publishedAt):s.publishedText||'发表时间未知')} · ${s.sourceType==='browser_visible'?'浏览器读取':s.sourceType==='openfind_live'?'平台实时采集':s.sourceType==='openfind_import'?'文件导入':'导入资料'} ${s.parentRecordId&&!rows('signals').some(r=>r.workId===s.workId&&r.recordId===s.parentRecordId)?' · 父评论未在当前范围内':''}</p><p class="meta">${esc(demandEvidence(s).reason)}${s.ipRegion?' · 页面属地：'+esc(s.ipRegion):''}</p><div class="acts">${anchor(s.url,'原作品')}${anchor(s.authorUrl,'评论者主页')}${s.leadId?button('browser-contact','联系此人',s.leadId):''}${s.leadId?button('open-contact','查看跟进',s.leadId):''}</div>${s.review?`<details class="cm-support"><summary>核实记录 · ${stamp(s.review.at)}</summary><p>${esc(s.review.note)}</p></details>`:''}${attributionPanel}${(!s.isAuthorReply&&s.status!=='excluded'&&s.sourceType!=='search_summary')||(customer()?.demandTopics||[]).some(t=>t.kind==='comment'&&t.evidenceId===s.id)?demandTopicEditor(null,'comment',s.id,!s.isAuthorReply&&s.status!=='excluded'&&s.sourceType!=='search_summary'):''}${!s.leadId&&!s.isAuthorReply?panel(`review-${s.id}`,'核实或排除',form('review',`${area('note','核实依据或排除理由','',true)}${s.sourceType==='search_summary'?`<p class="meta">搜索摘要可能不是用户原话；保存前请打开原文，填写真实需求。排除时无需填写。</p>${area('sourceQuote','回源核对的真实需求原文','',false,6000)}${field('sourceAuthorName','原文作者昵称（选填）','',false,'text',100)}${field('sourceAuthorId','原文作者 ID（选填）','',false,'text',200)}<label class="cm-check"><input type="checkbox" name="sourceVerified">我已回源核对原话及所填写的身份</label>`:''}${choices.length?select('publicationId','确认来自自己的已发布作品（选填）',[['','不关联发布记录'],...choices]):''}${select('action','处理方式',[['confirm','保存为值得跟进的线索'],['triage','保存线索，地点或业务适配待核实'],['exclude','排除此需求']])}${select('leadId','关联已有联系人（可选，需核实身份）',[['','按稳定身份匹配或新建'],...rows('leads').filter(l=>isRealEvidence(l)&&l.platform===s.platform&&(!l.authorId||!s.authorId||l.authorId===s.authorId)).map(l=>[l.id,l.authorName+' · '+(l.authorId?'已有平台身份':'身份待核实')])])}${submit('保存核实结果')}`,s.id)):''}${depth<20?children.map(r=>comment(r,depth+1)).join(''):children.length?'<p>更多回复请从原评论查看。</p>':''}</article>`;
}
function demandQueue(){
  const candidates=recentDemandQueue(data().signals||[],businessId,Date.now(),rows('works')),page=actionPage(candidates,demandPages.get(businessId)||0,12);
  return `<section class="cm-panel" aria-label="近7天需求核实"><h2>近 7 天需求核实 · ${candidates.length} 条</h2><p class="meta">按评论时间筛选。核实地点和当前需求后再跟进。</p>${page.items.map(s=>{const work=rows('works').find(w=>w.id===s.workId);return `<div><p class="meta">${esc(s.platform)} · ${esc(work?.title||'原作品')}</p>${comment(s,0,false)}</div>`;}).join('')||'<p>已读评论中暂未找到符合条件的需求；可更换具体服务关键词继续采样。</p>'}${page.total?`<nav class="cm-gallery-controls" aria-label="需求分页">${page.page>0?button('demand-page','上一页需求',String(page.page-1)):''}<span role="status">第 ${page.page+1} / ${page.pages} 页 · ${page.total} 条需求</span>${page.page+1<page.pages?button('demand-page','下一页需求',String(page.page+1)):''}</nav>`:''}</section>`;
}
function discoveryPanel(){
  const tab=discoveryTabs.get(businessId)||'works';
  const filters=discoveryFilters.get(businessId)||{sort:'latest'}, all=rows('works').filter(isRealEvidence);
  const list=discoveryWorks(all,rows('signals'),filters);
  const pages=Math.max(1,Math.ceil(list.length/24)),page=Math.min(discoveryPages.get(businessId)||0,pages-1);
  const tabs=[['works','作品库 · '+all.length],['needs','需求核实'],['search','实时搜索与任务']];
  const reportTask=rows('tasks').filter(t=>t.importReport).at(-1),report=reportTask?.importReport;
  return `<section class="cm-panel cm-discovery" aria-label="作品发现"><div class="cm-discovery-heading"><div><h2>作品发现</h2></div><button type="button" class="btn ghost" data-acq-page="discover">实时搜索</button></div>
    <div class="cm-discovery-tabs" role="tablist" aria-label="作品与需求视图">${tabs.map(([id,label])=>`<button type="button" role="tab" id="cm-tab-${id}" aria-controls="cm-discovery-content" aria-selected="${tab===id}" tabindex="${tab===id?0:-1}" data-cm="discovery-tab" data-id="${id}">${label}</button>`).join('')}</div>
    <div id="cm-discovery-content" role="tabpanel" aria-labelledby="cm-tab-${tab}">
    ${tab==='search'?openFindPanel(businessId,customer()):''}
    ${tab==='needs'?demandQueue():''}
    ${tab==='works'?`
    ${panel('openfind-import','导入作品与评论',form('openfind-import',`${select('kind','导入内容',[['notes','作品导出 JSON'],['comments','评论导出 JSON'],['snapshot','完整快照（notes / comments）']])}<label>选择 JSON 文件<input type="file" name="file" accept=".json,application/json"></label>${area('json','或粘贴 JSON','',false,1800000)}${field('source','来源说明（采集日期或文件说明）','',true)}<p class="meta">先导入作品，再导入评论；也可一次导入快照。单次最多 100 条作品、1000 条评论，文件小于 1.8 MB。演示数据会跳过，评论需核实后才进入客户跟进。</p>${submit('导入当前业务')}`))}
    ${report?`<details class="cm-support"><summary>最近同步记录</summary><p class="cm-import-result">${reportTask.sourceType==='openfind_live'?'最近自动同步':'最近导入'}：新增 ${report.worksAdded} 条作品、${report.commentsAdded} 条评论；重复 ${report.worksExisting+report.commentsDuplicate} 条；跳过 ${report.skippedDemo} 条演示数据。</p></details>`:''}
    ${form('discovery-filter',`${field('query','筛选已保存作品',filters.query||'')}${select('platform','平台',[['','全部平台'],['小红书','小红书'],['抖音','抖音']],filters.platform||'')}${select('type','内容形式',[['','全部形式'],['image','图文'],['video','视频']],filters.type||'')}${select('sort','排序与需求筛选',[['latest','作品最新'],['popular','互动量最高'],['demand','近 7 天有需求表达']],filters.sort||'latest')}${submit('应用筛选')}${button('clear-discovery','重置')}`)}
    <p class="meta">${list.length} / ${all.length} 条作品 · 需求统计限已采集评论。</p>
    <div class="cm-discovery-grid">${list.slice(page*24,(page+1)*24).map(w=>`<article class="cm-discovery-card">${nativeWorkCover(w)}<p class="cm-eyebrow">${esc(w.platform)} · ${w.type==='image'?'图文':w.type==='video'?'视频':'形式未记录'}</p><h3><button type="button" class="cm-work-title" data-native-preview="${esc(w.id)}">${esc(w.title)}</button></h3><p class="cm-card-description">${esc((w.description||'').slice(0,180))}</p><p class="meta">${esc(w.authorName||'作者未记录')} · ${esc(w.publishedAt?stamp(w.publishedAt):'发表时间未知')}</p><p>互动 ${w.engagement===null?'未记录':w.engagement.toLocaleString('zh-CN')} · 已读评论 ${w.savedComments} · 近期需求表达 ${w.recentDemand}</p><div class="acts">${button('open-source','查看原文与评论',w.id)}${button('reference-work','参考创作',w.id)}${openFindWorkActions(w)}${anchor(w.url,'原作品')}</div></article>`).join('')||empty(all.length?'没有符合条件的作品':'先带入一批参考作品',all.length?'尝试重置筛选，时间未知的评论不会计入近期需求。':'在上方连接平台并实时搜索，也可一键搜索并采集评论。',all.length?button('clear-discovery','清除筛选'):'')}</div>${pages>1?`<nav class="cm-gallery-controls" aria-label="作品分页"><button type="button" class="btn ghost" data-cm="discovery-page" data-id="${page-1}" ${page===0?'disabled':''}>上一页作品</button><span role="status">第 ${page+1} / ${pages} 页 · ${list.length} 条作品</span><button type="button" class="btn ghost" data-cm="discovery-page" data-id="${page+1}" ${page===pages-1?'disabled':''}>下一页作品</button></nav>`:''}`:''}</div>
  </section>`;
}
function referenceFields(){
  return panel('content-references','选择参考作品（选填，最多 3 条）',`<p>借鉴选题与表达，用当前业务资料创作；有原作品链接时保留供回查，粘贴样本需自行核对来源。</p><div class="cm-reference-grid">${rows('works').filter(isRealEvidence).map(w=>`<article class="cm-reference-card">${nativeWorkCover(w)}<label class="cm-check"><input type="checkbox" name="referenceWorkIds" value="${esc(w.id)}">${esc(w.platform)} · ${esc(w.title)}</label></article>`).join('')}</div>${rows('works').some(isRealEvidence)?'':'<p>先在主动获客中导入或读取作品。</p>'}`);
}
function referenceHistory(c){
  const packs=(c.drops||[]).filter(p=>p.workReferences?.length);
  const current=actionPage(packs,referencePages.get(c.id)||0,8);
  return packs.length?panel('reference-history','内容批次的参考来源',current.items.map(p=>`<article><h3>${esc(p.title||'内容批次')}</h3>${p.workReferences.map(r=>`<p>${r.url?anchor(r.url,r.title):esc(r.title)}${r.sourceState?` · ${esc(r.sourceState)}`:''}</p>`).join('')}</article>`).join('')+`<div class="acts" aria-label="参考来源分页">${current.page>0?button('reference-page','上一页',String(current.page-1)):''}<span class="meta">第 ${current.page+1} / ${current.pages} 页 · 共 ${current.total} 个批次</span>${current.page+1<current.pages?button('reference-page','下一页',String(current.page+1)):''}</div>`):'';
}
function prospecting(){
  const targets=rows('targets');if(!targets.some(t=>t.id===targetId))targetId=targets[0]?.id||'';
  const t=targets.find(t=>t.id===targetId), works=rows('works').filter(w=>w.targetId===targetId&&isRealEvidence(w)),w=works.find(w=>w.id===workId),signals=rows('signals').filter(s=>s.workId===workId&&isRealEvidence(s));
  const targetForm=panel('target','添加目标账号',form('target',`${select('platform','平台',['抖音','小红书','视频号','B站','知乎','其他'])}${field('name','目标账号名称','',true)}${field('url','账号主页链接','',true,'url')}${field('recordId','平台账号 ID（可核对作者回复）')}${submit('保存目标账号')}`));
  const worksForm=t?panel(`work-${t.id}`,'添加这个账号的视频',form('work',`<input type="hidden" name="targetId" value="${t.id}">${field('title','视频标题','',true)}${field('url','原视频链接','',true,'url')}${field('recordId','平台视频 ID（选填）')}${area('description','视频内容与语境（选填）')}${submit('保存视频记录')}`,t.id)):'';
  const intake=w?panel(`comments-${w.id}`,'导入真实评论',form('comments',`<input type="hidden" name="workId" value="${w.id}">${area('json','评论 JSON 数组','',true,55000)}<p class="meta">每条填写 text、url；可填 recordId、authorId、authorName、parentRecordId、isAuthorReply、publishedAt。最多 100 条，保留楼中楼关系。</p>${field('source','资料取得方式或来源','',true)}${submit('导入并去重')}`,w.id)):'';
  return heading('历史资料与目标账号','')+`<div class="acts"><button type="button" class="btn ghost" data-acq-page="discover">返回主动获客</button></div>`+contactPanel()+`<section class="cm-next"><div><h2>${w?'作品评论':t?'目标作品':'查找需求'}</h2><p>${w?`已保存 ${signals.length} 条评论`:'搜索作品，或选择目标账号。'}</p></div>${t&&(w||t.url)?button('read-current',w?(signals.length?'补充读取评论':'读取这条作品的评论'):'读取这个账号的作品','',true):button('search','查找公开需求','',true)}</section><div class="acts">${t?button('search','查找公开需求'):''}${button('import-needs','导入已有需求')}${button('go-conversations','查看已核实客户')}</div><div class="acts">${button('go-connections','连接平台账号')}${button('browser-refresh','刷新读取结果')}</div>${browserJobs()}${w?'':discoveryPanel()}<div class="cm-targets"><aside class="cm-panel"><h2>目标账号</h2>${targets.map(t=>`<button type="button" class="cm-list-item ${t.id===targetId?'selected':''}" data-cm="select-target" data-id="${t.id}"><strong>${esc(t.name)}</strong><small>${esc(t.platform)}</small></button>`).join('')||'<p>添加你希望研究的公开账号主页。</p>'}${targetForm}</aside><section class="cm-panel">${w?`<div class="acts">${button('back-videos','返回视频列表')}</div><h2>${esc(w.title)}</h2>${nativeWorkGallery(w)}<p>${esc(t.name)} · ${esc(w.platform)} · ${esc(w.description)}</p>${anchor(w.url,'在平台打开视频')}<p class="meta">已保存 ${signals.length} 条，其中 ${signals.filter(s=>s.parentRecordId).length} 条回复；仅本次取得范围。</p><div class="acts">${openFindWorkActions(w)}</div>${collectionForm('comments',w)}${intake}${signals.filter(s=>!s.parentRecordId||!signals.some(p=>p.recordId&&p.recordId===s.parentRecordId)).map(s=>comment(s)).join('')||empty('还没有这个视频的评论','导入带原文和链接的评论，不把视频标题当作买家需求。')}`:`<h2>${esc(t?.name||'选择目标账号')}</h2>${t?anchor(t.url,'打开主页'):''}${collectionForm('works',t)}${worksForm}${works.map(w=>`<article class="cm-video">${nativeWorkCover(w)}<div><h3>${esc(w.title)}</h3><p>${rows('signals').filter(s=>s.workId===w.id).length} 条已保存评论</p>${button('open-video','查看评论',w.id)}</div>${anchor(w.url,'原视频')}</article>`).join('')||'<p>添加视频链接，再导入评论。</p>'}`}</section></div>`;
}
function reviewSignal(){
  const w=rows('works').find(w=>w.id===workId), selected=rows('signals').find(s=>s.workId===workId&&s.id===reviewSignalId);
  return heading('核实线索','')+`<div class="acts"><button type="button" class="btn ghost" data-acq-page="leads">返回线索</button>${button('go-conversations','客户跟进')}</div>`+(w?`<section class="cm-panel"><h2>${esc(w.title)}</h2>${nativeWorkGallery(w)}${selected?comment(selected,0,false):'<p>请选择需要核实的评论。</p>'}</section>`:'');
}
function opportunityForm(lead,op){return form('opportunity',`<input type="hidden" name="leadId" value="${lead.id}"><input type="hidden" name="baseRevision" value="${op?.revision||0}">${field('title','这次购买需求',op?.title||'',true)}${scopeFields(op,true)}${select('stage','本次需求阶段',['待核实','了解需求','比较中','询价中','已成交','已结束'],op?.stage||'待核实')}${area('note','本次判断或跟进依据','',true)}${field('nextStep','下一步',op?.nextStep||'')}${field('nextAt','下次跟进时间',op?.nextAt?new Date(new Date(op.nextAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',false,'datetime-local')}<fieldset><legend>关联需求证据</legend>${rows('signals').filter(s=>lead.signalIds.includes(s.id)).map(s=>`<label class="cm-check"><input type="checkbox" name="signalIds" value="${s.id}" ${(op?.signalIds||lead.signalIds).includes(s.id)?'checked':''}>${esc(s.text.slice(0,70))}</label>`).join('')}</fieldset>${submit(op?'保存本次跟进':'建立购买需求')}`,op?.id||lead.id);}
function liveSourceEditor(lead,message){
  if(message.direction!=='inbound'||message.source!=='manual'||message.publicationId)return '';
  const options=[['','来源未知'],...liveSources(customer(),lead.platform).map(item=>[item.id,`${item.title} · ${item.time?item.time.replace('T',' '):'未排期'}`])];
  return panel(`live-source-${message.id}`,'更正直播来源',form('live-source',`${select('liveSource','咨询来自哪个场次',options,message.liveSource?.id||'')}<input type="hidden" name="leadId" value="${esc(lead.id)}"><input type="hidden" name="expectedLiveSource" value="${esc(message.liveSource?.id||'')}">${area('note','更正原因或核对依据','',true)}<label class="cm-check"><input type="checkbox" name="confirmed" required>我已核对来源</label><p class="meta">原咨询不变；更正会保留历史并更新场次统计。</p>${submit('保存来源更正')}`,message.id));
}
function publicationSourceEditor(lead,message){
  if(message.direction!=='inbound'||message.source!=='manual'||message.liveSource)return '';
  const options=[['','来源未知'],...rows('publications').filter(p=>isRealEvidence(p) && p.status==='published' && p.platform===lead.platform && p.accountId===message.accountId).map(p=>[p.id,`${p.content?.title || p.content?.cover || '已发布作品'} · ${p.accountName || '账号'}`])];
  return panel(`publication-source-${message.id}`,'更正作品来源',form('publication-source',`${select('publicationId','咨询来自哪篇作品',options,message.publicationId||'')}<input type="hidden" name="leadId" value="${esc(lead.id)}"><input type="hidden" name="expectedPublicationId" value="${esc(message.publicationId||'')}">${area('note','更正原因或核对依据','',true)}<label class="cm-check"><input type="checkbox" name="confirmed" required>我已核对来源</label><p class="meta">只显示同一接收账号、平台和业务的已发布作品；原咨询不变。</p>${submit('保存作品来源更正')}`,message.id));
}
function inquirySource(message){
  if(message.direction!=='inbound')return '';
  if(message.liveSource){
    const current=liveSources(customer()).find(item=>item.id===message.liveSource.id);
    return `<div class="cm-inquiry-source"><p class="meta">人工关联直播：${esc(message.liveSource.title || '直播场次')}${current?'':' · 场次已不可用'}</p>${current?button('open-live','查看直播场次',current.id):''}</div>`;
  }
  if(message.publicationId){
    const current=rows('publications').find(p=>p.id===message.publicationId && p.status==='published' && p.url && !p.demo && p.source!=='demo' && p.sourceType!=='demo'),snapshot=message.publicationSnapshot;
    const title=current?.content?.title || current?.content?.cover || snapshot?.title || '已发布作品';
    return `<div class="cm-inquiry-source"><p class="meta">人工关联作品：${esc(title)}${current?'':' · 发布记录已不可用'}</p>${current?button('open-publication-review','查看作品回看',current.id):anchor(snapshot?.url,'打开登记时的作品链接')}</div>`;
  }
  return '';
}
function topicRevisionForm(t,leadId){
 return form('demand-topic-revise',`<input type="hidden" name="leadId" value="${esc(leadId)}"><input type="hidden" name="expectedTitle" value="${esc(t.title)}">${field('topic','已保存的匿名选题',t.title,false,'text',160)}<label class="cm-check"><input type="checkbox" name="removeDirection" checked>同时移除当前创作方向中未修改的原选题（如有）</label><label class="cm-check"><input type="checkbox" name="confirmed" required>我已核对更正内容和隐私</label><p class="meta">更正后需重新采用新选题；已生成内容和历史备份不会自动修改。若方向已被手工修改，请先自行检查。</p><button class="btn" type="submit" data-operation="update">保存更正</button><button class="btn ghost" type="submit" data-operation="remove">移除选题</button>`,t.id);
}
function demandTopicEditor(lead,kind,evidenceId,canCreate=true){
  const leadId=lead?.id || '',existing=(customer()?.demandTopics||[]).filter(t=>(t.leadId||'')===leadId&&t.kind===kind&&t.evidenceId===evidenceId);
  const create=canCreate?form('demand-topic',`<input type="hidden" name="leadId" value="${esc(leadId)}"><input type="hidden" name="kind" value="${esc(kind)}"><input type="hidden" name="evidenceId" value="${esc(evidenceId)}">${field('topic','自己改写成匿名的选题','',true,'text',160)}<p class="meta">只把你填写的选题加入内容创作，不复制客户原话。请去掉昵称、联系方式、地址、订单号等身份信息。</p><label class="cm-check"><input type="checkbox" name="confirmed" required>我已去除客户身份和隐私</label>${submit('保存到需求选题')}`,evidenceId,'',kind):'<p class="meta">这条评论已不适合新建选题，可检查或移除已保存的选题。</p>';
  const edits=existing.map(t=>topicRevisionForm(t,leadId)).join('');
  return panel(`demand-topic-${kind}-${evidenceId}`,'提炼为内容选题',create+edits);
}

function intentTrackPanel(lead){
  const kinds=[['buy','购买咨询','已成交'],['ad','商务合作','已签约'],['divert','私域承接','已转入私域']];
  const tracks=lead.intentTracks||[];
  const texts=[...rows('signals').filter(s=>lead.signalIds?.includes(s.id)&&s.status==='confirmed'&&isResearchComment(s,rows('works'))).map(s=>s.text),...(lead.messages||[]).filter(m=>m.direction==='inbound'&&isRealEvidence(m)).map(m=>m.text)],suggested=suggestedLeadIntents(texts).map(kind=>kinds.find(k=>k[0]===kind)?.[1]).filter(Boolean);
  return panel(`intent-tracks-${lead.id}`,'咨询类型与进展',`<p class="meta">同一联系人可有多种咨询，分别记录；此处不会修改购买需求阶段或成交统计。“已回复”仅为人工记录，不会登记发送或清除待回复。</p>${suggested.length?`<p class="meta">原话可能涉及：${esc(suggested.join('、'))}。仅按词句提示，请自行核对；不会自动记录。</p>`:''}${kinds.map(([kind,label,done])=>{const track=tracks.find(t=>t.kind===kind),statuses=[['noted','已记下'],['replied','已回复'],['won',done],['dropped','暂不跟进']],statusLabel=statuses.find(([value])=>value===track?.status)?.[1]||'未记录';return `<article><p><strong>${esc(label)}</strong> · ${esc(statusLabel)}${track?.note?`<br><span class="meta">${esc(track.note)}</span>`:''}</p>${panel(`intent-track-${lead.id}-${kind}`,track?'更新进展':'记录此类咨询',form('intent-track',`<input type="hidden" name="kind" value="${kind}"><input type="hidden" name="baseRevision" value="${track?.revision||0}">${select('status','进展',statuses,track?.status||'noted')}${area('note','实际情况或依据','',true,2000)}${submit('保存咨询进展')}`,lead.id,'',kind))}</article>`;}).join('')}${(lead.events||[]).some(e=>e.type==='intent-track')?`<details data-cm-detail="${esc(`${businessId}:intent-history-${lead.id}`)}"><summary>咨询进展历史</summary>${(lead.events||[]).filter(e=>e.type==='intent-track').slice(-30).reverse().map(e=>`<p><span class="meta">${stamp(e.at)} · ${esc(leadIntentEventLabel(e.kind,e.status))}</span><br>${esc(e.note)}</p>`).join('')}</details>`:''}`);
}
function contactFollowup(l){
  const evidence=rows('signals').filter(s=>l.signalIds?.includes(s.id));
  const nextLocal=l.nextAt?new Date(Date.parse(l.nextAt)-new Date(l.nextAt).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  return `<section aria-label="线索核实与跟进"><h3>跟进</h3>${l.openfindSales?`<p><button type="button" class="btn ghost" data-cm="sales-record" data-id="${esc(l.openfindSales.id)}">查看沟通记录</button></p>`:''}<p>${esc(l.platform)} · ${esc(l.stage)}${l.nextAt?' · 计划 '+stamp(l.nextAt):''}</p>${(l.messages||[]).filter(m=>m.direction==='inbound').map(m=>`<blockquote class="cm-evidence"><p>${esc(m.text)}</p><p class="meta">${esc(m.evidence)}</p>${inquirySource(m)}${!m.liveSource&&!m.publicationId?'<p class="meta">咨询来源未知</p>':''}${demandTopicEditor(l,'message',m.id)}${publicationSourceEditor(l,m)}${liveSourceEditor(l,m)}${m.publicationSourceHistory?.length?`<details><summary>作品来源更正记录（${m.publicationSourceHistory.length}）</summary>${m.publicationSourceHistory.map(h=>`<p>${stamp(h.at)} · ${esc(h.before?.title||'来源未知')} → ${esc(h.after?.title||'来源未知')} · ${esc(h.note)}</p>`).join('')}</details>`:''}${m.liveSourceHistory?.length?`<details><summary>来源更正记录（${m.liveSourceHistory.length}）</summary>${m.liveSourceHistory.map(h=>`<p>${stamp(h.at)} · ${esc(h.before?.title||'来源未知')} → ${esc(h.after?.title||'来源未知')} · ${esc(h.note)}</p>`).join('')}</details>`:''}</blockquote>`).join('')}${evidence.map(s=>`<blockquote class="cm-evidence"><p>${esc(s.text)}</p>${semanticEvidence(s)}${s.publicationAttribution?`<p class="meta">已人工关联作品：${esc(s.publicationAttribution.publicationTitle || '已发布作品')} · ${esc(s.publicationAttribution.note)}</p>${anchor(s.publicationAttribution.publicationUrl,'关联时的作品')}`:''}<p class="meta">评论时间：${stamp(s.publishedAt)}</p>${s.review?.note?`<details class="cm-support"><summary>核实依据</summary><p>${esc(s.review.note)}</p></details>`:''}${anchor(s.url,'回查原始需求')}${s.workId?`<button type="button" class="btn ghost" data-cm="open-source" data-id="${esc(s.workId)}" data-signal="${esc(s.id)}">查看原文与评论</button>`:''}${s.status==='confirmed'?demandTopicEditor(l,'signal',s.id):''}</blockquote>`).join('')}<p>${esc(l.nextStep||'下一步尚未记录')}</p><details data-cm-detail="${businessId}:followup-edit:${l.id}"><summary>更新跟进</summary>${form('contact-followup',`${select('stage','线索阶段',['待核实','值得跟进','已联系','沟通中','已成交','暂不跟进'],l.stage)}${area('note','实际进展或阶段变化依据','',true)}${field('nextStep','下一步',l.nextStep||'')}${field('nextAt','下次跟进时间',nextLocal,false,'datetime-local')}${submit('保存跟进记录')}`,l.id)}</details><details><summary>核实与跟进时间线 · ${l.events.length}</summary>${l.events.slice().reverse().map(e=>`<article class="cm-followup-event"><p class="meta">${stamp(e.at)} · ${esc(e.type==='intent-track'?leadIntentEventLabel(e.kind,e.status):e.stage||'核实记录')}</p>${e.note.length>180?`<details class="cm-support"><summary>展开完整记录</summary><p>${esc(e.note)}</p></details>`:`<p>${esc(e.note)}</p>`}</article>`).join('')}</details></section>`;
}
function duplicateContacts(lead){
 const similar=rows('leads').filter(other=>other.id!==lead.id&&other.authorName&&other.authorName===lead.authorName);
 if(!similar.length)return '';
 return `<details class="cm-support"><summary>同名联系人 ${similar.length} 条（身份未确认）</summary><p>昵称相同不能证明同一人；跨平台记录保留独立，不自动合并。</p>${similar.map(other=>button('open-contact',`${other.platform} · ${other.authorName}`,other.id)).join('')}</details>`;
}
function conversations(){
  const leads=rows('leads');if(!leads.some(l=>l.id===contactId))contactId=leads[0]?.id||'';
  const l=leads.find(l=>l.id===contactId),ops=rows('opportunities').filter(o=>o.leadId===contactId);
  if(!ops.some(o=>o.id===opId))opId=ops[0]?.id||'';
  const op=ops.find(o=>o.id===opId);
  const accounts=rows('accounts').filter(a=>a.platform===l?.platform),agents=rows('agents').filter(a=>a.status==='enabled'&&a.versions.at(-1).config.duties.includes('接待'));
  const messages=l?.messages.filter(m=>m.opportunityId===opId)||[];
  return heading('客户跟进','')+contactPanel()+`<div class="acts">${button('new-inquiry','登记收到的咨询','',!leads.length)}${button('go-prospecting','去发现需求')}</div><details class="cm-support"><summary>账号与历史会话</summary><div class="acts">${button('go-connections','连接平台账号')}${button('old-leads','未关联需求的历史会话')}</div></details><div class="acts">${''}</div><div class="cm-conversations"><aside class="cm-panel"><h2>联系人</h2>${leads.map(l=>`<button type="button" class="cm-list-item ${l.id===contactId?'selected':''}" data-cm="open-contact" data-id="${l.id}"><strong>${esc(l.authorName)}</strong><small>${esc(l.platform)}${l.doNotContact?' · 禁止联系':''}${(l.intentTracks||[]).length?' · '+esc(l.intentTracks.map(t=>leadIntentEventLabel(t.kind,t.status)).join(' / ')):''}</small></button>`).join('')||'<p>先核实评论里的需求，或登记真实咨询。</p>'}</aside><section class="cm-panel">${l?`<h2>${esc(l.authorName)}</h2>${intentTrackPanel(l)}${duplicateContacts(l)}${!l.doNotContact?button('browser-contact','打开平台联系',l.id):''}<div class="cm-op-tabs">${ops.map(o=>`<button type="button" class="cm-list-item ${o.id===opId?'selected':''}" data-cm="select-op" data-id="${o.id}"><strong>${esc(o.title)}</strong><small>${esc(o.stage)}</small></button>`).join('')}</div>${panel(`new-op-${l.id}`,'新增一次购买需求',opportunityForm(l,null))}${op?`<h3>${esc(op.title)} <span class="cm-tag">${esc(op.stage)}</span></h3><p>${esc(op.productIds.length?scopeNames(op):'产品待确认')} · ${op.skuIds.length?op.skuIds.map(id=>esc(rows('skus').find(s=>s.id===id)?.name||'历史规格')).join('、'):'规格未确定'}</p><p>${esc(op.nextStep||'下一步尚未记录')}</p>${panel(`op-${op.id}`,'更新阶段、产品与下一步',opportunityForm(l,op))}${(op.signalIds||[]).map(id=>rows('signals').find(s=>s.id===id)).filter(Boolean).map(s=>`<blockquote class="cm-evidence">${esc(s.text)}${s.publicationAttribution?`<p class="meta">已人工关联作品：${esc(s.publicationAttribution.publicationTitle || '已发布作品')} · ${esc(s.publicationAttribution.note)}</p>`:''}<div>${anchor(s.url,'原始需求')}${s.workId?button('open-source','查看视频上下文',s.workId):''}</div>${s.status==='confirmed'?demandTopicEditor(l,'signal',s.id):''}</blockquote>`).join('')}
<div class="cm-messages">${messages.map(m=>`<article class="cm-message ${m.direction==='outbound'?'outbound':''}"><header>${m.direction==='inbound'?'收到咨询':m.status==='sent_platform'?'已发送 · 平台回读':m.status==='sent_manual'?'已发送 · 人工登记':m.status==='cancelled'?'已取消':'待审阅草稿'} · ${esc(m.channel)} <small>${stamp(m.createdAt)}</small></header><p class="cm-quote">${esc(m.text)}</p>${salesPlanView(m.salesPlan,m.method)}${m.direction==='inbound'?demandTopicEditor(l,'message',m.id):''}${inquirySource(m)}${liveSourceEditor(l,m)}${m.liveSourceHistory?.length?`<details><summary>来源更正记录（${m.liveSourceHistory.length}）</summary>${m.liveSourceHistory.map(h=>`<p>${stamp(h.at)} · ${esc(h.before?.title||'来源未知')} → ${esc(h.after?.title||'来源未知')} · ${esc(h.note)}</p>`).join('')}</details>`:''}${m.stale?`<p class="cm-notice">${esc(m.staleReason)}</p>`:''}${m.direction==='outbound'&&['draft','copied'].includes(m.status)?`<p class="meta">发送账号：${esc(accounts.find(a=>a.id===m.accountId)?.name||'历史账号')} · 接收对象：${esc(m.recipient)}</p><div class="acts">${!m.stale&&!l.doNotContact?button('copy-message','复制草稿',m.id)+button('execution-messages','在平台实际发送')+button('browser-message','打开平台联系',m.id):''}</div>${panel(`sent-${m.id}`,'登记实际发送',form('sent',`${field('sentAt','实际发送时间','',true,'datetime-local')}${area('note','平台发送凭证或核对依据','',true)}<label class="cm-check"><input type="checkbox" name="confirmed" required>我已在平台实际发送上述内容</label>${submit('登记已发送')}`,m.id))}`:''}</article>`).join('')||'<p>这个购买需求还没有会话记录。</p>'}</div>
${l.doNotContact?'<p class="cm-notice">对方已拒绝联系，不能生成或复制联系草稿。</p>':`<section class="cm-agent-box"><h3>销售沟通</h3><p>生成内容仅作为草稿。审阅并复制后，请到官方平台自行发送。</p><div class="acts">${button('execution-messages','人工发送说明')}</div>${['已成交','已结束'].includes(op.stage)?'<p>本次需求已结束。可新增需求或手动回复。</p>':op.manualTakeover||l.manualTakeover?'<p>已人工接管，智能体不会继续起草。</p>':form('outreach',`${select('agentId','使用智能体',[['','请选择已启用接待职责的智能体'],...agents.map(a=>[a.id,a.versions.at(-1).config.name])])}${select('accountId','发送账号',[['','请选择'],...accounts.map(a=>[a.id,a.name])])}${select('channel','联系渠道',['评论','私信'])}${select('signalId','公开回复的原评论',[['','私信可不选'],...rows('signals').filter(s=>op.signalIds.includes(s.id)).map(s=>[s.id,s.text.slice(0,60)])])}${submit('结合上下文起草')}`,op.id)}${l.manualTakeover?panel(`resume-contact-${l.id}`,'恢复该联系人的智能体建议',form('resume-contact',`${area('note','恢复依据','',true)}${submit('恢复建议')}`,l.id)):panel(`control-${op.id}`,op.manualTakeover?'恢复建议':'人工接管',form(op.manualTakeover?'resume':'handoff',`${area('note','操作原因','',true)}${submit(op.manualTakeover?'恢复智能体建议':'接管本次需求')}`,op.id))}</section>`}
${panel(`inbound-${op.id}`,'登记收到的新消息',form('inquiry',`${select('accountId','接收账号',[['','请选择'],...accounts.map(a=>[a.id,a.name])])}${select('channel','渠道',['评论','私信'])}${area('text','消息原文','',true,6000)}${field('messageId','平台消息 ID（选填）')}${field('receivedAt','实际收到时间','',true,'datetime-local')}${field('evidence','来源或核对依据','',true)}${submit('保存消息')}`,op.id))}
${panel(`manual-${op.id}`,'写回复或生成建议',form('manual-draft',`${!l.doNotContact?button('suggest-manual','帮我起草回复',op.id):''}${select('accountId','发送账号',[['','请选择'],...accounts.map(a=>[a.id,a.name])])}${select('channel','渠道',['评论','私信'])}${field('recipient','接收对象或原评论链接','',true)}${area('text','回复正文','',true)}${submit('保存人工草稿')}`,op.id))}
${rows('outreachRuns').filter(r=>r.opportunityId===op.id).slice(-4).reverse().map(r=>`<p class="cm-run">智能体 v${r.version} · ${esc({running:'正在起草',completed:'已生成草稿',limited:'模型未配置，已提供澄清模板',failed:'失败',interrupted:'已中断'}[r.status]||r.status)} · ${esc(r.error||r.basis||'')} </p>`).join('')}
${panel(`block-${l.id}`,l.doNotContact?'恢复联系':'禁止联系',form(l.doNotContact?'unblock':'block',`${area('note','对方意愿或操作依据','',true)}${submit(l.doNotContact?'记录恢复依据':'停止联系')}`,l.id))}
${panel(`events-${op.id}`,'跟进历史',op.events.map(e=>`<p>${stamp(e.at)} · ${esc(e.stage||e.type)} · ${esc(e.note)}</p>`).join(''))}`:contactFollowup(l)+button('old-leads','查看咨询并回复','',true)}`:empty('还没有联系人','已经有人咨询？点击上方“登记收到的咨询”。还没有客户？从内容获客或主动获客开始。')}</section></div>`;
}
function contentScope(){
  const c=ctx.getContentCustomer?.()||customer();if(!c)return '';
  const saved=businessId;businessId=c.id;
  const html=`<div class="cm-panel cm-content-scope creation-brief">${c.painClusters?.staleReason?`<p class="cm-notice">${esc(c.painClusters.staleReason)} 旧归集已暂停进入选题池；请在创作方向中检查此前已采用的内容。</p>`:''}${(c.benchmarkTeardowns||[]).some(t=>t.staleReason)?'<p class="cm-notice">部分对标拆解依据已变化，旧拆解已暂停进入选题池；请在创作方向中检查此前已采用的内容。</p>':''}<div class="acts">${button('go-content-home','返回内容获客')}</div><details data-cm-detail="${c.id}:create-content"><summary>${c.drops?.length?'创作新一批内容':'开始创作第一篇内容'}</summary><div class="creation-brief-grid"><header class="creation-brief-intro"><span>内容创作</span><h2>从一个目标，<br>开始下一篇。</h2><p>${esc(c.name)}</p><p class="meta">选择用途、平台与形式。生成后，在作品里继续编辑脚本、制作封面和安排发布。</p></header>${form('generate',`${select('creationEntry','创作入口',Object.entries(CREATION_ENTRIES),'platform')}${select('distributionIntent','传播用途',Object.entries(DISTRIBUTION_INTENTS),'natural')}${select('goal','这批内容希望带来什么？',Object.entries(SIMPLE_GOALS),growthGoal(c))}${select('creationPlatform','发布平台',[['','自动选择'],['小红书','小红书'],['抖音','抖音'],['视频号','视频号'],['朋友圈','朋友圈']])}${select('creationFormat','内容形式',[['','自动选择'],['image','图文'],['video','短视频']])}<p class="meta">选择形式时请同时指定平台；视频号请选择短视频，朋友圈请选择自动形式。图文逐页内容为制作说明，不是已生成的图片。</p><details class="cm-optional" data-cm-detail="${c.id}:content-products"><summary>选择具体产品（选填，默认使用业务介绍）</summary>${scopeFields()}</details>${referenceFields()}<button class="btn" type="submit" ${c.job?'disabled':''}>${c.job?'正在生成，请稍候…':'生成获客内容'}</button>`,c.id)}</div></details>${referenceHistory(c)}${[...(c.drops||[]),...(c.packs||[])].filter(p=>p.productReview?.required).map(p=>`<div class="cm-notice"><strong>${esc(p.title||'历史内容')}：资料已更新</strong><p>核对价格、参数和承诺后确认。</p>${p.productReview.currentHash?form('content-review',`${area('note','已核对的修改与依据','',true)}<label class="cm-check"><input type="checkbox" name="confirmed" required>已核对当前文案与最新产品资料</label>${submit('保存核对记录')}`,p.id,`data-business="${c.id}"`):'<p>原产品已停止推广，请使用有效产品重新创作。</p>'}</div>`).join('')}</div>`;if(!c.drops?.length)openDetails.add(`${c.id}:create-content`);businessId=saved;return html;
}
export function renderCommerceUI(background=false){
  if(!ctx||busy)return;
  const focused=document.activeElement,ff=focused?.closest('[data-cm-form]'),focus=ff&&focused.name?{key:ff.dataset.key,name:focused.name,start:focused.selectionStart,end:focused.selectionEnd}:null;
  stash();if(ctx.getBusiness?.()&&ws().customers.some(c=>c.id===ctx.getBusiness()))businessId=ctx.getBusiness();
  if(!ws().customers.some(c=>c.id===businessId))businessId=ws().customers.find(c=>c.id===ws().usingId)?.id||ws().customers[0]?.id||'';
  const no=`<header class="cm-heading"><div><h1>添加业务</h1></div></header><section class="cm-onboarding">${form('business',`${field('name','业务名称','',true)}${field('pitch','你提供什么，主要帮助谁？','',true)}${field('hunt','行业（选填）')}${submit('保存，选择获客方式')}`)}</section>`;
  const updatePanel=(host,html)=>{if(!host)return;if(!background||renderedPanels.get(host)!==html)host.innerHTML=html;renderedPanels.set(host,html);};
  for(const [view,render]of Object.entries({workbench:today,'content-home':contentHome,products,prospecting,review:reviewSignal,conversations,connections:connectionsView,delivery:deliveryView})){updatePanel(document.getElementById(`cm-${view}`),businessId?render():no);}
  mountOpenFindWorkbench(customer(), ws().customers);
  refreshNativeWorkPreview();
  updatePanel(document.getElementById('cm-content-scope'),contentScope());restore();
  if(focus){const f=[...document.querySelectorAll('[data-cm-form]')].find(f=>f.dataset.key===focus.key),el=f?.elements.namedItem(focus.name);if(el?.focus){el.focus({preventScroll:true});try{el.setSelectionRange(focus.start,focus.end);}catch{}}}
}
async function api(action,payload){const r=await fetch(`/api/acquisition/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await r.json();if(!r.ok)throw new Error(result.error||'操作失败');if(result.workspace)ctx.setWorkspace(result.workspace);return result;}
async function refresh(){try{const r=await fetch('/api/acquisition'),result=await r.json();if(!r.ok)throw new Error(result.error||'读取失败');ctx.setWorkspace(result.workspace);renderCommerceUI();}catch(e){ctx.toast(e.message);}clearTimeout(poll);if((data().outreachRuns||[]).some(r=>r.status==='running'))poll=setTimeout(refresh,2000);}
export async function resumeOpenFindHandoff() {
  if (!pendingOpenFindHandoff) return;
  const payload = pendingOpenFindHandoff; pendingOpenFindHandoff = null;
  await performOpenFindHandoff(payload);
}
async function openLiveProduction(target) {
  if(!await ctx.openContent(businessId,target.packId))return;
  const findBox=()=>[...document.querySelectorAll('[data-production-mode]')].find(el=>el.dataset.growthCustomer===businessId && el.dataset.growthPack===target.packId && el.dataset.growthPlatform===target.platform && Number(el.dataset.growthIndex)===target.index);
  let box=findBox();
  if(!box){ctx.toast('未找到直播制作区，请在作品中打开');return;}
  const mode=box.querySelector('[name=production-live]');
  if(mode && mode.value!=='live'){mode.value='live';mode.dispatchEvent(new Event('change',{bubbles:true}));box=findBox();}
  if(box){for(let parent=box.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;const details=box.querySelector('details');if(details)details.open=true;box.scrollIntoView({block:'start'});}
}
export function installCommerceUI(context){
  ctx=context;
  installAcquisitionShell(context);
  document.body.addEventListener('keydown',event=>{
    const tab=event.target.closest('[data-content-tab]');if(!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=[...tab.parentElement.querySelectorAll('[data-content-tab]')],i=tabs.indexOf(tab),target=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[target].click();
  });
  window.addEventListener('harta-demand-topic-changed',event=>{const id=event.detail?.customerId;if(id)topicPools.delete(id);});
  document.body.addEventListener('change',async event=>{
    const filter=event.target.closest?.('[data-radar-filter]');if(filter){stash();radarFilters.set(businessId,filter.value);renderCommerceUI();document.querySelector('[data-radar-filter]')?.focus({preventScroll:true});return;}
    const field=event.target.closest?.('[data-radar-work]');if(!field)return;
    const previous=field.dataset.previous, action=field.value, customerId=field.dataset.radarCustomer;
    if(action===previous)return;
    if(radarBusy){field.value=previous;ctx.toast('上一项安排正在保存');return;}
    radarBusy=true;document.querySelectorAll('[data-radar-work]').forEach(el=>el.disabled=true);stash();
    try {const response=await fetch('/api/radar-decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId,workId:field.dataset.radarWork,action})});const result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败');ctx.setWorkspace(result.workspace);renderCommerceUI();ctx.toast('参考作品安排已保存');}
    catch(error){field.value=previous;ctx.toast(error.message);}finally{radarBusy=false;document.querySelectorAll('[data-radar-work]').forEach(el=>el.disabled=false);}
  });
  async function handoff(payload) {
    try {
      const response = await fetch('/api/acquisition'); const result = await response.json();
      if (!response.ok) throw new Error(result.error || '读取 Harta 数据失败');
      ctx.setWorkspace(result.workspace);
      const work = (result.workspace.acquisition?.works || []).find(w => w.id === payload.workId && w.customerId === payload.customerId);
      if (!work) throw new Error('找不到当前业务的作品');
      businessId = work.customerId; ctx.setBusiness?.(businessId); workId = work.id; targetId = work.targetId;
      const signal = (result.workspace.acquisition?.signals || []).find(s => s.id === payload.signalId && s.customerId === businessId && s.workId === workId);
      if (payload.intent === 'reference') {
        await ctx.openContent(businessId);
        openDetails.add(`${businessId}:create-content`); openDetails.add(`${businessId}:content-references`); restore();
        const form = document.querySelector('#cm-content-scope [data-cm-form=generate]');
        if (form) { for (const el of form.querySelectorAll('[name=referenceWorkIds]')) el.checked = el.value === workId; stash(); form.scrollIntoView({block:'center'}); }
      } else if (payload.intent==='topic') {
        if(!signal)throw new Error('找不到已同步的评论');
        reviewSignalId=signal.id;ctx.nav('review');renderCommerceUI();
        openDetails.add(`${businessId}:demand-topic-comment-${signal.id}`);restore();
        const editor=[...document.querySelectorAll('[data-cm-detail]')].find(el=>el.dataset.cmDetail===`${businessId}:demand-topic-comment-${signal.id}`);
        if(editor)editor.scrollIntoView({block:'center'});else ctx.toast('这条评论当前不能新建选题');
      } else if (signal?.leadId) { contactId = signal.leadId; opId = ''; ctx.nav('conversations'); renderCommerceUI(); }
      else if (!signal && work.openfindIds?.[0]) { openAcquisitionPage('comments',{note:work.openfindIds[0]}); }
      else { reviewSignalId=signal?.id||''; ctx.nav(signal?'review':'prospecting-archive'); renderCommerceUI(); if(signal){openDetails.add(`${businessId}:review-${signal.id}`);restore();} }
    } catch (error) { ctx.toast(error.message); }
  }
  window.addEventListener('message', event => {
    const frame = document.querySelector('#cm-openfind iframe');
    if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.customerId !== frame.dataset.customer) return;
    if(event.data.type==='harta-studio-synced'){void refresh();return;}
    if(event.data.type==='harta-studio-return'){
      if(typeof event.data.packId!=='string' || !canLeaveAcquisition())return;
      void (async()=>{await refresh();await ctx.openContent(event.data.customerId,event.data.packId);})();return;
    }
    if(event.data.type!=='harta-openfind-handoff')return;
    if(canLeaveAcquisition()) void handoff(event.data);
  });
  performOpenFindHandoff = handoff;
  const params = new URLSearchParams(location.search);
  if (params.get('openfindWork')) {
    const payload = { customerId: params.get('openfindCustomer'), workId: params.get('openfindWork'), signalId: params.get('openfindSignal'), intent: params.get('openfindIntent') };
    history.replaceState(null, '', location.pathname);
    pendingOpenFindHandoff = payload;
  }
  initNativeWorkMedia({getWorks:()=>rows('works'),refresh:refreshOpenFindWork});
  initOpenFindUI({getBusiness:()=>businessId,setWorkspace:ctx.setWorkspace,render:renderCommerceUI,renderBackground:()=>renderCommerceUI(true),toast:ctx.toast});
  initWechatUI({render:renderCommerceUI,setWorkspace:space=>ctx.setWorkspace(space)});
  initHostedUI({businessId:()=>businessId,toast:message=>ctx.toast(message),refresh:browserRefresh,render:renderCommerceUI});
  document.body.addEventListener('keydown',event=>{
    const tab=event.target.closest('[data-cm="discovery-tab"]');
    if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=['works','needs','search'],index=tabs.indexOf(tab.dataset.id);
    const next=event.key==='Home'?'works':event.key==='End'?'search':tabs[(index+(event.key==='ArrowRight'?1:2))%3];
    discoveryTabs.set(businessId,next);renderCommerceUI();document.querySelector(`[data-cm="discovery-tab"][data-id="${next}"]`)?.focus();
  });
  document.body.addEventListener('change',e=>{const field=e.target,form=field.closest('[data-cm-form]');if(form?.dataset.cmForm==='sales-document'&&field.name==='productId'){form.querySelector('[name=skuId]').innerHTML=opts([['','产品所有规格通用'],...rows('skus').filter(s=>s.productId===field.value&&s.status==='active').map(s=>[s.id,s.name])],'');}if(form&&field.name==='skuIds'&&field.checked){const sku=rows('skus').find(s=>s.id===field.value);const parent=[...form.querySelectorAll('[name=productIds]')].find(p=>p.value===sku?.productId);if(parent)parent.checked=true;}if(form&&field.name==='productIds'&&!field.checked)for(const el of form.querySelectorAll('[name=skuIds]'))if(rows('skus').some(s=>s.id===el.value&&s.productId===field.value))el.checked=false;if(e.target.matches('[data-cm-business]')){if(e.target.value!==businessId&&!canLeaveAcquisition()){e.target.value=businessId;return;}stash();businessId=e.target.value;ctx.setBusiness?.(businessId);targetId=workId=contactId=opId=editProduct=editSku='';renderCommerceUI();}});
  document.body.addEventListener('submit',async e=>{
    const f=e.target.closest('[data-cm-form]');if(!f)return;e.preventDefault();if(f.dataset.busy)return;
    const fd=new FormData(f),value=Object.fromEntries(fd);for(const name of ['productIds','skuIds','signalIds','assetIds','referenceWorkIds'])value[name]=fd.getAll(name);
    if(value.baseRevision)value.baseRevision=Number(value.baseRevision);value.confirmed=fd.has('confirmed');
    const action=f.dataset.cmForm, cId=f.dataset.business||f.dataset.key.split(':')[0],payload={...value,customerId:cId,id:f.dataset.id||undefined};
    const l=rows('leads').find(l=>l.id===contactId),op=rows('opportunities').find(o=>o.id===opId);
    const btn=e.submitter,label=btn?.textContent;let notification='';f.dataset.busy='true';busy++;if(btn){btn.disabled=true;btn.textContent='处理中…';}f.querySelector('.cm-error').textContent='';
    try{
      if(action==='discovery-filter'){discoveryPages.delete(cId);discoveryFilters.set(cId,{query:value.query,platform:value.platform,type:value.type,sort:value.sort});}
      else if(action==='openfind-import'){
        let raw=value.json?.trim();const file=fd.get('file');
        if(!raw&&file?.size){if(file.size>1800000)throw new Error('文件超过 1.8 MB，请分批导出');raw=await file.text();}
        if(!raw)throw new Error('请选择文件或粘贴 JSON');
        await api('openfind-import',{customerId:cId,kind:value.kind,source:value.source,data:JSON.parse(raw)});
      }
      else if(action.startsWith('delivery-')){if(action==='delivery-asset'){const data=new FormData();data.append('customerId',cId);data.append('file',fd.get('file'));const r=await fetch('/api/delivery/asset',{method:'POST',body:data}),v=await r.json();if(!r.ok)throw new Error(v.error||'上传失败');}else await deliveryApi(action==='delivery-identity'?'identity':action==='delivery-rule'?'rule':'queue',{...payload,kind:action==='delivery-publish'?'publish':payload.kind});delivery=await deliveryApi();if(['delivery-publish','delivery-send'].includes(action))deliveryTab='jobs';browserPoll=setTimeout(browserRefresh,3000);}
      else if(action==='browser-account'){await api('account',payload);}
      else if(action==='browser-collect'){await browserApi('collect',payload);browserState=await browserApi();browserPoll=setTimeout(browserRefresh,3000);}
      else if(['product','sku','business','target','work','opportunity','handoff','resume','sales-document'].includes(action)){
        if(['opportunity'].includes(action)&&!rows('opportunities').some(o=>o.id===payload.id))delete payload.id;
        if(['handoff','resume'].includes(action))payload.opportunityId=f.dataset.id;
        await api('commerce',{...payload,action});
        if(action==='opportunity')opId=payload.id||rows('opportunities').filter(o=>o.leadId===payload.leadId).at(-1)?.id||'';
        if(action==='business'){businessId=ws().usingId;ctx.setBusiness?.(businessId);}
      }else if(action==='comments'){
        const work=rows('works').find(w=>w.id===value.workId),items=JSON.parse(value.json);
        if(!Array.isArray(items))throw new Error('请提供 JSON 数组');
        await api('import',{customerId:cId,workId:work.id,source:value.source,rows:items.map(r=>({...r,platform:work.platform}))});
      }else if(action==='review'){await api('review',{signalId:f.dataset.id,action:value.action,note:value.note,leadId:value.leadId||undefined,publicationId:value.publicationId||undefined,sourceQuote:value.sourceQuote,sourceAuthorName:value.sourceAuthorName,sourceAuthorId:value.sourceAuthorId,sourceVerified:value.sourceVerified});if(value.action==='exclude')topicPools.delete(cId);}
      else if(action==='signal-publication')await api('signal-publication',{signalId:f.dataset.id,publicationId:value.publicationId||undefined,action:value.action,note:value.note,confirmed:value.confirmed});
      else if(action==='publication-review'){await api('publication-review',{customerId:cId,publicationId:f.dataset.id,expectedUrl:value.expectedUrl,expectedPublishedAt:value.expectedPublishedAt,expectedAccountId:value.expectedAccountId,note:value.note,confirmed:value.confirmed});notification='已记录人工回看，不会自动创建线索';}
      else if(action==='live-source')await api('live-source',{leadId:value.leadId,messageId:f.dataset.id,liveSource:value.liveSource,expectedLiveSource:value.expectedLiveSource,note:value.note,confirmed:value.confirmed});
      else if(action==='publication-source')await api('publication-source',{leadId:value.leadId,messageId:f.dataset.id,publicationId:value.publicationId,expectedPublicationId:value.expectedPublicationId,note:value.note,confirmed:value.confirmed});
      else if(action==='demand-topic'){await api('demand-topic',{customerId:cId,leadId:value.leadId,kind:value.kind,evidenceId:value.evidenceId,topic:value.topic,confirmed:value.confirmed});topicPools.delete(cId);notification='已保存匿名选题，可在内容获客中采用';}
      else if(action==='demand-topic-revise'){await api('demand-topic-revise',{customerId:cId,leadId:value.leadId,topicId:f.dataset.id,expectedTitle:value.expectedTitle,action:e.submitter?.dataset.operation,topic:value.topic,removeDirection:fd.has('removeDirection'),confirmed:value.confirmed});topicPools.delete(cId);notification='选题已更新，请在内容获客中检查';}
      else if(action==='radar-hook'){const response=await fetch('/api/radar-hook-save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,workId:f.dataset.id,text:value.text,basis:value.basis,version:Number(value.version)})}),result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败');ctx.setWorkspace(result.workspace);radarHookNotices.delete(`${cId}:${f.dataset.id}`);notification='开头已保存，后续创作会检查资料是否变化';}
      else if(action==='radar-import'){const response=await fetch('/api/radar-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,platform:value.platform,text:value.text})}),result=await response.json();if(!response.ok)throw new Error(result.error||'导入失败');ctx.setWorkspace(result.workspace);notification=`已导入 ${result.added} 条，重复 ${result.duplicates} 条`; }
      else if(action==='owned-csv-preview'){
        let raw=typeof value.csv==='string'?value.csv.trim():'';const file=fd.get('file');if(!raw&&file?.size){if(file.size>1000000)throw new Error('文件不能超过 1 MB');raw=await file.text();}if(!raw)throw new Error('请选择文件或粘贴 CSV');
        const found=previewAccountCsv(raw,ws().acquisition?.publications||[],cId),carryExisting=fd.has('carryExisting'),c=ws().customers.find(c=>c.id===cId);for(const r of found){const pub=(ws().acquisition?.publications||[]).find(p=>p.id===r.publicationId),previous=carryExisting?priorPublicationOutcome(c,pub,value.start,value.end):null;if(previous&&!previous.id)r.errors.push('旧记录缺少标识，不能沿用');r.priorId=previous?.id||'';r.carried=carriedCsvMetrics(previous,r.metrics);r.priorSources=Object.fromEntries(Object.keys(r.carried).map(k=>[k,previous.metricSources?.[k]||previous.source]));try{r.criteria=csvCriteria(previous,r.metrics,r.carried,value.criteria);}catch(error){r.errors.push(error.message);}}accountCsvPreviews.set(cId,{rows:found,start:value.start,end:value.end,source:value.source,carryExisting});notification='已生成预览，请核对匹配作品';
      }
      else if(action==='owned-csv-confirm'){
        const preview=accountCsvPreviews.get(cId);if(!preview || preview.rows.some(r=>r.errors.length))throw new Error('预览已失效，请重新检查');
        const records=preview.rows.map(r=>({publicationId:r.publicationId,version:r.version,revision:r.revision,accountId:r.accountId,url:r.url,metrics:r.metrics,criteria:r.criteria||'',priorId:r.priorId||'',start:preview.start,end:preview.end,source:preview.source}));
        const response=await fetch('/api/owned-outcomes-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,confirmed:value.confirmed,carryExisting:preview.carryExisting,rows:records})}),result=await response.json();if(!response.ok)throw new Error(result.error||'导入失败');ctx.setWorkspace(result);accountCsvPreviews.delete(cId);notification=`已保存 ${records.length} 条效果快照`;
      }
      else if(action==='review-account')await api('account',{customerId:cId,name:value.name,platform:value.platform});
      else if(action==='account-review-memory'){
        const selection=JSON.parse(value.selection),c=ws().customers.find(c=>c.id===cId),group=comparableOutcomes(c).find(g=>g.accountId===selection.accountId && g.platform===selection.platform && g.start===selection.start && g.end===selection.end);
        if(!group || !globalThis.crypto?.subtle)throw new Error('无法校验当前对照，请刷新页面后重试');
        if(value.basis!==comparisonEvidence(group))throw new Error('对照数据已变化，请核对新数据与输入框中的假设，再点击「我已重新核对当前对照」后保存');
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.basis)),fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
        const response=await fetch('/api/account-review-memory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,selection,fingerprint,text:value.text})}),result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败');ctx.setWorkspace(result);notification='已采用为创作记忆，可查看依据或停用';
      }
      else if(action==='retire-account-memory'){
        const response=await fetch('/api/creator-memory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,action:'retire',memoryId:f.dataset.id})}),result=await response.json();if(!response.ok)throw new Error(result.error||'停用失败');ctx.setWorkspace(result);notification='记忆已停用';
      }
      else if(action==='owned-publication' || action==='owned-correct' || action==='owned-outcome'){
        const metrics=Object.fromEntries(Object.keys(METRICS).filter(k=>value[`metric-${k}`]!=='' && value[`metric-${k}`]!==undefined).map(k=>[k,Number(value[`metric-${k}`])]));
        const body=action==='owned-publication'?{customerId:cId,accountId:value.accountId,title:value.title,body:value.body,url:value.url,publishedAt:value.publishedAt,confirmed:value.confirmed}:action==='owned-correct'?{customerId:cId,publicationId:f.dataset.id,accountId:value.accountId,version:Number(value.version),title:value.title,body:value.body,url:value.url,publishedAt:value.publishedAt,confirmed:value.confirmed}:{customerId:cId,publicationId:f.dataset.id,start:value.start,end:value.end,source:value.source,criteria:value.criteria,note:value.note,metrics};
        const response=await fetch(action==='owned-publication'?'/api/owned-publication':action==='owned-correct'?'/api/owned-publication-correct':'/api/owned-publication-outcome',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();if(!response.ok)throw new Error(result.error||'记录失败');ctx.setWorkspace(result);notification=action==='owned-publication'?'已登记作品，平台归属仍需自行核对':action==='owned-correct'?'作品信息已更正，历史效果快照保留':'效果记录已保存';
      }
      else if(action==='calendar-schedule'){
        const item=JSON.parse(value.item), isLive=item.kind==='live';
        const body=isLive?{customerId:cId,packId:item.packId,platform:item.platform,index:item.index,version:item.version,time:value.time}:{customerId:cId,packId:item.packId,keys:item.keys,expectedStatus:item.status,expectedDate:item.date,plannedAt:value.time};
        const response=await fetch(isLive?'/api/live-schedule':'/api/content-schedule',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
        if(!response.ok)throw new Error(result.error||'排期保存失败');if(isLive)reconcileLiveScheduleInput(cId,item.packId,item.platform,item.index,item.time);ctx.setWorkspace(isLive?result:result.workspace);notification=value.time?'排期已保存':'已取消排期';
      }
      else if(action==='topic-plan'){
        const response=await fetch('/api/topic-board',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,action:value.action,version:Number(value.version)})}),result=await response.json();if(!response.ok)throw new Error(result.error||'选题保存失败');ctx.setWorkspace(result.workspace);topicBoardStates.set(cId,{...(topicBoardStates.get(cId)||{}),bucket:value.bucket||result.workspace.customers.find(c=>c.id===cId)?.topicBoard?.find(p=>p.id===payload.id)?.bucket||'parked',page:0});notification='选题已保存，可安排本周或生成制作稿';
      }
      else if(action==='production-create'){
        const response=await fetch('/api/production-create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,title:value.title,platform:value.platform})}),result=await response.json();if(!response.ok)throw new Error(result.error||'新建失败');ctx.setWorkspace(result.workspace);openProductionEditor(cId,result.packId,value.platform);await ctx.openContent(cId,result.packId);
      }
      else if(action==='generate'){
        const current=ws().customers.find(c=>c.id===f.dataset.id);
        if(current?.job)throw new Error('已有生成任务正在运行，请稍候');
        if(value.goal!==growthGoal(current)){const gr=await fetch('/api/growth-goal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:f.dataset.id,goal:value.goal,criteria:current?.growthCriteria||''})});const saved=await gr.json();if(!gr.ok)throw new Error(saved.error||'目标保存失败');ctx.setWorkspace(saved);}
        const r=await fetch('/api/today',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,customerId:f.dataset.id})}),s=await r.json();if(!r.ok)throw new Error(s.error||'生成失败');ctx.setWorkspace(s);ctx.watchJob(f.dataset.id);
      }else if(action==='content-review'){
        const c=ws().customers.find(c=>c.id===cId),pack=[...(c.drops||[]),...(c.packs||[])].find(p=>p.id===f.dataset.id);
        await api('commerce',{...payload,action,packId:pack.id,scopeHash:pack.productReview.currentHash,contentHash:pack.productReview.contentHash});
      }else if(action==='outreach')await api('outreach',{...payload,opportunityId:f.dataset.id});
      else if(action==='inquiry')await api('inquiry',{...payload,opportunityId:f.dataset.id,leadId:l.id,platform:l.platform,authorId:l.authorId,authorName:l.authorName});
      else if(action==='manual-draft')await api('lead',{...payload,action:'draft',opportunityId:f.dataset.id,leadId:l.id});
      else if(action==='intent-track'){await api('lead',{...payload,action:'intent-track',leadId:f.dataset.id});if(f.elements.status.value!==value.status || f.elements.note.value!==value.note){const nextRevision=String(value.baseRevision+1);f.elements.baseRevision.value=nextRevision;const pending=drafts.get(f.dataset.key);if(pending?.values)pending.values.baseRevision=nextRevision;ctx.toast('已保存提交时的进展；后续修改仍在表单中，请再次保存');return;}}
      else if(action==='contact-followup')await api('lead',{...payload,action:'update',leadId:f.dataset.id});
      else if(action==='resume-contact')await api('lead',{...payload,action:'resume-agent',leadId:f.dataset.id});
      else if(['sent','block','unblock'].includes(action))await api('lead',{...payload,action,leadId:l.id,messageId:action==='sent'?f.dataset.id:undefined});
      drafts.delete(f.dataset.key);const detail=f.closest('[data-cm-detail]');if(detail){detail.open=false;openDetails.delete(detail.dataset.cmDetail);}f.remove();ctx.toast(notification || (action==='discovery-filter'?'已更新筛选':action==='outreach'?'已开始起草，尚未发送':action==='generate'?'正在生成内容':'已保存'));
    }catch(error){f.querySelector('.cm-error').textContent=error instanceof SyntaxError?'JSON 格式不正确，请核对后重试':error.message;}
    finally{busy--;delete f.dataset.busy;if(btn){btn.disabled=false;btn.textContent=label;}}
    if(!f.isConnected){renderCommerceUI();ctx.render();if(action==='outreach')refresh();}
  });
  document.body.addEventListener('click',async e=>{
    const b=e.target.closest('[data-cm]');if(!b||b.disabled)return;stash();const act=b.dataset.cm,id=b.dataset.id;
    if(act.startsWith('topic-board-')||act==='collect-topic'){
      const customerId=businessId,state=topicBoardStates.get(customerId)||{},operation=act.slice('topic-board-'.length);
      if(operation==='reload'){const f=b.closest('[data-cm-form]');try{const response=await fetch('/api/acquisition'),result=await response.json();if(!response.ok)throw new Error(result.error||'重新载入失败');ctx.setWorkspace(result.workspace);drafts.delete(f.dataset.key);f.remove();renderCommerceUI();}catch(error){f.querySelector('.cm-error').textContent=error.message;}return;}
      if(operation==='filter'||operation==='page'){topicBoardStates.set(customerId,{...state,...(operation==='filter'?{bucket:id,page:0}:{page:Math.max(0,Number(id)||0)})});renderCommerceUI();return;}
      if(state.busy)return;
      topicBoardStates.set(customerId,{...state,busy:true,notice:'正在处理选题…'});renderCommerceUI();
      try{const payload=act==='collect-topic'?{action:'create',kind:'pool',sourceKey:id,bucket:'parked'}:{action:operation,id,version:Number(b.dataset.version),basis:b.dataset.basis,bucket:b.dataset.bucket};
        if(operation==='generate-week')payload.selection=(customer()?.topicBoard||[]).filter(p=>p.bucket==='now').map(p=>({id:p.id,basis:p.basis}));
        const response=await fetch(['generate','generate-week','generate-new'].includes(payload.action)?'/api/topic-board/generate':'/api/topic-board',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,customerId})}),result=await response.json();if(!response.ok)throw new Error(result.error||'选题操作未完成');ctx.setWorkspace(result.workspace);
        const results=result.results||[],notice=results.length?results.map(r=>r.error?'未完成：'+r.error+(r.packId?'；制作稿已保留，可打开后重试':''):'制作建议已保存，请打开制作稿核对'+(r.warnings?.length?'；'+r.warnings.join('；'):'')).join('；'):result.notice||'选题安排已保存';
        topicBoardStates.set(customerId,{...state,busy:false,page:0,bucket:results.some(r=>r.packId)?'drafts':act==='collect-topic'?'parked':payload.bucket||state.bucket||'now',notice});
      }catch(error){topicBoardStates.set(customerId,{...state,busy:false,notice:error.message});}finally{renderCommerceUI();}return;
    }
    if(act==='owned-review-export'){
      const payload={version:1,exportedAt:new Date().toISOString(),business:customer().name,publications:rows('publications').filter(p=>p.origin==='manual_external'),outcomes:customer().accountReviewOutcomes || []};
      const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='harta-own-account-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(act==='calendar-week'){calendarOffset=id==='0'?0:Math.max(-520,Math.min(520,calendarOffset+Number(id)));renderCommerceUI();return;}
    if(act==='owned-csv-cancel'){accountCsvPreviews.delete(businessId);renderCommerceUI();return;}
    if(act==='carry-owned-outcome'){
      try{const f=b.closest('form'),snapshot=(customer().accountReviewOutcomes||[]).find(r=>isRealEvidence(r)&&r.publicationId===id),pub=rows('publications').find(p=>p.id===id);if(snapshot && (snapshot.publicationVersion||1)!==(pub?.metadataVersion||1))throw new Error('作品信息已更正，请重新核对并手工填写');if(!f)throw new Error('找不到效果表单');const current=Object.fromEntries(new FormData(f));const values=carryOutcome(snapshot,current,{metricPrefix:'metric-'});for(const [key,value] of Object.entries(values)){const el=f.elements.namedItem(key);if(el){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}f.querySelector('.cm-error').textContent='已填入空白项，请核对日期、来源和口径后保存。';}catch(error){ctx.toast(error.message);}return;
    }
    if(act==='demand-page'){const page=Number(id);if(Number.isSafeInteger(page)&&page>=0){demandPages.set(businessId,page);renderCommerceUI();}return;}
    if(act==='content-pack-page'){const page=Number(id);if(Number.isSafeInteger(page)&&page>=0){contentPackPages.set(businessId,page);renderCommerceUI();}return;}
    if(act==='reference-page'){const page=Number(id);if(Number.isSafeInteger(page)&&page>=0){referencePages.set(businessId,page);renderCommerceUI();}return;}
    if(act==='followup-page'){const page=Number(id);if(Number.isSafeInteger(page)&&page>=0){followupPages.set(businessId,page);renderCommerceUI();}return;}
    if(act.startsWith('platform-')){
      b.disabled=true;const popup=act==='platform-connect'&&id==='douyin'?window.open('about:blank','_blank'):null;
      if(popup)popup.opener=null;
      try{
        if(act==='platform-connect'){
          clearTimeout(authTimer);
          if(authFlow&&['pending','scanned','exchanging'].includes(authFlow.status))await platformAuthApi('cancel',{id:authFlow.id});
          authFlow=await platformAuthApi('start',{platform:id,customerId:businessId});
          if(popup)popup.location.replace(authFlow.authorizeUrl);
          authTimer=setTimeout(pollAuth,(authFlow.interval||3)*1000);
        }else if(act==='platform-cancel'){clearTimeout(authTimer);const result=await platformAuthApi('cancel',{id});authFlow={...authFlow,...result};}
        else if(act==='platform-disconnect'){await platformAuthApi('disconnect',{id});await browserRefresh();}
      }catch(e){popup?.close();ctx.toast(e.message);}finally{b.disabled=false;}renderCommerceUI();return;
    }
    if(act.startsWith('execution-')){deliveryTab=act.slice(10);ctx.nav('delivery');renderCommerceUI();return;}
    if(act.startsWith('delivery-')){try{if(act==='delivery-cancel')await deliveryApi('cancel',{jobId:id});if(act==='delivery-pause'){const rule=delivery.rules.find(r=>r.id===id);await deliveryApi('rule',{id,connectionId:rule.connectionId,action:'pause'});}await browserRefresh();}catch(e){ctx.toast(e.message);}return;}
    if(act.startsWith('browser-')){b.disabled=true;try{if(act==='browser-pair')pairing={...await browserApi('pair',{accountId:id}),customerId:businessId};else if(act==='browser-revoke')await browserApi('revoke',{connectionId:id});else if(act==='browser-cancel')await browserApi('cancel',{jobId:id});else if(['browser-contact','browser-message'].includes(act)){contactPreview={...await browserApi('contact',{leadId:act==='browser-contact'?id:contactId,messageId:act==='browser-message'?id:undefined,channel:'私信'}),customerId:businessId};}await browserRefresh();}catch(e){ctx.toast(e.message);}finally{b.disabled=false;}renderCommerceUI();return;}
    if(act==='suggest-manual'){
      const f=b.closest('form'),field=f.querySelector('[name=text]'),before=manualDraftScope(f),cId=businessId,currentLead=contactId;
      b.disabled=true;try{const r=await api('suggestion',{leadId:currentLead,opportunityId:id,accountId:f.querySelector('[name=accountId]').value||undefined,channel:f.querySelector('[name=channel]').value});if(businessId!==cId||contactId!==currentLead||!field.isConnected||manualDraftScope(f)!==before){ctx.toast('草稿已生成，但当前输入已改变，请按最新内容重试');return;}field.value=r.text;stash();ctx.toast(r.basis);}catch(e){ctx.toast(e.message);}finally{b.disabled=false;}return;
    }
    if(['load-topics','topic-page','topic-status','use-topic','skip-topic','reset-topic'].includes(act)){
      const cId=businessId,current=topicPools.get(cId),decision={'use-topic':'use','skip-topic':'skip','reset-topic':'reset'}[act],status=act==='topic-status'?id:(current?.status||'候选'),page=act==='topic-page'?Number(id):decision?(current?.page||0):0;b.disabled=true;
      try{const r=await fetch(decision?'/api/topic-decide':'/api/topic-pool',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,page,status,...(decision?{key:id,action:decision,expectedStatus:current?.status||'候选'}:{})})});const value=await r.json();if(!r.ok)throw new Error(value.error||'选题读取失败');topicPools.set(cId,value.pool);ctx.setWorkspace(value.workspace);if(businessId===cId&&act==='use-topic')await ctx.openContent(cId);renderCommerceUI();}catch(e){ctx.toast(e.message);}finally{b.disabled=false;}return;
    }
    if(act==='use-account-suggestion' || act==='refresh-account-evidence'){
      const f=b.closest('[data-cm-form=account-review-memory]');if(!f)return;
      const selection=JSON.parse(f.elements.selection.value),group=comparableOutcomes(customer()).find(g=>g.accountId===selection.accountId && g.platform===selection.platform && g.start===selection.start && g.end===selection.end);
      const error=f.querySelector('.cm-error');
      if(!group){error.textContent='当前对照已不可用，请补充数据后重新查看';return;}
      if(act==='refresh-account-evidence'){f.elements.basis.value=comparisonEvidence(group);error.textContent='';ctx.toast('已按当前对照更新依据，请核对假设后保存');return;}
      if(f.elements.basis.value!==comparisonEvidence(group)){error.textContent='对照数据已变化，请核对新数据，再点击「我已重新核对当前对照」';return;}
      const suggestion=accountReviewSuggestions(group).find(s=>s.id===id);if(!suggestion)return;
      f.elements.text.value=suggestion.hypothesis;error.textContent='';f.elements.text.focus();ctx.toast('已填入待验证建议，修改并保存后才会用于创作');return;
    }
    if(act==='calendar-topics'){document.getElementById('content-tab-ideas')?.click();document.getElementById('topic-board')?.scrollIntoView({block:'start'});return;}
    if(act==='content-tab'){
      if(!['library','schedule','review','ideas'].includes(id))return;
      const previous=document.querySelector('.cm-content-tab-panel:not([hidden])'),bar=document.querySelector('.cm-content-tabs'),scrolled=previous && bar && previous.getBoundingClientRect().top<bar.getBoundingClientRect().bottom-4;
      contentTabs.set(businessId,id);
      document.dispatchEvent(new CustomEvent('harta-content-tab',{detail:id}));
      document.querySelectorAll('[data-content-tab]').forEach(tab=>{const selected=tab.dataset.contentTab===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
      document.querySelectorAll('.cm-content-tab-panel').forEach(panel=>panel.hidden=panel.id!==`content-panel-${id}`);
      document.getElementById(`content-tab-${id}`)?.focus({preventScroll:true});if(scrolled)document.getElementById(`content-panel-${id}`)?.scrollIntoView({block:'start'});return;
    }
    if(act==='new-business'){openDetails.add(`${businessId}:business-new`);openDetails.add(`${businessId}:business-support`);ctx.nav('workbench');renderCommerceUI();const f=document.querySelector('#cm-workbench [data-cm-form=business]');if(f){const detail=f.closest('[data-cm-detail]');if(detail)detail.open=true;const support=f.closest('.cm-support');if(support)support.open=true;f.scrollIntoView({block:'center'});f.querySelector('input')?.focus();}return;}
    if(act==='read-current'){const key=`${businessId}:collect-${workId?'comments':'works'}-${workId||targetId}`;openDetails.add(key);renderCommerceUI();const detail=[...document.querySelectorAll('#cm-prospecting [data-cm-detail]')].find(d=>d.dataset.cmDetail===key);detail?.scrollIntoView({block:'center',behavior:'smooth'});return;}
    if(act==='discovery-tab'){discoveryTabs.set(businessId,id);renderCommerceUI();return;}
    if(act==='discovery-page'){discoveryPages.set(businessId,Math.max(0,Number(id)||0));renderCommerceUI();document.querySelector('.cm-discovery-heading')?.scrollIntoView({block:'start'});return;}
    if(act==='clear-discovery'){discoveryPages.delete(businessId);discoveryFilters.delete(businessId);drafts.delete(`${businessId}:discovery-filter:`);document.querySelector('#cm-prospecting [data-cm-form=discovery-filter]')?.remove();renderCommerceUI();document.querySelector('#cm-prospecting [data-cm-form=discovery-filter] [name=query]')?.focus({preventScroll:true});return;}
    if(act==='radar-hook-generate'){
      const key=`${businessId}:${id}`,form=b.closest('details')?.querySelector('[data-cm-form=radar-hook]');if(!form||radarHookGenerating.has(key))return;
      const initial=form.elements.text.value,customerId=businessId;radarHookGenerating.add(key);b.disabled=true;
      try{const response=await fetch('/api/radar-hook-generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId,workId:id})}),result=await response.json();if(!response.ok)throw new Error(result.error||'生成失败');
        if(!form.isConnected || businessId!==customerId || form.elements.text.value!==initial)throw new Error('生成期间页面或开头已变化，请重新生成');
        form.elements.text.value=result.hook;form.elements.basis.value=result.basis;form.elements.version.value=String(result.version);radarHookNotices.set(key,result.warnings?.length?result.warnings.join('；'):'AI 建议尚未保存；请修改、核对后保存。');renderCommerceUI();
      }catch(error){ctx.toast(error.message);}finally{radarHookGenerating.delete(key);b.disabled=false;}return;
    }
    if(act==='reference-work'){
      const work=rows('works').find(w=>w.id===id);if(!work)return;
      await ctx.openContent(businessId);
      openDetails.add(`${businessId}:create-content`);openDetails.add(`${businessId}:content-references`);
      restore();
      const f=document.querySelector('#cm-content-scope [data-cm-form=generate]');
      if(f){for(const el of f.querySelectorAll('[name=referenceWorkIds]'))el.checked=el.value===id;stash();f.scrollIntoView({block:'center'});}
      return;
    }
    if(act==='comment-insights'){if(canLeaveAcquisition())ctx.openLegacy(businessId,'insights');return;}
    if(act==='import-needs'){if(canLeaveAcquisition())ctx.openLegacy(businessId,'import');return;}
    if(act==='public-search'){if(canLeaveAcquisition())ctx.openLegacy(businessId,'search');return;}
    if(act.startsWith('go-')){if(act==='go-content-home')setContentWorkspaceTab('library');ctx.nav(act.slice(3));}
    else if(act==='select-target'){targetId=id;workId='';}
    else if(act==='open-video')workId=id;
    else if(act==='sales-record'){openAcquisitionPage('followup',{lead:id});}
    else if(act==='open-source'){const w=rows('works').find(w=>w.id===id);if(w){workId=id;targetId=w.targetId;ctx.nav('prospecting-archive');const signalId=b.dataset.signal;if(signalId){const comment=[...document.querySelectorAll('#cm-prospecting [data-signal-id]')].find(el=>el.dataset.signalId===signalId);if(comment){comment.scrollIntoView({block:'center'});comment.focus({preventScroll:true});}else ctx.toast('已打开来源作品；原评论当前不可用');}}return;}
    else if(act==='back-videos')workId='';
    else if(act==='select-product'){editProduct=id;editSku='';}
    else if(act==='select-sku'){const s=rows('skus').find(s=>s.id===id);editProduct=s.productId;editSku=id;}
    else if(act==='add-sku'){editProduct=id;editSku='new';}
    else if(act==='new-product')editProduct=editSku='';
    else if(act==='open-publication-review'){contentTabs.set(businessId,'review');openDetails.add(`${businessId}:publication-review-${id}`);ctx.nav('content-home');renderCommerceUI();const item=[...document.querySelectorAll('#cm-content-home [data-cm-detail]')].find(el=>el.dataset.cmDetail===`${businessId}:publication-review-${id}`);if(item){item.open=true;item.scrollIntoView({block:'center'});}return;}
    else if(act==='open-contact'){contactId=id;opId='';ctx.nav('conversations');}
    else if(act==='open-contact-history'){contactId=id;ctx.openLegacyLead(businessId,id);}
    else if(act==='select-op')opId=id;
    else if(act==='open-need'){const o=rows('opportunities').find(o=>o.id===id);if(o){opId=o.id;contactId=o.leadId;ctx.nav('conversations');}}
    else if(act==='open-live'){
      const target=liveSources(customer()).find(item=>item.id===id);
      if(!target){ctx.toast('直播场次已变化，请刷新后重试');return;}
      await openLiveProduction(target);return;
    }
    else if(act==='duplicate-live'){
      const cId=businessId;b.disabled=true;
      try {
        const [packId,platform,index,version]=JSON.parse(id);
        const response=await fetch('/api/live-duplicate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:cId,packId,platform,index,version})}),result=await response.json();
        if(!response.ok)throw new Error(result.error||'无法复制直播场次');
        ctx.setWorkspace(result.workspace);if(businessId!==cId){ctx.toast('新直播场次已创建，请回到原业务查看');return;}
        await openLiveProduction({packId:result.packId,platform:result.platform,index:result.index});ctx.toast('已创建新场次，请填写时间并核对脚本');
      }catch(error){ctx.toast(error.message);}finally{b.disabled=false;}return;
    }
    else if(act==='review-home'){ctx.nav('account-review');return;}
    else if(act==='calendar-home'){setContentWorkspaceTab('schedule');ctx.nav('content-home');return;}
    else if(['content','content-feed','content-platform','write-product','open-pack','creator-profile','contact-entry','creation-standards'].includes(act)){
      if(!await ctx.openContent(businessId,act==='open-pack'?id:''))return;
      if(act==='open-pack'){openDetails.delete(`${businessId}:create-content`);restore();document.querySelector('[data-workspace-view=content]')?.click();const editor=document.querySelector('[data-production-editor]');if(editor){editor.open=true;editor.scrollIntoView({block:'start'});}}
      if(['creator-profile','contact-entry','creation-standards'].includes(act)){
        document.querySelector('[data-workspace-view=research]')?.click();
        const preferences=document.getElementById('growth-edit-panel'),profile=document.querySelector(act==='creation-standards'?'[data-creation-standards]':'[data-creator-profile]');
        if(preferences)preferences.open=true;if(profile){profile.open=true;profile.scrollIntoView({block:'start'});profile.querySelector('summary')?.focus({preventScroll:true});if(act==='contact-entry'){const entry=profile.querySelector('[name=profile-contactEntry]');entry?.closest('section')?.scrollIntoView({block:'center'});entry?.focus({preventScroll:true});}}return;
      }
      if(['content','content-feed','content-platform'].includes(act)){openDetails.add(`${businessId}:create-content`);restore();const creation=document.querySelector('#cm-content-scope [data-cm-form=generate]');creation?.closest('details')?.scrollIntoView({block:'start'});if(act!=='content' && creation?.elements.creationEntry){creation.elements.creationEntry.value=act==='content-feed'?'feed':'platform';creation.elements.creationEntry.dispatchEvent(new Event('change',{bubbles:true}));stash();}creation?.querySelector('select')?.focus({preventScroll:true});}
      if(act==='write-product'){openDetails.add(`${businessId}:create-content`);openDetails.add(`${businessId}:content-products`);const key=`${businessId}:generate:${businessId}`;drafts.set(key,{values:{},checks:[...document.querySelectorAll('#cm-content-scope input[type=checkbox]')].map(el=>[el.name,el.value,el.name==='productIds'&&el.value===id])});restore();}
    }else if(act==='knowledge'){await ctx.openContent(businessId);document.querySelector('[data-workspace-view=materials]')?.click();}
    else if(act==='reports')ctx.nav('pack');
    else if(act==='new-inquiry')ctx.openLegacy(businessId,'inquiry');
    else if(act==='new-live-inquiry')ctx.openLegacy(businessId,'live-inquiry',id);
    else if(act==='new-publication-inquiry')ctx.openLegacy(businessId,'publication-inquiry',id);
    else if(act==='old-leads')ctx.openLegacyLead(businessId,contactId);
    else if(['legacy','search','accounts'].includes(act))ctx.openLegacy(businessId,act);
    else if(act==='copy-message'){
      const lead=rows('leads').find(l=>l.id===contactId),m=lead.messages.find(m=>m.id===id);b.disabled=true;
      try{await api('lead',{leadId:lead.id,messageId:id,action:'check-copy'});await navigator.clipboard.writeText(m.text);await api('lead',{leadId:lead.id,messageId:id,action:'copy'});ctx.toast('已复制，请在平台核对后发送');}catch(error){ctx.toast(error.message);}finally{b.disabled=false;}
    }
    renderCommerceUI();
  });
  browserRefresh();renderCommerceUI();if((data().outreachRuns||[]).some(r=>r.status==='running'))refresh();
}
