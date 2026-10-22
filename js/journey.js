import { businessActions } from './business-results.js';
// One actionable recommendation, scoped to the selected business. No inferred results.
export const journeySteps = {
  content: ['选择推广内容', '生成与修改', '复制到平台发布', '承接咨询'],
  active: ['发现需求', '核实原文', '联系客户', '持续跟进'],
};
export function nextAction(customer, acquisition = {}) {
  const urgent=businessActions(acquisition,customer?.id).find(a=>a.rank<=1);
  if(urgent)return {...urgent,title:urgent.label+'：'+urgent.title,label:'继续处理'};
  const scoped = key => (acquisition[key] || []).filter(row => row.customerId === customer?.id);
  const leads = scoped('leads').filter(l => !l.doNotContact);
  const reply = leads.find(l => l.needsReply);
  if (reply) return {title:`先回复 ${reply.authorName || '客户'} 的咨询`, note:'查看原话后回复。',action:'open-contact',id:reply.id,label:'查看咨询'};
  const due = scoped('opportunities').filter(o => !['已成交','已结束'].includes(o.stage) && o.nextAt && Date.parse(o.nextAt) <= Date.now() && leads.some(l => l.id === o.leadId)).sort((a,b)=>Date.parse(a.nextAt)-Date.parse(b.nextAt))[0];
  if (due) return {title:`继续跟进：${due.title}`,note:due.nextStep || '已到跟进时间，查看上次沟通。',action:'open-need',id:due.id,label:'继续跟进'};
  const changed = [...(customer?.drops || []), ...(customer?.packs || [])].find(p => p.productReview?.required);
  if (changed) return {title:'先核对资料已更新的内容',note:'产品资料发生变化，发布前核对价格、参数和承诺。',action:'open-pack',id:changed.id,label:'核对内容'};
  if (scoped('signals').some(s=>s.status==='pending'&&!s.isAuthorReply)) return {title:'核实待跟进需求',note:'',action:'search',label:'查看待核实需求'};
  if (customer?.drops?.length) return {title:'继续你的内容获客',note:'查看成品并发布。',action:'go-content-home',label:'查看已有内容'};
  return {title:'开始获客',note:'选择内容创作或查找需求。',action:'go-content-home',label:'开始内容获客'};
}
