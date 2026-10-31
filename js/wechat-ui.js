const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>v?new Date(v).toLocaleString('zh-CN'):'尚未同步';
let connections=[],context;const pending=new Map(),notices=new Map(),pages=new Map();
async function api(input){const r=await fetch('/api/wechat',input?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}:{});const body=await r.json();if(!r.ok)throw new Error(body.error||'公众号操作未完成');return body;}
export async function refreshWechatState(){connections=(await api()).connections;}
export function wechatConnectionsView(customerId){
 const row=connections.find(c=>c.customerId===customerId)||{},busy=pending.has(customerId)||row.busy,last=row.lastSync;
 return `<section class="cm-panel wx-connection" data-wx-customer="${esc(customerId)}"><div class="wx-heading"><div><h2>微信公众号</h2><p class="meta">连接你管理的账号，将文章带入内容库，作为图文与视频的创作参考。</p></div><span>${row.bound?'已连接':'未连接'}</span></div>
 ${row.bound?`<p><strong>${esc(row.name)}</strong> · ${esc(row.appIdMasked)}</p><div class="acts"><button type="button" class="btn" data-wx-action="sync" data-mode="auto" ${busy?'disabled':''}>${busy?'正在处理…':'同步文章'}</button><button type="button" class="btn ghost" data-wx-action="sync" data-mode="material" ${busy?'disabled':''}>同步素材库</button>${row.continuation?`<button type="button" class="btn ghost" data-wx-action="sync" data-resume="true" ${busy?'disabled':''}>继续同步剩余文章</button>`:''}<button type="button" class="btn ghost" data-wx-action="unbind">断开连接</button></div><p class="meta">断开会清除本地凭证并取消进行中的同步，已同步文章保留。</p>`:`<form data-wx-bind><label>账号名称<input name="name" required maxlength="100" autocomplete="off" ${busy?'disabled':''}></label><label>AppID<input name="appId" required maxlength="34" autocomplete="off" ${busy?'disabled':''}></label><label>AppSecret<input name="appSecret" type="password" required minlength="16" maxlength="200" autocomplete="new-password" ${busy?'disabled':''}></label><button class="btn" ${busy?'disabled':''}>${busy?'正在连接…':'连接公众号'}</button></form><p class="meta">在公众平台「设置与开发 → 基本配置」获取凭证，并配置服务器 IP 白名单。凭证加密保存在本机。</p>`}
 ${last?`<p class="meta">${esc(time(last.at))} · ${last.source==='published'?'已发表文章':'素材库'} · 新增 ${last.added} 篇，更新 ${last.updated} 篇${last.skipped?`，跳过 ${last.skipped} 条不完整记录`:''}${last.nextOffset!==null?' · 尚有文章待同步':''}</p>${last.fallback?`<p class="meta">${esc(last.fallback)}</p>`:''}`:''}<p role="status" class="wx-status">${esc(notices.get(customerId)||'')}</p><div class="acts"><button type="button" class="btn ghost" data-cm="go-content-home">查看内容库</button><button type="button" class="btn ghost" data-wx-action="refresh">刷新连接状态</button></div></section>`;
}
export function wechatArticlesView(customerId,works){
 const all=works.filter(w=>w.source==='wechat_api'&&w.customerId===customerId).sort((a,b)=>String(b.syncedAt).localeCompare(String(a.syncedAt))),total=Math.max(1,Math.ceil(all.length/12)),page=Math.min(pages.get(customerId)||0,total-1);
 return `<section class="cm-panel wx-library" data-wx-customer="${esc(customerId)}"><div class="wx-heading"><div><h2>公众号文章</h2><p class="meta">${all.length} 篇参考文章 · 同步不代表新增发布，阅读、互动和获客效果需另行核实。</p></div><button type="button" class="btn ghost" data-cm="go-connections">管理公众号连接</button></div>${all.slice(page*12,page*12+12).map(w=>`<article class="wx-article"><div><span class="meta">${esc(w.accountName)} · ${w.wechat?.source==='published'?'已发表文章':'素材库 · 未核实发表'}</span><h3>${esc(w.title)}</h3><p class="meta">${w.publishedAt?'发表于 '+esc(time(w.publishedAt)):'发表时间未记录'} · 互动数据未记录</p></div><details><summary>阅读正文</summary><div class="wx-body">${esc(w.description)}</div>${w.contentTruncated?'<p class="meta">正文过长，仅保存前 30000 字。</p>':''}</details><div class="acts"><button type="button" class="btn ghost" data-cm="reference-work" data-id="${esc(w.id)}">参考此文创作</button>${w.url?`<a class="btn ghost" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">查看原文 ↗</a>`:''}</div></article>`).join('')||'<p>连接公众号后，可同步已发表文章或素材库。也可以直接从业务资料开始创作。</p>'}${total>1?`<div class="acts"><button type="button" class="btn ghost" data-wx-page="${page-1}" ${page===0?'disabled':''}>上一页文章</button><span>第 ${page+1} / ${total} 页</span><button type="button" class="btn ghost" data-wx-page="${page+1}" ${page+1===total?'disabled':''}>下一页文章</button></div>`:''}</section>`;
}
export function initWechatUI(ctx){
 context=ctx;
 async function run(customerId,input){
  if(pending.has(customerId)&&input.action!=='unbind')return;
  const ticket={};pending.set(customerId,ticket);notices.set(customerId,'');context.render();
  try{const result=await api({...input,customerId});if(pending.get(customerId)!==ticket)return;connections=result.connections;if(result.workspace)context.setWorkspace(result.workspace);notices.set(customerId,input.action==='bind'?'已连接，可开始同步文章':input.action==='unbind'?'已断开，已同步文章仍保留':'本批同步完成');}
  catch(error){if(pending.get(customerId)===ticket)notices.set(customerId,error.message);}
  finally{if(pending.get(customerId)===ticket){pending.delete(customerId);context.render();}}
 }
 document.body.addEventListener('submit',e=>{const form=e.target.closest('[data-wx-bind]');if(!form)return;e.preventDefault();const customerId=form.closest('[data-wx-customer]').dataset.wxCustomer,values=Object.fromEntries(new FormData(form));form.elements.appSecret.value='';run(customerId,{action:'bind',...values});});
 document.body.addEventListener('click',async e=>{const b=e.target.closest('[data-wx-action],[data-wx-page]');if(!b)return;const customerId=b.closest('[data-wx-customer]').dataset.wxCustomer;
  if(b.dataset.wxPage!==undefined){pages.set(customerId,Math.max(0,Number(b.dataset.wxPage)||0));context.render();return;}
  if(b.dataset.wxAction==='refresh'){try{await refreshWechatState();notices.delete(customerId);}catch(error){notices.set(customerId,error.message);}context.render();return;}
  run(customerId,{action:b.dataset.wxAction,mode:b.dataset.mode,resume:b.dataset.resume==='true'});
 });
}
