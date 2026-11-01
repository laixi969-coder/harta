import { isRealEvidence } from './evidence-kind.js';
// Local relevance hints from user-provided business text and already collected works.
// These are lexical matches, not a platform popularity score or a lead forecast.
const STOP=new Set(['什么','怎么','如何','我们','用户','客户','内容','需要','服务','业务','平台','可以','进行','自己','产品','相关','一个','他们','他们的']);
function keywords(customer) {
  const f=customer?.creatorProfile?.fields || {};
  const text=[customer?.hunt,customer?.pitch,f.identity,f.audience,f.direction].filter(v=>typeof v==='string').join(' ').slice(0,12000).toLocaleLowerCase('zh-CN');
  const tokens=typeof Intl.Segmenter==='function' ? [...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(text)].filter(s=>s.isWordLike).map(s=>s.segment) : text.split(/[\s，。！？；：、,.!?;:()（）]+/);
  return [...new Set(tokens.map(t=>t.trim()).filter(t=>t.length>=2 && t.length<=20 && !STOP.has(t) && !/^\d+$/.test(t)))].slice(0,40);
}
export function creatorRadar(customer, works = [], {limit=8,platform='all'} = {}) {
  const terms=keywords(customer);
  const all=works.filter(w=>isRealEvidence(w) && w.customerId===customer?.id && ['小红书','抖音','公众号','TikTok'].includes(w.platform) && typeof w.id==='string');
  const input=platform==='all'?all:all.filter(w=>w.platform===platform);
  const recent=[...input].sort((a,b)=>(Date.parse(b.importedAt||b.createdAt)||0)-(Date.parse(a.importedAt||a.createdAt)||0)).slice(0,500);
  const decisions=customer?.radarDecisions || {}, recentIds=new Set(recent.map(w=>w.id));
  const saved=input.filter(w=>!recentIds.has(w.id) && ['now','next','parked'].includes(decisions[w.id]?.action));
  const ranked=[...saved,...recent].map(work=>{const blob=[work.title,work.description,...(Array.isArray(work.tags)?work.tags:[])].filter(x=>typeof x==='string').join(' ').slice(0,5000).toLocaleLowerCase('zh-CN');return {work,hits:terms.filter(t=>blob.includes(t)),action:decisions[work.id]?.action || 'reset'};}).filter(r=>r.action!=='discard' && (r.hits.length || ['manual_paste','douyin_official'].includes(r.work.source) || ['now','next','parked'].includes(r.action)));
  const priority={now:0,next:1,parked:2,reset:3};ranked.sort((a,b)=>(priority[a.action] ?? 3)-(priority[b.action] ?? 3) || b.hits.length-a.hits.length);
  const discarded=input.filter(w=>decisions[w.id]?.action==='discard');
  const collected=ranked.filter(r=>r.action!=='reset'), candidates=ranked.filter(r=>r.action==='reset'), visible=Math.max(0,Math.min(20,limit));
  return {items:[...collected,...candidates.slice(0,visible)],moreCandidates:candidates.slice(visible),discarded,nowCount:all.filter(w=>decisions[w.id]?.action==='now').length,sampleSize:recent.length,hasProfile:terms.length>0,truncated:input.length>recent.length};
}
