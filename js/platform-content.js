/** Shared delivery contract for generation, editing, rendering and exports. */
export const CONTENT_FIELDS = ['cover', 'title', 'body', 'coverLayout', 'hook', 'shots', 'cta'];
export const FIELD_LABELS = { cover: '封面文案', title: '标题 / 发布文案', body: '正文 / 完整口播', coverLayout: '封面排版说明', hook: '开场画面与第一句话', shots: '分镜与字幕', cta: '收尾与咨询承接' };

// Conservative product limit: letters, digits, spaces and punctuation all count.
// Do not claim this reproduces every platform's emoji/Latin counting algorithm.
export const titleCount = (text) => Array.from(String(text || '')).length;

const EXTRA_INSTRUCTION = [
  "不同版位不同，30 字内较稳妥；前 10 字最关键，信息流会截断显示",
  "不是发不出去，是超了会折叠成「全文」。最要紧的话压在折叠线之前",
  "可留空。展开才看得到，不放关键信息",
];

/** 写给模型和检查器的字数、版位说明。成稿里不该出现。 */
export function instructionPhrases() {
  const notes = [...EXTRA_INSTRUCTION];
  for (const name of ["小红书", "抖音", "视频号", "快手"]) {
    for (const field of deliveryFields(name)) if (field.note) notes.push(field.note);
  }
  return [...new Set(notes)];
}

/** 去掉夹在成稿里的写作说明，只留能直接发出去的句子。 */
export function cleanDeliverable(text) {
  let out = String(text || "");
  for (const phrase of instructionPhrases()) out = out.split(phrase).join("");
  return out.split(/\n+/).map((line) => line.trim()).filter(Boolean).join("\n");
}
export function platformKind(name) {
  const value = String(name || '');
  if (value.includes('小红书')) return 'xiaohongshu';
  if (value.includes('视频号')) return 'channels';
  if (value.includes('抖音') || value === '短视频') return 'douyin';
  if (value.includes('快手') || value === 'B站') return 'video';
  return 'other';
}
export function deliveryFields(platform) {
  const kind = platformKind(platform);
  if (kind === 'xiaohongshu') return [
    { key: 'title', label: '笔记标题', required: true, limit: 20, note: '本工作台按每个汉字、字母、数字、标点、空格计1字，最多20字；采用保守计数，发布时仍以平台为准。' },
    { key: 'cover', label: '封面文案', required: true, advise: 12, note: '建议6—12字、一件事、最多两行；这是阅读建议，不是平台硬上限。' },
    { key: 'coverLayout', label: '封面排版说明', completeOnly: true, note: '主次文字、断行、画面主体和留白；制作说明，不是发布正文。' },
    { key: 'body', label: '笔记正文', required: true, note: '具体问题与可兑现的下一步；长度以发布页为准，不声称正文无限制。' },
  ];
  if (['douyin', 'channels', 'video'].includes(kind)) return [
    { key: 'title', label: kind === 'channels' ? '发布描述' : '发布文案', required: true, note: '视频之外的发布文字，不粘贴整段口播。' },
    { key: 'cover', label: '视频封面文案', completeOnly: true, advise: 12, note: '一眼看懂主题；建议值不是平台限制。' },
    { key: 'coverLayout', label: '封面排版说明', completeOnly: true, note: '主体与文字层级，重要元素避开裁切和控件。' },
    { key: 'hook', label: kind === 'channels' ? '开场：对象与问题' : '开场：画面与第一句话', completeOnly: true },
    { key: 'body', label: '完整口播脚本', completeOnly: true },
    { key: 'shots', label: '分镜与字幕', completeOnly: true, note: '至少3个镜头，每行给出时间段、画面、口播/字幕；与完整脚本一致。' },
    { key: 'cta', label: '收尾与咨询承接', completeOnly: true },
  ];
  return [];
}
export function deliveryIssues(platform, item = {}, { complete = false } = {}) {
  const issues=[];
  for (const f of deliveryFields(platform)) {
    const text = typeof item?.[f.key] === 'string' ? item[f.key].trim() : '';
    if ((f.required || (complete && f.completeOnly)) && !text) issues.push({ field:f.key, why:`缺少${f.label}` });
    if (text && f.limit && titleCount(text)>f.limit) issues.push({field:f.key,why:`${f.label}${titleCount(text)}字，最多${f.limit}字`});
  }
  if (complete && platformKind(platform)==='xiaohongshu' && item.title?.trim()===item.cover?.trim()) issues.push({field:'cover',why:'封面与标题完全相同，请用封面突出问题、标题补足场景'});
  if (complete && ['douyin','channels','video'].includes(platformKind(platform))) {
    if (item.shots && item.shots.split('\n').filter(s=>s.trim()).length<3) issues.push({field:'shots',why:'分镜至少需要3个镜头，分行写出时间、画面和口播/字幕'});
    if (item.title?.trim()===item.body?.trim()) issues.push({field:'title',why:'发布文案不能直接等于整段口播脚本'});
  }
  return issues;
}

export const PLATFORM_DELIVERY_BRIEF = `按平台分别制作，不是把同一段文章换字数：
小红书：交付title笔记标题（最多20字，汉字、英文字母、数字、空格、标点均保守计1字），cover封面文案，coverLayout封面排版，body笔记正文。封面建议6—12字，最多两行，只突出一个问题或具体阅读收益；标题补齐需求词和场景，不把标题截短当封面，不制造疾病恐惧、不承诺疗效。coverLayout写清主文字如何断行、辅助文字（可无）、画面主体、字号层级与留白，建议3:4图文设计并检查实际裁切。正文用短段落回答具体问题，不虚构亲身经历。
抖音：交付title独立发布文案、cover视频封面文案、coverLayout、hook开场画面与第一句话、body完整口播、shots分镜字幕、cta收尾。建议开头约3秒直接演示问题或提出明确疑问，中段用一个例子讲清，收尾只给一个可兑现动作。不能照读小红书分点文章，不强迫事故或恐吓开场。默认单人可拍、30—60秒为制作建议，不是平台上限。
视频号：同样交付上述7个字段，但hook先说明说给谁听和要解决什么；body用完整上下文、事实依据与适用边界讲清楚，让转发后第一次看到的人也能理解。语气平实，不强造反转；cta给出合规咨询渠道或可转述的总结，不诱导转发。45—90秒只是制作建议，不把平台用户一概当中老年。
快手/B站：仍须封面、独立发布文案、开场、完整口播、分镜和收尾，根据研究里的受众与用途决定节奏，不沿用抖音套路。
shots必须为至少3行的字符串，每行是时间段｜画面｜对应口播/字幕，顺序与body一致；不要只写“拍现场”。口播必须包含开场和收尾，hook/cta是给拍摄者的定位提示，不是缺失正文的替代。
朋友圈提供title外层文案与body展开内容；公众号/知乎提供独立title和完整body。封面字数、时长、比例都是编辑建议；除已明确的小红书标题产品上限，不编造其他平台硬限制或算法权重。
字数口径、版位截断、计数方式、折叠说明、排版建议都只约束你自己。禁止把这些说明写进 title、cover、body 或任何交付字段。每个字段只留能直接复制发出去的那句话。`;
