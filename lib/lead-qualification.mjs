import { randomUUID } from 'node:crypto';
import { COMMITMENT, FIT, NEED, gradeFacts, qualificationDirectory, qualificationPolicy } from '../js/lead-qualification.js';

function revision(actual, expected) {
  if (!Number.isSafeInteger(expected) || expected !== actual) throw new Error('分级记录或标准已变化，请刷新核对后再保存');
}
function requiredText(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('请填写' + label + '，最多 ' + max + ' 字');
  return value.trim();
}

export function saveQualificationPolicy(acquisition, customerId, input) {
  const current = qualificationPolicy(acquisition, customerId);
  revision(current.revision, input.baseRevision);
  const fitCriteria = requiredText(input.fitCriteria,'本业务的适配条件',500);
  if (!Array.isArray(input.actions) || !input.actions.length || input.actions.some(k => typeof k !== 'string' || k === 'none' || !Object.hasOwn(COMMITMENT,k))) throw new Error('请至少选择一项有效的 A 级推进事项');
  if (!Number.isInteger(input.reviewDays) || input.reviewDays < 1 || input.reviewDays > 365) throw new Error('复核周期需为 1 到 365 天');
  const actions = Object.keys(COMMITMENT).filter(key => input.actions.includes(key));
  if (fitCriteria === current.fitCriteria && input.reviewDays === current.reviewDays && actions.join() === current.actions.join()) return;
  const record = {customerId,fitCriteria,actions,reviewDays:input.reviewDays,revision:current.revision+1,updatedAt:new Date().toISOString()};
  acquisition.qualificationPolicies = [...(acquisition.qualificationPolicies || []).filter(row => row.customerId !== customerId),record];
}

export function saveLeadQualification(acquisition, customerId, input) {
  const {policy,contacts} = qualificationDirectory(acquisition,customerId);
  const contact = contacts.get(input.leadId);
  if (!contact) throw new Error('找不到当前业务的真实联系人');
  const scope = contact.scopes.find(s => s.scopeId === (input.opportunityId || ''));
  if (!scope) throw new Error('请在此联系人的对应购买需求内评定');
  const target = scope.opportunity || contact.lead;
  revision(scope.assessment?.revision || 0, input.baseRevision);
  revision(policy.revision, input.policyRevision);
  if ((input.evidenceVersion !== undefined && input.evidenceVersion !== scope.evidenceVersion) || (input.productBasis !== undefined && input.productBasis !== scope.productBasis)) throw new Error('客户依据已变化，请刷新核对后再保存');
  if (scope.opportunity) revision(scope.opportunity.revision || 0, input.opportunityRevision);
  const note = requiredText(input.note,'本次评定或撤销的依据',2000);
  const updatedAt = new Date().toISOString();
  const previous = scope.assessment;
  let next;
  if (input.action === 'clear-qualification') {
    if ((!previous && !scope.derived) || previous?.cleared) throw new Error('当前没有可撤销的评定');
    next = {cleared:true};
  } else {
    if (['blocked','closed','won','service','paused'].includes(scope.code)) throw new Error('请先核对联系状态或选择仍在跟进的需求');
    if (![[FIT,input.fit],[NEED,input.need],[COMMITMENT,input.commitment]].every(([options,key]) => typeof key === 'string' && Object.hasOwn(options,key))) throw new Error('请选择有效的适配、需求和约定事项');
    const source = scope.sources.find(s => s.key === input.sourceKey);
    if (input.sourceKey !== 'note' && (!source || typeof source.text !== 'string' || input.sourceQuote !== source.text)) throw new Error('原话已变化或不属于本次需求，请重新核对依据');
    const observed = source?.at || input.observedAt;
    const time = typeof observed === 'string' ? Date.parse(observed) : NaN;
    if (!Number.isFinite(time) || time > Date.now() + 60000) throw new Error('请填写已发生的客户沟通时间');
    next = {fit:input.fit,need:input.need,commitment:input.commitment,sourceKey:input.sourceKey,quote:source?.text || '',sourceLabel:source?.label || '人工核实记录',observedAt:new Date(time).toISOString()};
  }
  Object.assign(next,{revision:(previous?.revision || 0)+1,policyRevision:policy.revision,productBasis:scope.productBasis,updatedAt,note});
  target.qualification = next;
  contact.lead.events ||= [];
  contact.lead.events.push({id:randomUUID(),type:'qualification',at:updatedAt,opportunityId:scope.scopeId,note,
    before:scope.factsGrade,after:gradeFacts(next,policy),assessment:{...next},fitCriteria:policy.fitCriteria,qualifiedActions:[...policy.actions]});
}

export function recordClosingGrade(acquisition, old, updated) {
  if (!old || old.stage === updated.stage) return;
  const closed = stage => stage === '已成交' || stage === '已结束';
  if (!closed(updated.stage)) {
    if (closed(old.stage)) updated.gradeAtClose = null;
    return;
  }
  if (closed(old.stage)) return;
  updated.gradeAtClose = null;
  const beforeClose = {...old,...updated,stage:old.stage};
  const view = {...acquisition,leads:acquisition.leads.filter(l => l.id === old.leadId),opportunities:[beforeClose]};
  const scope = qualificationDirectory(view,old.customerId).contacts.get(old.leadId)?.summary;
  if (!scope || scope.review || !['A','B','C','unfit'].includes(scope.code)) return;
  const snapshot = {code:scope.code,assessmentRevision:scope.assessment.revision,policyRevision:scope.assessment.policyRevision};
  updated.gradeAtClose = snapshot;
  updated.events.at(-1).gradeAtClose = snapshot;
}
