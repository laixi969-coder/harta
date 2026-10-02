import net from 'node:net';

export function parseCookies(header) {
  const out = Object.create(null);
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    try { out[key] = decodeURIComponent(rest.join('=')); } catch { /* Ignore corrupt cookies; do not turn a login into a server error. */ }
  }
  return out;
}

// Reject new keys when full instead of evicting active limits (which lets churn bypass them).
export function createRateLimiter({ maxEntries = 10000, now = Date.now } = {}) {
  const buckets = new Map();
  let nextSweep = 0;
  return {
    get size() { return buckets.size; },
    consume(key, max, windowMs) {
      const time = now();
      if (time >= nextSweep) {
        for (const [id, bucket] of buckets) if (bucket.reset <= time) buckets.delete(id);
        nextSweep = time + 30000;
      }
      let bucket = buckets.get(key);
      if (!bucket || bucket.reset <= time) {
        if (!bucket && buckets.size >= maxEntries) return { allowed: false, retryAfter: 30 };
        bucket = { count: 0, reset: time + windowMs };
        buckets.set(key, bucket);
        nextSweep = Math.min(nextSweep, bucket.reset);
      }
      bucket.count = Math.min(max + 1, bucket.count + 1);
      return { allowed: bucket.count <= max, retryAfter: Math.max(1, Math.ceil((bucket.reset - time) / 1000)) };
    },
  };
}

export function createConcurrencyGuard({ perAccount = 2, total = 8 } = {}) {
  const active = new Map();
  let count = 0;
  return {
    acquire(account) {
      if (count >= total || (active.get(account) || 0) >= perAccount) return null;
      count += 1;
      active.set(account, (active.get(account) || 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        count -= 1;
        const remaining = active.get(account) - 1;
        if (remaining) active.set(account, remaining); else active.delete(account);
      };
    },
  };
}

export function clientIp(req, trustProxy = false) {
  const peer = req.socket?.remoteAddress || 'unknown';
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
  const forwarded = req.headers['x-real-ip'];
  // The reverse proxy must overwrite, not append, this header.
  return trustProxy && local && typeof forwarded === 'string' && net.isIP(forwarded) ? forwarded : peer;
}

export function requestOrigin(req, publicOrigin = '') {
  if (publicOrigin) return new URL(publicOrigin).origin;
  return `${req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`;
}

export function validHost(req, { publicOrigin = '', port = 5173 } = {}) {
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (publicOrigin) allowed.add(new URL(publicOrigin).host);
  return allowed.has(String(req.headers.host || '').toLowerCase());
}

export function sameOriginMutation(req, publicOrigin = '') {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin) return origin === requestOrigin(req, publicOrigin);
  if (referer) {
    try { return new URL(referer).origin === requestOrigin(req, publicOrigin); } catch { return false; }
  }
  // Fetch metadata is enough for same-origin browsers; headerless CLI clients remain supported.
  return !req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin';
}

export function sessionCookie(sid, req, publicOrigin = '') {
  const secure = requestOrigin(req, publicOrigin).startsWith('https:') ? '; Secure' : '';
  return `harta_sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sid ? 604800 : 0}${secure}`;
}

const bodyError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
export function readJsonBody(req, limit = 64 * 1024, timeoutMs = 30000) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    req.pause();
    return Promise.reject(bodyError('请求格式不正确，请刷新页面后重试', 415));
  }
  if (Number(req.headers['content-length'] || 0) > limit) {
    req.pause();
    return Promise.reject(bodyError('一次粘贴的内容太多，请按输入框标注的上限缩短', 413));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('aborted', onAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.pause();
      reject(error);
    };
    const onError = () => fail(bodyError('请求中断，请重试', 400));
    const onAbort = () => fail(bodyError('请求中断，请重试', 400));
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) return fail(bodyError('一次粘贴的内容太多，请按输入框标注的上限缩短', 413));
      chunks.push(chunk);
    };
    const onEnd = () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const data = raw ? JSON.parse(raw) : {};
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
        settled = true;
        cleanup();
        resolve(data);
      } catch { fail(bodyError('提交内容格式不正确，请刷新页面后重试', 400)); }
    };
    const timer = setTimeout(() => fail(bodyError('上传超时，请重试', 408)), timeoutMs);
    timer.unref?.();
    req.on('data', onData).on('end', onEnd).on('error', onError).on('aborted', onAbort);
    // IncomingMessage may emit error after aborted; retain the handler until close.
    req.once('close', () => req.removeListener('error', onError));
  });
}
