const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={available:false,connections:[]},flow=null,frame=null,timer,busy=false,ctx,pointer;
const labels={starting:'正在打开平台登录页',login_required:'请用平台 App 扫码登录',challenge:'请在平台页面完成验证',connected:'账号已连接',network_error:'暂时无法连接平台',expired:'连接已过期',identity_mismatch:'登录账号不一致',disconnected:'已断开'};
const button=(action,label,id)=>`<button type="button" class="btn ghost" data-hosted="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
async function api(action,payload){const r=await fetch('/api/hosted-browser'+(action?'/'+action:''),action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{});const v=await r.json();if(!r.ok)throw new Error(v.error||'浏览器连接失败');return v;}
export async function refreshHostedState(){state=await api();}
async function poll(){clearTimeout(timer);const old=flow;if(!old||busy)return;busy=true;try{
 const r=await api('status',{id:old.id});if(flow?.id!==old.id)return;flow=r;state.connections=state.connections.map(c=>c.id===r.id?r:c);
 frame=['login_required','challenge','identity_mismatch'].includes(r.status)?await api('frame',{id:r.id}):null;
 if(r.status==='connected'){flow=null;ctx.toast('平台账号已连接，无需安装插件');await ctx.refresh();}
 else if(['starting','login_required','challenge'].includes(r.status))timer=setTimeout(poll,2500);
 }catch(e){if(flow?.id===old.id){flow={...old,error:e.message};timer=setTimeout(poll,5000);}}
 finally{busy=false;ctx.render();}}
export function hostedConnectionsView(businessId){const current=flow?.customerId===businessId?flow:null;
 return `<section class="cm-panel"><h2>扫码连接你的平台账号</h2><p>选择平台，在下方真实登录页面扫码。无需安装插件，也无需复制配对码。</p><p class="meta">Harta 后台浏览器保存登录状态，用于你确认的任务。验证码由你完成；当前先验收抖音，小红书尚未实测。</p><div class="cm-platform-grid">${['抖音','小红书'].map(p=>`<article class="cm-platform-card"><h3>${p}</h3><p>用${p} App 扫码登录</p><button type="button" class="btn" data-hosted="start" data-id="${p}" ${state.available?'':'disabled'}>扫码连接${p}</button></article>`).join('')}</div>${!state.available?'<p class="cm-notice">后台浏览器尚未就绪，请联系管理员配置。</p>':''}</section>
 ${current?`<section class="cm-panel cm-hosted-login" aria-live="polite"><h2>${esc(labels[current.status]||current.status)}</h2><p>${esc(current.error||'正在加载，请稍候…')}</p>${frame?`<p class="meta">平台地址：${esc(frame.url)}。下方是实时平台画面，可点击页面中的登录入口或刷新二维码。</p><div class="cm-remote-scroll"><img src="data:image/jpeg;base64,${frame.image}" class="cm-remote-login" width="1280" height="900" data-hosted-screen="${current.id}" alt="${esc(current.platform)}真实登录页面，请用平台 App 扫描其中的二维码"></div>`:''}<div class="acts">${['network_error','expired','identity_mismatch'].includes(current.status)?button('retry','重新打开登录页',current.id):''}${button('disconnect','取消连接',current.id)}</div></section>`:''}
 <section class="cm-panel"><h2>账号与连接记录</h2>${state.connections.filter(c=>c.customerId===businessId&&c.status!=='disconnected').map(c=>`<article class="cm-message"><strong>${esc(c.name||c.platform)} · ${esc(labels[c.status]||c.status)}</strong><p>${esc(c.error)}</p><p class="meta">${[['publish','发布'],['comments','评论采集'],['reply','回复评论'],['dm','私信']].map(([k,v])=>v+'：'+(c.capabilities?.[k]==='verified'?'已取得成功回执':'待真实验证')).join(' · ')}</p>${c.status==='connected'?`<div class="acts">${button(c.executionEnabled?'pause':'enable',c.executionEnabled?'暂停实际执行':'开启已确认任务的实际执行',c.id)}<button type="button" class="btn ghost" data-cm="go-delivery">发布与消息任务</button></div><p class="meta">${c.executionEnabled?'仅执行已确认任务和已启用的回复规则。':'采集任务可运行；发布、回复、私信需开启实际执行。'}</p>`:button('open','打开连接画面',c.id)}${button('disconnect','断开并清除登录状态',c.id)}</article>`).join('')||'<p>扫码成功后自动显示账号。发布、采集、回复和私信分别验证。</p>'}</section>`;
}
export function initHostedUI(options){if(ctx)return;ctx=options;
 document.body.addEventListener('pointerdown',event=>{const el=event.target.closest('[data-hosted-screen]');if(!el||busy)return;event.preventDefault();clearTimeout(timer);busy=true;const rect=el.getBoundingClientRect();pointer={id:el.dataset.hostedScreen,rect,x:(event.clientX-rect.left)/rect.width*1280,y:(event.clientY-rect.top)/rect.height*900};el.setPointerCapture(event.pointerId);});
 document.body.addEventListener('pointerup',async event=>{if(!pointer)return;const p=pointer;pointer=null;const toX=Math.max(0,Math.min(1279,(event.clientX-p.rect.left)/p.rect.width*1280)),toY=Math.max(0,Math.min(899,(event.clientY-p.rect.top)/p.rect.height*900));try{flow=await api('click',{id:p.id,x:p.x,y:p.y,...(Math.hypot(toX-p.x,toY-p.y)>5?{toX,toY}:{})});}catch(e){ctx.toast(e.message);}finally{busy=false;void poll();}});
 document.body.addEventListener('pointercancel',()=>{if(pointer){pointer=null;busy=false;void poll();}});
 document.body.addEventListener('click',async event=>{
  const b=event.target.closest('[data-hosted]');if(!b||b.disabled)return;const action=b.dataset.hosted,id=b.dataset.id;b.disabled=true;clearTimeout(timer);
  try{
   if(action==='start'){frame=null;flow=await api('start',{platform:id,customerId:ctx.businessId()});timer=setTimeout(poll,1000);}
   else if(action==='open'){frame=null;flow=state.connections.find(c=>c.id===id);timer=setTimeout(poll,1000);}
   else if(action==='retry'){frame=null;flow=await api('retry',{id});timer=setTimeout(poll,1000);}
   else if(action==='disconnect'){await api('disconnect',{id});if(flow?.id===id){flow=null;frame=null;}}
   else if(['enable','pause'].includes(action))await api('enable',{id,enabled:action==='enable'});
   await ctx.refresh();
  }catch(e){ctx.toast(e.message);}finally{b.disabled=false;ctx.render();}
 });
}
