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
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });
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
      assert.equal((await page.locator('h1').innerText()).replace(/\s/g, ''), definition.heading.replace(/\s/g, ''));
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://www.harta.cn${definition.path}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Horizontal page overflow: ${definition.path}, ${width}`);
      for (const link of await page.locator('.public-toc a').evaluateAll(links => links.map(a => a.hash))) assert.equal(await page.locator(link).count(), 1);
      const name = definition.path.split('/').filter(Boolean).at(-1);
      await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
      if (definition.path === '/pricing/' && width === 1440) await page.screenshot({ path: path.join(output, 'pricing-preview.png') });
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

  // Pricing is a budget worksheet, never a checkout or a budget policy write.
  const pricingMutations = [];
  page.on('request', request => { if (request.method() !== 'GET') pricingMutations.push(request.url()); });
  await page.goto(origin + '/pricing/?plan=solo', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#pricing-plan').inputValue(), 'solo');
  assert.equal(await page.locator('#pricing-total').innerText(), '¥219');
  await page.locator('#budget-model').fill('0.10');
  await page.locator('#budget-data').fill('0.20');
  await page.locator('#budget-image').fill('0');
  assert.equal(await page.locator('#pricing-total').innerText(), '¥99.3');
  await page.locator('#budget-model').fill('');
  assert.equal(await page.locator('#download-pricing').isDisabled(), true);
  assert.equal(await page.locator('#pricing-total').innerText(), '—');
  await page.locator('#budget-model').fill('-1');
  assert.equal(await page.locator('#copy-pricing').isDisabled(), true);
  await page.locator('#budget-model').fill('50');
  await page.locator('#budget-data').fill('50');
  await page.locator('#budget-image').fill('20');
  await page.locator('[data-plan=studio]').click();
  assert.equal(await page.locator('#pricing-plan').inputValue(), 'studio');
  assert.equal(await page.locator('#pricing-total').innerText(), '¥919');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-pricing').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const checklist = Buffer.concat(chunks).toString('utf8');
  assert.ok(checklist.includes('¥919'));
  assert.ok(checklist.includes('不会自动提交订单、扣款、续费或开通'));
  assert.deepEqual(pricingMutations, []);

  // Real authenticated settings view, with no paid external services configured.
  const loginResponse = await context.request.post(origin + '/api/login', { headers: { origin }, data: { email: '66445039@qq.com', password: 'isolated-public-seo-ui-password' } });
  assert.equal(loginResponse.status(), 200);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('[data-nav=settings]').click();
  await page.locator('#account-costs > summary').click();
  await page.locator('.account-costs-metrics').waitFor();
  assert.ok((await page.locator('#account-costs-body').innerText()).includes('US$0.00'));
  await page.locator('#account-costs').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'cost-settings-1440.png') });
  await page.setViewportSize({ width: 390, height: 960 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Cost settings overflow');
  await page.screenshot({ path: path.join(output, 'cost-settings-390.png') });
  assert.deepEqual(errors, []);
  console.log(`SEO/pricing UI passed: desktop/mobile, ${publicPages.length + 1} pages without JS, calculator validation, checklist download, no charge requests, real cost settings and deferred/reduced motion.`);
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
  fs.rmSync(dir, { recursive: true, force: true });
}
