import { comparisonOptions } from './comparison-copy.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sourceView(p,option) {
  let link;
  try { const url=new URL(p.source);if(['https:','http:'].includes(url.protocol))link=url.href; } catch {}
  const source=link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(p.source)}</a>`:esc(p.source);
  return `<blockquote class="asis">${esc(p.quote)}</blockquote><small>${esc(p.title)} · v${esc(p.revision)} · 第${esc(p.line)}行 · ${source}</small>${option?`<button type="button" class="btn ghost" data-cm="comparison-source" data-option="${esc(option.key)}" data-record="${esc(p.recordId)}" data-field="${esc(p.field)}" data-line="${esc(p.line)}">打开资料原文</button>`:''}`;
}
export function comparisonEvidenceView(c,stale) {
  if(!c)return '';
  return `<details class="cm-panel comparison-evidence" ${stale?'open':''}><summary>本篇选型依据 · ${c.rows.length} 项差异</summary>${stale?`<p role="status">${esc(stale)}</p>`:''}<p>需求词「${esc(c.keyword.keyword)}」</p>
    <p class="meta">${c.keyword.locations.map(e=>esc([e.file,e.sheet,'第'+e.row+'行'].filter(Boolean).join(' · '))).join('<br>')}</p>
    ${c.rows.map(r=>`<details><summary>${esc(r.dimension)}</summary><b>${esc(c.left.name)}</b>${sourceView(r.left,c.left)}<b>${esc(c.right.name)}</b>${sourceView(r.right,c.right)}</details>`).join('')}</details>`;
}
async function request(data) {
  const r=await fetch('/api/keywords/comparison',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const result=await r.json();if(!r.ok)throw new Error(result.error||'选型对照失败');return result;
}
export function installKeywordComparison({getWorkspace,currentCustomer,open,toast}) {
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-compare-keyword]');if(!trigger)return;
    const input={customerId:trigger.dataset.customer,batchId:trigger.dataset.batch,keywordId:trigger.dataset.compareKeyword};
    const space=getWorkspace(),customer=space.customers.find(c=>c.id===input.customerId);
    const item=customer?.keywordLibraries?.find(b=>b.id===input.batchId)?.items.find(r=>r.id===input.keywordId);
    if(!item||currentCustomer()!==customer.id){toast('业务或词库已变化，请重新选择');return;}
    const options=comparisonOptions(space,customer.id),dialog=document.createElement('dialog');
    dialog.className='keyword-comparison-dialog';dialog.setAttribute('aria-labelledby','comparison-heading');
    const optionsHtml=options.map(o=>`<option value="${esc(o.key)}">${esc(o.name)}</option>`).join('');
    dialog.innerHTML=`<h2 id="comparison-heading">${esc(item.keyword)} · 选型对照</h2>
      ${options.length<2?'<p>请先在「产品与服务」中录入两款产品或规格及资料来源。</p>':`<div class="comparison-select"><label>第一款<select name="left">${optionsHtml}</select></label><label>第二款<select name="right">${optionsHtml}</select></label><label>发布平台<select name="platform"><option>小红书</option><option>抖音</option><option>公众号</option></select></label></div>
      <div data-rows></div><p role="status" data-message></p><button type="button" data-create disabled class="btn">生成对照稿</button>`}
      <button type="button" data-close class="btn ghost">关闭</button>`;
    document.body.append(dialog);
    const find=s=>dialog.querySelector(s), message=s=>{find('[data-message]').textContent=s;};
    const side=k=>find(`[name="${k}"]`).value;
    let view,sequence=0;
    const selected=()=>[...dialog.querySelectorAll('[data-pair]:checked')].map(b=>({left:b.dataset.left,right:b.dataset.right}));
    const update=()=>{find('[data-create]').disabled=!view||selected().length<1||selected().length>6;};
    function addPair(a,b,checked) {
      if([...dialog.querySelectorAll('[data-pair]')].some(i=>i.dataset.left===a.id&&i.dataset.right===b.id))return;
      const el=document.createElement('div');
      el.innerHTML=`<label class="cm-check"><input type="checkbox" data-pair data-left="${esc(a.id)}" data-right="${esc(b.id)}" ${checked?'checked':''}>${esc(a.dimension||'资料原文')} · ${esc(a.value)} / ${esc(b.value)}</label><details><summary>查看双方依据</summary><b>${esc(view.left.option.name)}</b>${sourceView(a)}<b>${esc(view.right.option.name)}</b>${sourceView(b)}</details>`;
      find('[data-pairs]').append(el);
    }
    async function preview() {
      const seq=++sequence;view=null;find('[data-rows]').replaceChildren();update();
      if(side('left')===side('right')){message('请选择两个不同的产品或规格。');return;}
      message('正在核对产品资料…');
      try{
        const result=await request({...input,left:side('left'),right:side('right'),action:'preview'});
        if(seq!==sequence||!dialog.open)return;view=result;
        const choices=list=>list.map(p=>`<option value="${esc(p.id)}">${esc(p.quote)}（${esc(p.title)} · 第${esc(p.line)}行）</option>`).join('');
        find('[data-rows]').innerHTML=`<div data-pairs></div>${view.left.passages.length&&view.right.passages.length?`<details><summary>手选一组资料原文</summary><label>${esc(view.left.option.name)}<select name="passage-left">${choices(view.left.passages)}</select></label><label>${esc(view.right.option.name)}<select name="passage-right">${choices(view.right.passages)}</select></label><button type="button" class="btn ghost" data-add>加入这项对照</button></details>`:''}`;
        view.matches.forEach((r,i)=>addPair(view.left.passages.find(p=>p.id===r.left),view.right.passages.find(p=>p.id===r.right),i<6));
        message(view.matches.length?'':!view.left.passages.length||!view.right.passages.length?'请先为两款产品各补一条带来源的资料。':'没有可直接配对的差异，可手选同一项目的两条原文。');update();
      }catch(e){if(seq===sequence&&dialog.open)message(e.message);}
    }
    dialog.addEventListener('change',event=>{
      if(['left','right'].includes(event.target.name))preview();else if(event.target.matches('[data-pair]'))update();
    });
    dialog.addEventListener('click',async event=>{
      if(event.target.closest('[data-close]'))return dialog.close();
      if(event.target.closest('[data-add]') && view){
        const a=view.left.passages.find(p=>p.id===side('passage-left')),b=view.right.passages.find(p=>p.id===side('passage-right'));
        if(a.dimension.normalize('NFKC').trim().toLowerCase()!==b.dimension.normalize('NFKC').trim().toLowerCase()||a.value===b.value){message('请选择同一项目的不同原文。');return;}
        addPair(a,b,true);message('');update();return;
      }
      if(!event.target.closest('[data-create]')||!view)return;
      const button=find('[data-create]');button.disabled=true;
      try{
        const result=await request({...input,action:'create',basis:view.basis,rows:selected(),left:side('left'),right:side('right'),platform:side('platform')});
        if(dialog.open)dialog.close();
        if(currentCustomer()===customer.id)await open(customer.id,result);
      }catch(e){if(dialog.open){message(e.message);update();}}
    });
    dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});
    dialog.showModal();
    if(options.length>=2){find('[name="right"]').selectedIndex=1;preview();}
  });
}
