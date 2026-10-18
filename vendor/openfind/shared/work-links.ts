import type { Platform } from './types.ts';
export const workLinkLimit = 10;
export function workLink(value: string) {
  const u = new URL(value);
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.port) throw new Error('链接格式不支持');
  const host=u.hostname.toLowerCase();
  const platform:Platform = ['xiaohongshu.com','www.xiaohongshu.com','xhslink.com','www.xhslink.com'].includes(host) ? 'xiaohongshu' : ['douyin.com','www.douyin.com','v.douyin.com','www.iesdouyin.com','iesdouyin.com'].includes(host) ? 'douyin' : (()=>{throw new Error('仅支持小红书与抖音作品链接');})();
  const short=['xhslink.com','www.xhslink.com','v.douyin.com'].includes(host);
  const id=platform==='xiaohongshu' ? u.pathname.match(/^\/(?:explore|discovery\/item)\/([a-fA-F0-9]{24})\/?$/)?.[1].toLowerCase() : u.pathname.match(/^\/(?:video|note|share\/video|share\/note)\/(\d{10,25})\/?$/)?.[1] || (u.pathname==='/' ? u.searchParams.get('modal_id')?.match(/^\d{10,25}$/)?.[0] : undefined);
  if (!id && !(short && /^\/(?:[A-Za-z0-9_-]+\/){0,2}[A-Za-z0-9_-]+\/?$/.test(u.pathname))) throw new Error('请粘贴作品链接，不是账号主页或搜索页');
  const params=new URLSearchParams();
  if(platform==='xiaohongshu') for(const key of ['xsec_token','xsec_source']) if(u.searchParams.get(key)) params.set(key,u.searchParams.get(key)!);
  const url=id ? `https://www.${platform==='xiaohongshu'?'xiaohongshu.com/explore/':'douyin.com/'+(u.pathname.includes('note/')?'note/':'video/')}${id}${params.size?'?'+params:''}` : `https://${host}${u.pathname}`;
  return {url,platform,id,key:id?platform+':'+id:url};
}
export function parseWorkLinks(text: string) {
  if(text.length>30000) throw new Error('粘贴内容过长，请减少链接');
  const matches=text.match(/https?:\/\/[^\s<>"'，。；、！？）)\]】]+/gi) || [];
  if(!matches.length) throw new Error('请粘贴小红书或抖音作品链接');
  if(matches.length>100) throw new Error('链接过多，单批最多10条');
  const unique=new Map<string,ReturnType<typeof workLink>>();
  for(const raw of matches) {
    const link=workLink(raw.replace(/[.,;!]+$/,'')), old=unique.get(link.key);
    if(!old || (!old.url.includes('xsec_token=')&&link.url.includes('xsec_token='))) unique.set(link.key,link);
  }
  const links=[...unique.values()];
  if(links.length>workLinkLimit) throw new Error('单批最多10条不同作品链接，请分批处理');
  if(new Set(links.map(link=>link.platform)).size!==1) throw new Error('每批请使用同一平台链接，小红书与抖音请分批处理');
  return {platform:links[0].platform,links:links.map(link=>link.url),duplicates:matches.length-links.length};
}
