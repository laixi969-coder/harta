function sourceKey(image, index) {
  const label = String(image?.label || "").trim();
  return label ? label.replace(/\s*·\s*画面\s+\d+\s*$/u, "") : `未标注-${index}`;
}

/**
 * 模型一次最多吃有限张画面。按资料轮询取样，避免一个长视频或多页 PDF
 * 抢完额度，让后面的附件一张都没被看到。
 */
export function selectVisualEvidence(images, limit = 8) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  const groups = new Map();
  (Array.isArray(images) ? images : []).forEach((image, index) => {
    if (!image?.data || !image?.mime) return;
    const key = sourceKey(image, index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(image);
  });
  const queues = [...groups.values()];
  const selected = [];
  while (selected.length < cap && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      if (selected.length >= cap) break;
      const next = queue.shift();
      if (next) selected.push(next);
    }
  }
  return selected;
}
