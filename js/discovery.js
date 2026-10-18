import { demandLanguage, demandTime } from './demand-rules.js';
// Shared presentation rules: counts describe saved evidence, never conversion probability.
export function demandEvidence(signal, now = Date.now()) {
  const text = String(signal.text || '');
  const { ageDays, recent: inWindow } = demandTime(signal.publishedAt, now);
  const { demand: match, resolved, seller } = demandLanguage(text);
  const excluded = signal.isAuthorReply || signal.status === 'excluded' || resolved || seller;
  const recent = !excluded && Boolean(match) && inWindow;
  return { ageDays, recent, excerpt: excluded ? '' : match?.[0] || '', reason: excluded ? '作者回复、已排除或已解决／推广表达' : !match ? '未识别明确需求表达' : ageDays === null ? '有需求表达，时间待核实' : !recent ? '有需求表达，已超过近 7 天' : `近 7 天原文包含「${match[0]}」，业务适配待核实` };
}

export function discoveryWorks(works, signals, filters = {}, now = Date.now()) {
  const query = String(filters.query || '').trim().toLowerCase();
  return works.map(work => {
    const evidence = signals.filter(s => s.workId === work.id && s.customerId === work.customerId);
    const recent = evidence.filter(s => demandEvidence(s, now).recent);
    const metrics = work.metrics;
    const engagement = metrics && [metrics.likes, metrics.comments, metrics.saves].some(v => Number.isFinite(v))
      ? [metrics.likes, metrics.comments, metrics.saves].reduce((n,v) => n + (Number.isFinite(v) ? v : 0), 0) : null;
    return { ...work, savedComments: evidence.length, recentDemand: recent.length, engagement };
  }).filter(w => (!query || `${w.title} ${w.description || ''} ${w.authorName || ''}`.toLowerCase().includes(query))
    && (!filters.platform || w.platform === filters.platform)
    && (!filters.type || w.type === filters.type)
    && (filters.sort !== 'demand' || w.recentDemand > 0))
    .sort((a,b) => filters.sort === 'popular' ? (b.engagement ?? -1) - (a.engagement ?? -1)
      : filters.sort === 'demand' ? b.recentDemand - a.recentDemand
      : (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}
