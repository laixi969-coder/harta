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
export function hostedConnectionsView(businessId){
 return `<section class="cm-panel"><h2>平台连接</h2><p>平台托管与自动发送已关闭。采集请在主动获客的连接设置中配置 TikHub / RedFox；文案和素材生成后由你自行发送。</p><button type="button" class="btn" data-acq-page="settings">配置采集数据源</button>${state.connections.filter(c=>c.customerId===businessId&&c.status!=='disconnected').map(c=>`<article><strong>${esc(c.name||c.platform)}</strong><p>历史连接，不再自动运行</p>${button('disconnect','清除历史登录状态',c.id)}</article>`).join('')}</section>`;
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
