import { describe, expect, it, vi } from 'vitest';
import { reviewContentFacts } from './content-review.mjs';
const draft = { items: [{ title: '厨卫改造', body: '上门测量免费，7-15天完工。', brief: { nextStep: '点主页预约' } }] };
const customer = { pitch: '只做厨卫', salesMaterial: '没有确认价格和工期', research: { strategy: { trust: '模型策略编造的免费服务' }, sources: [{ id: 'S1', excerpt: '市场行业趋势', kind: '搜索摘要，未读取全文' }] } };
describe('事实核对', () => {
  it('对照原始资料而非模型策略，把具体问题反馈给写作阶段', async () => {
    const chatFn = vi.fn(async () => JSON.stringify({ approved: false, issues: [{ index: 1, quote: '上门测量免费', reason: '用户未提供免费服务', fix: '删去免费承诺，建议咨询具体费用' }] }));
    const issues = await reviewContentFacts(draft, customer, { chatFn });
    expect(issues[0]).toContain('用户未提供免费服务');
    expect(chatFn.mock.calls[0][0].user).toContain('没有确认价格和工期');
    expect(chatFn.mock.calls[0][0].user).not.toContain('模型策略编造的免费服务');
    expect(chatFn.mock.calls[0][0].user).toContain('搜索摘要，未读取全文');
  });
  it('无问题的有效审读可以通过', async () => {
    expect(await reviewContentFacts(draft, customer, { chatFn: async () => '```json\n{"approved":true,"issues":[]}\n```' })).toEqual([]);
  });
  it.each(['不是JSON', '{}', '{"approved":false,"issues":[]}', '{"approved":true,"issues":[{}]}'])('异常审读结果不能默认为通过：%s', async result => {
    await expect(reviewContentFacts(draft, customer, { chatFn: async () => result })).rejects.toThrow('事实核对');
  });
  it('虚构问题引文不能被当成可靠修订意见', async () => {
    await expect(reviewContentFacts(draft, customer, { chatFn: async () => JSON.stringify({ approved: false, issues: [{ index: 1, quote: '草稿中没有的句子', reason: '无依据', fix: '删除' }] }) })).rejects.toThrow('定位');
  });
  it('允许用省略号摘录同一字段中的有序原文，仍保留具体修改意见', async () => {
    const issues = await reviewContentFacts(draft, customer, { chatFn: async () => JSON.stringify({ approved: false, issues: [{ index: 1, quote: '上门测量...7-15天完工', reason: '免费项目和工期未经确认', fix: '删除具体承诺' }] }) });
    expect(issues[0]).toContain('删除具体承诺');
  });
  it('个别失效引文不丢掉其他已定位的具体修改意见，仍不能通过', async () => {
    const issues = await reviewContentFacts(draft, customer, { chatFn: async () => JSON.stringify({ approved: false, issues: [
      { index: 1, quote: '上门测量免费', reason: '用户未提供免费服务', fix: '删除免费承诺' },
      { index: 1, quote: '不存在的引文', reason: '未知', fix: '删除' },
    ] }) });
    expect(issues[0]).toContain('用户未提供免费服务');
    expect(issues[1]).toContain('需要再次核对整批');
    expect(issues.join('')).not.toContain('不存在的引文');
  });
  it('模型把问题序号当篇目序号时，仅用唯一匹配原文恢复篇目', async () => {
    const issues = await reviewContentFacts(draft, customer, { chatFn: async () => JSON.stringify({ approved: false, issues: [{ index: 8, quote: '上门测量免费', reason: '没有业务依据', fix: '删除免费承诺' }] }) });
    expect(issues[0]).toMatch(/^第1篇/);
  });
});
