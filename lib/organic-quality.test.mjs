import { beforeEach, describe, expect, it, vi } from 'vitest';
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
const { factReviewMock } = vi.hoisted(() => ({ factReviewMock: vi.fn() }));
vi.mock('./llm.mjs', () => ({ chat: chatMock, llmReady: () => true }));
vi.mock('./content-review.mjs', () => ({ reviewContentFacts: factReviewMock }));
vi.mock('./research.mjs', () => ({
  buildResearch: async () => ({ checkedAt: '2026-10-02', status: 'knowledge', sources: [], warnings: ['未配置外部搜索'] }),
  researchBrief: () => '未配置外部搜索，不得声称已经核实',
}));
import { collectRepairs, generateTodayDrop } from './generate.mjs';
import { checkPack, hasHardBlock } from './check.mjs';
import { packAsSent } from './pack-edits.mjs';

const customer = { name: '青禾', hunt: '家装', city: '杭州', pitch: '旧房局部改造' };
const topics = [
  ['拆墙之前问谁', '这面墙能不能拆', '拆墙前先核对房屋原始结构资料，无法判断承重关系时请结构专业人员确认。不要仅凭墙体厚度决定施工。'],
  ['水电增项怎么算', '报价漏掉了什么', '比较水电报价时，把按米计算的项目和按点位计费的项目分开，确认数量如何复核。先对齐计费口径，再比总价。'],
  ['翻新期间住哪里', '边住边装可行吗', '局部施工也会影响通水通电，安排居住前先和施工方确认每天的作业区域与恢复时间。无法保证基本生活时另做住宿安排。'],
  ['橱柜尺寸何时量', '别急着下单', '橱柜初测和复尺解决的问题不同。墙地面完成状态会影响最终尺寸，下单前把复尺节点写进双方确认的计划。'],
  ['防水验收看什么', '看过才能签收', '防水验收应记录施工范围、试验条件和检查结果，不能只凭表面干燥判断。让施工方说明采用的验收依据。'],
  ['工期为什么延后', '日期要说清楚', '合同里的工期如果只写天数，需要确认是工作日还是自然日，并约定材料延迟和变更方案时如何调整。留下双方确认记录。'],
];
const good = () => ({ title: '局部翻新前先弄清六件事', gate: '基于用户业务信息与一般决策建议，未核实外部规则', platform: '小红书', rationale: '用于回答业主决策问题，平台效果待验证', items: topics.map(([title, cover, body], i) => ({
  title, cover, body, coverLayout: '主文字居中，配对应空间局部画面，四周留白', purpose: `决策问题${i + 1}`, visual: '用纸笔画示意图，无需真实客户案例', reason: '先判断条件，再讨论施工与交付',
  growth: { role: '消除决策疑虑', hookReason: title, actionReason: '帮助业主核对条件', hypothesis: '可否带来符合服务条件的咨询待验证' }, brief: { audience: '准备局部翻新的业主', question: title, takeaway: cover, evidence: '一般决策建议，具体房屋情况需另行确认', nextStep: '核对自家情况与双方约定', sourceIds: [] },
})) });
beforeEach(() => { chatMock.mockReset().mockImplementation(async () => JSON.stringify(good())); factReviewMock.mockReset().mockResolvedValue([]); });

describe('自然内容的真实交付检查', () => {
  it('整篇纠错后基础文案、平台正文、检查和改动记录一致', async () => {
    const bad = good();
    bad.items[0].body = '专业团队提供一站式服务，立即咨询。';
    chatMock.mockResolvedValueOnce(JSON.stringify(bad));
    const pack = await generateTodayDrop(customer);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(chatMock.mock.calls[1][0].user).toContain('上一版完整草稿');
    expect(pack.shells.小红书[0].body).toBe(good().items[0].body);
    expect(Object.values(pack.copies)[0][0]).toBe(pack.shells.小红书[0].body);
    expect(hasHardBlock(pack.checks)).toBe(false);
    expect(pack.origin.repairs).toContainEqual(expect.objectContaining({ was: bad.items[0].body, now: good().items[0].body }));
  });
  it('修不掉的硬问题明确失败，不返回貌似完成却无法发布的批次', async () => {
    const bad = good();
    bad.items[0].body = '专业团队提供一站式服务，立即咨询。';
    chatMock.mockResolvedValue(JSON.stringify(bad));
    await expect(generateTodayDrop(customer)).rejects.toThrow('口号');
    expect(chatMock).toHaveBeenCalledTimes(3);
  });
  it('格式合格但事实核对失败也必须修订，持续不通过不能交付', async () => {
    factReviewMock.mockResolvedValue(['第1篇承诺免费上门，资料没有支持']);
    await expect(generateTodayDrop(customer)).rejects.toThrow('免费上门');
    expect(chatMock).toHaveBeenCalledTimes(3);
    expect(chatMock.mock.calls[1][0].user).toContain('资料没有支持');
  });
  it('事实修订通过后记录审读范围，不把模型辅助核对当独立认证', async () => {
    factReviewMock.mockResolvedValueOnce(['第1篇承诺免费上门，资料没有支持']);
    const pack = await generateTodayDrop(customer);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(pack.origin.factReview.scope).toContain('非独立事实认证');
  });
  it('用户改正平台正文后，隐藏的旧基础文案不再产生残留硬错误', async () => {
    const pack = await generateTodayDrop(customer);
    const group = Object.keys(pack.copies)[0];
    pack.copies[group][0] = '专业团队立即咨询';
    pack.shells.小红书[0].body = '专业团队立即咨询';
    pack.edits = { '小红书|0|body': { was: '专业团队立即咨询', now: good().items[0].body } };
    expect(hasHardBlock(checkPack(pack, customer.hunt))).toBe(false);
    expect(packAsSent(pack).copies[group][0]).toBe(good().items[0].body);
    expect(pack.copies[group][0]).toBe('专业团队立即咨询');
  });
  it('异常items结构可重试成功，不在保存修订记录时再次崩溃', async () => {
    chatMock.mockResolvedValueOnce(JSON.stringify({ ...good(), items: {} }));
    expect((await generateTodayDrop(customer)).shells.小红书).toHaveLength(6);
  });
  it('手动自动修复仍写入可见的平台正文，不只修改隐藏的基础文案', async () => {
    const pack = await generateTodayDrop(customer);
    pack.shells.小红书[1].body = pack.shells.小红书[0].body;
    chatMock.mockResolvedValue(JSON.stringify({ 改好的句子: { '小红书|1|body': good().items[1].body } }));
    const fixes = await collectRepairs(pack, customer);
    expect(fixes).toContainEqual(expect.objectContaining({ key: '小红书|1|body', now: good().items[1].body }));
    expect(fixes.some(row => row.key === '2. 决策问题2|0')).toBe(false);
  });
  it.each(['抖音', '视频号', '快手', 'B站', '朋友圈', '公众号', '知乎'])('%s完整字段经过真实检查可交付', async platform => {
    const raw = good();
    raw.platform = platform;
    raw.items.forEach(item => Object.assign(item, { hook: '对准纸上的问题，说清要核对的条件', shots: '0-3秒｜问题卡｜提出具体疑问\n3-30秒｜示意图｜逐步说明判断条件\n30-40秒｜核对表｜说明下一步', cta: '先核对自家情况与约定' }));
    chatMock.mockResolvedValue(JSON.stringify(raw));
    const pack = await generateTodayDrop(customer);
    expect(hasHardBlock(pack.checks)).toBe(false);
    expect(pack.shells[platform]).toHaveLength(6);
  });
});
