import http from 'node:http';

// Explicit method + path contract. No arbitrary worker URLs or filesystem paths.
const id = '[A-Za-z0-9_%:.-]+';
const rules = [
  ['GET', /^\/(xhs-data|douyin-data)$/],
  ['PUT', /^\/(xhs-data|douyin-data)$/],
  ['POST', /^\/(xhs-data|douyin-data)\/test$/],
  ['GET', /^\/xhs-data\/tasks$/],
  ['PUT', /^\/xhs-data\/tasks$/],
  ['GET', /^\/inbox$/],
  ['POST', /^\/inbox\/(douyin|xiaohongshu)\/sync$/],
  ['PUT', new RegExp(`^/inbox/threads/${id}$`)],
  ['POST', new RegExp(`^/inbox/threads/${id}/(suggest|drafts)$`)],
  ['POST', new RegExp(`^/inbox/drafts/${id}/(send|reconcile)$`)],
  ['GET', /^\/(health|state|settings|accounts|platforms|protection|llm)$/],
  ['GET', /^\/sales\/(profile|export|summary)$/], ['PUT', /^\/sales\/profile$/],
  ['GET', new RegExp(`^/leads/${id}/sales$`)], ['PUT', new RegExp(`^/leads/${id}/sales$`)], ['POST', new RegExp(`^/leads/${id}/sales/events$`)],
  ['GET', /^\/harta\/(context|contacts)$/], ['POST', /^\/harta\/handoff$/],
  ['GET', /^\/media\/remote$/], ['GET', /^\/media\/[a-f0-9-]+\.(mp4|webm|mov)$/],
  ['POST', /^\/(intent|jobs|workflows|comments\/collect|leads\/collect|drafts|accounts|settings\/test|llm\/models\/sync|llm\/test|media\/video)$/],
  ['PUT', /^\/(settings|llm|protection\/(douyin|xiaohongshu))$/],
  ['POST', new RegExp(`^/workflows/${id}/(pause|resume|review)$`)],
  ['POST', new RegExp(`^/jobs/${id}/stop$`)],
  ['POST', new RegExp(`^/notes/${id}/detail$`)],
  ['PATCH', new RegExp(`^/leads/${id}$`)],
  ['DELETE', new RegExp(`^/(drafts|accounts)/${id}$`)],
  ['POST', new RegExp(`^/drafts/${id}/(prepare|publish|reconcile)$`)],
  ['GET', new RegExp(`^/drafts/${id}/bundle$`)],
  ['POST', /^\/platforms\/(douyin|xiaohongshu)\/(resume|login|login-preview|creator|network|status)$/],
  ['GET', /^\/export\/(notes|comments|leads|drafts|jobs)$/],
  ['POST', /^\/export\/(notes|comments|leads|drafts|jobs)$/],
];
export function openFindRoute(method, pathname) {
  if (typeof pathname !== 'string' || /%2f|%5c|%00|\.\./i.test(pathname)) return false;
  return rules.some(([m, re]) => m === method && re.test(pathname));
}
export function proxyOpenFind(req, res, endpoint, route, headers = {}) {
  const pathname = route.split('?')[0];
  if (!openFindRoute(req.method, pathname)) throw new Error('没有这个 Harta 操作');
  const max = pathname === '/media/video' ? 501 * 1024 * 1024 : 30 * 1024 * 1024;
  if (Number(req.headers['content-length']) > max) { res.writeHead(413, headers); res.end('上传内容过大'); return; }
  return new Promise(resolve => {
    const upstream = http.request({ hostname: '127.0.0.1', port: endpoint.port, path: '/api' + route, method: req.method,
      headers: { authorization: `Bearer ${endpoint.secret}`, ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}), ...(req.headers.range ? { range: req.headers.range } : {}) },
    }, response => {
      const safe = { ...headers };
      for (const key of ['content-type', 'content-length', 'content-disposition', 'accept-ranges', 'content-range']) if (response.headers[key]) safe[key] = response.headers[key];
      res.writeHead(response.statusCode, safe); response.pipe(res);
      response.on('end', resolve); response.on('error', () => { res.destroy(); resolve(); });
    });
    let size = 0;
    const cancel = () => { upstream.destroy(); resolve(); };
    req.on('data', chunk => { size += chunk.length; if (size > max) { upstream.destroy(); if (!res.headersSent) res.writeHead(413, headers); res.end('上传内容过大'); resolve(); } });
    req.on('aborted', cancel); res.on('close', cancel);
    upstream.setTimeout(/\/workflows\/[^/]+\/review$/.test(pathname) ? 65 * 60 * 1000 : 10 * 60 * 1000, () => upstream.destroy(new Error('平台响应超时')));
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { ...headers, 'content-type': 'application/json' }); if (!res.destroyed) res.end(JSON.stringify({ error: 'Harta 服务暂时不可用，请重试' })); resolve(); });
    req.pipe(upstream);
  });
}
