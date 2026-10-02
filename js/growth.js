export const GROWTH_GOALS = {
  reach: { label: '目标流量', metric: 'views', strategy: '选择目标人群正在关心的具体问题；标题和开头给出继续看的理由，正文兑现信息价值。不强塞咨询。' },
  spread: { label: '爆款传播', metric: 'shares', strategy: '寻找读者愿意转给特定人的实用信息或共鸣角度，写清分享理由；不得制造虚假冲突或保证爆款。' },
  leads: { label: '有效客资', metric: 'qualifiedLeads', strategy: '明确适合谁、需求与服务边界，用真实证据消除疑虑，并给可兑现的联系动作。不能用泛流量替代客资。' },
  sales: { label: '卖货成交', metric: 'orders', strategy: '围绕使用场景、选择标准、真实产品价值和购买疑虑写作；仅使用已确认的价格、优惠、购买渠道与交付承诺。' },
};
export const METRICS = { views: '阅读 / 播放', shares: '分享', inquiries: '咨询次数', qualifiedLeads: '有效客资（已去重）', orders: '归因订单数', revenue: '归因销售额（元）', refunds: '退款金额（元）', cost: '制作成本（元）' };
export const GROWTH_BRIEF_LABELS = { role: '本篇作用', hookReason: '为什么愿意看', actionReason: '为什么愿意行动', hypothesis: '待验证假设' };
export function growthGoal(customer = {}) { return Object.hasOwn(GROWTH_GOALS, customer.growthGoal) ? customer.growthGoal : 'leads'; }
export function goalBrief(customer) {
  const goal = growthGoal(customer);
  return `本批主要目标：${GROWTH_GOALS[goal].label}（${goal}）。${GROWTH_GOALS[goal].strategy}\n结果条件：${customer.growthCriteria || '尚未定义具体达标条件，不能宣称达标。'}\n先比较不同选题角度，再选择六个不同问题。每篇承担明确作用，不要求每篇完成所有目标。可信与可制作是底线。只提出待验证假设，不给爆款分，不承诺结果。`;
}
export function outcomeAssessment(goal, row) {
  const key = GROWTH_GOALS[goal]?.metric || 'qualifiedLeads';
  const value = row?.metrics?.[key];
  if (value == null) return { text: '待验证：尚未记录本目标的结果。', suggestion: '' };
  const baseline = row.baseline;
  const comparison = baseline == null ? '未设置同口径基线，暂不判断提升。' : baseline === 0 ? '基线为零，只比较绝对值，不计算增长倍数。' : `相对同口径基线：${(value / baseline).toFixed(2)} 倍；不能据此判断因果或爆款。`;
  const prompts = {
    reach: '检查选题是否贴近目标人群，并尝试一个更具体的标题与开头；保留正文能兑现的收益。',
    spread: '尝试让读者明确这篇适合转给谁、能帮助对方解决什么问题。',
    leads: '核对服务对象、信任证据和联系入口；下一批尝试回答一个咨询前的具体疑虑。',
    sales: '核对产品适用场景、购买疑虑及真实购买入口，尝试补齐一项有依据的决策信息。',
  };
  return { text: `${METRICS[key]}：${value}。${comparison} 这是用户记录，尚未独立核验。`, suggestion: `待验证调整：${prompts[goal] || prompts.leads} 保持平台和统计窗口可比，观察结果，不预设原因。` };
}
