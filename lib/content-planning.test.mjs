import { describe, expect, it, vi } from 'vitest';
import { buildCreativePlan, candidateIssues, planningSources, selectionIssues } from './content-planning.mjs';
import { renderCreationPlan, renderMaterialSuggestion, renderRecommendation } from '../js/content-plan.js';

const customer = { pitch: '杭州厨房局部翻新', salesMaterial: '只做厨房局部翻新，不提供免费上门服务。', research: { sources: [{ id: 'S1', excerpt: '第三方公开资料' }] } };
const candidates = () => Array.from({ length: 6 }, (_, i) => ({
  id: `C${i + 1}`, audience: '准备局部翻新的业主', question: `核对项目${i + 1}`, angle: `具体切口${i + 1}`,
  format: '清单', payoff: '学会核对计费口径', hook: '报价怎么比', action: '和家人一起核对', production: '用纸笔画示意图', evidenceKind: 'guidance', assetIds: [], sourceIds: [],
}));
const proposal = () => ({ platform: '小红书', rationale: '回答业主决策问题，效果待验证', assets: [{ id: 'E1', sourceId: 'B2', quote: '只做厨房局部翻新', use: '说明服务对象，不能推断工期' }], candidates: candidates() });
const decision = () => ({ selected: [{ candidateId: 'C5', reason: '可用纸笔展示核对方法' }, { candidateId: 'C2', reason: '帮助比较报价' }], rejected: ['C1', 'C3', 'C4', 'C6'].map(candidateId => ({ candidateId, reason: '相对入选项信息增量不足' })), materialRequest: '可补充一份隐去个人信息的报价单。' });

