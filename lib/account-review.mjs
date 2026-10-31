import crypto from 'node:crypto';
import { readWorkspace,writeWorkspace } from './workspace.mjs';
import { safeSourceUrl } from './research.mjs';
import { validateOutcome, applyOutcomesToWorkspace } from './growth-workspace.mjs';
import { publicationIdentity } from './publication-identity.mjs';
import { priorPublicationOutcome, carriedCsvMetrics, csvCriteria } from '../js/account-csv-carry.js';
import { comparableOutcomes, comparisonEvidence } from '../js/creator-review.js';
import { isRealEvidence } from '../js/evidence-kind.js';

function business(space,id){const c=space.customers.find(x=>x.id===id);if(!c)throw new Error('找不到当前业务');return c;}
export function registerOwnedPublication(email,{customerId,accountId,title,body='',url,publishedAt,confirmed}={}) {
  if(confirmed!==true)throw new Error('请确认这是该账号实际发布的作品');
  if(typeof title!=='string' || !title.trim() || title.length>200 || typeof body!=='string' || body.length>12000)throw new Error('标题不能为空且最多200字，正文最多12000字');
  if(typeof url!=='string' || url.length>2000 || !safeSourceUrl(url.trim()))throw new Error('请填写有效的作品链接');
  if(typeof publishedAt!=='string' || !publishedAt || !Number.isFinite(Date.parse(publishedAt)) || Date.parse(publishedAt)>Date.now()+60000)throw new Error('请填写有效的实际发布时间');
  const space=readWorkspace(email),c=business(space,customerId),accounts=space.acquisition?.accounts||[],account=accounts.find(a=>a.id===accountId && a.customerId===customerId);
  if(!isRealEvidence(account) || !['小红书','抖音','视频号','公众号'].includes(account.platform))throw new Error('请选择当前业务的小红书、抖音、视频号或公众号真实账号');
  const link=safeSourceUrl(url.trim());space.acquisition ||= {};space.acquisition.publications ||= [];
  if(space.acquisition.publications.some(p=>isRealEvidence(p) && p.customerId===customerId && p.platform===account.platform && p.status==='published' && publicationIdentity(p.platform,p.url)===publicationIdentity(account.platform,link)))throw new Error('该作品链接已经登记，请使用已有记录');
  const content={title:title.trim(),body},now=new Date().toISOString();
  space.acquisition.publications.push({id:crypto.randomUUID(),customerId,packId:'',platform:account.platform,index:null,accountId:account.id,accountName:account.name,content,revision:crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex'),metadataVersion:1,goal:c.growthGoal || 'leads',creatorPack:null,status:'published',origin:'manual_external',url:link,publishedAt:new Date(publishedAt).toISOString(),recordedAt:now,createdAt:now,confirmationSource:'manual_external'});
  return writeWorkspace(email,space);
}
export function correctOwnedPublication(email,{customerId,publicationId,accountId,version,title,body='',url,publishedAt,confirmed}={}) {
  if(confirmed!==true)throw new Error('请确认更正后的作品信息');
  if(typeof title!=='string' || !title.trim() || title.length>200 || typeof body!=='string' || body.length>12000)throw new Error('标题不能为空且最多200字，正文最多12000字');
  if(typeof url!=='string' || url.length>2000 || !safeSourceUrl(url.trim()))throw new Error('请填写有效的作品链接');
  if(typeof publishedAt!=='string' || !publishedAt || !Number.isFinite(Date.parse(publishedAt)) || Date.parse(publishedAt)>Date.now()+60000)throw new Error('请填写有效的实际发布时间');
  const space=readWorkspace(email),c=business(space,customerId),all=space.acquisition?.publications||[],pub=all.find(p=>p.id===publicationId && p.customerId===customerId && p.origin==='manual_external' && p.status==='published');
  if(!isRealEvidence(pub))throw new Error('找不到当前业务登记的真实自有作品');
  if(!Number.isSafeInteger(version) || version!==(pub.metadataVersion||1))throw new Error('作品信息已变更，请刷新后重试');
  const account=(space.acquisition?.accounts||[]).find(a=>a.id===(accountId || pub.accountId) && a.customerId===customerId && a.platform===pub.platform);
  if(!isRealEvidence(account))throw new Error('请选择同一业务、同一平台的真实账号');
  const linkedSignals=(space.acquisition?.signals||[]).some(s=>s.customerId===customerId && s.publicationAttribution?.publicationId===pub.id);
  const linkedInquiries=(space.acquisition?.leads||[]).some(l=>l.customerId===customerId && (l.messages||[]).some(m=>m.direction==='inbound' && m.publicationId===pub.id));
  if(account.id!==pub.accountId && (linkedSignals || (c.accountReviewOutcomes||[]).some(r=>r.publicationId===pub.id) || linkedInquiries))throw new Error('该作品已有历史效果、咨询或关联评论，不能更换账号');
  const link=safeSourceUrl(url.trim());if((linkedSignals || linkedInquiries) && publicationIdentity(pub.platform,pub.url)!==publicationIdentity(pub.platform,link))throw new Error('该作品已关联咨询或评论，不能更换为另一篇作品的链接；请先核对并更正来源');if(all.some(p=>isRealEvidence(p) && p.id!==pub.id && p.customerId===customerId && p.platform===pub.platform && p.status==='published' && publicationIdentity(p.platform,p.url)===publicationIdentity(pub.platform,link)))throw new Error('该作品链接已经登记，请使用已有记录');
  pub.metadataHistory=[{version:pub.metadataVersion||1,accountId:pub.accountId,accountName:pub.accountName,content:pub.content,url:pub.url,publishedAt:pub.publishedAt,at:new Date().toISOString()},...(pub.metadataHistory||[])].slice(0,20);
  pub.accountId=account.id;pub.accountName=account.name;pub.content={title:title.trim(),body};pub.url=link;pub.publishedAt=new Date(publishedAt).toISOString();pub.revision=crypto.createHash('sha256').update(JSON.stringify(pub.content)).digest('hex');pub.metadataVersion=version+1;pub.updatedAt=new Date().toISOString();
  return writeWorkspace(email,space);
}
export function recordOwnedPublicationOutcome(email,{customerId,publicationId,...input}={}) {
  const space=readWorkspace(email),c=business(space,customerId),pub=(space.acquisition?.publications||[]).find(p=>p.id===publicationId && p.customerId===customerId && p.origin==='manual_external' && p.status==='published');
  if(!isRealEvidence(pub))throw new Error('找不到当前业务登记的真实自有作品');
  const account=(space.acquisition?.accounts||[]).find(a=>a.id===pub.accountId && a.customerId===customerId);
  if(account && !isRealEvidence(account))throw new Error('不能为示例账号记录真实效果');
  const checked=validateOutcome(input);
  c.accountReviewOutcomes ||= [];
  if(c.accountReviewOutcomes.length>=5000)throw new Error('账号复盘记录已达5000条，暂不能新增');
  c.accountReviewOutcomes.unshift({...checked,id:crypto.randomUUID(),publicationId:pub.id,publicationVersion:pub.metadataVersion||1,accountId:pub.accountId,accountName:pub.accountName,platform:pub.platform,publishedAt:pub.publishedAt,publicationUrl:pub.url,content:{...pub.content},goal:pub.goal || 'leads',contentJob:pub.contentJob||'',creatorPack:null});
  return writeWorkspace(email,space);
}
export function importOwnedPublicationOutcomes(email,{customerId,rows,confirmed,carryExisting=false}={}) {
  if(confirmed!==true)throw new Error('请确认核对作品及统计口径');
  if(!Array.isArray(rows)||!rows.length||rows.length>100)throw new Error('一次导入 1 至 100 条作品');
  const space=readWorkspace(email),c=business(space,customerId),seen=new Set(),pubs=space.acquisition?.publications||[];
  const records=rows.map((row,i)=>{
    const p=pubs.find(p=>p.id===row.publicationId && p.customerId===customerId && p.status==='published');
    const account=p && (space.acquisition?.accounts||[]).find(a=>a.id===p.accountId && a.customerId===customerId);
    if(!isRealEvidence(p) || (account && !isRealEvidence(account)) || seen.has(p.id) || (p.metadataVersion||1)!==row.version || publicationIdentity(p.platform,p.url)!==publicationIdentity(p.platform,row.url) || (p.origin!=='manual_external' && ((p.revision||'')!==(row.revision||'') || (p.accountId||'')!==(row.accountId||''))))throw new Error(`第 ${i+1} 条作品已变化、重复、为示例或不属于当前业务，请重新预览`);
    seen.add(p.id);
    const previous=carryExisting?priorPublicationOutcome(c,p,row.start,row.end):null;
    if(carryExisting && ((previous && !previous.id) || (previous?.id||'')!==(row.priorId||'')))throw new Error(`第 ${i+1} 条的同窗口记录已变化，请重新预览`);
    const carried=carriedCsvMetrics(previous,row.metrics||{}),merged={...carried,...row.metrics};
    const checked=validateOutcome({...row,metrics:merged,criteria:csvCriteria(previous,row.metrics||{},carried,row.criteria),note:Object.keys(carried).length?(previous?.note||''):row.note});
    const metricSources={};for(const key of Object.keys(carried))metricSources[key]=previous.metricSources?.[key]||previous.source;for(const key of Object.keys(row.metrics||{}))metricSources[key]=checked.source;
    return {pub:p,checked,metricSources:carryExisting?metricSources:null};
  });
  if((c.accountReviewOutcomes||[]).length+records.filter(r=>r.pub.origin==='manual_external').length>5000)throw new Error('账号复盘记录已达上限');
  for(const {pub:p,checked,metricSources} of records){
    if(p.origin!=='manual_external') {
      if(!p.packId)throw new Error('发布记录没有对应的内容批次，请重新核对');
      applyOutcomesToWorkspace(space,{customerId,packId:p.packId,rows:[{...checked,platform:p.platform,index:p.index,publicationId:p.id,accountId:p.accountId||''}]});
      if(metricSources){const pack=[...(c.drops||[]),...(c.packs||[])].find(pack=>pack.id===p.packId);pack.outcomes[`${p.platform}|${p.index}`][0].metricSources=metricSources;}
    } else {
      c.accountReviewOutcomes ||= [];
      c.accountReviewOutcomes.unshift({...checked,id:crypto.randomUUID(),publicationId:p.id,publicationVersion:p.metadataVersion||1,accountId:p.accountId,accountName:p.accountName,platform:p.platform,publishedAt:p.publishedAt,publicationUrl:p.url,content:{...p.content},goal:p.goal||'leads',contentJob:p.contentJob||'',creatorPack:null,...(metricSources?{metricSources}:{})});
    }
  }
  return writeWorkspace(email,space);
}
export function adoptAccountReviewMemory(email,{customerId,selection,fingerprint,text}={}) {
  if(!selection || typeof selection!=='object' || typeof selection.accountId!=='string' || typeof selection.platform!=='string' || typeof selection.start!=='string' || typeof selection.end!=='string' || typeof fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(fingerprint))throw new Error('对照信息不正确');
  if(typeof text!=='string' || !text.trim() || text.length>1000)throw new Error('请填写1000字以内的复盘假设');
  const space=readWorkspace(email),c=business(space,customerId),group=comparableOutcomes(c).find(g=>g.accountId===selection.accountId && g.platform===selection.platform && g.start===selection.start && g.end===selection.end);
  if(!group || group.rows.length>200 || group.rows.some(r=>!r.outcomeId))throw new Error('对照数据不可用或超过200条，请核对后重试');
  const digest=crypto.createHash('sha256').update(comparisonEvidence(group)).digest('hex');
  if(digest!==fingerprint)throw new Error('对照数据已变化，请重新核对后再保存');
  c.creatorMemories ||= [];
  if(c.creatorMemories.some(m=>m.active && m.kind==='account-review' && m.fingerprint===digest && m.text===text.trim()))return space;
  if(c.creatorMemories.filter(m=>m.active).length>=50)throw new Error('启用的创作记忆已达50条，请先停用不需要的记忆');
  c.creatorMemories.push({id:crypto.randomUUID(),active:true,kind:'account-review',text:text.trim(),source:`${group.accountName} · ${group.platform} · ${group.start} 至 ${group.end} · ${group.rows.length} 条手工记录，归属和数据未自动核验`,fingerprint:digest,evidence:group,createdAt:new Date().toISOString()});
  return writeWorkspace(email,space);
}
