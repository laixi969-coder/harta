import { isRealEvidence } from './evidence-kind.js';

const refusal = value => /(?:别|不要|不再|停止|禁止|不用).{0,5}(?:联系|打扰|推销|发消息|私信)|(?:不要|别)再发|退订|拉黑/.test(value);

// A new purchasing need does not cancel a contact-wide opt-out.
export function refusedContact(lead, signals = [], messages = lead.messages || []) {
  const restored = Math.max(0, ...(lead.events || []).filter(e => e.type === 'unblock').map(e => Date.parse(e.at) || 0));
  const afterRestore = date => !restored || Date.parse(date) > restored;
  return messages.some(m => isRealEvidence(m) && m.direction === 'inbound' && refusal(m.text) && afterRestore(m.receivedAt || m.createdAt))
    || signals.some(s => isRealEvidence(s) && !s.isAuthorReply && refusal(s.text) && afterRestore(s.publishedAt));
}

export function conversationHold(text = '') {
  if (/转人工|找人工|人工客服|投诉|(?:我要|申请|要求|办理)(?:退款|退货)|(?:退款|退货)(?:流程|进度)|起诉/.test(text)) return 'service';
  if (/不买了|不考虑了|不需要了|不感兴趣/.test(text) && !/(?:还有|有没有|有|换|推荐).{0,6}(?:别的|其他|便宜|款)|现在.{0,6}(?:怎么买|下单)/.test(text)) return 'paused';
  return '';
}

export function verifiedLeadSignal(signal, workIds) {
  return isRealEvidence(signal) && signal.status === 'confirmed' && !signal.isAuthorReply &&
    (!signal.workId || workIds.has(signal.workId)) && (signal.sourceType !== 'search_summary' || Boolean(signal.searchVerification));
}

export function leadMarketingBlocked(acquisition, lead) {
  if (lead.doNotContact || refusedContact(lead)) return true;
  if (!lead.signalIds?.length) return false;
  const ids = new Set(lead.signalIds);
  const works = new Set((acquisition.works || []).filter(w => w.customerId === lead.customerId && isRealEvidence(w)).map(w => w.id));
  const signals = (acquisition.signals || []).filter(s => ids.has(s.id) && s.customerId === lead.customerId &&
    (!s.leadId || s.leadId === lead.id) && verifiedLeadSignal(s,works));
  return refusedContact(lead,signals,[]);
}
