export function lineScore(fb) {
  if (fb === "replied") return 2;
  if (fb === "dead") return 0;
  return 1;
}

export function rankCopyGroups(copies, feedback, packId) {
  const groups = Object.entries(copies || {}).map(([group, lines]) => {
    const rows = lines.map((text, i) => {
      const key = `${packId}-${group}-${i}`;
      const fb = feedback?.[key];
      return { text, i, key, fb, score: lineScore(fb) };
    });
    rows.sort((a, b) => b.score - a.score || a.i - b.i);
    const score = rows.reduce((s, r) => s + r.score, 0);
    const replied = rows.filter((r) => r.fb === "replied").length;
    return { group, rows, score, replied };
  });
  groups.sort((a, b) => b.score - a.score || a.group.localeCompare(b.group, "zh"));
  return groups;
}

export function rankShells(shells, battlefields) {
  return Object.entries(shells || {})
    .map(([name, lines]) => {
      const main = (battlefields || []).includes(name);
      return { name, lines, main, score: main ? 1 : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

export function topRepliedLabel(ranked) {
  const hit = ranked.find((g) => g.replied > 0);
  if (!hit) return "";
  return `${hit.group} ${hit.replied} 条有客户反馈，已排在前面`;
}

/* 「上次有效」不能补一批货就失忆：反馈是按「哪份档的哪一行」记的，
 * 新一批自己还没反馈，但它前头的批次有。只翻当前这位客户的档，从最新往旧找，
 * 第一份有回音的就是「上次」——别的客户再有回音，也不挂到这位脸上。
 * 当前这份有回音才说「已往前排」，更早的那份说的是哪天哪组，不说排——排序只对当前这份生效。 */
export function lastEffective(customer, feedback = {}, currentPackId = "") {
  const packs = [...(customer?.drops || []), ...(customer?.packs || [])];
  packs.sort((a, b) =>
    String(b.deliveredAt || b.createdAt || "").localeCompare(
      String(a.deliveredAt || a.createdAt || ""),
    ),
  );
  for (const p of packs) {
    const groups = Object.entries(p.copies || {})
      .map(([group, lines]) => ({
        group,
        replied: lines.filter((_, i) => feedback[`${p.id}-${group}-${i}`] === "replied").length,
      }))
      .filter((g) => g.replied > 0)
      .sort((a, b) => b.replied - a.replied);
    if (!groups.length) continue;
    const hit = groups[0];
    if (p.id === currentPackId) {
      return `${hit.group} ${hit.replied} 条有客户反馈，已排在前面`;
    }
    const when = String(p.deliveredAt || p.createdAt || "").slice(5);
    const total = groups.reduce((n, g) => n + g.replied, 0);
    return `${when} 那批：${hit.group} ${hit.replied} 条有客户反馈（共 ${total} 条），这一批会优先参考这个方向`;
  }
  return "";
}
