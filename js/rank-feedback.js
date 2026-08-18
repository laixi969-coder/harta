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
  return `${hit.group} ${hit.replied} 条有回音，已往前排`;
}
