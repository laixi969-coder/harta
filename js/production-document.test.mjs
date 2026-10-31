import { describe,it,expect } from 'vitest';
import { productionDocument,missingProductionFields,productionIssues } from './production-workflow.js';
describe('制作稿交付',()=>{
 it('短视频保留开场、口播、分镜、收尾和封面要求',()=>{
  const doc=productionDocument({title:'标题',hook:'先问问题',script:'口播正文',shots:'三个镜头',cta:'收尾问题',cover:'封面',coverLayout:'暖色排版'},'video','抖音');
  for(const text of ['短视频','抖音','先问问题','口播正文','三个镜头','收尾问题','封面','暖色排版'])expect(doc).toContain(text);
 });
 it('图文保留逐页画面建议；直播保留排期、零值、咨询和复盘',()=>{
  const image=productionDocument({imagePlan:'第一页的画面',liveReview:'历史备注'},'image','小红书');expect(image).toContain('第一页的画面');expect(image).toContain('其他已填写制作字段\n\n直播复盘\n历史备注');
  const live=productionDocument({liveSchedule:'2026-01-01T19:00',liveAttendance:'0',liveInquiries:'5',liveReview:'回看备注'},'live');
  for(const text of ['直播时间\n2026-01-01T19:00','实际进场人数\n0','直播咨询人数（手工统计）\n5','直播复盘\n回看备注'])expect(live).toContain(text);
 });
 it('公众号长文按文章检查和下载，不虚构视频分镜',()=>{
  const fields={title:'厨房怎么选',script:'先核对使用需求。'},doc=productionDocument(fields,'article','公众号');
  expect(doc).toContain('公众号长文');expect(doc).toContain('先核对使用需求');expect(doc).not.toContain('视频开场');expect(missingProductionFields(fields,false,'article')).toEqual([]);expect(productionIssues(fields,false,'公众号',null,'article')).toEqual([]);
 });
});
