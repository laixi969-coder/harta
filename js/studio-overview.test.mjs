import {it,expect} from 'vitest';
import {studioAcquisitionOverview} from './studio-overview.js';
import {localDay} from './content-calendar.js';
it('首页显示本周内容任务提示并提供排期入口',()=>{
 const customer={id:'c',drops:[{id:'p',tier:'今日',shells:{小红书:[{title:'主题',body:'正文'}]},productionDrafts:{'小红书|0|live':{live:true,job:'traffic',fields:{title:'直播',liveSchedule:localDay(new Date())+'T19:00'}}}}]};
 const html=studioAcquisitionOverview(customer,{},{});expect(html).toContain('本周内容安排');expect(html).toContain('暂无获客、转化任务');expect(html).toContain('data-cm="calendar-home"');
});
