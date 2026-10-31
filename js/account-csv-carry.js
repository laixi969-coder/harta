import { isRealEvidence } from './evidence-kind.js';

// Find only the newest snapshot for this exact publication, account and window.
export function priorPublicationOutcome(customer,pub,start,end) {
  if(!customer || !isRealEvidence(pub))return null;
  let rows;
  if(pub.origin==='manual_external') rows=customer.accountReviewOutcomes||[];
  else {
    const pack=[...(customer.drops||[]),...(customer.packs||[])].find(p=>p.id===pub.packId);
    if(!isRealEvidence(pack))return null;
    rows=pack?.outcomes?.[`${pub.platform}|${pub.index}`]||[];
  }
  return rows.find(r=>isRealEvidence(r) && r.publicationId===pub.id && (r.accountId||'')===(pub.accountId||'') && r.start===start && r.end===end && (pub.origin==='manual_external'?(r.publicationVersion||1)===(pub.metadataVersion||1):(r.revision||'')===(pub.revision||'')))||null;
}
export function carriedCsvMetrics(previous, incoming) {
  return Object.fromEntries(Object.entries(previous?.metrics||{}).filter(([key,value])=>value!=null && !Object.hasOwn(incoming,key)));
}
// New qualified-lead values need their own definition; retained attributed
// metrics may only share a snapshot when the user supplies the same definition.
export function csvCriteria(previous, incoming, carried, supplied) {
  const next=typeof supplied==='string'?supplied.trim():'',prior=previous?.criteria||'';
  if(Object.hasOwn(incoming,'qualifiedLeads')) {
    if(!next)throw new Error('填写有效线索的筛选与去重口径');
    if(['qualifiedLeads','orders','revenue','refunds'].some(key=>Object.hasOwn(carried,key)) && prior!==next)throw new Error('沿用的客资或成交口径与新线索口径不同，请分别导入或使用相同口径');
    return next;
  }
  if(['qualifiedLeads','orders','revenue','refunds'].some(key=>Object.hasOwn(carried,key)))return prior;
  return next || (Object.keys(carried).length?prior:'');
}
export function metricSourceText(row,labels) {
  const sources=row?.metricSources;if(!sources || typeof sources!=='object')return '';
  return Object.entries(sources).filter(([key,value])=>Object.hasOwn(labels,key) && typeof value==='string' && value).map(([key,value])=>`${labels[key]}：${value}`).join('；');
}
