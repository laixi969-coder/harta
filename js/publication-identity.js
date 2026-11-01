import { isRealEvidence } from './evidence-kind.js';
// Normalize only known, stable work URL shapes. Keep every other URL intact so
// unrelated query-driven pages are not accidentally merged.
export function publicationIdentity(platform, raw) {
  try {
    const u=new URL(raw),host=u.hostname.toLowerCase();
    const domain=name=>host===name || host.endsWith('.'+name);
    if(platform==='小红书' && domain('xiaohongshu.com')) {
      const match=/^\/(?:explore|discovery\/item)\/([a-zA-Z0-9_-]{3,128})\/?$/.exec(u.pathname);
      if(match)return `xhs:${match[1]}`;
      // A work opened from its author's profile has the same note ID.
      const profileWork=/^\/user\/profile\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9]{3,128})\/?$/.exec(u.pathname);
      if(profileWork)return `xhs:${profileWork[1]}`;
    }
    if(platform==='抖音' && (domain('douyin.com') || domain('iesdouyin.com'))) {
      const match=/^\/(?:video|note|share\/video)\/(\d{3,40})\/?$/.exec(u.pathname);
      if(match)return `douyin:${match[1]}`;
    }
    if(platform==='TikTok' && domain('tiktok.com')) {
      const match=/^\/@[^/]+\/video\/(\d{3,40})\/?$/.exec(u.pathname);
      if(match)return `tiktok:${match[1]}`;
    }
    return u.href;
  }catch{return String(raw || '');}
}

// A URL match is a candidate for explicit user confirmation, not proof that a
// comment is a purchase intent or that an account owns the published work.
export function matchingPublications(signal, works = [], publications = []) {
  if(!isRealEvidence(signal))return [];
  const work=works.find(w=>w.id===signal?.workId && w.customerId===signal?.customerId && w.platform===signal?.platform && isRealEvidence(w));
  if(!work?.url || !signal?.url)return [];
  const identity=publicationIdentity(work.platform,work.url);
  if(!identity || publicationIdentity(signal.platform,signal.url)!==identity)return [];
  return publications.filter(p=>p.customerId===work.customerId && p.platform===work.platform && p.status==='published' && isRealEvidence(p) && p.url && publicationIdentity(p.platform,p.url)===identity);
}
