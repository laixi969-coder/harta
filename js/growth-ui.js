import {CONTENT_JOBS,contentJob} from './content-job.js';
import { productionStudio, updateProductionPreview, showProductionPanel } from './production-studio-ui.js';
import { renderStandardRules, standardRuleRow, readStandardRules } from './creation-standards-ui.js';
import { metricSourceText } from './account-csv-carry.js';
import { isRealEvidence } from './evidence-kind.js';
import { carryOutcome } from './outcome-carry.js';
import { FIELD_LABELS } from './platform-content.js';
import { GROWTH_GOALS, GROWTH_BRIEF_LABELS, METRICS, growthGoal, outcomeAssessment, interactionReview } from './growth.js';
import { PROFILE_FIELDS, evaluateCreatorProfile } from './creator-profile.js';
import { renderCreatorProfile, profileAssessmentHtml } from './creator-profile-ui.js';
import { comparableOutcomes, packOutcomes, accountMemoryCurrent, reviewMetricText, reviewPackText } from './creator-review.js';
import { CREATOR_PACKS } from './creator-play-packs.js';
import { PRODUCTION_FIELDS, productionIssues, productionDraft, missingProductionFields, productionDocument } from './production-workflow.js';
import { makeImagePages, parseImagePages, validateImagePageSet, imagePageSetWarning } from './image-pages.js';
import { packAsSent } from './pack-edits.js';
import { publicationAttributionCounts } from './publication-attribution.js';
import { referenceOverlaps } from './reference-overlap.js';
export const SIMPLE_GOALS = { reach: '让更多人看到', reach_leads: '扩大流量并获得有效线索', spread: '让更多人转发', leads: '让更多人咨询', sales: '让更多人下单' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const attrs = (customerId, pack, platform, index) => `data-growth-customer="${esc(customerId)}" data-growth-pack="${esc(pack.id)}" data-growth-platform="${esc(platform)}" data-growth-index="${index}"`;
const input = (name, label, value = '', type = 'text', maxLength = 1000) => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? `min="0" step="any" ${name==='completionRate'?'max="100"':''}` : `maxlength="${maxLength}"`}></label>`;
// Keep unsent inputs through asynchronous renders and customer/batch switches.
const postInputs = new Map();
const outcomeBaselineDrafts = new Map();
const productionPending = new Map();
const generationReviews = new Map();
const productionSaving = new Set();
const productionViews = new Map();
const productionOpened = new Set();
const titleIdeaStates = new WeakMap();
export function openProductionEditor(customerId,packId,platform,index=0,tab=''){const key=JSON.stringify([customerId,packId,platform,String(index)]);productionOpened.add(key);if(['script','cover','delivery'].includes(tab))productionViews.set(key,tab);}
const generatedCovers = new Map();
const coverGenerating = new Set();
const generatedPages = new Map();
const settingsInputs = new Map();
const settingsRendered = new WeakMap();
const inputKey = box => JSON.stringify([box.dataset.growthCustomer, box.dataset.growthPack, box.dataset.growthPlatform, box.dataset.growthIndex]);
function showProductionPages(grid,pages) {
  grid.replaceChildren(...pages.map(p=>{const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),link=document.createElement('a');img.width=900;img.height=1200;img.src=p.url;img.alt=`第${p.number}页预览`;link.className='btn ghost';link.download=`harta-page-${p.number}.png`;link.href=p.url;link.textContent=`下载第 ${p.number} 页`;caption.append(link);figure.append(img,caption);return figure;}));
}

const readCards = box => [...box.querySelectorAll('.growth-fact')].map(row => Object.fromEntries(['text','source','scope','status'].map(k => [k,row.querySelector(`[name="fact-${k}"]`).value])));
const rememberInput = field => {
  const box = field.closest('[data-growth-customer]');
  if (!box || !field.name) return;
  if (box.dataset.growthPack) {
    const key = inputKey(box), values = postInputs.get(key) || {};
    values[field.name] = field.value;
    postInputs.set(key, values);
    if(field.name.startsWith('production-')){updateProductionPreview(box);const factReview=box.querySelector('[data-production-fact-review]');if(factReview?.dataset.completed==='true'){factReview.textContent='制作内容已变化，请重新进行事实核对。';factReview.dataset.completed='false';}const craftReview=box.querySelector('[data-production-craft-review]');if(craftReview?.dataset.completed==='true'){craftReview.textContent='制作内容已变化，请重新诊断。';craftReview.dataset.completed='false';}}
    if (['production-cover','production-coverLayout'].includes(field.name)){const preview=box.querySelector('[data-ai-cover-preview]'),link=box.querySelector('[data-ai-cover-download]');if(preview)preview.hidden=true;if(link)link.hidden=true;}
    if ((field.name === 'production-cover' && generatedCovers.get(key)?.line !== field.value.trim()) || (field.name === 'production-coverLayout' && generatedCovers.get(key)?.layout != null && generatedCovers.get(key).layout !== field.value.trim()) || (field.name==='cover-template' && generatedCovers.get(key)?.template && generatedCovers.get(key).template!==field.value)) {
      generatedCovers.delete(key);
      const preview=box.querySelector('[data-ai-cover-preview]'),link=box.querySelector('[data-ai-cover-download]');
      if(preview)preview.hidden=true;if(link)link.hidden=true;
    }
    if ((['production-shots','cover-template'].includes(field.name) || (field.name==='production-live' && field.value!=='image')) && generatedPages.has(key)) {
      generatedPages.delete(key);const grid=box.querySelector('[data-page-templates]');if(grid)grid.replaceChildren();
    }
  } else {
    const key = box.dataset.growthCustomer, values = settingsInputs.get(key) || {};
    if(field.name.startsWith('standard-')){
      values.__standardVersion ??= Number(box.querySelector('[data-standard-editor]')?.dataset.version||0);
      if(field.closest('[data-standard-rule]')){values['standard-rules-json']=JSON.stringify(readStandardRules(box));settingsInputs.set(key,values);return;}
    }
    if(field.name.startsWith('profile-')) {
      const section=field.closest('[data-creator-profile]');
      const row=field.closest('[data-profile-field]');
      if(row){const draft=field.value.trim(),active=row.dataset.profileActive;row.querySelector('[data-profile-field-status]').textContent=draft===active?(active?'已采用':'待填写'):draft?'待采用':'清空待采用';}
      if(section){values.__profileBasis ||= {version:Number(section.dataset.version),draftVersion:Number(section.dataset.draftVersion)};const assessment=section.querySelector('[data-profile-assessment]');if(assessment?.textContent)assessment.textContent='输入已变化，请重新评估当前资料。';}
    }
    if (field.name.startsWith('fact-')) values.cards = readCards(box);
    else values[field.name] = field.value;
    settingsInputs.set(key, values);
  }
};
const clearSaved = (map, key, sent) => {
  const pending = map.get(key);
  if (!pending) return;
  for (const [name,value] of Object.entries(sent)) if (JSON.stringify(pending[name]) === JSON.stringify(value)) delete pending[name];
  if (!Object.keys(pending).length) map.delete(key);
};
export function reconcileLiveScheduleInput(customerId,packId,platform,index,previousTime) {
  const key=JSON.stringify([customerId,packId,platform,String(index)]);
  clearSaved(postInputs,key,{'production-liveSchedule':previousTime});
  clearSaved(productionPending,`${key}|live`,{'production-liveSchedule':previousTime});
}
const factRow = (card = {}) => `<div class="growth-fact"><label>业务事实<textarea name="fact-text" maxlength="1500" rows="2">${esc(card.text)}</textarea></label>${input('fact-source', '来源文件与位置 / 确认人', card.source,'text',500)}${input('fact-scope', '适用范围与有效期', card.scope,'text',500)}<label>状态<select name="fact-status">${[['pending','待确认'],['confirmed','我已确认'],['retired','已停用']].map(([v,l])=>`<option value="${v}" ${card.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" class="textish" data-growth-action="remove-fact">移除这条</button></div>`;
export function renderGrowthSettings(customer) {
  const container = document.getElementById('growth-settings');
  if (!container) return;
  const signature = JSON.stringify([customer.id,customer.growthGoal,customer.growthCriteria,customer.factCards,customer.factExtraction?.coverage,customer.creationStandards,customer.creationStandardsHistory,customer.creatorProfile,customer.creatorProfileDraft,customer.creatorProfileHistory,customer.creatorMemories,customer.creatorPackSettings,customer.accountReviewOutcomes,customer.drops,customer.packs]);
  if (container.dataset.customer === customer.id && settingsRendered.get(container) === signature) return;
  const openSections=container.dataset.customer===customer.id?[...container.querySelectorAll(':scope > div > details')].map(section=>section.open):[];
  settingsRendered.set(container, signature);
  container.dataset.customer = customer.id;
  const pending = settingsInputs.get(customer.id) || {};
  const comparisons = comparableOutcomes(customer);
  const packResults = packOutcomes(customer);
  const customPacks = (customer.creatorPackSettings?.custom || []).map(p=>`<p>${esc(p.name)} · ${esc(p.platform || '全平台')} · ${esc(p.form || '不限形态')} · ${esc(SIMPLE_GOALS[p.goal] || '不限目标')} · ${esc(CONTENT_JOBS[contentJob(p.job)] || '不限任务')} <button type="button" class="textish" data-growth-action="remove-pack" data-pack-id="${esc(p.id)}">移除</button></p>`).join('');
  customer = { ...customer, growthGoal: pending.goal ?? customer.growthGoal, growthCriteria: pending.criteria ?? customer.growthCriteria, factCards: pending.cards ?? customer.factCards };
  container.innerHTML = `<div data-growth-customer="${esc(customer.id)}"><label>这批内容最想带来什么？<select name="goal">${Object.entries(GROWTH_GOALS).map(([k,v])=>`<option value="${k}" ${growthGoal(customer) === k ? 'selected' : ''}>${SIMPLE_GOALS[k]}</option>`).join('')}</select></label><details><summary>补充要求（选填）</summary><label>你想吸引谁、卖什么？<textarea name="criteria" rows="2" maxlength="1000" placeholder="例如：杭州有局部翻新计划、愿意进一步沟通的业主；或明确本批想促进购买的产品。">${esc(customer.growthCriteria || '')}</textarea></label></details><button class="btn" type="button" data-growth-action="goal">保存设置</button>
  <details><summary>按账号对照作品效果</summary><p class="meta">仅比较已关联发布记录、同一账号、同平台和统计窗口的最新手工快照；有效客资仅在去重口径相同时可对照；平台完播率需核对后台定义和统计口径是否一致；未记录不等于零。发布时间和投流条件可能不同，不能据此判断原因。</p>${comparisons.length ? comparisons.map(g=>`<p><b>${esc(g.accountName)} · ${esc(g.platform)} · ${esc(g.start)} 至 ${esc(g.end)}</b><br>${g.rows.map(r=>`${esc(r.title)}：${esc(reviewMetricText(r))} · 打法：${esc(reviewPackText(r))}（${esc(r.source)}）`).join('<br>')}</p>`).join('') : '<p>暂无符合条件的同账号、同平台、同窗口对照。</p>'}</details>
  <details><summary>打法与已记录效果</summary><p class="meta">按作品展示手工记录，不把结果归因于打法，也不合并不同统计窗口。</p>${packResults.map(r=>`<p>${esc(r.name)} v${esc(r.version)}${r.attribution==='user-confirmed'?'（人工确认）':''} · ${esc(r.title)} · ${esc(r.platform)} · ${esc(r.accountName)} · ${r.publicationId?'已关联发布':'未关联发布'}<br>${esc(r.start)} 至 ${esc(r.end)}：${esc(reviewMetricText(r))} · 来源 ${esc(r.source)}</p>`).join('') || '<p>暂无带打法的效果记录。</p>'}</details>
  <details><summary>已采用的复盘记忆</summary><p class="meta">作为待验证的创作参考，不自动视为事实。对照变化后相关记忆暂停用于创作；可随时停用。</p>${(customer.creatorMemories || []).filter(m=>m.active).map(m=>`<div><p>${esc(m.text)}<br><span class="meta">${esc(m.source)}${accountMemoryCurrent(customer,m,comparisons)?'':' · 对照已变化，暂停用于创作'}</span> <button type="button" class="textish" data-growth-action="retire-memory" data-memory="${esc(m.id)}">停用</button></p>${m.kind==='account-review'?`<details><summary>保存时的数据依据</summary>${(m.evidence?.rows || []).map(r=>`<p>${esc(r.title)}：${esc(reviewMetricText(r))} · 打法：${esc(reviewPackText(r))} · ${esc(r.source)}</p>`).join('')}</details>`:''}</div>`).join('') || '<p>尚无已采用的复盘记忆。</p>'}</details>
  <details><summary>创作打法</summary><p class="meta">按平台、形态、增长目标和内容任务匹配；选择的打法不适用时自动回退。效果记录保留当时的打法，不代表因果。</p>${customPacks}<label>本业务优先使用<select name="pack-selected">${[['','自动匹配'],['off','关闭打法'],...CREATOR_PACKS.map(p=>[p.id,p.name]),...(customer.creatorPackSettings?.custom || []).map(p=>[p.id,p.name])].map(([id,name])=>`<option value="${esc(id)}" ${(pending['pack-selected'] ?? customer.creatorPackSettings?.selected ?? '')===id?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>新增打法名称<input name="pack-name" maxlength="100" value="${esc(pending['pack-name'] || '')}"></label><label>写作要求<textarea name="pack-instruction" maxlength="2000">${esc(pending['pack-instruction'] || '')}</textarea></label><label>适用平台<select name="pack-platform">${[['','不限'],['小红书','小红书'],['抖音','抖音'],['视频号','视频号'],['公众号','公众号']].map(([v,l])=>`<option value="${v}" ${pending['pack-platform']===v?'selected':''}>${l}</option>`).join('')}</select></label><label>适用形态<select name="pack-form">${[['','不限'],['guide','教程 / 清单 / 避坑'],['voice','人设 / 故事'],['image','图文'],['video','视频 / 口播'],['live','直播'],['article','文章']].map(([v,l])=>`<option value="${v}" ${pending['pack-form']===v?'selected':''}>${l}</option>`).join('')}</select></label><label>适用目标<select name="pack-goal">${[['','不限'],...Object.entries(SIMPLE_GOALS)].map(([v,l])=>`<option value="${esc(v)}" ${pending['pack-goal']===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label>适用内容任务<select name="pack-job">${[['','不限'],...Object.entries(CONTENT_JOBS)].map(([v,l])=>`<option value="${esc(v)}" ${pending['pack-job']===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label><button type="button" class="btn" data-growth-action="packs">保存打法设置</button></details>
  ${renderCreatorProfile(customer,pending)}
  <details data-creation-standards><summary>创作标准 · v${customer.creationStandards?.version || 0}</summary><p class="meta">生成时参考表达偏好；禁用词会在生成、改写和准备发布时按原文检查。修改不会自动改动旧稿或已有发布记录。</p><label>表达偏好<textarea name="standard-preferences" maxlength="3000" rows="3">${esc(pending['standard-preferences'] ?? customer.creationStandards?.preferences ?? '')}</textarea></label><label>禁用词（每行一条，精确匹配）<textarea name="standard-forbidden" maxlength="3000" rows="3">${esc(pending['standard-forbidden'] ?? (customer.creationStandards?.forbidden || []).join('\n'))}</textarea></label>${renderStandardRules(customer.creationStandards,pending)}<button class="btn" type="button" data-growth-action="standards" data-version="${customer.creationStandards?.version || 0}">保存创作标准</button>${customer.creationStandardsHistory?.length ? `<details><summary>历史版本</summary>${[...customer.creationStandardsHistory].reverse().map(s=>`<p>v${esc(s.version)} · ${esc(s.updatedAt || '初始版本')}<br>偏好：${esc(s.preferences || '无')}<br>禁用词：${esc((s.forbidden || []).join('、') || '无')}<br>${(s.rules||[]).map(r=>`${esc(r.title)} · ${r.severity==='block'?'阻止发布':'提醒'} · ${esc(r.rule)}`).join('<br>')}</p>`).join('')}</details>` : ''}</details>
  <details><summary>核对业务信息（选填）</summary><p class="meta">确认价格、服务范围和承诺，并填写来源。待确认或已停用的资料不会用于创作。</p><button class="btn ghost" type="button" data-growth-action="extract-facts">从已读资料整理待确认事实</button><p class="meta">${esc(customer.factExtraction?.coverage || '')}</p><div data-facts>${(customer.factCards || []).map(factRow).join('')}</div><div class="acts"><button class="btn ghost" type="button" data-growth-action="add-fact">增加事实</button><button class="btn" type="button" data-growth-action="facts">保存事实</button></div></details></div>`;
  container.querySelectorAll(':scope > div > details').forEach((section,index)=>{if(openSections[index])section.open=true;});
}
export function renderProduction(customerId, pack, platform, index, packSettings = {}) {
  const values = postInputs.get(JSON.stringify([customerId,pack.id,platform,String(index)])) || {};
  const key = `${platform}|${index}`;
  const current = packAsSent(pack).shells?.[platform]?.[index] || {};
  const legacy = pack.productionDrafts?.[key], mode = values['production-live'] ?? (legacy?.live ? 'live' : legacy?.format || (productionDraft(pack,platform,index,true) && !legacy ? 'live' : pack.origin?.format || (platform==='公众号'?'article':'video')));
  const draft = productionDraft(pack,platform,index,mode==='live');
  const stale = draft && JSON.stringify(draft.sourceContent) !== JSON.stringify(current);
  const defaults = {script:current.body || '',shots:current.shots || '',title:current.title || '',cover:current.cover || '',coverLayout:current.coverLayout || '',hook:current.hook || '',cta:current.cta || ''};
  const productionField = (name,label) => { const v=values[`production-${name}`] ?? draft?.fields?.[name] ?? defaults[name] ?? ''; return ['liveSchedule','liveAttendance','liveRetained','liveInquiries','liveQualifiedLeads'].includes(name) ? `<label>${esc(label)}<input name="production-${name}" type="${name==='liveSchedule'?'datetime-local':'number'}" ${name==='liveSchedule'?'':'min="0" max="100000000" step="1"'} value="${esc(v)}"></label>` : `<label>${esc(label)}<textarea name="production-${name}" maxlength="12000" rows="3">${esc(v)}</textarea></label>`; };
  const live = mode === 'live';
  // Keep every field in the form so switching or saving cannot lose historical
  // values, while making the current workflow the visible first choice.
  const liveFields=Object.keys(PRODUCTION_FIELDS).filter(k=>k.startsWith('live'));
  const sharedFields=['title','cover','coverLayout'];
  const postFields=Object.keys(PRODUCTION_FIELDS).filter(k=>!sharedFields.includes(k)&&!k.startsWith('live'));
  const primaryFields=live?liveFields:mode==='article'?['script']:postFields,otherFields=live?postFields:mode==='article'?[...postFields.filter(k=>k!=='script'),...liveFields]:liveFields;
  const productionFields=productionField('title',PRODUCTION_FIELDS.title)+primaryFields.map(k=>productionField(k,PRODUCTION_FIELDS[k])).join('')+`<details data-production-other><summary>${live?'其他内容制作字段':mode==='article'?'其他制作字段':'直播相关字段'}（选填）</summary><p class="meta">保留此草稿中的其他字段，展开后可查看或修改。</p>${otherFields.map(k=>productionField(k,PRODUCTION_FIELDS[k])).join('')}</details>`;
  const coverKey=JSON.stringify([customerId,pack.id,platform,String(index)]), savedCover=generatedCovers.get(coverKey);
  const coverLine=String(values['production-cover'] ?? draft?.fields?.cover ?? defaults.cover ?? '').trim();
  const coverLayout=String(values['production-coverLayout'] ?? draft?.fields?.coverLayout ?? defaults.coverLayout ?? '').trim();
  let previewCover=savedCover?.line===coverLine && (savedCover.layout == null || savedCover.layout===coverLayout) && savedCover.source===JSON.stringify(current) ? savedCover.url : '';
  const theme=values['cover-template'] || 'ink', pageInput=String(values['production-shots'] ?? draft?.fields?.shots ?? defaults.shots ?? ''), savedPages=generatedPages.get(coverKey);
  const pagePreview=savedPages?.input===JSON.stringify([pageInput,theme])?savedPages.pages:[];
  const savedBundle=live ? (pack.productionAssets?.[`${key}|live`] || pack.productionAssets?.[key]) : pack.productionAssets?.[key], bundle=savedBundle && (savedBundle.format==='live')===live ? savedBundle : null, assetUrl=name=>'/api/production-assets?'+new URLSearchParams({customerId,packId:pack.id,platform,index:String(index),bundleId:bundle.id,name}).toString();
  if(!previewCover && bundle && draft && bundle.version===draft.version && !stale && bundle.fields?.cover===coverLine && bundle.fields?.coverLayout===coverLayout && bundle.images.some(image=>image.name==='cover.png'))previewCover=assetUrl('cover.png');
  const returned=pack.studioReturnDrafts?.[key];
  const review=returned?`<section class="cm-notice" data-studio-return-review><h4>工作室文案待核对</h4><p>采用后更新原作品的标题与正文；其他制作字段保留。请确认这与实际准备发布的版本一致。</p><details><summary>查看原作品标题与正文</summary><p class="asis">${esc(current.title || '')}</p><p class="asis">${esc(current.body || '')}</p></details><p><strong>送回的标题</strong></p><p class="asis">${esc(returned.title)}</p><p><strong>送回的正文与话题</strong></p><p class="asis">${esc(returned.body)}</p><button type="button" class="btn" data-growth-action="studio-return-apply" data-draft="${esc(returned.id)}">核对后采用工作室文案</button><button type="button" class="btn ghost" data-growth-action="studio-return-discard" data-draft="${esc(returned.id)}">舍弃送回的文案</button></section>`:'';
  const savedPageWarning=bundle?.format==='image'?imagePageSetWarning(bundle.fields?.shots,(bundle.images||[]).map(i=>i.name).filter(n=>n.startsWith('page-'))):'';
  const savedAssets=bundle?`<section data-saved-production-assets><h4>已保存素材包</h4>${savedPageWarning?`<p class="acq-notice">${esc(savedPageWarning)}</p>`:''}<p class="meta">制作草稿 v${esc(bundle.version)} · ${esc(bundle.createdAt)}${bundle.version!==draft?.version||stale?' · 草稿或原稿已更新，请核对素材是否仍适用':''}</p><div class="production-page-grid">${bundle.images.map(image=>`<figure><img width="900" height="1200" src="${esc(assetUrl(image.name))}" alt="${esc(image.name==='cover.png'?'已保存封面':image.name)}"><figcaption><a class="btn ghost" href="${esc(assetUrl(image.name))}" download="${esc(image.name)}">下载 ${esc(image.name)}</a></figcaption></figure>`).join('')}</div>${bundle.images.some(image=>image.name==='cover.png')?'<button type="button" class="btn ghost" data-growth-action="cover-reuse">沿用已保存封面</button><p class="meta">封面文字和排版未变时，可沿用旧封面并保存到当前草稿。</p>':''}${mode==='image'&&bundle.format==='image'&&bundle.images.some(image=>image.name.startsWith('page-'))?'<button type="button" class="btn ghost" data-growth-action="pages-reuse">沿用已保存图文页</button><p class="meta">逐页内容未变时可原样沿用；请检查保存的图片，当前模板选择不会重新绘制旧图。</p>':''}<a class="btn ghost" href="${esc(assetUrl('bundle'))}" download>下载素材与脚本 ZIP</a></section>`:'';
  const studioFields=Object.fromEntries(Object.keys(PRODUCTION_FIELDS).map(name=>[name,values[`production-${name}`] ?? draft?.fields?.[name] ?? defaults[name] ?? '']));
  const previousReview=draft?.generationReview,reviewNotice=previousReview?.warnings?.length?`<details class="cm-notice" data-generation-review><summary>生成时的核对提示（${previousReview.warnings.length}）</summary><p class="meta">这是生成时的辅助意见，草稿或资料可能已经变化；请按当前内容核对。</p>${previousReview.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</details>`:'';
  return productionStudio({attributes:attrs(customerId,pack,platform,index), key:coverKey, platform, mode,
    job:values['production-job'] ?? draft?.job ?? contentJob(pack.topicSnapshot?.job), jobs:CONTENT_JOBS, playPackId:values['production-playPackId'] ?? draft?.playPackId ?? '', playPacks:[...CREATOR_PACKS,...(packSettings.custom||[])],version:draft?.version || 0, open:Boolean(returned)||productionOpened.has(coverKey), panel:productionViews.get(coverKey)||'script',
    changed:Object.keys(values).some(name=>name.startsWith('production-')&&name!=='production-live'),
    stale, review, fields:studioFields, previewCover,
    script:`${reviewNotice}<div class="production-ai-actions"><button type="button" class="btn ghost" data-growth-action="production-generate">AI 生成脚本建议</button><button type="button" class="btn ghost" data-growth-action="production-outline">从现有正文填充脚本骨架</button><button type="button" class="btn ghost" data-growth-action="production-title-ideas">AI 生成标题候选</button></div><div data-title-ideas aria-live="polite"></div><p class="meta">结合业务资料与创作依据，只补充空白项；生成后会额外调用模型核对事实，消耗相应额度，仍需人工确认。本篇打法用于后续生成建议，切换不会改写已有草稿；保存后生效。</p><details class="production-generation-help"><summary>查看生成依据与使用说明</summary><p class="meta">生成会将业务资料、人设、打法、本批参考作品快照、原稿及当前制作输入发送给配置的文本模型，并另行调用模型核对事实；核对可能产生额外调用，建议仍需人工核实。</p></details>${productionFields}<p class="meta">直播字段仅在制作直播时填写；草稿不会自动生成事实。排期保存在本篇，人数由你手工记录；留存与进场需属于同一场次、同一统计人群，并明确留存时点；咨询与有效咨询请按相同去重口径统计。汇总数字不会自动创建联系人。</p>`,
    cover:`${['cover','coverLayout'].map(k=>productionField(k,PRODUCTION_FIELDS[k])).join('')}<label>封面模板<select name="cover-template"><option value="ink" ${theme==='ink'?'selected':''}>深色</option><option value="paper" ${theme==='paper'?'selected':''}>浅色</option><option value="rose" ${theme==='rose'?'selected':''}>玫红</option></select></label><button type="button" class="btn ghost" data-growth-action="cover-download">下载文字封面 PNG</button><label>使用自己的封面背景图<input type="file" data-cover-background accept="image/png,image/jpeg,image/webp"></label><button type="button" class="btn ghost" data-growth-action="cover-photo">用这张图片制作封面</button><p class="meta">图片只在浏览器处理；支持 PNG、JPEG、WebP，最大 8 MB。会按竖版居中裁切并叠加封面文字，核对后可保存到素材包。</p>${mode==='article'?'':`<button type="button" class="btn ghost" data-growth-action="image-pages">生成图文逐页模板</button><p class="meta">图文模板会把「画面与分镜 / 图文逐页内容」中的每一行原样放到一张图片，需先删掉不想展示的制作说明；1 至 10 页，每页最多 90 字。生成后可逐张下载，也可保存为作品素材包。</p><div class="production-page-grid" data-page-templates>${pagePreview.map(p=>`<figure><img width="900" height="1200" src="${esc(p.url)}" alt="第${p.number}页预览"><figcaption><a class="btn ghost" download="harta-page-${p.number}.png" href="${esc(p.url)}">下载第 ${p.number} 页</a></figcaption></figure>`).join('')}</div>`}<button type="button" class="btn ghost" data-growth-action="cover-ai" ${coverGenerating.has(coverKey)?'disabled':''}>AI 生成封面背景</button><p class="meta">AI 封面会向配置的出图服务发送封面文字和封面排版说明，请确认内容可发送；生成后可下载或保存为作品素材包。</p><button type="button" class="btn ghost" data-growth-action="assets-save">保存当前图片素材包</button><p class="meta">请先保存当前制作草稿。直播封面与图文 / 视频素材分别保存；同一图文草稿版本更新封面或图文页时会保留另一类素材。新草稿版本需要重新保存素材。</p>${savedAssets}`,
    delivery:`<button type="button" class="btn ghost" data-growth-action="production-check">检查完整度</button><button type="button" class="btn ghost" data-growth-action="production-craft-review">AI 内容诊断</button><button type="button" class="btn ghost" data-growth-action="production-fact-review">AI 核对事实依据</button><details><summary>Harta 内容方法</summary><p class="meta">从读者处境找到切口，用可信依据兑现内容，再选择符合目标的自然行动；发布后按同口径数据验证假设。内容诊断引用当前草稿提出修改方向，不会自动改写，也不能预测流量或成交。</p></details><div data-production-craft-review role="status"></div><p class="meta">会将当前制作内容与业务资料发送给文本模型核对；结果是辅助意见，需人工确认。</p><div data-production-fact-review role="status"></div>${draft && !draft.live ? `<label class="cm-check"><input type="checkbox" data-production-record-play>我确认按本篇所选打法制作，并将它记录到这次作品版本供复盘</label><p class="meta">选中前请明确选择并保存本篇打法；记录是人工确认，不代表效果由打法造成。</p><button type="button" class="btn ghost" data-growth-action="production-apply" data-version="${draft.version}">将已保存草稿采用为作品文案</button>` : ''}<button type="button" class="btn ghost" data-growth-action="production-download">下载脚本</button>${mode==='article'?'<p class="meta">长文可下载后复制到公众号编辑器；不会自动发布。</p>':`<button type="button" class="btn ghost" data-growth-action="production-to-studio">带到作品草稿添加自己的素材</button><p class="meta">带入已保存的标题、正文和仅供制作参考的说明；图文可同时带入当前已保存素材包。视频需要在作品草稿中选择本地文件，内容不会自动发布。</p>`}`
  });
}
export function renderPostGrowth(customerId, pack, platform, index, accounts = [], publications = [], leads = [], outcomeOnly = false, customerGoal = '', signals = [], works = null) {
  const values = postInputs.get(JSON.stringify([customerId,pack.id,platform,String(index)])) || {};
  const field = (name,label,type='text') => input(name,label,values[name] || '',type);
  const hasOutcomeDraft = Object.keys(values).some(name => name !== 'rewrite-instruction' && !name.startsWith('production-') && name !== 'cover-template');
  const key = `${platform}|${index}`, execution = pack.execution?.[index];
  const published = publications.filter(p=>isRealEvidence(p) && p.customerId===customerId && p.packId===pack.id && p.platform===platform && p.index===index && p.status==='published');
  const selectedPublication = published.find(p=>p.id===values.publicationId);
  const candidateGoal = selectedPublication?.goal || pack.origin?.goal || customerGoal || 'leads';
  const goal = Object.hasOwn(GROWTH_GOALS,candidateGoal) ? candidateGoal : 'leads';
  const primaryMetrics=GROWTH_GOALS[goal]?.metrics || [GROWTH_GOALS[goal]?.metric||'qualifiedLeads'];
  const linkedCounts = id => publicationAttributionCounts(id,customerId,leads,signals,works);
  const rows = (pack.outcomes?.[key] || []).filter(isRealEvidence), row = rows[0], assessment = outcomeAssessment(row?.goal || goal, row);
  const references=pack.workReferences || [], currentContent=packAsSent(pack).shells?.[platform]?.[index] || {}, overlaps=referenceOverlaps(currentContent,references);
  const referenceInfo=references.length?`<details class="content-brief"><summary>查看本批参考来源${overlaps.length?' · 有文字重合提醒':''}</summary><p class="meta">参考仅供研究结构与选题，不代表业务事实；重合检查只提示，不代替人工核对。</p>${references.map(r=>{let href='';try{const u=new URL(r.url);if(['http:','https:'].includes(u.protocol))href=u.href;}catch{}return `<p>${esc(r.platform || '')} · ${href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(r.title || '参考作品')} ↗</a>`:esc(r.title || '参考作品（无可用链接）')}</p>`;}).join('')}${overlaps.map(r=>`<p>与「${esc(r.title)}」存在连续相同文字「${esc(r.excerpt)}」，请核对并改写。</p>`).join('')}</details>`:'';
  const rewriteDraft = pack.rewriteDrafts?.[key], versions = pack.postVersions?.[key] || [];
  const rewrite = outcomeOnly ? '' : `<details ${rewriteDraft || values['rewrite-instruction'] ? 'open' : ''}><summary>帮我改一下</summary><div class="acts rewrite-shortcuts">${[['更吸引人','把标题和开头写得更具体、更有吸引力，正文兑现标题，不编造事实。'],['更像真人说话','改成自然口语，减少套话，保留事实和关键信息。'],['再短一点','删掉重复和空泛表达，保留关键信息与平台必需字段。']].map(([label,instruction])=>`<button type="button" class="btn ghost" data-growth-action="rewrite" data-instruction="${esc(instruction)}">${label}</button>`).join('')}</div><label>也可以直接告诉我怎么改<textarea name="rewrite-instruction" rows="2" maxlength="2000" placeholder="例如：开头更具体，保留正文里的核对方法；减少泛泛介绍。">${esc(values['rewrite-instruction'] || '')}</textarea></label><button type="button" class="btn ghost" data-growth-action="rewrite">按我的要求修改</button><p class="meta">原版本会保留。</p>
  ${rewriteDraft ? `<div class="rewrite-preview"><h4>改好了，看看这个版本</h4>${Object.entries(rewriteDraft.candidate.content).map(([k,v])=>`<p><b>${esc(FIELD_LABELS[k] || k)}</b></p><p class="asis">${esc(v)}</p>`).join('')}<button type="button" class="btn" data-growth-action="apply" data-draft="${esc(rewriteDraft.id)}">采用这个版本</button></div>` : ''}
  ${versions.length ? `<details><summary>历史版本（${versions.length}）</summary>${versions.map(v=>`<div><p>${esc(v.at)}</p><p class="asis">${esc(Object.values(v.content || {}).join('\n\n'))}</p><button type="button" class="textish" data-growth-action="restore" data-version="${esc(v.id)}">恢复此版本</button></div>`).join('')}</details>` : ''}</details>`;
  return `<div class="post-growth" ${attrs(customerId, pack, platform, index)}>${referenceInfo}${rewrite}<details class="post-advanced" ${hasOutcomeDraft ? 'open' : ''}><summary>更多选项</summary>  ${execution?.growth ? `<details class="content-brief"><summary>查看生成说明</summary>${pack.creatorPacks?.[index] ? `<p>创作参考：${esc(pack.creatorPacks[index].name)} v${esc(pack.creatorPacks[index].version)}</p>` : ''}${Object.entries(GROWTH_BRIEF_LABELS).map(([k,l])=>`<p><b>${l}：</b>${esc(execution.growth[k])}</p>`).join('')}<p class="meta">本批结果条件：${esc(pack.origin?.criteria || '尚未定义具体达标条件')}。这是待验证的计划，尚非已取得的效果。</p></details>` : ''}
  <details ${hasOutcomeDraft ? 'open' : ''}><summary>记录发布效果${row ? ' · 已有记录' : ' · 待验证'}</summary><p>${esc(assessment.text)}</p>
  ${row ? `<p class="meta">${esc(row.start)} 至 ${esc(row.end)} · 来源：${esc(row.source)} · ${row.publicationId?'已关联发布记录':'未关联发布记录'}${metricSourceText(row,METRICS)?`<br>指标来源：${esc(metricSourceText(row,METRICS))}`:''}<br>口径：${esc(row.criteria || '未填写')}<br>基线说明：${esc(row.baselineNote || '无')}${row.baselineViews != null ? `<br>阅读 / 播放基线：${row.baselineViews}；${esc(row.baselineViewsNote || '无说明')}` : ''}<br>${Object.entries(row.metrics).map(([k,v])=>`${esc(METRICS[k])}：${v}`).join(' · ')}</p>` : ''}
  ${interactionReview(row).map(note=>`<p class="meta">${esc(note)}</p>`).join('')}
  ${assessment.suggestion ? `<p>${esc(assessment.suggestion)}</p><button type="button" class="textish" data-growth-action="suggest" data-suggestion="${esc(assessment.suggestion)}">放入调整方向，编辑后保存</button><button type="button" class="textish" data-growth-action="adopt-memory" data-outcome="${esc(row.id)}">采用为复盘记忆</button>` : ''}
  <form data-outcome-form data-outcome-goal="${esc(goal)}">${row?'<button type="button" class="btn ghost" data-growth-action="carry-outcome">沿用上次记录</button><p class="meta">只填空白项；请先选择与上次相同的发布记录和账号，再核对统计日期、来源及口径。</p>':''}<input type="hidden" name="outcomeGoal" value="${esc(goal)}"><input type="hidden" name="baselineMetric" value="${esc(GROWTH_GOALS[goal].metric)}"><p class="meta">当前复盘目标：${esc(GROWTH_GOALS[goal].label)}${selectedPublication ? '（按发布时目标）' : '（按当前作品目标）'}。填写实际结果，未知留空；重叠统计不累加。平台完播率按后台百分数填写，与完整播放次数 / 播放的手工比值分别保存，比较前请核对口径。</p><label>关联已登记发布（选填）<select name="publicationId"><option value="">未关联，仅记录当前文案</option>${published.map(p=>`<option value="${esc(p.id)}" ${values.publicationId===p.id?'selected':''}>${esc(p.accountName || '未命名账号')} · ${esc(String(p.publishedAt || '').slice(0,10))} · ${esc(p.content?.title || '未命名内容')}</option>`).join('')}</select></label><label>发布账号（选填）<select name="accountId"><option value="">未知，不纳入账号对照</option>${accounts.filter(a=>isRealEvidence(a) && a.customerId===customerId && a.platform===platform).map(a=>`<option value="${esc(a.id)}" ${values.accountId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label><div class="growth-fields">${field('start','统计开始','date')}${field('end','统计结束','date')}${Object.entries(METRICS).filter(([k])=>primaryMetrics.includes(k)).map(([k,l])=>field(k,l,'number')).join('')}</div><details><summary>补充其他效果指标（选填）</summary><div class="growth-fields">${Object.entries(METRICS).filter(([k])=>!primaryMetrics.includes(k)).map(([k,l])=>field(k,l,'number')).join('')}</div></details>${field('source','数据来源（后台文件名 / 核对记录）')}${field('criteria','有效客资、去重或订单归因口径')}${field('baseline',`同口径基线：${METRICS[GROWTH_GOALS[goal]?.metric || 'qualifiedLeads']}`,'number')}${field('baselineNote','基线来源、相同平台与统计窗口')}${goal==='reach_leads' ? `${field('baselineViews','阅读 / 播放同口径基线（选填）','number')}${field('baselineViewsNote','阅读 / 播放基线来源、相同平台与统计窗口')}` : ''}${field('note','备注（投流、发布时间等差异）')}<button class="btn" type="submit">保存记录</button></form>
  ${rows.length ? `<details><summary>查看 ${rows.length} 次记录</summary>${rows.map(r=>`<p>${esc(r.start)} 至 ${esc(r.end)} · ${esc(r.source)} · ${esc(r.accountName || '账号未知')} · ${r.publicationId?'已关联发布记录':'未关联发布记录'}${r.publicationId ? ` · 累计已登记咨询 ${linkedCounts(r.publicationId).messages} 条 / ${linkedCounts(r.publicationId).contacts} 个联系人记录${linkedCounts(r.publicationId).comments?`；另有已关联评论 ${linkedCounts(r.publicationId).comments} 条 / ${linkedCounts(r.publicationId).commentContacts} 个联系人记录（与咨询可能重叠）`:''}` : ''}<br>${Object.entries(r.metrics).map(([k,v])=>`${esc(METRICS[k])}：${v}`).join(' · ')}<br><span class="meta">保存于 ${esc(r.recordedAt)}；${esc(r.note)}</span></p><details><summary>当时关联的文案</summary><p class="asis">${esc(Object.values(r.content || {}).join('\n\n'))}</p></details>`).join('')}</details>` : ''}
  <div class="acts"><button class="textish" type="button" data-growth-action="template">下载本批效果导入模板</button><button class="textish" type="button" data-growth-action="export">导出本批效果记录</button><label class="textish">导入填写后的 JSON<input type="file" data-outcome-import accept=".json,application/json"></label></div></details>
</details><p class="meta" data-growth-status role="status"></p></div>`;
}
export function installGrowthUI({ getWorkspace, setWorkspace, render, toast }) {
  const context = el => { const box = el.closest('[data-growth-customer]'); return { box, customerId: box.dataset.growthCustomer, packId: box.dataset.growthPack, platform: box.dataset.growthPlatform, index: Number(box.dataset.growthIndex) }; };
  document.addEventListener('toggle', event => {
    if(!event.target.matches?.('[data-production-editor]') || !event.target.isConnected)return;
    const key=inputKey(event.target.closest('[data-production-mode]'));
    if(event.target.open)productionOpened.add(key);else productionOpened.delete(key);
  },true);
  document.addEventListener('click', event => {
    const tab=event.target.closest?.('[data-production-tab]');if(!tab)return;
    const box=tab.closest('[data-production-mode]');productionViews.set(inputKey(box),tab.dataset.productionTab);showProductionPanel(box,tab.dataset.productionTab);
  });
  document.addEventListener('keydown', event => {
    const tab=event.target.closest?.('[data-production-tab]');if(!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=[...tab.parentElement.querySelectorAll('[data-production-tab]')],i=tabs.indexOf(tab);
    const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length];next.click();next.focus();
  });
  document.addEventListener('input', event => rememberInput(event.target));
  document.addEventListener('change', event => rememberInput(event.target));
  document.addEventListener('change', event => {
    const field=event.target;
    if(field.matches?.('[data-cover-background]')) {
      const box=field.closest('[data-growth-customer]'),key=box&&inputKey(box),cover=key&&generatedCovers.get(key);
      if(cover){generatedCovers.delete(key);const preview=box.querySelector('[data-ai-cover-preview]'),link=box.querySelector('[data-ai-cover-download]');if(preview){preview.hidden=true;preview.removeAttribute('src');}if(link){link.hidden=true;link.removeAttribute('href');}}
      if(box)box.querySelector('[data-production-status]').textContent=field.files?.length?'背景图片已选择，请制作封面。':'未选择背景图片。';
      return;
    }
    if(field.name!=='production-live') return;
    const box=field.closest('[data-production-mode]'); if(!box) return;
    const previous=box.dataset.productionMode, mode=field.value;productionViews.set(inputKey(box),'script');showProductionPanel(box,'script');
    if((previous==='live')===(mode==='live')) {box.dataset.productionMode=mode;updateProductionPreview(box);return;}
    const data=context(field), key=inputKey(box), pending=postInputs.get(key)||{};
    const snapshot=Object.fromEntries([...Object.keys(PRODUCTION_FIELDS),'job','playPackId'].map(k=>[`production-${k}`,box.querySelector(`[name="production-${k}"]`)?.value || '']));
    productionPending.set(`${key}|${previous==='live'?'live':'post'}`,snapshot);
    for(const k of [...Object.keys(PRODUCTION_FIELDS),'job','playPackId']) delete pending[`production-${k}`];
    Object.assign(pending,productionPending.get(`${key}|${mode==='live'?'live':'post'}`)||{}, {'production-live':mode});
    postInputs.set(key,pending);
    const customer=getWorkspace().customers.find(c=>c.id===data.customerId),pack=[...(customer?.drops||[]),...(customer?.packs||[])].find(p=>p.id===data.packId);
    if(!pack)return;
    const template=document.createElement('template'); template.innerHTML=renderProduction(data.customerId,pack,data.platform,data.index,customer.creatorPackSettings).trim();
    const next=template.content.firstElementChild;box.replaceWith(next);next.querySelector('details').open=true;
  });
  document.addEventListener('change', event => {
    const field=event.target,form=field.closest?.('[data-outcome-form]');
    if(!form || field.name!=='publicationId')return;
    const data=context(field), box=data.box, key=inputKey(box), space=getWorkspace();
    const customer=space.customers.find(c=>c.id===data.customerId),pack=[...(customer?.drops||[]),...(customer?.packs||[])].find(p=>p.id===data.packId);
    if(!pack)return;
    const publication=(space.acquisition?.publications || []).find(p=>p.id===field.value && p.customerId===data.customerId && p.packId===data.packId && p.platform===data.platform && p.index===data.index && p.status==='published');
    const nextCandidate=publication?.goal || pack.origin?.goal || customer.growthGoal || 'leads', nextGoal=Object.hasOwn(GROWTH_GOALS,nextCandidate)?nextCandidate:'leads';
    const values=postInputs.get(key)||{}, previousGoal=form.dataset.outcomeGoal;
    if(previousGoal!==nextGoal){
      const names=['baseline','baselineNote','baselineViews','baselineViewsNote'];
      outcomeBaselineDrafts.set(`${key}|${previousGoal}`,Object.fromEntries(names.map(name=>[name,form.querySelector(`[name="${name}"]`)?.value || ''])));
      Object.assign(values,Object.fromEntries(names.map(name=>[name,''])),outcomeBaselineDrafts.get(`${key}|${nextGoal}`)||{});
    }
    values.publicationId=field.value;
    if(publication)values.accountId=publication.accountId;
    postInputs.set(key,values);
    render();
  });
  async function save(url, data, onSaved = () => {}) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '保存失败');
    onSaved(result); setWorkspace(result); render();
  }
  const download = (value, filename) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})); const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-growth-action]'); if (!button) return;
    const action = button.dataset.growthAction, { box, ...data } = context(button);
    const value = name => box.querySelector(`[name="${name}"]`)?.value || '';
    if(['standard-rule-add','standard-rule-remove'].includes(action)){
      const pending=settingsInputs.get(data.customerId)||{};pending.__standardVersion ??= Number(box.querySelector('[data-standard-editor]')?.dataset.version||0);
      if(action==='standard-rule-add'){
        if(box.querySelectorAll('[data-standard-rule]').length>=40){toast('创作规则最多40条');return;}
        box.querySelector('[data-standard-rows]').insertAdjacentHTML('beforeend',standardRuleRow({id:'rule-'+crypto.randomUUID(),title:'',rule:'',mode:'manual',severity:'block'}));
        box.querySelector('[data-standard-rule]:last-child input')?.focus();
      }else button.closest('[data-standard-rule]').remove();
      pending['standard-rules-json']=JSON.stringify(readStandardRules(box));settingsInputs.set(data.customerId,pending);return;
    }
    if(action==='standards-reload'){
      const pending=settingsInputs.get(data.customerId);if(pending){for(const k of Object.keys(pending))if(k.startsWith('standard-')||k==='__standardVersion')delete pending[k];}
      settingsRendered.delete(document.getElementById('growth-settings'));render();return;
    }
    if(action==='profile-evaluate') {
      const fields=Object.fromEntries(Object.keys(PROFILE_FIELDS).map(k=>[k,value(`profile-${k}`)])),customer=getWorkspace().customers.find(c=>c.id===data.customerId);
      const section=button.closest('[data-creator-profile]');section.querySelector('[data-profile-assessment]').innerHTML=profileAssessmentHtml(fields,customer?.creatorProfile?.fields);
      for(const row of evaluateCreatorProfile(fields,customer?.creatorProfile?.fields).rows)section.querySelector(`[data-profile-field="${row.key}"] [data-profile-field-status]`).textContent=row.status;
      return;
    }
    if(action==='profile-reload') {
      const pending=settingsInputs.get(data.customerId);if(pending){for(const key of Object.keys(pending))if(key.startsWith('profile-') || key==='__profileBasis')delete pending[key];}
      settingsRendered.delete(document.getElementById('growth-settings'));render();return;
    }
    if(action==='carry-outcome') {
      try{const form=button.closest('[data-outcome-form]'),c=getWorkspace().customers.find(c=>c.id===data.customerId),pack=[...(c?.drops||[]),...(c?.packs||[])].find(p=>p.id===data.packId),snapshot=pack?.outcomes?.[`${data.platform}|${data.index}`]?.find(isRealEvidence);if(snapshot && !snapshot.publicationId && JSON.stringify(snapshot.content||{})!==JSON.stringify(packAsSent(pack).shells?.[data.platform]?.[data.index]||{}))throw new Error('原作品文案已变化，请重新核对并手工填写');const values=carryOutcome(snapshot,Object.fromEntries(new FormData(form)),{checkPublication:true});for(const [name,value] of Object.entries(values)){const el=form.elements.namedItem(name);if(el){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}box.querySelector('[data-growth-status]').textContent='已填入空白项，请核对日期、来源和口径后保存。';}catch(error){toast(error.message);}return;
    }
    if(action==='image-pages') {
      if(value('production-live')!=='image'){toast('请先把制作类型设为图文');return;}
      try {
        const raw=value('production-shots'),theme=value('cover-template'),pages=makeImagePages(raw,theme),key=inputKey(box),grid=box.querySelector('[data-page-templates]');
        generatedPages.set(key,{input:JSON.stringify([raw,theme]),pages});while(generatedPages.size>5)generatedPages.delete(generatedPages.keys().next().value);
        showProductionPages(grid,pages);
        box.querySelector('[data-production-status]').textContent=`已生成 ${pages.length} 页模板，请逐页核对文字与画面后下载。`;
      } catch(error){box.querySelector('[data-production-status]').textContent=error.message;toast(error.message);}
      return;
    }
    if(['pages-reuse','cover-reuse'].includes(action) && productionSaving.has(inputKey(box))) {
      const message='制作草稿正在保存，请保存完成后再沿用素材';
      box.querySelector('[data-production-status]').textContent=message;toast(message);return;
    }
    if(action==='pages-reuse') {
      const target=box.querySelector('[data-production-status]'),key=inputKey(box),raw=value('production-shots'),theme=value('cover-template');
      const findPack=()=>{const c=getWorkspace().customers.find(c=>c.id===data.customerId);return [...(c?.drops||[]),...(c?.packs||[])].find(p=>p.id===data.packId);};
      try {
        if(value('production-live')!=='image')throw new Error('请先选择图文制作');
        const pack=findPack(),bundle=pack?.productionAssets?.[`${data.platform}|${data.index}`];
        if(bundle?.format!=='image' || !Array.isArray(bundle.images))throw new Error('找不到已保存的图文页');
        if(!raw.trim() || raw.trim()!==String(bundle.fields?.shots||'').trim())throw new Error('逐页内容已变化，请重新制作图文页');
        const names=bundle.images.map(i=>i.name).filter(name=>/^page-(0[1-9]|10)\.png$/.test(name)).sort();
        validateImagePageSet(raw,names);
        const source=JSON.stringify(packAsSent(pack).shells?.[data.platform]?.[data.index]);button.disabled=true;target.textContent='正在读取已保存图文页…';
        const pages=await Promise.all(names.map(async (name,i)=>{const query=new URLSearchParams({...data,index:String(data.index),bundleId:bundle.id,name}),response=await fetch('/api/production-assets?'+query);if(!response.ok)throw new Error('读取图文页失败，请刷新后重试');const blob=await response.blob(),url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取图文页失败'));reader.readAsDataURL(blob);});if(typeof url!=='string'||!url.startsWith('data:image/png;base64,'))throw new Error('已保存图文页格式不正确');return {number:i+1,url};}));
        const latest=findPack();if(!box.isConnected || value('production-live')!=='image' || value('production-shots')!==raw || value('cover-template')!==theme || latest?.productionAssets?.[`${data.platform}|${data.index}`]?.id!==bundle.id || !latest || JSON.stringify(packAsSent(latest).shells?.[data.platform]?.[data.index])!==source)throw new Error('读取期间草稿或素材已变化，请重新核对');
        generatedPages.set(key,{input:JSON.stringify([raw,theme]),pages});while(generatedPages.size>5)generatedPages.delete(generatedPages.keys().next().value);
        showProductionPages(box.querySelector('[data-page-templates]'),pages);target.textContent='已沿用原图文页，请逐页核对后保存到当前素材包。';
      }catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}return;
    }
    if(action==='cover-reuse') {
      const target=box.querySelector('[data-production-status]'),mode=value('production-live'),live=mode==='live',key=inputKey(box);
      const findPack=()=>{const c=getWorkspace().customers.find(c=>c.id===data.customerId);return [...(c?.drops||[]),...(c?.packs||[])].find(p=>p.id===data.packId);};
      const findBundle=pack=>{const base=pack?.productionAssets?.[`${data.platform}|${data.index}`];return live?(pack?.productionAssets?.[`${data.platform}|${data.index}|live`] || (base?.format==='live'?base:null)):(base?.format==='live'?null:base);};
      try {
        const pack=findPack(),bundle=findBundle(pack),line=value('production-cover').trim(),layout=value('production-coverLayout').trim();
        if(!bundle?.images?.some(i=>i.name==='cover.png'))throw new Error('找不到已保存封面');
        if(!line || line!==(bundle.fields?.cover||'').trim() || layout!==(bundle.fields?.coverLayout||'').trim())throw new Error('封面文字或排版已变化，请重新制作封面');
        const source=JSON.stringify(packAsSent(pack).shells?.[data.platform]?.[data.index]);
        button.disabled=true;target.textContent='正在读取已保存封面…';
        const query=new URLSearchParams({...data,index:String(data.index),bundleId:bundle.id,name:'cover.png'}),response=await fetch('/api/production-assets?'+query);
        if(!response.ok)throw new Error('读取已保存封面失败，请刷新后重试');
        const blob=await response.blob(),url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取封面失败'));reader.readAsDataURL(blob);});
        const latest=findPack();if(!box.isConnected || value('production-live')!==mode || value('production-cover').trim()!==line || value('production-coverLayout').trim()!==layout || findBundle(latest)?.id!==bundle.id || !latest || JSON.stringify(packAsSent(latest).shells?.[data.platform]?.[data.index])!==source)throw new Error('读取期间草稿或素材已变化，请重新核对');
        if(typeof url!=='string'||!url.startsWith('data:image/png;base64,'))throw new Error('已保存封面格式不正确');
        generatedCovers.set(key,{line,layout,source,url});while(generatedCovers.size>10)generatedCovers.delete(generatedCovers.keys().next().value);
        const preview=box.querySelector('[data-ai-cover-preview]'),link=box.querySelector('[data-ai-cover-download]');preview.src=url;preview.hidden=false;link.href=url;link.hidden=false;
        target.textContent='已沿用封面，请核对后保存到当前素材包。';
      }catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}return;
    }
    if(action==='assets-save') {
      const target=box.querySelector('[data-production-status]'), key=inputKey(box), customer=getWorkspace().customers.find(c=>c.id===data.customerId),pack=[...(customer?.drops||[]),...(customer?.packs||[])].find(p=>p.id===data.packId);
      try {
        const mode=value('production-live'),live=mode==='live',draft=productionDraft(pack,data.platform,data.index,live);
        if(!draft || Boolean(draft.live)!==live || (!live && mode!==(draft.format || pack.origin?.format || (data.platform==='公众号'?'article':'video'))) || Object.keys(PRODUCTION_FIELDS).some(k=>value(`production-${k}`).trim()!==(draft.fields[k] || '').trim()))throw new Error('请先保存当前制作草稿，再保存素材');
        const pages=generatedPages.get(key),cover=generatedCovers.get(key), images=[];
        if(mode==='image' && pages?.input===JSON.stringify([value('production-shots'),value('cover-template')]))for(const page of pages.pages)images.push({name:`page-${String(page.number).padStart(2,'0')}.png`,data:page.url});
        const source=JSON.stringify(packAsSent(pack).shells?.[data.platform]?.[data.index]);
        if(cover?.line===value('production-cover').trim() && (cover.layout == null || cover.layout===value('production-coverLayout').trim()) && cover.source===source)images.push({name:'cover.png',data:cover.url});
        if(!images.length)throw new Error('请先生成图文页或 AI 封面，再保存素材');
        button.disabled=true;target.textContent='正在保存素材包…';
        const baseKey=`${data.platform}|${data.index}`,base=pack.productionAssets?.[baseKey],existing=live?(pack.productionAssets?.[`${baseKey}|live`] || (base?.format==='live'?base:null)):base;
        await save('/api/production-assets',{...data,live,version:draft.version,expectedBundleId:existing?.id || '',images});const currentBox=[...document.querySelectorAll('[data-growth-pack]')].find(el=>inputKey(el)===key && el.querySelector('[data-saved-production-assets]'));if(currentBox)currentBox.querySelector('details').open=true;toast('素材包已保存，可重新打开或下载');
      }catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}
      return;
    }
    if(action==='production-to-studio') {
      const target=box.querySelector('[data-production-status]'), customer=getWorkspace().customers.find(c=>c.id===data.customerId),pack=[...(customer?.drops||[]),...(customer?.packs||[])].find(p=>p.id===data.packId),draft=pack?.productionDrafts?.[`${data.platform}|${data.index}`];
      try {
        const mode=value('production-live');
        if(!['小红书','抖音'].includes(data.platform))throw new Error('作品草稿目前支持小红书和抖音');
        if(mode==='live')throw new Error('直播场次可下载脚本，图文和短视频可带到作品草稿');
        if(!draft || mode!==(draft.format || pack.origin?.format || (data.platform==='公众号'?'article':'video')) || Object.keys(PRODUCTION_FIELDS).some(k=>value(`production-${k}`).trim()!==(draft.fields[k] || '').trim()))throw new Error('请先保存当前制作草稿，再带到作品草稿');
        if(!draft.basisRevision)throw new Error('请重新保存当前制作草稿，再带到作品草稿');
        if(JSON.stringify(draft.sourceContent)!==JSON.stringify(packAsSent(pack).shells?.[data.platform]?.[data.index]))throw new Error('原稿已变化，请先核对并重新保存制作草稿');
        button.disabled=true;target.textContent='正在准备作品草稿…';
        const hartaSource={...data,draftVersion:draft.version,sourceRevision:draft.sourceRevision,basisRevision:draft.basisRevision},studioPlatform=data.platform==='抖音'?'douyin':'xiaohongshu';
        const validation=await fetch('/api/studio-handoff-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:hartaSource,studioPlatform,kind:mode})}),checked=await validation.json();if(!validation.ok)throw new Error(checked.error||'交接校验失败');
        const bundle=pack.productionAssets?.[`${data.platform}|${data.index}`],images=[];
        if(bundle && bundle.version===draft.version){
          const ordered=[...bundle.images].sort((a,b)=>a.name==='cover.png'?-1:b.name==='cover.png'?1:a.name.localeCompare(b.name));
          for(const image of ordered){const query=new URLSearchParams({...data,index:String(data.index),bundleId:bundle.id,name:image.name}),response=await fetch('/api/production-assets?'+query);if(!response.ok)throw new Error('读取已保存素材失败，请重新打开作品');const blob=await response.blob();images.push(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(blob);}));}
        }
        const latest=getWorkspace().customers.find(c=>c.id===data.customerId),latestPack=[...(latest?.drops||[]),...(latest?.packs||[])].find(p=>p.id===data.packId),latestDraft=latestPack?.productionDrafts?.[`${data.platform}|${data.index}`];
        if(latestDraft?.version!==draft.version || JSON.stringify(latestDraft?.sourceContent)!==JSON.stringify(packAsSent(latestPack).shells?.[data.platform]?.[data.index]) || !box.isConnected || value('production-live')!==mode || Object.keys(PRODUCTION_FIELDS).some(k=>value(`production-${k}`).trim()!==(draft.fields[k] || '').trim()))throw new Error('准备期间草稿或原稿已变化，请重新打开作品');
        const {openStudioWithProduction}=await import('./openfind-workbench.js');
        if(openStudioWithProduction({customerId:data.customerId,seed:{title:draft.fields.title||'',body:draft.fields.script||'',productionNotes:productionDocument(draft.fields,mode,data.platform),platform:studioPlatform,kind:mode,images,hartaSource}}))toast(bundle && bundle.version!==draft.version?'旧素材包未带入，请在工作室重新添加图片':'正在打开作品草稿，请添加素材并保存');
      }catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}
      return;
    }
    if(action==='production-craft-review') {
      const target=box.querySelector('[data-production-craft-review]'),mode=value('production-live'),job=value('production-job'),play=value('production-playPackId'),fields=Object.fromEntries(Object.keys(PRODUCTION_FIELDS).map(k=>[k,value(`production-${k}`)])),owner=getWorkspace().customers.find(c=>c.id===data.customerId),ownerBefore=JSON.stringify(owner);
      button.disabled=true;target.dataset.completed='false';target.textContent='正在诊断当前内容…';
      try {
        const pack=[...(owner?.drops||[]),...(owner?.packs||[])].find(p=>p.id===data.packId),saved=pack&&productionDraft(pack,data.platform,data.index,mode==='live');if(!pack||job!==(saved?.job??contentJob(pack.topicSnapshot?.job))||play!==(saved?.playPackId||''))throw new Error('请先保存内容任务和本篇打法，再诊断内容');
        const response=await fetch('/api/production-craft-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,live:mode==='live',format:mode==='live'?'':mode,fields})}),result=await response.json();if(!response.ok)throw new Error(result.error||'内容诊断失败');
        if(!box.isConnected||value('production-live')!==mode||value('production-job')!==job||value('production-playPackId')!==play||JSON.stringify(getWorkspace().customers.find(c=>c.id===data.customerId))!==ownerBefore||Object.keys(fields).some(k=>value(`production-${k}`)!==fields[k]))throw new Error('诊断期间内容或业务资料已变化，请重新诊断');
        if(!Array.isArray(result.issues))throw new Error('内容诊断结果格式不正确');target.replaceChildren();const intro=document.createElement('p');intro.textContent=result.issues.length?`建议优先核对 ${result.issues.length} 处：`:'本次未提出具体修改项；仍请结合真实反馈与发布要求核对。';target.append(intro);
        for(const issue of result.issues){if(!issue||!Object.hasOwn(PRODUCTION_FIELDS,issue.field)||typeof issue.quote!=='string'||!fields[issue.field].includes(issue.quote)||typeof issue.reason!=='string'||typeof issue.suggestion!=='string')throw new Error('内容诊断结果与当前草稿不符');const row=document.createElement('p');row.textContent=`${PRODUCTION_FIELDS[issue.field]}「${issue.quote}」：${issue.reason} 修改方向：${issue.suggestion}`;target.append(row);}target.dataset.completed='true';
      }catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}return;
    }
    if(action==='production-fact-review') {
      const target=box.querySelector('[data-production-fact-review]'),mode=value('production-live'),fields=Object.fromEntries(Object.keys(PRODUCTION_FIELDS).map(k=>[k,value(`production-${k}`)]));
      button.disabled=true;target.dataset.completed='false';target.textContent='正在核对当前内容与业务资料…';
      try {
        const response=await fetch('/api/production-fact-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,live:mode==='live',format:mode==='live'?'':mode,fields})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'事实核对失败');
        if(!box.isConnected || value('production-live')!==mode || Object.keys(fields).some(k=>value(`production-${k}`)!==fields[k]))throw new Error('核对期间制作内容已变化，请重新核对');
        if(!Array.isArray(result.issues)||result.issues.some(item=>typeof item!=='string'))throw new Error('事实核对结果格式不正确');
        target.replaceChildren();const intro=document.createElement('p');intro.textContent=result.issues.length?`发现 ${result.issues.length} 项需人工核对：`:'AI 未发现本次核对范围内的问题；仍需人工核对事实和发布要求。';target.append(intro);
        if(result.issues.length){const list=document.createElement('ul');for(const issue of result.issues){const item=document.createElement('li');item.textContent=issue;list.append(item);}target.append(list);}target.dataset.completed='true';
      }catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}return;
    }
    if(action==='production-title-adopt'){
      const saved=titleIdeaStates.get(box),read=()=>JSON.stringify([value('production-live'),value('production-job'),value('production-playPackId'),...(saved?.keys||[]).map(k=>value(`production-${k}`))]);
      const owner=getWorkspace().customers.find(c=>c.id===data.customerId);
      if(!saved||!owner||JSON.stringify(owner)!==saved.owner||read()!==saved.input){titleIdeaStates.delete(box);box.querySelector('[data-title-ideas]').textContent='制作内容或业务资料已变化，请重新生成标题候选。';return;}
      const title=box.querySelector('[name="production-title"]');title.value=button.dataset.title;title.dispatchEvent(new Event('input',{bubbles:true}));titleIdeaStates.delete(box);box.querySelector('[data-title-ideas]').textContent='已填入标题，请核对并保存制作草稿。';return;
    }
    if(action==='production-title-ideas'){
      const target=box.querySelector('[data-title-ideas]'),mode=value('production-live'),job=value('production-job'),playPackId=value('production-playPackId'),keys=['script','shots','imagePlan','title','cover','coverLayout','hook','cta','liveOpen','liveSegments','liveInteraction','liveOffer','liveClose'],workingFields=Object.fromEntries(keys.map(k=>[k,value(`production-${k}`)])),input=JSON.stringify([mode,job,playPackId,...keys.map(k=>workingFields[k])]);
      const read=()=>JSON.stringify([value('production-live'),value('production-job'),value('production-playPackId'),...keys.map(k=>value(`production-${k}`))]);button.disabled=true;titleIdeaStates.delete(box);target.textContent='正在生成标题候选…';
      try{const owner=getWorkspace().customers.find(c=>c.id===data.customerId),pack=[...(owner?.drops||[]),...(owner?.packs||[])].find(p=>p.id===data.packId);if(!pack)throw new Error('找不到当前作品');const saved=productionDraft(pack,data.platform,data.index,mode==='live');if(job!==(saved?.job??contentJob(pack.topicSnapshot?.job))||playPackId!==(saved?.playPackId||''))throw new Error('请先保存内容任务和本篇打法，再生成标题候选');const ownerBefore=JSON.stringify(owner),response=await fetch('/api/production-generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,live:mode==='live',format:mode==='live'?'':mode,workingFields,titleIdeas:true})}),result=await response.json();if(!response.ok)throw new Error(result.error||'标题生成失败');if(!box.isConnected||read()!==input||JSON.stringify(getWorkspace().customers.find(c=>c.id===data.customerId))!==ownerBefore)throw new Error('生成期间内容或业务资料已变化，请重新生成');if(!Array.isArray(result.titles)||!result.titles.length||result.titles.some(t=>typeof t!=='string'||!t.trim()||t.length>200))throw new Error('标题候选格式不正确，请重试');titleIdeaStates.set(box,{keys,input,owner:ownerBefore});target.replaceChildren();const note=document.createElement('p');note.className='meta';note.textContent='选择一条后填入标题；请核对事实并保存草稿。'+(Array.isArray(result.warnings)?result.warnings.filter(w=>typeof w==='string').join(' '):'');target.append(note);for(const text of result.titles){const choice=document.createElement('button');choice.type='button';choice.className='btn ghost';choice.dataset.growthAction='production-title-adopt';choice.dataset.title=text;choice.textContent=text;target.append(choice);}}
      catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}return;
    }
    if (action === 'production-generate') { button.disabled=true;const target=box.querySelector('[data-production-status]'),mode=value('production-live'),job=value('production-job'),playPackId=value('production-playPackId');target.textContent='正在生成建议…';try {const owner=getWorkspace().customers.find(c=>c.id===data.customerId),currentPack=[...(owner?.drops||[]),...(owner?.packs||[])].find(p=>p.id===data.packId);if(!currentPack)throw new Error('找不到当前作品');const savedJob=productionDraft(currentPack, data.platform, data.index, mode==='live')?.job ?? contentJob(currentPack.topicSnapshot?.job);if(job!==savedJob || playPackId!==(productionDraft(currentPack,data.platform,data.index,mode==='live')?.playPackId || ''))throw new Error('请先保存内容任务和本篇打法，再生成脚本建议');const keys=['script','shots','imagePlan','title','cover','coverLayout','hook','cta','liveOpen','liveSegments','liveInteraction','liveOffer','liveClose'],workingFields=Object.fromEntries(keys.map(k=>[k,value(`production-${k}`)]));const res=await fetch('/api/production-generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,live:mode==='live',format:mode==='live'?'':mode,workingFields})});const result=await res.json();if(!res.ok)throw new Error(result.error || '生成失败');if(!box.isConnected){toast('页面已变化，请回到作品重新生成');return;}if(value('production-live')!==mode || value('production-job')!==job || value('production-playPackId')!==playPackId || keys.some(k=>value(`production-${k}`)!==workingFields[k]))throw new Error('生成期间制作内容或类型已变化，请重新生成');for(const [k,v] of Object.entries(result.fields || {})){const el=box.querySelector(`[name="production-${k}"]`);if(el && !el.value.trim() && v){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}}if(result.factReview&&['completed','unavailable'].includes(result.factReview.status)){const pending={status:result.factReview.status,warnings:(result.warnings||[]).filter(w=>typeof w==='string').slice(0,8).map(w=>w.slice(0,1000))};generationReviews.set(`${inputKey(box)}|${mode==='live'?'live':'post'}`,pending);}const remaining=missingProductionFields(Object.fromEntries(keys.map(k=>[k,value(`production-${k}`)])),mode==='live',mode);let pageWarning='';if(mode==='image' && value('production-shots').trim())try{parseImagePages(value('production-shots'));}catch(error){pageWarning=`图文暂不能出图：${error.message}。`;}target.textContent=(remaining.length?`已填入部分空白项；仍需补充：${remaining.map(k=>PRODUCTION_FIELDS[k]).join('、')}。可再次生成或手工补充，并核对事实。`:'已填入空白项，请检查完整度并核对事实后保存。')+(result.fields?.imagePlan?(result.fields?.shots?' 已提取逐页文字，原始画面建议保存在单独字段，请逐页核对。':' 模型返回的逐页文字无法安全分离；原始建议已保存在画面建议中，请手工整理。'):'')+pageWarning+(result.warnings||[]).map(w=>` ${w}`).join('');}catch(error){target.textContent=error.message;toast(error.message);}finally{button.disabled=false;}return; }
    if (action === 'cover-photo') {
      const target=box.querySelector('[data-production-status]'),fileInput=box.querySelector('[data-cover-background]'),file=fileInput?.files?.[0],line=value('production-cover').trim(),mode=value('production-live'),key=inputKey(box);
      const findPack=()=>{const c=getWorkspace().customers.find(c=>c.id===data.customerId);return [...(c?.drops||[]),...(c?.packs||[])].find(p=>p.id===data.packId);};
      const initial=findPack(),source=JSON.stringify(initial && packAsSent(initial).shells?.[data.platform]?.[data.index]);
      try {
        if(!file)throw new Error('请先选择封面背景图片');
        if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>8*1024*1024 || !file.size)throw new Error('请选择不超过 8 MB 的 PNG、JPEG 或 WebP 图片');
        if(!line || Array.from(line).length>28)throw new Error('请填写 1 至 28 个字的封面文字');
        button.disabled=true;target.textContent='正在制作图片封面…';
        const objectUrl=URL.createObjectURL(file);let image;
        try{image=new Image();image.src=objectUrl;await image.decode();}finally{URL.revokeObjectURL(objectUrl);}
        const w=image.naturalWidth,h=image.naturalHeight;
        if(!w||!h||w*h>25_000_000)throw new Error('图片尺寸无效或超过 2500 万像素');
        const current=findPack();if(!box.isConnected || fileInput.files?.[0]!==file || value('production-live')!==mode || value('production-cover').trim()!==line || !current || JSON.stringify(packAsSent(current).shells?.[data.platform]?.[data.index])!==source)throw new Error('制作期间图片、文字、类型或原稿已变更，请重新制作');
        const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1200;const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法制作封面');
        const scale=Math.max(900/w,1200/h),drawWidth=w*scale,drawHeight=h*scale;context.drawImage(image,(900-drawWidth)/2,(1200-drawHeight)/2,drawWidth,drawHeight);
        context.fillStyle='rgba(0,0,0,.64)';context.fillRect(0,740,900,460);context.fillStyle='#fff';context.font='bold 70px sans-serif';context.textBaseline='middle';const chars=Array.from(line),lines=[];while(chars.length)lines.push(chars.splice(0,7).join(''));lines.forEach((text,i)=>context.fillText(text,60,970+(i-(lines.length-1)/2)*95,780));
        const url=canvas.toDataURL('image/png');generatedCovers.set(key,{line,source,url,kind:'local-photo'});while(generatedCovers.size>10)generatedCovers.delete(generatedCovers.keys().next().value);
        const preview=box.querySelector('[data-ai-cover-preview]'),link=box.querySelector('[data-ai-cover-download]');preview.src=url;preview.hidden=false;link.href=url;link.hidden=false;target.textContent='图片封面已制作，请核对裁切和文字后保存素材包。';
      }catch(error){target.textContent=error.message||'图片读取失败，请更换图片';toast(target.textContent);}finally{button.disabled=false;}
      return;
    }
    if (action === 'cover-ai') {
      const line=value('production-cover').trim(), layout=value('production-coverLayout').trim(), key=inputKey(box), target=box.querySelector('[data-production-status]');
      if(!line || Array.from(line).length>28){toast('请填写 1 至 28 个字的封面文字');return;}
      if(layout.length>2000){toast('封面排版说明需为2000字以内的文字');return;}
      const findPack=()=>{const c=getWorkspace().customers.find(c=>c.id===data.customerId);return [...(c?.drops||[]),...(c?.packs||[])].find(p=>p.id===data.packId);};
      const startPack=findPack(), source=JSON.stringify(startPack && packAsSent(startPack).shells?.[data.platform]?.[data.index]);
      if(coverGenerating.has(key)){toast('封面正在生成，请稍候');return;}
      coverGenerating.add(key);button.disabled=true;target.textContent='正在生成 AI 封面…';
      try {
        const response=await fetch('/api/production-cover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,line,layout})});const result=await response.json();if(!response.ok)throw new Error(result.error || '出图失败');
        const assertCurrent=()=>{
          const currentPack=findPack();if(!currentPack || JSON.stringify(packAsSent(currentPack).shells?.[data.platform]?.[data.index])!==source)throw new Error('生成期间原稿已变更，请重新生成');
          const currentBox=[...document.querySelectorAll('[data-growth-pack]')].find(el=>inputKey(el)===key && el.querySelector('[name="production-cover"]'));
          const currentLine=currentBox?.querySelector('[name="production-cover"]')?.value ?? postInputs.get(key)?.['production-cover'] ?? line;
          const currentLayout=currentBox?.querySelector('[name="production-coverLayout"]')?.value ?? postInputs.get(key)?.['production-coverLayout'] ?? layout;
          if(currentLine.trim()!==line || currentLayout.trim()!==layout)throw new Error('生成期间封面文字或排版说明已变更，请重新生成');
        };
        assertCurrent();
        if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.image || ''))throw new Error('出图结果格式不正确');
        const image=new Image();image.src=result.image;await image.decode();const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1200;const c=canvas.getContext('2d');if(!c)throw new Error('浏览器无法制作封面');
        c.drawImage(image,0,0,900,1200);c.fillStyle='rgba(0,0,0,.64)';c.fillRect(0,740,900,460);c.fillStyle='#fff';c.font='bold 70px sans-serif';c.textBaseline='middle';const chars=Array.from(line),lines=[];while(chars.length)lines.push(chars.splice(0,7).join(''));lines.forEach((text,i)=>c.fillText(text,60,970+(i-(lines.length-1)/2)*95,780));
        assertCurrent();const url=canvas.toDataURL('image/png');generatedCovers.set(key,{line,layout,source,url});while(generatedCovers.size>10)generatedCovers.delete(generatedCovers.keys().next().value);
        const liveBox=[...document.querySelectorAll('[data-growth-pack]')].find(el=>inputKey(el)===key && el.querySelector('[name="production-cover"]'));
        if(liveBox && liveBox.querySelector('[name="production-cover"]').value.trim()===line){const preview=liveBox.querySelector('[data-ai-cover-preview]'),link=liveBox.querySelector('[data-ai-cover-download]');preview.src=url;preview.hidden=false;link.href=url;link.hidden=false;liveBox.querySelector('[data-production-status]').textContent='封面已生成，请核对图片和文字后下载。';}
        else toast('封面已生成，请回到该作品查看并下载');
      } catch(error){if(box.isConnected)target.textContent=error.message;toast(error.message);}finally{coverGenerating.delete(key);button.disabled=false;const active=[...document.querySelectorAll('[data-growth-pack]')].find(el=>inputKey(el)===key && el.querySelector('[data-growth-action=cover-ai]'));if(active)active.querySelector('[data-growth-action=cover-ai]').disabled=false;}
      return;
    }
    if (action === 'production-outline') { const text=value('production-script').trim();if(!text){toast('请先填写或载入正文');return;}let suggestions;if(value('production-live')==='live')suggestions={liveSegments:text,liveOpen:'本场主题：'+(value('production-title').trim() || '请填写主题'),liveInteraction:'你目前最想了解哪一部分？',liveClose:'回顾本场的主要内容。'};else if(value('production-live')==='image'){const lines=text.split(/\n+/).map(s=>s.trim()).filter(Boolean);if(lines.length<1 || lines.length>10){toast('正文需有1至10段，才能按原文填充逐页内容；也可手动填写');return;}suggestions={shots:lines.join('\n')};}else suggestions={shots:'镜头 1：介绍主题\n镜头 2：展示正文中的证据或步骤\n镜头 3：总结与收尾'};for(const [k,v] of Object.entries(suggestions)){const el=box.querySelector(`[name="production-${k}"]`);if(el && !el.value.trim()){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}}box.querySelector('[data-production-status]').textContent='已填入空白字段，请核对并保存。';return; }
    if (action === 'production-check') { const fields=Object.fromEntries(Object.keys(PRODUCTION_FIELDS).map(k=>[k,value(`production-${k}`)]));const customer=getWorkspace().customers.find(c=>c.id===data.customerId),pack=[...(customer?.drops||[]),...(customer?.packs||[])].find(p=>p.id===data.packId),mode=value('production-live');const issues=productionIssues(fields,mode==='live',data.platform,customer?.creationStandards,mode,pack?.workReferences || []);box.querySelector('[data-production-status]').textContent=issues.length?issues.join('；'):'必填字段已填写；仍需人工核对事实和发布要求。';return; }
    if (action === 'production-download') { const fields=Object.fromEntries(Object.keys(PRODUCTION_FIELDS).map(k=>[k,value(`production-${k}`)]));const text=productionDocument(fields,value('production-live'),data.platform);const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='harta-script.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return; }
    if (action === 'cover-download') {
      const line=value('production-cover').trim();if(!line || Array.from(line).length>28){toast('请填写 1 至 28 个字的封面文字');return;}
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1200;const ctx=canvas.getContext('2d');if(!ctx){toast('浏览器无法制作封面');return;}
      const style=value('cover-template'), palette=style==='paper'?['#ecebe5','#181512']:style==='rose'?['#c9256d','#fff']:['#171512','#fff'];ctx.fillStyle=palette[0];ctx.fillRect(0,0,900,1200);ctx.fillStyle=palette[1];ctx.font='bold 76px sans-serif';ctx.textBaseline='middle';const chars=Array.from(line);const lines=[];while(chars.length)lines.push(chars.splice(0,7).join(''));lines.forEach((text,i)=>ctx.fillText(text,70,500+(i-(lines.length-1)/2)*105,760));const url=canvas.toDataURL('image/png'),key=inputKey(box),customer=getWorkspace().customers.find(c=>c.id===data.customerId),pack=[...(customer?.drops||[]),...(customer?.packs||[])].find(p=>p.id===data.packId),source=JSON.stringify(pack && packAsSent(pack).shells?.[data.platform]?.[data.index]);generatedCovers.set(key,{line,source,url,template:style});while(generatedCovers.size>10)generatedCovers.delete(generatedCovers.keys().next().value);const preview=box.querySelector('[data-ai-cover-preview]'),link=box.querySelector('[data-ai-cover-download]');preview.src=url;preview.hidden=false;link.href=url;link.hidden=false;const a=document.createElement('a');a.download='harta-cover.png';a.href=url;a.click();return;
    }
    if (action === 'remove-fact') { button.closest('.growth-fact').remove(); settingsInputs.set(data.customerId,{...settingsInputs.get(data.customerId),cards:readCards(box)}); return; }
    if (action === 'add-fact') { box.querySelector('[data-facts]').insertAdjacentHTML('beforeend',factRow()); settingsInputs.set(data.customerId,{...settingsInputs.get(data.customerId),cards:readCards(box)}); return; }
    if (action === 'suggest') { document.querySelector('[data-workspace-view="research"]')?.click(); const field=document.getElementById('growth-direction');const combined=[field.value,button.dataset.suggestion].filter(Boolean).join('\n'); if(combined.length>2000){toast('当前方向接近2000字，请先精简后再加入建议');return;}field.value=combined;document.getElementById('growth-edit-panel').open=true;field.focus();field.scrollIntoView({block:'center'});return; }
    const customer = getWorkspace().customers.find(c=>c.id===data.customerId), pack=[...(customer?.drops || []),...(customer?.packs || [])].find(p=>p.id===data.packId);
    if(action==='studio-return-apply' || action==='studio-return-discard'){
      button.disabled=true;try{await save('/api/studio-return-action',{...data,draftId:button.dataset.draft,action:action==='studio-return-apply'?'apply':'discard'});toast(action==='studio-return-apply'?'已采用工作室文案，发布需另行登记':'已舍弃送回的文案');}catch(error){toast(error.message);const status=box.querySelector('[data-production-status]');if(status)status.textContent=error.message;}finally{button.disabled=false;}return;
    }
    if (action === 'template') { download({ rows:Object.entries(pack.shells).flatMap(([platform,items])=>items.map((_,index)=>({platform,index,start:'',end:'',source:'',criteria:pack.origin?.criteria || '',metrics:Object.fromEntries(Object.keys(METRICS).map(k=>[k,null])),baseline:null,baselineNote:'',baselineViews:null,baselineViewsNote:'',note:''}))) },'harta-outcomes-template.json');return; }
    if (action === 'export') { download({ packId:pack.id,goal:pack.origin?.goal || 'leads',criteria:pack.origin?.criteria || '',outcomes:pack.outcomes || {} },'harta-outcomes-history.json');return; }
    const savingKey=action==='production-save'?inputKey(box):'';
    if(savingKey && productionSaving.has(savingKey)){toast('当前作品正在保存，请稍候再保存另一份草稿');return;}
    if(savingKey)productionSaving.add(savingKey);
    const rewriteButtons=action==='rewrite'?[...box.querySelectorAll('[data-growth-action="rewrite"]')]:[]; rewriteButtons.forEach(b=>b.disabled=true);
    button.disabled=true;const status=box.querySelector(action.startsWith('profile')?'[data-profile-status]':'[data-growth-status], [data-production-status]');if(status)status.textContent=action==='rewrite'?'正在帮你改，原文会保留…':'正在保存…';
    try {
      if(action==='goal') { const sent={goal:value('goal'),criteria:value('criteria')}; await save('/api/growth-goal',{customerId:data.customerId,...sent},()=>clearSaved(settingsInputs,data.customerId,sent)); }
      if(action==='standards') {
        const sent={'standard-preferences':value('standard-preferences'),'standard-forbidden':value('standard-forbidden'),'standard-rules-json':JSON.stringify(readStandardRules(box))};
        await save('/api/creation-standards',{customerId:data.customerId,version:settingsInputs.get(data.customerId)?.__standardVersion ?? Number(button.dataset.version),preferences:sent['standard-preferences'],forbidden:sent['standard-forbidden'],rules:JSON.parse(sent['standard-rules-json'])},result=>{
          clearSaved(settingsInputs,data.customerId,sent);
          const pending=settingsInputs.get(data.customerId);if(pending){if(Object.keys(pending).some(k=>k.startsWith('standard-')))pending.__standardVersion=result.customers.find(c=>c.id===data.customerId).creationStandards.version;else delete pending.__standardVersion;}
        });
      }
      if(['profile','profile-save-draft','profile-adopt-field','profile-clear-field'].includes(action)) {
        const key=button.dataset.profileKey, single=['profile-adopt-field','profile-clear-field'].includes(action);
        const keys=single?[key]:Object.keys(PROFILE_FIELDS),sent=Object.fromEntries(keys.map(k=>[`profile-${k}`,value(`profile-${k}`)]));
        const fields=Object.fromEntries(keys.map(k=>[k,sent[`profile-${k}`]]));
        const basis={version:Number(button.dataset.version),draftVersion:Number(button.dataset.draftVersion)};
        await save('/api/creator-profile',{customerId:data.customerId,...basis,fields,key,action:action==='profile'?'adopt-all':action.slice('profile-'.length)},result=>{
          if(action!=='profile-clear-field')clearSaved(settingsInputs,data.customerId,sent);
          const pending=settingsInputs.get(data.customerId),saved=result.customers.find(c=>c.id===data.customerId);
          if(pending){if(Object.keys(pending).some(k=>k.startsWith('profile-')))pending.__profileBasis={version:saved.creatorProfile?.version || 0,draftVersion:saved.creatorProfileDraft?.version || 0};else delete pending.__profileBasis;if(!Object.keys(pending).length)settingsInputs.delete(data.customerId);}
        });
        const currentBox=[...document.querySelectorAll('[data-growth-customer]')].find(el=>el.dataset.growthCustomer===data.customerId&&!el.dataset.growthPack);
        const currentStatus=currentBox?.querySelector('[data-profile-status]');
        if(currentStatus)currentStatus.textContent=action==='profile-clear-field'?'已撤回，不再用于新创作；草稿仍保留':action==='profile-save-draft'?'本次提交的草稿已保存，尚未用于创作':'本次提交的资料已采用';
      }
      if(action==='adopt-memory') await save('/api/creator-memory',{...data,action:'adopt',outcomeId:button.dataset.outcome});
      if(action==='retire-memory') await save('/api/creator-memory',{customerId:data.customerId,action:'retire',memoryId:button.dataset.memory});
      if(action==='packs') { const sent=Object.fromEntries(['selected','name','instruction','platform','form','goal','job'].map(k=>[`pack-${k}`,value(`pack-${k}`)])); await save('/api/creator-packs',{customerId:data.customerId,selected:sent['pack-selected'],name:sent['pack-name'],instruction:sent['pack-instruction'],platform:sent['pack-platform'],form:sent['pack-form'],goal:sent['pack-goal'],job:sent['pack-job']},()=>clearSaved(settingsInputs,data.customerId,sent)); }
      if(action==='production-apply') { const saved=pack.productionDrafts?.[`${data.platform}|${data.index}`];if(!saved || saved.live || value('production-job')!==(saved.job ?? contentJob(pack.topicSnapshot?.job)) || value('production-playPackId')!==(saved.playPackId || '') || value('production-live')!==(saved.format || pack.origin?.format || (data.platform==='公众号'?'article':'video')) || Object.keys(PRODUCTION_FIELDS).some(k=>value(`production-${k}`).trim()!==(saved.fields[k] || '').trim()))throw new Error('请先保存当前制作草稿，再采用');await save('/api/production-apply',{...data,version:Number(button.dataset.version),confirmed:true,recordPlay:box.querySelector('[data-production-record-play]')?.checked === true}); }
      if(action==='production-save') { const sent=Object.fromEntries(Object.keys(PRODUCTION_FIELDS).map(k=>[`production-${k}`,value(`production-${k}`)])); sent['production-live']=value('production-live');sent['production-job']=value('production-job');sent['production-playPackId']=value('production-playPackId');const fields=Object.fromEntries(Object.keys(PRODUCTION_FIELDS).map(k=>[k,sent[`production-${k}`]])),reviewKey=`${inputKey(box)}|${sent['production-live']==='live'?'live':'post'}`,generationReview=generationReviews.get(reviewKey);await save('/api/production-draft',{...data,version:Number(button.dataset.version),live:sent['production-live']==='live',format:sent['production-live']==='live'?'':sent['production-live'],job:sent['production-job'],playPackId:sent['production-playPackId'],fields,...(generationReview?{generationReview}:{})},()=>{if(generationReviews.get(reviewKey)===generationReview)generationReviews.delete(reviewKey);const key=inputKey(box), group=sent['production-live']==='live'?'live':'post', active=postInputs.get(key)?.['production-live'] || sent['production-live'];const sentFields=Object.fromEntries(Object.entries(sent).filter(([name])=>name!=='production-live'));clearSaved(productionPending,`${key}|${group}`,sentFields);if((active==='live')===(group==='live'))clearSaved(postInputs,key,sentFields);postInputs.set(key,{...(postInputs.get(key)||{}),'production-live':active});}); }
      if(action==='remove-pack') await save('/api/creator-packs',{customerId:data.customerId,selected:customer.creatorPackSettings?.selected || '',removeId:button.dataset.packId});
      if(action==='extract-facts') { const existing=[...box.querySelectorAll('.growth-fact')].map(row=>Object.fromEntries(['text','source','scope','status'].map(k=>[k,row.querySelector(`[name="fact-${k}"]`).value]))); const saved=(customer.factCards || []).map(card=>Object.fromEntries(['text','source','scope','status'].map(k=>[k,card[k] || '']))); if(JSON.stringify(existing)!==JSON.stringify(saved))throw new Error('请先保存当前事实卡修改，再整理更多事实，避免丢失未保存内容'); await save('/api/growth-facts/extract',{customerId:data.customerId},()=>clearSaved(settingsInputs,data.customerId,{cards:existing})); document.getElementById('growth-settings').dataset.customer=''; render(); }
      if(action==='facts') { const cards=readCards(box); await save('/api/growth-facts',{customerId:data.customerId,cards},()=>clearSaved(settingsInputs,data.customerId,{cards})); }
      if(action==='rewrite') await save('/api/post-rewrite',{...data,instruction:button.dataset.instruction || value('rewrite-instruction')});
      if(action==='apply'||action==='restore') await save('/api/post-version',{...data,draftId:button.dataset.draft,restoreId:button.dataset.version});
      toast(action==='profile-save-draft'?'草稿已保存，尚未用于创作':action==='rewrite'?'改好了，看看是否满意':action==='apply'||action==='restore'?'版本已更新；如已发布，请自行同步平台内容':'已保存');
    } catch(error) { toast(error.message);if(status)status.textContent=error.message; } finally { if(savingKey)productionSaving.delete(savingKey);button.disabled=false; rewriteButtons.forEach(b=>b.disabled=false); }
  });
  document.addEventListener('submit',async event=>{
    if(!event.target.matches('[data-outcome-form]'))return;event.preventDefault();
    const form=event.target,{box,...data}=context(form),values=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type="submit"]');button.disabled=true;
    try { const metrics=Object.fromEntries(Object.keys(METRICS).filter(k=>values[k]!=='').map(k=>[k,Number(values[k])]));await save('/api/growth-outcomes',{customerId:data.customerId,packId:data.packId,rows:[{...values,platform:data.platform,index:data.index,metrics,baseline:values.baseline===''?null:Number(values.baseline),baselineViews:values.baselineViews==null||values.baselineViews===''?null:Number(values.baselineViews)}]},()=>{clearSaved(postInputs,inputKey(box),values);clearSaved(outcomeBaselineDrafts,`${inputKey(box)}|${form.dataset?.outcomeGoal}`,values);});toast('效果快照已保存，不会自动改变生成方向'); } catch(error){toast(error.message);}finally{button.disabled=false;}
  });
  document.addEventListener('change',async event=>{
    if(event.target.id !== 'quick-growth-goal')return;
    const select=event.target,customer=getWorkspace().customers.find(c=>c.id===select.dataset.customer);
    if(!customer)return;
    const previous=growthGoal(customer),next=select.value,generate=document.getElementById('go-today');
    const pendingSettings=settingsInputs.get(customer.id);
    const previousPendingGoal=pendingSettings?.goal;
    if(pendingSettings && Object.hasOwn(pendingSettings,'goal'))pendingSettings.goal=next;
    select.disabled=true;select.dataset.saving='true';generate.disabled=true;
    try {
      await save('/api/growth-goal',{customerId:customer.id,goal:next,criteria:customer.growthCriteria || ''},()=>clearSaved(settingsInputs,customer.id,{goal:next}));
      toast('已记住，接下来按这个目标生成');
    } catch(error) {if(pendingSettings?.goal===next)pendingSettings.goal=previousPendingGoal;if(select.dataset.customer===customer.id)select.value=previous;toast(error.message);}
    finally {delete select.dataset.saving;render();const busy=Boolean(getWorkspace().customers.find(c=>c.id===generate.dataset.customer)?.job);select.disabled=busy;generate.disabled=busy;}
  });
  document.addEventListener('change',async event=>{
    if(!event.target.matches('[data-outcome-import]'))return;
    const field=event.target,file=field.files?.[0];if(!file)return;const {customerId,packId}=context(field);
    try{if(file.size>60000)throw new Error('导入文件不能超过60KB');const value=JSON.parse(await file.text());await save('/api/growth-outcomes',{customerId,packId,rows:value.rows});toast('整批效果已导入');}catch(error){toast(error.message);}finally{field.value='';}
  });
}
