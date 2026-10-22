import { businessResults } from './business-results.js';
import { installAgentUI, renderAgentUI } from './agent-ui.js';
import { packAsSent } from './pack-edits.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const platforms = ['小红书','抖音','视频号','B站','知乎','其他'];
const stages = ['待核实','值得跟进','已联系','沟通中','已成交','暂不跟进'];
const labels = {running:'正在查找',completed:'已完成',partial:'部分成功',failed:'失败',stopped:'已停止',interrupted:'已中断',pending:'待核实',confirmed:'已核实',excluded:'已排除',pending_confirmation:'待登记发布',published:'已发布 · 人工登记',cancelled:'已取消',draft:'回复草稿',copied:'已复制，待人工发送',sent_platform:'已发送 · 平台回读',sent_manual:'已发送 · 人工登记',received:'收到咨询'};
const when = value => value ? new Date(value).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '未知';
const localNow = () => { const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const options = (rows, chosen) => rows.map(r => {const [value,label] = Array.isArray(r)?r:[r,r];return `<option value="${esc(value)}" ${String(value)===String(chosen)?'selected':''}>${esc(label)}</option>`;}).join('');
const input = (name,label,{value='',type='text',required=false,max=1000}={}) => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="${max}" ${required?'required':''}></label>`;
const area = (name,label,{value='',required=false,max=2000,rows=3}={}) => `<label>${label}<textarea name="${name}" rows="${rows}" maxlength="${max}" ${required?'required':''}>${esc(value)}</textarea></label>`;
const select = (name,label,rows,chosen='') => `<label>${label}<select name="${name}" ${['leadId','publicationId','agentId'].includes(name)?'':'required'}>${options(rows,chosen)}</select></label>`;
const button = (action,label,data='',ghost=true) => `<button type="button" class="btn ${ghost?'ghost':''}" data-acq-action="${action}" ${data}>${label}</button>`;
const badge = value => `<span class="acq-badge">${esc(labels[value]||value)}</span>`;
const empty = (title,note) => `<div class="acq-empty"><h3>${title}</h3><p>${note}</p></div>`;
const link = (value,label='打开原文') => {try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?`<a class="btn ghost" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'';}catch{return '';}};
let ctx, selected='', taskId='', tab='active', leadId='', workId='', accountKey='', status='pending', origin='all', stage='all', page=0, leadPage=0, capabilities=null, timer, refreshing=false;
const formDrafts = new Map();
const workspace = () => ctx.getWorkspace();
const data = () => workspace().acquisition || {tasks:[],signals:[],leads:[],publications:[],accounts:[]};
const business = () => workspace().customers.find(c=>c.id===selected);
const scoped = key => (data()[key]||[]).filter(r=>r.customerId===selected);
const accountOptions = p => scoped('accounts').filter(a=>!p||a.platform===p).map(a=>[a.id,`${a.platform} · ${a.name}`]);
const customerPicker = () => `<label class="acq-business">业务<select data-acq-business aria-label="选择业务">${options(workspace().customers.map(c=>[c.id,c.name]),selected)}</select></label>`;
const form = (key,action,body,attrs='') => `<form class="acq-form" data-acq-form="${action}" data-form-key="${esc(key)}" ${attrs}>${body}<p class="acq-error" role="alert"></p></form>`;
const submit = (text,disabled=false) => `<button class="btn" type="submit" ${disabled?'disabled':''}>${text}</button>`;
function stash() {
  document.querySelectorAll('[data-acq-form]').forEach(f=>{
    const values={};for(const field of f.elements)if(field.name&&field.matches('input,select,textarea'))values[field.name]=field.type==='file'?field.files:field.type==='checkbox'?field.checked:field.value;
    formDrafts.set(f.dataset.formKey,values);
  });
}
function restore() {
  document.querySelectorAll('[data-acq-form]').forEach(f=>{
    const values=formDrafts.get(f.dataset.formKey);if(!values)return;
    for(const field of f.elements)if(field.name&&field.matches('input,select,textarea')&&Object.hasOwn(values,field.name)){if(field.type==='file'){if(values[field.name]?.length)field.files=values[field.name];}else if(field.type==='checkbox')field.checked=values[field.name];else field.value=values[field.name];}
  });
}
function pages(length,current,kind) {
  if(length<=20)return '';
  return `<div class="acq-pagination">${button(`${kind}-prev`,'上一页',current?'':'disabled')}<span>第 ${current+1} / ${Math.ceil(length/20)} 页 · ${length} 条</span>${button(`${kind}-next`,'下一页',(current+1)*20>=length?'disabled':'')}</div>`;
}
function summary() {
  const a={signals:scoped('signals'),leads:scoped('leads'),publications:scoped('publications')}, pending=(a.signals||[]).filter(s=>s.status==='pending'), replies=(a.leads||[]).filter(l=>l.needsReply), pubs=(a.publications||[]).filter(p=>p.status==='pending_confirmation');
  const first=[...replies].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt))[0];
  document.getElementById('acq-today').innerHTML=`<div class="acq-priority"><div><h2>${first?`先处理 ${esc(first.authorName)} 的咨询`:pending.length?'先核实新发现的需求':'从一个真实机会开始'}</h2><p>${first?`最近更新 ${when(first.updatedAt)}，有新消息待处理。`:'选择业务，找需求或生成内容，再记录实际进展。'}</p></div>${button(first?'open-lead':'open-active',first?'查看待回复咨询':'去主动找客',first?`data-id="${first.id}"`:'',false)}</div><div class="acq-paths"><article><h3>主动找客</h3><p><strong>${pending.length}</strong> 条需求待核实</p><p class="meta">每条保留原文、来源与核实依据。</p>${button('open-active','查看需求机会')}</article><article><h3>内容获客</h3><p><strong>${pubs.length}</strong> 篇待登记发布 · <strong>${replies.length}</strong> 条线索待回复</p><p class="meta">咨询数来自已记录消息，平台未同步。</p>${button('open-content','生成与发布内容')}</article></div>`;
}
function resultsView() {
  const metrics=businessResults(data(),selected);
  const leads=scoped('leads'),pubs=scoped('publications').filter(p=>p.status==='published');
  const events=leads.flatMap(l=>l.events.filter(e=>e.type==='followup').map(e=>({...e,lead:l}))).sort((a,b)=>b.at.localeCompare(a.at));
  const recent=events.slice(0,10);
  return `<h2>双路径实际记录</h2><p>去重联系人 ${metrics.contacts} 人 · 有发送记录 ${metrics.contacted} 人 · 有来信 ${metrics.replied} 人 · 登记成交购买需求 ${metrics.wonNeeds} 个 · 登记成交 ${metrics.wonContacts} 人</p><p class="meta">仅统计当前业务已保存的记录；两条路径可能重叠，成交由人工登记。</p><div class="acq-paths">${[['active','主动发现'],['content','内容带来']].map(([path,label])=>{const rows=leads.filter(l=>l.sourcePaths.includes(path));return `<article><h3>${label}</h3><p>${rows.length} 条线索 · ${rows.filter(l=>l.needsReply).length} 条待回复</p><p>${rows.filter(l=>l.stage==='已成交').length} 条人工登记成交</p></article>`;}).join('')}</div><p class="meta">${pubs.length} 篇人工登记发布 · 平台阅读与订单数据尚未接通。</p>${recent.length?recent.map(e=>`<div class="acq-task"><header><strong>${esc(e.lead.authorName)} · ${esc(e.stage)}</strong><span class="meta">${when(e.at)} · 人工记录</span></header><p>${esc(e.note)}</p>${button('open-lead','回查来源与会话',`data-id="${e.lead.id}"`)}</div>`).join(''):empty('尚未记录业务结果','在线索详情保存真实跟进进展，这里会保留记录和来源。')}`;
}
function signalRow(s) {
  const similar=scoped('leads').filter(l=>l.platform===s.platform&&(s.authorId?l.authorId===s.authorId:l.authorName===s.authorName));
  return `<article class="acq-signal"><header><div>${badge(s.platform)} ${badge(s.status)} ${s.status==='pending'?badge(s.analysis.priority):''}</div><span class="meta">采集 ${when(s.collectedAt)}</span></header><p class="acq-quote">${esc(s.text)}</p><p class="meta">${esc(s.authorName||'昵称未知')} · ${s.sourceType==='search_summary'?'搜索摘要／待回源核实':s.sourceType==='browser_visible'?'浏览器读取／可见范围':'用户导入'}${s.ipRegion?` · 平台 IP 属地：${esc(s.ipRegion)}`:''}</p><p>${esc(s.analysis.reason)}</p><div class="acts">${link(s.url)}${s.leadId?button('open-lead','查看跟进',`data-id="${s.leadId}"`):''}</div><details data-persist="signal-${s.id}"><summary>${s.status==='pending'?'核实或排除':'查看证据与核实记录'}</summary><p class="meta">发表：${when(s.publishedAt)} · ${s.identitySource==='dom_fingerprint'?'本地去重标识':'平台记录 ID'}：${esc(s.recordId||'未知')} · 用户 ID：${esc(s.authorId||'未知，不按昵称自动合并')}</p><p class="meta">${esc(s.analysis.method)}；IP 属地不代表居住地。</p>${button('open-task','查看来源任务与读取范围',`data-id="${s.taskId}"`)}${s.review?`<p>人工核实：${esc(s.review.note)} · ${when(s.review.at)}</p>`:''}${!s.leadId?form(`review-${s.id}`,'review',`${area('note','核实依据或排除理由 *',{required:true})}${similar.length?select('leadId','已有相似线索，确认同一对象才合并',[['','新建独立线索'],...similar.map(l=>[l.id,`${l.authorName} · ${l.stage}`])]):''}<div class="acts"><button class="btn" name="action" value="confirm" ${s.isAuthorReply?'disabled':''}>确认值得跟进</button><button class="btn ghost" name="action" value="exclude">排除此需求</button></div>`,`data-id="${s.id}"`):''}</details></article>`;
}
function taskRows() {
  return [...scoped('tasks')].reverse().map(t=>`<div class="acq-task" data-task-id="${t.id}"><header><strong>${esc(t.query||t.source)}</strong>${badge(t.status)}</header><p class="meta">${when(t.createdAt)} · ${t.sourceType==='manual_import'?'导入资料':t.sourceType==='browser_visible'?'浏览器可见内容':'公开搜索摘要'} · ${esc(t.platforms.join('、'))}</p>${t.coverage?`<p>读取 ${t.coverage.read} 条，新增 ${t.coverage.added} 条，重复 ${t.coverage.duplicate} 条。</p>`:''}${(t.results||[]).map(r=>`<p>${esc(r.platform)}：${r.error?esc(r.error):`读取 ${r.coverage.read} 条摘要，新增 ${r.coverage.added} 条，重复 ${r.coverage.duplicate} 条。`}</p>`).join('')}${t.error?`<p>${esc(t.error)}</p>`:''}<div class="acts">${button('open-task','查看任务详情',`data-id="${t.id}"`)}${t.status==='running'?button('stop','停止任务',`data-id="${t.id}"`):t.sourceType==='search_summary'?button('rerun','重新运行',`data-id="${t.id}"`):''}</div></div>`).join('')||'<p class="meta">还没有运行记录。</p>';
}
function taskDetail() {
  const task=scoped('tasks').find(t=>t.id===taskId);
  if(!task){taskId='';return activeView();}
  const signals=scoped('signals').filter(s=>s.taskId===task.id);
  return `<section class="acq-panel" id="acq-task-detail"><div class="acts">${button('back-tasks','返回需求机会')}</div><header class="acq-section-head"><h2>${esc(task.query||task.source)}</h2>${badge(task.status)}</header><p class="meta">${esc(business()?.name)} · ${esc(task.platforms.join('、'))} · ${when(task.createdAt)}</p><p>${task.sourceType==='search_summary'?'公开搜索摘要，未读取站内评论。':task.sourceType==='browser_visible'?'浏览器读取网页实际加载的评论，不代表全部评论。':'用户导入资料，范围以本次实际输入为准。'}</p>${task.agentSnapshot?`<p>智能体：${esc(task.agentSnapshot.config.name)} · v${task.agentSnapshot.version}（本次固定版本）</p>`:'<p class="meta">本次直接使用业务资料。</p>'}<div class="acq-task-facts"><div><strong>${signals.length}</strong><span>新增证据</span></div><div><strong>${signals.filter(s=>s.status==='pending').length}</strong><span>待核实</span></div><div><strong>${signals.filter(s=>s.leadId).length}</strong><span>已关联线索的证据</span></div></div>${task.coverage?`<p>实际读取 ${task.coverage.read} 条，去重 ${task.coverage.duplicate} 条。</p>`:''}${(task.results||[]).map(r=>`<p>${esc(r.platform)}：${r.error?esc(r.error):`读取 ${r.coverage.read} 条摘要，新增 ${r.coverage.added} 条，重复 ${r.coverage.duplicate} 条。`}</p>`).join('')}${task.status==='running'?'<p role="status">正在读取可用来源，总量未知；完成的平台会逐项保存。</p>':''}${task.error?`<p class="acq-error">${esc(task.error)}</p>`:''}<div class="acts">${task.status==='running'?button('stop','停止任务',`data-id="${task.id}"`):task.sourceType==='search_summary'?button('rerun','重新运行为新任务',`data-id="${task.id}"`):''}${button('export-task','导出本次证据',`data-id="${task.id}"`)}</div><details><summary>本次业务快照与读取记录</summary><p class="acq-quote">${esc([task.snapshot?.name,task.snapshot?.pitch,task.snapshot?.city].filter(Boolean).join(' · '))}</p><p class="meta">${task.finishedAt?`结束 ${when(task.finishedAt)}`:'尚未结束'}${task.rerunOf?` · 重跑自 ${esc(task.rerunOf)}`:''}</p></details><h3>本次新增证据</h3>${signals.length?signals.map(signalRow).join(''):empty(task.status==='running'?'还在读取来源':task.status==='failed'?'来源读取失败':task.coverage?.duplicate?'本次资料均已存在':'本次没有新增证据','已有历史结果不会被清空；搜索摘要不能代表平台全部需求。')}</section>`;
}
function activeView() {
  const all=scoped('signals').filter(s=>status==='all'||s.status===status).reverse(); page=Math.min(page,Math.max(0,Math.ceil(all.length/20)-1));
  return `${scoped('tasks').some(t=>t.status==='running')?`<div class="acq-notice" role="status">有找客任务正在运行。${button('open-task','查看进度',`data-id="${scoped('tasks').find(t=>t.status==='running').id}"`)}</div>`:''}<div class="acq-layout"><div><section class="acq-panel"><h2>帮我找客户</h2><p>查找公开需求，或导入已有资料。</p>${form(`search-${selected}`,'search',`${scoped('agents').some(a=>a.status==='enabled')?select('agentId','使用智能体（选填）',[['','直接使用业务资料'],...scoped('agents').filter(a=>a.status==='enabled'&&a.versions.at(-1).config.duties.includes('找客')).map(a=>[a.id,`${a.versions.at(-1).config.name} · v${a.versions.at(-1).number}`])]):''}<details data-persist="search-options"><summary>更多搜索设置（选填）</summary>${input('query','搜索词',{max:300})}${select('platform','平台',[['both','小红书与抖音'],...platforms])}</details>${submit('开始查找需求',capabilities===null||!capabilities.searchSummary)}<p class="meta">${capabilities===null?'正在读取连接状态…':capabilities.searchSummary?'公开搜索已配置。结果是搜索摘要，不代表站内实时评论。':'公开搜索未连接，可先导入真实资料。管理员可在设置中配置数据源。'}</p>`)}<details data-persist="import-signals"><summary>导入真实需求</summary><p class="meta">填写原文与来源链接。</p>${form(`signal-${selected}`,'single-signal',`${select('platform','来源平台',platforms)}${area('text','需求原文 *',{required:true,max:6000})}${input('url','原始链接 *',{type:'url',required:true,max:2000})}${input('source','资料来源 *',{required:true,max:500})}<details><summary>身份与时间（选填）</summary>${input('authorName','昵称',{max:100})}${input('authorId','平台用户 ID',{max:200})}${input('recordId','评论或内容 ID',{max:200})}${input('publishedAt','发表时间',{type:'datetime-local'})}${input('ipRegion','平台显示的 IP 属地',{max:100})}<label class="acq-check"><input type="checkbox" name="isAuthorReply">这是作者自己的回复</label></details>${submit('保存需求证据')}`)}<details><summary>批量 JSON 导入</summary><p class="meta">每行必填 platform、text、url；可填 authorId、authorName、recordId、publishedAt、ipRegion、isAuthorReply。一次最多 100 条，文件不超过 60 KB。</p>${form(`bulk-${selected}`,'bulk',`${input('source','资料来源 *',{required:true,max:500})}<label>选择 JSON 数组文件 *<input type="file" name="file" accept=".json,application/json" required></label>${submit('导入并去重')}`)}</details></details></section><details class="acq-panel" data-persist="tasks"><summary>任务与读取范围 · ${scoped('tasks').length}</summary>${taskRows()}</details></div><section class="acq-panel"><div class="acq-section-head"><h2>需求机会 <span class="acq-count">${all.length}</span></h2><label>状态<select data-acq-status>${options([['pending','待核实'],['confirmed','已核实'],['excluded','已排除'],['all','全部']],status)}</select></label></div>${all.length?all.slice(page*20,page*20+20).map(signalRow).join(''):empty('这里还没有需求机会','开始查找，或导入带原文与链接的资料。')}${pages(all.length,page,'signal')}</section></div>`;
}
function postOptions() {
  const c=business();return [...(c?.drops||[]),...(c?.packs||[])].filter(p=>p.tier==='今日'||p.origin?.mode==='organic').flatMap(p=>Object.entries(packAsSent(p).shells).flatMap(([platform,rows])=>rows.map((row,index)=>({key:JSON.stringify([p.id,platform,index]),packId:p.id,platform,index,title:row.title||row.cover||row.body?.slice(0,30)||`${platform}内容`,content:row}))));
}
function publicationRows() {
  return scoped('publications').slice().reverse().map(p=>`<article class="acq-signal"><header><h3>${esc(p.content.title||p.content.cover||'发布内容')}</h3>${badge(p.status)}</header><p class="meta">${esc(p.platform)} · ${esc(p.accountName)} · ${when(p.createdAt)}</p><details data-persist="publication-${p.id}" ${p.status==='pending_confirmation'?'open':''}><summary>当时的内容版本${p.status==='pending_confirmation'?'与发布登记':''}</summary>${Object.entries(p.content).filter(([,v])=>typeof v==='string').map(([k,v])=>`<p class="acq-quote">${esc(v)}</p>`).join('')}${p.status==='pending_confirmation'?form(`publication-${p.id}`,'publication',`${input('url','实际发布链接 *',{type:'url',required:true,max:2000})}${input('publishedAt','实际发布时间 *',{type:'datetime-local',required:true,value:localNow()})}${input('platformContentId','平台内容 ID（选填）',{max:200})}<label class="acq-check"><input type="checkbox" name="confirmed" required>我已用上述账号实际发布这个版本</label><div class="acts">${submit('登记已发布')}${button('cancel-publication','取消这次登记',`data-id="${p.id}"`)}</div>`,`data-id="${p.id}"`):''}</details>${p.status==='published'?`<p class="meta">实际发布 ${when(p.publishedAt)} · 来源：人工登记，未经平台回传核实</p><div class="acts">${link(p.url,'打开已发布内容')}${button('inquiry-for','登记这篇带来的咨询',`data-id="${p.id}"`)}</div>`:''}</article>`).join('')||empty('还没有发布记录','从已有内容选择一篇，核对账号与最终版本后登记发布。');
}
function contentView() {
  const posts=postOptions();
  return `<div class="acq-layout"><div><section class="acq-panel"><h2>内容，从成稿到咨询</h2>${button('create-content','打开内容库与生成', '',false)}<p class="meta">发布前请准备封面或视频成片。</p></section><section class="acq-panel"><h2>准备发布登记</h2>${posts.length?form(`prepare-${selected}`,'prepare-publication',`${select('post','选择已有内容',posts.map(p=>[p.key,`${p.platform} · ${p.title}`]))}<div data-post-preview class="acq-preview"></div>${select('accountId','选择发布账号',[['','请选择同平台账号'],...accountOptions()])}<p class="meta">登记发布版本与链接；此处不自动发布。</p>${submit('核对并保存发布版本')}`):empty('先完成第一篇内容','点击上方“打开内容库与生成”，复用已有创作流程。')}${button('accounts','登记发布账号')}</section></div><section class="acq-panel"><h2>发布与咨询来源</h2>${publicationRows()}</section></div>`;
}
function inquiryForm() {
  return `<details class="acq-panel" data-persist="inquiry" id="acq-inquiry"><summary>登记收到的咨询</summary><p class="meta">只记录真实收到的消息；来源不明时保留未知。</p>${form(`inquiry-${selected}`,'inquiry',`<div class="acq-fields">${select('platform','来源平台',platforms)}${select('accountId','接收账号',[['','请选择'],...accountOptions()])}${input('authorName','对方昵称 *',{required:true,max:100})}${select('channel','渠道',['评论','私信','表单','其他'])}${input('receivedAt','咨询时间 *',{type:'datetime-local',required:true,value:localNow()})}${select('publicationId','关联已发布内容（选填）',[['','来源未知，不关联'],...scoped('publications').filter(p=>p.status==='published').map(p=>[p.id,`${p.platform} · ${p.content.title||p.content.cover||when(p.publishedAt)}`])])}</div>${area('text','收到的原话 *',{required:true,max:6000})}${input('evidence','消息链接或核对记录 *',{required:true})}<details><summary>去重与身份（选填）</summary>${input('authorId','平台用户 ID',{max:200})}${input('messageId','平台消息 ID',{max:200})}${select('leadId','明确属于已有线索才关联',[['','不手动关联'],...scoped('leads').map(l=>[l.id,`${l.platform} · ${l.authorName}`])])}</details>${submit('保存咨询，加入待回复')}`)}</details>`;
}
function leadDetail(l) {
  if(!l)return empty('选一条线索，继续跟进','核实过的需求和记录的咨询都会在这里保留。');
  const accounts=accountOptions(l.platform), sources=scoped('signals').filter(s=>l.signalIds.includes(s.id));
  return `<header class="acq-section-head"><div><h2>${esc(l.authorName)}</h2><p class="meta">${esc(l.platform)} · 用户 ID：${esc(l.authorId||'未知')} · ${l.doNotContact?'已禁止联系':'人工接待'}</p></div>${badge(l.stage)}</header>${sources.length?`<details data-persist="evidence-${l.id}"><summary>需求证据 · ${sources.length}</summary>${sources.map(s=>`<p class="acq-quote">${esc(s.text)}</p><p class="meta">${esc(s.review?.note||'')}</p>${link(s.url)}${button('open-task','查看来源任务',`data-id="${s.taskId}"`)}`).join('')}</details>`:''}<div class="acq-conversation">${l.messages.length?l.messages.map(m=>`<article class="acq-message ${m.direction==='outbound'?'outbound':''}"><header>${badge(m.status)}<span class="meta">${when(m.sentAt||m.receivedAt||m.createdAt)} · ${esc(m.channel||'')}</span></header><p class="acq-quote">${esc(m.text)}</p><p class="meta">${esc(m.evidence||'尚未发送')}${m.recipient?` · 接收对象：${esc(m.recipient)}`:''}</p>${m.publicationId?button('view-publication','查看来源内容版本',`data-id="${m.publicationId}"`):''}${['draft','copied'].includes(m.status)&&!l.doNotContact?`<div class="acts">${m.stale?`<p class="acq-notice">${esc(m.staleReason)}；此历史草稿仍可核对实际发送记录。</p>`:button('copy-message','复制草稿',`data-id="${m.id}" data-lead="${l.id}"`)}</div><details data-persist="sent-${m.id}"><summary>我已在平台发送</summary>${form(`sent-${m.id}`,'sent',`${input('sentAt','实际发送时间 *',{type:'datetime-local',required:true,value:localNow()})}${input('note','发送依据或记录 *',{required:true,max:2000})}<label class="acq-check"><input type="checkbox" name="confirmed" required>已核对接收对象、发送账号及原文</label>${submit('登记人工发送')}`,`data-id="${m.id}" data-lead="${l.id}"`)}</details>`:''}</article>`).join(''):'<p class="meta">还没有会话消息。可以先保存联系草稿。</p>'}</div>${!l.doNotContact?form(`draft-${l.id}`,'draft',`<button class="btn ghost" data-cm="execution-messages">人工发送与回复草稿</button><h3>${l.needsReply?'回复这条咨询':'准备联系'}</h3><div class="acts">${button('suggestion','结合业务生成草稿',`data-id="${l.id}"`)}</div>${area('text','编辑联系或回复草稿 *',{required:true,max:3000})}<div class="acq-fields">${select('accountId','发送账号',[['','请选择'],...accounts])}${select('channel','实际发送渠道',['评论','私信','表单','其他'])}</div>${input('recipient','接收对象或原帖链接 *',{required:true,value:l.authorId||sources[0]?.url||l.authorName})}<p class="meta">保存后可到平台执行确认实际发送；复制不会标记已发送。</p>${submit('保存草稿，待人工发送')}`,`data-id="${l.id}"`):'<p class="acq-notice">该对象已禁止联系，所有未发送草稿已取消。</p>'}<details class="acq-followup" data-persist="followup-${l.id}" open><summary>阶段与下一步</summary>${form(`followup-${l.id}`,'followup',`${select('stage','线索阶段',stages,l.stage)}${area('note','实际进展或阶段变化依据 *',{required:true})}<div class="acq-fields">${input('nextStep','下一步',{value:l.nextStep})}${input('nextAt','下次跟进时间（选填）',{type:'datetime-local',value:l.nextAt?new Date(new Date(l.nextAt).getTime()-new Date(l.nextAt).getTimezoneOffset()*60000).toISOString().slice(0,16):''})}</div>${submit('保存跟进记录')}`,`data-id="${l.id}"`)}</details><details data-persist="contact-${l.id}"><summary>联系限制与人工接管</summary>${form(`block-${l.id}`,'block',`${input('note',l.doNotContact?'恢复联系的依据 *':'拒绝联系或退订依据 *',{required:true,max:2000})}${submit(l.doNotContact?'恢复允许联系':'标记禁止联系')}`,`data-id="${l.id}" data-blocked="${l.doNotContact}"`)}${button('takeover',l.manualTakeover?'已人工接管':'人工接管此会话',`data-id="${l.id}" ${l.manualTakeover?'disabled':''}`)}<p class="meta">在平台自行发送，Harta 保留草稿与人工结果记录。</p></details><details data-persist="timeline-${l.id}"><summary>跟进时间线 · ${l.events.length}</summary>${l.events.slice().reverse().map(e=>`<div class="acq-task"><p class="meta">${when(e.at)} · ${esc(e.stage||({verified:'人工核实',block:'禁止联系',unblock:'恢复联系'}[e.type]||e.type))}</p><p>${esc(e.note)}</p></div>`).join('')||'<p>暂无跟进记录。</p>'}</details>`;
}
function leadsView() {
  const all=scoped('leads').filter(l=>(origin==='all'||l.sourcePaths.includes(origin))&&(stage==='all'||(stage==='reply'?l.needsReply:l.stage===stage))).sort((a,b)=>Number(b.needsReply||false)-Number(a.needsReply||false)||b.updatedAt.localeCompare(a.updatedAt));
  if(!all.some(l=>l.id===leadId))leadId=all[0]?.id||'';
  leadPage=Math.min(leadPage,Math.max(0,Math.ceil(all.length/20)-1));
  return `${inquiryForm()}<div class="acq-filters"><label>来源<select data-acq-origin>${options([['all','全部来源'],['active','主动发现'],['content','内容带来'],['unknown','来源未知']],origin)}</select></label><label>阶段<select data-acq-stage>${options([['all','全部阶段'],['reply','待回复'],...stages],stage)}</select></label><span class="meta">${all.length} 条线索</span>${button('export','导出跟进记录')}</div><div class="acq-lead-layout"><div class="acq-lead-list">${all.length?all.slice(leadPage*20,leadPage*20+20).map(l=>`<button type="button" class="acq-lead-row" data-acq-action="select-lead" data-id="${l.id}" aria-pressed="${l.id===leadId}"><strong>${esc(l.authorName)}</strong><span>${esc(l.platform)} · ${l.needsReply?'新咨询待回复':esc(l.stage)}</span><small>${l.doNotContact?'已禁止联系':esc(l.nextStep||'待记录下一步')}</small><small>${l.nextAt?`计划 ${when(l.nextAt)}`:`更新 ${when(l.updatedAt)}`}</small></button>`).join(''):empty('还没有潜在线索','核实需求，或登记真实收到的咨询。')}${pages(all.length,leadPage,'lead')}</div><section class="acq-panel acq-lead-detail" id="acq-lead-detail">${leadDetail(all.find(l=>l.id===leadId))}</section></div>`;
}
function accountsView() {
  return `<h2>平台账号与连接</h2><button class="btn" data-cm="go-connections">配置抖音／小红书数据源</button><p>账号登记仅用于记录，不代表平台授权。</p>${customerPicker()}${form(`account-${selected}`,'account',`<div class="acq-fields">${select('platform','平台',platforms)}${input('name','账号名称或标识 *',{required:true,max:200})}</div>${submit('登记账号')}`)}${scoped('accounts').map(a=>`<div class="acq-task"><header><strong>${esc(a.platform)} · ${esc(a.name)}</strong>${badge('未连接 · 人工处理')}</header><p class="meta">这是人工登记的账号；采集数据源在「平台账号」配置。</p></div>`).join('')}<details data-persist="capabilities"><summary>逐平台能力与待接通条件</summary>${(capabilities?.platforms||platforms.map(platform=>({platform}))).map(p=>`<div class="acq-task"><strong>${esc(p.platform)}</strong><p class="meta">小红书走 API；抖音可选浏览器或 API。发送与发布由用户自行完成。</p></div>`).join('')}</details>`;
}
function painResult(data) {
  return `<p class="meta">归集于 ${when(data.generatedAt)} · ${esc(data.method)} · 覆盖 ${data.coverage.covered}/${data.coverage.total} 条真实评论</p>
    ${data.clusters.length ? `<div class="acq-pain-list">${data.clusters.map(c => `<article class="acq-task"><header><strong>${esc(c.topic)}</strong><span class="meta">${c.count} 条 · ${Math.round((c.share || 0) * 100)}%</span></header><p>${esc(c.anxiety)}</p><p class="meta">卡在哪：${esc(c.blocker)}</p><p>${esc(c.angle)}</p><details><summary>看原话与出处 · ${c.quotes.length}</summary>${c.quotes.map(q => `<p class="acq-quote">${esc(q.text)}</p>`).join('')}<p class="meta">${esc(c.method)}；频次是评论条数，不代表平台整体。</p></details></article>`).join('')}</div>` : '<p class="meta">没有归出主题。</p>'}
    ${(data.warnings || []).map(w => `<p class="meta">${esc(w)}</p>`).join('')}`;
}
function painPanel() {
  const data4 = business()?.painClusters;
  return `<section class="acq-panel"><div class="acq-section-head"><div><h2>评论区痛点归集</h2><p class="meta">只看当前业务的真实评论，按「这个人卡在哪」归堆。归集不是线索评分：它回答该写什么，不回答该找谁。</p></div>${button('pains-run', data4 ? '重新归集' : '开始归集', '', false)}</div>${data4 ? painResult(data4) : '<p class="meta">还没有归集结果。先把作品评论采进来，再回这里归集。</p>'}<p class="meta">归集会调用模型做语义分堆；次数与出处始终来自真实评论。</p></section>`;
}
function radarSvg(radar) {
  const axes = radar?.axes || [];
  if (!axes.length) return '';
  const n = axes.length, cx = 100, cy = 78, R = 50;
  const at = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const ring = (k) => `<polygon points="${axes.map((_, i) => at(i, R * k).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--border)" stroke-width="0.6"/>`;
  const spokes = axes.map((_, i) => { const [x, y] = at(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.6"/>`; }).join('');
  const points = axes.map((axis, i) => at(i, (R * Math.max(0, Math.min(100, axis.score ?? 0))) / 100));
  const labels = axes.map((axis, i) => {
    const [x, y] = at(i, R + 16);
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + 2).toFixed(1)}" text-anchor="${anchor}" font-size="7.5" fill="var(--ink-3)">${esc(axis.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 200 158" width="200" height="158" role="img" aria-label="数据雷达：${esc(axes.map((a) => `${a.label}${a.score == null ? '缺数据' : `第${a.score}分位`}`).join('，'))}">${[0.25, 0.5, 0.75, 1].map(ring).join('')}${spokes}<polygon points="${points.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="var(--accent)" fill-opacity="0.16" stroke="var(--accent)" stroke-width="1.4"/>${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="var(--accent)"/>`).join('')}${labels}</svg>`;
}
function radarBlock(radar) {
  if (!radar) return '';
  const nums = (radar.axes || []).map((axis) => {
    const value = axis.value == null ? '缺' : (axis.key.endsWith('Rate') ? axis.value.toFixed(2) : axis.value);
    return `<span>${esc(axis.label)} <b>${esc(value)}</b>${axis.score == null ? '' : ` · 第${axis.score}分位`}</span>`;
  }).join(' ');
  return `<details><summary>数据雷达${radar.comparable ? '' : '（缺可比样本）'}</summary><div class="acq-radar">${radarSvg(radar)}</div><p class="meta">${esc(radar.basis)}</p><p class="meta">${nums}</p></details>`;
}
function accountBlock(account) {
  const p = account.profile || {};
  return `<header class="acq-section-head"><div><h2>${esc(account.authorName)}</h2><p class="meta">${esc(account.platform)} · ${esc(account.method)} · ${p.works} 条作品${p.spanDays != null ? ` · 跨度 ${p.spanDays} 天` : ''}</p></div></header>
    <div class="acq-task-facts"><div><strong>${p.medianLikes ?? '—'}</strong><span>赞中位数</span></div><div><strong>${p.medianGapDays ?? '—'}</strong><span>发帖间隔（天）</span></div><div><strong>${p.numberedShare ?? '—'}${p.numberedShare == null ? '' : '%'}</strong><span>用分点的比例</span></div></div>
    ${account.playbook ? `<p>${esc(account.playbook)}</p>` : ''}
    ${p.hits?.length ? `<details open><summary>这个账号的爆款（本账号中位数 2 倍以上）· ${p.hits.length}</summary>${p.hits.map((hit) => `<p>${esc(hit.title)} <span class="meta">赞 ${hit.likes ?? '—'}</span></p>`).join('')}</details>` : ''}
    ${p.titlePatterns?.length ? `<details><summary>标题反复用的写法</summary><p>${p.titlePatterns.map((row) => `${esc(row.label)} ${row.count} 条`).join(' · ')}</p></details>` : ''}
    ${p.topTags?.length ? `<details><summary>高频标签</summary><p>${p.topTags.map((tag) => `${esc(tag.name)} ${tag.count}`).join(' · ')}</p></details>` : ''}
    ${p.feedback?.length ? `<details><summary>评论区反复出现的卡点</summary>${p.feedback.map((row) => `<p><b>${esc(row.point)}</b> · ${row.count} 条${row.quote ? `<br><span class="acq-quote">${esc(row.quote)}</span>` : ''}</p>`).join('')}</details>` : ''}
    ${(account.strengths || []).length ? `<details><summary>它做对了什么</summary>${account.strengths.map((x) => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
    ${(account.risks || []).length ? `<details><summary>照搬到你会踩的坑</summary>${account.risks.map((x) => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
    ${(account.transferable || []).length ? `<details><summary>可以学的手法</summary>${account.transferable.map((x) => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
    ${(account.notTransferable || []).length ? `<details><summary>不能搬的东西</summary>${account.notTransferable.map((x) => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
    ${(account.warnings || []).map((w) => `<p class="meta">${esc(w)}</p>`).join('')}`;
}
function teardownResult(t) {
  return `<header class="acq-section-head"><div><h2>${esc(t.title || '未命名作品')}</h2><p class="meta">${esc(t.platform)} · ${esc(t.author || '作者未知')} · ${t.method}</p></div>${link(t.url, '打开原作品')}</header>
    <div class="acq-task-facts"><div><strong>${esc((t.metrics || {}).likes ?? '—')}</strong><span>赞</span></div><div><strong>${esc((t.metrics || {}).comments ?? '—')}</strong><span>评</span></div><div><strong>${esc((t.metrics || {}).saves ?? '—')}</strong><span>藏</span></div></div>
    ${radarBlock(t.radar)}
    <p><b>钩子</b> ${esc(t.hook)}</p><p class="meta">${(t.hookKinds || []).map(esc).join(' + ')}</p>
    <p><b>切入角度</b> ${esc(t.angle)}</p>
    <p><b>证据</b> ${(t.proofTypes || []).map(esc).join('、')} · <b>行动入口</b> ${esc(t.action)}</p>
    <details open><summary>结构拆解</summary>${(t.structure || []).map(s => `<p><b>${esc(s.part)}</b> · ${esc(s.role)}${s.note ? `<br><span class="meta">${esc(s.note)}</span>` : ''}</p>`).join('')}</details>
    ${(t.commentFeedback || []).length ? `<details><summary>评论区反馈 · ${t.commentFeedback.length}</summary>${t.commentFeedback.map(c => `<p><b>${esc(c.point)}</b> · ${c.count} 条${c.quote ? `<br><span class="acq-quote">${esc(c.quote)}</span>` : ''}</p>`).join('')}</details>` : ''}
    ${(t.transferable || []).length ? `<details><summary>可以学的做法</summary>${t.transferable.map(x => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
    ${(t.notTransferable || []).length ? `<details><summary>不能搬的东西</summary>${t.notTransferable.map(x => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
    ${(t.topics || []).length ? `<h3>给这个业务的选题</h3>${t.topics.map(x => `<div class="acq-task"><strong>${esc(x.angle)}</strong><p>${esc(x.why)}</p><p class="meta">${(x.keywords || []).map(esc).join(' · ')}</p></div>`).join('')}` : '<p class="meta">还没出选题：需要模型可用，且这条作品有正文。</p>'}
    ${(t.warnings || []).map(w => `<p class="meta">${esc(w)}</p>`).join('')}`;
}
function teardownPanel() {
  const works = (data().works || []).filter(w => w.customerId === selected).slice(0, 12);
  const teardowns = business()?.benchmarkTeardowns || [];
  const shown = teardowns.find(t => t.workId === workId) || teardowns[0];
  const authors = new Map();
  for (const w of (data().works || []).filter(w => w.customerId === selected)) {
    const key = w.authorId || w.authorName || '未知';
    const row = authors.get(key) || { key, authorId: w.authorId || '', authorName: w.authorName || '作者待核实', count: 0 };
    row.count += 1; authors.set(key, row);
  }
  const authorRows = [...authors.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  const accounts = business()?.accountTeardowns || [];
  const shownAccount = accounts.find(a => (a.authorId || a.authorName) === accountKey) || accounts[0];
  return `<section class="acq-panel"><h2>对标拆解</h2><p class="meta">拆结构、拆钩子、拆证据，然后换成自己业务能做的选题。不搬原文、图片、案例和作者身份。</p>
    ${works.length ? works.map(w => `<div class="acq-task"><header><strong>${esc(w.title || '未命名作品')}</strong><span class="meta">${esc(w.platform)} · 赞 ${esc((w.metrics || {}).likes ?? '—')} · 评 ${esc((w.metrics || {}).comments ?? '—')}</span></header>${teardowns.some(t => t.workId === w.id) ? `<p class="meta">已拆解 ${when(teardowns.find(t => t.workId === w.id).generatedAt)}</p>` : ''}<div class="acts">${button('teardown-run', teardowns.some(t => t.workId === w.id) ? '重新拆解' : '拆解这条', `data-id="${w.id}"`)}</div></div>`).join('') : '<p class="meta">当前业务还没有采集到作品。先在内容工作室搜索并采集对标作品。</p>'}
    ${shown ? `<h3>最近一次拆解</h3>${teardownResult(shown)}` : ''}
    ${authorRows.length ? `<h3>按博主看</h3><p class="meta">单篇看的是这一篇怎么写的；博主看的是这个人一直怎么写。</p>${authorRows.map(a => `<div class="acq-task"><header><strong>${esc(a.authorName)}</strong><span class="meta">已采 ${a.count} 条作品</span></header><div class="acts">${button('account-teardown', accounts.some(t => (t.authorId || t.authorName) === a.key) ? '重新拆博主' : '拆这个博主', `data-author="${esc(a.key)}" data-id="${esc(a.authorId)}" data-name="${esc(a.authorName)}"`)}</div></div>`).join('')}` : ''}
    ${shownAccount ? `<h3>最近一次博主拆解</h3>${accountBlock(shownAccount)}` : ''}</section>`;
}
let poolCache = null, poolLoading = false;
function topicPanel() {
  const pool = poolCache;
  if (!pool && !poolLoading) {
    poolLoading = true;
    researchApi('topic-pool', { customerId: selected })
      .then((result) => { poolCache = result.pool; poolLoading = false; renderAcquisitionUI(); })
      .catch(() => { poolLoading = false; });
  }
  const rows = (pool?.topics || []).slice(0, 12);
  return `<section class="acq-panel"><div class="acq-section-head"><div><h2>选题池</h2><p class="meta">${pool ? esc(pool.note) : '正在汇总痛点、对标、关键词和研究机会…'}</p></div>${button('create-content', '去生成', '', false)}</div>
    ${pool ? `<p class="meta">痛点 ${pool.sources.痛点} · 对标 ${pool.sources.对标} · 研究 ${pool.sources.研究} · 关键词 ${pool.sources.关键词}；候选 ${pool.counts.候选} 个，已用 ${pool.counts.已用} 个</p>` : ''}
    ${rows.length ? rows.map(t => `<div class="acq-task"><header><strong>${esc(t.angle)}</strong><span class="meta">${esc(t.source)}${t.alsoFrom.length ? ` ＋${t.alsoFrom.map(esc).join('、')}` : ''}${t.status !== '候选' ? ` · ${esc(t.status)}` : ''}</span></header>${t.why ? `<p>${esc(t.why)}</p>` : ''}${t.keywords.length ? `<p class="meta">搜索词：${t.keywords.map(esc).join('、')}</p>` : ''}${t.source === '痛点' && t.evidence.count ? `<p class="meta">来自 ${t.evidence.count} 条真实评论${t.evidence.quote ? `：「${esc(t.evidence.quote)}」` : ''}</p>` : ''}${t.source === '对标' && t.evidence.workTitle ? `<p class="meta">来自对标「${esc(t.evidence.workTitle)}」的拆解</p>` : ''}<div class="acts">${t.status === '候选' ? button('topic-use', '用这个选题', `data-key="${esc(t.key)}"`, false) + button('topic-skip', '不用', `data-key="${esc(t.key)}"`) : button('topic-reset', '恢复候选', `data-key="${esc(t.key)}"`)}</div></div>`).join('') : (pool ? '<p class="meta">还没有选题来源：先归集评论、拆解对标，或导入关键词。</p>' : '')}
    <p class="meta">「用这个选题」会写进当前业务保存的方向，下一批生成直接采用，不覆盖你原来手写的内容。</p></section>`;
}
function calibrationPanel() {
  const c = business(), cal = c?.huntCalibration;
  return `<section class="acq-panel"><div class="acq-section-head"><div><h2>行业包校准</h2><p class="meta">用真实跑出来的证据决定这个行业包能不能从 D 顶到 C／B。不改包文件，只记结论和缺口。</p></div>${button('calibrate-hunt', cal ? '重新校准' : '校准这个行业', '', false)}</div>
    ${cal ? `<p>${esc(c.hunt || '未填行业')} · 当前 <b>${esc(cal.grade)}</b> 级${cal.baseGrade && cal.baseGrade !== cal.grade ? `（原 ${esc(cal.baseGrade)} 级）` : ''} · ${when(cal.checkedAt)}</p>
      ${cal.gaps.length ? `<details><summary>还差什么 · ${cal.gaps.length} 项</summary>${cal.gaps.map(g => `<p>${esc(g.label)}：已有 ${g.have}，需要 ${g.need}（差 ${g.missing}）</p>`).join('')}<p class="meta">差额按真实数据算：评论条数、归集主题、有回音篇目、拆解作品与博主。</p></details>` : '<p class="meta">这一级的条件已经满足。</p>'}
      <p class="meta">校准结论会作为「已验证补充」注入生成提示词；包文件本身不动，策展包也不因单账号证据改等级。</p>` : '<p class="meta">还没校准过。先采评论、归集痛点、拆一条对标，再来校准。</p>'}</section>`;
}
function playbookPanel() {
  const p = business()?.playbook;
  return `<section class="acq-panel"><div class="acq-section-head"><div><h2>写作底稿</h2><p class="meta">从你有回音的内容和改稿记录里长出来。改写时自动带上，不再用通用规则。</p></div>${button('playbook-run', p ? '刷新底稿' : '生成底稿', '', false)}</div>
    ${p ? `<p class="meta">更新于 ${when(p.updatedAt)} · 有回音 ${p.coverage.replied} 篇 · 改稿记录 ${p.coverage.edits} 处 · 覆盖 ${p.coverage.packs} 个批次</p>
      ${p.evolution ? `<p class="meta">最近一轮变化：新增 ${p.evolution.added.length} 个有效角度${p.evolution.dropped.length ? `，淡出 ${p.evolution.dropped.length} 个` : ''}${p.evolution.retired.length ? `，淘汰 ${p.evolution.retired.length} 个没回音的角度` : ''}</p>` : ''}
      ${p.retired.length ? `<details><summary>已淘汰的角度 · ${p.retired.length}</summary>${p.retired.map(r => `<p>${esc(r.angle)} <span class="meta">${r.misses} 次没反应</span></p>`).join('')}<p class="meta">这些角度跑过两次以上都没回音，不再写进下一篇。</p></details>` : ''}
      ${p.cards.length ? p.cards.map((c, i) => `<div class="acq-task"><header><strong>${i + 1}. ${esc(c.kind)}</strong><span class="meta">${esc(c.angle || '角度未记录')}</span></header><p>开头：${esc(c.opener || '未记录')}</p>${c.proof ? `<p class="meta">证据：${esc(c.proof)}</p>` : ''}${c.action ? `<p class="meta">行动：${esc(c.action)}</p>` : ''}</div>`).join('') : '<p class="meta">还没有有回音的内容，底稿里只有改稿偏好。</p>'}
      ${p.editRules.length ? `<h3>反复改掉的写法</h3>${p.editRules.map(r => `<p>「${esc(r.was)}」→「${esc(r.now)}」 <span class="meta">${r.count} 次</span></p>`).join('')}` : ''}
      ${p.tone.length ? `<h3>语气样本</h3>${p.tone.map(t => `<p class="acq-quote">${esc(t)}</p>`).join('')}` : ''}
      ${(p.warnings || []).map(w => `<p class="meta">${esc(w)}</p>`).join('')}` : '<p class="meta">还没有底稿。发出去的内容被标了「有回音」、或你改过稿之后，这里才会长出真实依据。</p>'}</section>`;
}
function preview() {  const f=document.querySelector('[data-acq-form="prepare-publication"]');if(!f)return;
  const post=postOptions().find(p=>p.key===f.elements.post.value);
  f.querySelector('[data-post-preview]').innerHTML=post?`<p class="meta">最终文字预览</p><p class="acq-quote">${esc(Object.values(post.content).filter(v=>typeof v==='string').join('\n\n'))}</p>`:'';
}
function syncInquiryOptions() {
  const f=document.querySelector('[data-acq-form=inquiry]');if(!f)return;
  const platform=f.elements.platform.value, accounts=accountOptions(platform), current=f.elements.accountId.value;
  f.elements.accountId.innerHTML=options([['','请选择'],...accounts],accounts.some(([id])=>id===current)?current:accounts.length===1?accounts[0][0]:'');
  const publications=scoped('publications').filter(p=>p.status==='published'&&p.platform===platform&&p.accountId===f.elements.accountId.value);
  f.elements.publicationId.innerHTML=options([['','来源未知，不关联'],...publications.map(p=>[p.id,p.content.title||p.content.cover||when(p.publishedAt)])],f.elements.publicationId.value);
  f.elements.leadId.innerHTML=options([['','不手动关联'],...scoped('leads').filter(l=>l.platform===platform).map(l=>[l.id,l.authorName])],f.elements.leadId.value);
}
export function renderAcquisitionUI() {
  if(!ctx||document.querySelector('[data-acq-form][data-busy=true]'))return;
  const focused=document.activeElement, focusedForm=focused?.closest('[data-acq-form]');
  const focus=focusedForm&&focused.name?{key:focusedForm.dataset.formKey,name:focused.name,start:focused.selectionStart,end:focused.selectionEnd}:null;
  stash();
  const opened=[...document.querySelectorAll('[data-persist][open]')].map(d=>d.dataset.persist);
  if(ctx.getBusiness?.()&&workspace().customers.some(c=>c.id===ctx.getBusiness()))selected=ctx.getBusiness();
  if(!workspace().customers.some(c=>c.id===selected))selected=workspace().customers[0]?.id||'';
  summary();
  document.getElementById('acq-context').innerHTML=selected?customerPicker():'';
  document.getElementById('acq-results').innerHTML=resultsView();
  const noBusiness=empty('先建立业务档案','可以复用已有客户资料；创建后，两条获客路径共用同一份业务信息。')+'<button class="btn" data-customer-entry="cooperating">录入业务</button>';
  document.getElementById('acq-task-title').textContent=tab==='active'?'主动获客 / 查找与核实':'内容获客 / 登记发布';
  document.getElementById('acq-workspace').innerHTML=selected?`<div class="acts"><button type="button" class="btn ghost" data-cm="go-${tab==='active'?'prospecting':'content-home'}">返回${tab==='active'?'主动':'内容'}获客</button><button type="button" class="btn ghost" data-cm="go-conversations">继续客户跟进</button></div>${taskId?taskDetail():tab==='active'?activeView():contentView()}${taskId?'':tab==='active'?painPanel()+teardownPanel():topicPanel()+playbookPanel()+calibrationPanel()}`:noBusiness;
  document.getElementById('acq-leads').innerHTML=selected?customerPicker()+leadsView():noBusiness;
  document.getElementById('acq-accounts').innerHTML=selected?accountsView():noBusiness;
  restore();for(const d of document.querySelectorAll('[data-persist]'))if(opened.includes(d.dataset.persist))d.open=true;
  preview();syncInquiryOptions();renderAgentUI();
  if(focus){const field=[...document.querySelectorAll('[data-acq-form]')].find(f=>f.dataset.formKey===focus.key)?.elements.namedItem(focus.name);if(field){field.focus({preventScroll:true});if(focus.start!=null&&field.setSelectionRange)field.setSelectionRange(focus.start,focus.end);}}
}
export function openPublication(customerId,packId,platform,index) {
  selected=customerId;openPath('content');
  const f=document.querySelector('[data-acq-form="prepare-publication"]');
  if(f){f.elements.post.value=JSON.stringify([packId,platform,index]);preview();f.scrollIntoView({block:'start'});}
}
async function api(action,payload={}) {
  const response=await fetch(`/api/acquisition${action?`/${action}`:''}`,action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'操作失败，请重试');
  if(result.workspace)ctx.setWorkspace(result.workspace);if(result.capabilities)capabilities=result.capabilities;
  return result;
}
/** 研究类动作走独立接口：关键词扩展、痛点归集、对标拆解、写作底稿。 */
async function researchApi(path,payload={}) {
  const response=await fetch(`/api/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'操作失败，请重试');
  if(result.workspace)ctx.setWorkspace(result.workspace);
  return result;
}
export async function refreshAcquisition() {
  if(refreshing)return;refreshing=true;
  try{await api('');renderAcquisitionUI();}
  catch(error){ctx.toast(error.message);}
  finally{refreshing=false;}
  clearTimeout(timer);
  if((data().tasks||[]).some(t=>t.status==='running')||(data().agentRuns||[]).some(t=>t.status==='running'))timer=setTimeout(refreshAcquisition,2500);
}
function openPath(which) { taskId='';tab=which;poolCache=null;accountKey='';ctx.nav('acquisition');renderAcquisitionUI(); }
export function installAcquisitionUI(context) {
  ctx=context;
  installAgentUI({...ctx,getSelected:()=>selected,picker:customerPicker,api,refresh:refreshAcquisition,render:renderAcquisitionUI,accounts:()=>{ctx.nav('acquisition');document.getElementById('acq-connection-panel').open=true;document.getElementById('acq-accounts').scrollIntoView({block:'start'});}});
  document.body.addEventListener('change',e=>{
    if(e.target.matches('[data-acq-business]')){stash();selected=e.target.value;ctx.setBusiness?.(selected);leadId=taskId='';status='pending';origin=stage='all';page=leadPage=0;poolCache=null;renderAcquisitionUI();}
    if(e.target.matches('[data-acq-status]')){status=e.target.value;page=0;renderAcquisitionUI();}
    if(e.target.matches('[data-acq-origin]')){origin=e.target.value;leadPage=0;renderAcquisitionUI();}
    if(e.target.matches('[data-acq-stage]')){stage=e.target.value;leadPage=0;renderAcquisitionUI();}
    if(e.target.closest('[data-acq-form="prepare-publication"]')&&e.target.name==='post')preview();
    if(e.target.closest('[data-acq-form=inquiry]')&&['platform','accountId'].includes(e.target.name))syncInquiryOptions();
  });
  document.body.addEventListener('submit',async e=>{
    const f=e.target.closest('[data-acq-form]');if(!f)return;e.preventDefault();
    if(f.dataset.busy)return;
    const values=Object.fromEntries(new FormData(f));for(const el of f.querySelectorAll('input[type="checkbox"]'))values[el.name]=el.checked;
    if(e.submitter?.name)values[e.submitter.name]=e.submitter.value;
    let action=f.dataset.acqForm,payload={...values,customerId:selected};
    const btn=e.submitter,originalLabel=btn?.textContent;f.dataset.busy='true';if(btn){btn.disabled=true;btn.textContent='正在处理…';}f.querySelector('.acq-error').textContent='';
    try {
      if(action==='search')payload.platforms=values.platform==='both'?['小红书','抖音']:[values.platform];
      if(action==='single-signal'){action='import';payload={customerId:selected,source:values.source,rows:[values]};}
      if(action==='bulk'){
        const file=f.elements.file.files[0];if(!file||file.size>60000)throw new Error('请选择不超过 60 KB 的 JSON 文件');
        let rows;try{rows=JSON.parse(await file.text());}catch{throw new Error('文件不是有效 JSON，请检查数组格式');}
        action='import';payload={customerId:selected,source:values.source,rows};
      }
      if(action==='review')payload.signalId=f.dataset.id;
      if(action==='prepare-publication'){
        const [packId,platform,index]=JSON.parse(values.post);payload={customerId:selected,packId,platform,index,accountId:values.accountId};
      }
      if(action==='publication')payload.publicationId=f.dataset.id;
      if(['draft','followup','block','sent'].includes(action)){
        payload.leadId=f.dataset.lead||f.dataset.id;payload.action={draft:'draft',followup:'update',block:f.dataset.blocked==='true'?'unblock':'block',sent:'sent'}[action];
        if(action==='sent')payload.messageId=f.dataset.id;action='lead';
      }
      await api(action,payload);formDrafts.delete(f.dataset.formKey);f.remove();
      renderAcquisitionUI();ctx.render();ctx.toast(action==='search'?'任务已开始，关闭页面后服务端继续处理':'已保存');
      if(action==='inquiry')document.getElementById('acq-inquiry').open=false;
      if(action==='search')refreshAcquisition();
    } catch(error){f.querySelector('.acq-error').textContent=error.message;}
    finally{delete f.dataset.busy;if(btn){btn.disabled=false;btn.textContent=originalLabel;}}
  });
  document.body.addEventListener('click',async e=>{
    const tabButton=e.target.closest('[data-acq-tab]');if(tabButton){taskId='';tab=tabButton.dataset.acqTab;renderAcquisitionUI();return;}
    const b=e.target.closest('[data-acq-action]');if(!b||b.disabled)return;
    const action=b.dataset.acqAction;
    if(action==='open-task'){const task=data().tasks.find(t=>t.id===b.dataset.id);if(task){selected=task.customerId;taskId=task.id;tab='active';ctx.nav('acquisition');renderAcquisitionUI();document.getElementById('acq-task-detail')?.scrollIntoView({block:'start'});}return;}
    if(action==='back-tasks'){taskId='';renderAcquisitionUI();return;}
    if(action==='open-active'||action==='open-content'){openPath(action==='open-active'?'active':'content');return;}
    if(action==='open-lead'){
      const l=data().leads.find(l=>l.id===b.dataset.id);if(l){selected=l.customerId;leadId=l.id;}origin=stage='all';ctx.nav('leads');renderAcquisitionUI();return;
    }
    if(action==='select-lead'){leadId=b.dataset.id;renderAcquisitionUI();if(matchMedia('(max-width: 850px)').matches)document.getElementById('acq-lead-detail').scrollIntoView({block:'start'});return;}
    if(action==='accounts'){ctx.nav('acquisition');document.getElementById('acq-connection-panel').open=true;document.getElementById('acq-accounts').scrollIntoView({block:'start'});return;}
    if(action==='create-content'){ctx.openContent(selected);return;}
    if(action==='signal-prev'||action==='signal-next'){page+=action.endsWith('prev')?-1:1;renderAcquisitionUI();return;}
    if(action==='lead-prev'||action==='lead-next'){leadPage+=action.endsWith('prev')?-1:1;renderAcquisitionUI();return;}
    if(action==='inquiry-for'){
      const p=data().publications.find(p=>p.id===b.dataset.id);selected=p.customerId;ctx.nav('leads');renderAcquisitionUI();
      const f=document.querySelector('[data-acq-form="inquiry"]');f.elements.platform.value=p.platform;syncInquiryOptions();f.elements.accountId.value=p.accountId;syncInquiryOptions();f.elements.publicationId.value=p.id;
      document.getElementById('acq-inquiry').open=true;f.scrollIntoView({block:'start'});return;
    }
    if(action==='view-publication'){openPath('content');const detail=document.querySelector(`[data-persist="publication-${b.dataset.id}"]`);if(detail){detail.open=true;detail.scrollIntoView({block:'start'});}return;}
    if(action==='export'||action==='export-task'){
      const record=action==='export-task'?{task:scoped('tasks').find(t=>t.id===b.dataset.id),signals:scoped('signals').filter(s=>s.taskId===b.dataset.id)}:{leads:scoped('leads'),signals:scoped('signals'),publications:scoped('publications')};
      const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),business:business()?.name,...record},null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='harta-followups.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return;
    }
    const originalLabel=b.textContent;b.disabled=true;b.textContent='正在处理…';
    try {
      if(action==='suggestion'){
        const result=await api('suggestion',{leadId:b.dataset.id}),f=b.closest('form');f.elements.text.value=result.text;ctx.toast(result.basis);return;
      }
      if(action==='copy-message'){
        const l=data().leads.find(l=>l.id===b.dataset.lead),m=l.messages.find(m=>m.id===b.dataset.id);
        // Server checks contact restrictions before any clipboard side effect.
        await api('lead',{leadId:l.id,messageId:m.id,action:'check-copy'});
        try { await navigator.clipboard.writeText(m.text); } catch { throw new Error('剪贴板不可用，请在草稿中手动选中文字；尚未登记发送。'); }
        await api('lead',{leadId:l.id,messageId:m.id,action:'copy'});ctx.toast('已复制草稿，请在平台核对后发送');
      }
      if(action==='stop')await api('stop',{taskId:b.dataset.id});
      if(action==='rerun'){
        const t=data().tasks.find(t=>t.id===b.dataset.id);await api('search',{customerId:t.customerId,query:t.query,platforms:t.platforms,rerunOf:t.id,agentId:t.agentSnapshot?.id});refreshAcquisition();
      }
      if(action==='cancel-publication')await api('publication',{publicationId:b.dataset.id,action:'cancel'});
      if(action==='takeover')await api('lead',{leadId:b.dataset.id,action:'takeover'});
      if(action==='pains-run'){
        const result=await researchApi('pain-clusters',{customerId:selected});
        poolCache=null;
        ctx.toast(result.clusters?.clusters?.length?`已归出 ${result.clusters.clusters.length} 个痛点主题`:'没有可归集的评论');
      }
      if(action==='teardown-run'){
        workId=b.dataset.id;
        const result=await researchApi('benchmark/teardown',{customerId:selected,workId});
        poolCache=null;
        ctx.toast(result.teardown?.warning||'拆解完成，可看结构与选题');
      }
      if(action==='account-teardown'){
        accountKey=b.dataset.author;
        const result=await researchApi('benchmark/account',{customerId:selected,authorId:b.dataset.id,authorName:b.dataset.name});
        poolCache=null;
        ctx.toast(result.account?.warnings?.[0]||'博主拆解完成，可看打法与不可搬的东西');
      }
      if(action==='calibrate-hunt'){
        const result=await researchApi('hunt-calibration',{customerId:selected});
        const cal=result.calibration;
        ctx.toast(cal.grade===cal.baseGrade?`仍是 ${cal.grade} 级，还差 ${cal.gaps.length} 项`:`已升到 ${cal.grade} 级${cal.gaps.length?`，下一级还差 ${cal.gaps.length} 项`:''}`);
      }
      if(action==='topic-use'||action==='topic-skip'||action==='topic-reset'){
        const result=await researchApi('topic-decide',{customerId:selected,key:b.dataset.key,action:action.replace('topic-','')});
        poolCache=result.pool;
        ctx.toast(action==='topic-use'?'已写进本批方向，去生成时自动采用':action==='topic-skip'?'已标记不用':'已恢复为候选');
      }
      if(action==='playbook-run'){
        const result=await researchApi('writing-playbook',{customerId:selected});
        ctx.toast(result.playbook?.coverage?.replied?`底稿已更新，来自 ${result.playbook.coverage.replied} 篇有回音的内容`:'还没有有回音的内容，底稿只保留了改稿偏好');
      }
      renderAcquisitionUI();ctx.render();
    } catch(error){ctx.toast(error.message);}finally{b.disabled=false;b.textContent=originalLabel;}
  });
}

export function openAcquisitionContext(customerId, mode='active', contact='') {
  stash();selected=customerId;ctx.setBusiness?.(customerId);taskId='';
  document.querySelector('[data-view=acquisition]').dataset.journey=mode==='content'?'content':'active';
  if(['leads','inquiry'].includes(mode)){leadId=contact;ctx.nav('leads');}
  else {tab=mode==='content'?'content':'active';ctx.nav('acquisition');}
  renderAcquisitionUI();
  if(mode==='inquiry'){document.getElementById('acq-inquiry').open=true;document.getElementById('acq-inquiry').scrollIntoView({block:'start'});}
  if(mode==='import'){const panel=document.querySelector('[data-persist=import-signals]');if(panel){panel.open=true;panel.scrollIntoView({block:'start'});}}
  if(mode==='accounts'){document.getElementById('acq-connection-panel').open=true;document.getElementById('acq-accounts').scrollIntoView({block:'start'});}
}
