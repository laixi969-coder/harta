import { beforeEach, describe, expect, it, vi } from 'vitest';
const { chatMock, researchMock } = vi.hoisted(() => ({ chatMock: vi.fn(), researchMock: vi.fn() }));
vi.mock('./llm.mjs', () => ({ chat: chatMock, llmReady: () => true }));
vi.mock('./research.mjs', () => ({ buildResearch: researchMock, researchBrief: (c) => JSON.stringify({ direction: c.growthDirection, research: c.research }) }));
vi.mock('./check.mjs', () => ({ checkPack: () => ({ redline: [], sensitive: [], length: [], quality: [] }), checkRedline: () => [], checkSensitiveFields: () => [], checkLength: () => [] }));
const { generateTodayDrop } = await import('./generate.mjs');
const customer = { id: 'c1', name: '客户', hunt: '家装', pitch: '旧屋改造', growthDirection: '吸引重视品质的客户' };
let raw;
beforeEach(() => {
  raw = { title: '改造前的六个问题', gate: '按需求假设生成', platform: '小红书', rationale: '按需求研究选择', items: Array.from({ length: 6 }, (_, i) => ({ purpose: `问题${i}`, cover: `封面${i}`, coverLayout:'大字靠左，现场细节在右，边缘留白', title: `标题${i}`, body: `第${i}个改造需求，先了解现场条件，再讨论可行做法。`, visual: '拍摄现场细节', reason: '从需求开始' })) };
  chatMock.mockReset().mockImplementation(async () => JSON.stringify(raw));
  researchMock.mockReset().mockResolvedValue({ checkedAt: '2026-09-21', status: 'knowledge', warnings: ['未配置外部查询'], strategy: { platform: '小红书' } });
});
describe('零投流主生成流程', () => {
  it('研究进入生成，六篇完整小红书内容按序交付，旧反馈不决定方向', async () => {
    const pack = await generateTodayDrop(customer, { anything: 'dead' }, { material: '真实业务附件' });
    expect(researchMock.mock.calls[0][0].sourceMaterial).toBe('真实业务附件');
    const prompt = chatMock.mock.calls[0][0].user;
    expect(prompt).toContain(customer.growthDirection);
    expect(chatMock.mock.calls[0][0].system).toContain('不是机构准入、资质或法律审核机构');
    expect(prompt).toContain('真实业务附件');
    expect(prompt).not.toContain('anything');
    expect(pack.origin.mode).toBe('organic');
    expect(Object.values(pack.copies).flat()).toHaveLength(6);
    expect(pack.shells.小红书).toHaveLength(6);
    expect(pack.shells.小红书[0].body).toContain('第0个');
    expect(pack.execution.map((i) => i.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pack.research.status).toBe('knowledge');
  });
  it.each(['抖音','视频号'])('%s独立交付发布文案、口播与拍摄信息', async (platform) => {
    raw.platform = platform;
    raw.items.forEach(i=>Object.assign(i,{hook:'镜头对准墙角，先问这里是否漏水',shots:'0-3秒｜墙角｜提出问题\n3-20秒｜近景｜演示核对\n20-30秒｜人物｜说明下一步',cta:'可以先确认现场情况'}));
    const pack = await generateTodayDrop(customer);
    expect(pack.shells[platform][0].title).toBe(raw.items[0].title);
    expect(pack.shells[platform][0].body).toBe(raw.items[0].body);
    expect(pack.shells[platform][0].shots).toContain('3-20秒');
    expect(pack.shells[platform][0].hook).toBeTruthy();
    expect(pack.origin.deliveryVersion).toBe(2);
  });
  it('超20字标题退回模型修正，不截断交付',async()=>{
    const bad=structuredClone(raw);bad.items[0].title='字'.repeat(21);
    chatMock.mockResolvedValueOnce(JSON.stringify(bad));
    const pack=await generateTodayDrop(customer);
    expect(chatMock.mock.calls[1][0].user).toContain('21字，最多20字');
    expect(pack.shells.小红书[0].title).toBe(raw.items[0].title);
  });
  it.each(['title','cover','coverLayout'])('拒绝持续缺少%s的稿件',async field=>{
    delete raw.items[0][field];
    await expect(generateTodayDrop(customer)).rejects.toThrow('没出成');
  });
  it('标题按保守字符计数，英文和标点不能绕过20字',async()=>{
    raw.items[0].title='HPV'+ '字'.repeat(17)+'？';
    await expect(generateTodayDrop(customer)).rejects.toThrow('21字');
  });
  it('视频只有一段正文，没有分镜不能交付',async()=>{
    raw.platform='视频号';
    await expect(generateTodayDrop(customer)).rejects.toThrow('分镜');
  });
  it('拒收投放平台和重复旧内容', async () => {
    raw.platform = '巨量信息流';
    await expect(generateTodayDrop(customer)).rejects.toThrow('自然内容主平台');
    raw.platform = '小红书';
    await expect(generateTodayDrop({ ...customer, drops: [{ copies: { 旧: [raw.items[0].body] } }] })).rejects.toThrow('重复');
  });
});
