import { isRealEvidence, isResearchComment } from './evidence-kind.js';
// Count locally recorded evidence only; manual inquiries and imported comments
// can describe the same interaction and must not be added together.
export function publicationAttributionCounts(publicationId, customerId, leads=[], signals=[], works=null) {
  const realLeads=leads.filter(l=>l.customerId===customerId && isRealEvidence(l));
  const leadIds=new Set(realLeads.map(l=>l.id));
  const messages=realLeads.flatMap(l=>(l.messages||[]).filter(m=>isRealEvidence(m)&&m.direction==='inbound'&&m.publicationId===publicationId).map(m=>({leadId:l.id,message:m})));
  const comments=signals.filter(s=>s.customerId===customerId && s.status==='confirmed' && leadIds.has(s.leadId) && isResearchComment(s,works) && s.publicationAttribution?.publicationId===publicationId);
  return {messages:messages.length,contacts:new Set(messages.map(m=>m.leadId)).size,comments:comments.length,commentContacts:new Set(comments.map(s=>s.leadId)).size};
}
