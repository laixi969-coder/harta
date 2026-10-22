import { describe, it, expect } from 'vitest';
import { buildTopicPool, appendDirection, recordDecision, directionTextFor } from './topic-pool.mjs';

const customer = (over = {}) => ({
  id: 'c1',
  painClusters: {
    generatedAt: '2026-10-20T00:00:00.000Z',
    clusters: [{ topic: '怕报价不透明', anxiety: '担心被加价', angle: '把费用项拆开讲', quotes: [{ text: '多少钱一平' }], count: 12, share: 0.3, signalIds: ['s1', 's2'] }],
  },
  benchmarkTeardowns: [{ workId: 'w1', title: '同样90平少花9万', author: '某某', generatedAt: '2026-10-20T00:00:00.000Z', topics: [{ angle: '同户型报价差在哪', why: '本地客户最关心', keywords: ['隔音窗多少钱'] }] }],
  keywordLibraries: [{ createdAt: '2026-10-19T00:00:00.000Z', scope: { type: '领域', name: '门窗' }, analysis: { groups: [{ topic: '价格咨询 · 咨询', scenario: '门窗，共 3 个词', angle: '按价格咨询出一批', ids: ['K1'] }] }, items: [{ id: 'K1', keyword: '隔音窗多少钱' }] }],
  ...over,
});

describe('选题池', () => {
  it('三个来源都进池，并带证据与关键词', () => {
    const pool = buildTopicPool(customer());
    expect(pool.topics.map((t) => t.source)).toEqual(['痛点', '对标', '关键词']);
    expect(pool.sources).toEqual({ 痛点: 1, 对标: 1, 研究: 0, 关键词: 1 });
    expect(pool.topics[0]).toMatchObject({ title: '怕报价不透明', angle: '把费用项拆开讲', evidence: { count: 12 } });
    expect(pool.topics[1].keywords).toEqual(['隔音窗多少钱']);
  });

  it('同一角度的不同来源合并，保留高优先级来源', () => {
    const pool = buildTopicPool(customer({
      benchmarkTeardowns: [{ workId: 'w1', title: 'x', topics: [{ angle: '把费用项拆开讲', why: '对标也说这个' }] }],
    }));
    const merged = pool.topics.find((t) => t.key === pool.topics[0].key);
    expect(merged.source).toBe('痛点');
    expect(merged.alsoFrom).toContain('对标');
  });

  it('没有来源时明确说没有，不编选题', () => {
    const pool = buildTopicPool({ id: 'c2' });
    expect(pool.topics).toEqual([]);
    expect(pool.note).toContain('还没有可用的选题来源');
  });

  it('用过的选题重算后仍是已用，不丢决定', () => {
    const c = customer({ topicDecisions: {} });
    const first = buildTopicPool(c).topics[0];
    c.topicDecisions = recordDecision(c.topicDecisions, first.key, 'used');
    expect(buildTopicPool(c).topics[0].status).toBe('已用');
    c.topicDecisions = recordDecision(c.topicDecisions, first.key, '候选');
    expect(buildTopicPool(c).topics[0].status).toBe('候选');
  });

  it('写进方向时追加而不覆盖，同一个选题不重复叠加', () => {
    const topic = buildTopicPool(customer()).topics[0];
    const next = appendDirection('原来手写的方向', topic);
    expect(next.startsWith('原来手写的方向')).toBe(true);
    expect(next).toContain('【本批选题】');
    expect(appendDirection(next, topic)).toBe(next);
    expect(directionTextFor(topic)).toContain('为什么：担心被加价');
  });
});

it('完整写入后才算采用，边界长度可用，提到角度不会误判为已追加', () => {
 const topic={angle:'检查密封条',why:''},text=directionTextFor(topic);
 expect(appendDirection('原'.repeat(1999-text.length),topic)).toHaveLength(2000);
 expect(()=>appendDirection('原'.repeat(2000-text.length),topic)).toThrow('2000字');
 expect(appendDirection('可能检查密封条，尚未选题',topic)).toContain('【本批选题】检查密封条');
});
