// A reply acknowledges the latest incoming message in its account/channel/need thread.
export const messageTime = message => Date.parse(message.receivedAt || message.sentAt || message.createdAt) || 0;
const threadKey = message => JSON.stringify([message.accountId || '', message.channel || '', message.opportunityId || '']);
export function unansweredMessages(messages = []) {
  const latest = new Map();
  for (const message of messages.filter(m => m.direction === 'inbound').sort((a,b) => messageTime(a)-messageTime(b))) latest.set(threadKey(message), message);
  return [...latest.values()].filter(incoming => !messages.some(message =>
    ['sent_manual','sent_platform'].includes(message.status) && message.replyTo === incoming.id && messageTime(message) >= messageTime(incoming)));
}

// Older records may only have the flag; once messages exist, their actual
// thread state is authoritative and an old flag must not revive a reply.
export function leadNeedsReply(lead = {}) {
  const messages=lead.messages || [];
  return messages.some(m=>m.direction==='inbound') ? unansweredMessages(messages).length>0 : Boolean(lead.needsReply);
}
