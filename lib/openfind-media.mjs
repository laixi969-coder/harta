// Public platform CDNs only; never proxy a caller-supplied arbitrary URL.
export function platformMediaUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return '';
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.port && u.port !== '443')) return '';
    if (!/(^|\.)(xhscdn\.com|xiaohongshu\.com|douyinpic\.com|douyinvod\.com|douyinstatic\.com|byteimg\.com|bytecdn\.cn|pstatp\.com|snssdk\.com|ibytedtos\.com|bytedance\.com|bytedance\.net|toutiaoimg\.com|toutiaovod\.com|douyin\.com)$/.test(u.hostname)) return '';
    u.protocol = 'https:'; // Older XHS responses return HTTP CDN links; always fetch over TLS.
    return u.href;
  } catch { return ''; }
}
export function storedMediaUrl(value, notes, drafts = []) {
  const url = platformMediaUrl(value);
  if (!url) return '';
  return [...notes, ...drafts].some(n => [n.cover, n.video, n.videoUrl, ...(Array.isArray(n.images) ? n.images : [])].some(v => platformMediaUrl(v) === url)) ? url : '';
}
