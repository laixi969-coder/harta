import { describe,it,expect } from 'vitest';
import { calendarWeek,calendarMonth,calendarWeekOffset,pastPlannedPosts,calendarItems,weeklyCalendarCoverage,weeklyJobSuggestion } from './content-calendar.js';
const c={drops:[{id:'p',tier:'今日',shells:{小红书:[{title:'标题',body:'正文',cover:'封面'}]},productionDrafts:{'抖音|0':{live:true,version:2,fields:{title:'直播',liveSchedule:'2026-10-30T19:00',liveReview:'复盘'}}}}]};
describe('内容与直播排期',()=>{
 it('周从本地周一开始并跨月和跨年',()=>{expect(calendarWeek(new Date(2027,0,1))).toEqual(['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);expect(calendarWeek(new Date(2027,0,1),1)[0]).toBe('2027-01-04');});
 it('月视图覆盖闰年、跨年和夏令时周跳转',()=>{const feb=calendarMonth(new Date(2024,0,31),1);expect(feb).toMatchObject({year:2024,month:2});expect(feb.days.slice(0,4)).toEqual([null,null,null,'2024-02-01']);expect(feb.days.at(-1)).toBe('2024-02-29');expect(calendarMonth(new Date(2026,11,31),1)).toMatchObject({year:2027,month:1});expect(calendarWeekOffset('2026-03-16',new Date(2026,2,8))).toBe(2);expect(calendarWeekOffset('2026-02-30',new Date())).toBeNull();});
 it('过去的计划只提醒核对，不把已发布、暂不用、直播和无效日期当未发布',()=>{const rows=[{kind:'post',status:'selected',date:'2026-10-29'},{kind:'post',status:'pending',date:'2026-10-27'},{kind:'post',status:'published',date:'2026-10-29'},{kind:'post',status:'paused',date:'2026-10-29'},{kind:'live',date:'2026-10-29'},{kind:'post',status:'selected',date:'2026-02-30'},{kind:'post',status:'selected',date:'2026-10-30'}];expect(pastPlannedPosts(rows,new Date(2026,9,30)).map(x=>x.date)).toEqual(['2026-10-29','2026-10-27']);});
 it('展示直播和不同字段的独立日期及状态，不合并为整篇',()=>{const states={'p::小红书|0|title':{status:'selected',plannedAt:'2026-10-30'},'p::小红书|0|body':{status:'published',plannedAt:'2026-10-29'}};const {items,candidates}=calendarItems(c,states);expect(items).toHaveLength(3);expect(items.find(x=>x.kind==='live')).toMatchObject({date:'2026-10-30',version:2,review:true});expect(items.find(x=>x.status==='published')).toMatchObject({partial:true,date:'2026-10-29'});expect(candidates).toHaveLength(1);expect(candidates[0].keys).toEqual(['p::小红书|0|cover']);});
 it('分开保存的直播草稿仍能显示和调整',()=>{const copy=structuredClone(c);copy.drops[0].productionDrafts={'抖音|0|live':copy.drops[0].productionDrafts['抖音|0']};expect(calendarItems(copy).items[0]).toMatchObject({kind:'live',platform:'抖音',index:0,version:2});});
 it('周视图按作品去重并显示平台、真实标注形式和目标，不把未标注当成图文',()=>{
  const customer={drops:[{id:'p',tier:'今日',origin:{format:'image',goal:'reach_leads'},shells:{小红书:[{title:'标题',body:'正文'}]},productionDrafts:{'小红书|0|live':{live:true,version:1,fields:{title:'直播',liveSchedule:'2026-10-30T19:00'}}}},{id:'q',tier:'今日',origin:{},shells:{抖音:[{title:'无形式',body:'正文'}]}}]};
  const states={'p::小红书|0|title':{status:'selected',plannedAt:'2026-10-29'},'p::小红书|0|body':{status:'selected',plannedAt:'2026-10-30'},'q::抖音|0|title':{status:'selected',plannedAt:'2026-10-30'},'q::抖音|0|body':{status:'paused',plannedAt:'2026-10-30'}};
  const days=calendarWeek(new Date(2026,9,30)),coverage=weeklyCalendarCoverage(calendarItems(customer,states).items,days),xhs=coverage.find(r=>r.platform==='小红书'),douyin=coverage.find(r=>r.platform==='抖音');
  expect(xhs).toMatchObject({image:1,video:0,live:1,unknown:0,goals:{reach_leads:2}});expect(douyin).toMatchObject({image:0,video:0,live:0,unknown:1,goals:{unknown:1}});
  expect(weeklyCalendarCoverage(calendarItems(customer,states).items,calendarWeek(new Date(2026,10,6))).find(r=>r.platform==='小红书').image).toBe(0);
 });
 it('仅以当前版本的制作稿识别未指定形式，旧稿不推断',()=>{
  const customer={drops:[{id:'p',tier:'今日',origin:{},shells:{抖音:[{title:'标题',body:'正文'}]},productionDrafts:{'抖音|0':{format:'video',sourceContent:{title:'标题',body:'正文'},fields:{}}}}]};
  expect(calendarItems(customer).candidates[0].format).toBe('video');customer.drops[0].productionDrafts['抖音|0'].sourceContent.body='过期正文';expect(calendarItems(customer).candidates[0].format).toBe('');
 });
 it('只列出当前业务的内容及已排直播',()=>{expect(calendarItems({drops:[]}).items).toEqual([]);expect(calendarItems(c).items.map(x=>x.kind)).toEqual(['live']);});
 it('示例作品和直播不进入真实排期或待安排列表',()=>{
  for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}]){
   const example={...structuredClone(c.drops[0]),...marker,id:'example'};
   const result=calendarItems({drops:[example,structuredClone(c.drops[0])]});
   expect(result.items.every(item=>item.packId==='p')).toBe(true);
   expect(result.candidates.every(item=>item.packId==='p')).toBe(true);
   expect(result.items).toHaveLength(1);
  }
 });
});
it('周分布只统计已采用且内容未变化的作品任务，直播按独立草稿统计',()=>{
 const customer={drops:[{id:'p',tier:'今日',origin:{},shells:{小红书:[{title:'标题',body:'正文'}]},appliedContentJobs:{'小红书|0':{job:'divert',contentSnapshot:{title:'标题',body:'正文'}}},productionDrafts:{'小红书|0':{job:'divert',sourceContent:{title:'标题',body:'正文'},fields:{}},'小红书|0|live':{live:true,job:'lead',fields:{liveSchedule:'2026-10-30T19:00'}}}}]};
 const states={'p::小红书|0|title':{status:'selected',plannedAt:'2026-10-30'},'p::小红书|0|body':{status:'selected',plannedAt:'2026-10-30'}},days=calendarWeek(new Date(2026,9,30));let result=weeklyCalendarCoverage(calendarItems(customer,states).items,days)[0];expect(result.jobs).toMatchObject({divert:1,lead:1,unknown:0});
 states['p::小红书|0|title'].status='published';states['p::小红书|0|body'].status='published';expect(calendarItems(customer,states).items.find(item=>item.kind==='post').job).toBe('');states['p::小红书|0|title'].status='selected';states['p::小红书|0|body'].status='selected';
 customer.drops[0].shells.小红书[0].body='已修改';result=weeklyCalendarCoverage(calendarItems(customer,states).items,days)[0];expect(result.jobs).toMatchObject({divert:0,lead:1,unknown:1});
});
it('排期建议区分未标注和已标注任务，不将缺失数据当作零',()=>{
 expect(weeklyJobSuggestion([{jobs:{unknown:2}}])).toContain('还未标注');
 expect(weeklyJobSuggestion([{jobs:{traffic:1,unknown:2}}])).toContain('另有 2 条未标注');
 expect(weeklyJobSuggestion([{jobs:{traffic:1,unknown:2}}])).toContain('暂无获客、转化');
 expect(weeklyJobSuggestion([{jobs:{lead:1,convert:1}}])).toContain('包含获客和转化');
});
it('公众号长文在周排期按长文统计，不算视频或图文',()=>{
 const customer={drops:[{id:'article',tier:'今日',origin:{format:'article'},shells:{公众号:[{title:'文章',body:'正文'}]}}]},states={'article::公众号|0|title':{status:'selected',plannedAt:'2026-10-30'}},days=calendarWeek(new Date(2026,9,30));
 const row=weeklyCalendarCoverage(calendarItems(customer,states).items,days).find(r=>r.platform==='公众号');expect(row).toMatchObject({article:1,video:0,image:0});
});
