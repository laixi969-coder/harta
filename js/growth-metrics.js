export const GROWTH_GOALS = {
  reach: { label: '目标流量', metric: 'views', strategy: '选择目标人群正在关心的具体问题；标题和开头给出继续看的理由，正文兑现信息价值。不强塞咨询。' },
  reach_leads: { label: '流量与有效线索', metric: 'qualifiedLeads', metrics:['views','qualifiedLeads'], strategy: '同时考虑目标人群愿意观看和能够产生真实咨询：围绕具体问题提供有用内容，标题和开头兑现正文价值；用有依据的服务范围与自然的咨询承接帮助适合的人继续沟通。两项结果分别观察，不承诺爆款或线索数量。' },
  spread: { label: '爆款传播', metric: 'shares', strategy: '寻找读者愿意转给特定人的实用信息或共鸣角度，写清分享理由；不得制造虚假冲突或保证爆款。' },
  leads: { label: '有效客资', metric: 'qualifiedLeads', strategy: '明确适合谁、需求与服务边界，用真实证据消除疑虑，并给可兑现的联系动作。不能用泛流量替代客资。' },
  sales: { label: '卖货成交', metric: 'orders', strategy: '围绕使用场景、选择标准、真实产品价值和购买疑虑写作；仅使用已确认的价格、优惠、购买渠道与交付承诺。' },
};
export const METRICS = { views: '阅读 / 播放', completedViews: '完整播放次数', completionRate: '平台完播率（%）', likes: '点赞', comments: '评论', collects: '收藏', shares: '分享', inquiries: '咨询次数', qualifiedLeads: '有效客资（已去重）', orders: '归因订单数', revenue: '归因销售额（元）', refunds: '退款金额（元）', cost: '制作成本（元）' };
