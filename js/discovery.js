// Shared presentation rules: counts describe saved evidence, never conversion probability.
export function demandEvidence(signal, now = Date.now()) {
  const text = String(signal.text || '');
  const time = Date.parse(signal.publishedAt);
  const ageDays = Number.isFinite(time) && time <= now ? Math.floor((now - time) / 86400000) : null;
  const excluded = signal.isAuthorReply || signal.status === 'excluded' || /已经买|已买|已解决|不用了|不需要了|不想买|不打算买|不买了|已找到|买好了|问题解决|加我|私我|厂家直销|专业承接/.test(text);
  const match = text.match(/求推荐|求报价|多少钱|怎么收费|想买|想找|准备装修|求链接|哪里买|怎么买|怎么预约|怎么联系|有没有|需要/);
  const recent = !excluded && Boolean(match) && ageDays !== null && time >= now - 7 * 86400000;
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
