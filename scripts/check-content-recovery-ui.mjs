// Interrupt a real local Harta process while the local model fixture holds a
// fact-review request. The browser must never silently repeat that request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { ADMIN_EMAIL } from '../lib/auth.mjs';
import { writeWorkspace } from '../lib/workspace.mjs';
import { addModel, saveProvider, setActive, setModelEnabled, useModel } from '../lib/llm.mjs';
import { content, customer, proposals } from './fixtures/organic-content.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-recovery-ui-'));
const password = 'local-recovery-test-password';
const calls = { research: 0, plan: 0, draft: 0, review: 0 };
let server, browser, provider, held, origin, port;
const observed = Promise.withResolvers();
function fixture(system, user) {
  if (system.includes('内容事实核对编辑')) {
    calls.review++;
    return { approved: true, issues: [] };
  }
  if (user.includes('这一步不生成正文')) {
    calls.plan++;
    return proposals();
  }
  if (user.includes('独立比较候选，不默认')) {
    calls.plan++;
    const chosen = ['C5', 'C2'];
    return {
      selected: chosen.map((candidateId) => ({ candidateId, reason: '可用现有材料核对' })),
      rejected: proposals().candidates.filter((c) => !chosen.includes(c.id)).map((c) => ({
        candidateId: c.id,
        reason: '留到下一批',
      })),
      materialRequest: '',
    };
  }
  if (user.includes('本批独立筛选后的创意')) {
    calls.draft++;
    return content();
  }
  if (user.includes('最多3个')) {
    calls.research++;
    return { seeds: ['门窗'], queries: ['业主问题'] };
  }
  if (user.includes('输出可执行方案')) {
    calls.research++;
    return {
      audience: '业主',
      platform: '小红书',
      rationale: '帮助核对条款',
      profile: '业主问题',
      platformMechanism: '待核实',
      preferences: '推断',
      trust: '合同',
      consultation: '服务范围',
      execution: '纸笔示意',
    };
  }
  throw Error('未知的隔离模型请求');
}
async function start() {
  server = spawn(process.execPath, [path.join(root, 'server.mjs')], {
    cwd: temp,
    env: {
      ...process.env,
      PORT: String(port),
      HARTA_PUBLIC_ORIGIN: '',
      HARTA_SETUP_PASSWORD: password,
      HARTA_TRUST_PROXY: '',
      HARTA_5118_API_KEY: '',
      HARTA_BRAVE_API_KEY: '',
      HARTA_SEARXNG_URL: '',
      HARTA_RSSHUB_URL: '',
      HARTA_MODEL_ACCOUNT_DAILY_CENTS: '100000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await Promise.race([
    once(server.stdout, 'data'),
    once(server, 'exit').then(() => {
      throw Error('隔离服务未启动');
    }),
  ]);
}
async function stop(signal = 'SIGTERM') {
  if (server && server.exitCode === null && server.signalCode === null) {
    const done = once(server, 'exit');
    server.kill(signal);
    await done;
  }
}
try {
  for (
    const name of ['index.html', 'login.html', 'register.html', 'css', 'js', 'vendor', 'images', 'fonts']
  ) fs.cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
  process.chdir(temp);
  writeWorkspace(ADMIN_EMAIL, {
    seedVersion: 999,
    usingId: customer.id,
    customers: [{ ...customer, track: '存量', packs: [], drops: [] }],
  });
  provider = http.createServer(async (req, res) => {
    let raw = '';
    for await (const bytes of req) raw += bytes;
    try {
      const messages = JSON.parse(raw).messages,
        output = fixture(messages[0].content, messages.at(-1).content);
      if (messages[0].content.includes('内容事实核对编辑') && calls.review === 1) {
        held = res;
        observed.resolve();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        }),
      );
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: { message: err.message } }));
    }
  }).listen(0, '127.0.0.1');
  await once(provider, 'listening');
  saveProvider('custom', {
    baseUrl: 'http://127.0.0.1:' + provider.address().port + '/v1',
    apiKey: 'local-model',
  });
  addModel('custom', 'fixture');
  setModelEnabled('custom', 'fixture', true);
  useModel('custom', 'fixture');
  setActive('custom');
  const probe = http.createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  origin = 'http://127.0.0.1:' + port;
  await start();
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  const context = await browser.newContext({
    extraHTTPHeaders: { origin },
    viewport: { width: 390, height: 844 },
  });
  const api = context.request;
  assert.equal(
    (await api.post(origin + '/api/login', { data: { email: ADMIN_EMAIL, password } })).status(),
    200,
  );
  const res = await api.post(origin + '/api/today', { data: { customerId: customer.id } });
  assert.equal(res.status(), 200);
  let timeout;
  try {
    await Promise.race([
      observed.promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error('未进入事实核对 ' + JSON.stringify(calls))), 12000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  await stop('SIGKILL');
  held.destroy();
  await start();
  const page = await context.newPage();
  page.setDefaultTimeout(13000);
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const recover = page.getByRole('button', { name: '核对后继续', exact: true });
  await recover.waitFor();
  assert.ok(await recover.isVisible());
  assert.match(await page.locator('#job-center').innerText(), /事实核对/);
  const incomplete = (await (await api.get(origin + '/api/jobs')).json()).customers[0];
  assert.equal(
    (await api.post(origin + '/api/today', {
      data: { customerId: customer.id, resumeJobId: incomplete.lastRun.recovery.id },
    })).status(),
    409,
  );
  page.once('dialog', (d) => d.dismiss());
  await recover.click();
  assert.deepEqual(calls, { research: 2, plan: 2, draft: 1, review: 1 });
  page.once('dialog', async (d) => {
    assert.match(d.message(), /额外费用/);
    await d.accept();
  });
  await recover.click();
  await page.waitForFunction(() => document.querySelector('#job-center')?.innerText.includes('已完成'));
  const finished = (await (await api.get(origin + '/api/workspace')).json()).customers[0];
  assert.equal(finished.drops.length, 1);
  assert.equal(finished.drops[0].modelUsage.attempts, 7);
  assert.equal(finished.drops[0].modelUsage.inputTokens, 300);
  assert.deepEqual(calls, { research: 2, plan: 2, draft: 1, review: 2 });
  assert.equal(
    (await api.post(origin + '/api/today', {
      data: { customerId: customer.id, resumeJobId: incomplete.lastRun.recovery.id },
    })).status(),
    400,
  );
  // A merchant can record the bill reference without treating it as per-call spend.
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('[data-nav=settings]').first().click();
  await page.locator('#account-costs > summary').click();
  await page.locator('#provider-statements > summary').click();
  const form = page.locator('#provider-statement-form');
  await form.locator('[name=provider]').fill('隔离供应商');
  await form.locator('[name=reference]').fill('TEST-017');
  await form.locator('[name=amount]').fill('12.30');
  await form.locator('[name=periodEnd]').fill('2026-01-01');
  await form.getByRole('button', { name: '保存账单记录' }).click();
  await page.locator('#provider-statement-list').getByRole('button', { name: '更正' }).waitFor();
  const costs = await (await api.get(origin + '/api/costs')).json();
  assert.equal(costs.providerStatements[0].cents, 1230);
  assert.equal(costs.measuredUsage.inputReports, 6);
  assert.equal(costs.actualCharges, null);
  console.log(
    '内容恢复通过。进程重启后手机界面提示核对费用，取消产生零次请求，确认后仅重新请求事实核对并保存一批成稿。',
  );
} finally {
  await browser?.close();
  await stop();
  held?.destroy();
  provider?.closeAllConnections();
  if (provider) await new Promise((r) => provider.close(r));
  process.chdir(root);
  fs.rmSync(temp, { recursive: true, force: true });
}
