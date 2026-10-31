/* 选题池：把已经归出来的东西，变成今天能写的那几个题。
 *
 * 三个来源都来自真实数据，不新造：
 *   痛点归集 → 这群人卡在哪，对应一个内容动作
 *   对标拆解 → 别人跑通的选题，换成自己业务能做的那一版
 *   关键词意图 → 用户在搜什么，按意图分组
 *   研究机会 → 研究方案里的待验证机会
 *
 * 池子是每次现算的，不存快照：上游数据一变，选题自动跟着变。
 * 用不用由人决定，记在 customer.topicDecisions，重算不丢。 */

const clean = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const normalize = (text) => clean(text, 200).replace(/[\s\p{P}]/gu, '').toLowerCase();

/** 同义选题只留一条；优先级按来源可信度：痛点 > 对标 > 研究 > 关键词。 */
const PRIORITY = { 客户提问: 0, 评论灵感: 1, 痛点: 2, 对标: 3, 研究: 4, 关键词: 5 };

export function buildTopicPool(customer = {}, { limit = 40, offset = 0, status = '' } = {}) {
  const rows = [];
  const add = (row) => {
    const key = normalize(row.angle || row.title);
    if (!key) return;
    const existing = rows.find((r) => r.key === key);
    if (existing) {
      // 同题不同源时保留高优先级的，但把另一来源写进证据里，便于回查。
      existing.alsoFrom = [...new Set([...(existing.alsoFrom || []), row.source])];
      if (row.keywords?.length) existing.keywords = [...new Set([...existing.keywords, ...row.keywords])].slice(0, 6);
      return;
    }
    rows.push({ ...row, key });
  };

  // Resolve duplicate angles in priority order before merging sources.
  const demandTopics=[...(customer.demandTopics || [])].sort((a,b)=>Number(a.kind==='comment')-Number(b.kind==='comment'));
  for(const topic of demandTopics) {
    if(typeof topic.title!=='string' || !topic.title.trim())continue;
    add({source:topic.kind==='comment'?'评论灵感':'客户提问',title:topic.title,angle:topic.title,why:topic.kind==='comment'?'由评论人工匿名提炼，不能据此认定购买需求。':'由真实咨询或已核实需求人工匿名提炼，适用范围需自行判断。',keywords:[],evidence:{type:'人工匿名提炼'},generatedAt:topic.createdAt||''});
  }

  const pains = customer.painClusters?.staleReason ? null : customer.painClusters;
  for (const cluster of pains?.clusters || []) {
    add({
      source: '痛点',
      title: cluster.topic,
      angle: cluster.angle || cluster.topic,
      why: cluster.anxiety || '',
      keywords: [],
      evidence: { count: cluster.count, share: cluster.share, quote: cluster.quotes?.[0]?.text || '', signalIds: cluster.signalIds || [] },
      generatedAt: pains.generatedAt || '',
    });
  }

  for (const teardown of (customer.benchmarkTeardowns || []).filter(t=>!t.staleReason)) {
    for (const topic of teardown.topics || []) {
      add({
        source: '对标',
        title: topic.angle,
        angle: topic.angle,
        why: topic.why || '',
        keywords: topic.keywords || [],
        evidence: { workTitle: teardown.title || '', workId: teardown.workId || '', author: teardown.author || '' },
        generatedAt: teardown.generatedAt || '',
      });
    }
  }

  for (const opportunity of customer.research?.strategy?.opportunities || []) {
    add({
      source: '研究',
      title: opportunity.need || opportunity.angle,
      angle: opportunity.angle || opportunity.need,
      why: opportunity.reason || '',
      keywords: [],
      evidence: { sourceIds: opportunity.sourceIds || [] },
      generatedAt: customer.research?.checkedAt || '',
    });
  }

  for (const batch of customer.keywordLibraries || []) {
    for (const group of batch.analysis?.groups || []) {
      add({
        source: '关键词',
        title: group.topic,
        angle: group.angle || `${group.topic}：按用户搜索意图出一批内容`,
        why: group.scenario || '',
        keywords: (batch.items || []).filter((item) => group.ids?.includes(item.id)).map((item) => item.keyword).slice(0, 6),
        evidence: { scope: batch.scope?.name || '', count: group.ids?.length || 0 },
        generatedAt: batch.createdAt || '',
      });
    }
  }

  const decisions = customer.topicDecisions || {};
  const all = rows
    .sort((a, b) => PRIORITY[a.source] - PRIORITY[b.source])
    .map((row, index) => ({
      id: `T${index + 1}`,
      key: row.key,
      source: row.source,
      alsoFrom: row.alsoFrom || [],
      title: clean(row.title, 120),
      angle: clean(row.angle, 300),
      why: clean(row.why, 300),
      keywords: (row.keywords || []).slice(0, 6),
      evidence: row.evidence || {},
      generatedAt: row.generatedAt || '',
      status: decisions[row.key] === 'used' ? '已用' : decisions[row.key] === 'skipped' ? '不用' : '候选',
    }));
  const filtered=status?all.filter(t=>t.status===status):all;
  const start=filtered.length?Math.min(offset,Math.floor((filtered.length-1)/limit)*limit):0;
  const pool=filtered.slice(start,start+limit);

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      客户提问: (customer.demandTopics || []).filter(t=>t.kind!=='comment').length,
      评论灵感: (customer.demandTopics || []).filter(t=>t.kind==='comment').length,
      痛点: (pains?.clusters || []).length,
      对标: (customer.benchmarkTeardowns || []).filter(t=>!t.staleReason).reduce((n, t) => n + (t.topics || []).length, 0),
      研究: (customer.research?.strategy?.opportunities || []).length,
      关键词: (customer.keywordLibraries || []).reduce((n, b) => n + (b.analysis?.groups || []).length, 0),
    },
    topics: pool,
    total:filtered.length,
    offset:start,
    limit,
    counts: {
      候选: all.filter((t) => t.status === '候选').length,
      已用: all.filter((t) => t.status === '已用').length,
      不用: all.filter((t) => t.status === '不用').length,
    },
    note: pool.length ? '选题由当前业务的人工匿名提炼、痛点归集、对标拆解、关键词分组和研究方案现算，上游一变就跟着变。' : '还没有可用的选题来源：先归集评论、拆解对标，或导入关键词。',
  };
}

export function topicByKey(customer, key) {
  return buildTopicPool(customer,{limit:Number.MAX_SAFE_INTEGER}).topics.find((row) => row.key === key) || null;
}

/** 写成保存的方向文本。追加而不是覆盖用户手写的内容。 */
export function directionTextFor(topic) {
  return `【本批选题】${topic.angle}${topic.why ? `\n为什么：${topic.why}` : ''}${topic.keywords?.length ? `\n可用搜索词：${topic.keywords.join('、')}` : ''}`;
}

export function appendDirection(current, topic) {
  const text = directionTextFor(topic);
  const base = String(current || '').trim();
  // Only a previously appended topic is a duplicate; a casual mention is not.
  if (base.split('\n').includes(`【本批选题】${topic.angle}`)) return base;
  const next = [base, text].filter(Boolean).join('\n');
  if (next.length > 2000) throw new Error('加入这个选题会超过2000字，请先精简已保存的调整方向后重试');
  return next;
}

export function recordDecision(decisions, key, status) {
  const next = { ...(decisions || {}) };
  if (status === '候选') delete next[key];
  else next[key] = status;
  return next;
}
