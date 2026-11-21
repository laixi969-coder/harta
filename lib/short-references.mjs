import {randomUUID} from 'node:crypto';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {readResearchConfig,queryWeb,querySearxng} from './research.mjs';
import {shortTechnique,shortVideoLink} from '../js/practical-shorts.js';
import {isRealEvidence} from '../js/evidence-kind.js';

const heavy=/motion.?control rig|3d render|full cgi|after effects composit|stunt crew|drone swarm|wire harness|无人机编队|大型布景|重特效|特技团队|多人群演|吊威亚/i;
export async function searchShortReferences(id,{config=readResearchConfig(),fetcher=fetch}={}){
  const technique=shortTechnique(id);if(!technique)throw Error('请选择拍法');
  const query=technique.query+' (site:youtube.com/shorts OR site:tiktok.com OR site:instagram.com/reel)';
  if(!config.searxngUrl&&!config.searchKey)return {rows:[],notice:'可直接到平台找原片，或在研究数据源配置 SearXNG 或 Brave 搜索。'};
  let results,partial=false;
  try{
    if(config.searxngUrl){const result=await querySearxng(query,config.searxngUrl,fetcher,{limit:20,language:'en',timeRange:'',diagnostics:true});results=result.rows;partial=result.unresponsiveCount>0;}
    else results=await queryWeb(query,config.searchKey,fetcher,{limit:20,freshness:''});
  }catch{return {rows:[],notice:'搜索服务暂不可用，可以打开平台搜索或粘贴原片链接。'};}
  const rows=[],seen=new Set();
  for(const r of results){
    const link=shortVideoLink(r.url),text=[r.title,r.excerpt].join(' ');
    if(!link||seen.has(link.url)||heavy.test(text)||!technique.match.test(text))continue;
    if(link.url.includes('instagram.com/p/')&&!/\b(reel|video)\b|视频/i.test(text))continue;
    seen.add(link.url);rows.push({...link,title:r.title,excerpt:r.excerpt});if(rows.length>=8)break;
  }
  return {rows,notice:partial?'部分搜索引擎没有响应，可继续到平台找原片。':rows.length?'':'本次没有找到匹配拍法的原片链接，可以到平台继续找。'};
}

export function saveShortReference(email,input){
  const t=shortTechnique(input.technique),link=shortVideoLink(input.url),title=String(input.title||'').trim(),action=String(input.observedAction||'').trim(),setup=String(input.shortSetup||'').trim();
  if(!t||!link)throw Error('请选择拍法并填写 TikTok 视频、Instagram 帖子或 YouTube Shorts 的原片链接');
  if(!title||title.length>200||action.length<3||action.length>600||setup.length<3||setup.length>400||input.watched!==true)throw Error('请填写标题、看过的关键动作和本业务的简拍条件，并确认已观看原片');
  const space=readWorkspace(email),customer=space.customers.find(c=>c.id===input.customerId);
  if(!customer)throw Error('找不到当前业务');
  space.acquisition||={};const works=space.acquisition.works||=[];
  let work=works.find(w=>isRealEvidence(w)&&w.customerId===customer.id&&shortVideoLink(w.url)?.url===link.url);
  if(!work){
    work={id:randomUUID(),customerId:customer.id,...link,title,description:action,type:'video',source:'manual_verified_short',importedAt:new Date().toISOString(),tags:[]};
    works.push(work);
  }
  work.shortTechnique=t.id;work.observedAction=action;work.shortSetup=setup;
  return {workspace:writeWorkspace(email,space),workId:work.id};
}
