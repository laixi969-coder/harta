// Current saved evidence, scoped to one business. Copies and scores never imply contact or revenue.
const sent = m => ['sent_manual','sent_platform'].includes(m.status);
const real = r => !r.demo && r.source !== 'demo' && r.sourceType !== 'demo';
export function businessResults(acquisition = {}, customerId) {
 const rows = key => (acquisition[key] || []).filter(r=>r.customerId===customerId&&real(r));
 const leads=rows('leads'), opportunities=rows('opportunities').filter(o=>leads.some(l=>l.id===o.leadId));
 const unique = list => new Set(list.map(l=>l.authorId ? `${l.platform}:${l.authorId}` : l.id)).size;
 return { works:rows('works').length, pending:rows('signals').filter(s=>s.status==='pending'&&!s.isAuthorReply).length,
  contacts:unique(leads), qualified:unique(leads.filter(l=>['值得跟进','已联系','沟通中','已成交'].includes(l.stage))),
  contacted:unique(leads.filter(l=>(l.messages||[]).some(sent))), replied:unique(leads.filter(l=>(l.messages||[]).some(m=>m.direction==='inbound'))),
  wonNeeds:opportunities.filter(o=>o.stage==='已成交').length, wonContacts:unique(leads.filter(l=>l.stage==='已成交'||opportunities.some(o=>o.leadId===l.id&&o.stage==='已成交'))),
  published:rows('publications').filter(p=>p.status==='published').length,
  revenue:null, exposures:null };
}
export function businessActions(acquisition = {}, customerId, now=Date.now()) {
 const rows=key=>(acquisition[key]||[]).filter(r=>r.customerId===customerId&&real(r));
 const leads=rows('leads').filter(l=>!l.doNotContact), list=[];
 for(const l of leads){
  const messages=l.messages||[], unanswered=messages.filter(m=>m.direction==='inbound').some(m=>!messages.some(s=>sent(s)&&s.replyTo===m.id&&Date.parse(s.sentAt)>=Date.parse(m.receivedAt||m.createdAt)));
  if(unanswered||l.needsReply)list.push({id:l.id,action:'open-contact',title:l.authorName||'客户',note:'查看客户原话并准备回复',label:'待回复',rank:0,time:0});
  else if(!['已成交','暂不跟进'].includes(l.stage)&&Number.isFinite(Date.parse(l.nextAt))&&Date.parse(l.nextAt)<=now)list.push({id:l.id,action:'open-contact',title:l.authorName||'客户',note:l.nextStep||'已到跟进时间',label:'联系人跟进到期',rank:1,time:Date.parse(l.nextAt)});
 }
 for(const o of rows('opportunities'))if(!['已成交','已结束'].includes(o.stage)&&leads.some(l=>l.id===o.leadId)&&Number.isFinite(Date.parse(o.nextAt))&&Date.parse(o.nextAt)<=now)list.push({id:o.id,action:'open-need',title:o.title,note:o.nextStep||'查看购买需求',label:'购买需求跟进到期',rank:1,time:Date.parse(o.nextAt)});
 for(const o of rows('opportunities'))if(!['已成交','已结束'].includes(o.stage)&&!list.some(a=>a.action==='open-need'&&a.id===o.id)){
  const l=leads.find(l=>l.id===o.leadId);if(!l)continue;
  if(!(l.messages||[]).some(m=>m.opportunityId===o.id&&(sent(m)||m.direction==='inbound')))list.push({id:o.id,action:'open-need',title:o.title,note:o.nextStep||'根据原话准备联系草稿',label:'待开场',rank:2,time:0});
 }
 const pending=rows('signals').filter(s=>s.status==='pending'&&!s.isAuthorReply).length;
 if(pending)list.push({id:'',action:'search',title:`${pending} 条需求待核实`,note:'核对原话与业务匹配情况',label:'待核实',rank:2,time:0});
 const drafts=rows('publications').filter(p=>p.status==='pending_confirmation').length;
 if(drafts)list.push({id:'',action:'legacy',title:`${drafts} 篇待登记发布`,note:'在平台发布后登记，不自动执行',label:'待发布',rank:3,time:0});
 return list.sort((a,b)=>a.rank-b.rank||a.time-b.time);
}
