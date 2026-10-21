import { describe, it, expect } from 'vitest';
import { ruleTeardown, teardownWork, workMaterial, buildRadar, accountProfile, teardownAccount } from './benchmark-teardown.mjs';

const work = {
  id: 'w1',
  platform: '小红书',
  title: '同样90平，我家比楼上少花9万',
  description: '先说我踩过的坑。第1步，别急着定窗。第2步，看型材厚度。\n报价从480一平到1200一平都有人报，差在五金和安装。\n评论区说“多少钱”，我按面积给你算。',
  tags: ['装修', '隔音窗'],
  images: ['a.jpg', 'b.jpg'],
  metrics: { likes: 1200, comments: 88, saves: 600 },
  authorName: '某某',
  url: 'https://www.xiaohongshu.com/explore/abc',
};
const comment = (id, text) => ({ id, text, workId: 'w1' });

describe('对标拆解', () => {
  it('规则拆解能认出数字钩子、分点结构和证据类型', () => {
    const result = ruleTeardown(work, [comment('1', '多少钱一平'), comment('2', '报价怎么算')]);
    expect(result.hookKinds).toContain('数字前置');
    expect(result.structure.find((s) => s.part === '展开').role).toContain('分点');
    expect(result.proofTypes).toContain('价格信息');
    expect(result.proofTypes).toContain('实拍图');
    expect(result.commentFeedback[0].point).toBe('价格与预算');
  });

  it('没评论时如实说明，不假装看过评论区', async () => {
    const result = await teardownWork(work, [], { modelReady: false, business: { name: '测试', hunt: '门窗' } });
    expect(result.warnings.join()).toContain('还没采评论');
    expect(result.commentFeedback).toEqual([]);
    expect(result.method).toBe('规则拆解');
  });

  it('没有正文时拒绝拆解', async () => {
    await expect(teardownWork({ id: 'x', title: '', description: '' }, [], {})).rejects.toThrow('没有抓到正文');
  });

  it('模型拆解给出可迁移与不可迁移，并保留业务选题', async () => {
    const chatFn = async () => JSON.stringify({
      angle: '用价差锚点讲省钱',
      hook: '同样90平，我家比楼上少花9万',
      hookKinds: ['数字前置', '对比锚点'],
      structure: [{ part: '开头', role: '价差锚点', note: '同样90平' }],
      proofTypes: ['真实报价'],
      action: '评论区按面积算价',
      commentFeedback: [{ point: '怕报价不透明', count: 12, quote: '多少钱一平' }],
      transferable: ['先用价差建立锚点'],
      notTransferable: ['作者自家户型和实拍图，不能用'],
      topics: [{ angle: '同户型报价差异拆解', why: '本地客户最关心差价', keywords: ['隔音窗多少钱'] }],
    });
    const result = await teardownWork(work, [comment('1', '多少钱一平')], { chatFn, modelReady: true, business: { name: '测试', hunt: '门窗' } });
    expect(result.method).toBe('模型拆解 · 人工可核');
    expect(result.choice || result.topics[0].angle).toContain('报价');
    expect(result.notTransferable[0]).toContain('实拍图');
    expect(result.commentFeedback[0].count).toBe(12);
  });

  it('模型返回坏 JSON 时退回规则结果', async () => {
    const result = await teardownWork(work, [], { chatFn: async () => '不是 JSON', modelReady: true, business: {} });
    expect(result.method).toBe('规则拆解');
    expect(result.warnings.join()).toContain('模型拆解未完成');
  });

  it('素材摘要含藏赞比与平台数据', () => {
    const material = workMaterial(work, []);
    expect(material.likeSaves).toBeCloseTo(0.5);
    expect(material.lines.length).toBeGreaterThan(1);
  });
});

