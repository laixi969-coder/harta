// Business context, product facts and purchasing needs are independent scopes.
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp = value => value?new Date(value).toLocaleString('zh-CN'):'时间未知';
const opts=(rows,value)=>rows.map(r=>{const [id,label]=Array.isArray(r)?r:[r,r];return `<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`;}).join('');
const field=(name,label,value='',required=false,type='text',max=2000)=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="${max}" ${required?'required':''}></label>`;
const area=(name,label,value='',required=false,max=3000)=>`<label>${esc(label)}<textarea name="${name}" rows="3" maxlength="${max}" ${required?'required':''}>${esc(value)}</textarea></label>`;
const select=(name,label,rows,value='')=>`<label>${esc(label)}<select name="${name}">${opts(rows,value)}</select></label>`;
const button=(act,label,id='',main=false)=>`<button type="button" class="btn ${main?'':'ghost'}" data-cm="${act}" data-id="${esc(id)}">${esc(label)}</button>`;
const anchor=(url,label)=>{try{const u=new URL(url);if(['https:','http:'].includes(u.protocol))return `<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${esc(u.href)}">${esc(label)} ↗</a>`;}catch{}return '';};
const empty=(title,note)=>`<div class="cm-empty"><h2>${esc(title)}</h2><p>${esc(note)}</p></div>`;
let ctx, businessId='', targetId='', workId='', contactId='', opId='', editProduct='', editSku='', poll;
const drafts=new Map(), openDetails=new Set();
let busy=0;
const ws=()=>ctx.getWorkspace();
const data=()=>ws().acquisition||{};
const rows=key=>(data()[key]||[]).filter(r=>r.customerId===businessId);
const customer=()=>ws().customers.find(c=>c.id===businessId);
const productName=id=>rows('products').find(p=>p.id===id)?.name||'历史产品';
const scopeNames=o=>o?.productIds?.length?o.productIds.map(productName).join('、'):'品牌通用';
const submit=label=>`<button class="btn" type="submit">${esc(label)}</button>`;
const form=(action,body,id='',extra='',contextKey='')=>`<form class="cm-form" data-cm-form="${action}" data-key="${esc(`${businessId}:${action}:${id}${contextKey?':'+contextKey:''}`)}" data-id="${esc(id)}" ${extra}>${body}<p class="cm-error" role="alert"></p></form>`;
const panel=(key,title,body)=>`<details class="cm-panel" data-cm-detail="${esc(`${businessId}:${key}`)}"><summary>${esc(title)}</summary>${body}</details>`;
function stash(){document.querySelectorAll('[data-cm-form]').forEach(f=>{if(!f.getClientRects().length)return;const values={};for(const el of f.elements)if(el.name)values[el.name]=el.type==='checkbox'?el.checked:el.type==='file'?null:el.value;const checks=[...f.querySelectorAll('input[type=checkbox]')].map(el=>[el.name,el.value,el.checked]);drafts.set(f.dataset.key,{values,checks});});document.querySelectorAll('[data-cm-detail]').forEach(d=>{if(d.open)openDetails.add(d.dataset.cmDetail);else openDetails.delete(d.dataset.cmDetail);});}
function restore(){document.querySelectorAll('[data-cm-form]').forEach(f=>{const d=drafts.get(f.dataset.key);if(!d)return;for(const el of f.elements)if(el.name&&el.type!=='file'&&el.type!=='checkbox'&&Object.hasOwn(d.values,el.name))el.value=d.values[el.name];if(f.dataset.cmForm==='sales-document'){const selected=f.querySelector('[name=productId]').value;f.querySelector('[name=skuId]').innerHTML=opts([['','产品所有规格通用'],...rows('skus').filter(s=>s.productId===selected).map(s=>[s.id,s.name])],d.values.skuId||'');}for(const [name,value,checked]of d.checks){const el=[...f.elements].find(e=>e.name===name&&e.value===value&&e.type==='checkbox');if(el)el.checked=checked;}});document.querySelectorAll('[data-cm-detail]').forEach(d=>d.open=openDetails.has(d.dataset.cmDetail));}
const picker=()=>`<label class="cm-business">业务<select data-cm-business>${opts(ws().customers.map(c=>[c.id,c.name]),businessId)}</select></label>`;
const heading=(title,subtitle)=>`<header class="cm-heading"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${picker()}</header>`;
function scopeFields(value={},forNeed=false){
  value ||= {};
  const products=rows('products').filter(p=>p.status==='active');
  return `<fieldset class="cm-scope"><legend>${forNeed?'涉及的产品（尚未明确可不选）':'这次涉及的产品（不选则为品牌通用）'}</legend>${products.map(p=>`<label class="cm-check"><input type="checkbox" name="productIds" value="${p.id}" ${(value.productIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')||'<p>还没有产品，可先使用业务资料。</p>'}<details><summary>具体规格（需要报价或参数时再选）</summary>${rows('skus').filter(s=>s.status==='active'&&products.some(p=>p.id===s.productId)).map(s=>`<label class="cm-check"><input type="checkbox" name="skuIds" value="${s.id}" ${(value.skuIds||[]).includes(s.id)?'checked':''}>${esc(productName(s.productId))} · ${esc(s.name)}</label>`).join('')||'<p>规格尚未添加，不影响品牌或产品内容。</p>'}</details></fieldset>`;
}
function businessForm(){return panel('business-new','添加业务',form('business',`${field('name','业务名称','',true)}${field('pitch','一句话介绍','',true)}${field('hunt','行业（选填）','',false)}${submit('建立业务')}`));}
function today(){
  const c=customer(), packs=[...(c?.drops||[]),...(c?.packs||[])], changed=packs.filter(p=>p.productReview?.required), pending=rows('signals').filter(s=>s.status==='pending'&&!s.isAuthorReply), inquiries=rows('leads').filter(l=>l.needsReply);
  return heading('今天','从需要处理的事开始。')+`<p class="cm-summary">${changed.length} 批内容待核对 · ${pending.length} 条需求待核实 · ${inquiries.length} 位联系人有待回复记录</p><p class="meta">仅汇总当前业务已保存记录，平台消息尚未同步。</p><div class="acts">${button('go-prospecting','去找客户','',true)}${button('content','创作内容')}${button('go-products','整理产品')}</div>${followupQueue()}<div class="cm-panel"><h2>需要你处理</h2>${changed.map(p=>`<article class="cm-row"><div><strong>${esc(p.title||'历史内容批次')}</strong><p>${esc(scopeNames(p.productScope))} · 所引用资料有更新</p></div>${button('open-pack','核对内容',p.id)}</article>`).join('')}${inquiries.map(l=>`<article class="cm-row"><div><strong>${esc(l.authorName)}</strong><p>有已登记咨询待回复</p></div>${button('open-contact','查看咨询',l.id)}</article>`).join('')}${!changed.length&&!inquiries.length?empty('继续推进一个真实需求','先查看原评论，或用业务资料创作一篇内容。'):''}</div><div class="cm-panel"><h2>继续上次工作</h2><div class="acts">${button('go-products','产品与规格')}${button('knowledge','业务资料与研究')}${button('reports','诊断报告与历史')}${button('legacy','发布与历史记录')}</div></div>${businessForm()}`;
}
function productForm(p,isSku=false){
  return form(isSku?'sku':'product',`${field('name',isSku?'规格名称':'产品或服务名称',p?.name||'',true)}${isSku?field('attributes','规格参数',p?.attributes||''):''}${area('facts','已确认的事实、适用场景与限制',p?.facts||'',false,8000)}${area('priceTerms',isSku?'价格、单位及适用条件（未知留空）':'基础价格与适用条件（有规格时使用规格报价）',p?.priceTerms||'')}${field('priceExpiresAt','报价有效至（长期有效可留空）',p?.priceExpiresAt?new Date(new Date(p.priceExpiresAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',false,'datetime-local')}${field('source','资料来源（填写事实时必填）',p?.source||'')}${select('status','推广状态',[['active','正常使用'],['archived','停止推广，保留历史']],p?.status||'active')}<input type="hidden" name="baseRevision" value="${p?.revision||0}">${isSku?`<input type="hidden" name="productId" value="${esc(p?.productId||editProduct)}">`:''}${submit(p?.id?'保存修改':'添加')}`,p?.id||'','',isSku&&!p?.id?(p?.productId||editProduct):'');
}
function salesDocumentForm(d){
  const selected=d?.productId||editProduct||'';
  return form('sales-document',`${field('title','资料标题',d?.title||'',true)}${select('productId','适用产品',[['','整个业务通用'],...rows('products').filter(p=>p.status==='active'||p.id===selected).map(p=>[p.id,p.name])],selected)}${select('skuId','适用规格',[['','产品所有规格通用'],...rows('skus').filter(s=>s.productId===selected).map(s=>[s.id,s.name])],d?.skuId||'')}${area('body','FAQ、适用条件、使用说明或已获准公开的案例',d?.body||'',true,30000)}${field('source','可追溯的原始资料或核对依据',d?.source||'',true)}${field('expiresAt','失效时间（长期有效可留空）',d?.expiresAt?new Date(new Date(d.expiresAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',false,'datetime-local')}${select('status','使用状态',[['draft','待确认，不用于沟通'],['approved','已确认，可用于沟通'],['archived','停用，保留历史']],d?.status||'draft')}<label class="cm-check"><input type="checkbox" name="confirmed">我已核实内容，且允许用于对外沟通</label><input type="hidden" name="baseRevision" value="${d?.revision||0}">${submit('保存资料')}`,d?.id||'');
}
function salesDocuments(){
  return `<section class="cm-panel"><h2>销售知识库</h2><p>把反复要回答的问题、使用说明和可信案例放在这里。报价请维护在产品或规格的价格条件里；资料中的历史价格不会作为报价依据。</p>${panel('document-new','添加销售资料',salesDocumentForm())}${rows('salesDocuments').map(d=>panel(`document-${d.id}`,`${d.title} · ${d.status==='approved'?(d.expiresAt&&Date.parse(d.expiresAt)<=Date.now()?'已到期':'可用于沟通'):d.status==='archived'?'已停用':'待确认'}`,`<p class="meta">${esc(d.productId?productName(d.productId):'业务通用')} · v${d.revision} · ${esc(d.source)}</p>${salesDocumentForm(d)}`)).join('')||'<p class="meta">没有补充资料时，智能体仍可使用已确认的产品事实；缺少的信息会提示核对。</p>'}</section>`;
}
function salesPlanView(plan,method){
  if(!plan)return '';
  return `<details class="cm-sales-plan"><summary>${esc(plan.name)} · ${method==='template'?'澄清模板':'沟通建议'}</summary><p><strong>本轮目标：</strong>${esc(plan.goal)}</p><p>${esc(plan.rationale)}</p><p><strong>下一步：</strong>${esc(plan.nextStep)}</p>${plan.missing.map(t=>`<p class="meta">待核对：${esc(t)}</p>`).join('')}<h4>本轮提供的依据</h4>${plan.references.map(r=>`<p class="meta">${esc(r.title)} · v${r.revision} · ${esc(r.source||'来源待补')}</p>${r.text?`<blockquote class="cm-evidence">${esc(r.text)}</blockquote>`:''}`).join('')||'<p class="meta">尚无产品资料，先澄清需求。</p>'}<p class="meta">${esc(plan.version)} · 建议不会自动改变阶段或标记成交。</p></details>`;
}
function followupQueue(){
  const candidates=rows('opportunities').filter(o=>!['已成交','已结束'].includes(o.stage)).map(o=>{
    const l=rows('leads').find(l=>l.id===o.leadId);if(!l||l.doNotContact)return null;
    const messages=l.messages.filter(m=>m.opportunityId===o.id);
    const incoming=messages.filter(m=>m.direction==='inbound').sort((a,b)=>Date.parse(a.receivedAt||a.createdAt)-Date.parse(b.receivedAt||b.createdAt)).at(-1);
    const awaiting=incoming&&!messages.some(m=>m.status==='sent_manual'&&m.replyTo===incoming.id&&Date.parse(m.sentAt)>=Date.parse(incoming.receivedAt||incoming.createdAt));
    const due=o.nextAt&&Date.parse(o.nextAt)<=Date.now();
    const first=!messages.some(m=>m.status==='sent_manual'||m.direction==='inbound');
    if(!awaiting&&!due&&!first)return null;
    return {o,l,label:o.manualTakeover||l.manualTakeover?'人工跟进':awaiting?'待回复':due?'已到跟进时间':'待开场',rank:awaiting?0:due?1:2};
  }).filter(Boolean).sort((a,b)=>a.rank-b.rank||Date.parse(a.o.nextAt||a.o.createdAt)-Date.parse(b.o.nextAt||b.o.createdAt));
  return `<section class="cm-panel"><h2>销售跟进</h2><p class="meta">优先处理已收到的咨询，再核对到期跟进和新需求。只统计已登记记录。</p>${candidates.slice(0,12).map(({o,l,label})=>`<article class="cm-row"><div><span class="cm-tag">${label}</span><strong> ${esc(l.authorName)} · ${esc(o.title)}</strong><p>${esc(o.nextStep||'查看原话和产品，确定本轮沟通目标')}${o.nextAt?' · '+stamp(o.nextAt):''}</p></div>${button('open-need','继续跟进',o.id)}</article>`).join('')||'<p>暂无待开场、待回复或到期的购买需求。</p>'}</section>`;
}
function products(){
  const list=rows('products'),p=list.find(p=>p.id===editProduct),s=rows('skus').find(s=>s.id===editSku);
  return heading('产品与服务','共用产品资料，只在需要时维护具体规格。')+`<div class="cm-columns"><div><div class="cm-panel"><h2>产品目录</h2>${list.map(p=>`<div class="cm-product"><div class="cm-row"><button type="button" class="cm-link" data-cm="select-product" data-id="${p.id}">${esc(p.name)}</button><span>${p.status==='archived'?'已停止推广':''}</span>${button('write-product','写内容',p.id)}</div><details><summary>${rows('skus').filter(s=>s.productId===p.id).length} 个规格</summary>${rows('skus').filter(s=>s.productId===p.id).map(s=>`<div class="cm-sku">${button('select-sku',s.name,s.id)}<span>${esc(s.attributes)}${s.status==='archived'?' · 已停止推广':''}</span></div>`).join('')}${button('add-sku','添加规格',p.id)}</details><p class="meta">${esc(p.source||'待补充资料')} · v${p.revision}</p></div>`).join('')||empty('先添加一款产品或服务','规格和编码可以稍后补充，不需要先建立完整目录。')}</div>${button('new-product','添加另一款产品')}</div><div class="cm-panel"><h2>${s?'编辑规格':p?'编辑产品':'添加产品或服务'}</h2>${productForm(editSku==='new'?{productId:editProduct}:s||p,Boolean(s)||editSku==='new')}<p class="meta">保存的事实进入创作与沟通依据。更新后，已引用这些资料的草稿需要重新核对。</p></div></div>${salesDocuments()}`;
}
function comment(s,depth=0){
  const children=rows('signals').filter(r=>r.workId===s.workId&&r.parentRecordId&&r.parentRecordId===s.recordId);
  return `<article class="cm-comment ${depth?'cm-reply':''}"><header><strong>${esc(s.authorName||'昵称未知')}</strong><span class="cm-tag">${s.isAuthorReply?'视频作者':s.status==='confirmed'?'已保存':s.status==='excluded'?'已排除':'待核实'}</span></header><p class="cm-quote">${esc(s.text)}</p><p class="meta">${stamp(s.publishedAt||s.collectedAt)} ${s.parentRecordId&&!depth?' · 父评论未在当前范围内':''}</p><div class="acts">${anchor(s.url,'原评论')}${s.leadId?button('open-contact','查看跟进',s.leadId):''}</div>${!s.leadId&&!s.isAuthorReply?panel(`review-${s.id}`,'核实或排除',form('review',`${area('note','核实依据或排除理由','',true)}${select('action','处理方式',[['confirm','保存为值得跟进的线索'],['exclude','排除此需求']])}${submit('保存核实结果')}`,s.id)):''}${depth<20?children.map(r=>comment(r,depth+1)).join(''):children.length?'<p>更多回复请从原评论查看。</p>':''}</article>`;
}
function prospecting(){
  const targets=rows('targets');if(!targets.some(t=>t.id===targetId))targetId=targets[0]?.id||'';
  const t=targets.find(t=>t.id===targetId), works=rows('works').filter(w=>w.targetId===targetId),w=works.find(w=>w.id===workId),signals=rows('signals').filter(s=>s.workId===workId);
  const targetForm=panel('target','添加目标账号',form('target',`${select('platform','平台',['抖音','小红书','视频号','B站','知乎','其他'])}${field('name','目标账号名称','',true)}${field('url','账号主页链接','',true,'url')}${field('recordId','平台账号 ID（可核对作者回复）')}${submit('保存目标账号')}`));
  const worksForm=t?panel(`work-${t.id}`,'添加这个账号的视频',form('work',`<input type="hidden" name="targetId" value="${t.id}">${field('title','视频标题','',true)}${field('url','原视频链接','',true,'url')}${field('recordId','平台视频 ID（选填）')}${area('description','视频内容与语境（选填）')}${submit('保存视频记录')}`,t.id)):'';
  const intake=w?panel(`comments-${w.id}`,'导入真实评论',form('comments',`<input type="hidden" name="workId" value="${w.id}">${area('json','评论 JSON 数组','',true,55000)}<p class="meta">每条填写 text、url；可填 recordId、authorId、authorName、parentRecordId、isAuthorReply、publishedAt。最多 100 条，保留楼中楼关系。</p>${field('source','资料取得方式或来源','',true)}${submit('导入并去重')}`,w.id)):'';
  return heading('找客户','从其他账号的视频评论中发现真实需求。')+`<div class="acts">${button('search','按关键词查找公开摘要')}${button('legacy','导入其他需求证据')}</div><p class="cm-notice">抖音等平台的站内读取尚未接通。这里保存真实账号、视频和导入评论，不代表已读取全部评论。</p><div class="cm-targets"><aside class="cm-panel"><h2>目标账号</h2>${targets.map(t=>`<button type="button" class="cm-list-item ${t.id===targetId?'selected':''}" data-cm="select-target" data-id="${t.id}"><strong>${esc(t.name)}</strong><small>${esc(t.platform)}</small></button>`).join('')||'<p>添加你希望研究的公开账号主页。</p>'}${targetForm}</aside><section class="cm-panel">${w?`<div class="acts">${button('back-videos','返回视频列表')}</div><h2>${esc(w.title)}</h2><p>${esc(t.name)} · ${esc(w.platform)} · ${esc(w.description)}</p>${anchor(w.url,'在平台打开视频')}<p class="meta">已导入 ${signals.length} 条，其中 ${signals.filter(s=>s.parentRecordId).length} 条回复；仅本次取得范围。</p>${intake}${signals.filter(s=>!s.parentRecordId||!signals.some(p=>p.recordId&&p.recordId===s.parentRecordId)).map(s=>comment(s)).join('')||empty('还没有这个视频的评论','导入带原文和链接的评论，不把视频标题当作买家需求。')}`:`<h2>${esc(t?.name||'选择目标账号')}</h2>${t?anchor(t.url,'打开主页'):''}${worksForm}${works.map(w=>`<article class="cm-video"><div class="cm-video-symbol" aria-hidden="true">▶</div><div><h3>${esc(w.title)}</h3><p>${rows('signals').filter(s=>s.workId===w.id).length} 条已导入评论</p>${button('open-video','查看评论',w.id)}</div>${anchor(w.url,'原视频')}</article>`).join('')||'<p>保存真实视频链接后，导入你取得的评论。无需上传或复制其他作者的视频文件。</p>'}`}</section></div>`;
}
function opportunityForm(lead,op){return form('opportunity',`<input type="hidden" name="leadId" value="${lead.id}"><input type="hidden" name="baseRevision" value="${op?.revision||0}">${field('title','这次购买需求',op?.title||'',true)}${scopeFields(op,true)}${select('stage','本次需求阶段',['待核实','了解需求','比较中','询价中','已成交','已结束'],op?.stage||'待核实')}${area('note','本次判断或跟进依据','',true)}${field('nextStep','下一步',op?.nextStep||'')}${field('nextAt','下次跟进时间',op?.nextAt?new Date(new Date(op.nextAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'',false,'datetime-local')}<fieldset><legend>关联需求证据</legend>${rows('signals').filter(s=>lead.signalIds.includes(s.id)).map(s=>`<label class="cm-check"><input type="checkbox" name="signalIds" value="${s.id}" ${(op?.signalIds||lead.signalIds).includes(s.id)?'checked':''}>${esc(s.text.slice(0,70))}</label>`).join('')}</fieldset>${submit(op?'保存本次跟进':'建立购买需求')}`,op?.id||lead.id);}
function conversations(){
  const leads=rows('leads');if(!leads.some(l=>l.id===contactId))contactId=leads[0]?.id||'';
  const l=leads.find(l=>l.id===contactId),ops=rows('opportunities').filter(o=>o.leadId===contactId);
  if(!ops.some(o=>o.id===opId))opId=ops[0]?.id||'';
  const op=ops.find(o=>o.id===opId);
  const accounts=rows('accounts').filter(a=>a.platform===l?.platform),agents=rows('agents').filter(a=>a.status==='enabled'&&a.versions.at(-1).config.duties.includes('接待'));
  const messages=l?.messages.filter(m=>m.opportunityId===opId)||[];
  return heading('客户与咨询','每次购买需求独立推进，历史成交不会被新咨询覆盖。')+`<div class="acts">${button('new-inquiry','登记收到的咨询')}${button('go-prospecting','去发现需求')}${button('accounts','登记发送账号')}${button('old-leads','未关联需求的历史会话')}</div><div class="cm-conversations"><aside class="cm-panel"><h2>联系人</h2>${leads.map(l=>`<button type="button" class="cm-list-item ${l.id===contactId?'selected':''}" data-cm="open-contact" data-id="${l.id}"><strong>${esc(l.authorName)}</strong><small>${esc(l.platform)}${l.doNotContact?' · 禁止联系':''}</small></button>`).join('')||'<p>先核实评论里的需求，或登记真实咨询。</p>'}</aside><section class="cm-panel">${l?`<h2>${esc(l.authorName)}</h2><div class="cm-op-tabs">${ops.map(o=>`<button type="button" class="cm-list-item ${o.id===opId?'selected':''}" data-cm="select-op" data-id="${o.id}"><strong>${esc(o.title)}</strong><small>${esc(o.stage)}</small></button>`).join('')}</div>${panel(`new-op-${l.id}`,'新增一次购买需求',opportunityForm(l,null))}${op?`<h3>${esc(op.title)} <span class="cm-tag">${esc(op.stage)}</span></h3><p>${esc(op.productIds.length?scopeNames(op):'产品待确认')} · ${op.skuIds.length?op.skuIds.map(id=>esc(rows('skus').find(s=>s.id===id)?.name||'历史规格')).join('、'):'规格未确定'}</p><p>${esc(op.nextStep||'下一步尚未记录')}</p>${panel(`op-${op.id}`,'更新阶段、产品与下一步',opportunityForm(l,op))}${(op.signalIds||[]).map(id=>rows('signals').find(s=>s.id===id)).filter(Boolean).map(s=>`<blockquote class="cm-evidence">${esc(s.text)}<div>${anchor(s.url,'原始需求')}${s.workId?button('open-source','查看视频上下文',s.workId):''}</div></blockquote>`).join('')}
<div class="cm-messages">${messages.map(m=>`<article class="cm-message ${m.direction==='outbound'?'outbound':''}"><header>${m.direction==='inbound'?'收到咨询':m.status==='sent_manual'?'已发送 · 人工登记':m.status==='cancelled'?'已取消':'待审阅草稿'} · ${esc(m.channel)} <small>${stamp(m.createdAt)}</small></header><p class="cm-quote">${esc(m.text)}</p>${salesPlanView(m.salesPlan,m.method)}${m.stale?`<p class="cm-notice">${esc(m.staleReason)}</p>`:''}${m.direction==='outbound'&&['draft','copied'].includes(m.status)?`<p class="meta">发送账号：${esc(accounts.find(a=>a.id===m.accountId)?.name||'历史账号')} · 接收对象：${esc(m.recipient)}</p><div class="acts">${!m.stale&&!l.doNotContact?button('copy-message','复制草稿',m.id):''}</div>${panel(`sent-${m.id}`,'登记实际发送',form('sent',`${field('sentAt','实际发送时间','',true,'datetime-local')}${area('note','平台发送凭证或核对依据','',true)}<label class="cm-check"><input type="checkbox" name="confirmed" required>我已在平台实际发送上述内容</label>${submit('登记已发送')}`,m.id))}`:''}</article>`).join('')||'<p>这个购买需求还没有会话记录。</p>'}</div>
${l.doNotContact?'<p class="cm-notice">对方已拒绝联系，不能生成或复制联系草稿。</p>':`<section class="cm-agent-box"><h3>销售沟通</h3><p>结合客户原话、产品知识和本次需求，选择合适的沟通方式。</p><p class="meta">开场 → 澄清需求 → 产品匹配 → 处理顾虑 → 推进成交。按实际情况选择，不机械走完每一步。</p><p>当前：生成建议 · 平台自动收发待接通</p><div class="acts"><button class="btn ghost" disabled>确认后发送 · 未接通</button><button class="btn ghost" disabled>自动沟通 · 未接通</button></div>${['已成交','已结束'].includes(op.stage)?'<p>本次购买需求已结束。新的购买意向可另建需求；回访可使用下方手写回复。</p>':op.manualTakeover||l.manualTakeover?'<p>已人工接管，智能体不会继续起草。</p>':form('outreach',`${select('agentId','使用智能体',[['','请选择已启用接待职责的智能体'],...agents.map(a=>[a.id,a.versions.at(-1).config.name])])}${select('accountId','发送账号',[['','请选择'],...accounts.map(a=>[a.id,a.name])])}${select('channel','联系渠道',['评论','私信'])}${select('signalId','公开回复的原评论',[['','私信可不选'],...rows('signals').filter(s=>op.signalIds.includes(s.id)).map(s=>[s.id,s.text.slice(0,60)])])}${submit('结合上下文起草')}`,op.id)}${l.manualTakeover?panel(`resume-contact-${l.id}`,'恢复该联系人的智能体建议',form('resume-contact',`${area('note','恢复依据','',true)}${submit('恢复建议')}`,l.id)):panel(`control-${op.id}`,op.manualTakeover?'恢复建议':'人工接管',form(op.manualTakeover?'resume':'handoff',`${area('note','操作原因','',true)}${submit(op.manualTakeover?'恢复智能体建议':'接管本次需求')}`,op.id))}</section>`}
${panel(`inbound-${op.id}`,'登记收到的新消息',form('inquiry',`${select('accountId','接收账号',[['','请选择'],...accounts.map(a=>[a.id,a.name])])}${select('channel','渠道',['评论','私信'])}${area('text','消息原文','',true,6000)}${field('messageId','平台消息 ID（选填）')}${field('receivedAt','实际收到时间','',true,'datetime-local')}${field('evidence','来源或核对依据','',true)}${submit('保存消息')}`,op.id))}
${panel(`manual-${op.id}`,'手动写回复',form('manual-draft',`${select('accountId','发送账号',[['','请选择'],...accounts.map(a=>[a.id,a.name])])}${select('channel','渠道',['评论','私信'])}${field('recipient','接收对象或原评论链接','',true)}${area('text','回复正文','',true)}${submit('保存人工草稿')}`,op.id))}
${rows('outreachRuns').filter(r=>r.opportunityId===op.id).slice(-4).reverse().map(r=>`<p class="cm-run">智能体 v${r.version} · ${esc({running:'正在起草',completed:'已生成草稿',limited:'模型未配置，已提供澄清模板',failed:'失败',interrupted:'已中断'}[r.status]||r.status)} · ${esc(r.error||r.basis||'')} </p>`).join('')}
${panel(`block-${l.id}`,l.doNotContact?'恢复联系':'禁止联系',form(l.doNotContact?'unblock':'block',`${area('note','对方意愿或操作依据','',true)}${submit(l.doNotContact?'记录恢复依据':'停止联系')}`,l.id))}
${panel(`events-${op.id}`,'跟进历史',op.events.map(e=>`<p>${stamp(e.at)} · ${esc(e.stage||e.type)} · ${esc(e.note)}</p>`).join(''))}`:empty('为这位联系人建立一次购买需求','可以比较多个产品，也可先保留未知；复购时另建需求。')}`:empty('还没有联系人','去目标账号的视频评论中核实需求，或通过历史会话入口登记咨询。')}</section></div>`;
}
function contentScope(){
  const c=ctx.getContentCustomer?.()||customer();if(!c)return '';
  const saved=businessId;businessId=c.id;
  const html=`<div class="cm-panel cm-content-scope"><h2>这次写什么</h2><p>${esc(c.name)} · 选择产品后仍可比较多个款式，不限定规格也能创作。</p>${form('generate',`${scopeFields()}${submit('帮我挑选并写好')}`,c.id)}${[...(c.drops||[]),...(c.packs||[])].filter(p=>p.productReview?.required).map(p=>`<div class="cm-notice"><strong>${esc(p.title||'历史内容')}：资料已更新</strong><p>先在下方核对并修改文案中的价格、参数和承诺，再确认。</p>${p.productReview.currentHash?form('content-review',`${area('note','已核对的修改与依据','',true)}<label class="cm-check"><input type="checkbox" name="confirmed" required>已核对当前文案与最新产品资料</label>${submit('保存核对记录')}`,p.id,`data-business="${c.id}"`):'<p>原产品已停止推广，请使用有效产品重新创作。</p>'}</div>`).join('')}</div>`;businessId=saved;return html;
}
export function renderCommerceUI(){
  if(!ctx||busy)return;
  const focused=document.activeElement,ff=focused?.closest('[data-cm-form]'),focus=ff&&focused.name?{key:ff.dataset.key,name:focused.name,start:focused.selectionStart,end:focused.selectionEnd}:null;
  stash();if(!ws().customers.some(c=>c.id===businessId))businessId=ws().customers.find(c=>c.id===ws().usingId)?.id||ws().customers[0]?.id||'';
  const no=empty('先建立你的业务','填写名称和一句介绍，即可继续整理产品、创作和找客。')+businessForm();
  for(const [view,render]of Object.entries({workbench:today,products,prospecting,conversations})){const host=document.getElementById(`cm-${view}`);if(host)host.innerHTML=businessId?render():no;}
  const scope=document.getElementById('cm-content-scope');if(scope)scope.innerHTML=contentScope();restore();
  if(focus){const f=[...document.querySelectorAll('[data-cm-form]')].find(f=>f.dataset.key===focus.key),el=f?.elements.namedItem(focus.name);if(el?.focus){el.focus({preventScroll:true});try{el.setSelectionRange(focus.start,focus.end);}catch{}}}
}
async function api(action,payload){const r=await fetch(`/api/acquisition/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await r.json();if(!r.ok)throw new Error(result.error||'操作失败');if(result.workspace)ctx.setWorkspace(result.workspace);return result;}
async function refresh(){try{const r=await fetch('/api/acquisition'),result=await r.json();if(!r.ok)throw new Error(result.error||'读取失败');ctx.setWorkspace(result.workspace);renderCommerceUI();}catch(e){ctx.toast(e.message);}clearTimeout(poll);if((data().outreachRuns||[]).some(r=>r.status==='running'))poll=setTimeout(refresh,2000);}
export function installCommerceUI(context){
  ctx=context;
  document.body.addEventListener('change',e=>{const field=e.target,form=field.closest('[data-cm-form]');if(form?.dataset.cmForm==='sales-document'&&field.name==='productId'){form.querySelector('[name=skuId]').innerHTML=opts([['','产品所有规格通用'],...rows('skus').filter(s=>s.productId===field.value&&s.status==='active').map(s=>[s.id,s.name])],'');}if(form&&field.name==='skuIds'&&field.checked){const sku=rows('skus').find(s=>s.id===field.value);const parent=[...form.querySelectorAll('[name=productIds]')].find(p=>p.value===sku?.productId);if(parent)parent.checked=true;}if(form&&field.name==='productIds'&&!field.checked)for(const el of form.querySelectorAll('[name=skuIds]'))if(rows('skus').some(s=>s.id===el.value&&s.productId===field.value))el.checked=false;if(e.target.matches('[data-cm-business]')){stash();businessId=e.target.value;targetId=workId=contactId=opId=editProduct=editSku='';renderCommerceUI();}});
  document.body.addEventListener('submit',async e=>{
    const f=e.target.closest('[data-cm-form]');if(!f)return;e.preventDefault();if(f.dataset.busy)return;
    const fd=new FormData(f),value=Object.fromEntries(fd);for(const name of ['productIds','skuIds','signalIds'])value[name]=fd.getAll(name);
    if(value.baseRevision)value.baseRevision=Number(value.baseRevision);value.confirmed=fd.has('confirmed');
    const action=f.dataset.cmForm, cId=f.dataset.business||f.dataset.key.split(':')[0],payload={...value,customerId:cId,id:f.dataset.id||undefined};
    const l=rows('leads').find(l=>l.id===contactId),op=rows('opportunities').find(o=>o.id===opId);
    const btn=e.submitter,label=btn?.textContent;f.dataset.busy='true';busy++;if(btn){btn.disabled=true;btn.textContent='处理中…';}f.querySelector('.cm-error').textContent='';
    try{
      if(['product','sku','business','target','work','opportunity','handoff','resume','sales-document'].includes(action)){
        if(['opportunity'].includes(action)&&!rows('opportunities').some(o=>o.id===payload.id))delete payload.id;
        if(['handoff','resume'].includes(action))payload.opportunityId=f.dataset.id;
        await api('commerce',{...payload,action});
        if(action==='opportunity')opId=payload.id||rows('opportunities').filter(o=>o.leadId===payload.leadId).at(-1)?.id||'';
        if(action==='business')businessId=ws().usingId;
      }else if(action==='comments'){
        const work=rows('works').find(w=>w.id===value.workId),items=JSON.parse(value.json);
        if(!Array.isArray(items))throw new Error('请提供 JSON 数组');
        await api('import',{customerId:cId,workId:work.id,source:value.source,rows:items.map(r=>({...r,platform:work.platform}))});
      }else if(action==='review')await api('review',{signalId:f.dataset.id,action:value.action,note:value.note});
      else if(action==='generate'){
        const r=await fetch('/api/today',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,customerId:f.dataset.id})}),s=await r.json();if(!r.ok)throw new Error(s.error||'生成失败');ctx.setWorkspace(s);ctx.watchJob(f.dataset.id);
      }else if(action==='content-review'){
        const c=ws().customers.find(c=>c.id===cId),pack=[...(c.drops||[]),...(c.packs||[])].find(p=>p.id===f.dataset.id);
        await api('commerce',{...payload,action,packId:pack.id,scopeHash:pack.productReview.currentHash,contentHash:pack.productReview.contentHash});
      }else if(action==='outreach')await api('outreach',{...payload,opportunityId:f.dataset.id});
      else if(action==='inquiry')await api('inquiry',{...payload,opportunityId:f.dataset.id,leadId:l.id,platform:l.platform,authorId:l.authorId,authorName:l.authorName});
      else if(action==='manual-draft')await api('lead',{...payload,action:'draft',opportunityId:f.dataset.id,leadId:l.id});
      else if(action==='resume-contact')await api('lead',{...payload,action:'resume-agent',leadId:f.dataset.id});
      else if(['sent','block','unblock'].includes(action))await api('lead',{...payload,action,leadId:l.id,messageId:action==='sent'?f.dataset.id:undefined});
      drafts.delete(f.dataset.key);const detail=f.closest('[data-cm-detail]');if(detail){detail.open=false;openDetails.delete(detail.dataset.cmDetail);}f.remove();ctx.toast(action==='outreach'?'已开始起草，尚未发送':action==='generate'?'正在生成内容':'已保存');
    }catch(error){f.querySelector('.cm-error').textContent=error instanceof SyntaxError?'JSON 格式不正确，请核对后重试':error.message;}
    finally{busy--;delete f.dataset.busy;if(btn){btn.disabled=false;btn.textContent=label;}}
    if(!f.isConnected){renderCommerceUI();ctx.render();if(action==='outreach')refresh();}
  });
  document.body.addEventListener('click',async e=>{
    const b=e.target.closest('[data-cm]');if(!b||b.disabled)return;stash();const act=b.dataset.cm,id=b.dataset.id;
    if(act.startsWith('go-'))ctx.nav(act.slice(3));
    else if(act==='select-target'){targetId=id;workId='';}
    else if(act==='open-video')workId=id;
    else if(act==='open-source'){const w=rows('works').find(w=>w.id===id);if(w){workId=id;targetId=w.targetId;ctx.nav('prospecting');}}
    else if(act==='back-videos')workId='';
    else if(act==='select-product'){editProduct=id;editSku='';}
    else if(act==='select-sku'){const s=rows('skus').find(s=>s.id===id);editProduct=s.productId;editSku=id;}
    else if(act==='add-sku'){editProduct=id;editSku='new';}
    else if(act==='new-product')editProduct=editSku='';
    else if(act==='open-contact'){contactId=id;opId='';ctx.nav('conversations');}
    else if(act==='select-op')opId=id;
    else if(act==='open-need'){const o=rows('opportunities').find(o=>o.id===id);if(o){opId=o.id;contactId=o.leadId;ctx.nav('conversations');}}
    else if(['content','write-product','open-pack'].includes(act)){
      await ctx.openContent(businessId,act==='open-pack'?id:'');
      if(act==='write-product'){const key=`${businessId}:generate:${businessId}`;drafts.set(key,{values:{},checks:[...document.querySelectorAll('#cm-content-scope input[type=checkbox]')].map(el=>[el.name,el.value,el.name==='productIds'&&el.value===id])});restore();}
    }else if(act==='knowledge'){await ctx.openContent(businessId);document.querySelector('[data-workspace-view=materials]')?.click();}
    else if(act==='reports')ctx.nav('pack');
    else if(act==='new-inquiry')ctx.openLegacy(businessId,'inquiry');
    else if(act==='old-leads')ctx.openLegacyLead(businessId,contactId);
    else if(['legacy','search','accounts'].includes(act))ctx.openLegacy(businessId,act);
    else if(act==='copy-message'){
      const lead=rows('leads').find(l=>l.id===contactId),m=lead.messages.find(m=>m.id===id);b.disabled=true;
      try{await api('lead',{leadId:lead.id,messageId:id,action:'check-copy'});await navigator.clipboard.writeText(m.text);await api('lead',{leadId:lead.id,messageId:id,action:'copy'});ctx.toast('已复制，请在平台核对后发送');}catch(error){ctx.toast(error.message);}finally{b.disabled=false;}
    }
    renderCommerceUI();
  });
  renderCommerceUI();if((data().outreachRuns||[]).some(r=>r.status==='running'))refresh();
}
