import {SHORT_TECHNIQUES,shortTechnique,shortShootSheet} from './practical-shorts.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const forms=new Map();
function draft(id){
  if(!forms.has(id))forms.set(id,{technique:'screens',rows:[],url:'',title:'',observedAction:'',shortSetup:'',watched:false,notice:'',busy:false});
  return forms.get(id);
}
function body(id){
  const d=draft(id),t=shortTechnique(d.technique),query=encodeURIComponent(t.query);
  const option=item=>`<option value="${item.id}" ${item.id===t.id?'selected':''}>${esc(item.name)}</option>`;
  const link=(url,label)=>`<a class="cm-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  const examples=t.example?link(t.example.url,t.example.title)+' <button type="button" class="btn ghost" data-short-act="example">核对这条原片</button>':'';
  return `<div class="short-controls"><label>想借鉴的拍法<select data-short-field="technique">${SHORT_TECHNIQUES.map(option).join('')}</select></label>
    <p><strong>第一镜</strong>　${esc(t.first)}</p><details><summary>现场准备与简拍方案</summary><pre class="asis">${esc(shortShootSheet(t.id))}</pre></details>
    <div class="acts"><button type="button" class="btn" data-short-act="search" ${d.busy?'disabled':''}>找同类原片</button>${link('https://www.youtube.com/results?search_query='+query+'%20shorts','到 YouTube 搜索')}${link('https://www.tiktok.com/search?q='+query,'到 TikTok 搜索')}</div>
    ${examples?`<p>${examples}</p>`:''}<p role="status">${esc(d.notice)}</p>
    ${d.rows.map((r,i)=>`<article class="cm-row"><div>${link(r.url,r.title)}<small>${esc(r.platform)} · 搜索摘要，待观看</small></div><button type="button" class="btn ghost" data-short-act="pick" data-index="${i}">核对这条</button></article>`).join('')}
    <details data-short-record ${d.url||d.record?'open':''}><summary>登记看过的原片</summary><form data-short-form>
      <label>原片链接<input type="url" data-short-field="url" value="${esc(d.url)}" required maxlength="1800"></label>
      <label>参考片名<input data-short-field="title" value="${esc(d.title)}" required maxlength="200"></label>
      <label>原片用什么动作揭晓了什么？<textarea data-short-field="observedAction" minlength="3" maxlength="600" required>${esc(d.observedAction)}</textarea></label>
      <label>用现有的人、场地和道具怎么拍？<textarea data-short-field="shortSetup" minlength="3" maxlength="400" required>${esc(d.shortSetup)}</textarea></label>
      <label><input type="checkbox" data-short-field="watched" ${d.watched?'checked':''} required>我已看过原片并核对上述动作</label>
      <button class="btn" type="submit" ${d.busy?'disabled':''}>保存到本业务参考作品</button></form></details></div>`;
}
export function shortFinder(id){
  return `<details class="cm-support" data-cm-detail="${esc(id)}:short-finder" data-short-finder="${esc(id)}"><summary>海外易拍短片</summary><div data-short-body>${body(id)}</div></details>`;
}
function paint(id){
  const host=[...document.querySelectorAll('[data-short-finder]')].find(el=>el.dataset.shortFinder===id);
  if(host)host.querySelector('[data-short-body]').innerHTML=body(id);
}
async function request(path,values){
  const response=await fetch('/api/short-references/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(values)}),result=await response.json();
  if(!response.ok)throw Error(result.error||'短片操作未完成');
  return result;
}
export function installShortFinder(ctx){
  document.addEventListener('input',event=>{
    const el=event.target,host=el.closest('[data-short-finder]'),field=el.dataset.shortField;
    if(!host||!field)return;
    const id=host.dataset.shortFinder,d=draft(id);d[field]=el.type==='checkbox'?el.checked:el.value;
    if(field==='technique'){d.rows=[];d.notice='';d.watched=false;paint(id);host.querySelector('[data-short-field=technique]').focus();}
  });
  document.addEventListener('toggle',event=>{
    if(event.target.matches?.('[data-short-record]')){const id=event.target.closest('[data-short-finder]')?.dataset.shortFinder;if(id)draft(id).record=event.target.open;}
  },true);
  document.addEventListener('click',async event=>{
    const el=event.target.closest('[data-short-act]');if(!el)return;
    const id=el.closest('[data-short-finder]').dataset.shortFinder,d=draft(id),technique=d.technique;
    if(['pick','example'].includes(el.dataset.shortAct)){
      const row=el.dataset.shortAct==='example'?shortTechnique(technique).example:d.rows[Number(el.dataset.index)];if(!row)return;
      Object.assign(d,{url:row.url,title:row.title,observedAction:'',shortSetup:'',watched:false,record:true});paint(id);
      document.querySelector('[data-short-field=observedAction]')?.focus();return;
    }
    if(d.busy)return;
    d.busy=true;d.notice='正在搜索原片…';paint(id);
    try{const r=await request('search',{customerId:id,technique});if(d.technique===technique){d.rows=r.rows;d.notice=r.notice||('找到 '+r.rows.length+' 个原片链接');}}
    catch(e){if(d.technique===technique)d.notice=e.message;}
    finally{d.busy=false;paint(id);}
  });
  document.addEventListener('submit',async event=>{
    const f=event.target;if(!f.matches('[data-short-form]'))return;event.preventDefault();
    const id=f.closest('[data-short-finder]').dataset.shortFinder,d=draft(id);if(d.busy)return;
    const input={customerId:id,technique:d.technique,url:d.url,title:d.title,observedAction:d.observedAction,shortSetup:d.shortSetup,watched:d.watched};
    d.busy=true;f.querySelector('button').disabled=true;
    try{
      const r=await request('save',input);
      if(['technique','url','title','observedAction','shortSetup','watched'].every(k=>d[k]===input[k]))Object.assign(d,{url:'',title:'',observedAction:'',shortSetup:'',watched:false,record:false});
      d.notice='已保存，可在内容雷达选择「参考此作品」创作。';ctx.setWorkspace(r.workspace);ctx.render();ctx.toast(d.notice);
    }catch(e){d.notice=e.message;}finally{d.busy=false;paint(id);}
  });
}