describe('真实素材与候选筛选', () => {
  it('仅已确认事实可作为素材，待确认/停用事实不进入摘录来源', () => {
    const sources = planningSources({ ...customer, factCards: [
      { status: 'pending', text: '免费上门' }, { status: 'retired', text: '两天完工' },
      { status: 'confirmed', text: '只在杭州服务', source: '用户确认', scope: '当前业务' },
    ] });
    expect(sources.find(source => source.id === 'BF1')).toMatchObject({ text: '只在杭州服务', label: expect.stringContaining('当前业务') });
    expect(sources.some(source => source.text === '免费上门' || source.text === '两天完工')).toBe(false);
  });
  it('原文不存在、拼接原文和错配来源必须拒绝', () => {
    const sources = planningSources(customer);
    for (const asset of [
      { quote: '免费上门测量' }, { quote: '只做厨房免费上门服务' }, { sourceId: 'B1' },
    ]) {
      const raw = proposal(); Object.assign(raw.assets[0], asset);
      expect(candidateIssues(raw, sources, customer.research).join('；')).toContain('原文不在');
    }
    expect(candidateIssues(proposal(), sources, customer.research)).toEqual([]);
  });
  it('长附件未纳入的片段不能充当本轮已读素材', () => {
    const sources = planningSources({ sourceMaterial: `开头${'甲'.repeat(25000)}被取样省略的唯一证据${'乙'.repeat(25000)}结尾` });
    const raw = proposal(); raw.assets[0] = { id: 'E1', sourceId: 'B3', quote: '被取样省略的唯一证据', use: '不能声称读过' };
    expect(candidateIssues(raw, sources, {}).join('；')).toContain('原文不在');
  });
  it('无资料仍允许一般建议；伪造素材编号、来源编号及无依据的事实候选会拒绝', () => {
    const raw = proposal(); raw.assets = [];
    expect(candidateIssues(raw, [], {})).toEqual([]);
    raw.candidates[0].evidenceKind = 'documented';
    expect(candidateIssues(raw, [], {}).join('；')).toContain('没有事实依据');
    raw.candidates[0].assetIds = ['E999']; raw.candidates[0].sourceIds = ['S999'];
    expect(candidateIssues(raw, [], {}).join('；')).toContain('只能引用');
  });
  it('组合表达形式可以采用，业务来源误填为研究来源则给出明确修正提示', () => {
    const raw = proposal(); raw.candidates[0].format = '图文清单 / 纸笔对照';
    expect(candidateIssues(raw, planningSources(customer), customer.research)).toEqual([]);
    raw.candidates[0].format = '图文对照，先列施工范围，再核对计费口径，最后比较数量。'.repeat(4);
    expect(candidateIssues(raw, planningSources(customer), customer.research)).toEqual([]);
    raw.candidates[0].sourceIds = ['B2'];
    expect(candidateIssues(raw, planningSources(customer), customer.research).join('；')).toContain('业务来源B/BF编号不能填这里');
    delete raw.candidates[0].payoff;
    expect(candidateIssues(raw, planningSources(customer), customer.research).join('；')).toContain('缺少非空文字字段：payoff');
  });
  it('拒绝重复候选、漏选、重复选择和不存在的候选', () => {
    const raw = proposal(); Object.assign(raw.candidates[1], { question: raw.candidates[0].question, angle: `${raw.candidates[0].angle}！` });
    expect(candidateIssues(raw, planningSources(customer), customer.research).join('；')).toContain('重复');
    for (const modify of [d => d.rejected.pop(), d => { d.selected[0].candidateId = 'C999'; }, d => { d.selected[0].candidateId = 'C2'; }]) {
      const value = decision(); modify(value);
      expect(selectionIssues(value, candidates()).join('；')).toContain('覆盖所有候选');
    }
  });
  it('兼容id作为候选引用，但不能用别名绕过编号一致性检查', () => {
    const value = decision();
    value.selected = value.selected.map(({ candidateId, reason }) => ({ id: candidateId, reason }));
    expect(selectionIssues(value, candidates())).toEqual([]);
    value.selected[0].candidateId = 'C6';
    expect(selectionIssues(value, candidates()).join('；')).toContain('不能互相矛盾');
  });
  it('两次独立请求，按评审顺序选出较后候选，保留原文与淘汰理由且不改变客户', async () => {
    const before = structuredClone(customer), calls = [];
    const requestJson = vi.fn(async options => {
      calls.push(options);
      const value = calls.length === 1 ? proposal() : decision();
      expect(options.accept(value)).toBe('');
      return value;
    });
    const plan = await buildCreativePlan(customer, { requestJson, context: '用户目标：传播；无出镜条件', history: ['已发文章'] });
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(calls[1].user).toContain('独立比较');
    expect(calls.every(call => call.user.includes('已发文章') && call.user.includes('无出镜条件'))).toBe(true);
    expect(plan.selected.map(row => row.candidateId)).toEqual(['C5', 'C2']);
    expect(plan.assets[0].quote).toBe('只做厨房局部翻新');
    expect(plan.rejected).toHaveLength(4);
    expect(customer).toEqual(before);
  });
});

describe('用户看到的推荐与历史说明', () => {
  const pack = { creationPlan: { ...proposal(), ...decision() }, execution: [{ reason: '把 <报价> 讲清楚' }] };
  it('推荐理由转义且在手工编辑后隐藏，不把旧依据冒充新推荐', () => {
    expect(renderRecommendation(pack, '小红书', 0)).toContain('建议先发');
    expect(renderRecommendation(pack, '小红书', 0)).toContain('&lt;报价&gt;');
    expect(renderRecommendation({ ...pack, edits: { '小红书|0|body': { now: '手工改稿' } } }, '小红书', 0)).toBe('');
    expect(renderRecommendation({ execution: pack.execution }, '小红书', 0)).toBe('');
  });
  it('补材料和筛选原理默认折叠，旧批次不出现新字段，外部文本不能注入HTML', () => {
    const html = renderCreationPlan({ ...pack, creationPlan: { ...pack.creationPlan, materialRequest: '<script>坏</script>', candidates: [{ ...candidates()[0], angle: '<img onerror=bad>' }] } });
    expect(html).toContain('&lt;img onerror=bad&gt;');
    expect(html).toContain('生成时的筛选快照');
    expect(html).not.toContain('<details open');
    expect(renderMaterialSuggestion(pack)).toContain('不补充也可以继续生成');
    expect(renderMaterialSuggestion({})).toBe('');
    expect(renderCreationPlan({})).toBe('');
  });
});
