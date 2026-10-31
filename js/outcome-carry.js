import { METRICS } from './growth.js';

// Copy only into empty fields and never combine different reporting windows.
export function carryOutcome(snapshot, current = {}, { metricPrefix = '', checkPublication = false } = {}) {
  if (!snapshot) throw new Error('没有可沿用的效果记录');
  for (const key of ['start','end']) {
    if (current[key] && current[key] !== snapshot[key]) throw new Error('当前统计窗口与上次不同，请先清空或改为相同日期');
  }
  if (checkPublication) {
    if ((current.publicationId || '') !== (snapshot.publicationId || '')) throw new Error('请先选择与上次记录相同的发布记录');
    if ((current.accountId || '') !== (snapshot.accountId || '')) throw new Error('请先选择与上次记录相同的发布账号');
  }
  const prior = Object.fromEntries(['start','end','source','criteria','note'].map(k=>[k,snapshot[k]]));
  for (const key of Object.keys(METRICS)) prior[metricPrefix+key] = snapshot.metrics?.[key];
  return Object.fromEntries(Object.entries(prior).filter(([key,value])=>value != null && value !== '' && (current[key] == null || current[key] === '')).map(([key,value])=>[key,String(value)]));
}
