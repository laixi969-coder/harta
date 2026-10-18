import { fetch, ProxyAgent } from 'undici';
import { Readable } from 'node:stream';
import { platformMediaUrl } from './openfind-media.mjs';

let agent;
const images = new Map(), pending = new Map();
const imageType = /^image\/(jpeg|png|webp|gif|avif)$/;
export function workMediaUrl(work, params) {
  const kind = params.get('asset'), index = params.get('index') || '0';
  if (!/^(0|[1-9]\d{0,2})$/.test(index)) return '';
  const value = kind === 'cover' ? work.cover : kind === 'video' ? work.videoUrl : kind === 'image' ? work.images?.[Number(index)] : '';
  return platformMediaUrl(value);
}

async function requestMedia(url, range) {
  // Reuse the platform transport: public DNS, public targets only and verified TLS.
  const { allowNetworkRequest, directProxy } = await import('../vendor/openfind/server/platforms/network.ts');
  allowNetworkRequest(url);
  agent ||= new ProxyAgent((await directProxy()).server);
  return fetch(url, {dispatcher:agent, redirect:'error', signal:AbortSignal.timeout(90000), headers:{
    referer:new URL(url).hostname.endsWith('xhscdn.com') ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
    'user-agent':'Mozilla/5.0', ...(range && /^bytes=\d+-\d*$/.test(range) ? {range} : {}),
  }});
}

export function createWorkMediaHandler({ request = requestMedia } = {}) {
  return async (req, res, work, params) => {
    const url = workMediaUrl(work, params);
    if (!url) {res.writeHead(404);res.end();return;}
    // This handler is called only after user/business/work ownership checks.
    const headers = {'cache-control':'private, max-age=300','vary':'Cookie','x-content-type-options':'nosniff'};
    try {
      let item = images.get(url);
      if (!item || item.expires < Date.now()) {
        let task = pending.get(url);
        if (!task) {
          task = (async () => {
            const response = await request(url, req.headers.range);
            const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
            if (!response.ok || (!imageType.test(type) && !(params.get('asset')==='video' && /^video\/(mp4|webm|quicktime)$/.test(type)))) {
              await response.body?.cancel();throw new Error('素材暂不可用');
            }
            if (!imageType.test(type)) return {response,type};
            const chunks=[];let size=0;
            for await (const chunk of response.body) {size+=chunk.length;if(size>16*1024*1024) {await response.body.cancel().catch(()=>{});throw new Error('图片超过16MB');}chunks.push(chunk);}
            const result={bytes:Buffer.concat(chunks),type,expires:Date.now()+300000};
            // Bound cache memory as well as entry count.
            while (images.size && (images.size>=48 || [...images.values()].reduce((n,x)=>n+x.bytes.length,0)+size>64*1024*1024)) images.delete(images.keys().next().value);
            images.set(url,result);return result;
          })();
          // Image requests are deduplicated; video bodies are one-shot streams.
          if (params.get('asset') !== 'video') pending.set(url,task);
        }
        try {item=await task;}finally{if(pending.get(url)===task)pending.delete(url);}
      }
      if (item.bytes) {res.writeHead(200,{...headers,'content-type':item.type,'content-length':item.bytes.length});res.end(item.bytes);return;}
      const response=item.response;
      for(const name of ['content-length','content-range','accept-ranges']) if(response.headers.has(name))headers[name]=response.headers.get(name);
      res.writeHead(response.status,{...headers,'content-type':item.type});
      const stream=Readable.fromWeb(response.body);let size=0;
      stream.on('data',chunk=>{size+=chunk.length;if(size>512*1024*1024)stream.destroy(new Error('视频过大'));});
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    } catch {
      if(res.headersSent)res.destroy();else {res.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'图片暂不可用，请刷新完整作品后重试'}));}
    }
  };
}
export const serveWorkMedia = createWorkMediaHandler();
