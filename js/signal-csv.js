import { csvRows } from './csv.js';
const aliases={
 platform:['平台','来源平台','platform'], text:['需求原文','评论原文','评论内容','内容','text','body'], url:['原始链接','作品链接','链接','url'],
 authorName:['昵称','作者昵称','authorName','author'], authorId:['用户ID','作者ID','authorId','user_id'], recordId:['评论ID','内容ID','recordId','comment_id'],
 publishedAt:['发表时间','评论时间','publishedAt','created_at'], ipRegion:['IP属地','属地','ipRegion'], isAuthorReply:['作者回复','isAuthorReply'],
};
const platformNames={'小红书':'小红书','抖音':'抖音','视频号':'视频号','B站':'B站','知乎':'知乎','其他':'其他','xhs':'小红书','xiaohongshu':'小红书','douyin':'抖音'};
export function previewSignalCsv(text,defaultPlatform) {
  const rows=csvRows(text);if(rows.length<2||rows.length>101)throw new Error('CSV 需包含表头和 1 至 100 条需求');
  const headers=rows.shift().map(v=>v.trim()),index={};for(const [key,names] of Object.entries(aliases)){const matched=headers.map((h,i)=>names.includes(h)?i:-1).filter(i=>i>=0);if(matched.length>1)throw new Error(`表头“${names[0]}”重复`);if(matched.length)index[key]=matched[0];}
  if(index.text==null||index.url==null)throw new Error('CSV 必须包含“需求原文”和“原始链接”');
  return rows.map((cells,i)=>{
    const errors=[],get=key=>(cells[index[key]]||'').trim();if(cells.length!==headers.length)errors.push('列数与表头不一致');
    const platformRaw=get('platform')||defaultPlatform,platform=platformNames[platformRaw]||platformNames[String(platformRaw).toLowerCase()];if(!platform)errors.push('平台不受支持');
    const text=get('text'),url=get('url');if(!text||text.length>6000)errors.push('需求原文需为 1 至 6000 字');
    try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||url.length>2000)throw Error();}catch{errors.push('原始链接无效');}
    const authorName=get('authorName'),authorId=get('authorId'),recordId=get('recordId'),publishedAt=get('publishedAt'),ipRegion=get('ipRegion');
    if(authorName.length>100||authorId.length>200||recordId.length>200||ipRegion.length>100)errors.push('身份或属地字段过长');
    const day=publishedAt.slice(0,10),dateCheck=day && new Date(`${day}T00:00:00Z`),validDay=dateCheck && Number.isFinite(dateCheck.getTime()) && dateCheck.toISOString().slice(0,10)===day;
    if(publishedAt && (!validDay || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(publishedAt)||!Number.isFinite(Date.parse(publishedAt))||Date.parse(publishedAt)>Date.now()+60000))errors.push('发表时间需为带时区的 ISO 时间，未知请留空');
    const rawReply=get('isAuthorReply').toLowerCase();if(rawReply&&!['是','否','true','false','1','0'].includes(rawReply))errors.push('作者回复请填写是/否或 true/false');
    return {line:i+2,row:{platform,text,url,authorName,authorId,recordId,publishedAt,ipRegion,isAuthorReply:['是','true','1'].includes(rawReply)},errors};
  });
}
