import { describe, expect, it } from 'vitest';
import { publicationChecks } from './publication-check.js';

describe('publicationChecks', () => {
  it('flags offsite contact only for Xiaohongshu', () => {
    const content = { title: '选购指南', body: '详情请加微信' };
    expect(publicationChecks('小红书', content).some(x => x.includes('站外'))).toBe(true);
    expect(publicationChecks('视频号', content).some(x => x.includes('站外'))).toBe(false);
  });
  it('checks cover, opening and closing independently of the title', () => {
    for (const field of ['cover','hook','cta']) expect(publicationChecks('小红书',{title:'标题',body:'正文',[field]:'加微信咨询'}).some(x=>x.includes('站外'))).toBe(true);
    expect(publicationChecks('抖音',{body:'具体正文',hook:'大家好，我是小王'}).some(x=>x.includes('开头'))).toBe(true);
  });
  it('checks the actual opening and handles missing content', () => {
    expect(publicationChecks('抖音', { body: '大家好，我是小王' }).some(x => x.includes('开头'))).toBe(true);
    expect(publicationChecks('抖音', {}).some(x => x.includes('正文为空'))).toBe(true);
    expect(publicationChecks('抖音', { body: '先看清楚尺寸，再决定买哪一种。' })).toEqual([]);
  });
});
