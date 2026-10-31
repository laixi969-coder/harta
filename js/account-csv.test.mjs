import { describe,it,expect } from 'vitest';
import { previewAccountCsv } from './account-csv.js';
import { priorPublicationOutcome } from './account-csv-carry.js';
it('公众号文章按完整链接匹配阅读量，不猜测其他文章',()=>{
 const pubs=[{id:'wx1',customerId:'c',platform:'公众号',status:'published',url:'https://mp.weixin.qq.com/s/example?mid=1',content:{title:'文章'},accountName:'公众号'}];
 const [row]=previewAccountCsv('平台,作品链接,阅读量\n公众号,https://mp.weixin.qq.com/s/example?mid=1,100',pubs,'c');expect(row).toMatchObject({publicationId:'wx1',metrics:{views:100},errors:[]});
 expect(previewAccountCsv('平台,作品链接,阅读量\n公众号,https://mp.weixin.qq.com/s/example?mid=2,100',pubs,'c')[0].errors).toContain('没有匹配的已登记发布作品');
 const channels=[{id:'ch1',customerId:'c',platform:'视频号',status:'published',url:'https://example.com/channels/one',content:{title:'视频'},accountName:'视频号'}];expect(previewAccountCsv('平台,作品链接,播放量\n视频号,https://example.com/channels/one,30',channels,'c')[0]).toMatchObject({publicationId:'ch1',metrics:{views:30},errors:[]});
});
const publications=[{id:'p1',customerId:'c',status:'published',origin:'manual_external',platform:'抖音',url:'https://www.douyin.com/video/123456?share=x',content:{title:'作品，一'},accountName:'账号',metadataVersion:2}];
describe('账号效果 CSV 预览',()=>{
 it('按平台和作品链接匹配，正确读取引号、零和百分数',()=>{
  const [r]=previewAccountCsv('\ufeff平台,作品链接,播放量,完播率,点赞\r\n抖音,"https://www.douyin.com/video/123456?other=1",0,18.5%,2',publications,'c');
  expect(r).toMatchObject({publicationId:'p1',version:2,title:'作品，一',metrics:{views:0,completionRate:18.5,likes:2},errors:[]});
 });
 it('未知作品、重复作品、无效数字均显示错误',()=>{
  const text='平台,作品链接,播放量,完播率\n抖音,https://www.douyin.com/video/123456,10,120%\n抖音,https://www.douyin.com/video/123456,10,20%\n小红书,https://example.com/no,3,20%';
  const rows=previewAccountCsv(text,publications,'c');expect(rows[0].errors.join()).toContain('完播率');expect(rows[1].errors.join()).toContain('重复');expect(rows[2].errors.join()).toContain('没有匹配');
  expect(previewAccountCsv('平台,作品链接,播放量\n抖音,https://www.douyin.com/video/123456,3',publications,'other')[0].errors.join()).toContain('没有匹配');
 });
 it('分别解析咨询次数和已去重有效线索，零不当作缺失',()=>{
  const [r]=previewAccountCsv('平台,作品链接,播放量,咨询次数,有效线索\n抖音,https://www.douyin.com/video/123456,100,4,0',publications,'c');
  expect(r.errors).toEqual([]);expect(r.metrics).toEqual({views:100,inquiries:4,qualifiedLeads:0});
  expect(previewAccountCsv('平台,作品链接,有效线索\n抖音,https://www.douyin.com/video/123456,1.5',publications,'c')[0].errors.join()).toContain('有效客资');
 });
 it('可匹配 Harta 内的已发布作品，保留预览时的账号与版本',()=>{
  const generated={id:'g',customerId:'c',status:'published',platform:'小红书',url:'https://www.xiaohongshu.com/explore/abc123',accountId:'a',revision:'rev',content:{title:'生成作品'}};
  const [r]=previewAccountCsv('平台,作品链接,播放量\n小红书,https://www.xiaohongshu.com/explore/abc123?x=1,50',[...publications,generated],'c');
  expect(r).toMatchObject({publicationId:'g',accountId:'a',revision:'rev',metrics:{views:50},errors:[]});
 });
 it('小红书主页中的作品链接可匹配已登记的笔记',()=>{
  const image={id:'xhs',customerId:'c',status:'published',origin:'manual_external',platform:'小红书',url:'https://www.xiaohongshu.com/explore/abc123?share=one',content:{title:'图文'},metadataVersion:1};
  expect(previewAccountCsv('平台,作品链接,阅读量\n小红书,https://www.xiaohongshu.com/user/profile/user123/abc123?share=two,100',[image],'c')[0]).toMatchObject({publicationId:'xhs',metrics:{views:100},errors:[]});
 });
 it('抖音图文的不同分享参数匹配同一已登记作品',()=>{
  const image={id:'image',customerId:'c',status:'published',origin:'manual_external',platform:'抖音',url:'https://www.douyin.com/note/123456?share=one',content:{title:'图文'},accountName:'账号',metadataVersion:1};
  expect(previewAccountCsv('平台,作品链接,阅读量\n抖音,https://www.douyin.com/note/123456?share=two,100',[image],'c')[0]).toMatchObject({publicationId:'image',metrics:{views:100},errors:[]});
 });
 it('拒绝有歧义的表头和破损文件',()=>{
  expect(()=>previewAccountCsv('平台,作品链接,播放量,views\n抖音,x,1,2',publications,'c')).toThrow('重复');
  expect(()=>previewAccountCsv('平台,作品链接,播放量\n抖音,"bad,1',publications,'c')).toThrow('引号');
 });
 it('示例发布记录不参与匹配，也不会令真实作品匹配产生歧义',()=>{
  const csv='平台,作品链接,播放量\n抖音,https://www.douyin.com/video/123456,3';
  for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}]){
   const example={...publications[0],id:'example',...marker};
   expect(previewAccountCsv(csv,[example],'c')[0].errors.join()).toContain('没有匹配');
   expect(previewAccountCsv(csv,[example,...publications],'c')[0]).toMatchObject({publicationId:'p1',errors:[]});
  }
 });
 it('沿用旧效果时跳过示例快照和示例作品',()=>{
  const pub={...publications[0],accountId:'a'},row={publicationId:'p1',accountId:'a',publicationVersion:2,start:'2026-01-01',end:'2026-01-07',metrics:{views:10}};
  for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}]){
   const c={accountReviewOutcomes:[{...row,...marker},row]};expect(priorPublicationOutcome(c,pub,row.start,row.end)).toEqual(row);
   expect(priorPublicationOutcome(c,{...pub,...marker},row.start,row.end)).toBeNull();
  }
 });
});
