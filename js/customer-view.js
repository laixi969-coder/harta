/** 客户页需要的三种档案视图。今日内容能在工作台使用，但不是甲方包裹。 */
export function artifactsForCustomer(customer) {
  if (!customer) return [];
  if (customer.track === "存量") {
    return [...(customer.drops || []), ...(customer.packs || [])];
  }
  return customer.packs || [];
}

export function clientPacksForCustomer(customer) {
  return customer?.packs || [];
}

export function latestAttributablePack(customer) {
  return artifactsForCustomer(customer)[0] || null;
}

/** 存量只有一个“出一批”入口；重出按钮只属于拓新的判断报告。 */
export function canRepackCustomer(customer) {
  return Boolean(customer?.id && customer.track === "拓新");
}

/** 判断档可以作为文件交付；今日内容留在工作台，不伪装成报告。 */
export function isJudgmentPack(pack) {
  return Boolean(pack?.id && pack.tier !== "今日");
}

export function hardBlockCount(pack) {
  const checks = pack?.checks || {};
  return [
    ...(checks.redline || []),
    ...(checks.sensitive || []),
    ...(checks.length || []).filter((row) => row.level === "hard"),
    ...(checks.quality || []).filter((row) => row.level === "hard"),
  ].length;
}

export function canExportJudgment(pack) {
  return isJudgmentPack(pack) && hardBlockCount(pack) === 0;
}
