import { gradeDistribution, qualificationDirectory, effectiveContactDirectory, contactIdentity } from './lead-qualification.js';
import { LEAD_INTENTS } from './lead-intent.js';
import { unansweredMessages, leadNeedsReply } from './conversation-state.js';
import { pendingPublicationReviews } from './publication-review.js';
import { isRealEvidence } from './evidence-kind.js';
// Current saved evidence, scoped to one business. Copies and scores never imply contact or revenue.
const sent = m => ['sent_manual','sent_platform'].includes(m.status);
const real = isRealEvidence;
// Imported comments attached to demo or missing works are not real demand.
// Unattached manually entered records and search summaries can still be reviewed.
function pendingSignals(acquisition,customerId) {
 const works=acquisition.works || [];
 return (acquisition.signals || []).filter(s=>s.customerId===customerId && real(s) && s.status==='pending' && !s.isAuthorReply && (!s.workId || real(works.find(w=>w.id===s.workId && w.customerId===customerId))));
}
export function actionPage(items=[], requested=0, size=12) {
 const pages=Math.max(1,Math.ceil(items.length/size)),page=Math.max(0,Math.min(Number.isSafeInteger(requested)?requested:0,pages-1));
 return {items:items.slice(page*size,(page+1)*size),page,pages,total:items.length};
}
export function businessResults(acquisition = {}, customerId) {
 const rows = key => (acquisition[key] || []).filter(r=>r.customerId===customerId&&real(r));
 const leads=rows('leads'), opportunities=rows('opportunities').filter(o=>leads.some(l=>l.id===o.leadId));
 const {contacts,effective}=effectiveContactDirectory(acquisition,customerId);
 const identity=contactIdentity;
 const qualified=l=>effective.has(identity(l));
 const contacted=l=>(l.messages||[]).some(m=>real(m)&&sent(m));
 const unique = list => new Set(list.map(identity)).size;
 const pathsFor=l=>{const paths=(Array.isArray(l.sourcePaths)?l.sourcePaths:[]).filter(p=>['active','content','unknown'].includes(p));return paths.length?paths:['unknown'];};
 const pathRows=path=>leads.filter(l=>pathsFor(l).includes(path));
 const pathMetrics=list=>({contacts:unique(list),qualified:unique(list.filter(qualified)),contacted:unique(list.filter(contacted)),pendingReply:unique(list.filter(l=>!contacts.get(l.id)?.blocked&&leadNeedsReply(l)))});
 const activeIds=new Set(pathRows('active').map(identity)),contentIds=new Set(pathRows('content').map(identity));
 const paths=Object.fromEntries(['active','content','unknown'].map(path=>[path,pathMetrics(pathRows(path))]));
 const overlapContacts=[...activeIds].filter(id=>contentIds.has(id)).length;
 const closedGrades={};
 for(const op of opportunities){
   if(!['已成交','已结束'].includes(op.stage))continue;
   const code=op.gradeAtClose?.code || 'unknown';
   const tally=closedGrades[code] ||= {won:0,ended:0};
   tally[op.stage==='已成交'?'won':'ended']++;
 }
 const intents=Object.fromEntries(Object.keys(LEAD_INTENTS).map(kind=>[kind,{contacts:unique(leads.filter(l=>(l.intentTracks||[]).some(t=>t.kind===kind))),completed:unique(leads.filter(l=>(l.intentTracks||[]).some(t=>t.kind===kind&&t.status==='won')))}]));
 return { paths, overlapContacts, closedGrades, grades:gradeDistribution(contacts), works:rows('works').filter(w=>!w.owned).length, pending:pendingSignals(acquisition,customerId).length,
  contacts:unique(leads), qualified:unique(leads.filter(qualified)),
  contacted:unique(leads.filter(contacted)), replied:unique(leads.filter(l=>(l.messages||[]).some(m=>m.direction==='inbound'))),
  wonNeeds:opportunities.filter(o=>o.stage==='已成交').length, wonContacts:unique(leads.filter(l=>l.stage==='已成交'||opportunities.some(o=>o.leadId===l.id&&o.stage==='已成交'))),
  published:rows('publications').filter(p=>p.status==='published').length,intents,
  revenue:null, exposures:null };
}
export function businessActions(acquisition = {}, customerId, now=Date.now()) {
 const rows=key=>(acquisition[key]||[]).filter(r=>r.customerId===customerId&&real(r));
 const {contacts}=qualificationDirectory(acquisition,customerId,now), list=[];
 const due=date=>Number.isFinite(Date.parse(date)) && Date.parse(date)<=now;
 for (const {lead,scopes,blocked} of contacts.values()) {
  if (blocked) continue;
  const messages=(lead.messages||[]).filter(real), unanswered=unansweredMessages(messages);
  const title=lead.authorName||'客户';
  const replies=new Set();
  for(const incoming of unanswered){
   const scope=scopes.find(s=>s.scopeId===incoming.opportunityId && s.opportunity);
   const id=scope?.scopeId||lead.id;
   if(replies.has(id))continue;
   replies.add(id);
   const service=scope?.code==='service'||(!scope&&scopes.length===1&&scopes[0].code==='service');
   list.push({id,action:scope?'open-need':'open-contact-history',title:title+(scope?' · '+scope.opportunity.title:''),
    note:service?'查看客户原话并处理服务事项':'查看客户原话并准备回复',label:'待回复',rank:0,time:0,grade:scope?.code||(!scopes[0].opportunity?scopes[0].code:'pending')});
  }
  if(!messages.some(m=>m.direction==='inbound')&&lead.needsReply){
   replies.add(lead.id);
   list.push({id:lead.id,action:'open-contact',title,note:'查看客户原话并准备回复',label:'待回复',rank:0,time:0});
  }
  const actionable=scopes.some(s=>['A','B','C','pending'].includes(s.code));
  if(scopes[0].opportunity && actionable && !unanswered.length && !replies.has(lead.id) && !['已成交','暂不跟进'].includes(lead.stage) && due(lead.nextAt))
   list.push({id:lead.id,action:'open-contact',title,note:lead.nextStep||'已到跟进时间',label:'联系人跟进到期',rank:1,time:Date.parse(lead.nextAt)});
  for(const scope of scopes){
   const op=scope.opportunity,item=op||lead,grade=scope.code;
   if(replies.has(item.id)||!['A','B','C','pending','unfit'].includes(grade))continue;
   const base={id:item.id,action:op?'open-need':'open-contact',title:op?op.title:title,grade};
   if(scope.review)list.push({...base,note:scope.next,label:'分级待复核',rank:due(item.nextAt)?1:2,time:Date.parse(item.nextAt)||0});
   else if(grade==='unfit')continue;
   else if(due(item.nextAt))list.push({...base,note:item.nextStep||'已到跟进时间',label:op?'购买需求跟进到期':'联系人跟进到期',rank:1,time:Date.parse(item.nextAt)});
   else if(grade==='A'&&!item.nextAt)list.push({...base,note:item.nextStep||scope.next,label:'A 级待排期',rank:1,time:0});
   else if(grade==='pending' && !scope.assessment && scope.sources.length && !item.nextAt)list.push({...base,note:'核对客户原话，评定本次需求',label:'线索待评定',rank:2,time:0});
   else if(op && !item.nextAt && ['pending','B'].includes(grade) && !(lead.messages||[]).some(m=>m.opportunityId===op.id&&(sent(m)||m.direction==='inbound')))list.push({...base,note:op.nextStep||'根据原话准备联系草稿',label:'待开场',rank:2,time:0});
  }
 }
 const pending=pendingSignals(acquisition,customerId).length;
 if(pending)list.push({id:'',action:'search',title:`${pending} 条需求待核实`,note:'核对原话与业务匹配情况',label:'待核实',rank:2,time:0});
 for(const p of pendingPublicationReviews(acquisition,customerId,now))list.push({id:p.id,action:'open-publication-review',title:p.content?.title || p.content?.cover || '已发布作品',note:`${p.platform} · 发布已满两天，回看评论和咨询；未采集不代表没有需求。`,label:'回看评论',rank:2,time:Date.parse(p.publishedAt)});
 const drafts=rows('publications').filter(p=>p.status==='pending_confirmation').length;
 if(drafts)list.push({id:'',action:'legacy',title:`${drafts} 篇待登记发布`,note:'在平台发布后登记，不自动执行',label:'待发布',rank:3,time:0});
 const priority=code=>({A:0,B:1,C:2})[code]??3;
 return list.sort((a,b)=>a.rank-b.rank || Number(a.label==='A 级待排期')-Number(b.label==='A 级待排期') || priority(a.grade)-priority(b.grade) || a.time-b.time);
}
