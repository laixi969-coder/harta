import {it,expect} from 'vitest';
import {businessResults,businessActions} from '../js/business-results.js';
import {nextAction} from '../js/journey.js';
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
