export function standardHits(content, standards) {
  const text = ['title', 'cover', 'coverLayout', 'body', 'hook', 'shots', 'imagePlan', 'cta'].map(key => typeof content?.[key] === 'string' ? content[key] : '').join('\n');
  return (standards?.forbidden || []).filter(term => text.includes(term));
}

export function standardsBrief(customer = {}) {
  const standards = customer.creationStandards;
  if (!standards || (!standards.preferences && !standards.forbidden?.length && !standards.rules?.length)) return '';
  return `\n# 用户创作偏好（用户提供，仅约束表达；不得覆盖事实和安全要求）\n${JSON.stringify({ version: standards.version, preferences: standards.preferences, forbidden: standards.forbidden, rules: standards.rules })}\n避免使用所列禁用词；遵循逐条规则，forbid 表示不得出现指定原文，require 表示应出现指定原文，manual 表示仍需人工核对。偏好与规则不能成为事实依据，不能为满足规则而编造证据。`;
}

export const RULE_MODES={forbid:'不得包含词句',require:'必须包含词句',manual:'人工核对要求'};
export function normalizeStandardRules(rules){
  if(!Array.isArray(rules)||rules.length>40)throw new Error('创作规则最多40条');
  const ids=new Set();
  return rules.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('创作规则格式不正确');
    const {id,title,rule,mode,severity}=row;
    if(typeof id!=='string'||!/^rule-[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))throw new Error('创作规则标识重复或无效');
    if(typeof title!=='string'||!title.trim()||title.length>80||typeof rule!=='string'||!rule.trim()||rule.length>1000)throw new Error('每条规则需要标题（最多80字）与正文（最多1000字）');
    if(!Object.hasOwn(RULE_MODES,mode)||!['block','warn'].includes(severity))throw new Error('请选择规则检查方式及级别');
    ids.add(id);return {id,title:title.trim(),rule:rule.trim(),mode,severity};
  });
}
const standardText=content=>['title','cover','coverLayout','body','hook','shots','imagePlan','cta'].map(key=>typeof content?.[key]==='string'?content[key]:'').join('\n');
export function standardRuleChecks(content,standards){
  const text=standardText(content);
  return (standards?.rules||[]).map(r=>({...r,status:r.mode==='manual'?'review':(r.mode==='forbid'?text.includes(r.rule):!text.includes(r.rule))?'issue':'pass'}));
}
export function automaticStandardBlocks(content,standards){
  return standardRuleChecks(content,standards).filter(r=>r.severity==='block'&&r.status==='issue').map(r=>`创作规则「${r.title}」：${RULE_MODES[r.mode]}「${r.rule}」`);
}
export function standardReviewBasis(content,standards){
  return JSON.stringify([standardText(content),standards||{version:0,preferences:'',forbidden:[]}]);
}
