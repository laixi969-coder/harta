export function comparisonOptions(space,customerId) {
  const a=space.acquisition || {};
  return (a.products || []).filter(p=>p.customerId===customerId && p.status!=='archived').flatMap(p=>{
    const variants=(a.skus || []).filter(s=>s.customerId===customerId && s.productId===p.id && s.status!=='archived');
    return variants.length ? variants.map(s=>({key:'sku:'+s.id,name:p.name+' · '+s.name,productId:p.id,skuId:s.id}))
      : [{key:'product:'+p.id,name:p.name,productId:p.id}];
  });
}

function choiceTip(dims) {
  if(dims.some(d=>/高度|宽度|深度|厚度|长度|尺寸/.test(d)))return '先量放置位置的可用空间，再核对对应尺寸。';
  if(dims.some(d=>/容量|容积/.test(d)))return '先确定一次要装多少，再看哪款的容量合适。';
  if(dims.some(d=>/接口|兼容|适配/.test(d)))return '先查你手上设备的型号或接口，再对照两款的记录。';
  return '先圈出你最在意的一项，再看哪款的条件与你相符。';
}
export function comparisonFields(c) {
  const {keyword,left,right,rows}=c;
  const dims=rows.map(r=>r.dimension), tip=choiceTip(dims);
  const term=keyword.keyword;
  const question=/怎么|如何|选|区别|对比|哪|[?？]/.test(term)?term:term+'怎么选';
  const title=Array.from(question).length<=20?question:'选款前先核对'+(Array.from(dims[0]).length<=12?dims[0]:'产品资料');
  const numbered=rows.map((r,i)=>`${i+1}. ${r.dimension}\n${left.name}：${r.left.value}\n${right.name}：${r.right.value}`);
  const page=(t,fallback)=>Array.from(t).length<=90?t.replace(/\s*\n\s*/g,' '):fallback;
  const pages=[page(`${title}｜${left.name} / ${right.name}`,'这两款怎么选？先核对正文列出的产品和规格'),
    ...rows.map(r=>page(`${r.dimension}｜${left.name}：${r.left.value}；${right.name}：${r.right.value}`,`${r.dimension}｜两款的完整适用条件见正文这一项。`)),tip];
  return {title,cover:title,coverLayout:'并排放两款实物或标签，分别标出款名。',script:[`${left.name}和${right.name}怎么选？把${dims.join('、')}逐项排在一起看。`,...numbered,tip].join('\n\n'),
    shots:pages.join('\n'),imagePlan:['封面并排展示两款。',...rows.map(r=>'并列展示两款对应「'+r.dimension+'」的标签或资料局部。'), '收尾保留选择条件。'].join('\n'),cta:tip};
}
// Keep option/condition pairs together while allowing ordinary layout and punctuation edits.
function citationUnits(text) {
  return String(text||'').normalize('NFKC').toLowerCase().replace(/[ \t，,、：:；;。｜|·\r\n]/gu,'');
}
export function assertComparisonCopy(c,fields,format='image') {
  const body=citationUnits(fields.script);
  for(const r of c.rows){
    const facts=citationUnits(c.left.name+r.left.value+c.right.name+r.right.value);
    const reversed=citationUnits(c.right.name+r.right.value+c.left.name+r.left.value);
    if(!body.includes(citationUnits(r.dimension)+facts)&&!body.includes(citationUnits(r.dimension)+reversed))throw new Error('正文中的「'+r.dimension+'」与两款资料不一致，请按本篇选型依据核对款名和原文');
  }
  if(format==='image'&&fields.shots){
    const pages=comparisonFields(c).shots.split('\n').slice(1,-1);
    const lines=fields.shots.split(/\r?\n/).map(citationUnits);
    if(pages.some(p=>!lines.some(line=>line.includes(citationUnits(p)))))throw new Error('逐页文案里的选型差异与资料不一致，请核对对应页');
  }
}
export function citationText(p) {
  return `${p.title} · v${p.revision} · 第${p.line}行 · ${p.source}\n${p.quote}`;
}
export function comparisonNotes(c) {
  if(!c)return '';
  const terms=(c.keyword.locations||[]).map(e=>[e.file,e.sheet,'第'+e.row+'行'].filter(Boolean).join(' · ')).join('\n');
  return ['选型对照依据','需求词　'+c.keyword.keyword,terms,...c.rows.map((r,i)=>`${i+1}. ${r.dimension}\n${c.left.name}　${citationText(r.left)}\n${c.right.name}　${citationText(r.right)}`)].filter(Boolean).join('\n\n');
}
