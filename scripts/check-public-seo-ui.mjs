import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { publicPages } from '../lib/public-content.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-public-seo-ui-'));
const output = path.join(root, 'output/geo-seo');
let server, browser;
try {
  for (const name of ['login.html', 'index.html', 'register.html', 'css', 'js', 'images']) fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: dir, env: { ...process.env, PORT: String(port), HARTA_PUBLIC_ORIGIN: '', HARTA_TRUST_PROXY: '', HARTA_SETUP_PASSWORD: 'isolated-public-seo-ui-password' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('UI server exited'); })]);
  browser = await chromium.launch({ headless: true, executablePath: process.env.HARTA_E2E_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  // External fonts are optional; test the actual system-font fallback deterministically.
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(requests.some(url => url.includes('/three/')), false, 'Reduced motion must not download Three.js');
  await page.screenshot({ path: path.join(output, 'home-desktop.png') });
  await page.locator('.landing-cta').click();
  await page.waitForFunction(() => document.activeElement?.id === 'email');
  assert.equal(await page.locator('#login').isVisible(), true);
  await page.locator('.landing-back').click();
  await page.locator('#intro').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#intro').isVisible(), true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const definition of publicPages) {
      await page.goto(origin + definition.path, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('h1').innerText(), definition.heading);
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://www.harta.cn${definition.path}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Horizontal page overflow: ${definition.path}, ${width}`);
      for (const link of await page.locator('.public-toc a').evaluateAll(links => links.map(a => a.hash))) assert.equal(await page.locator(link).count(), 1);
      const name = definition.path.split('/').filter(Boolean).at(-1);
      await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
    }
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator('footer').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Footer overflow: ${width}`);
    await page.screenshot({ path: path.join(output, `footer-${width}.png`) });
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  for (const route of ['/', ...publicPages.map(p => p.path)]) {
    await staticPage.goto(origin + route, { waitUntil: 'domcontentloaded' });
    assert.equal(await staticPage.locator('h1').isVisible(), true, `No-JS heading: ${route}`);
    assert.ok((await staticPage.locator('main').innerText()).length > 500, `No-JS content: ${route}`);
  }
  const animated = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' });
  await animated.route('https://fonts.googleapis.com/**', route => route.abort());
  const animationPage = await animated.newPage();
  animationPage.on('pageerror', error => errors.push(error.message));
  let threeRequests = 0;
  animationPage.on('request', request => { if (request.url().includes('/three/')) threeRequests++; });
  await animationPage.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(threeRequests, 0, 'Three.js must not load on initial viewport');
  await animationPage.locator('.story').first().scrollIntoViewIfNeeded();
  await animationPage.waitForRequest(request => request.url().includes('/three/'), { timeout: 5000 }).catch(() => assert.ok(threeRequests > 0));
  assert.ok(threeRequests > 0, 'Three.js must load when a story approaches');
  assert.deepEqual(errors, []);
  console.log('SEO UI passed: desktop/mobile, 5 pages without JS, login navigation, anchors, no overflow, deferred/reduced motion.');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
  fs.rmSync(dir, { recursive: true, force: true });
}
