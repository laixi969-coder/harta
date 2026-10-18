import { demandLanguage, demandTime } from '../../../js/demand-rules.js';
import type { Comment, Lead, Note, LeadAssessment } from '../shared/types.ts';
export function parseIntent(text: string) {
  const n = text.match(/(\d+)\s*[篇条个]/);
  const cn = text.match(/([一二两三四五六七八九十]+)\s*[篇条个]/)?.[1];
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const cnCount = cn
    ? cn.includes('十')
      ? (digits[cn.split('十')[0]] || 1) * 10 + (digits[cn.split('十')[1]] || 0)
      : digits[cn]
    : 0;
  const limit = /不限|所有|全部/.test(text)
    ? 0
    : n
      ? Math.min(500, Math.max(1, Number(n[1])))
      : cnCount || 20;
  const known = ['医美', '家具', '装修', '家居', '咖啡', '健身', '教育', '宠物', '美妆', '穿搭'];
  const keyword =
    known.find((k) => text.includes(k)) ||
    text
      .replace(
        /帮我|请|找到|搜索|采集|最热门|热门|高互动|作品|笔记|并展示结果|找|\d+\s*[篇条个]/g,
        '',
      )
      .trim() ||
    '家居';
  return {
    keyword,
    limit,
    sort: /热门|爆款|高互动|最火/.test(text)
      ? ('popular' as const)
      : /最新|最近/.test(text)
        ? ('latest' as const)
        : ('general' as const),
    noteType: /视频/.test(text)
      ? ('video' as const)
      : /图文/.test(text)
        ? ('image' as const)
        : ('all' as const),
    explanation: `搜索「${keyword}」的${limit === 0 ? '全部' : limit + '篇'}${/视频/.test(text) ? '视频' : '作品'}，按${/热门|爆款|高互动|最火/.test(text) ? '热度' : /最新|最近/.test(text) ? '发布时间' : '相关性'}排序`,
  };
}
export function intentScore(
  body: string,
  createdAt = '',
  context = '',
  now = Date.now(),
): LeadAssessment {
  const evidence: LeadAssessment['evidence'] = [];
  const exclusions: string[] = [];
  const { ageDays } = demandTime(createdAt, now);
  const fresh =
    ageDays === null
      ? 0
      : ageDays <= 3
        ? 30
        : ageDays <= 7
          ? 24
          : ageDays <= 30
            ? 12
            : ageDays <= 90
              ? 3
              : 0;
  evidence.push({
    label: ageDays === null ? '评论日期缺失或异常，待核实' : `评论距今 ${ageDays} 天`,
    excerpt: createdAt || '无原始日期',
    points: fresh,
  });
  const sensitive =
    /hpv|hiv|艾滋|宫颈|尖锐湿疣|癌症|肿瘤|感染|确诊|治疗|病情|抑郁|焦虑症|怀孕|不孕|性取向|宗教信仰/iu.test(
      body + '\n' + context,
    );
  const { resolved, seller, purchasePath, demand, urgent } = demandLanguage(body);
  const action = purchasePath;
  if (demand) evidence.push({ label: '明确表达需求或询价', excerpt: demand[0], points: 35 });
  if (action) evidence.push({ label: '明确询问购买或联系路径', excerpt: action[0], points: 20 });
  if (urgent && demand) evidence.push({ label: '表达近期计划', excerpt: urgent[0], points: 10 });
  if (resolved) exclusions.push(`已购买、已解决或不再需要：${resolved[0]}`);
  if (seller) exclusions.push(`疑似推广而非购买咨询：${seller[0]}`);
  if (sensitive)
    exclusions.push(
      '涉及健康等敏感主题，不建立个人营销画像；仅做公开内容研究或处理用户主动授权的咨询',
    );
  if (!body.trim()) exclusions.push('没有文字内容，无法判断购买需求');
  let score = evidence.reduce((sum, e) => sum + e.points, 0);
  if (!demand) score = Math.min(score, 15);
  if (ageDays === null) score = Math.min(score, 40);
  if (ageDays !== null && ageDays > 30) score = Math.min(score, 45);
  if (exclusions.length) score = 0;
  score = Math.min(99, score);
  const stage: LeadAssessment['stage'] = sensitive
    ? 'restricted'
    : resolved
      ? 'resolved'
      : seller || !demand
        ? 'discussion'
        : action
          ? 'demand'
          : 'considering';
  return {
    version: 'intent-rules-2.3',
    assessedAt: new Date(now).toISOString(),
    score,
    stage,
    recommended: score >= 50 && !exclusions.length,
    ageDays,
    evidence,
    exclusions,
    reason:
      exclusions.join('；') ||
      (demand
        ? `${evidence.map((e) => e.label).join(' · ')}${ageDays !== null && ageDays > 30 ? ' · 较早信息，需人工确认需求是否仍存在' : ''}`
        : '仅参与讨论，未见明确购买需求'),
  };
}
export function toLead(c: Comment, note?: Note): Lead {
  const assessment = assessComment(c, note);
  return {
    id: `${c.source}:${c.authorId || c.id}:${c.noteId}`,
    commentId: c.id,
    noteId: c.noteId,
    platform: c.platform,
    name: c.author,
    authorId: c.authorId,
    region: c.region,
    content: c.body,
    score: assessment.score,
    reason: assessment.reason,
    assessment,
    commentCreatedAt: c.createdAt,
    status: assessment.stage === 'resolved' ? 'archived' : 'new',
    memo: '',
    outreach: `你好，${c.author}，看到你在相关笔记下提到「${c.body.slice(0, 36)}」，如果你还在了解，我可以分享一些资料供你参考。`,
    source: c.source,
    createdAt: new Date().toISOString(),
  };
}
export function assessComment(c: Comment, note?: Note, now = Date.now()) {
  const result = intentScore(
    c.body,
    c.createdAt,
    note ? [note.title, note.body, ...note.tags].join('\n') : '',
    now,
  );
  if (result.stage !== 'restricted' && c.authorId && c.authorId === note?.authorId) {
    const reason = '作品作者自己的评论或回复，不作为潜在购买客户';
    return {
      ...result,
      score: 0,
      stage: 'discussion' as const,
      recommended: false,
      reason,
      exclusions: [...result.exclusions, reason],
    };
  }
  return result;
}
/** Sampling priority, not a lead score or an estimate of conversion. */
export function acquisitionPriority(note: Note, comments: Comment[], now = Date.now()) {
  const context = [note.title, note.body, ...note.tags].join('\n');
  if (intentScore('', '', context, now).stage === 'restricted')
    return { tier: -1, weight: 0, reason: '敏感主题：仅作内容研究，不建立个人营销画像' };
  const sample = comments.filter((c) => c.noteId === note.id && c.source === note.source);
  const recent = sample.filter((c) => {
    const a = assessComment(c, note, now);
    return demandTime(c.createdAt, now).recent && !a.exclusions.length && !!c.body.trim();
  });
  const needs = recent.filter((c) => assessComment(c, note, now).recommended);
  const people = new Set(needs.map((c) => c.authorId || c.id)).size;
  if (people)
    return {
      tier: 3,
      weight: Math.min(people, 20),
      reason: `已读样本中有 ${people} 位近7天明确需求者，优先复核`,
    };
  if (recent.length)
    return {
      tier: 2,
      weight: Math.min(recent.length, 20),
      reason: `已读样本有 ${recent.length} 条近7天讨论，暂未发现明确需求`,
    };
  const time = Date.parse(note.publishedAt);
  const age =
    Number.isFinite(time) && time <= now + 300000 ? Math.max(0, (now - time) / 86400000) : null;
  const freshness = age === null ? 0 : age <= 7 ? 10 : age <= 30 ? 5 : 0;
  if (note.commentCountKnown === false)
    return {
      tier: 1,
      weight: freshness + 3,
      reason: '搜索页未提供评论数，需小样本采集核实；不等于零评论',
    };
  if (note.comments > 0)
    return {
      tier: 1,
      weight: freshness + Math.min(10, Math.log2(note.comments + 1)),
      reason: sample.length
        ? '已读样本未见近7天需求；可按需补查，勿当作确认客户'
        : `平台显示 ${note.comments} 条评论，日期与需求待采样核实`,
    };
  return { tier: 0, weight: freshness, reason: '暂无评论信号，暂缓采集；点赞不等于购买需求' };
}
export function viralScore(n: Note) {
  return Math.round(n.likes + n.comments * 3 + n.saves * 2);
}
