import { it, expect } from 'vitest';
import { demandEvidence, discoveryWorks } from './discovery.js';
const now = Date.parse('2026-10-17T12:00:00Z');
const recent = { id: 's1', customerId: 'c1', workId: 'w1', text: '想买厨房灯，多少钱', publishedAt: '2026-10-16T12:00:00Z', status: 'pending' };
it('recent demand needs actual known dates and excludes author, resolved and promotional speech', () => {
  expect(demandEvidence(recent, now)).toMatchObject({ recent: true, ageDays: 1, excerpt: '想买' });
  for (const changes of [{ publishedAt: '' }, { publishedAt: '2026-10-18' }, { publishedAt: '2026-09-01' }, { isAuthorReply: true }, { status: 'excluded' }, { text: '已经买好了，多少钱' }, { text: '不想买了，多少钱' }, { text: '加我，想买的私我' }, { text: '拍得好' }]) expect(demandEvidence({ ...recent, ...changes }, now).recent).toBe(false);
});
it('filters and ranks saved works using metrics and same-business evidence, keeping unknown counts distinct from zero', () => {
  const works = [{ id: 'w1', customerId: 'c1', platform: '抖音', title: '厨房灯', type: 'video', publishedAt: '2026-10-16', metrics: { likes: 10, comments: 2, saves: 3 } }, { id: 'w2', customerId: 'c1', platform: '小红书', title: '厨房设计', type: 'image', publishedAt: '2026-10-01' }];
  const signals = [recent, { ...recent, id: 's2', customerId: 'c2' }];
  expect(discoveryWorks(works, signals, { sort: 'demand' }, now)).toMatchObject([{ id: 'w1', recentDemand: 1, savedComments: 1, engagement: 15 }]);
  expect(discoveryWorks(works, signals, { type: 'image', query: '厨房' }, now)).toMatchObject([{ id: 'w2', engagement: null }]);
  expect(discoveryWorks(works, signals, { platform: '抖音', query: '不存在' }, now)).toEqual([]);
});
