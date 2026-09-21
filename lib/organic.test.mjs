import { beforeEach, describe, expect, it, vi } from 'vitest';
const { chatMock, researchMock } = vi.hoisted(() => ({ chatMock: vi.fn(), researchMock: vi.fn() }));
vi.mock('./llm.mjs', () => ({ chat: chatMock, llmReady: () => true }));
vi.mock('./research.mjs', () => ({ buildResearch: researchMock, researchBrief: (c) => JSON.stringify({ direction: c.growthDirection, research: c.research }) }));
vi.mock('./check.mjs', () => ({ checkPack: () => ({ redline: [], sensitive: [], length: [], quality: [] }), checkRedline: () => [], checkSensitiveFields: () => [], checkLength: () => [] }));
const { generateTodayDrop } = await import('./generate.mjs');
const customer = { id: 'c1', name: '客户', hunt: '家装', pitch: '旧屋改造', growthDirection: '吸引重视品质的客户' };
let raw;
beforeEach(() => {
  raw = { title: '改造前的六个问题', gate: '按需求假设生成', platform: '小红书', rationale: '按需求研究选择', items: Array.from({ length: 6 }, (_, i) => ({ purpose: `问题${i}`, cover: `封面${i}`, title: `标题${i}`, body: `第${i}个改造需求，先了解现场条件，再讨论可行做法。`, visual: '拍摄现场细节', reason: '从需求开始' })) };
  chatMock.mockReset().mockImplementation(async () => JSON.stringify(raw));
  researchMock.mockReset().mockResolvedValue({ checkedAt: '2026-09-21', status: 'knowledge', warnings: ['未配置外部查询'], strategy: { platform: '小红书' } });
});
describe('零投流主生成流程', () => {
  it('研究进入生成，六篇完整小红书内容按序交付，旧反馈不决定方向', async () => {
    const pack = await generateTodayDrop(customer, { anything: 'dead' }, { material: '真实业务附件' });
    expect(researchMock.mock.calls[0][0].sourceMaterial).toBe('真实业务附件');
    const prompt = chatMock.mock.calls[0][0].user;
    expect(prompt).toContain(customer.growthDirection);
    expect(prompt).toContain('真实业务附件');
    expect(prompt).not.toContain('anything');
    expect(pack.origin.mode).toBe('organic');
    expect(Object.values(pack.copies).flat()).toHaveLength(6);
    expect(pack.shells.小红书).toHaveLength(6);
    expect(pack.shells.小红书[0].body).toContain('第0个');
    expect(pack.execution.map((i) => i.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pack.research.status).toBe('knowledge');
  });
  it('非图文平台也交付完整脚本，不丢掉正文', async () => {
    raw.platform = '抖音';
    const pack = await generateTodayDrop(customer);
    expect(pack.shells.抖音[0].title).toContain(raw.items[0].body);
  });
  it('拒收投放平台和重复旧内容', async () => {
    raw.platform = '巨量信息流';
    await expect(generateTodayDrop(customer)).rejects.toThrow('自然内容主平台');
    raw.platform = '小红书';
    await expect(generateTodayDrop({ ...customer, drops: [{ copies: { 旧: [raw.items[0].body] } }] })).rejects.toThrow('重复');
  });
});
