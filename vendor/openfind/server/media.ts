import { fetch, ProxyAgent } from 'undici';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { storedMediaUrl } from '../../../lib/openfind-media.mjs';
import { all } from './store.ts';
import { allowNetworkRequest, directProxy, closeNetwork } from './platforms/network.ts';
let agent: ProxyAgent | undefined;
const cache = new Map<string, { bytes: Buffer; type: string; expires: number }>();
const imageType = /^image\/(jpeg|png|webp|gif|avif)$/;
async function remote(value: unknown, range?: string) {
  const url = storedMediaUrl(value, all('notes'), all('drafts'));
  if (!url) throw new Error('找不到当前业务的素材');
  allowNetworkRequest(url);
  agent ||= new ProxyAgent((await directProxy()).server);
  const response = await fetch(url, { dispatcher: agent, redirect: 'error', signal: AbortSignal.timeout(90000), headers: {
    referer: url.includes('xhscdn') ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
    'user-agent': 'Mozilla/5.0', ...(range && /^bytes=\d+-\d*$/.test(range) ? { range } : {}),
  } });
  const type = (response.headers.get('content-type') || '').split(';')[0];
  if (!response.ok || (!imageType.test(type) && !/^video\/(mp4|webm|quicktime)$/.test(type))) { await response.body?.cancel(); throw new Error('平台素材暂不可用，请重新读取详情刷新链接'); }
  return { response, type, url };
}
async function imageBytes(response: Awaited<ReturnType<typeof fetch>>) {
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body!) { size += chunk.length; if (size > 16 * 1024 * 1024) throw new Error('图片超过16MB'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export function installMedia(app: any) {
  app.get('/api/media/remote', async (req: any, res: any) => {
    try {
      const url = storedMediaUrl(req.query.url, all('notes'), all('drafts'));
      if (!url) return res.status(404).json({ error: '找不到当前业务的素材' });
      const cached = cache.get(url);
      if (cached && cached.expires > Date.now()) return res.type(cached.type).send(cached.bytes);
      const { response, type } = await remote(url, req.get('range'));
      if (imageType.test(type)) {
        const bytes = await imageBytes(response);
        if (cache.size >= 24) cache.delete(cache.keys().next().value!);
        cache.set(url, { bytes, type, expires: Date.now() + 300000 });
        return res.type(type).send(bytes);
      }
      res.status(response.status).type(type);
      for (const name of ['content-length', 'content-range', 'accept-ranges']) if (response.headers.has(name)) res.set(name, response.headers.get(name));
      const stream = Readable.fromWeb(response.body as any);
      let size = 0;
      stream.on('data', chunk => { size += chunk.length; if (size > 512 * 1024 * 1024) stream.destroy(new Error('视频超过512MB')); });
      stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
    } catch { if (!res.headersSent) res.status(502).json({ error: '素材读取失败，可刷新作品详情后重试' }); else res.destroy(); }
  });
}
export async function imageAsset(value: string) {
  const local = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (local) {
    const bytes = Buffer.from(local[2], 'base64');
    if (bytes.length > 16 * 1024 * 1024) throw new Error('图片超过16MB');
    return { bytes, extension: local[1] === 'jpeg' ? 'jpg' : local[1] };
  }
  if (/^\/assets\/[\w.-]+$/.test(value)) return { bytes: await readFile(new URL('../public' + value, import.meta.url)), extension: value.split('.').at(-1)! };
  const { response, type } = await remote(value);
  if (!imageType.test(type)) { await response.body?.cancel(); throw new Error('素材不是图片'); }
  return { bytes: await imageBytes(response), extension: type.split('/')[1].replace('jpeg', 'jpg') };
}
export async function closeMedia() { await agent?.close(); await closeNetwork(); }
