// Synthetic business and model replies shared by the content workflow regressions.
export const customer = {
  id: 'creative-test',
  name: '测试业务',
  hunt: '家装',
  city: '杭州',
  pitch: '厨房局部翻新',
  salesMaterial: '只做厨房局部翻新，不提供免费上门服务。',
  growthGoal: 'spread',
};
export const proposals = () => ({
  platform: '小红书',
  rationale: '帮助业主核对条件，效果待验证',
  assets: [{ id: 'E1', sourceId: 'B2', quote: '只做厨房局部翻新', use: '限定业务范围，不推断工期' }],
  candidates: Array.from({ length: 6 }, (_, i) => ({
    id: `C${i + 1}`,
    audience: '准备翻新的业主',
    question: `核对事项${i + 1}`,
    angle: `具体角度${i + 1}`,
    format: '清单',
    payoff: '学会核对合同条件',
    hook: '报价要怎么比',
    action: '和家人一起核对',
    production: '纸笔示意图',
    evidenceKind: 'guidance',
    assetIds: [],
    sourceIds: [],
  })),
});
const item = (candidateId, title, body) => ({
  candidateId,
  title,
  body,
  cover: '先看约定再决定',
  coverLayout: '主题字居中，四周留白，配纸笔示意图',
  purpose: title,
  visual: '使用纸笔示意图，无需现场案例',
  reason: '帮助业主在签约前核对具体条件',
  brief: {
    audience: '准备翻新的业主',
    question: title,
    takeaway: '知道签约前要核对哪些约定',
    evidence: '一般决策建议，不是具体服务承诺',
    nextStep: '和家人核对约定',
    sourceIds: [],
  },
  growth: {
    role: '提供可分享的核对方法',
    hookReason: '签约前的具体疑问',
    actionReason: '和一起装修的家人核对',
    hypothesis: '是否带来分享有待发布验证',
  },
});
export const content = () => ({
  title: '签约前先核对',
  gate: '一般决策建议，未经实际发布验证',
  platform: '小红书',
  rationale: '回答具体问题',
  items: [
    item(
      'C5',
      '水电报价怎么比',
      '1、先把按米计算和按点位计费的项目分开。\n2、确认数量如何复核，再对齐计费口径比较总价。',
    ),
    item(
      'C2',
      '工期约定怎么写',
      '合同只写天数时，需要确认是工作日还是自然日，并约定材料延迟和变更方案时如何调整。留下双方确认记录。',
    ),
  ],
});
