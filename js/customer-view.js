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
