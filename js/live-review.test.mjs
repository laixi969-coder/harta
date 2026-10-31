import { describe,it,expect } from 'vitest';
import { liveReviewSummary,liveAttributionCounts } from './live-review.js';
describe('直播手工复盘',()=>{
 it('分别计算同口径留存和有效咨询占比',()=>{
  expect(liveReviewSummary({liveAttendance:'100',liveRetained:'40',liveInquiries:'5',liveQualifiedLeads:'2'})).toMatchObject({retention:'40.0%（40 / 100）',qualifiedShare:'40.0%（2 / 5）'});
 });
 it('未知、零和异常值不视为真实比例',()=>{
  expect(liveReviewSummary({liveAttendance:'0',liveRetained:'0'})).toMatchObject({retention:'分母为 0，无法计算',qualifiedShare:'未记录'});
  expect(liveReviewSummary({liveAttendance:'10',liveRetained:'11',liveInquiries:'4',liveQualifiedLeads:'5'})).toMatchObject({retention:'数据需核对',qualifiedShare:'数据需核对'});
  expect(liveReviewSummary({liveAttendance:'10',liveRetained:'',liveInquiries:'-1',liveQualifiedLeads:'0'})).toMatchObject({retention:'未记录',qualifiedShare:'未记录'});
 });
 it('按业务和场次统计真实来信与联系人，排除示例及其他场次',()=>{
  const first=JSON.stringify(['p1','小红书',0]),second=JSON.stringify(['p2','小红书',0]);
  const message=(id,extra={})=>({direction:'inbound',liveSource:{id},...extra});
  const leads=[{id:'l1',customerId:'c',authorName:'甲',messages:[message(first),message(first),message(second),message(first,{demo:true}),message(first,{direction:'outbound'})]},{id:'l2',customerId:'c',authorName:'乙',messages:[message(second)]},{id:'demo',customerId:'c',sourceType:'demo',messages:[message(first)]},{id:'foreign',customerId:'other',messages:[message(first)]}];
  expect(liveAttributionCounts(first,'c',leads)).toEqual({messages:2,contacts:1,linkedContacts:[{id:'l1',name:'甲'}]});
  expect(liveAttributionCounts(second,'c',leads)).toEqual({messages:2,contacts:2,linkedContacts:[{id:'l1',name:'甲'},{id:'l2',name:'乙'}]});
 });
});
