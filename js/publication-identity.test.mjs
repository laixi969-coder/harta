import {describe,it,expect} from 'vitest';
import {publicationIdentity,matchingPublications} from './publication-identity.js';
describe('已发布作品与评论来源匹配',()=>{
 const work={id:'w',customerId:'c',platform:'小红书',url:'https://www.xiaohongshu.com/explore/abc123?xsec=1'},signal={workId:'w',customerId:'c',platform:'小红书',url:'https://www.xiaohongshu.com/discovery/item/abc123?comment_id=1'},pub={id:'p',customerId:'c',platform:'小红书',status:'published',url:'https://www.xiaohongshu.com/explore/abc123?xsec=2'};
 it('只提供同业务、平台、作品与评论链接一致的已发布候选',()=>{expect(matchingPublications(signal,[work],[pub])).toEqual([pub]);for(const changed of [{customerId:'other'},{platform:'抖音'},{status:'pending_confirmation'},{url:'https://www.xiaohongshu.com/explore/other'}])expect(matchingPublications(signal,[work],[{...pub,...changed}])).toEqual([]);expect(matchingPublications({...signal,url:'https://www.xiaohongshu.com/explore/other'},[work],[pub])).toEqual([]);expect(matchingPublications({...signal,workId:''},[work],[pub])).toEqual([]);});
 it('小红书作者主页中的作品链接与笔记详情匹配，但主页本身不当成作品',()=>{
  const profile='https://www.xiaohongshu.com/user/profile/user123/abc123?xsec_token=one';
  expect(publicationIdentity('小红书',profile)).toBe(publicationIdentity('小红书',work.url));
  expect(matchingPublications({...signal,url:profile},[work],[pub])).toEqual([pub]);
  expect(publicationIdentity('小红书','https://www.xiaohongshu.com/user/profile/user123?x=1')).not.toBe(publicationIdentity('小红书','https://www.xiaohongshu.com/user/profile/user123?x=2'));
  expect(publicationIdentity('小红书','https://xiaohongshu.com.evil.test/user/profile/user123/abc123?x=1')).not.toBe(publicationIdentity('小红书',work.url));
 });
 it('抖音图文 note 链接忽略分享参数并按作品 ID 匹配',()=>{
  const w={id:'d',customerId:'c',platform:'抖音',url:'https://www.douyin.com/note/123456?share=one'},s={workId:'d',customerId:'c',platform:'抖音',url:'https://www.douyin.com/note/123456?comment_id=abc'},p={id:'dp',customerId:'c',platform:'抖音',status:'published',url:'https://www.douyin.com/note/123456?share=two'};
  expect(matchingPublications(s,[w],[p])).toEqual([p]);expect(matchingPublications({...s,url:'https://www.douyin.com/note/654321'},[w],[p])).toEqual([]);
  expect(publicationIdentity('抖音',w.url)).toBe(publicationIdentity('抖音',p.url));
 });
 it('演示评论、作品或发布记录不会被当作关联候选',()=>{
  for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}]){
   expect(matchingPublications({...signal,...marker},[work],[pub])).toEqual([]);
   expect(matchingPublications(signal,[{...work,...marker}],[pub])).toEqual([]);
   expect(matchingPublications(signal,[work],[{...pub,...marker}])).toEqual([]);
  }
 });
 it('不会把非官方域名或未知查询页面按作品 ID 合并',()=>{expect(publicationIdentity('小红书','https://xiaohongshu.com.evil.test/explore/abc?x=1')).not.toBe(publicationIdentity('小红书','https://xiaohongshu.com.evil.test/explore/abc?x=2'));expect(publicationIdentity('抖音','https://www.douyin.com/user/123?modal_id=1')).not.toBe(publicationIdentity('抖音','https://www.douyin.com/user/123?modal_id=2'));});
});
