import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertPublicUrl, fetchClientPage } from './recon.mjs';
const run = promisify(execFile);
export const crawlerInstalled = () => fs.existsSync(path.join(process.cwd(), 'data/services/crawl4ai/bin/python'));
export async function readPublicSource(url) {
  try { await assertPublicUrl(url); } catch { return { ok: false, why: '网址不是可读取的公网地址' }; }
  if (crawlerInstalled()) {
    try {
      const { stdout } = await run(path.join(process.cwd(), 'data/services/crawl4ai/bin/python'), [path.join(process.cwd(), 'deploy/native/crawl.py'), url], { timeout: 45000, maxBuffer: 512 * 1024 });
      const result = JSON.parse(stdout);
      if (result.ok && typeof result.text === 'string') return { ...result, method: 'Crawl4AI 原生浏览器读取' };
    } catch { /* 独立读取器失败后保留原有公开网页抓取能力。 */ }
  }
  return fetchClientPage(url);
}
export async function queryRsshub(query, baseUrl, fetcher = fetch) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/search`);
  url.search = new URLSearchParams({ q: query }).toString();
  const res = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`RSSHub HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.items)) throw new Error('RSSHub 返回格式不正确');
  return data.items.slice(0, 4).filter((row) => typeof row.url === 'string' && /^https?:\/\//.test(row.url)).map((row) => ({ title: String(row.title || '').slice(0, 200), url: row.url, excerpt: String(row.text || '').slice(0, 1500), publishedAt: String(row.date || '').slice(0, 80), query, kind: 'RSSHub 原生聚合来源（非流量指数）' }));
}
