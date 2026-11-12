import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
let dir, server, origin;
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-public-seo-'));
  for (const file of ['login.html', 'index.html', 'register.html']) fs.copyFileSync(path.join(root, file), path.join(dir, file));
  fs.mkdirSync(path.join(dir, 'images'));
  fs.copyFileSync(path.join(root, 'images/landing-landscape.webp'), path.join(dir, 'images/landing-landscape.webp'));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: dir, env: { ...process.env, PORT: String(port), HARTA_PUBLIC_ORIGIN: 'https://www.harta.cn', HARTA_TRUST_PROXY: '', HARTA_SETUP_PASSWORD: 'isolated-public-seo-password' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('SEO test server exited'); })]);
}, 10000);
afterAll(async () => {
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SEO HTTP and session boundaries', () => {
  it('serves public pages directly and identically to humans and AI crawlers', async () => {
    let previous;
    for (const ua of ['Mozilla/5.0', 'Googlebot', 'bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot']) {
      const response = await fetch(origin, { headers: { 'user-agent': ua, 'x-forwarded-host': 'evil.example' } });
      expect(response.status).toBe(200);
      expect(response.redirected).toBe(false);
      expect(response.headers.get('x-robots-tag')).not.toContain('noindex');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toBe('Cookie');
      const html = await response.text();
      expect(html).toContain('https://www.harta.cn/');
      expect(html).not.toContain('evil.example');
      if (previous) expect(html).toBe(previous);
      previous = html;
    }
  });

  it('supports HEAD, real status codes, trailing slash canonicalization and index alias', async () => {
    for (const route of ['/', '/pricing/', '/product/', '/guides/content-acquisition/', '/guides/comment-leads/', '/guides/review/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/login.html']) {
      const get = await fetch(origin + route), head = await fetch(origin + route, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.headers.get('content-type')).toBe(get.headers.get('content-type'));
      expect(head.headers.get('x-robots-tag')).toBe(get.headers.get('x-robots-tag'));
      expect(await head.text()).toBe('');
    }
    const slash = await fetch(origin + '/product?source=search', { redirect: 'manual' });
    expect(slash.status).toBe(308); expect(slash.headers.get('location')).toBe('/product/?source=search');
    const alias = await fetch(origin + '/index.html?first=1', { redirect: 'manual' });
    expect(alias.status).toBe(302); expect(alias.headers.get('location')).toBe('/?first=1');
    const missing = await fetch(origin + '/guides/missing/');
    expect(missing.status).toBe(404); expect(missing.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('permits public image indexing with consistent 200/304 headers', async () => {
    const response = await fetch(origin + '/images/landing-landscape.webp');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).not.toContain('noindex');
    const notModified = await fetch(origin + '/images/landing-landscape.webp', { headers: { 'if-none-match': response.headers.get('etag') } });
    expect(notModified.status).toBe(304);
    expect(notModified.headers.get('x-robots-tag')).toBe(response.headers.get('x-robots-tag'));
  });

  it('preserves private API, login, reports and workspace restrictions after login/logout', async () => {
    for (const route of ['/api/me', '/api/workspace', '/api/costs', '/login.html', '/register.html', '/p/unknown', '/data/private.md', '/README.md']) {
      const response = await fetch(origin + route);
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
      if (route.startsWith('/api/')) expect(response.status).toBe(401);
    }
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.harta.cn' }, body: JSON.stringify({ email: '66445039@qq.com', password: 'isolated-public-seo-password' }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const freshCosts = await fetch(origin + '/api/costs', { headers: { cookie } });
    expect(freshCosts.status).toBe(200);
    expect(freshCosts.headers.get('cache-control')).toBe('no-store');
    expect(freshCosts.headers.get('x-robots-tag')).toContain('noindex');
    expect((await freshCosts.json()).actualCharges).toBeNull();
    expect(fs.existsSync(path.join(dir, 'data/model-spend.sqlite'))).toBe(false);
    const db = new DatabaseSync(path.join(dir, 'data/model-spend.sqlite'));
    db.exec('CREATE TABLE spend(day TEXT,owner TEXT,cents INTEGER,calls INTEGER,PRIMARY KEY(day,owner))');
    const day = new Date().toISOString().slice(0, 10);
    for (const [email, cents] of [['66445039@qq.com', 321], ['other@test.example', 888]]) db.prepare('INSERT INTO spend VALUES(?,?,?,1)').run(day, createHash('sha256').update(email).digest('hex'), cents);
    db.close();
    const ownCosts = await fetch(origin + '/api/costs?email=other@test.example', { headers: { cookie } });
    const ownData = await ownCosts.json();
    expect(ownData.reservedCents).toBe(321); expect(JSON.stringify(ownData)).not.toContain('888');
    for (const route of ['/', '/?first=1', '/?platform_connection=return', '/index.html']) {
      const workspace = await fetch(origin + route, { headers: { cookie } });
      expect(workspace.status).toBe(200);
      expect(workspace.headers.get('x-robots-tag')).toContain('noindex');
      expect(workspace.headers.get('cache-control')).toBe('private, no-store');
      expect(workspace.headers.get('vary')).toBe('Cookie');
      expect(await workspace.text()).toContain('data-shell="future-studio"');
    }
    const guide = await fetch(origin + '/product/', { headers: { cookie } });
    expect(guide.headers.get('x-robots-tag')).not.toContain('noindex');
    await fetch(origin + '/api/logout', { method: 'POST', headers: { cookie, origin: 'https://www.harta.cn', 'content-type': 'application/json' }, body: '{}' });
    const expired = await fetch(origin, { headers: { cookie } });
    expect(expired.headers.get('x-robots-tag')).not.toContain('noindex');
    expect(await expired.text()).toContain('id="hero-title"');
    const hostStatus = await new Promise((resolve, reject) => {
      const request = http.get(origin + '/', { headers: { host: 'evil.example' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      request.on('error', reject);
    });
    expect(hostStatus).toBe(421);
  });
});
