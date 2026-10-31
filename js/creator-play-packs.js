// Platform and form must be explicitly identifiable; otherwise use the general approach.
export const CREATOR_PACKS = [
  { id:'xhs-guide', version:1, name:'小红书·攻略搜索', platform:'小红书', form:'guide', instruction:'标题和开头清楚交代人群或问题；正文提供可核对的步骤、清单或判断方法。' },
  { id:'xhs-voice', version:1, name:'小红书·人设表达', platform:'小红书', form:'voice', instruction:'保留真实口吻和具体场景；可留一个自然、容易回答的问题，不虚构亲历。' },
  { id:'xhs-video', version:1, name:'小红书·短视频', platform:'小红书', form:'video', instruction:'围绕一个明确问题组织口播与画面；标题和封面共同说明观看价值，分镜中的事实须有依据。' },
  { id:'xhs-image', version:1, name:'小红书·图文清单', platform:'小红书', form:'image', instruction:'围绕一个具体问题组织逐页文字，每页提供一个清楚的判断或步骤；标题、封面和正文内容保持一致。' },
  { id:'xhs-live', version:1, name:'小红书·直播交流', platform:'小红书', form:'live', instruction:'开场交代主题，按判断、依据或步骤安排段落，预留观众提问与回应时间；介绍产品时只使用已核实资料。' },
  { id:'douyin', version:1, name:'抖音·单一主题口播', platform:'抖音', form:'video', instruction:'围绕一个问题组织口播，开头直接交代观看价值，画面和正文相互兑现。' },
  { id:'douyin-image', version:1, name:'抖音·图文清单', platform:'抖音', form:'image', instruction:'每页围绕一个具体问题或判断，逐页说明画面和文字，避免只把视频口播拆行。' },
  { id:'douyin-live', version:1, name:'抖音·直播交流', platform:'抖音', form:'live', instruction:'开场说明主题和观看价值，安排具体步骤、观众提问及回应，介绍产品时只使用已核实资料。' },
  { id:'channels', version:1, name:'视频号·清楚解释', platform:'视频号', form:'video', instruction:'交代对象和背景，用判断、依据或步骤及适用边界讲清一件事。' },
  { id:'article', version:1, name:'公众号·长文', platform:'公众号', form:'article', instruction:'开头说明阅读价值，按主题组织段落，观点和数据有依据。' },
  { id:'general', version:1, name:'通用·说人话', instruction:'围绕读者具体处境给可用信息，使用自然语言，不编造事实。' },
];
export function selectCreatorPack(platform, format = '', settings = {}, goal = '', job = '') {
  const f = String(format);
  const form = /直播/.test(f) ? 'live' : /视频|口播|短片/.test(f) ? 'video' : ['抖音','小红书'].includes(platform) && /图文|图片|多图|组图/.test(f) ? 'image' : /教程|清单|避坑|攻略/.test(f) ? 'guide' : /人设|故事|口述/.test(f) ? 'voice' : /长文|文章/.test(f) ? 'article' : '';
  const available = [...(settings.custom || []), ...CREATOR_PACKS];
  const matches = p => (!p.platform || p.platform === platform) && (!p.form || p.form === form) && (!p.goal || p.goal === goal) && (!p.job || p.job === job);
  if (settings.selected === 'off') return {id:'off',version:1,name:'关闭打法',instruction:''};
  const chosen = available.find(p => p.id === settings.selected && matches(p));
  // A scoped custom pack may intentionally cover several platforms or forms.
  // Prefer the most specific applicable pack while retaining custom-first ties.
  const score=p=>Number(Boolean(p.platform))+Number(Boolean(p.form))+Number(Boolean(p.goal))+Number(Boolean(p.job));
  return chosen || available.filter(matches).sort((a,b)=>score(b)-score(a))[0] || CREATOR_PACKS.at(-1);
}
