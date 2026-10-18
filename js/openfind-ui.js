const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {douyin:'抖音',xiaohongshu:'小红书'};
const statuses = {disconnected:'未连接',opening:'正在打开',awaiting_login:'等待扫码',ready:'已验证登录',challenge:'需要本人验证',error:'连接失败',running:'进行中',paused:'已暂停',completed:'已完成',stopped:'已停止',failed:'失败'};
const states = new Map(), drafts = new Map(), frames = new Map(), loading = new Set();
let ctx, timer, pointerStart;
const button=(action,label,id='',extra='')=>`<button type="button" class="btn ghost" data-of="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
const options=(values,value)=>values.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${label}</option>`).join('');
function inputs(businessId,kind){
  const d=drafts.get(`${businessId}:${kind}`)||{};
  return `<label>搜索关键词<input name="keyword" maxlength="100" required value="${esc(d.keyword||'')}" placeholder="例如：杭州厨房翻新"></label><label>平台<select name="platform">${options(Object.entries(names),d.platform||'xiaohongshu')}</select></label>`;
}
async function request(customerId,action,input={}){
  const response=await fetch(action?'/api/openfind':`/api/openfind?customerId=${encodeURIComponent(customerId)}`,action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,customerId,action})}:{});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'平台操作失败');
  if(!['frame','pointer'].includes(action))states.set(customerId,result.state);
  if(result.workspace)ctx.setWorkspace(result.workspace);
  return result.state;
}
async function refresh(customerId){
  if(!customerId||loading.has(customerId))return;loading.add(customerId);
  try{await request(customerId);if(!document.activeElement?.closest('[data-of-form]'))ctx.render();}
  catch(error){states.set(customerId,{...(states.get(customerId)||{}),error:error.message});}
  finally{loading.delete(customerId);}
}
export function openFindPanel(customerId){
  if(!states.has(customerId)&&!loading.has(customerId))queueMicrotask(()=>refresh(customerId));
  const s=states.get(customerId)||{}, running=s.jobs?.some(j=>j.status==='running')||s.workflows?.some(w=>w.status==='running'),frame=frames.get(customerId);
  return `<section class="cm-panel of-panel" aria-label="实时获客"><h2>实时搜索与自动获客</h2><p>登录平台后，在这里搜索作品或自动采集评论；结果持续同步到下方作品和客户核实流程。</p>
    ${s.error?`<p class="cm-error" role="alert">${esc(s.error)}</p>`:''}
    <div class="of-connections">${Object.entries(names).map(([platform,name])=>{const c=s.connections?.find(c=>c.platform===platform);return `<article><strong>${name} · ${esc(statuses[c?.status]||'未连接')}</strong><p class="meta">${esc(c?.accountName||c?.message||'首次使用需扫码登录')}</p><div class="acts">${button('login','连接 / 打开登录',platform)}${button('status','检查登录',platform)}${button(c?.network==='direct'?'system-network':'repair-network',c?.network==='direct'?'恢复系统网络':'修复页面加载',platform)}${s.enabled?button('frame','查看平台画面',platform):''}${s.protection?.[platform]?.paused?button('resume-platform','验证后恢复采集',platform):''}</div></article>`;}).join('')}</div>
    ${frame?`<div class="of-frame"><p>${names[frame.platform]}官方页面：扫码登录，可点击画面或拖动完成平台验证。</p><div class="acts">${button('frame','刷新画面',frame.platform)}${button('hide-frame','收起画面')}</div><img src="data:image/png;base64,${frame.image}" alt="${names[frame.platform]}登录与验证画面" data-of-frame="${frame.platform}" draggable="false" tabindex="0"><p class="meta">画面点击只作用于当前业务的平台窗口；账号验证由本人完成。</p></div>`:''}
    <form class="cm-form of-search" data-of-form="search">${inputs(customerId,'search')}<label>每次作品数<input type="number" name="limit" min="1" max="100" value="${esc(drafts.get(`${customerId}:search`)?.limit||20)}" required></label><label>排序<select name="sort">${options([['latest','最新发布'],['popular','高互动'],['general','相关作品']],drafts.get(`${customerId}:search`)?.sort||'latest')}</select></label><label>形式<select name="noteType">${options([['all','不限'],['image','图文'],['video','视频']],drafts.get(`${customerId}:search`)?.noteType||'all')}</select></label><div class="acts"><button class="btn" type="submit" name="operation" value="search" ${running?'disabled':''}>实时搜索</button><button class="btn" type="submit" name="operation" value="workflow" ${running?'disabled':''}>一键搜索并采集评论</button></div><p class="meta">一键流程最多搜索 40 条作品、选取 3 条采集各 20 条评论；遇到验证会暂停并保留进度。</p><p class="cm-error" role="alert"></p></form>
    <details class="of-schedule" data-cm-detail="${customerId}:of-schedule"><summary>定时采集${s.schedule?.enabled?' · 已启用':''}</summary><form class="cm-form" data-of-form="schedule">${inputs(customerId,'schedule')}<label>间隔（分钟）<input name="minutes" type="number" min="15" max="1440" value="${esc(drafts.get(`${customerId}:schedule`)?.minutes||s.schedule?.minutes||60)}" required></label><button class="btn" type="submit">开启定时采集</button><p class="cm-error" role="alert"></p></form>${s.schedule?.enabled?`<p>当前：${esc(s.schedule.keyword)} · 每 ${s.schedule.minutes} 分钟；下次 ${esc(new Date(s.schedule.nextAt).toLocaleString('zh-CN'))}</p>${button('disable-schedule','停止定时采集')}`:''}<p class="meta">Harta 服务运行时执行；暂停流程或平台验证期间不会自动另开任务。</p></details>
    <div class="acts">${button('sync','立即同步结果')}${s.enabled?button('disconnect','关闭当前业务引擎'):''}</div>
    ${s.syncedAt?`<p class="meta">最近同步 ${esc(new Date(s.syncedAt).toLocaleString('zh-CN'))} · 累计新增 ${s.sync?.addedWorks||0} 条作品、${s.sync?.addedComments||0} 条评论${s.sync?.skippedComments?` · ${s.sync.skippedComments} 条无文字评论未作为需求证据`:''}</p>`:''}
    ${(s.workflows||[]).slice(0,4).map(w=>`<article class="cm-row"><div><strong>${esc(names[w.platform]||w.platform||'')} · ${esc(w.keyword)} · ${esc(statuses[w.status]||w.status)}</strong><p>${esc(w.message)} · 评论进度 ${w.completed}/${w.selected}</p><details><summary>流程日志</summary>${w.logs.map(l=>`<p class="meta">${esc(l.at)} · ${esc(l.message)}</p>`).join('')}</details></div>${w.status==='running'?button('pause','暂停流程与定时采集',w.id):w.status==='paused'?button('resume','继续流程',w.id):''}</article>`).join('')}
    ${(s.jobs||[]).slice(0,5).map(j=>`<article class="cm-row"><div><strong>${esc(names[j.platform]||j.platform||'')} · ${j.type==='search'?'搜索':'采集评论'} · ${esc(j.keyword)} · ${esc(statuses[j.status]||j.status)}</strong><p>已取得 ${j.count||0} 条${j.error?' · '+esc(j.error):''}</p><details><summary>任务日志</summary>${j.logs.map(l=>`<p class="meta">${esc(l.message)}</p>`).join('')}</details></div>${j.status==='running'?button('stop-job','停止采集',j.id):''}</article>`).join('')}
  </section>`;
}
export function openFindWorkActions(work){return work&&['抖音','小红书'].includes(work.platform)?`${button('comments','自动采集评论',work.id)}${button('detail','读取完整作品',work.id)}`:'';}
export function initOpenFindUI(context){
  ctx=context;
  for(const name of ['input','change'])document.body.addEventListener(name,event=>{const f=event.target.closest('[data-of-form]');if(f)drafts.set(`${ctx.getBusiness()}:${f.dataset.ofForm}`,Object.fromEntries(new FormData(f)));});
  document.body.addEventListener('submit',async event=>{
    const f=event.target.closest('[data-of-form]');if(!f)return;event.preventDefault();
    const customerId=ctx.getBusiness(),value=Object.fromEntries(new FormData(f)),action=f.dataset.ofForm==='schedule'?'schedule':event.submitter?.value||'search';
    if(loading.has(customerId))return;loading.add(customerId);const buttons=[...f.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try{await request(customerId,action,{...value,limit:Number(value.limit),searchLimit:Math.min(40,Number(value.limit)),minutes:Number(value.minutes),enabled:true});ctx.render();}
    catch(error){f.querySelector('.cm-error').textContent=error.message;}
    finally{loading.delete(customerId);buttons.forEach(b=>b.disabled=false);}
  });
  document.body.addEventListener('click',async event=>{
    const b=event.target.closest('[data-of]');if(!b)return;const customerId=ctx.getBusiness(),action=b.dataset.of,id=b.dataset.id;
    if(action==='hide-frame'){frames.delete(customerId);ctx.render();return;}
    if(loading.has(customerId))return;loading.add(customerId);b.disabled=true;
    try{
      if(action==='frame'){frames.set(customerId,{...await request(customerId,'frame',{platform:id}),platform:id});}
      else if(['repair-network','system-network'].includes(action)){await request(customerId,'network',{platform:id,mode:action==='repair-network'?'direct':'system'});await request(customerId,'login',{platform:id});frames.set(customerId,{...await request(customerId,'frame',{platform:id}),platform:id});}
      else if(action==='disable-schedule')await request(customerId,'schedule',{enabled:false});
      else{await request(customerId,action,{id,platform:id,workId:id});if(action==='login'){try{frames.set(customerId,{...await request(customerId,'frame',{platform:id}),platform:id});}catch{}}if(action==='disconnect')frames.delete(customerId);if(['comments','detail','resume'].includes(action))ctx.toast(action==='comments'?'已开始采集评论，结果会自动同步':'操作已完成，结果会自动同步');}
      ctx.render();
    }catch(error){ctx.toast(error.message);}finally{loading.delete(customerId);b.disabled=false;}
  });
  document.body.addEventListener('pointerdown',event=>{const image=event.target.closest('[data-of-frame]');if(!image)return;const box=image.getBoundingClientRect();loading.add(ctx.getBusiness());pointerStart={customerId:ctx.getBusiness(),platform:image.dataset.ofFrame,x:(event.clientX-box.left)*1280/box.width,y:(event.clientY-box.top)*860/box.height};image.setPointerCapture(event.pointerId);event.preventDefault();});
  document.body.addEventListener('pointerup',async event=>{const image=event.target.closest('[data-of-frame]'),start=pointerStart;pointerStart=null;if(!image||!start||start.customerId!==ctx.getBusiness()){if(start)loading.delete(start.customerId);return;}const box=image.getBoundingClientRect(),toX=(event.clientX-box.left)*1280/box.width,toY=(event.clientY-box.top)*860/box.height;
    try{await request(start.customerId,'pointer',{...start,...(Math.abs(toX-start.x)+Math.abs(toY-start.y)>10?{toX,toY}:{})});frames.set(start.customerId,{...await request(start.customerId,'frame',{platform:start.platform}),platform:start.platform});ctx.render();}catch(error){ctx.toast(error.message);}finally{loading.delete(start.customerId);}
  });
  clearInterval(timer);timer=setInterval(()=>{if(document.querySelector('[data-view=prospecting]')?.getClientRects().length)void refresh(ctx.getBusiness());},5000);
}
