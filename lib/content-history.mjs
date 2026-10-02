import { packAsSent } from './pack-edits.mjs';

const timestamp = pack => {
  for (const value of [pack.deliveredAt, pack.createdAt, pack.date]) {
    const n = Date.parse(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

export function recentContentHistory(customer) {
  const packs = [...(customer.drops || []), ...(customer.packs || [])]
    .sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 3);
  const texts = packs.flatMap(pack => {
    const sent = packAsSent(pack);
    const bodies = Object.values(sent.shells).flat().map(item => item.body).filter(Boolean);
    // Organic copies are a compatibility mirror. The edited platform post is
    // what the user actually publishes, and is the source of truth.
    return pack.origin?.mode === 'organic' && bodies.length
      ? bodies : [...Object.values(sent.copies).flat(), ...bodies];
  });
  return { packs, texts: [...new Set(texts)].slice(0, 150) };
}

export const contentIdentity = text => String(text || '').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '').toLowerCase();

export function repeatedContent(items, history) {
  const seen = new Map(history.map(text => [contentIdentity(text), '历史内容']));
  const issues = [];
  items.forEach((item, i) => {
    const key = contentIdentity(item.body);
    if (seen.has(key)) issues.push(`第${i + 1}篇正文与${seen.get(key)}重复，需要换一个具体问题`);
    else seen.set(key, `第${i + 1}篇`);
  });
  return issues;
}
