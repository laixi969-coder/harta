import { AGENT_RECIPES, AGENT_SCENARIOS, AGENT_PLAYBOOK_VERSION, recipe } from './agent-recipes.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {draft:'草稿',enabled:'已启用',paused:'已暂停',archived:'已归档',running:'试运行中',completed:'已完成',limited:'规则与模板完成',failed:'失败',interrupted:'已中断',stopped:'已停止'};
const fields = {name:'角色名称',criteria:'怎样才算有效线索',audience:'目标人群与适用条件',region:'服务区域',keywords:'找客关键词',exclusions:'排除词（用逗号分隔）',tone:'交流风格',handoff:'需要人工核对的情况',contentDirection:'内容方向建议'};
const when = date => date ? new Date(date).toLocaleString('zh-CN') : '尚无';
const button = (action,label,attrs='',primary=false) => `<button type="button" class="btn ${primary?'':'ghost'}" data-agent-action="${action}" ${attrs}>${label}</button>`;
const badge = state => `<span class="acq-badge">${esc(labels[state]||state)}</span>`;
const area = (name,label,value='',max=2000) => `<label>${label}<textarea name="${name}" rows="${name==='criteria'?2:3}" maxlength="${max}">${esc(value)}</textarea></label>`;
let ctx, chosen='', filter='all', scenario='normal';
const drafts = new Map();
const trialDrafts = new Map();
const data = () => ctx.getWorkspace().acquisition || {};
const selected = () => ctx.getSelected();
const roles = () => (data().agents||[]).filter(a=>a.customerId===selected());
const tasks = id => (data().tasks||[]).filter(t=>t.agentSnapshot?.id===id);
const runs = id => (data().agentRuns||[]).filter(r=>r.agentId===id).slice().reverse();
const draftKey = a => `${a.id}:${a.versions.at(-1).number}`;
function stash() {
  const f=document.querySelector('[data-agent-form=config]');
  if(f?.dataset.dirty==='true')drafts.set(f.dataset.key,readConfig(f));
  const t=document.querySelector('[data-agent-form=trial]');
  if(t)trialDrafts.set(t.dataset.id,Object.fromEntries([...t.elements].filter(el=>el.name).map(el=>[el.name,el.value])));
}
function readConfig(f) {
  const cfg={...Object.fromEntries(new FormData(f)),mode:'analysis'};
  cfg.duties=[...f.querySelectorAll('[name=duties]:checked')].map(el=>el.value);
  cfg.platforms=[...f.querySelectorAll('[name=platforms]:checked')].map(el=>el.value);
  cfg.bindings=[...f.querySelectorAll('[name=binding]:checked')].map(el=>({accountId:el.value,enabled:el.checked}));
  delete cfg.binding;
  return cfg;
}
function runView(r) {
  const output=r.output;
  return `<details class="agent-run" data-agent-persist="run-${r.id}" ${r.status==='running'?'open':''}><summary>v${r.version} · ${esc(labels[r.status]||r.status)} · ${when(r.startedAt)}</summary><p class="meta">试运行 · ${r.durationMs!=null?`${(r.durationMs/1000).toFixed(1)} 秒`:'耗时待统计'} · 费用未统计</p>${r.error?`<p class="acq-error">${esc(r.error)}</p>`:''}${r.knowledgeChanged?'<p class="acq-notice">运行期间业务资料已改变，此结果仅对应当时的知识快照。</p>':''}<p class="acq-quote">${esc(r.input.text)}</p><p class="meta">${esc(r.input.platform)} · 来源：${esc(r.input.source)}</p>${output?`<h3>${esc(output.assessment.priority)}</h3><p>${esc(output.assessment.reason)}</p><p class="meta">${esc(output.assessment.method)}；不代表购买概率。</p><h3>${esc(output.outputLabel||'回复草稿')}</h3>${output.draft?`<p class="acq-quote">${esc(output.draft)}</p>`:'<p>此场景不生成外发草稿。</p>'}<p class="meta">${output.method==='rule_decision'?'已按规则给出处理建议，未调用模型生成话术。':output.method==='rules_and_template'?'模型未配置，这是示范模板；不代表针对业务生成的成稿。':'模型辅助生成并核对事实，采用前仍需审阅。'}</p><p><strong>下一步：</strong>${esc(output.nextStep)}</p>${output.missing?.length?`<p><strong>待核实：</strong>${esc(output.missing.join('；'))}</p>`:''}<details><summary>本次复核清单</summary>${(output.qualityChecks||[]).map(c=>`<p>${esc(c.name)}：${esc(c.status)}</p>`).join('')}</details><ul>${output.proposedTools.map(t=>`<li>${esc(t.name)}：${t.status==='disabled'?'未调用，'+esc(t.reason):'已使用'}</li>`).join('')}</ul>`:''}<details><summary>运行步骤与当时配置</summary>${r.steps.map(s=>`<p class="meta">${when(s.at)} · ${esc(s.label)}</p>`).join('')}<p class="meta">原文、业务知识与配置均保留本次快照。此样例不会自动进入生产线索池。</p><p>有效条件：${esc(r.configSnapshot.criteria||'待补充')}</p><p>业务简介：${esc(r.businessSnapshot.pitch||'待补充')}</p><p class="acq-quote">${esc(r.businessSnapshot.sourceMaterial||'尚无补充资料')}</p>${(r.warnings||[]).map(w=>`<p>${esc(w)}</p>`).join('')}</details>${r.status!=='running'?button('rerun','用当前版本重新试运行',`data-id="${r.id}"`):''}</details>`;
}
function editor(a) {
  const v=a.versions.at(-1), cfg=drafts.get(draftKey(a))||v.config;
  const accounts=(data().accounts||[]).filter(acc=>acc.customerId===selected());
  const archived=a.status==='archived', history=runs(a.id), running=history.some(r=>r.status==='running');
  const sample=trialDrafts.get(a.id)||{};
  const r=recipe(cfg.recipeId), passed=history.some(run=>run.version===v.number&&run.playbookVersion===AGENT_PLAYBOOK_VERSION&&run.knowledgeHash===v.knowledgeHash&&run.output?.decision!=='hold'&&Boolean(run.output?.draft?.trim())&&['completed','limited'].includes(run.status)&&!run.knowledgeChanged)&&!a.knowledgeChanged;
  const overview=`<section class="acq-panel agent-guide"><p class="meta">${a.status==='enabled'?'已启用 · 可以开始任务':passed&&cfg.criteria?'第 3 步 · 确认满意后启用':!cfg.criteria?'第 1 步 · 为已有助手选一个推荐方案':'第 2 步 · 试一下，再决定是否启用'}</p><h3>${r?esc(r.description):'已有助手配置已保留，可套用内置方案。'}</h3><p>${r?'已读取当前业务资料。提示词、工作步骤和转人工规则由 Harta 配好，你只需核对是否符合业务。':'原有配置保持不变。选择下方推荐方案即可补齐默认规则，无需自己设计。'}</p><ol>${(r?.steps||['读取业务资料','分析需求','生成草稿','人工核对']).map(t=>`<li>${esc(t)}</li>`).join('')}</ol><p><strong>判定标准：</strong>${esc(cfg.criteria||'还未设置，可套用下方推荐配置')}</p><p><strong>需要你处理：</strong>${esc(cfg.handoff)}</p>${a.status==='enabled'?'<p>找客户：在主动获客中选用；接待：在客户跟进中选用。内容策略目前用于本页试运行，生成结果需审阅后使用。平台发布和发送由平台执行页单独管理。</p>':''}<details data-agent-persist="recipe-${a.id}" ${!cfg.criteria?'open':''}><summary>更换用途 / 套用推荐配置</summary><p>应用后保存为新版本；保留所选平台和账号绑定，重新试运行后启用。</p><div class="acts">${AGENT_RECIPES.map(item=>button('recipe',item.name,`data-id="${a.id}" data-recipe="${item.id}" ${archived?'disabled':''}`)).join('')}</div></details></section>`;
  return `<div class="agent-heading"><div><h2>${esc(v.config.name)}</h2><p class="meta">v${v.number} · ${badge(a.status)} · 仅分析与草稿</p></div><div class="acts">${button('enable','启用角色',`data-id="${a.id}" ${archived||a.status==='enabled'||!passed||!cfg.criteria?'disabled':''}`)}${button('pause','暂停',`data-id="${a.id}" ${archived||a.status==='paused'?'disabled':''}`)}</div></div>${a.needsTrial&&a.status==='enabled'?'<p class="acq-notice">工作流已更新，正式任务需先通过本页的新一轮生成试运行。</p>':''}${a.knowledgeChanged?'<p class="acq-notice">业务资料已更新。保存新版本并重新试运行后，才可再次启用。</p>':''}<p class="meta">找客户用于主动获客，接待用于客户跟进；内容助手目前在本页生成试运行草稿。启用不会自动发送或发布。</p>${overview}<div class="agent-detail-layout"><section class="acq-panel"><details data-agent-persist="advanced-${a.id}"><summary>调整设置（选填）</summary><p class="meta">默认方案已经配好。只有需要改变判断方式或沟通风格时，才需要修改。</p><form class="acq-form" data-agent-form="config" data-id="${a.id}" data-version="${v.number}" data-key="${draftKey(a)}" data-dirty="${drafts.has(draftKey(a))}"><fieldset ${archived?'disabled':''}><legend>目标与职责</legend>${cfg.recipeId?`<input type="hidden" name="recipeId" value="${esc(cfg.recipeId)}">`:""}<label>角色名称 *<input name="name" value="${esc(cfg.name)}" maxlength="100" required></label>${area('criteria','怎样才算有效线索（启用前必填）',cfg.criteria)}<p class="meta">写清可核实的条件，例如需求类型、服务地点和下一步。</p><fieldset class="agent-choices"><legend>承担的职责</legend>${['找客','创作','接待'].map(d=>`<label class="acq-check"><input type="checkbox" name="duties" value="${d}" ${cfg.recipeId?'disabled':''} ${cfg.duties.includes(d)?'checked':''}>${d}</label>`).join('')}</fieldset><fieldset class="agent-choices"><legend>适用平台</legend>${['小红书','抖音','视频号','B站','知乎','其他'].map(p=>`<label class="acq-check"><input type="checkbox" name="platforms" value="${p}" ${cfg.platforms.includes(p)?'checked':''}>${p}</label>`).join('')}</fieldset><details data-agent-persist="strategy-${a.id}"><summary>人群、交流与内容策略（选填）</summary>${Object.entries(fields).filter(([name])=>!['name','criteria'].includes(name)).map(([name,label])=>area(name,label,cfg[name],name==='keywords'?300:2000)).join('')}</details><details data-agent-persist="knowledge-${a.id}"><summary>业务知识与来源</summary><p>引用当前业务档案、事实卡与已读取附件。这里不重复建立资料库。</p><p class="meta">保存于 ${when(v.savedAt)} · 引用业务 ID：${esc(a.customerId)}</p>${button('knowledge','查看业务资料')}</details><details data-agent-persist="bindings-${a.id}"><summary>账号与可用动作 · ${cfg.bindings.filter(b=>b.enabled).length} 个资料绑定</summary><p class="meta">勾选供草稿使用的账号。取消勾选并保存会暂停该绑定；账号建档不代表登录，平台收发尚未验证。</p>${accounts.length?accounts.map(acc=>`<label class="acq-check"><input type="checkbox" name="binding" value="${acc.id}" ${cfg.bindings.some(b=>b.accountId===acc.id&&b.enabled)?'checked':''}>${esc(acc.platform)} · ${esc(acc.name)}（仅草稿）</label>`).join(''):'<p>尚未登记账号，仍可试运行。</p>'}${button('accounts','管理账号资料')}</details><p class="meta">执行模式：仅分析与草稿。条件内自动执行等待账号级能力验证。</p><div class="acts"><button class="btn" type="submit">保存新版本</button><span data-agent-dirty role="status">${drafts.has(draftKey(a))?'有未保存修改':'已保存'}</span></div></fieldset><p class="acq-error" role="alert"></p></form></details><details data-agent-persist="production-${a.id}"><summary>关联找客任务 · ${tasks(a.id).length}</summary>${tasks(a.id).slice().reverse().map(t=>`<div class="acq-task"><p>${esc(t.query||t.source)} · v${t.agentSnapshot.version}</p><button type="button" class="btn ghost" data-acq-action="open-task" data-id="${t.id}">查看任务与证据</button></div>`).join('')||'<p class="meta">启用后在“主动找客”选择此角色，再开始具体任务。</p>'}</details><details data-agent-persist="versions-${a.id}"><summary>版本记录 · ${a.versions.length}</summary>${a.versions.slice().reverse().map(ver=>`<details><summary>v${ver.number} · ${when(ver.savedAt)}</summary>${Object.entries(fields).map(([name,label])=>`<p>${label}：${esc(ver.config[name]||'未填写')}</p>`).join('')}</details>`).join('')}</details><details><summary>复制与归档</summary><p class="meta">复制只带配置；归档保留版本与运行记录，并停止未完成的关联任务。</p><div class="acts">${button('copy','复制配置',`data-id="${a.id}"`)}${button('archive','归档角色',`data-id="${a.id}" ${archived?'disabled':''}`)}</div></details></section><section class="acq-panel agent-trial"><h2>看看助手会怎么做</h2><p>没有现成材料也能先体验。示例是模拟内容，不会创建真实线索或发送消息。</p><label>测试场景<select data-agent-scenario>${AGENT_SCENARIOS.map(s=>`<option value="${s.id}" ${scenario===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><div class="acts">${button('example',running?'正在试运行…':'用内置示例试一下',`data-id="${a.id}" ${archived||running?'disabled':''}`,true)}</div><details data-agent-persist="custom-trial-${a.id}"><summary>用自己的材料试运行</summary><form class="acq-form" data-agent-form="trial" data-id="${a.id}"><fieldset ${archived||running?'disabled':''}><label>样例平台<select name="platform">${v.config.platforms.map(p=>`<option ${sample.platform===p?'selected':''}>${p}</option>`).join('')}</select></label>${area('text','需求或咨询原文 *',sample.text,6000)}<label>来源链接或说明 *<input name="source" value="${esc(sample.source||'')}" maxlength="1000" required></label><button class="btn" type="submit">${running?'正在试运行…':'用已保存版本试运行'}</button></fieldset><p class="acq-error" role="alert"></p></form></details><p class="meta">仅运行已保存的 v${v.number}。90 秒上限；关闭页面后可回来查看。模型未配置时显示规则与模板结果。</p><h3>运行记录 · ${history.length}</h3>${history.length?history.map(runView).join(''):'<div class="acq-empty"><h3>还没有运行记录</h3><p>点击“用内置示例试一下”，或展开上方填写自己的材料。</p></div>'}</section></div>`;
}
export function renderAgentUI() {
  if(!ctx||document.querySelector('[data-agent-form][data-busy=true]'))return;
  stash();
  const root=document.getElementById('acq-agents');if(!root)return;
  const focus=document.activeElement, f=focus?.closest('[data-agent-form]');
  const focused=f&&focus.name?{form:f.dataset.agentForm,id:f.dataset.id,name:focus.name,value:focus.value,start:focus.selectionStart,end:focus.selectionEnd}:null;
  const opened=[...root.querySelectorAll('[data-agent-persist][open]')].map(d=>d.dataset.agentPersist);
  const all=roles().filter(a=>filter==='all'||a.status===filter);
  if(!all.some(a=>a.id===chosen))chosen=all[0]?.id||'';
  const current=all.find(a=>a.id===chosen);
  root.innerHTML=selected()?`${ctx.picker()}<div class="acq-section-head"><div><h2>业务智能体</h2><p class="meta">选择要交给助手的工作，Harta 自动配好提示词与工作步骤。</p></div></div><details class="acq-panel" data-agent-persist="new-recipes" ${roles().length?'':'open'}><summary>第 1 步 · 选择助手用途${roles().length?' / 新建助手':''}</summary><div class="agent-cards agent-recipes">${AGENT_RECIPES.map(r=>`<article class="cm-platform-card"><h3>${esc(r.name)}</h3><p>${esc(r.description)}</p>${button('create','创建'+r.name,`data-recipe="${r.id}"`,true)}</article>`).join('')}</div><p class="meta">自动使用当前业务的名称、介绍和服务区域；不确定的经营事实不会自动补造。</p></details><div class="acq-filters"><label>状态<select data-agent-filter>${[['all','全部状态'],['draft','草稿'],['enabled','已启用'],['paused','已暂停'],['archived','已归档']].map(([value,label])=>`<option value="${value}" ${value===filter?'selected':''}>${label}</option>`).join('')}</select></label><span class="meta">${all.length} 个助手 · 启用助手不会自动开启平台发送</span></div><div class="agent-cards">${all.map(a=>{const v=a.versions.at(-1),last=runs(a.id)[0];return `<button type="button" class="acq-lead-row" data-agent-action="select" data-id="${a.id}" aria-pressed="${chosen===a.id}"><strong>${esc(v.config.name)}</strong><span>${esc(v.config.criteria||'待补充有效线索条件')}</span><span>${badge(a.status)} v${v.number}</span><small>${esc(v.config.duties.join(' / '))} · ${v.config.bindings.filter(b=>b.enabled).length} 个账号资料绑定</small><small>${tasks(a.id).filter(t=>t.status==='running').length} 项找客任务运行中</small><small>${a.knowledgeChanged?'业务资料有更新':last?`最近试运行：${esc(labels[last.status])}`:'尚未试运行'}</small></button>`;}).join('')}</div>${current?editor(current):'<div class="acq-panel acq-empty"><h3>还没有符合条件的角色</h3><p>从当前业务创建第一个角色，无需编写提示词。</p></div>'}`:'<div class="acq-empty"><h2>先建立业务档案</h2><p>角色需要引用一个真实业务的资料。</p><button class="btn" data-customer-entry="cooperating">录入业务</button></div>';
  for(const d of root.querySelectorAll('[data-agent-persist]'))if(opened.includes(d.dataset.agentPersist))d.open=true;
  if(focused){const form=[...root.querySelectorAll('[data-agent-form]')].find(f=>f.dataset.id===focused.id&&f.dataset.agentForm===focused.form);const field=[...(form?.elements||[])].find(el=>el.name===focused.name&&(!['checkbox','radio'].includes(el.type)||el.value===focused.value));if(field){field.focus({preventScroll:true});if(focused.start!=null)field.setSelectionRange(focused.start,focused.end);}}
}
export function installAgentUI(context) {
  ctx=context;
  window.addEventListener('beforeunload',e=>{stash();if(drafts.size){e.preventDefault();e.returnValue='';}});
  document.body.addEventListener('input',e=>{const f=e.target.closest('[data-agent-form=config]');if(f){f.dataset.dirty='true';f.querySelector('[data-agent-dirty]').textContent='有未保存修改';}});
  document.body.addEventListener('change',e=>{if(e.target.matches('[data-agent-scenario]'))scenario=e.target.value;if(e.target.matches('[data-agent-filter]')){filter=e.target.value;renderAgentUI();}});
  document.body.addEventListener('submit',async e=>{
    const f=e.target.closest('[data-agent-form]');if(!f)return;e.preventDefault();if(f.dataset.busy)return;
    const b=e.submitter;f.dataset.busy='true';if(b)b.disabled=true;
    try {
      if(f.dataset.agentForm==='config') {
        await ctx.api('agent-save',{agentId:f.dataset.id,baseVersion:Number(f.dataset.version),config:readConfig(f)});
        drafts.delete(f.dataset.key);f.remove();ctx.toast('已保存新版本，请重新试运行后启用');
      } else {
        if(document.querySelector('[data-agent-form=config]')?.dataset.dirty==='true')throw new Error('先保存修改，再对新版本试运行');
        await ctx.api('agent-trial',{...Object.fromEntries(new FormData(f)),agentId:f.dataset.id});ctx.toast('试运行已开始，结果会保存在运行记录');ctx.refresh();
      }
      ctx.render();
    } catch(error){f.querySelector('.acq-error').textContent=error.message;}
    finally{delete f.dataset.busy;if(b)b.disabled=false;ctx.render();}
  });
  document.body.addEventListener('click',async e=>{
    const b=e.target.closest('[data-agent-action]');if(!b||b.disabled)return;
    const action=b.dataset.agentAction;
    if(action==='select'){chosen=b.dataset.id;renderAgentUI();return;}
    if(action==='knowledge'){ctx.openKnowledge(selected());return;}
    if(action==='accounts'){ctx.accounts();return;}
    b.disabled=true;
    try {
      if(['create','copy'].includes(action)){
        const customerId=selected();await ctx.api('agent-create',{customerId,copyOf:action==='copy'?b.dataset.id:undefined,recipeId:action==='create'?b.dataset.recipe:undefined});if(selected()===customerId)chosen=roles().at(-1)?.id||'';filter='all';const chooser=document.querySelector('[data-agent-persist=new-recipes]');if(chooser)chooser.open=false;
      } else if(action==='recipe') {
        if(document.querySelector('[data-agent-form=config]')?.dataset.dirty==='true')throw new Error('请先保存当前修改，再套用推荐配置');
        const a=roles().find(a=>a.id===b.dataset.id);
        await ctx.api('agent-save',{agentId:a.id,baseVersion:a.versions.at(-1).number,recipeId:b.dataset.recipe});
        drafts.delete(draftKey(a));
      } else if(action==='example') {
        if(document.querySelector('[data-agent-form=config]')?.dataset.dirty==='true')throw new Error('先保存修改，再试运行');
        await ctx.api('agent-trial',{agentId:b.dataset.id,example:true,scenario:document.querySelector('[data-agent-scenario]')?.value||'normal'});ctx.refresh();
      } else if(action==='rerun') {
        if(document.querySelector('[data-agent-form=config]')?.dataset.dirty==='true')throw new Error('先保存修改，再重新试运行');
        const r=(data().agentRuns||[]).find(r=>r.id===b.dataset.id);await ctx.api('agent-trial',{agentId:r.agentId,...r.input,example:r.input.sourceType==='simulated_example',scenario:r.input.scenario||'normal'});ctx.refresh();
      } else {
        if(action==='enable'&&document.querySelector('[data-agent-form=config]')?.dataset.dirty==='true')throw new Error('有未保存修改，请先保存并试运行');
        await ctx.api('agent-action',{agentId:b.dataset.id,action});
      }
      ctx.render();ctx.toast(action==='enable'?'助手已启用，可按用途开始任务':action==='example'?'正在用模拟示例试运行':action==='recipe'?'推荐配置已保存，请试运行新版本':'已保存');
    } catch(error){ctx.toast(error.message);}finally{b.disabled=false;}
  });
}
