export const PRICING_VERSION = '2026-11-11';
export const DEFAULT_BUDGETS = Object.freeze({ model: '50', data: '50', image: '20' });
export const PLANS = Object.freeze([
  Object.freeze({ id: 'solo', name: '个人版', monthlyCents: 9900, accounts: 1, businesses: 3, audience: '独立经营，先跑通一条获客路径' }),
  Object.freeze({ id: 'business', name: '经营版', monthlyCents: 29900, accounts: 1, businesses: 10, audience: '持续创作，管理多项产品与服务', recommended: true }),
  Object.freeze({ id: 'studio', name: '工作室版', monthlyCents: 79900, accounts: 3, businesses: 30, audience: '多个经营账号，分别开展业务' }),
]);
export const formatCny = cents => `¥${(cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
export function monthlyEstimate(planId, budgets) {
  const plan = PLANS.find(p => p.id === planId);
  if (!plan) throw new Error('请选择有效套餐');
  const costs = {};
  for (const key of ['model', 'data', 'image']) {
    const text = String(budgets[key] ?? '').trim();
    if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) throw new Error('预算需填写 0–999999 的金额，最多两位小数');
    const cents = Math.round(Number(text) * 100);
    if (!Number.isSafeInteger(cents) || cents > 99999900) throw new Error('预算金额超出范围');
    costs[key] = cents;
  }
  return { plan, costs, serviceCents: plan.monthlyCents, resourceCents: Object.values(costs).reduce((sum, n) => sum + n, 0), totalCents: plan.monthlyCents + Object.values(costs).reduce((sum, n) => sum + n, 0) };
}
export function openingChecklist(estimate) {
  const { plan, costs, serviceCents, resourceCents, totalCents } = estimate;
  return `Harta 开通清单（价格版本 ${PRICING_VERSION}）\n\n交付方式：托管订阅（Harta 管理员配置与维护服务）\n套餐：${plan.name}\n软件月费：${formatCny(serviceCents)} / 月\n拟开通范围：${plan.accounts} 个独立账号，合计 ${plan.businesses} 个业务\n\n拟确认的每月托管资源预算：\n文字与研究模型：${formatCny(costs.model)}\n平台数据源：${formatCny(costs.data)}\nAI 出图：${formatCny(costs.image)}\n第三方预算合计：${formatCny(resourceCents)}\n每月预算合计：${formatCny(totalCents)}\n\n资源预算不是套餐赠送额度、充值或正式报价，也不会设置实际调用上限。托管资源费用不含在软件月费中；开通前由 Harta 管理员书面确认模型与数据源、计量单位、预算和结算方式。\n独立账号分别保存资料；工作室版不承诺跨账号共享编辑。\n本清单需交给账号管理员确认，不会自动提交订单、扣款、续费或开通。开通前另行确认付款、发票及退款条件。\n官网：https://www.harta.cn/pricing/\n`;
}
