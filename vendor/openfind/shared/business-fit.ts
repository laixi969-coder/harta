export interface FitCriteria { serviceArea?: string; needTerms?: string; excludeTerms?: string }
export function businessFit(text: string, criteria: FitCriteria) {
 const terms = (s='') => s.split(/[,，、\n]/).map(v=>v.trim().toLowerCase()).filter(Boolean);
 const normalized=text.toLowerCase();
 const excluded=terms(criteria.excludeTerms).find(t=>normalized.includes(t));
 if(excluded)return {eligible:false,reason:'命中业务排除条件：'+excluded};
 const needed=terms(criteria.needTerms),match=needed.find(t=>normalized.includes(t));
 if(needed.length&&!match)return {eligible:false,reason:'未命中本业务需求词，保留原文供人工复核'};
 return {eligible:true,reason:(match?'需求词：'+match+'；':'')+(criteria.serviceArea?'服务范围 '+criteria.serviceArea+'，实际服务地点需人工核实（不以 IP 属地推断）':'服务地点未限定')};
}
