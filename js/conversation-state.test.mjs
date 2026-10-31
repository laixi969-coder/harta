import {describe,it,expect} from 'vitest';
import {leadNeedsReply} from './conversation-state.js';

describe('联系人待回复状态',()=>{
 it('有消息记录时按每个账号、渠道和需求的最新会话判断，忽略过期标记',()=>{
  const messages=[{id:'old',direction:'inbound',accountId:'a',channel:'私信',receivedAt:'2026-01-01'},
   {id:'new',direction:'inbound',accountId:'a',channel:'私信',receivedAt:'2026-01-02'},
   {id:'sent',direction:'outbound',status:'sent_manual',replyTo:'new',sentAt:'2026-01-03'}];
  expect(leadNeedsReply({needsReply:true,messages})).toBe(false);
  messages.push({id:'other',direction:'inbound',accountId:'b',channel:'私信',receivedAt:'2026-01-02'});
  expect(leadNeedsReply({needsReply:false,messages})).toBe(true);
 });
 it('没有来信记录的旧数据保留待回复标记，草稿不能视为回复',()=>{
  expect(leadNeedsReply({needsReply:true,messages:[]})).toBe(true);
  expect(leadNeedsReply({needsReply:false,messages:[{id:'x',direction:'inbound'},{status:'copied',replyTo:'x'}]})).toBe(true);
 });
});
