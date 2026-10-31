// Editorial intent is independent of measured outcomes and publication status.
export const CONTENT_JOBS = {traffic:'流量',lead:'获客',divert:'引流',convert:'转化'};
export function contentJob(value){return typeof value==='string'&&Object.hasOwn(CONTENT_JOBS,value)?value:'';}
