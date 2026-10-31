import crypto from 'node:crypto';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {standardHits,standardRuleChecks,standardReviewBasis} from '../js/creation-standards.js';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function studioTextInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('请提供当前草稿文案');
  const {title,body,tags,platform,kind}=input;
  if(typeof title!=='string'||!title.trim()||title.length>20||typeof body!=='string'||body.length>1000)throw new Error('标题需为1至20字，正文最多1000字');
  if(!Array.isArray(tags)||tags.length>20||tags.some(t=>typeof t!=='string'||t.length>30||/[\s#]/u.test(t)||!t))throw new Error('话题最多20个，每个最多30字，不含空白或井号');
  if(!['xiaohongshu','douyin'].includes(platform)||!['image','video'].includes(kind))throw new Error('请选择小红书或抖音及图文或视频形式');
  return {title,body,tags,platform,kind};
}
export function reviewStudioText(email,customerId,input){
  const space=readWorkspace(email),customer=space.customers.find(c=>c.id===customerId);
  if(!customer)throw new Error('找不到当前业务');
  if(!['check','prepare'].includes(input?.action))throw new Error('请选择文案检查或复制前核对');
  const content=studioTextInput(input.content),text=[content.title,content.body,content.tags.map(t=>'#'+t).join(' ')].join('\n\n');
  const checkedContent={title:content.title,body:[content.body,content.tags.map(t=>'#'+t).join(' ')].join('\n')};
  const checks=[...standardHits(checkedContent,customer.creationStandards).map((term,i)=>({id:'legacy-'+i,title:'业务禁用词',rule:term,mode:'forbid',severity:'block',status:'issue'})),...standardRuleChecks(checkedContent,customer.creationStandards)];
  const basis=hash([customerId,content,standardReviewBasis(checkedContent,customer.creationStandards)]),contentRevision=hash(content);
  const blockers=checks.filter(r=>r.severity==='block'&&r.status==='issue'),manual=checks.filter(r=>r.severity==='block'&&r.status==='review');
  const confirmed=Array.isArray(input.confirmedRuleIds)?input.confirmedRuleIds:[];
  const report={basis,contentRevision,version:customer.creationStandards?.version||0,checks,blocked:blockers.length>0,needsConfirmation:manual.map(r=>r.id),history:(customer.studioTextReviews||[]).slice(-20).reverse()};
  if(input.action==='check')return report;
  if(blockers.length)throw new Error('文案尚未通过创作规则：'+blockers.map(r=>`${r.title}（${r.rule}）`).join('；'));
  if(input.basis!==basis)throw new Error('文案或创作标准已变化，请重新检查后复制');
  if(manual.some(r=>!confirmed.includes(r.id)))throw new Error('请逐项确认当前文案的人工核对要求');
  const record={id:crypto.randomUUID(),content,contentRevision,version:report.version,basis,checks,confirmedRuleIds:manual.map(r=>r.id),checkedAt:new Date().toISOString(),status:'copy_prepared'};
  customer.studioTextReviews=[...(customer.studioTextReviews||[]),record].slice(-100);writeWorkspace(email,space);
  return {...report,record,text};
}
