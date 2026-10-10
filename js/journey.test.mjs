import { describe, it, expect } from 'vitest';
import { nextAction } from './journey.js';
describe('获客工作台下一步',()=>{
 const c={id:'a',drops:[]};
 it('新业务不要求先配置产品或智能体',()=>expect(nextAction(c).action).toBe('go-content-home'));
 it('先回复当前业务，忽略其他业务和禁止联系的人',()=>{
  const acquisition={leads:[{id:'other',customerId:'b',needsReply:true},{id:'blocked',customerId:'a',needsReply:true,doNotContact:true},{id:'real',customerId:'a',needsReply:true}],signals:[{customerId:'a',status:'pending'}]};
  expect(nextAction(c,acquisition)).toMatchObject({action:'open-contact',id:'real'});
 });
 it('只提醒未结束且已到期的购买需求',()=>{
  const acquisition={leads:[{id:'l',customerId:'a'}],opportunities:[{id:'closed',leadId:'l',customerId:'a',stage:'已成交',nextAt:'2000-01-01'},{id:'due',leadId:'l',customerId:'a',stage:'比较中',nextAt:'2001-01-01'}]};
  expect(nextAction(c,acquisition).id).toBe('due');
 });
 it('资料变化优先于发布，视频作者回复不成为待核实买家',()=>{
  expect(nextAction({...c,drops:[{id:'p',productReview:{required:true}}]}).action).toBe('open-pack');
  expect(nextAction(c,{signals:[{customerId:'a',status:'pending',isAuthorReply:true}]}).action).toBe('go-content-home');
 });
});
