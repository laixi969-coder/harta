import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const root = process.cwd();
let dir, server, origin, adminCookie, userCookie, invite;
async function post(route, data, cookie, headers = {}) {
  return fetch(`${origin}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(data) });
}
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-http-security-'));
  fs.mkdirSync(path.join(dir, 'css')); fs.mkdirSync(path.join(dir, 'js')); fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'login.html'), '<!doctype html><title>Login</title>');
  fs.writeFileSync(path.join(dir, 'css/app.css'), 'body{color:red}');
  fs.writeFileSync(path.join(dir, 'data/private.js'), 'secret');
  fs.symlinkSync(path.join(dir, 'data/private.js'), path.join(dir, 'js/leak.js'));
  fs.writeFileSync(path.join(dir, 'js/.secret.js'), 'secret');
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: dir, env: { ...process.env, PORT: String(port), HARTA_PUBLIC_ORIGIN: '', HARTA_TRUST_PROXY: '', HARTA_SETUP_PASSWORD: 'sandbox-initial-password' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('Test server exited before listening'); })]);
}, 10000);
afterAll(async () => {
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
  fs.rmSync(dir, { recursive: true, force: true });
});
describe('actual HTTP abuse boundaries', () => {
  it('corrupt cookies and URL encodings no longer produce500', async () => {
    expect((await fetch(`${origin}/api/me`, { headers: { cookie: 'harta_sid=%E0%A4%A' } })).status).toBe(401);
    expect((await fetch(`${origin}/%E0%A4%A`)).status).toBe(400);
  });
  it('invalid JSON and unsupported body types produce client errors', async () => {
    expect((await post('/api/login', null)).status).toBe(400);
    expect((await post('/api/login', [])).status).toBe(400);
    expect((await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415);
  });
  it('rejects foreign mutations and wrong host before handlers run', async () => {
    expect((await post('/api/logout', {}, null, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post('/api/logout', {}, null, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    const hostStatus = await new Promise((resolve, reject) => {
      const req = http.get(`${origin}/api/me`, { headers: { host: 'evil.example' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
    });
    expect(hostStatus).toBe(421);
    expect((await post('/api/logout', {}, null, { origin })).status).toBe(200);
  });
  it('returns readable413 for a chunked oversized body', async () => {
    const result = await new Promise((resolve, reject) => {
      const req = http.request(`${origin}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
        let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, text }));
      });
      req.on('error', reject); req.write('x'.repeat(70000)); req.end();
    });
    expect(result.status).toBe(413); expect(result.text).toContain('太多');
  });
  it('static validators save transfer, invalidation returns fresh assets, private paths stay hidden', async () => {
    const first = await fetch(`${origin}/css/app.css`); const etag = first.headers.get('etag');
    expect(etag).toBeTruthy(); expect(first.headers.get('cache-control')).toBe('no-cache');
    expect((await fetch(`${origin}/css/app.css`, { headers: { 'if-none-match': etag } })).status).toBe(304);
    fs.writeFileSync(path.join(dir, 'css/app.css'), 'body{color:rebeccapurple}');
    const changed = await fetch(`${origin}/css/app.css`, { headers: { 'if-none-match': etag } });
    expect(changed.status).toBe(200); expect(await changed.text()).toContain('rebeccapurple');
    for (const route of ['/data/private.js', '/js/leak.js', '/js/.secret.js', '/.git/config', '/js/backup.json']) expect((await fetch(origin + route)).status).toBe(404);
    const head = await fetch(`${origin}/css/app.css`, { method: 'HEAD' }); expect(head.status).toBe(200); expect(await head.text()).toBe('');
  });
  it('admin invitation, registration, password change and access revocation keep ownership', async () => {
    const admin = await post('/api/login', { email: '66445039@qq.com', password: 'sandbox-initial-password' });
    expect(admin.status).toBe(200); adminCookie = cookieFrom(admin);
    const added = await post('/api/whitelist', { email: 'user@example.test' }, adminCookie);
    invite = await added.json(); expect(invite.activationCode).toBeTruthy();
    expect((await post('/api/register', { email: 'user@example.test', password: 'test123456' })).status).toBe(400);
    const registered = await post('/api/register', { email: 'user@example.test', password: 'test123456', activationCode: invite.activationCode });
    expect(registered.status).toBe(200); userCookie = cookieFrom(registered);
    const changed = await post('/api/password', { oldPassword: 'test123456', newPassword: 'test987654' }, userCookie);
    expect(changed.status).toBe(200); const old = userCookie; userCookie = cookieFrom(changed);
    expect((await fetch(`${origin}/api/me`, { headers: { cookie: old } })).status).toBe(401);
    const me = await fetch(`${origin}/api/me`, { headers: { cookie: userCookie } });
    expect(me.status).toBe(200); expect(me.headers.get('cache-control')).toBe('no-store');
    expect((await fetch(`${origin}/api/acquisition`)).status).toBe(401);
    const created = await post('/api/customers', { name: '独立业务', hunt: '家装', track: '存量', city: '杭州', pitch: '厨房翻新' }, userCookie);
    expect(created.status).toBe(200);
    const customerId = (await created.json()).customers[0].id;
    expect((await post('/api/acquisition/commerce', {customerId,action:'product',name:'匿名'})).status).toBe(401);
    expect((await post('/api/acquisition/commerce', {customerId,action:'product',name:'越权'},adminCookie)).status).toBe(400);
    expect((await post('/api/acquisition/commerce', {customerId,action:'product',name:'合法产品'},userCookie)).status).toBe(200);
    expect((await post('/api/acquisition/outreach', {customerId})).status).toBe(401);
    expect((await post('/api/acquisition/outreach', {customerId},adminCookie)).status).toBe(400);
    const imported = await post('/api/acquisition/import', { customerId, source: '测试夹具', rows: [{ platform: '小红书', text: '想找厨房翻新服务', url: 'https://xiaohongshu.com/test', recordId: 'fixture-comment' }] }, userCookie);
    expect(imported.status).toBe(200);
    const signalId = (await imported.json()).workspace.acquisition.signals[0].id;
    expect((await post('/api/acquisition/review', { signalId, action: 'confirm', note: '跨销售尝试' }, adminCookie)).status).toBe(400);
    expect((await post('/api/acquisition/account', { customerId, platform: '小红书', name: '越权账号' }, adminCookie)).status).toBe(400);
    const ownAcquisition = await (await fetch(`${origin}/api/acquisition`, { headers: { cookie: userCookie } })).json();
    expect(ownAcquisition.workspace.acquisition.signals).toHaveLength(1);
    expect(ownAcquisition.capabilities.platforms.every(p => p.send === false && p.publish === false)).toBe(true);
    expect((await post('/api/acquisition/agent-create', { customerId })).status).toBe(401);
    const roleResponse = await post('/api/acquisition/agent-create', { customerId }, userCookie);
    expect(roleResponse.status).toBe(200);
    const agentId = (await roleResponse.json()).workspace.acquisition.agents[0].id;
    expect((await post('/api/acquisition/agent-action', { agentId, action: 'pause' }, adminCookie)).status).toBe(400);
    expect((await post('/api/acquisition/agent-trial', { agentId, text: '需要报价', source: '夹具', platform: '小红书' }, adminCookie)).status).toBe(400);
    expect((await post('/api/acquisition/agent-save', { agentId, baseVersion: 1, config: {} }, adminCookie)).status).toBe(400);
    expect((await post('/api/users/reset', { email: 'user@example.test' }, adminCookie)).status).toBe(200);
    expect((await fetch(`${origin}/api/me`, { headers: { cookie: userCookie } })).status).toBe(401);
    expect((await post('/api/register', { email: 'user@example.test', password: 'attacker123', activationCode: invite.activationCode })).status).toBe(400);
  });
  it('expensive requests are limited across endpoints per account with Retry-After', async () => {
    let response;
    for (let i = 0; i < 31; i++) response = await post(['/api/content/export', '/api/post-rewrite', '/api/growth-facts/extract'][i % 3], {}, adminCookie);
    expect(response.status).toBe(429); expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
