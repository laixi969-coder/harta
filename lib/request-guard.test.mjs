import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { parseCookies, createRateLimiter, createConcurrencyGuard, clientIp, sameOriginMutation, validHost, sessionCookie, readJsonBody } from './request-guard.mjs';
const request = (headers = {}) => ({ method: 'POST', headers: { host: 'localhost:5173', ...headers }, socket: { remoteAddress: '127.0.0.1' } });

describe('request trust boundaries', () => {
  it('ignores corrupt cookie values without losing valid sessions', () => {
    expect(parseCookies('broken=%E0%A4%A; harta_sid=ok').harta_sid).toBe('ok');
    expect(parseCookies('harta_sid=%E0%A4%A').harta_sid).toBeUndefined();
    expect(Object.getPrototypeOf(parseCookies('__proto__=x'))).toBeNull();
  });
  it('rejects cross-site and same-site sibling mutations, permits origin-less CLI', () => {
    expect(sameOriginMutation(request({ origin: 'https://evil.example' }))).toBe(false);
    expect(sameOriginMutation(request({ origin: 'null' }))).toBe(false);
    expect(sameOriginMutation(request({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(sameOriginMutation(request({ 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(sameOriginMutation(request({ origin: 'http://localhost:5173' }))).toBe(true);
    expect(sameOriginMutation(request({ referer: 'http://localhost:5173/index.html' }))).toBe(true);
    expect(sameOriginMutation(request())).toBe(true);
    expect(sameOriginMutation(request({ origin: 'https://harta.example' }), 'https://harta.example')).toBe(true);
  });
  it('requires local or configured host and never trusts arbitrary forwarded IPs', () => {
    expect(validHost(request())).toBe(true);
    expect(validHost(request({ host: 'evil.example' }))).toBe(false);
    expect(validHost(request({ host: 'harta.example' }), { publicOrigin: 'https://harta.example' })).toBe(true);
    const req = request({ 'x-real-ip': '192.0.2.4', 'x-forwarded-for': '192.0.2.5' });
    expect(clientIp(req)).toBe('127.0.0.1');
    expect(clientIp(req, true)).toBe('192.0.2.4');
    req.socket.remoteAddress = '192.0.2.3';
    expect(clientIp(req, true)).toBe('192.0.2.3');
  });
  it('sets Secure on public HTTPS session cookies including deletion', () => {
    expect(sessionCookie('abc', request(), 'https://harta.example')).toContain('; Secure');
    expect(sessionCookie('', request(), 'https://harta.example')).toContain('Max-Age=0; Secure');
    expect(sessionCookie('abc', request())).not.toContain('; Secure');
  });
});

describe('bounded resource guards', () => {
  it('limits keys, rejects churn without evicting blocked clients, expires stale entries', () => {
    let now = 0;
    const limiter = createRateLimiter({ maxEntries: 2, now: () => now });
    expect(limiter.consume('a', 1, 1000).allowed).toBe(true);
    expect(limiter.consume('a', 1, 1000)).toEqual({ allowed: false, retryAfter: 1 });
    limiter.consume('b', 1, 1000);
    expect(limiter.consume('c', 1, 1000).allowed).toBe(false);
    expect(limiter.size).toBe(2);
    expect(limiter.consume('a', 1, 1000).allowed).toBe(false);
    now = 1000;
    expect(limiter.consume('c', 1, 1000).allowed).toBe(true);
    expect(limiter.size).toBe(1);
  });
  it('enforces both account and global capacity and releases only once', () => {
    const guard = createConcurrencyGuard({ perAccount: 1, total: 2 });
    const releaseA = guard.acquire('a');
    expect(guard.acquire('a')).toBeNull();
    const releaseB = guard.acquire('b');
    expect(guard.acquire('c')).toBeNull();
    releaseA(); releaseA();
    const releaseC = guard.acquire('c');
    expect(releaseC).toBeTypeOf('function');
    expect(guard.acquire('d')).toBeNull();
    releaseB(); releaseC();
  });
});

function body(raw, { limit, type = 'application/json' } = {}) {
  const req = new PassThrough(); req.headers = { 'content-type': type };
  const result = readJsonBody(req, limit);
  req.end(raw);
  return result;
}
describe('body parsing', () => {
  it('accepts objects and rejects non-object and malformed JSON as 400', async () => {
    await expect(body('{"a":1}')).resolves.toEqual({ a: 1 });
    for (const raw of ['null', '[]', '"hello"', 'bad']) await expect(body(raw)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('returns explicit413 on streamed overflow without destroying response socket', async () => {
    await expect(body('{"a":"long"}', { limit: 4 })).rejects.toMatchObject({ statusCode: 413 });
    await expect(body('{}', { type: 'text/plain' })).rejects.toMatchObject({ statusCode: 415 });
  });
  it('rejects slow or aborted uploads and releases listeners', async () => {
    const req = new PassThrough(); req.headers = { 'content-type': 'application/json' };
    await expect(readJsonBody(req, 100, 10)).rejects.toMatchObject({ statusCode: 408 });
    expect(req.listenerCount('data')).toBe(0);
    const aborted = new PassThrough(); aborted.headers = req.headers;
    const result = readJsonBody(aborted); aborted.emit('aborted');
    await expect(result).rejects.toMatchObject({ statusCode: 400 });
    expect(() => aborted.emit('error', new Error('connection reset after abort'))).not.toThrow();
  });
});
