import { it, expect } from 'vitest';
import { demandLanguage, demandTime, demandKeywords, topicRelevant } from './demand-rules.js';
import { demandEvidence } from './discovery.js';
const now=Date.parse('2026-10-17T12:00:00Z');
it('recognizes provider selection and colloquial prices without treating replies or resolved needs as prospects',()=>{
  for(const text of ['急急急！狗狗尿血看哪个好啊！！','重庆猫咪绝育有推荐吗','礼貌问价','300块吗？','怎么预约','我家有只猫，想做绝育，怎么预约','你约的哪家呀？我下周也要带我家宝宝去绝育。']) {
    expect(demandLanguage(text).demand).toBeTruthy();
    expect(demandEvidence({text,publishedAt:new Date(now-60000).toISOString()},now).recent).toBe(true);
  }
  for(const text of ['已经找到医院了，多少钱','私我报价','有的亲，发给你链接','感谢推荐','有没有人觉得可爱']) expect(demandEvidence({text,publishedAt:new Date(now).toISOString()},now).recent).toBe(false);
});
it('uses an exact seven-day window and never substitutes collection time for an absent or future publication date',()=>{
  expect(demandTime(new Date(now-7*86400000).toISOString(),now).recent).toBe(true);
  for(const date of ['',new Date(now+1).toISOString(),new Date(now-7*86400000-1).toISOString()]) expect(demandTime(date,now).recent).toBe(false);
});
it('keeps veterinary service searches distinct from unrelated adoption posts and uses the selected business city',()=>{
  expect(topicRelevant('重庆已绝育蓝猫无偿领养','重庆猫咪绝育')).toBe(false);
  expect(topicRelevant('南岸母猫绝育有医院推荐吗','重庆猫咪绝育')).toBe(true);
  expect(topicRelevant('无偿领养','重庆猫咪领养')).toBe(true);
  expect(demandKeywords({city:'重庆',hunt:'宠物医院'})).toContain('重庆 猫咪绝育 多少钱');
  expect(demandKeywords({city:'杭州',hunt:'家装'}).every(k=>k.startsWith('杭州'))).toBe(true);
});
