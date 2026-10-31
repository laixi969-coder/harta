import { isRealEvidence } from './evidence-kind.js';

// These are ratios of user-entered counts, not platform analytics.
function count(value) {
  if(typeof value!=='string' || !/^\d{1,9}$/.test(value))return null;
  const n=Number(value);return Number.isSafeInteger(n) && n<=100000000?n:null;
}
function fraction(part,total) {
  if(part===null || total===null)return '未记录';
  if(part>total)return '数据需核对';
  if(total===0)return '分母为 0，无法计算';
  return `${(part/total*100).toFixed(1)}%（${part} / ${total}）`;
}
export function liveReviewSummary(fields={}) {
  const attendance=count(fields.liveAttendance),retained=count(fields.liveRetained),inquiries=count(fields.liveInquiries),qualified=count(fields.liveQualifiedLeads);
  return {attendance,retained,inquiries,qualified,retention:fraction(retained,attendance),qualifiedShare:fraction(qualified,inquiries)};
}

// A source identifies one saved session. Count actual local incoming records,
// excluding examples, separately from the manually entered summary totals.
export function liveAttributionCounts(sourceId,customerId,leads=[]) {
  const linked=[];let messages=0;
  for(const lead of leads){
    if(!isRealEvidence(lead) || lead.customerId!==customerId)continue;
    const count=(lead.messages||[]).filter(message=>isRealEvidence(message) && message.direction==='inbound' && message.liveSource?.id===sourceId).length;
    if(count){messages+=count;linked.push({id:lead.id,name:lead.authorName||'联系人'});}
  }
  return {messages,contacts:linked.length,linkedContacts:linked};
}
