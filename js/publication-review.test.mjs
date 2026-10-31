import { describe, it, expect } from 'vitest';
import { pendingPublicationReviews, publicationReviewCurrent } from './publication-review.js';
import { nextAction } from './journey.js';
const now=Date.parse('2026-10-10T12:00:00Z');
const pub={id:'p1',customerId:'c1',status:'published',platform:'抖音',accountId:'a1',url:'https://www.douyin.com/video/1',publishedAt:'2026-10-08T11:00:00Z',content:{title:'作品'}};
describe('发布后回看提醒',()=>{
 it('仅提醒本业务真实发布且满48小时的作品，不把其他作品的回看当作已回看',()=>{
  const acquisition={publications:[pub,{...pub,id:'other',customerId:'c2'},{...pub,id:'recent',publishedAt:'2026-10-08T13:00:00Z'},{...pub,id:'pending',status:'pending_confirmation'},{...pub,id:'demo',demo:true}]};
  expect(pendingPublicationReviews(acquisition,'c1',now).map(p=>p.id)).toEqual(['p1']);
  expect(nextAction({id:'c1'},acquisition).action).toBe('open-publication-review');
 });
 it('更改链接、发布时间或账号后需要重新核对',()=>{
  const reviewed={...pub,commentReview:{url:pub.url,publishedAt:pub.publishedAt,accountId:pub.accountId,checkedAt:'2026-10-09T12:00:00Z'}};
  expect(publicationReviewCurrent(reviewed)).toBe(true);expect(pendingPublicationReviews({publications:[reviewed]},'c1',now)).toEqual([]);
  for(const changed of [{url:'https://www.douyin.com/video/2'},{publishedAt:'2026-10-07T11:00:00Z'},{accountId:'a2'}])expect(publicationReviewCurrent({...reviewed,...changed})).toBe(false);
 });
});
