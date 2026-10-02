import { FIELD_LABELS } from './platform-content.js';
import { GROWTH_GOALS, GROWTH_BRIEF_LABELS, METRICS, growthGoal, outcomeAssessment } from './growth.js';
export const SIMPLE_GOALS = { reach: '让更多人看到', spread: '让更多人转发', leads: '让更多人咨询', sales: '让更多人下单' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const attrs = (customerId, pack, platform, index) => `data-growth-customer="${esc(customerId)}" data-growth-pack="${esc(pack.id)}" data-growth-platform="${esc(platform)}" data-growth-index="${index}"`;
const input = (name, label, value = '', type = 'text', maxLength = 1000) => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'min="0" step="any"' : `maxlength="${maxLength}"`}></label>`;
// Keep unsent inputs through asynchronous renders and customer/batch switches.
const postInputs = new Map();
const settingsInputs = new Map();
const settingsRendered = new WeakMap();
const inputKey = box => JSON.stringify([box.dataset.growthCustomer, box.dataset.growthPack, box.dataset.growthPlatform, box.dataset.growthIndex]);
const readCards = box => [...box.querySelectorAll('.growth-fact')].map(row => Object.fromEntries(['text','source','scope','status'].map(k => [k,row.querySelector(`[name="fact-${k}"]`).value])));
const rememberInput = field => {
  const box = field.closest('[data-growth-customer]');
  if (!box || !field.name) return;
  if (box.dataset.growthPack) {
    const key = inputKey(box), values = postInputs.get(key) || {};
    values[field.name] = field.value;
    postInputs.set(key, values);
  } else {
    const key = box.dataset.growthCustomer, values = settingsInputs.get(key) || {};
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
const factRow = (card = {}) => `<div class="growth-fact"><label>业务事实<textarea name="fact-text" maxlength="1500" rows="2">${esc(card.text)}</textarea></label>${input('fact-source', '来源文件与位置 / 确认人', card.source,'text',500)}${input('fact-scope', '适用范围与有效期', card.scope,'text',500)}<label>状态<select name="fact-status">${[['pending','待确认'],['confirmed','我已确认'],['retired','已停用']].map(([v,l])=>`<option value="${v}" ${card.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" class="textish" data-growth-action="remove-fact">移除这条</button></div>`;
export function renderGrowthSettings(customer) {
  const container = document.getElementById('growth-settings');
  if (!container) return;
  const signature = JSON.stringify([customer.id,customer.growthGoal,customer.growthCriteria,customer.factCards,customer.factExtraction?.coverage]);
  if (container.dataset.customer === customer.id && settingsRendered.get(container) === signature) return;
  settingsRendered.set(container, signature);
  container.dataset.customer = customer.id;
  const pending = settingsInputs.get(customer.id) || {};
  customer = { ...customer, growthGoal: pending.goal ?? customer.growthGoal, growthCriteria: pending.criteria ?? customer.growthCriteria, factCards: pending.cards ?? customer.factCards };
  container.innerHTML = `<div data-growth-customer="${esc(customer.id)}"><label>这批内容最想带来什么？<select name="goal">${Object.entries(GROWTH_GOALS).map(([k,v])=>`<option value="${k}" ${growthGoal(customer) === k ? 'selected' : ''}>${SIMPLE_GOALS[k]}</option>`).join('')}</select></label><details><summary>补充要求（选填）</summary><label>你想吸引谁、卖什么？<textarea name="criteria" rows="2" maxlength="1000" placeholder="例如：杭州有局部翻新计划、愿意进一步沟通的业主；或明确本批想促进购买的产品。">${esc(customer.growthCriteria || '')}</textarea></label></details><button class="btn" type="button" data-growth-action="goal">保存设置</button><p class="meta">不确定就用默认设置，直接生成即可。</p>
  <details><summary>核对业务信息（选填）</summary><p class="meta">价格、服务范围和承诺等可在这里逐条确认。填写来源与适用范围；待确认和已停用的内容不能写成经营事实。资料有冲突时需先澄清。</p><button class="btn ghost" type="button" data-growth-action="extract-facts">从已读资料整理待确认事实</button><p class="meta">${esc(customer.factExtraction?.coverage || '')}</p><div data-facts>${(customer.factCards || []).map(factRow).join('')}</div><div class="acts"><button class="btn ghost" type="button" data-growth-action="add-fact">增加事实</button><button class="btn" type="button" data-growth-action="facts">保存事实</button></div></details></div>`;
}
export function renderPostGrowth(customerId, pack, platform, index) {
  const values = postInputs.get(JSON.stringify([customerId,pack.id,platform,String(index)])) || {};
  const field = (name,label,type='text') => input(name,label,values[name] || '',type);
  const hasOutcomeDraft = Object.keys(values).some(name => name !== 'rewrite-instruction');
  const key = `${platform}|${index}`, execution = pack.execution?.[index], goal = pack.origin.goal || 'leads';
  const rows = pack.outcomes?.[key] || [], row = rows[0], assessment = outcomeAssessment(goal, row);
  const draft = pack.rewriteDrafts?.[key], versions = pack.postVersions?.[key] || [];
  return `<div class="post-growth" ${attrs(customerId, pack, platform, index)}>
  <details ${draft || values['rewrite-instruction'] ? 'open' : ''}><summary>帮我改一下</summary><div class="acts rewrite-shortcuts">${[['更吸引人','把标题和开头写得更具体、更有吸引力，正文兑现标题，不编造事实。'],['更像真人说话','改成自然口语，减少套话，保留事实和关键信息。'],['再短一点','删掉重复和空泛表达，保留关键信息与平台必需字段。']].map(([label,instruction])=>`<button type="button" class="btn ghost" data-growth-action="rewrite" data-instruction="${esc(instruction)}">${label}</button>`).join('')}</div><label>也可以直接告诉我怎么改<textarea name="rewrite-instruction" rows="2" maxlength="2000" placeholder="例如：开头更具体，保留正文里的核对方法；减少泛泛介绍。">${esc(values['rewrite-instruction'] || '')}</textarea></label><button type="button" class="btn ghost" data-growth-action="rewrite">按我的要求修改</button><p class="meta">改好后你再决定用不用，原来的版本会保留。</p>
  ${draft ? `<div class="rewrite-preview"><h4>改好了，看看这个版本</h4>${Object.entries(draft.candidate.content).map(([k,v])=>`<p><b>${esc(FIELD_LABELS[k] || k)}</b></p><p class="asis">${esc(v)}</p>`).join('')}<button type="button" class="btn" data-growth-action="apply" data-draft="${esc(draft.id)}">采用这个版本</button></div>` : ''}
  ${versions.length ? `<details><summary>历史版本（${versions.length}）</summary>${versions.map(v=>`<div><p>${esc(v.at)}</p><p class="asis">${esc(Object.values(v.content || {}).join('\n\n'))}</p><button type="button" class="textish" data-growth-action="restore" data-version="${esc(v.id)}">恢复此版本</button></div>`).join('')}</details>` : ''}</details><details class="post-advanced" ${hasOutcomeDraft ? 'open' : ''}><summary>更多选项</summary>  ${execution?.growth ? `<details class="content-brief"><summary>查看生成说明</summary>${Object.entries(GROWTH_BRIEF_LABELS).map(([k,l])=>`<p><b>${l}：</b>${esc(execution.growth[k])}</p>`).join('')}<p class="meta">本批结果条件：${esc(pack.origin.criteria || '尚未定义具体达标条件')}。这是待验证的计划，尚非已取得的效果。</p></details>` : ''}
  <details ${hasOutcomeDraft ? 'open' : ''}><summary>记录发布效果${row ? ' · 已有记录' : ' · 待验证'}</summary><p>${esc(assessment.text)}</p>
  ${row ? `<p class="meta">${esc(row.start)} 至 ${esc(row.end)} · 来源：${esc(row.source)}<br>口径：${esc(row.criteria || '未填写')}<br>基线说明：${esc(row.baselineNote || '无')}<br>${Object.entries(row.metrics).map(([k,v])=>`${esc(METRICS[k])}：${v}`).join(' · ')}</p>` : ''}
  ${assessment.suggestion ? `<p>${esc(assessment.suggestion)}</p><button type="button" class="textish" data-growth-action="suggest" data-suggestion="${esc(assessment.suggestion)}">放入调整方向，编辑后保存</button>` : ''}
  <form data-outcome-form><p class="meta">填写平台或业务记录中的实际结果，未知请留空，零代表确实为零。每次保存一份快照，重叠窗口不相加。请确认下方当前文案与所记录的发布版本一致。</p><div class="growth-fields">${field('start','统计开始','date')}${field('end','统计结束','date')}${Object.entries(METRICS).map(([k,l])=>field(k,l,'number')).join('')}</div>${field('source','数据来源（后台文件名 / 核对记录）')}${field('criteria','有效客资、去重或订单归因口径')}${field('baseline',`同口径基线：${METRICS[GROWTH_GOALS[goal]?.metric || 'qualifiedLeads']}`,'number')}${field('baselineNote','基线来源、相同平台与统计窗口')}${field('note','备注（投流、发布时间等差异）')}<button class="btn" type="submit">保存记录</button></form>
  ${rows.length ? `<details><summary>查看 ${rows.length} 次记录</summary>${rows.map(r=>`<p>${esc(r.start)} 至 ${esc(r.end)} · ${esc(r.source)}<br>${Object.entries(r.metrics).map(([k,v])=>`${esc(METRICS[k])}：${v}`).join(' · ')}<br><span class="meta">保存于 ${esc(r.recordedAt)}；${esc(r.note)}</span></p><details><summary>当时关联的文案</summary><p class="asis">${esc(Object.values(r.content || {}).join('\n\n'))}</p></details>`).join('')}</details>` : ''}
  <div class="acts"><button class="textish" type="button" data-growth-action="template">下载本批效果导入模板</button><button class="textish" type="button" data-growth-action="export">导出本批效果记录</button><label class="textish">导入填写后的 JSON<input type="file" data-outcome-import accept=".json,application/json"></label></div></details>
</details><p class="meta" data-growth-status role="status"></p></div>`;
}
export function installGrowthUI({ getWorkspace, setWorkspace, render, toast }) {
  const context = el => { const box = el.closest('[data-growth-customer]'); return { box, customerId: box.dataset.growthCustomer, packId: box.dataset.growthPack, platform: box.dataset.growthPlatform, index: Number(box.dataset.growthIndex) }; };
  document.addEventListener('input', event => rememberInput(event.target));
  document.addEventListener('change', event => rememberInput(event.target));
  async function save(url, data, onSaved = () => {}) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '保存失败');
    onSaved(); setWorkspace(result); render();
  }
  const download = (value, filename) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})); const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-growth-action]'); if (!button) return;
    const action = button.dataset.growthAction, { box, ...data } = context(button);
    const value = name => box.querySelector(`[name="${name}"]`)?.value || '';
    if (action === 'remove-fact') { button.closest('.growth-fact').remove(); settingsInputs.set(data.customerId,{...settingsInputs.get(data.customerId),cards:readCards(box)}); return; }
    if (action === 'add-fact') { box.querySelector('[data-facts]').insertAdjacentHTML('beforeend',factRow()); settingsInputs.set(data.customerId,{...settingsInputs.get(data.customerId),cards:readCards(box)}); return; }
    if (action === 'suggest') { document.querySelector('[data-workspace-view="research"]')?.click(); const field=document.getElementById('growth-direction');const combined=[field.value,button.dataset.suggestion].filter(Boolean).join('\n'); if(combined.length>2000){toast('当前方向接近2000字，请先精简后再加入建议');return;}field.value=combined;document.getElementById('growth-edit-panel').open=true;field.focus();field.scrollIntoView({block:'center'});return; }
    const customer = getWorkspace().customers.find(c=>c.id===data.customerId), pack=[...(customer?.drops || []),...(customer?.packs || [])].find(p=>p.id===data.packId);
    if (action === 'template') { download({ rows:Object.entries(pack.shells).flatMap(([platform,items])=>items.map((_,index)=>({platform,index,start:'',end:'',source:'',criteria:pack.origin.criteria || '',metrics:{views:null,shares:null,inquiries:null,qualifiedLeads:null,orders:null,revenue:null,refunds:null,cost:null},baseline:null,baselineNote:'',note:''}))) },'harta-outcomes-template.json');return; }
    if (action === 'export') { download({ packId:pack.id,goal:pack.origin.goal,criteria:pack.origin.criteria,outcomes:pack.outcomes || {} },'harta-outcomes-history.json');return; }
    const rewriteButtons=action==='rewrite'?[...box.querySelectorAll('[data-growth-action="rewrite"]')]:[]; rewriteButtons.forEach(b=>b.disabled=true);
    button.disabled=true;const status=box.querySelector('[data-growth-status]');if(status)status.textContent=action==='rewrite'?'正在帮你改，原文会保留…':'正在保存…';
    try {
      if(action==='goal') { const sent={goal:value('goal'),criteria:value('criteria')}; await save('/api/growth-goal',{customerId:data.customerId,...sent},()=>clearSaved(settingsInputs,data.customerId,sent)); }
      if(action==='extract-facts') { const existing=[...box.querySelectorAll('.growth-fact')].map(row=>Object.fromEntries(['text','source','scope','status'].map(k=>[k,row.querySelector(`[name="fact-${k}"]`).value]))); const saved=(customer.factCards || []).map(card=>Object.fromEntries(['text','source','scope','status'].map(k=>[k,card[k] || '']))); if(JSON.stringify(existing)!==JSON.stringify(saved))throw new Error('请先保存当前事实卡修改，再整理更多事实，避免丢失未保存内容'); await save('/api/growth-facts/extract',{customerId:data.customerId},()=>clearSaved(settingsInputs,data.customerId,{cards:existing})); document.getElementById('growth-settings').dataset.customer=''; render(); }
      if(action==='facts') { const cards=readCards(box); await save('/api/growth-facts',{customerId:data.customerId,cards},()=>clearSaved(settingsInputs,data.customerId,{cards})); }
      if(action==='rewrite') await save('/api/post-rewrite',{...data,instruction:button.dataset.instruction || value('rewrite-instruction')});
      if(action==='apply'||action==='restore') await save('/api/post-version',{...data,draftId:button.dataset.draft,restoreId:button.dataset.version});
      toast(action==='rewrite'?'改好了，看看是否满意':action==='apply'||action==='restore'?'版本已更新；如已发布，请自行同步平台内容':'已保存');
    } catch(error) { toast(error.message);if(status)status.textContent=error.message; } finally { button.disabled=false; rewriteButtons.forEach(b=>b.disabled=false); }
  });
  document.addEventListener('submit',async event=>{
    if(!event.target.matches('[data-outcome-form]'))return;event.preventDefault();
    const form=event.target,{box,...data}=context(form),values=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type="submit"]');button.disabled=true;
    try { const metrics=Object.fromEntries(Object.keys(METRICS).filter(k=>values[k]!=='').map(k=>[k,Number(values[k])]));await save('/api/growth-outcomes',{customerId:data.customerId,packId:data.packId,rows:[{...values,platform:data.platform,index:data.index,metrics,baseline:values.baseline===''?null:Number(values.baseline)}]},()=>clearSaved(postInputs,inputKey(box),values));toast('效果快照已保存，不会自动改变生成方向'); } catch(error){toast(error.message);}finally{button.disabled=false;}
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
