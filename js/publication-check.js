// Advisory checks adapted from Flowso's platform-aware publication gate.
export function publicationChecks(platform, content = {}) {
  const title = String(content.title || '');
  const cover = String(content.cover || '');
  const hook = String(content.hook || '');
  const cta = String(content.cta || '');
  const body = String(content.body || '');
  const text = `${title}\n${cover}\n${hook}\n${body}\n${cta}`;
  const checks = [];
  if (!body.trim()) checks.push('正文为空，请确认发布版本是否完整。');
  if (platform === '小红书') {
    if (/微信|\+v|威信|v信|二维码|淘口令|https?:\/\//i.test(text)) checks.push('包含站外联系方式或链接，发布前请核对平台规则。');
    if (/点赞收藏关注|一键三连|走一波/.test(text)) checks.push('包含集中催赞话术，可考虑换成具体问题。');
  }
  if (['抖音', '视频号'].includes(platform) && /^(大家好|我是今天|我是)/.test((hook || body).trim())) checks.push('开头是自我介绍，可检查是否先交代观众关心的问题。');
  if (/首先|其次|综上所述|值得一提的是|不仅如此/.test(body)) checks.push(platform==='公众号'?'正文包含较书面的连接词，发布前可检查语气是否自然。':'正文包含较书面的连接词，口播前可读一遍检查语气。');
  return checks;
}
