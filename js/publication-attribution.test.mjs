import { describe, it, expect } from 'vitest';
import { publicationAttributionCounts } from './publication-attribution.js';
describe('作品关联记录统计',()=>{
 it('按业务与作品分别统计手工咨询、评论及联系人，不能相加',()=>{
  const leads=[{id:'l1',customerId:'c1',messages:[{direction:'inbound',publicationId:'p1'},{direction:'inbound',publicationId:'p1'},{direction:'outbound',publicationId:'p1'}]},{id:'l2',customerId:'c1',messages:[{direction:'inbound',publicationId:'p2'}]},{id:'l3',customerId:'c2',messages:[{direction:'inbound',publicationId:'p1'}]}];
  const signals=[{customerId:'c1',status:'confirmed',leadId:'l1',publicationAttribution:{publicationId:'p1'}},{customerId:'c1',status:'pending',leadId:'l2',publicationAttribution:{publicationId:'p1'}},{customerId:'c1',status:'confirmed',leadId:'l2',isAuthorReply:true,publicationAttribution:{publicationId:'p1'}}];
  expect(publicationAttributionCounts('p1','c1',leads,signals)).toEqual({messages:2,contacts:1,comments:1,commentContacts:1});
  leads[0].messages[0].publicationId='p2';leads[0].messages[1].publicationId='';
  expect(publicationAttributionCounts('p1','c1',leads,signals)).toEqual({messages:0,contacts:0,comments:1,commentContacts:1});
  expect(publicationAttributionCounts('p2','c1',leads,signals)).toEqual({messages:2,contacts:2,comments:0,commentContacts:0});
 });
 it('演示资料、失去联系人或失去真实作品来源的关联不计入效果',()=>{
  const leads=[{id:'real',customerId:'c',messages:[{direction:'inbound',publicationId:'p'},{direction:'inbound',publicationId:'p',demo:true}]},{id:'demo',customerId:'c',demo:true,messages:[{direction:'inbound',publicationId:'p'}]},{id:'foreign',customerId:'other',messages:[]}];
  const works=[{id:'real-work',customerId:'c'},{id:'demo-work',customerId:'c',source:'demo'}];
  const signal=(leadId,workId,extra={})=>({customerId:'c',status:'confirmed',leadId,workId,publicationAttribution:{publicationId:'p'},...extra});
  const signals=[signal('real','real-work'),signal('real','demo-work'),signal('real','missing'),signal('demo','real-work'),signal('foreign','real-work'),signal('missing','real-work'),signal('real','real-work',{demo:true})];
  expect(publicationAttributionCounts('p','c',leads,signals,works)).toEqual({messages:1,contacts:1,comments:1,commentContacts:1});
 });
});
