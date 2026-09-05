export const CONTENT_STATUSES = ["pending", "selected", "published", "paused"];

export const CONTENT_STATUS_LABELS = {
  pending: "待筛选",
  selected: "已选用",
  published: "已发布",
  paused: "暂不用",
};

export function contentItemKey(packId, lineKey) {
  return `${packId}::${lineKey}`;
}

export function contentStateOf(states, key) {
  const row = states?.[key];
  return CONTENT_STATUSES.includes(row?.status)
    ? row
    : { status: "pending", plannedAt: "", publishedAt: "" };
}

export function contentStatusLabel(status) {
  return CONTENT_STATUS_LABELS[status] || CONTENT_STATUS_LABELS.pending;
}

export function contentStateCounts(pack, states = {}, feedback = {}) {
  const counts = { total: 0, pending: 0, selected: 0, published: 0, paused: 0, replied: 0, dead: 0 };
  for (const [group, lines] of Object.entries(pack?.copies || {})) {
    for (let i = 0; i < (lines || []).length; i += 1) {
      const key = contentItemKey(pack.id, `${group}|${i}`);
      const status = contentStateOf(states, key).status;
      counts.total += 1;
      counts[status] += 1;
      const fb = feedback[`${pack.id}-${group}-${i}`];
      if (fb === "replied" || fb === "dead") counts[fb] += 1;
    }
  }
  return counts;
}

export function learningSummary(customer, pack, feedback = {}) {
  if (Array.isArray(pack?.origin?.feedbackSummary)) {
    const summary = pack.origin.feedbackSummary;
    if (!summary.length) return "生成本批时还没有已记录的效果。发布后记录平台反馈和询价，下一批会参考。";
    return `生成本批时参考了最近几批的真实反馈：${summary.map((g) => `${g.group}：${g.replied} 条有反馈、${g.dead} 条没反应`).join("；")}。`;
  }

  const older = [...(customer?.drops || []), ...(customer?.packs || [])]
    .filter((row) => row.id !== pack?.id);
  const source = older.find((row) => row.id === pack?.origin?.from) || older[0];
  if (!source) return "这是第一批内容。先标记哪些已经发布、哪些收到客户反馈，下一批才有依据。";
  const groups = Object.entries(source.copies || {})
    .map(([group, lines]) => ({
      group,
      replied: (lines || []).filter((_, i) => feedback[`${source.id}-${group}-${i}`] === "replied").length,
      dead: (lines || []).filter((_, i) => feedback[`${source.id}-${group}-${i}`] === "dead").length,
    }))
    .filter((row) => row.replied || row.dead)
    .sort((a, b) => b.replied - a.replied || a.dead - b.dead);
  if (!groups.length) return "上一批还没有结果标记。本批仍是平铺探索，发布后记录客户反馈，下一批才会更聚焦。";
  const wins = groups.filter((row) => row.replied).slice(0, 2).map((row) => `${row.group} ${row.replied} 条有客户反馈`);
  const losses = groups.filter((row) => row.dead).slice(0, 1).map((row) => `${row.group} ${row.dead} 条没反应`);
  return `本批参考了上一批：${[...wins, ...losses].join("；")}。获得客户反馈的方向会排在前面，没反应的方向会减少。`;
}
