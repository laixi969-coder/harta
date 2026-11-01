// A shared editorial method, not a prediction model or a mandatory template.
export const CONTENT_METHOD_VERSION = 'harta-editorial-v2';
export const CONTENT_METHOD = `# Harta 内容方法：处境 → 切口 → 兑现 → 承接 → 验证
处境：先找具体的人在什么决定或场景中卡住、为什么现在关心；以真实评论与业务资料为依据，没有证据就标为假设。
切口：从代价、误区、对照、反常识、现场细节或具体问题中选择最适合的表达，标题、封面与开头给出同一个可兑现的理由；不夸大、不编造冲突，不套固定句式。
兑现：尽快给读者能使用的判断、步骤或观察；关键结论给出真实依据和适用边界。短视频让画面与口播互相补充，图文逐页推进，长文分层回答，信息流首屏兑现广告承诺。
承接：流量和传播内容先提供独立价值，说明谁可能需要而非强迫留资；获客内容结合真实服务对象、信任证据和一个低负担的下一步；成交内容回答选择、价格或履约疑虑，但未知条件不编造。
验证：按平台、内容形式和目标分别记录可观察指标及统计窗口，提出一次只改变一个关键因素的测试假设；没有可比数据时保持待验证，不声称因果或承诺流量成交。
先尊重用户资料、目标、创作者语气和明确要求；同一主题可用不同切口，不要把这套方法当作固定格式或硬凑互动和咨询。`;

// Entry, distribution, platform, format and job are independent decisions.
// These are editorial hypotheses, not platform rules or proof of performance.
export function contentApproach({entry='',distribution='',platform='',format='',goal='',job=''}={}) {
  const lines=[];
  if(entry==='feed')lines.push(distribution==='paid'?'信息流·付费：首屏让适合的人识别问题与可兑现价值；素材、落地承接与下一步保持一致。不要凭空编造优惠、投放数据或落地页。':distribution==='mixed'?'信息流·兼用：先给独立价值，同时写清可兑现的承接；付费与自然场景的实际素材及表现分别验证。':distribution==='natural'?'信息流·自然：陌生读者无需背景也能理解首屏，并迅速得到独立价值；不要假设已发生付费投放。':'信息流：传播用途未记录，先保证陌生读者能理解内容，不推断是否投放。');
  if(platform==='小红书')lines.push(format==='image'?'小红书·图文：标题补足具体场景，封面抓住单一问题；每页推进一个判断或动作，正文补全条件和依据，避免页页重复。':format==='video'?'小红书·视频：标题与封面互补，开头让目标读者认出问题；用可拍的过程或对照兑现内容，正文补充必要条件。':'小红书：突出具体场景和有用的判断，标题与封面互补；按实际形式交付。');
  if(platform==='抖音')lines.push(format==='image'?'抖音·图文：封面先让读者理解问题；连续页面形成清晰的前后关系，单页文字可读，结尾给一个符合目标的动作。':format==='video'?'抖音·视频：首个镜头和第一句话呈现具体问题或动作，中段用可拍的演示回答，口播、字幕和镜头一致；收口只给一个可兑现动作。':'抖音：先呈现具体问题或动作，依据实际图文或视频形式组织内容。');
  const task=job||goal;
  if(['traffic','reach','spread'].includes(task))lines.push('本篇偏流量／传播：先兑现独立价值，分享理由须具体；读者自行核对即可作为结尾。用户没有要求且内容没有自然的咨询理由时，不默认要求私信或留资；不保证播放。');
  else if(task==='sales'||(task==='convert'&&goal==='sales'))lines.push('本篇偏成交：用已确认的产品适用场景、选择依据及真实证据回应购买疑虑；价格、优惠、库存、交付与购买入口仅在资料支持时填写，不虚构成交承诺。');
  else if(['lead','leads','divert','convert'].includes(task))lines.push('本篇偏线索／咨询：明确谁适合、解决什么疑虑和有依据的信任点；仅使用真实服务边界与可兑现的下一步，不以泛流量代替有效线索。');
  else if(task==='reach_leads')lines.push('本篇兼顾流量与线索：先提供可独立使用的信息，再自然连接真实服务边界；播放与有效线索分开记录，不以一项推断另一项。');
  if(!lines.length)return '平台、形式或本篇任务未标明时，不自行推断；以用户明确选择与资料为准。';
  return '# 本篇编辑侧重（用于假设与制作，非平台算法或效果保证）\n'+lines.join('\n');
}
