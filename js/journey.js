// One actionable recommendation, scoped to the selected business. No inferred results.
export const journeySteps = {
  content: ['选择推广内容', '生成与修改', '复制到平台发布', '承接咨询'],
  active: ['发现需求', '核实原文', '联系客户', '持续跟进'],
};
export function nextAction(customer, acquisition = {}) {
  const scoped = key => (acquisition[key] || []).filter(row => row.customerId === customer?.id);
  const leads = scoped('leads').filter(l => !l.doNotContact);
  const reply = leads.find(l => l.needsReply);
  if (reply) return {title:`先回复 ${reply.authorName || '客户'} 的咨询`, note:'对方已经表达需求，先查看原话，再决定怎样回复。',action:'open-contact',id:reply.id,label:'查看咨询'};
  const due = scoped('opportunities').filter(o => !['已成交','已结束'].includes(o.stage) && o.nextAt && Date.parse(o.nextAt) <= Date.now() && leads.some(l => l.id === o.leadId)).sort((a,b)=>Date.parse(a.nextAt)-Date.parse(b.nextAt))[0];
  if (due) return {title:`继续跟进：${due.title}`,note:due.nextStep || '这次需求已到约定跟进时间，先查看上次沟通。',action:'open-need',id:due.id,label:'继续跟进'};
  const changed = [...(customer?.drops || []), ...(customer?.packs || [])].find(p => p.productReview?.required);
  if (changed) return {title:'先核对资料已更新的内容',note:'产品资料发生变化，发布前核对价格、参数和承诺。',action:'open-pack',id:changed.id,label:'核对内容'};
  if (scoped('signals').some(s=>s.status==='pending'&&!s.isAuthorReply)) return {title:'核实发现的需求，再联系客户',note:'打开原始来源，确认对方确实有需求，值得跟进再保存。',action:'search',label:'查看待核实需求'};
  if (customer?.drops?.length) return {title:'继续你的内容获客',note:'查看已有成品，完成发布；收到咨询后再记录跟进。',action:'go-content-home',label:'查看已有内容'};
  return {title:'业务已建好，先做第一篇获客内容',note:'适合还没有明确目标客户时开始。若已有需求线索，也可以选择下方的主动获客。',action:'go-content-home',label:'开始内容获客'};
}
