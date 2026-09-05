import { copyKey, edited, shellKey } from "./pack-edits.js";
import { contentItemKey, contentStateOf } from "./content-workflow.js";

export const shellFeedbackKey = (packId, platform, index) => `${packId}-平台-${platform}-${index}`;

/** One platform post is one outcome, even when it has cover, title and body. */
export function attributionEntries(pack) {
  const entries = [];
  for (const [group, lines] of Object.entries(pack?.copies || {})) {
    lines.forEach((text, i) => entries.push({
      key: `${pack.id}-${group}-${i}`, packId: pack.id, group, platform: "", kind: "copy",
      text: edited(pack, copyKey(group, i), text),
      contentKeys: [contentItemKey(pack.id, copyKey(group, i))],
    }));
  }
  for (const [platform, items] of Object.entries(pack?.shells || {})) {
    items.forEach((raw, i) => {
      const item = typeof raw === "string" ? { title: raw } : raw || {};
      const fields = ["cover", "title", "body"].filter((field) => item[field]);
      if (!fields.length) return;
      entries.push({
        key: shellFeedbackKey(pack.id, platform, i), packId: pack.id,
        group: `${platform} · 第 ${i + 1} 条`, platform, kind: "shell",
        text: fields.map((field) => edited(pack, shellKey(platform, i, field), item[field])).join("\n"),
        contentKeys: fields.map((field) => contentItemKey(pack.id, shellKey(platform, i, field))),
      });
    });
  }
  return entries;
}

export function customerAttributions(customer) {
  return [...(customer?.drops || []), ...(customer?.packs || [])].flatMap((pack) =>
    attributionEntries(pack).map((entry) => ({ ...entry, date: pack.date || pack.deliveredAt || pack.createdAt || "", batch: pack.batch || "" })),
  );
}

export function dueContent(customer, states, day) {
  return (customer?.drops || []).flatMap((pack) => attributionEntries(pack).flatMap((entry) =>
    entry.contentKeys.flatMap((key) => {
      const state = contentStateOf(states, key);
      return state.status === "selected" && state.plannedAt && state.plannedAt <= day
        ? [{ key, packId: pack.id, plannedAt: state.plannedAt }] : [];
    }),
  )).sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
}

/** Counts recorded activity, never estimates impressions, unique leads or conversion rates. */
export function platformOutcomes(customer, states = {}, feedback = {}, ledger = []) {
  const rows = new Map();
  const row = (platform) => {
    if (!rows.has(platform)) rows.set(platform, { platform, published: 0, replied: 0, dead: 0, interested: 0, asked: 0, deals: 0 });
    return rows.get(platform);
  };
  for (const entry of customerAttributions(customer).filter((entry) => entry.platform)) {
    const r = row(entry.platform);
    if (entry.contentKeys.every((key) => contentStateOf(states, key).status === "published")) r.published++;
    if (feedback[entry.key] === "replied") r.replied++;
    if (feedback[entry.key] === "dead") r.dead++;
  }
  for (const event of ledger) {
    if (event.demo || event.customerId !== customer?.id || !event.platform) continue;
    const r = row(event.platform);
    if (event.result === "有兴趣") r.interested++;
    if (event.result === "问了价") r.asked++;
    if (event.result === "成交") r.deals++;
  }
  return [...rows.values()];
}
