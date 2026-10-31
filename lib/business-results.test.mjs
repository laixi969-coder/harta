import {it,expect} from 'vitest';
import {businessResults,businessActions,actionPage} from '../js/business-results.js';
import {nextAction} from '../js/journey.js';
import {manualDraftScope} from '../js/draft-scope.js';
it('separates people, purchasing needs and copies, with no invented revenue',()=>{
 const a={leads:[{id:'a',customerId:'c',platform:'抖音',authorId:'1',stage:'值得跟进',messages:[{status:'copied'}]},{id:'b',customerId:'c',platform:'抖音',authorId:'1',messages:[]},{id:'other',customerId:'else',messages:[{status:'sent_manual'}]}],opportunities:[{id:'need',customerId:'c',leadId:'a',stage:'已成交'}]};
 const r=businessResults(a,'c');expect(r.contacts).toBe(1);expect(r.contacted).toBe(0);expect(r.wonNeeds).toBe(1);expect(r.wonContacts).toBe(1);expect(r.revenue).toBeNull();
});
it('人工咨询类型按身份去重，商务签约和私域承接不计为购买成交',()=>{
 const a={leads:[{id:'a',customerId:'c',platform:'抖音',authorId:'same',intentTracks:[{kind:'ad',status:'won'},{kind:'divert',status:'won'}]},{id:'b',customerId:'c',platform:'抖音',authorId:'same',intentTracks:[{kind:'ad',status:'noted'}]},{id:'demo',customerId:'c',demo:true,intentTracks:[{kind:'buy',status:'won'}]},{id:'other',customerId:'other',intentTracks:[{kind:'buy',status:'won'}]}]};
 const r=businessResults(a,'c');expect(r.intents).toEqual({buy:{contacts:0,completed:0},ad:{contacts:1,completed:1},divert:{contacts:1,completed:1}});expect(r.wonContacts).toBe(0);expect(r.wonNeeds).toBe(0);
});
it('direct contact followups reach home; future, stopped and invalid dates are excluded',()=>{
 const a={leads:[{id:'a',customerId:'c',stage:'沟通中',nextAt:'2020-01-01',authorName:'甲'},{id:'b',customerId:'c',nextAt:'bad'},{id:'d',customerId:'c',nextAt:'2020-01-01',doNotContact:true},{id:'e',customerId:'else',nextAt:'2020-01-01'}]};
 expect(businessActions(a,'c')).toHaveLength(1);expect(nextAction({id:'c'},a).id).toBe('a');
});
it('待处理队列分页不遗漏后续联系人，队列缩短时回到有效页',()=>{
 const a={leads:Array.from({length:26},(_,i)=>({id:`l${i}`,customerId:'c',authorName:`访客${i}`,needsReply:true,messages:[]}))};
 const actions=businessActions(a,'c'),last=actionPage(actions,2);expect(last.total).toBe(26);expect(last.items.map(x=>x.id)).toEqual(['l24','l25']);
 const reduced=actionPage(actions.slice(0,3),2);expect(reduced.page).toBe(0);expect(reduced.items).toHaveLength(3);
});
it('演示线索和演示需求不会出现在工作台下一步',()=>{
 const a={leads:[{id:'demo-lead',customerId:'c',demo:true}],opportunities:[{id:'demo-op',customerId:'c',leadId:'demo-lead',nextAt:'2000-01-01',stage:'了解需求'}],signals:[{customerId:'c',status:'pending',source:'demo'}]};
 expect(businessActions(a,'c')).toEqual([]);expect(nextAction({id:'c'},a).action).toBe('go-content-home');
});
it('工作台待核实统计排除演示或缺失作品的评论，保留独立录入资料',()=>{
 const a={works:[{id:'real',customerId:'c',title:'真实作品'},{id:'demo',customerId:'c',demo:true},{id:'other',customerId:'else'}],signals:[
  {id:'r',customerId:'c',workId:'real',status:'pending'}, {id:'d',customerId:'c',workId:'demo',status:'pending'},
  {id:'missing',customerId:'c',workId:'missing',status:'pending'}, {id:'foreign',customerId:'c',workId:'other',status:'pending'},
  {id:'manual',customerId:'c',status:'pending'}, {id:'snippet',customerId:'c',sourceType:'search_summary',status:'pending'},
  {id:'reply',customerId:'c',status:'pending',isAuthorReply:true}
 ]};
 expect(businessResults(a,'c').pending).toBe(3);
 expect(businessActions(a,'c').find(x=>x.label==='待核实').title).toBe('3 条需求待核实');
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
it('两条获客路径按稳定身份去重，交集和未知来源单列，不把所有回复归给内容',()=>{
 const a={leads:[
  {id:'a',customerId:'c',platform:'抖音',authorId:'one',sourcePaths:['active'],stage:'值得跟进',needsReply:true},
  {id:'same',customerId:'c',platform:'抖音',authorId:'one',sourcePaths:['content'],stage:'值得跟进',needsReply:true},
  {id:'unknown',customerId:'c',platform:'抖音',authorId:'two',needsReply:true},
  {id:'stopped',customerId:'c',platform:'抖音',authorId:'three',sourcePaths:['content'],needsReply:true,doNotContact:true},
  {id:'demo',customerId:'c',platform:'抖音',authorId:'four',sourcePaths:['content'],demo:true},
  {id:'other',customerId:'else',sourcePaths:['content'],needsReply:true},
 ]};
 const r=businessResults(a,'c');expect(r.contacts).toBe(3);expect(r.overlapContacts).toBe(1);
 expect(r.paths.active).toEqual({contacts:1,qualified:1,pendingReply:1});
 expect(r.paths.content).toEqual({contacts:2,qualified:1,pendingReply:1});
 expect(r.paths.unknown).toEqual({contacts:1,qualified:0,pendingReply:1});
});
it('不凭同名或缺少平台的用户编号合并跨路径联系人',()=>{
 const a={leads:[{id:'a',customerId:'c',authorId:'same',authorName:'同名',sourcePaths:['active']},{id:'b',customerId:'c',authorId:'same',authorName:'同名',sourcePaths:['content']}]};
 expect(businessResults(a,'c').contacts).toBe(2);expect(businessResults(a,'c').overlapContacts).toBe(0);
});
