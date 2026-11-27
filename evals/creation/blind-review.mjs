import { createHash, randomInt, randomUUID } from 'node:crypto';

export function prepareBlindReview(pairs, {synthetic=false, flip=()=>randomInt(2)}={}) {
  if (!Array.isArray(pairs) || !pairs.length || pairs.length>100) throw Error('每批需要 1–100 组同题成稿');
  const session=randomUUID(), ids=new Set();
  const reviewer=[],key=[];
  for (const pair of pairs) {
    for (const field of ['id','topic','baseline','candidate']) {
      if (typeof pair?.[field]!=='string' || !pair[field].trim() || pair[field].length>40000) throw Error('每组需有唯一编号、题目及两份成稿');
    }
    if (ids.has(pair.id)) throw Error('稿件组编号重复');
    ids.add(pair.id);
    const id=randomUUID();
    const order=flip()?['candidate','baseline']:['baseline','candidate'];
    reviewer.push({id,topic:pair.topic,A:pair[order[0]],B:pair[order[1]]});
    const copies=Object.fromEntries(['baseline','candidate'].map(arm=>[arm,{
      text:pair[arm],sha256:createHash('sha256').update(pair[arm]).digest('hex'),
    }]));
    key.push({id,pairId:pair.id,topic:pair.topic,A:order[0],B:order[1],copies});
  }
  return {reviewer:{session,synthetic,cases:reviewer},key:{session,synthetic,cases:key}};
}

export function decodeBlindReview(key, report) {
  if (key.session!==report.session || !Array.isArray(report.rows)) throw Error('评审记录与本次分组不匹配');
  const entries=new Map(key.cases.map(c=>[c.id,c])),seen=new Set();
  function minutes(value) {
    if (value===null) return null;
    if (typeof value!=='number' || !Number.isFinite(value) || value<0 || value>10080) throw Error('分钟数无效');
    return value;
  }
  const results=report.rows.map(row=>{
    const entry=entries.get(row.id);
    if (!entry || seen.has(row.id) || ![null,'A','B','tie','neither'].includes(row.choice)) throw Error('盲评编号或选择无效');
    seen.add(row.id);
    const times={};
    for (const arm of ['A','B']) times[entry[arm]]={editMinutes:minutes(row[arm]?.editMinutes),shootMinutes:minutes(row[arm]?.shootMinutes)};
    return {pairId:entry.pairId,topic:entry.topic,choice:entry[row.choice]||row.choice,times,versions:{baseline:entry.copies.baseline.sha256,candidate:entry.copies.candidate.sha256}};
  });
  return {session:key.session,synthetic:key.synthetic,rows:results};
}

const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function blindReviewPage(review) {
  const cards=review.cases.map((row,i)=>`<article data-id="${escapeHtml(row.id)}"><h2>${escapeHtml(row.topic)}</h2><div class="pair">${['A','B'].map(arm=>`<section data-arm="${arm}"><h3>稿件 ${arm}</h3><pre>${escapeHtml(row[arm])}</pre><details><summary>记录用时</summary>${[['editMinutes','改稿'],['shootMinutes','实拍']].map(([key,label])=>`<div class="time"><label>${label}分钟<input type="number" data-time="${key}" min="0" max="10080" step="any" inputmode="decimal"></label><button type="button" data-clock aria-label="${arm} 稿${label}计时" aria-pressed="false">开始计时</button></div>`).join('')}</details></section>`).join('')}</div><fieldset><legend>你愿意采用哪一稿？</legend>${[['A','A 稿'],['B','B 稿'],['tie','两稿相当'],['neither','都不采用']].map(([value,label])=>`<label><input type="radio" name="choice-${i}" value="${value}"> ${label}</label>`).join('')} <button type="button" data-clear>清除选择</button></fieldset></article>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>创作盲评</title><style>
  :root{font:16px/1.55 system-ui,sans-serif;color:#201e22;background:#f5f3ee}body{max-width:1060px;margin:auto;padding:clamp(1rem,4vw,3rem)}h1,h2,h3{line-height:1.23}article{border-top:2px solid #242127;padding:1.4rem 0}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}section{background:white;border:1px solid #cbc7c0;padding:1.1rem}h3{margin:0}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}fieldset{border:0;padding:1rem 0}fieldset label{margin-right:1rem}button,input{font:inherit}button{padding:.4rem .65rem;border:1px solid #555;background:white;cursor:pointer}button[aria-pressed=true]{background:#20202c;color:white}.time{margin-top:.65rem;display:flex;align-items:end;gap:.6rem;flex-wrap:wrap}.time input{display:block;width:7rem}summary{cursor:pointer}#save{background:#252448;color:white;padding:.6rem 1.2rem}#status{margin-left:.6rem}@media(max-width:650px){.pair{grid-template-columns:1fr}}:focus-visible{outline:3px solid #1a49c0;outline-offset:2px}</style>
  <main><h1>创作盲评</h1>${review.synthetic?'<p>合成样稿练习</p>':''}<p>可跳过题目。改稿和实拍用时可在对应稿件下选填。</p>${cards}<button id="save" type="button">下载我的评审记录</button><span id="status" role="status"></span></main>
  <script>
  const clocks=new Map(),status=document.querySelector('#status');
  document.addEventListener('click',e=>{
    const btn=e.target.closest('button');if(!btn)return;
    if(btn.hasAttribute('data-clear')){const checked=btn.closest('article').querySelector(':checked');if(checked)checked.checked=false;}
    if(btn.hasAttribute('data-clock')){
      const input=btn.parentElement.querySelector('input'),start=clocks.get(btn);
      if(start===undefined){clocks.set(btn,Date.now());input.readOnly=true;btn.textContent='停止计时';btn.setAttribute('aria-pressed','true');}
      else{input.value=(Number(input.value||0)+(Date.now()-start)/60000).toFixed(2);clocks.delete(btn);input.readOnly=false;btn.textContent='开始计时';btn.setAttribute('aria-pressed','false');}
    }
    if(btn.id!=='save')return;
    if(clocks.size){status.textContent='请先停止正在运行的计时。';return;}
    for(const input of document.querySelectorAll('[data-time]'))if(!input.reportValidity()){input.closest('details').open=true;input.focus();return;}
    const rows=Array.from(document.querySelectorAll('[data-id]'),node=>{
      const result={id:node.dataset.id,choice:node.querySelector(':checked')?.value||null};
      for(const arm of node.querySelectorAll('[data-arm]')){
        result[arm.dataset.arm]=Object.fromEntries(Array.from(arm.querySelectorAll('[data-time]'),input=>[input.dataset.time,input.value===''?null:input.valueAsNumber]));
      }
      return result;
    });
    const blob=new Blob([JSON.stringify({session:${JSON.stringify(review.session)},rows},null,2)],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='评审记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);status.textContent='已导出当前记录。';
  });
  </script></html>`;
}
