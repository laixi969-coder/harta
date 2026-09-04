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
  const older = [...(customer?.drops || []), ...(customer?.packs || [])]
    .filter((row) => row.id !== pack?.id);
  const source = older.find((row) => row.id === pack?.origin?.from) || older[0];
  if (!source) return "这是第一批内容。先标记哪些真正发布、哪些有回音，下一批才有依据。";
  const groups = Object.entries(source.copies || {})
    .map(([group, lines]) => ({
      group,
      replied: (lines || []).filter((_, i) => feedback[`${source.id}-${group}-${i}`] === "replied").length,
      dead: (lines || []).filter((_, i) => feedback[`${source.id}-${group}-${i}`] === "dead").length,
    }))
    .filter((row) => row.replied || row.dead)
    .sort((a, b) => b.replied - a.replied || a.dead - b.dead);
  if (!groups.length) return "上一批还没有结果标记。本批仍是平铺探索，发布后记下回音，下一批才会收窄。";
  const wins = groups.filter((row) => row.replied).slice(0, 2).map((row) => `${row.group} ${row.replied} 条有回音`);
  const losses = groups.filter((row) => row.dead).slice(0, 1).map((row) => `${row.group} ${row.dead} 条没反应`);
  return `本批参考了上一批：${[...wins, ...losses].join("；")}。有回音的方向会往前排，没反应的方向会减少。`;
}
