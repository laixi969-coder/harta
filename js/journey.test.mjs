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
 it('提醒到期的已选内容，排除未来、暂停及已发布内容',()=>{
  const customer={id:'a',drops:[{id:'p',tier:'今日',shells:{小红书:[{title:'计划标题',body:'正文'}]}}]},now=new Date(2026,9,31,12);
  const states={'p::小红书|0|title':{status:'selected',plannedAt:'2026-10-31'}};
  expect(nextAction(customer,{},states,now)).toMatchObject({title:'计划待发布：计划标题',action:'open-pack',id:'p'});
  for(const [status,date] of [['selected','2026-11-01'],['paused','2026-10-30'],['published','2026-10-30']]) {
   states['p::小红书|0|title']={status,plannedAt:date};expect(nextAction(customer,{},states,now).action).toBe('go-content-home');
  }
 });
 it('到时直播提醒核实和复盘，已复盘或未来直播不提醒',()=>{
  const customer={id:'a',drops:[{id:'p',productionDrafts:{'抖音|0|live':{live:true,fields:{title:'直播场次',liveSchedule:'2026-10-31T11:00'}}}}]},now=new Date(2026,9,31,12),fields=customer.drops[0].productionDrafts['抖音|0|live'].fields;
  expect(nextAction(customer,{}, {},now)).toMatchObject({title:'直播计划已到：直播场次',action:'open-live',id:JSON.stringify(['p','抖音',0])});
  fields.liveReview='已复盘';expect(nextAction(customer,{}, {},now).action).toBe('go-content-home');
  fields.liveReview='';fields.liveSchedule='2026-10-31T13:00';expect(nextAction(customer,{}, {},now).action).toBe('go-content-home');
 });
});
