import { describe, it, expect } from 'vitest';
import { painSignals, rulePainClusters, clusterPains } from './pain-clusters.mjs';

const comment = (id, text, extra = {}) => ({ id, text, customerId: 'c1', ...extra });

describe('痛点归集', () => {
  it('排除作者自答、商家自荐、已排除与重复原话', () => {
    const rows = painSignals([
      comment('1', '隔音窗多少钱一平啊'),
      comment('2', '隔音窗多少钱一平啊'),
      comment('3', '作者自己回：我们做这个', { isAuthorReply: true }),
      comment('4', '专业承接隔音窗，加我主页'),
      comment('5', '这个早就解决了', { status: 'excluded' }),
      comment('6', 'ab'),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['1']);
  });

  it('规则归堆按真实条数计数并给原话', () => {
    const { clusters, covered } = rulePainClusters([
      comment('1', '隔音窗多少钱一平'),
      comment('2', '报价大概多少'),
      comment('3', '装的时候要几天'),
      comment('4', '师傅上门要多久'),
    ]);
    expect(clusters[0]).toMatchObject({ topic: '价格与预算', count: 2 });
    expect(clusters[0].quotes[0].signalId).toBe('1');
    expect(covered.size).toBe(4);
  });

  it('模型只引用真实评论，虚构 id 丢弃，频次按实际条数算', async () => {
    const signals = [1, 2, 3, 4, 5, 6].map((n) => comment(String(n), `隔音窗问题${n}多少钱`));
    const chatFn = async () => JSON.stringify({
      clusters: [
        { topic: '怕报价不透明', anxiety: '担心被加价', blocker: '不敢问', angle: '列清费用项', ids: ['1', '2', '不存在'] },
        { topic: '空组', ids: [] },
      ],
    });
    const result = await clusterPains(signals, { chatFn, modelReady: true, business: { name: '测试', hunt: '门窗' } });
    expect(result.method).toBe('模型归集 · 人工可核');
    expect(result.clusters[0]).toMatchObject({ topic: '怕报价不透明', count: 2 });
    expect(result.clusters.every((c) => c.signalIds.every((id) => signals.some((s) => s.id === id)))).toBe(true);
  });

  it('模型不可用时退回规则，并说明没做语义聚类', async () => {
    const signals = [1, 2].map((n) => comment(String(n), `隔音窗多少钱${n}`));
    const result = await clusterPains(signals, { modelReady: false, business: {} });
    expect(result.method).toBe('规则归堆');
    expect(result.warnings.join()).toContain('未配置模型');
  });

  it('模型抛错不阻塞，保留规则结果', async () => {
    const signals = [1, 2, 3].map((n) => comment(String(n), `装的时候要几天${n}`));
    const result = await clusterPains(signals, { chatFn: async () => { throw new Error('boom'); }, modelReady: true });
    expect(result.clusters[0].topic).toBe('施工与安装');
    expect(result.warnings.join()).toContain('退回规则');
  });

  it('没有评论时明确说没有，不编主题', async () => {
    const result = await clusterPains([], { modelReady: true });
    expect(result.clusters).toEqual([]);
    expect(result.warnings[0]).toContain('没有可归集的真实评论');
  });
});
