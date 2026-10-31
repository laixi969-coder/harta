import { pendingPublicationReviews } from './publication-review.js';
import { leadNeedsReply } from './conversation-state.js';
import { activeCreatorMemories } from './creator-profile.js';
const real = r => !r.demo && r.source!=='demo' && r.sourceType!=='demo';
const timestamp = value => {const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:0;};
// Summaries contain no drafts, messages, contacts or access credentials.
export function teamMemberOverview(email, space, now=Date.now()) {
  const customers=(space.customers||[]).filter(real), ids=new Set(customers.map(c=>c.id)), acquisition=space.acquisition||{};
  const pubs=(acquisition.publications||[]).filter(p=>ids.has(p.customerId) && p.status==='published' && real(p));
  const leads=(acquisition.leads||[]).filter(l=>ids.has(l.customerId) && !l.doNotContact && real(l));
  const waiting=leads.filter(leadNeedsReply).length;
  const due=customers.reduce((n,c)=>n+pendingPublicationReviews(acquisition,c.id,now).length,0);
  const memories=customers.flatMap(c=>activeCreatorMemories(c).filter(m=>timestamp(m.createdAt)).map(m=>({at:m.createdAt,text:m.text,customer:c.name||'未命名业务'}))).sort((a,b)=>timestamp(b.at)-timestamp(a.at));
  const records=[...pubs.flatMap(p=>[p.recordedAt||p.createdAt,p.commentReview?.checkedAt]),...leads.map(l=>l.updatedAt),...customers.flatMap(c=>[...(c.accountReviewOutcomes||[]).map(r=>r.recordedAt),...[...(c.drops||[]),...(c.packs||[])].filter(real).flatMap(p=>[p.createdAt,...Object.values(p.productionDrafts||{}).map(d=>d.updatedAt),...Object.values(p.outcomes||{}).flatMap(rows=>(rows||[]).map(r=>r.recordedAt))])]),...memories.map(m=>m.at)].map(timestamp).filter(t=>t>0 && t<=now);
  const published=pubs.map(p=>timestamp(p.publishedAt)).filter(t=>t>0 && t<=now);
  return {email,customers:customers.length,published:pubs.length,waiting,reviewDue:due,lastPublished:published.length?new Date(published.reduce((max,t)=>Math.max(max,t),0)).toISOString():null,lastRecorded:records.length?new Date(records.reduce((max,t)=>Math.max(max,t),0)).toISOString():null,lastReview:memories[0]||null};
}
