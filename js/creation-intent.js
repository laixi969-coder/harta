// Creative entry and intended distribution are independent of platform/format.
// Neither is evidence of where a published work actually received traffic.
export const CREATION_ENTRIES={platform:'小红书 / 抖音图文与视频',feed:'信息流内容创作'};
export const DISTRIBUTION_INTENTS={natural:'自然推荐',paid:'付费投放',mixed:'付费与自然兼用'};
export function creationPlatformError(platform='',format='') {
  if(typeof platform!=='string'||!['','小红书','抖音','视频号','朋友圈'].includes(platform))return '请选择有效的创作平台';
  if(typeof format!=='string'||!['','image','video'].includes(format))return '请选择有效的内容形式';
  if(format&&!platform)return '选择图文或短视频时请先选择发布平台';
  if(platform==='视频号'&&format!=='video')return '视频号请选择短视频形式';
  if(platform==='朋友圈'&&format)return '朋友圈请选择自动形式，生成外层文案与展开内容';
  return '';
}
export function normalizeCreationIntent(input={}) {
  const creationEntry=input.creationEntry ?? 'platform';
  const distributionIntent=input.distributionIntent ?? 'natural';
  if(typeof creationEntry!=='string'||!Object.hasOwn(CREATION_ENTRIES,creationEntry))throw new Error('请选择信息流或平台图文视频创作入口');
  if(typeof distributionIntent!=='string'||!Object.hasOwn(DISTRIBUTION_INTENTS,distributionIntent))throw new Error('请选择自然推荐、付费投放或兼用作为传播用途');
  return {creationEntry,distributionIntent};
}
export function creationIntentBrief(input={}) {
  const entry=CREATION_ENTRIES[input?.creationEntry];
  const mode=DISTRIBUTION_INTENTS[input?.distributionIntent];
  if(!entry&&!mode)return '本批未记录创作入口和传播用途，沿用原稿的表达；不能据此推断是否实际投放。';
  const instruction=input.distributionIntent==='paid'
    ? '为付费信息流准备可测试素材：明确受众问题、真实卖点、可展示证据和能兑现的下一步；开头与正文承诺一致，给出可拍的画面。素材制作不包含账户投放、出价或保证转化；不编造预算、投放结果或广告后台数据。'
    : input.distributionIntent==='mixed'
      ? '兼顾付费投放与自然推荐：以真实问题和有用信息为主体，让开头和咨询承接可按用途调整，在制作说明中区分付费用途与自然用途；不混淆创作用途与已发生的流量来源，不虚构任何投放效果。'
      : '自然推荐用途，零广告投流：不依赖付费定向或已有粉丝。每篇解决一个具体问题，给出可信依据与符合目标的自然下一步，不强制咨询。';
  return `创作入口：${entry||'未记录'}；传播用途：${mode||'未记录'}。${instruction}平台和图文/视频形式分别遵循本次选择。`;
}
export function creationIntentLabel(input={}) {
  return [CREATION_ENTRIES[input?.creationEntry],DISTRIBUTION_INTENTS[input?.distributionIntent]].filter(Boolean).join(' · ');
}
export function creationIntentSnapshot(input={}) {
  const creationEntry=Object.hasOwn(CREATION_ENTRIES,input?.creationEntry)?input.creationEntry:'';
  const distributionIntent=Object.hasOwn(DISTRIBUTION_INTENTS,input?.distributionIntent)?input.distributionIntent:'';
  return creationEntry||distributionIntent?{creationEntry,distributionIntent}:null;
}
