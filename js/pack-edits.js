/* 销售发出去之前改两个字是常态。改动单独存，不覆盖原句。
 *
 * 为什么不直接把原句改掉：原句是模型写的，改后是人写的，两个都留着才知道
 * 模型系统性差在哪。一条一条看没意义，攒起来看就有意义——十次有八次把
 * 「贵司」改成「你们」，那是提示词该改，不是让销售每次手改。
 * 这是唯一一份「模型哪里不行」的真实数据。
 *
 * 反馈的 key 是「组名 + 下标」，跟文字本身无关。所以只要不动数组结构，
 * 改文字反馈自动跟着走，不用重新对齐。 */

export function copyKey(group, i) {
  return `${group}|${i}`;
}

export function shellKey(platform, i, field) {
  return `${platform}|${i}|${field}`;
}

/** 这一条最终是什么样。没改过就是原样。 */
export function edited(pack, key, raw) {
  const now = pack?.edits?.[key]?.now;
  return typeof now === "string" && now ? now : raw;
}

/** 改过没有，改之前是什么。给界面显示「改过 · 原句是 xxx」用。 */
export function editOf(pack, key) {
  return pack?.edits?.[key] || null;
}

/**
 * 真正要发出去的那一份：把改动铺进 copies 和 shells。
 * 检查、甲方页、复制按钮、补货喂给模型的，全都得用这一份——
 * 台子里存的那句和销售实际发的那句不是一句话的时候，
 * 反馈就对不上了，整条闭环建立在一个不成立的假设上。
 */
export function packAsSent(pack) {
  const copies = {};
  for (const [group, lines] of Object.entries(pack?.copies || {})) {
    copies[group] = (lines || []).map((t, i) => edited(pack, copyKey(group, i), t));
  }
  const shells = {};
  for (const [plat, items] of Object.entries(pack?.shells || {})) {
    shells[plat] = (items || []).map((raw, i) => {
      const item = typeof raw === "string" ? { title: raw } : { ...(raw || {}) };
      for (const f of ["cover", "title", "body"]) {
        if (item[f]) item[f] = edited(pack, shellKey(plat, i, f), item[f]);
      }
      return item;
    });
  }
  return { copies, shells };
}
