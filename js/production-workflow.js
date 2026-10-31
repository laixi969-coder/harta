import { standardHits, standardRuleChecks } from './creation-standards.js';
import { publicationChecks } from './publication-check.js';
import { deliveryIssues } from './platform-content.js';
import { referenceOverlaps } from './reference-overlap.js';
export const PRODUCTION_FIELDS = { script:'口播 / 正文', shots:'画面与分镜 / 图文逐页内容', imagePlan:'图文逐页画面建议（不直接出现在图片上）', title:'发布标题', cover:'封面文字', coverLayout:'封面排版', hook:'视频开场', cta:'视频收尾', liveOpen:'直播开场', liveSegments:'直播段落与证据', liveInteraction:'互动问题', liveOffer:'产品 / 承接', liveClose:'收口', liveSchedule:'直播时间', liveAttendance:'实际进场人数', liveRetained:'留存人数', liveInquiries:'直播咨询人数（手工统计）', liveQualifiedLeads:'有效咨询人数（手工统计）', liveReview:'直播复盘' };
// Shared by direct downloads and saved asset bundles so no production field is
// silently dropped when the user hands a draft to someone else.
export function productionDocument(fields={}, format='video', platform='') {
  const live=format==='live';
  const keys=live?['title','liveOpen','liveSegments','liveInteraction','liveOffer','liveClose','liveSchedule','liveAttendance','liveRetained','liveInquiries','liveQualifiedLeads','liveReview']:format==='article'?['title','script','cover','coverLayout']:['title','hook','script','shots','imagePlan','cta','cover','coverLayout'];
  const label=live?'直播':format==='article'?'公众号长文':format==='image'?'图文':'短视频';
  const extras=Object.keys(PRODUCTION_FIELDS).filter(key=>!keys.includes(key) && typeof fields[key]==='string' && fields[key].trim());
  const entry=key=>`${PRODUCTION_FIELDS[key]}\n${typeof fields[key]==='string' && fields[key].trim()?fields[key]:'（未填写）'}`;
  return [`制作类型：${label}`, ...(platform?[`平台：${platform}`]:[]), ...keys.map(entry), ...(extras.length?['其他已填写制作字段',...extras.map(entry)]:[])].join('\n\n');
}
// These are production inputs, not claims that the content or facts are valid.
export function missingProductionFields(fields={},live=false,format='') {
  const keys=live?['liveOpen','liveSegments','liveInteraction','liveClose']:format==='article'?['title','script']:format==='image'?['title','cover','coverLayout','script','shots']:['title','cover','coverLayout','script','hook','shots','cta'];
  return keys.filter(key=>typeof fields[key]!=='string'||!fields[key].trim());
}
export function productionIssues(fields = {}, live = false, platform = '', standards = null, format = '', references = []) {
  const required = live ? ['liveOpen','liveSegments','liveInteraction','liveClose'] : format==='article'?['title','script']:['script','shots','title','cover'];
  const productionContent={title:fields.title,cover:fields.cover,coverLayout:fields.coverLayout,body:fields.script,hook:fields.hook,shots:fields.shots,cta:fields.cta};
  const issues=!live && ['image','video'].includes(format) && ['小红书','抖音'].includes(platform)
    ? deliveryIssues(platform,productionContent,{complete:true,format}).map(issue=>issue.why)
    : required.filter(k => !String(fields[k] || '').trim()).map(k => `请补充${PRODUCTION_FIELDS[k]}`);
  const body=live?['liveOpen','liveSegments','liveInteraction','liveOffer','liveClose'].map(k=>fields[k]||'').join('\n'):fields.script || '';
  const content={title:fields.title||'',cover:fields.cover||'',coverLayout:fields.coverLayout||'',body,hook:live?'':fields.hook||'',shots:live?'':fields.shots||'',imagePlan:live?'':fields.imagePlan||'',cta:live?'':fields.cta||''};
  issues.push(...standardHits(content,standards).map(term=>`命中业务禁用词「${term}」`));
  issues.push(...standardRuleChecks(content,standards).filter(r=>r.status!=='pass').map(r=>`${r.severity==='block'?'发布前必须处理':'提醒'} · ${r.title}：${r.rule}${r.status==='review'?'（需人工核对）':''}`));
  if(body.trim()) issues.push(...publicationChecks(platform,content));
  issues.push(...referenceOverlaps(content,references).map(r=>`与参考作品「${r.title}」有连续相同文字「${r.excerpt}」，请核对并用自己的表达改写`));
  return issues;
}

// Older workspaces stored either kind at the base key. Keep those drafts
// readable until the first save, when live drafts move to their own key.
export const productionDraftKey = (platform,index,live=false) => `${platform}|${index}${live?'|live':''}`;
export function productionDraft(pack,platform,index,live=false) {
  const base=productionDraftKey(platform,index), drafts=pack?.productionDrafts || {};
  return live ? (drafts[productionDraftKey(platform,index,true)] || (drafts[base]?.live ? drafts[base] : undefined)) : (drafts[base]?.live ? undefined : drafts[base]);
}
export function separateLegacyLiveDraft(pack,platform,index) {
  const base=productionDraftKey(platform,index), liveKey=productionDraftKey(platform,index,true), drafts=pack.productionDrafts;
  if(drafts?.[base]?.live && !drafts[liveKey]) { drafts[liveKey]=drafts[base]; delete drafts[base]; }
}
