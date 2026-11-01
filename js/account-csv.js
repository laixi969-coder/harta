import { csvRows } from './csv.js';
import { publicationIdentity } from './publication-identity.js';
import { isRealEvidence } from './evidence-kind.js';

const columns = {
  platform:['平台','platform'], url:['作品链接','链接','url','link'],
  views:['播放量','阅读量','plays','play_count','play_cnt','views'],
  completionRate:['完播率','completionRate','completion_rate','finish_rate','finish_ratio'],
  likes:['点赞','点赞数','likes','like_count'], comments:['评论','评论数','comments','comment_count'],
  collects:['收藏','收藏数','collects','collect_count'], shares:['分享','分享数','shares','share_count'],
  inquiries:['咨询次数','咨询数','inquiries'], qualifiedLeads:['有效客资','有效线索','有效线索数','qualifiedLeads','qualified_leads'],
};
export function previewAccountCsv(text,publications,customerId) {
  const rows=csvRows(text);if(rows.length<2 || rows.length>101)throw new Error('CSV 需包含表头和 1 至 100 条作品');
  const headers=rows.shift().map(h=>h.trim()), index={};
  for(const [key,aliases] of Object.entries(columns)){const found=headers.map((h,i)=>aliases.includes(h)?i:-1).filter(i=>i>=0);if(found.length>1)throw new Error(`表头“${aliases[0]}”重复`);if(found.length)index[key]=found[0];}
  if(index.platform==null || index.url==null)throw new Error('CSV 需要“平台”和“作品链接”两列表头');
  if(!Object.keys(index).some(k=>!['platform','url'].includes(k)))throw new Error('CSV 至少需要一列效果指标');
  const seen=new Set();
  return rows.map((row,i)=>{
    const errors=[];if(row.length!==headers.length)errors.push('列数与表头不一致');
    const get=k=>(row[index[k]]||'').trim(),rawPlatform=get('platform').toLowerCase(),platform=({douyin:'抖音','抖音':'抖音',xhs:'小红书',xiaohongshu:'小红书','小红书':'小红书','视频号':'视频号',wechat_channels:'视频号',wechat_official_account:'公众号','公众号':'公众号',tiktok:'TikTok'})[rawPlatform];
    const url=get('url');if(!platform)errors.push('平台需为抖音、小红书、视频号、公众号或 TikTok');if(!/^https?:\/\//i.test(url))errors.push('作品链接无效');
    const identity=platform?publicationIdentity(platform,url):'',matches=publications.filter(p=>isRealEvidence(p)&&p.customerId===customerId&&p.status==='published'&&p.platform===platform&&publicationIdentity(platform,p.url)===identity);
    if(matches.length!==1)errors.push(matches.length?'链接匹配多条作品':'没有匹配的已登记发布作品');
    if(matches.length===1){if(seen.has(matches[0].id))errors.push('同一作品在文件中重复');seen.add(matches[0].id);}
    const metrics={};for(const key of Object.keys(columns).filter(k=>!['platform','url'].includes(k))){if(index[key]==null)continue;const raw=get(key);if(!raw)continue;const normalized=key==='completionRate'?raw.replace(/%$/,'').trim():raw;const valid=/^\d+(?:\.\d+)?$/.test(normalized),v=Number(normalized);if(!valid || !Number.isFinite(v) || (key==='completionRate'?v>100:!Number.isSafeInteger(v)||v>1e12)){errors.push(`${columns[key][0]}格式无效`);continue;}metrics[key]=v;}
    if(!Object.keys(metrics).length)errors.push('没有有效指标');
    const pub=matches[0];return {line:i+2,platform:platform||get('platform'),url,title:pub?.content?.title||'',accountName:pub?.accountName||'',publicationId:pub?.id||'',version:pub?.metadataVersion||1,revision:pub?.revision||'',accountId:pub?.accountId||'',metrics,errors};
  });
}
