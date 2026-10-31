import { standardsBrief } from './creation-standards.js';
import { profileBrief } from './creator-profile.js';
export const GROWTH_GOALS = {
  reach: { label: '目标流量', metric: 'views', strategy: '选择目标人群正在关心的具体问题；标题和开头给出继续看的理由，正文兑现信息价值。不强塞咨询。' },
  reach_leads: { label: '流量与有效线索', metric: 'qualifiedLeads', metrics:['views','qualifiedLeads'], strategy: '同时考虑目标人群愿意观看和能够产生真实咨询：围绕具体问题提供有用内容，标题和开头兑现正文价值；用有依据的服务范围与自然的咨询承接帮助适合的人继续沟通。两项结果分别观察，不承诺爆款或线索数量。' },
  spread: { label: '爆款传播', metric: 'shares', strategy: '寻找读者愿意转给特定人的实用信息或共鸣角度，写清分享理由；不得制造虚假冲突或保证爆款。' },
  leads: { label: '有效客资', metric: 'qualifiedLeads', strategy: '明确适合谁、需求与服务边界，用真实证据消除疑虑，并给可兑现的联系动作。不能用泛流量替代客资。' },
  sales: { label: '卖货成交', metric: 'orders', strategy: '围绕使用场景、选择标准、真实产品价值和购买疑虑写作；仅使用已确认的价格、优惠、购买渠道与交付承诺。' },
};
export const METRICS = { views: '阅读 / 播放', completedViews: '完整播放次数', completionRate: '平台完播率（%）', likes: '点赞', comments: '评论', collects: '收藏', shares: '分享', inquiries: '咨询次数', qualifiedLeads: '有效客资（已去重）', orders: '归因订单数', revenue: '归因销售额（元）', refunds: '退款金额（元）', cost: '制作成本（元）' };
// Flowso's interaction review, expressed as observations rather than causal claims.
export function interactionReview(row) {
  const m = row?.metrics || {}, notes = [];
  if (m.views > 0 && m.completedViews != null) notes.push(`完整播放次数 / 播放：${(100 * m.completedViews / m.views).toFixed(1)}%；仅在两项统计口径一致时可比较。`);
  if (Number.isFinite(m.completionRate) && m.completionRate >= 0 && m.completionRate < 20 && Number.isSafeInteger(m.views) && m.views >= 50) notes.push(`平台完播率 ${m.completionRate}%（${m.views} 次阅读 / 播放）；低于 20% 是经验提示，不是平台标准或原因判断。可核对统计口径、内容时长与开头，下一条先尝试调整一项，再观察同口径结果。`);
  if (m.likes >= 5 && m.comments != null && m.comments <= 1) notes.push('点赞较多、评论较少；可尝试一个容易回答的问题，并观察后续结果。');
  if (m.likes >= 8 && m.collects != null && m.collects < m.likes * 0.15) notes.push('收藏相对点赞较少；可尝试补充清单或判断方法，再观察变化。');
  if (m.shares >= 2 && m.comments != null && m.shares >= m.comments) notes.push('分享次数不少于评论次数；可继续观察哪些内容值得读者转给他人。');
  return notes;
}
export const GROWTH_BRIEF_LABELS = { role: '本篇作用', hookReason: '为什么愿意看', actionReason: '为什么愿意行动', hypothesis: '待验证假设' };
export function growthGoal(customer = {}) { return Object.hasOwn(GROWTH_GOALS, customer.growthGoal) ? customer.growthGoal : 'leads'; }
export function goalBrief(customer) {
  const goal = growthGoal(customer);
  return `本批主要目标：${GROWTH_GOALS[goal].label}（${goal}）。${GROWTH_GOALS[goal].strategy}\n结果条件：${customer.growthCriteria || '尚未定义具体达标条件，不能宣称达标。'}\n先比较不同创意，再精选值得发布的内容，不为凑数重复。同一问题可以用不同证据和表达展开。每篇承担明确作用，不要求每篇完成所有目标。可信与可制作是底线。只提出待验证假设，不给爆款分，不承诺结果。${standardsBrief(customer)}${profileBrief(customer)}`;
}
export function outcomeAssessment(goal, row) {
  if(goal==='reach_leads') {
    const views=row?.metrics?.views,leads=row?.metrics?.qualifiedLeads;
    if(views==null && leads==null)return {text:'待验证：尚未记录阅读 / 播放和有效客资。',suggestion:''};
    const traffic=views==null?'阅读 / 播放：未记录':`阅读 / 播放：${views}`;
    const leadText=leads==null?'有效客资：未记录':`有效客资（已去重）：${leads}`;
    const trafficBaseline=views==null?'阅读 / 播放未记录，不比较基线。':row?.baselineViews==null?'阅读 / 播放未设置同口径基线。':row.baselineViews===0?'阅读 / 播放基线为零，只比较绝对值。':`阅读 / 播放相对同口径基线：${(views/row.baselineViews).toFixed(2)} 倍。`;
    const baseline=leads==null?'有效客资未记录，不比较基线。':row?.baseline==null?'有效客资未设置同口径基线。':row.baseline===0?'有效客资基线为零，只比较绝对值。':`有效客资相对同口径基线：${(leads/row.baseline).toFixed(2)} 倍。`;
    return {text:`${traffic}；${leadText}。${trafficBaseline}${baseline} 两项分别记录，不能仅凭流量推断线索或因果。`,suggestion:'待验证调整：核对选题、开头是否回应目标人群的问题，同时核对服务边界、有效客资口径与可兑现的咨询方式；在相同平台和统计窗口继续观察。'};
  }
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
