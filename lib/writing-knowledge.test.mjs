import { describe, it, expect } from 'vitest';
import { distillPlaybook, editRules, validatedPosts, writingBrief, refreshPlaybook } from './writing-knowledge.mjs';

const pack = (over = {}) => ({
  id: 'p1',
  date: '2026-10-02',
  origin: { mode: 'organic', createdAt: '2026-10-01' },
  shells: { 小红书: [{ title: '标题里也有句号。', body: '先说结论：报价差在三处。后面是展开。' }] },
  copies: { 'A 避坑': ['文案开头一句。第二句。'] },
  execution: [{ brief: { question: '客户怕报价不透明', evidence: '真实报价区间', nextStep: '评论区问面积' }, reason: '价差好懂' }],
  edits: { '小红书|0|body': { was: '贵司', now: '你们' } },
  ...over,
});
const customer = (packs) => ({ id: 'c1', name: '测试', packs });

describe('写作知识库', () => {
  it('只取有回音的那条，开头取正文第一句而不是标题', () => {
    const rows = validatedPosts(customer([pack()]), { 'p1-平台-小红书-0': 'replied', 'p1-A 避坑-0': 'dead' });
    expect(rows).toHaveLength(1);
    expect(rows[0].opener).toBe('先说结论：报价差在三处。');
    expect(rows[0].angle).toBe('客户怕报价不透明');
  });

  it('没回音、没改稿就是空，不编方法卡', () => {
    const playbook = distillPlaybook(customer([pack({ edits: {} })]), {});
    expect(playbook.cards).toEqual([]);
    expect(playbook.editRules).toEqual([]);
    expect(playbook.warnings.join()).toContain('还没有「有回音」的内容');
    expect(writingBrief(playbook)).toBe('');
  });

  it('只有改稿记录时也照实给出，不假装有已验证内容', () => {
    const playbook = distillPlaybook(customer([pack()]), {});
    const brief = writingBrief(playbook);
    expect(playbook.cards).toEqual([]);
    expect(brief).toContain('「贵司」→「你们」');
    expect(brief).not.toContain('角度：');
  });

  it('改稿记录按原句→改后聚合，长整篇替换不算语气偏好', () => {
    const p = pack({
      edits: {
        '小红书|0|body': { was: '贵司', now: '你们' },
        '小红书|1|body': { was: '贵司', now: '你们' },
        '小红书|2|body': { was: 'x'.repeat(90), now: 'y'.repeat(90) },
      },
    });
    const rules = editRules(customer([p]));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ was: '贵司', now: '你们', count: 2 });
  });

  it('底稿文本带上角度、证据、改稿偏好和语气样本', () => {
    const playbook = distillPlaybook(customer([pack()]), { 'p1-平台-小红书-0': 'replied' });
    const brief = writingBrief(playbook);
    expect(brief).toContain('客户怕报价不透明');
    expect(brief).toContain('真实报价区间');
    expect(brief).toContain('「贵司」→「你们」');
    expect(brief).toContain('先说结论：报价差在三处。');
    expect(brief).toContain('不得复用具体案例');
  });

  it('数据没变就不重复写盘', () => {
    const space = { feedback: { 'p1-平台-小红书-0': 'replied' } };
    const c = customer([pack()]);
    const first = refreshPlaybook(space, c, space.feedback);
    const second = refreshPlaybook(space, c, space.feedback);
    expect(second).toBe(first);
  });

  it('同一角度两次没反应就淘汰，不再当经验用', () => {
    const p = pack({
      shells: { 小红书: [{ title: 'A', body: '开头一。' }, { title: 'B', body: '开头二。' }] },
      execution: [
        { brief: { question: '客户怕报价不透明' } },
        { brief: { question: '客户怕报价不透明' } },
      ],
    });
    const playbook = distillPlaybook(customer([p]), { 'p1-平台-小红书-0': 'dead', 'p1-平台-小红书-1': 'dead' });
    expect(playbook.cards).toEqual([]);
    expect(playbook.retired).toEqual([{ angle: '客户怕报价不透明', misses: 2 }]);
    expect(playbook.warnings.join()).toContain('已不再当经验用');
  });

  it('有回音的写法带次数并排在前，没回音的不进方法卡', () => {
    const p = pack({
      shells: { 小红书: [{ title: 'A', body: '开头一。' }, { title: 'B', body: '开头二。' }] },
      execution: [
        { brief: { question: '角度甲' } },
        { brief: { question: '角度乙' } },
      ],
    });
    const playbook = distillPlaybook(customer([p]), { 'p1-平台-小红书-0': 'replied', 'p1-平台-小红书-1': 'dead' });
    expect(playbook.cards.map((c) => c.angle)).toEqual(['角度甲']);
    expect(playbook.cards[0].hits).toBe(1);
    expect(playbook.cards[0].misses).toBe(0);
  });

  it('跟上一轮比，记下新增与淡出的角度', () => {
    const previous = { cards: [{ angle: '旧角度' }] };
    const playbook = distillPlaybook(customer([pack()]), { 'p1-平台-小红书-0': 'replied' }, { previous });
    expect(playbook.evolution.added).toEqual(['客户怕报价不透明']);
    expect(playbook.evolution.dropped).toEqual(['旧角度']);
  });
});
