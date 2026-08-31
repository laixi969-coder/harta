/* 模型接口返回的顺序没有统一约定：有的按字母，有的按创建时间，有的完全随机。
 * 设置页只认“越新越靠上”。优先用接口给的创建时间；没有时从模型名里的发布日期
 * （260628 / 20260415 / 2025-04-14）判断；再没有才按名称里的数字自然倒序。 */

function validDateScore(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? time : 0;
}

function dateFromModelName(model) {
  const name = String(model || "");
  const scores = [];
  for (const match of name.matchAll(/(?:^|\D)(20\d{2})[-_.](\d{2})[-_.](\d{2})(?=\D|$)/g)) {
    scores.push(validDateScore(match[1], match[2], match[3]));
  }
  for (const match of name.matchAll(/(?:^|\D)(20\d{2})(\d{2})(\d{2})(?=\D|$)/g)) {
    scores.push(validDateScore(match[1], match[2], match[3]));
  }
  for (const match of name.matchAll(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?=\D|$)/g)) {
    scores.push(validDateScore(`20${match[1]}`, match[2], match[3]));
  }
  return Math.max(0, ...scores);
}

function timestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value !== "string" || !value.trim()) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function modelCreatedAt(record) {
  return timestamp(record?.created_at ?? record?.createdAt ?? record?.created);
}

export function sortModelsNewestFirst(models, createdAt = {}) {
  return [...new Set((models || []).map(String).filter(Boolean))].sort((a, b) => {
    const aTime = timestamp(createdAt[a]) || dateFromModelName(a);
    const bTime = timestamp(createdAt[b]) || dateFromModelName(b);
    if (aTime !== bTime) return bTime - aTime;
    return b.localeCompare(a, "en", { numeric: true, sensitivity: "base" });
  });
}
