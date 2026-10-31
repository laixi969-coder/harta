import {describe,it,expect} from 'vitest';
import {teamMemberOverview} from './team-overview.js';
const now=Date.parse('2026-10-10T12:00:00Z');
describe('团队工作概况',()=>{
 it('统计真实业务的发布、待回复与回看，仅显示当前可用复盘假设',()=>{
  const c={id:'c1',name:'业务一',drops:[{id:'p',createdAt:'2026-10-05T12:00:00Z'}],creatorMemories:[{id:'m',active:true,text:'验证简洁开头',createdAt:'2026-10-09T10:00:00Z'},{id:'old',active:false,text:'停用内容',createdAt:'2026-10-10T10:00:00Z'},{id:'stale',active:true,kind:'account-review',text:'过期记忆',createdAt:'2026-10-10T11:00:00Z'}]};
  const space={customers:[c,{id:'demo',demo:true}],acquisition:{publications:[{id:'p1',customerId:'c1',status:'published',url:'https://example.com/1',publishedAt:'2026-10-08T11:00:00Z',recordedAt:'2026-10-08T12:00:00Z'},{id:'p2',customerId:'demo',status:'published',publishedAt:'2026-10-01T00:00:00Z'}],leads:[{id:'l1',customerId:'c1',needsReply:true,messages:[{direction:'inbound',text:'客户隐私'}],updatedAt:'2026-10-09T12:00:00Z'},{id:'l2',customerId:'c1',needsReply:true,doNotContact:true},{id:'l3',customerId:'other',needsReply:true}]}};
  const member=teamMemberOverview('a@example.test',space,now);expect(member).toMatchObject({customers:1,published:1,waiting:1,reviewDue:1,lastReview:{text:'验证简洁开头',customer:'业务一'}});expect(member.lastRecorded).toBe('2026-10-09T12:00:00.000Z');expect(JSON.stringify(member)).not.toContain('客户隐私');expect(JSON.stringify(member)).not.toContain('过期记忆');
  space.acquisition.publications[0].commentReview={url:'https://example.com/1',publishedAt:'2026-10-08T11:00:00Z',checkedAt:'2026-10-09T11:00:00Z'};
  expect(teamMemberOverview('a',space,now).reviewDue).toBe(0);
 });
 it('团队概况不把已回复的旧标记重新计为待回复',()=>{
  const a={id:'a',customerId:'c',needsReply:true,messages:[{id:'i',direction:'inbound',receivedAt:'2026-01-01'},{id:'o',status:'sent_manual',replyTo:'i',sentAt:'2026-01-02'}]};
  const space={customers:[{id:'c'}],acquisition:{leads:[a]}};expect(teamMemberOverview('a',space,now).waiting).toBe(0);
  a.messages.push({id:'other',direction:'inbound',accountId:'other',receivedAt:'2026-01-03'});expect(teamMemberOverview('a',space,now).waiting).toBe(1);
 });
});
