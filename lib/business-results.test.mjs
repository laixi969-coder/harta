import {it,expect} from 'vitest';
import {businessResults,businessActions} from '../js/business-results.js';
import {nextAction} from '../js/journey.js';
import {manualDraftScope} from '../js/draft-scope.js';
it('separates people, purchasing needs and copies, with no invented revenue',()=>{
 const a={leads:[{id:'a',customerId:'c',platform:'抖音',authorId:'1',stage:'值得跟进',messages:[{status:'copied'}]},{id:'b',customerId:'c',platform:'抖音',authorId:'1',messages:[]},{id:'other',customerId:'else',messages:[{status:'sent_manual'}]}],opportunities:[{id:'need',customerId:'c',leadId:'a',stage:'已成交'}]};
 const r=businessResults(a,'c');expect(r.contacts).toBe(1);expect(r.contacted).toBe(0);expect(r.wonNeeds).toBe(1);expect(r.wonContacts).toBe(1);expect(r.revenue).toBeNull();
});
it('direct contact followups reach home; future, stopped and invalid dates are excluded',()=>{
 const a={leads:[{id:'a',customerId:'c',stage:'沟通中',nextAt:'2020-01-01',authorName:'甲'},{id:'b',customerId:'c',nextAt:'bad'},{id:'d',customerId:'c',nextAt:'2020-01-01',doNotContact:true},{id:'e',customerId:'else',nextAt:'2020-01-01'}]};
 expect(businessActions(a,'c')).toHaveLength(1);expect(nextAction({id:'c'},a).id).toBe('a');
});
it('reply drafts do not clear incoming followup; only a recorded linked send does',()=>{
 const a={leads:[{id:'a',customerId:'c',messages:[{id:'in',direction:'inbound',receivedAt:'2026-01-01'},{id:'out',status:'copied',replyTo:'in',sentAt:'2026-01-02'}]}]};
 expect(businessActions(a,'c')[0].label).toBe('待回复');a.leads[0].messages[1].status='sent_manual';expect(businessActions(a,'c')).toHaveLength(0);
});
it('a reply to the latest incoming message clears its thread, including stale legacy flags',()=>{
 const messages=[{id:'one',direction:'inbound',accountId:'a',channel:'私信',receivedAt:'2026-01-01'},{id:'two',direction:'inbound',accountId:'a',channel:'私信',receivedAt:'2026-01-02'},{id:'reply',status:'sent_manual',replyTo:'two',sentAt:'2026-01-03'}];
 const a={leads:[{id:'lead',customerId:'c',needsReply:true,messages}]};
 expect(businessActions(a,'c')).toEqual([]);expect(nextAction({id:'c'},a).action).not.toBe('open-contact');
 messages.push({id:'other-account',direction:'inbound',accountId:'b',channel:'私信',receivedAt:'2026-01-01'});
 expect(businessActions(a,'c')).toMatchObject([{id:'lead',action:'open-contact-history',label:'待回复'}]);
});
it('unanswered needs link to the actual need, and direct messages to the contact history',()=>{
 const a={leads:[{id:'lead',customerId:'c',messages:[{id:'incoming',direction:'inbound',opportunityId:'second',receivedAt:'2026-01-02'}]}],opportunities:[{id:'first',customerId:'c',leadId:'lead',title:'第一需求',stage:'了解需求'},{id:'second',customerId:'c',leadId:'lead',title:'第二需求',stage:'了解需求',nextAt:'2020-01-01'}]};
 expect(nextAction({id:'c'},a)).toMatchObject({id:'second',action:'open-need'});
 expect(businessActions(a,'c').filter(r=>r.id==='second')).toHaveLength(1);
 a.leads[0].messages.push({id:'direct',direction:'inbound',receivedAt:'2026-01-03'});
 expect(businessActions(a,'c')).toContainEqual(expect.objectContaining({id:'lead',action:'open-contact-history'}));
});
it.each(['accountId','channel','recipient','text'])('draft response scope changes when %s changes in flight',key=>{
 const values={accountId:'a',channel:'私信',recipient:'user',text:''},form={querySelector:selector=>({value:values[selector.slice(6,-1)]})};
 const before=manualDraftScope(form);values[key]+='changed';expect(manualDraftScope(form)).not.toBe(before);
});
