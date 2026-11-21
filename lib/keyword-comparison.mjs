import { productScope, scopeHash } from './product-scope.mjs';

import { comparisonOptions } from '../js/comparison-copy.js';
const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[\s。.]$/u,'').replace(/\s+/g,'');
function comparableValue(text) {
  const value=normalize(text), measure=value.match(/^(\d+(?:\.\d+)?)(厘米|公分|cm|毫米|mm|米|m|毫升|ml|升|l|克|g|千克|kg)$/);
  if(!measure)return value;
  const units={厘米:['mm',10],公分:['mm',10],cm:['mm',10],毫米:['mm',1],mm:['mm',1],米:['mm',1000],m:['mm',1000],升:['ml',1000],l:['ml',1000],毫升:['ml',1],ml:['ml',1],克:['g',1],g:['g',1],千克:['g',1000],kg:['g',1000]};
  const [unit,multiplier]=units[measure[2]];
  return unit+Number((Number(measure[1])*multiplier).toPrecision(12));
}
function passages(space,customerId,option) {
  const a=space.acquisition, kind=option.skuId?'规格':'产品', id=option.skuId||option.productId;
  const record=(option.skuId?a.skus:a.products).find(r=>r.id===id && r.customerId===customerId);
  const parts=[];
  function add(row,title,field,label='',price=false) {
    if (!row.source || !row[field]) return;
    for(const [index,raw] of (price?[row[field]]:row[field].split(/\r?\n/)).entries()){
      const quote=raw.trim();if(!quote || quote.length>500)continue;
      const match=price?null:quote.match(/^([^：:\t]{1,32})\s*[：:\t]\s*(\S.*)$/u);
      const dimension=label || match?.[1].trim() || '', value=match?.[2]?.trim() || quote;
      const ref={recordId:row.id,revision:row.revision,field,line:index+1,quote,dimension,value,source:row.source,title};
      parts.push({...ref,id:scopeHash(ref)});
    }
  }
  add(record,kind+' · '+option.name,'attributes');
  add(record,kind+' · '+option.name,'facts');
  if(!record.priceExpiresAt || Date.parse(record.priceExpiresAt)>Date.now())add(record,kind+' · '+option.name,'priceTerms','价格及条件',true);
  const docs=(a.salesDocuments||[]).filter(d=>d.customerId===customerId && d.productId===option.productId && (d.skuId||'')===(option.skuId||'') && d.status==='approved' && (!d.expiresAt||Date.parse(d.expiresAt)>Date.now()));
  for(const d of docs)add(d,d.title,'body');
  return parts;
}
function keywordSource(customer,batchId,keywordId){
  const batch=customer?.keywordLibraries?.find(b=>b.id===batchId),row=batch?.items.find(r=>r.id===keywordId);
  if(!row)throw new Error('请从当前业务已保存的词库选择需求词');
  return {batchId,keywordId,keyword:row.keyword,scope:batch.scope,sources:batch.sources,
    locations:(row.evidence||[]).map(({file,sheet,row})=>({file,sheet,row}))};
}
function sides(space,customerId,left,right){
  const options=comparisonOptions(space,customerId),a=options.find(o=>o.key===left),b=options.find(o=>o.key===right);
  if(!a||!b||left===right)throw new Error('请选择当前业务的两个不同产品或规格');
  return [a,b].map(option=>({option,passages:passages(space,customerId,option)}));
}
function compatible(a,b) {
  return a && b && normalize(a.dimension)===normalize(b.dimension) && comparableValue(a.value)!==comparableValue(b.value);
}
export function previewKeywordComparison(space,input) {
  const keyword=keywordSource(space.customers.find(c=>c.id===input.customerId),input.batchId,input.keywordId);
  const [left,right]=sides(space,input.customerId,input.left,input.right);
  // Conflicting sources require an explicit choice of excerpts on both sides.
  const matches=[];
  const distinct=rows=>new Set(rows.map(row=>comparableValue(row.value))).size;
  for(const dim of new Set(left.passages.map(p=>normalize(p.dimension)).filter(Boolean))){
    const a=left.passages.filter(p=>normalize(p.dimension)===dim),b=right.passages.filter(p=>normalize(p.dimension)===dim);
    if(distinct(a)===1 && distinct(b)===1 && compatible(a[0],b[0]))matches.push({left:a[0].id,right:b[0].id});
  }
  const basis=scopeHash([keyword,left,right]);
  return {keyword,left,right,matches,basis};
}
export function resolveKeywordComparison(space,input) {
  const view=previewKeywordComparison(space,input);
  if(view.basis!==input.basis)throw new Error('词条或产品资料已变化，请重新查看对照');
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>6)throw new Error('请选择一至六项有双方依据的差异');
  const rows=input.rows.map(pair=>{
    const left=view.left.passages.find(p=>p.id===pair?.left),right=view.right.passages.find(p=>p.id===pair?.right);
    if(!compatible(left,right))throw new Error('每项差异需要同一项目下两份不同的原文依据');
    return {dimension:left.dimension||'资料原文',left,right};
  });
  if(new Set(rows.map(r=>r.left.id)).size!==rows.length||new Set(rows.map(r=>r.right.id)).size!==rows.length||new Set(rows.filter(r=>r.left.dimension).map(r=>normalize(r.dimension))).size!==rows.filter(r=>r.left.dimension).length)throw new Error('同一项请只选一组依据');
  const left=view.left.option,right=view.right.option;
  const scope=productScope(space,input.customerId,{productIds:[left.productId,right.productId],skuIds:[left.skuId,right.skuId].filter(Boolean)});
  const comparison={keyword:view.keyword,left,right,rows};
  return {scope,comparison,fingerprint:scopeHash(comparison)};
}
export function assertComparisonCurrent(space,customerId,comparison) {
  if(!comparison)return;
  let left,right;
  try{[left,right]=sides(space,customerId,comparison.left.key,comparison.right.key);}catch{throw new Error('选型引用的产品或规格已停用，请从词库重新选择');}
  if(left.option.name!==comparison.left.name||right.option.name!==comparison.right.name||comparison.rows.some(r=>!left.passages.some(p=>p.id===r.left.id)||!right.passages.some(p=>p.id===r.right.id)))throw new Error('选型对照的产品资料已更新或到期，请从词库重新核对并建立新版');
}
