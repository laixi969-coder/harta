import { businessActions } from './business-results.js';
import { calendarItems, localDay } from './content-calendar.js';
// One actionable recommendation, scoped to the selected business. No inferred results.
export const journeySteps = {
  content: ['选择推广内容', '生成与修改', '复制到平台发布', '承接咨询'],
  active: ['发现需求', '核实原文', '联系客户', '持续跟进'],
};
export function nextAction(customer, acquisition = {}, states = {}, now = new Date()) {
  const actions=businessActions(acquisition,customer?.id,now.getTime()),urgent=actions.find(a=>a.rank<=1);
  if(urgent)return {...urgent,title:urgent.label+'：'+urgent.title,label:'继续处理'};
  const changed = [...(customer?.drops || []), ...(customer?.packs || [])].find(p => p.productReview?.required);
  if (changed) return {title:'先核对资料已更新的内容',note:'产品资料发生变化，发布前核对价格、参数和承诺。',action:'open-pack',id:changed.id,label:'核对内容'};
  if (actions.some(a=>a.label==='待核实')) return {title:'核实待跟进需求',note:'',action:'search',label:'查看待核实需求'};
  const review=actions.find(a=>a.action==='open-publication-review');
  if(review)return {...review,title:`回看发布后的评论：${review.title}`,label:'查看作品'};
  const planned=calendarItems(customer,states).items.filter(item => {
    if (item.kind==='post') return item.status==='selected' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.date<=localDay(now);
    return item.kind==='live' && !item.review && Number.isFinite(Date.parse(item.time)) && Date.parse(item.time)<=now.getTime();
  }).sort((a,b)=>(a.time||a.date).localeCompare(b.time||b.date))[0];
  if(planned?.kind==='post') return {title:`计划待发布：${planned.title}`,note:`计划日期 ${planned.date}；${planned.partial?'部分内容已安排，请核对整篇状态。':'确认内容后手动发布并登记实际链接。'}`,action:'open-pack',id:planned.packId,label:'查看作品'};
  if(planned?.kind==='live') return {title:`直播计划已到：${planned.title}`,note:'请核对是否已开播；如已开播，记录本场复盘。',action:'open-live',id:JSON.stringify([planned.packId,planned.platform,planned.index]),label:'查看直播'};
  if (customer?.drops?.length) return {title:'继续你的内容获客',note:'查看成品并发布。',action:'go-content-home',label:'查看已有内容'};
  return {title:'开始获客',note:'选择内容创作或查找需求。',action:'go-content-home',label:'开始内容获客'};
}
