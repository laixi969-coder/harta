import http from 'node:http';
import { init, request } from '../../data/services/rsshub/node_modules/rsshub/dist-lib/pkg.mjs';
await init({ CACHE_TYPE: 'memory', REQUEST_TIMEOUT: '15000', NODE_ENV: 'production' });
let active = 0;
http.createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') return send(200, { ok: true, service: 'RSSHub native' });
  if (req.method !== 'GET' || !['/search', '/feed'].includes(url.pathname)) return send(404, { error: 'Not found' });
  if (active >= 2) return send(429, { error: 'Busy' });
  const query = String(url.searchParams.get('q') || '').trim();
  if (url.pathname === '/search' && (!query || query.length > 150)) return send(400, { error: 'Invalid query' });
  active++;
  try {
    const route = '/36kr/newsflashes';
    const data = await request(route);
    send(200, { title: data.title, source: route, items: (data.item || []).filter(row => url.pathname === '/feed' || `${row.title} ${row.description}`.toLowerCase().includes(query.toLowerCase())).slice(0, 10).map((row) => ({ title: row.title, url: row.link, text: String(row.description || '').replace(/<[^>]+>/g, ' ').slice(0, 2500), date: row.pubDate || '' })) });
  } catch (error) { console.error(error.message); send(502, { error: 'RSSHub 上游读取失败' }); }
  finally { active--; }
}).listen(1200, '127.0.0.1', () => console.log('RSSHub native http://127.0.0.1:1200'));