describe('数据雷达', () => {
  const sibling = (id, likes, comments, saves) => ({ id, metrics: { likes, comments, saves } });
  const target = { id: 'main', metrics: { likes: 100, comments: 10, saves: 50 } };

  it('位置按同账号已采集作品的百分位算，不用行业基准', () => {
    const radar = buildRadar(target, [sibling('a', 50, 5, 10), sibling('b', 200, 20, 80), sibling('c', 20, 2, 4)]);
    expect(radar.sampleSize).toBe(4);
    expect(radar.comparable).toBe(true);
    expect(radar.axes.find((a) => a.key === 'likes').score).toBe(67);
    expect(radar.basis).toContain('百分位');
    expect(radar.basis).toContain('不是平台指数');
  });

  it('只有一条作品时不编位置，只留绝对值', () => {
    const radar = buildRadar(target, []);
    expect(radar.comparable).toBe(false);
    expect(radar.axes.every((a) => a.score === null)).toBe(true);
    expect(radar.basis).toContain('不编基准');
    expect(radar.axes.find((a) => a.key === 'likes').value).toBe(100);
  });

  it('缺字段的轴标成缺，不拿 0 冒充', () => {
    const radar = buildRadar({ id: 'x', metrics: { likes: 100 } }, [sibling('a', 10, 1, 1), sibling('b', 20, 2, 2)]);
    expect(radar.missing).toContain('收藏');
    expect(radar.axes.find((a) => a.key === 'saves').value).toBeNull();
    expect(radar.axes.find((a) => a.key === 'likes').value).toBe(100);
  });
});

describe('博主级拆解', () => {
  const authorWorks = [
    { id: 'w1', title: '同样90平，我家少花9万', description: '第1步拆墙。第2步换窗。', tags: ['装修'], publishedAt: '2026-09-01T00:00:00.000Z', metrics: { likes: 100, comments: 10, saves: 60 } },
    { id: 'w2', title: '别急着定窗，先看这3点', description: '先说结论。再展开。', tags: ['装修', '门窗'], publishedAt: '2026-09-08T00:00:00.000Z', metrics: { likes: 40, comments: 4, saves: 20 } },
    { id: 'w3', title: '隔音窗多少钱一平', description: '报价构成。', tags: ['门窗'], publishedAt: '2026-09-15T00:00:00.000Z', metrics: { likes: 30, comments: 3, saves: 10 } },
  ];
  const comments = [{ id: 'c1', text: '多少钱一平', workId: 'w1' }, { id: 'c2', text: '报价怎么算', workId: 'w1' }];

  it('账号画像只按本账号中位数定爆款，不跨账号比较', () => {
    const profile = accountProfile(authorWorks, comments);
    expect(profile.works).toBe(3);
    expect(profile.spanDays).toBe(14);
    expect(profile.medianLikes).toBe(40);
    expect(profile.hits.map((h) => h.id)).toEqual(['w1']);
    expect(profile.titlePatterns.map((p) => p.label)).toContain('否定/避坑');
    expect(profile.feedback[0].point).toBe('价格与预算');
  });

  it('作品太少时明确说不可靠', async () => {
    const result = await teardownAccount({ authorName: '某人', works: [authorWorks[0]], comments: [] }, { modelReady: false, business: {} });
    expect(result.warnings.join()).toContain('不可靠');
    expect(result.warnings.join()).toContain('没有采到评论');
    expect(result.method).toBe('规则归纳');
  });

  it('没有作品拒绝拆解', async () => {
    await expect(teardownAccount({ authorName: '空号', works: [] }, {})).rejects.toThrow('还没有采到作品');
  });

  it('模型归纳给出打法与不可搬的东西，坏 JSON 退回数据', async () => {
    const chatFn = async () => JSON.stringify({ playbook: '靠价差锚点加流程拆解', strengths: ['标题都带数字'], risks: ['本地案例不可复用'], transferable: ['价差锚点'], notTransferable: ['作者自宅照片'] });
    const result = await teardownAccount({ authorName: '某人', works: authorWorks, comments }, { chatFn, modelReady: true, business: { name: '测试', hunt: '门窗' } });
    expect(result.method).toBe('模型归纳 · 人工可核');
    expect(result.strengths).toEqual(['标题都带数字']);
    expect(result.notTransferable).toEqual(['作者自宅照片']);
    const broken = await teardownAccount({ authorName: '某人', works: authorWorks, comments }, { chatFn: async () => '不是 JSON', modelReady: true, business: {} });
    expect(broken.playbook).toBeNull();
    expect(broken.profile.works).toBe(3);
  });
});
