import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url))), require = createRequire(root + '/package.json'), { chromium } = require('playwright-core');
const bounded = (promise, label) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(label + ' timed out')), 20000); promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); }); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-production-e2e-'));
for (const n of ['js', 'css', 'images', 'fonts'])
    fs.cpSync(root + '/' + n, dir + '/' + n, { recursive: true });
fs.copyFileSync(root + '/index.html', dir + '/index.html');
fs.writeFileSync(dir + '/login.html', '<!doctype html><title>Test</title>');
const listener = net.createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise(r => listener.close(r));
const proc = spawn(process.execPath, [root + '/server.mjs'], { cwd: dir, env: { ...process.env, PORT: String(port), HARTA_PUBLIC_ORIGIN: '', HARTA_SETUP_PASSWORD: 'test-password-12345' }, stdio: ['ignore', 'pipe', 'pipe'] });
const exited = once(proc, 'exit');
proc.stdout.resume();
proc.stderr.resume();
let browser, context;
const failedRequests = [];
try {
    await Promise.race([once(proc.stdout, 'data'), once(proc, 'exit').then(() => { throw Error('server exited'); })]);
    const origin = `http://127.0.0.1:${port}`;
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: '66445039@qq.com', password: 'test-password-12345' }) });
    if (!login.ok)
        throw Error('login failed ' + login.status);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    process.chdir(dir);
    const { writeWorkspace, readWorkspace } = await import(root + '/lib/workspace.mjs');
    writeWorkspace('66445039@qq.com', { customers: [{ id: 'c1', name: '测试业务', hunt: '家装', pitch: '厨房翻新', drops: [{ id: 'p1', tier: '今日', origin: { mode: 'legacy', goal: 'reach' }, workReferences: [{ title: '参考样本', platform: '小红书', url: 'https://www.xiaohongshu.com/explore/abc123', description: '做厨房翻新之前一定先确认水电管线的位置再讨论其他细节' }], copies: { A: ['原稿正文'] }, shells: { '小红书': [{ title: '原稿标题', body: '原稿正文', cover: '原稿封面', shots: '镜头一' }] } }] }], ledger: [], feedback: {}, contentStates: {}, seedVersion: 999, acquisition: { tasks: [], signals: [], leads: [], publications: [], accounts: [{ id: 'live-account', customerId: 'c1', platform: '小红书', name: '直播验收账号', mode: 'manual', status: 'unverified', capabilities: [] }], logs: [], works: [{ id: 'w1', customerId: 'c1', platform: '小红书', title: '厨房收纳方法', description: '厨房翻新时先测量', url: 'https://example.com/work', source: 'manual_import', createdAt: '2026-01-01T00:00:00Z' }] } });
    const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const executablePath = process.env.HARTA_E2E_CHROME || (fs.existsSync(localChrome) ? localChrome : chromium.executablePath());
    browser = await chromium.launch({ headless: true, executablePath });
    context = await bounded(browser.newContext({ acceptDownloads: true, extraHTTPHeaders: { origin } }), 'browser context'); // Pace real browser requests below the production API budget; do not retry mutations or bypass rate limits.
    let nextBrowserRequest = 0;
    await context.route('**/api/**', async (route) => { const now = Date.now(), delay = Math.max(0, nextBrowserRequest - now); nextBrowserRequest = Math.max(nextBrowserRequest, now) + 350; if (delay)
        await new Promise(resolve => setTimeout(resolve, delay)); await route.fallback(); });
    await context.addCookies([{ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), url: origin }]);
    const page = await context.newPage();
    const openProduction = async () => { const summary = page.getByText('脚本、直播与封面制作', { exact: true }).first(); await summary.waitFor(); if (!await summary.evaluate(el => el.closest('details').open))
        await summary.click(); };
    const productionPanel = async key => { const tab=page.locator('[data-production-mode]').first().locator(`[data-production-tab=${key}]`); if(await tab.getAttribute('aria-selected')!=='true')await tab.click(); };
    page.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/')) {
        failedRequests.push({ status: r.status(), url: new URL(r.url()).pathname });
        if (failedRequests.length > 12)
            failedRequests.shift();
    } });
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await page.goto(origin + '/');
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav=settings]').click();
    const imageSettings = page.locator('#image-model-settings');
    await imageSettings.locator('summary').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#image-model-status')?.textContent));
    await imageSettings.locator('#image-model-request-mode').selectOption('minimal');
    let imageConfigSaved = page.waitForResponse(r => r.url().endsWith('/api/image-model') && r.request().method() === 'POST');
    await imageSettings.locator('#image-model-save').click();
    if (!(await imageConfigSaved).ok())
        throw Error('image request mode save failed');
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav=settings]').click();
    await page.locator('#image-model-settings summary').click();
    await page.waitForFunction(() => document.querySelector('#image-model-request-mode')?.value === 'minimal');
    await page.locator('#image-model-request-mode').selectOption('auto');
    imageConfigSaved = page.waitForResponse(r => r.url().endsWith('/api/image-model') && r.request().method() === 'POST');
    await page.locator('#image-model-save').click();
    if (!(await imageConfigSaved).ok())
        throw Error('image request mode reset failed');
    const liveReminderSpace = readWorkspace('66445039@qq.com'), liveReminderPack = liveReminderSpace.customers.find(c => c.id === 'c1').drops.find(p => p.id === 'p1');
    liveReminderSpace.contentStates = {};
    liveReminderPack.productionDrafts = { '小红书|0': { live: false, format: 'video', version: 1, fields: { script: '视频稿' } }, '小红书|0|live': { live: true, version: 1, fields: { title: '待核对直播', liveSchedule: '2001-01-01T10:00', liveOpen: '直播开场原稿' } } };
    writeWorkspace('66445039@qq.com', liveReminderSpace);
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav=workbench]').click();
    await page.getByRole('heading', { name: '直播计划已到：待核对直播' }).waitFor();
    await page.locator('.cm-next').getByRole('button', { name: '查看直播' }).click();
    const liveTarget = page.locator('[data-production-mode=live][data-growth-pack=p1][data-growth-platform=小红书]').first();
    await liveTarget.locator('[name=production-liveOpen]').waitFor();
    if (await liveTarget.locator('[name=production-script]').isVisible())
        throw Error('live production should group other content fields');
    if (!(await liveTarget.locator('[name=production-liveSchedule]').isVisible()))
        throw Error('live schedule should be visible in live mode');
    if (await liveTarget.locator('[name=production-liveOpen]').inputValue() !== '直播开场原稿')
        throw Error('live reminder did not open the correct saved draft');
    await liveTarget.locator('[name=production-liveOpen]').fill('未保存直播修改');
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=schedule]').click();
    const liveList = page.locator('#cm-content-home section').filter({ has: page.getByRole('heading', { name: '直播排期与复盘' }) });
    await liveList.getByRole('button', { name: '查看场次' }).click();
    const reopenedLive = page.locator('[data-production-mode=live][data-growth-pack=p1][data-growth-platform=小红书]').first();
    await reopenedLive.locator('[name=production-liveOpen]').waitFor();
    if (await reopenedLive.locator('[name=production-liveOpen]').inputValue() !== '未保存直播修改')
        throw Error('live shortcut lost unsaved edits');
    const clearLiveFixture = readWorkspace('66445039@qq.com');
    delete clearLiveFixture.customers.find(c => c.id === 'c1').drops.find(p => p.id === 'p1').productionDrafts;
    writeWorkspace('66445039@qq.com', clearLiveFixture);
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    const reminderSpace = readWorkspace('66445039@qq.com'), reminderCustomer = reminderSpace.customers.find(c => c.id === 'c1'), reminderPack = reminderCustomer.drops.find(p => p.id === 'p1');
    reminderCustomer.drops = [reminderPack];
    reminderCustomer.packs = [];
    reminderPack.productReview = null;
    reminderPack.productionDrafts = {};
    reminderSpace.acquisition.signals = [];
    reminderSpace.acquisition.leads = [];
    reminderSpace.acquisition.opportunities = [];
    reminderSpace.acquisition.publications = [];
    reminderSpace.contentStates = { 'p1::小红书|0|title': { status: 'selected', plannedAt: '2001-01-01' } };
    writeWorkspace('66445039@qq.com', reminderSpace);
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav=workbench]').click();
    await page.getByRole('heading', { name: '计划待发布：原稿标题' }).waitFor();
    await page.locator('.cm-next').getByRole('button', { name: '查看作品' }).click();
    await page.getByText('脚本、直播与封面制作', { exact: true }).first().waitFor();
    await page.locator('[data-workspace-view=research]').click();
    const packSettings = page.locator('#growth-settings');
    await packSettings.locator('summary').filter({ hasText: '创作打法' }).click();
    await packSettings.locator('[name=pack-name]').fill('测试直播答疑');
    await packSettings.locator('[name=pack-instruction]').fill('先收集观众问题');
    await packSettings.locator('[name=pack-platform]').selectOption('小红书');
    await packSettings.locator('[name=pack-form]').selectOption('live');
    await packSettings.locator('[name=pack-goal]').selectOption('reach_leads');
    const packCreated = page.waitForResponse(r => r.url().endsWith('/api/creator-packs') && r.request().method() === 'POST');
    await packSettings.locator('[data-growth-action=packs]').click();
    if (!(await packCreated).ok())
        throw Error('custom live pack was not created');
    const packId = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').creatorPackSettings.custom.find(p => p.name === '测试直播答疑')?.id;
    if (!packId || readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').creatorPackSettings.custom.find(p => p.id === packId).goal !== 'reach_leads')
        throw Error('custom live pack or goal missing');
    await packSettings.locator('[name=pack-selected]').selectOption(packId);
    const packSelected = page.waitForResponse(r => r.url().endsWith('/api/creator-packs') && r.request().method() === 'POST');
    await packSettings.locator('[data-growth-action=packs]').click();
    if (!(await packSelected).ok() || readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').creatorPackSettings.selected !== packId)
        throw Error('custom live pack not selected');
    await packSettings.locator('[name=pack-name]').fill('测试引流打法');
    await packSettings.locator('[name=pack-instruction]').fill('清楚说明承接方式');
    await packSettings.locator('[name=pack-job]').selectOption('divert');
    const jobPackCreated = page.waitForResponse(r => r.url().endsWith('/api/creator-packs') && r.request().method() === 'POST');
    await packSettings.locator('[data-growth-action=packs]').click();
    if (!(await jobPackCreated).ok()) throw Error('job-scoped pack was not created');
    const jobPack = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').creatorPackSettings.custom.find(p => p.name === '测试引流打法');
    if (jobPack?.job !== 'divert') throw Error('custom pack job missing');
    await packSettings.getByText(/测试引流打法.*引流/).waitFor();
    const clearReminder = readWorkspace('66445039@qq.com');
    clearReminder.contentStates = {};
    writeWorkspace('66445039@qq.com', clearReminder);
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=ideas]').click();
    await page.getByRole('heading', { name: '内容雷达' }).waitFor();
    await page.locator('summary').filter({ hasText: '粘贴参考样本' }).click();
    await page.locator('[data-cm-form=radar-import] [name=text]').fill('厨房水槽怎么选\n先核对厨房尺寸，再比较收纳。');
    await page.locator('[data-cm-form=radar-import] button[type=submit]').click();
    const sampleRow = page.locator('#cm-content-home article.cm-row').filter({ hasText: '厨房水槽怎么选' });
    await sampleRow.waitFor();
    const sampleId = await sampleRow.locator('[data-radar-work]').getAttribute('data-radar-work');
    await page.locator('[data-radar-work=w1]').selectOption('now');
    await page.locator('[data-radar-work=w1][data-previous=now]').waitFor();
    await page.locator('[data-radar-work=w1]').selectOption('discard');
    await page.locator('[data-radar-work=w1][data-previous=discard]').waitFor({ state: 'attached' });
    await page.locator('summary').filter({ hasText: '已舍弃的作品' }).click();
    await page.locator('[data-radar-work=w1][data-previous=discard]').selectOption('reset');
    await page.locator('[data-radar-work=w1][data-previous=reset]').waitFor();
    await sampleRow.locator('summary').filter({ hasText: '设计自己的开头' }).click();
    const sampleHookForm = sampleRow.locator('[data-cm-form=radar-hook]');
    const { radarHookBasis } = await import(root + '/lib/radar-hook-basis.mjs');
    const hookSpace = readWorkspace('66445039@qq.com'), hookCustomer = hookSpace.customers.find(c => c.id === 'c1'), hookWork = hookSpace.acquisition.works.find(w => w.id === sampleId);
    await page.route('**/api/radar-hook-generate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hook: '厨房收纳先问什么？', basis: radarHookBasis(hookCustomer, hookWork), version: 0, warnings: [] }) }), { times: 1 });
    await sampleRow.getByRole('button', { name: 'AI 换开头' }).click();
    await sampleHookForm.locator('[name=text]').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-cm-form=radar-hook] textarea')].some(el => el.value === '厨房收纳先问什么？'));
    await sampleHookForm.locator('[name=text]').fill('厨房收纳先核对哪些尺寸？');
    const hookSaved = page.waitForResponse(response => response.url().endsWith('/api/radar-hook-save'));
    await sampleHookForm.getByRole('button', { name: '保存开头' }).click();
    if (!(await hookSaved).ok())
        throw Error('radar hook save failed');
    const hookAfter = readWorkspace('66445039@qq.com');
    const { workReferences } = await import(root + '/lib/work-references.mjs');
    if (workReferences(hookAfter, 'c1', [sampleId])[0].preferredHook !== '厨房收纳先核对哪些尺寸？')
        throw Error('radar hook not handed into reference');
    await sampleRow.locator('summary').filter({ hasText: '设计自己的开头' }).click();
    await sampleRow.getByText('已保存 · 当前会随参考作品用于创作').waitFor();
    const editedHookSpace = readWorkspace('66445039@qq.com');
    editedHookSpace.acquisition.works.find(w => w.id === sampleId).description = '先测量空间，再检查水槽排水。';
    writeWorkspace('66445039@qq.com', editedHookSpace);
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=ideas]').click();
    await sampleRow.locator('summary').filter({ hasText: '设计自己的开头' }).click();
    await sampleRow.getByText('资料已变化 · 此开头暂不带入创作，请核对后重新保存').waitFor();
    if (workReferences(readWorkspace('66445039@qq.com'), 'c1', [sampleId])[0].preferredHook)
        throw Error('stale hook still used');
    const renewed = page.waitForResponse(response => response.url().endsWith('/api/radar-hook-save'));
    await sampleRow.locator('[data-cm-form=radar-hook]').getByRole('button', { name: '保存开头' }).click();
    if (!(await renewed).ok())
        throw Error('hook reapproval failed');
    await sampleRow.locator('summary').filter({ hasText: '设计自己的开头' }).click();
    await sampleRow.getByText('已保存 · 当前会随参考作品用于创作').waitFor();
    await sampleRow.getByRole('button', { name: '参考此作品创作' }).click();
    await page.waitForFunction(id => [...document.querySelectorAll('[name=referenceWorkIds]')].some(el => el.value === id && el.checked), sampleId, { timeout: 12000 });
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.getByRole('button', { name: '查看与制作' }).first().click();
    await page.getByText('脚本、直播与封面制作', { exact: true }).first().waitFor({ timeout: 12000 });
    await openProduction();
    await page.locator('[name=production-live]').first().selectOption('live');
    await productionPanel('script');
    await page.locator('[name=production-liveOpen]').first().fill('开场判断');
    await productionPanel('script');
    await page.locator('[name=production-liveSegments]').first().fill('证据与步骤');
    await productionPanel('script');
    await page.locator('[name=production-liveInteraction]').first().fill('观众问题');
    await productionPanel('script');
    await page.locator('[name=production-liveClose]').first().fill('总结');
    const weekDates = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); const out = []; for (let i = 0; i < 7; i++) {
        const n = new Date(d);
        n.setDate(d.getDate() + i);
        out.push(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`);
    } return out; });
    await productionPanel('script');
    await page.locator('[name=production-liveSchedule]').first().fill(weekDates[1] + 'T19:00');
    await productionPanel('script');
    await page.locator('[name=production-liveReview]').first().fill('直播复盘依据');
    await productionPanel('script');
    await page.locator('[name=production-liveAttendance]').first().fill('10');
    await productionPanel('script');
    await page.locator('[name=production-liveRetained]').first().fill('4');
    await productionPanel('script');
    await page.locator('[name=production-liveInquiries]').first().fill('5');
    await productionPanel('script');
    await page.locator('[name=production-liveQualifiedLeads]').first().fill('2');
    await productionPanel('delivery');
    const [liveDocument] = await Promise.all([page.waitForEvent('download'), page.locator('[data-growth-action=production-download]').first().click()]);
    const liveText = fs.readFileSync(await liveDocument.path(), 'utf8');
    if (!liveText.includes('直播复盘依据') || !liveText.includes(weekDates[1] + 'T19:00') || !liveText.includes('直播咨询人数（手工统计）\n5'))
        throw Error('live script download missing fields');
    await productionPanel('cover');
    await page.locator('[name=production-cover]').first().fill('真实封面文字');
    await productionPanel('cover');
    await page.locator('[name=production-coverLayout]').first().fill('暖色厨房留白');
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-growth-action=production-save]')?.dataset.version === '1', { timeout: 12000 });
    await openProduction();
    const imageBytes = await require('sharp')({ create: { width: 30, height: 40, channels: 3, background: '#879090' } }).png().toBuffer();
    let coverRequest;
    await page.route('**/api/production-cover', async (route) => { coverRequest = route.request().postDataJSON(); await new Promise(resolve => setTimeout(resolve, 300)); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ image: 'data:image/png;base64,' + imageBytes.toString('base64'), line: '真实封面文字' }) }); });
    await productionPanel('cover');
    await page.locator('[data-growth-action=cover-ai]').first().click();
    await page.evaluate(() => { const el = document.querySelector('[data-ai-cover-preview]').closest('[data-growth-pack]'); el.outerHTML = el.outerHTML; });
    await page.locator('[data-ai-cover-preview]:visible').first().waitFor();
    if (coverRequest.layout !== '暖色厨房留白')
        throw Error('cover layout not sent');
    const [aiDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-ai-cover-download]:visible').first().click()]);
    if (fs.readFileSync(await aiDownload.path()).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw Error('invalid AI cover');
    await productionPanel('cover');
    await page.locator('[data-growth-action=cover-ai]').first().click();
    await productionPanel('cover');
    await page.locator('[name=production-coverLayout]').first().fill('改为冷色');
    await page.getByText('生成期间封面文字或排版说明已变更，请重新生成').first().waitFor();
    if (await page.locator('[data-ai-cover-preview]:visible').count())
        throw Error('stale cover shown');
    await productionPanel('cover');
    await page.locator('[name=production-coverLayout]').first().fill('暖色厨房留白');
    await productionPanel('cover');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-growth-action=cover-download]').first().click()]);
    const file = await download.path();
    if (fs.readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw Error('invalid png');
    const liveAssetsResponse = page.waitForResponse(r => r.url().endsWith('/api/production-assets') && r.request().method() === 'POST');
    await productionPanel('cover');
    await page.locator('[data-growth-action=assets-save]').first().click();
    const liveAssetsSaved = await liveAssetsResponse;
    if (!liveAssetsSaved.ok())
        throw Error('live cover save failed: ' + await liveAssetsSaved.text());
    const liveBundle = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.id === 'p1').productionAssets['小红书|0|live'];
    if (liveBundle?.format !== 'live' || !liveBundle.images.some(i => i.name === 'cover.png'))
        throw Error('live cover not saved independently');
    const liveAssetUrl = new URL('/api/production-assets', origin);
    for (const [k, v] of Object.entries({ customerId: 'c1', packId: 'p1', platform: '小红书', index: '0', bundleId: liveBundle.id, name: 'bundle' }))
        liveAssetUrl.searchParams.set(k, v);
    if (!(await context.request.get(liveAssetUrl.href)).ok())
        throw Error('live cover bundle unavailable');
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-growth-action=production-save]')?.dataset.version === '2');
    await openProduction();
    await productionPanel('cover');
    await page.locator('[name=production-coverLayout]').first().fill('布局已变');
    await productionPanel('cover');
    await page.locator('[data-growth-action=cover-reuse]').first().click();
    await page.getByText('封面文字或排版已变化，请重新制作封面').first().waitFor();
    await productionPanel('cover');
    await page.locator('[name=production-coverLayout]').first().fill('暖色厨房留白');
    const reusedResponse = page.waitForResponse(r => r.url().includes('/api/production-assets?') && r.url().includes('cover.png'));
    await productionPanel('cover');
    await page.locator('[data-growth-action=cover-reuse]').first().click();
    if (!(await reusedResponse).ok())
        throw Error('saved cover read failed');
    await page.getByText('已沿用封面，请核对后保存到当前素材包。').first().waitFor();
    const reusedSave = page.waitForResponse(r => r.url().endsWith('/api/production-assets') && r.request().method() === 'POST');
    await productionPanel('cover');
    await page.locator('[data-growth-action=assets-save]').first().click();
    if (!(await reusedSave).ok())
        throw Error('reused live cover save failed');
    const reusedBundle = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.id === 'p1').productionAssets['小红书|0|live'];
    if (reusedBundle.version !== 2 || reusedBundle.id === liveBundle.id)
        throw Error('reused cover not attached to new draft');
    await page.locator('[name=production-live]').first().selectOption('video');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('独立视频脚本');
    await productionPanel('script');
    await page.locator('[name=production-shots]').first().fill('');
    let scriptRequest;
    await page.route('**/api/production-generate', async (route) => { scriptRequest = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: { hook: '建议开头' } }) }); }, { times: 1 });
    await productionPanel('script');
    await page.locator('[data-growth-action=production-generate]').first().click();
    await page.waitForFunction(() => document.querySelector('[name=production-hook]')?.value === '建议开头');
    if (scriptRequest.workingFields.script !== '独立视频脚本' || scriptRequest.format !== 'video')
        throw Error('AI script request lost current draft');
    if (!await page.locator('[data-production-status]').first().textContent().then(t => t.includes('画面与分镜')))
        throw Error('missing shots not surfaced');
    await productionPanel('script');
    await page.locator('[name=production-cta]').first().fill('加微信咨询');
    await productionPanel('delivery');
    await page.locator('[data-growth-action=production-check]').first().click();
    await page.locator('[data-production-status]').first().getByText('包含站外联系方式或链接', { exact: false }).waitFor();
    await productionPanel('script');
    await page.locator('[name=production-cta]').first().fill('');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('做厨房翻新之前一定先确认水电管线的位置再讨论');
    await productionPanel('delivery');
    await page.locator('[data-growth-action=production-check]').first().click();
    await page.locator('[data-production-status]').first().getByText('与参考作品「参考样本」有连续相同文字', { exact: false }).waitFor();
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('独立视频脚本');
    let repairRequest;
    await page.route('**/api/production-generate', async (route) => { repairRequest = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: { shots: '镜头一：测量\n镜头二：记录\n镜头三：核对' } }) }); }, { times: 1 });
    await productionPanel('script');
    await page.locator('[data-growth-action=production-generate]').first().click();
    await page.waitForFunction(() => document.querySelector('[name=production-shots]')?.value.includes('镜头三'));
    if (repairRequest.workingFields.hook !== '建议开头' || repairRequest.workingFields.shots !== '')
        throw Error('incomplete fields not passed to repair');
    let releaseGeneration, markGeneration;
    const generationReady = new Promise(resolve => { markGeneration = resolve; }), generationGate = new Promise(resolve => { releaseGeneration = resolve; });
    await page.route('**/api/production-generate', async (route) => { markGeneration(); await generationGate; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: { cta: '过时收尾' } }) }); }, { times: 1 });
    await productionPanel('script');
    await page.locator('[data-growth-action=production-generate]').first().click();
    await bounded(generationReady, 'generation request');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('生成期间修改脚本');
    releaseGeneration();
    await page.locator('[data-production-status]').first().getByText('生成期间制作内容或类型已变化，请重新生成').waitFor();
    if (await page.locator('[name=production-cta]').first().inputValue() === '过时收尾')
        throw Error('stale AI result was applied');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('独立视频脚本');
    let factRequest;
    await page.route('**/api/production-fact-review', async (route) => { factRequest = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ issues: ['第1篇「独立视频脚本」：需核实；修改建议：补充依据'] }) }); }, { times: 1 });
    await productionPanel('delivery');
    await page.locator('[data-growth-action=production-fact-review]').first().click();
    await productionPanel('delivery');
    await page.locator('[data-production-fact-review]').first().getByText(/需核实/).waitFor();
    if (factRequest.fields.script !== '独立视频脚本')
        throw Error('fact review did not use current draft');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('核对后的修改');
    await productionPanel('delivery');
    await page.locator('[data-production-fact-review]').first().getByText('制作内容已变化，请重新进行事实核对。').waitFor();
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('独立视频脚本');
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-growth-action=production-save]')?.dataset.version === '1');
    await openProduction();
    await page.locator('[name=production-live]').first().selectOption('live');
    await productionPanel('cover');
    await page.locator('[data-production-mode=live] [data-saved-production-assets] img').first().waitFor();
    if (await page.locator('[name=production-liveReview]').first().inputValue() !== '直播复盘依据')
        throw Error('live review lost after saving video');
    await page.locator('[name=production-live]').first().selectOption('video');
    if (await page.locator('[name=production-script]').first().inputValue() !== '独立视频脚本')
        throw Error('video draft lost after switching');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('未保存的视频修改');
    await page.locator('[name=production-live]').first().selectOption('live');
    await productionPanel('script');
    await page.locator('[name=production-liveReview]').first().fill('未保存的直播复盘');
    await page.locator('[name=production-live]').first().selectOption('video');
    if (await page.locator('[name=production-script]').first().inputValue() !== '未保存的视频修改')
        throw Error('unsaved video changes lost while switching');
    await page.locator('[name=production-live]').first().selectOption('live');
    if (await page.locator('[name=production-liveReview]').first().inputValue() !== '未保存的直播复盘')
        throw Error('unsaved live changes lost while switching');
    let releaseSave, markSaveReady;
    const saveReady = new Promise(resolve => { markSaveReady = resolve; }), saveGate = new Promise(resolve => { releaseSave = resolve; });
    await page.route('**/api/production-draft', async (route) => { const response = await route.fetch(); markSaveReady(); await saveGate; await route.fulfill({ response }); }, { times: 1 });
    await productionPanel('script');
    await page.locator('[name=production-liveReview]').first().fill('保存中的直播复盘');
    await page.locator('[data-growth-action=production-save]').first().click();
    await bounded(saveReady, 'draft save request');
    await productionPanel('script');
    await page.locator('[name=production-liveReview]').first().fill('请求发出后的直播修改');
    await page.locator('[name=production-live]').first().selectOption('video');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('请求期间的视频修改');
    let duplicateSaves = 0;
    const countSave = request => { if (request.url().endsWith('/api/production-draft'))
        duplicateSaves++; };
    page.on('request', countSave);
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForTimeout(100);
    page.off('request', countSave);
    if (duplicateSaves)
        throw Error('concurrent save was not held');
    const savedResponse = page.waitForResponse(response => response.url().endsWith('/api/production-draft'));
    releaseSave();
    await savedResponse;
    await page.waitForTimeout(150);
    if (await page.locator('[name=production-live]').first().inputValue() !== 'video' || await page.locator('[name=production-script]').first().inputValue() !== '请求期间的视频修改')
        throw Error('save response overwrote another mode');
    await openProduction();
    await page.locator('[name=production-live]').first().selectOption('live');
    if (await page.locator('[name=production-liveReview]').first().inputValue() !== '请求发出后的直播修改')
        throw Error('save response discarded later live changes');
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=schedule]').click();
    let liveCard = page.locator('.cm-calendar-card').filter({ hasText: '直播 · 小红书' });
    await liveCard.waitFor();
    await page.locator('[aria-label="本周平台与形式"] p').filter({ hasText: /小红书.*直播 1/ }).waitFor();
    await liveCard.locator('summary').click();
    await liveCard.locator('[name=time]').fill(weekDates[2] + 'T20:00');
    await liveCard.getByRole('button', { name: '保存排期' }).click();
    await page.waitForFunction(date => [...document.querySelectorAll('.cm-calendar-card')].some(e => e.textContent.includes('直播 · 小红书') && e.closest('.cm-calendar-day')?.querySelector('h3')?.textContent.includes(date.slice(5))), weekDates[2]);
    liveCard = page.locator('.cm-calendar-card').filter({ hasText: '直播 · 小红书' });
    await liveCard.locator('summary').click();
    await liveCard.locator('[name=time]').fill('');
    await liveCard.getByRole('button', { name: '保存排期' }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.cm-calendar-card')].some(e => e.textContent.includes('直播 · 小红书')));
    await page.locator('[aria-label="本周平台与形式"] p').filter({ hasText: /小红书.*直播 0/ }).waitFor();
    const liveReview = page.locator('#cm-content-home section').filter({ has: page.getByRole('heading', { name: '直播排期与复盘' }) });
    await liveReview.getByText(/未排期/).first().waitFor();
    await liveReview.getByText(/进场 10.*留存 4.*咨询 5.*有效咨询 2/).waitFor();
    await liveReview.getByText(/留存 \/ 进场：40.0%（4 \/ 10）.*有效咨询 \/ 咨询：40.0%（2 \/ 5）/).waitFor();
    await liveReview.getByRole('button', { name: '登记直播咨询' }).first().click();
    const inquiry = page.locator('[data-acq-form=inquiry]');
    await inquiry.waitFor({ state: 'visible' });
    await inquiry.locator('[name=platform]').selectOption('小红书');
    await inquiry.locator('[name=accountId]').selectOption('live-account');
    if (await inquiry.locator('[name=liveSource]').inputValue() !== JSON.stringify(['p1', '小红书', 0]))
        throw Error('live source not preselected');
    await inquiry.locator('[name=authorName]').fill('直播访客');
    await inquiry.locator('[name=text]').fill('请问厨房翻新怎样预约');
    await inquiry.locator('[name=evidence]').fill('直播私信记录');
    await inquiry.getByRole('button', { name: '保存咨询，加入待回复' }).click();
    await page.waitForFunction(() => document.querySelector('#acq-inquiry') && !document.querySelector('#acq-inquiry').open);
    const savedLive = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.authorName === '直播访客');
    if (!savedLive?.needsReply || savedLive.messages[0].liveSource?.id !== JSON.stringify(['p1', '小红书', 0]))
        throw Error('live inquiry did not enter followup');
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=schedule]').click();
    const checkedReview = page.locator('#cm-content-home section').filter({ has: page.getByRole('heading', { name: '直播排期与复盘' }) });
    await checkedReview.getByText('已人工关联咨询 1 条 / 1 个联系人记录，与手工汇总可能重叠。').waitFor();
    await page.locator('[data-nav=conversations]').click();
    await page.locator('#cm-conversations').getByRole('button', { name: /直播访客/ }).click();
    await page.locator('#cm-conversations summary').filter({ hasText: '提炼为内容选题' }).first().click();
    const demand = page.locator('[data-cm-form=demand-topic]');
    await demand.locator('[name=topic]').fill('厨房预约前要准备哪些信息');
    await demand.locator('[name=confirmed]').check();
    await demand.getByRole('button', { name: '保存到需求选题' }).click();
    await demand.waitFor({ state: 'hidden' });
    await page.locator('#cm-conversations summary').filter({ hasText: '更正直播来源' }).click();
    let correction = page.locator('[data-cm-form=live-source]');
    await correction.locator('[name=liveSource]').selectOption('');
    await correction.locator('[name=note]').fill('核对后不是这场直播');
    await correction.locator('[name=confirmed]').check();
    await correction.getByRole('button', { name: '保存来源更正' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('#cm-conversations')].some(el => el.textContent.includes('咨询来源未知')));
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=schedule]').click();
    await checkedReview.getByText('已人工关联咨询 0 条 / 0 个联系人记录，与手工汇总可能重叠。').waitFor();
    await page.locator('[data-nav=conversations]').click();
    await page.locator('#cm-conversations summary').filter({ hasText: '更正直播来源' }).click();
    correction = page.locator('[data-cm-form=live-source]');
    await correction.locator('[name=liveSource]').selectOption(JSON.stringify(['p1', '小红书', 0]));
    await correction.locator('[name=note]').fill('再次核对后恢复');
    await correction.locator('[name=confirmed]').check();
    await correction.getByRole('button', { name: '保存来源更正' }).click();
    await page.waitForFunction(() => document.querySelector('#cm-conversations')?.textContent.includes('人工关联直播：'));
    const corrected = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.id === savedLive.id);
    if (corrected.messages[0].liveSourceHistory.length !== 2 || corrected.messages[0].text !== '请问厨房翻新怎样预约')
        throw Error('live inquiry correction lost history or text');
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=schedule]').click();
    await checkedReview.getByText('已人工关联咨询 1 条 / 1 个联系人记录，与手工汇总可能重叠。').waitFor();
    const originalBeforeCopy = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.id === 'p1').productionDrafts['小红书|0|live'].fields.liveReview;
    const copyResponse = page.waitForResponse(r => r.url().endsWith('/api/live-duplicate') && r.request().method() === 'POST');
    await checkedReview.getByRole('button', { name: '复制为新场次' }).first().click();
    const copyResult = await copyResponse;
    if (!copyResult.ok())
        throw Error('duplicate live failed: ' + await copyResult.text());
    const copyData = await copyResult.json(), copyBox = page.locator(`[data-production-mode=live][data-growth-pack="${copyData.packId}"]`).first();
    await copyBox.locator('[name=production-liveSchedule]').waitFor();
    if (await copyBox.locator('[name=production-liveSchedule]').inputValue() !== '' || await copyBox.locator('[name=production-liveReview]').inputValue() !== '' || await copyBox.locator('[name=production-liveAttendance]').inputValue() !== '')
        throw Error('duplicate live copied results or schedule');
    await copyBox.locator('[name=production-liveSchedule]').fill(weekDates[2] + 'T20:00');
    const saveCopied = page.waitForResponse(r => r.url().endsWith('/api/production-draft') && r.request().method() === 'POST');
    await copyBox.locator('[data-growth-action=production-save]').click();
    if (!(await saveCopied).ok())
        throw Error('copied live save failed');
    const copyState = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1'), copiedDraft = copyState.drops.find(p => p.id === copyData.packId).productionDrafts['小红书|0|live'], originalDraft = copyState.drops.find(p => p.id === 'p1').productionDrafts['小红书|0|live'];
    if (copiedDraft.fields.liveSchedule !== weekDates[2] + 'T20:00' || originalDraft.fields.liveReview !== originalBeforeCopy)
        throw Error('copied live was not independent');
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=schedule]').click();
    const originalLiveCard = checkedReview.locator('article').filter({ hasText: '已人工关联咨询 1 条 / 1 个联系人记录' }).first();
    await originalLiveCard.getByRole('button', { name: '查看 直播访客' }).click();
    await page.locator('#acq-lead-detail').getByText('请问厨房翻新怎样预约').waitFor();
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=schedule]').click();
    const copiedLiveCard = checkedReview.locator('article').filter({ hasText: '已人工关联咨询 0 条 / 0 个联系人记录' }).first();
    await copiedLiveCard.getByRole('button', { name: '登记直播咨询' }).click();
    const secondInquiry = page.locator('[data-acq-form=inquiry]');
    await secondInquiry.waitFor({ state: 'visible' });
    await secondInquiry.locator('[name=platform]').selectOption('小红书');
    await secondInquiry.locator('[name=accountId]').selectOption('live-account');
    if (await secondInquiry.locator('[name=liveSource]').inputValue() !== JSON.stringify([copyData.packId, '小红书', 0]))
        throw Error('copied live inquiry preselected wrong source');
    await secondInquiry.locator('[name=authorName]').fill('第二场访客');
    await secondInquiry.locator('[name=text]').fill('第二场怎么预约');
    await secondInquiry.locator('[name=evidence]').fill('第二场直播私信记录');
    await secondInquiry.getByRole('button', { name: '保存咨询，加入待回复' }).click();
    await page.waitForFunction(() => document.querySelector('#acq-inquiry') && !document.querySelector('#acq-inquiry').open);
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=schedule]').click();
    await checkedReview.getByRole('button', { name: '查看 第二场访客' }).waitFor();
    await checkedReview.getByRole('button', { name: '查看 直播访客' }).waitFor();
    const afterBoth = readWorkspace('66445039@qq.com').acquisition.leads;
    if (afterBoth.find(l => l.authorName === '直播访客').messages[0].liveSource.id !== JSON.stringify(['p1', '小红书', 0]) || afterBoth.find(l => l.authorName === '第二场访客').messages[0].liveSource.id !== JSON.stringify([copyData.packId, '小红书', 0]))
        throw Error('separate live source attribution failed');
    await page.locator('[data-content-tab=ideas]').click();
    await page.getByRole('button', { name: '查看 / 更新需求选题' }).click();
    const demandTopic = page.locator('#cm-content-home article.cm-row').filter({ hasText: '厨房预约前要准备哪些信息' });
    await demandTopic.waitFor();
    const topicDecision = page.waitForResponse(response => response.url().endsWith('/api/topic-decide') && response.request().method() === 'POST');
    await demandTopic.getByRole('button', { name: '采用并创作' }).click();
    if (!(await topicDecision).ok())
        throw Error('topic adoption failed');
    const topicDirection = readWorkspace('66445039@qq.com').customers[0].growthDirection;
    if (!topicDirection.includes('厨房预约前要准备哪些信息') || topicDirection.includes('直播访客') || topicDirection.includes('请问厨房翻新怎样预约'))
        throw Error('anonymous demand topic leaked source or was not applied');
    await page.locator('[data-nav=conversations]').click();
    await page.locator('#cm-conversations').getByRole('button', { name: /直播访客/ }).click();
    await page.locator('#cm-conversations summary').filter({ hasText: '提炼为内容选题' }).first().click();
    const revision = page.locator('[data-cm-form=demand-topic-revise]').first();
    await revision.locator('[name=topic]').fill('厨房规划需要先核对什么');
    await revision.locator('[name=confirmed]').check();
    const revisedResponse = page.waitForResponse(response => response.url().endsWith('/api/acquisition/demand-topic-revise'));
    await revision.getByRole('button', { name: '保存更正' }).click();
    if (!(await revisedResponse).ok())
        throw Error('topic correction failed');
    const updatedCustomer = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1');
    if (updatedCustomer.growthDirection.includes('厨房预约前要准备哪些信息') || updatedCustomer.demandTopics?.[0]?.title !== '厨房规划需要先核对什么')
        throw Error('topic correction failed: ' + JSON.stringify({ count: updatedCustomer.demandTopics?.length, action: (await revisedResponse).request().postDataJSON().action, titles: updatedCustomer.demandTopics?.map(t => t.title), direction: updatedCustomer.growthDirection }));
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=ideas]').click();
    await page.getByRole('button', { name: '查看 / 更新需求选题' }).click();
    const correctedTopic = page.locator('#cm-content-home article.cm-row').filter({ hasText: '厨房规划需要先核对什么' });
    await correctedTopic.waitFor();
    const newDecision = page.waitForResponse(response => response.url().endsWith('/api/topic-decide'));
    await correctedTopic.getByRole('button', { name: '采用并创作' }).click();
    if (!(await newDecision).ok())
        throw Error('corrected topic adoption failed');
    await page.locator('[data-nav=conversations]').click();
    await page.locator('#cm-conversations').getByRole('button', { name: /直播访客/ }).click();
    await page.locator('#cm-conversations summary').filter({ hasText: '提炼为内容选题' }).first().click();
    const removeTopic = page.locator('[data-cm-form=demand-topic-revise]').first();
    await removeTopic.locator('[name=confirmed]').check();
    const removeResponse = page.waitForResponse(response => response.url().endsWith('/api/acquisition/demand-topic-revise'));
    await removeTopic.getByRole('button', { name: '移除选题' }).click();
    if (!(await removeResponse).ok())
        throw Error('topic removal failed');
    const afterRemoval = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1');
    if (afterRemoval.demandTopics.length || afterRemoval.growthDirection.includes('厨房规划需要先核对什么'))
        throw Error('removed topic remained in future creation direction');
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.locator('summary').filter({ hasText: '新建脚本或直播场次' }).click();
    await page.locator('[data-cm-form=production-create] [name=title]').fill('新作品选题');
    await page.locator('[data-cm-form=production-create] [name=platform]').selectOption('抖音');
    await page.locator('[data-cm-form=production-create] button[type=submit]').click();
    await page.getByText('脚本、直播与封面制作', { exact: true }).first().waitFor({ state: 'visible' });
    await openProduction();
    await page.locator('[name=production-live]').first().selectOption('image');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('先量尺寸，再比较材料。');
    await page.route('**/api/production-generate', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: { shots: '确定需求\n测量尺寸\n比较材料', imagePlan: '第1页\n画面：厨房\n文字：确定需求' } }) }), { times: 1 });
    await productionPanel('script');
    await page.locator('[data-growth-action=production-generate]').first().click();
    await page.waitForFunction(() => document.querySelector('[name=production-imagePlan]')?.value.includes('画面：厨房'));
    await productionPanel('delivery');
    const [imageDocument] = await Promise.all([page.waitForEvent('download'), page.locator('[data-growth-action=production-download]').first().click()]);
    if (!fs.readFileSync(await imageDocument.path(), 'utf8').includes('画面：厨房'))
        throw Error('image visual plan missing from download');
    if (!await page.locator('[data-production-status]').first().textContent().then(t => t.includes('原始画面建议保存在单独字段')))
        throw Error('missing page plan notice');
    await productionPanel('script');
    await page.locator('[name=production-shots]').first().fill('第一页：确定需求\n第二页：测量尺寸\n第三页：比较材料');
    await productionPanel('cover');
    await page.locator('[name=production-cover]').first().fill('先看尺寸');
    await productionPanel('cover');
    await page.locator('[name=production-coverLayout]').first().fill('标题居中');
    await productionPanel('cover');
    await page.locator('[data-growth-action=image-pages]').first().click();
    if (await page.locator('[data-page-templates] img').count() !== 3)
        throw Error('image pages not rendered');
    const [slide] = await Promise.all([page.waitForEvent('download'), page.locator('[data-page-templates] a').nth(2).click()]);
    if (fs.readFileSync(await slide.path()).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw Error('invalid image page');
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.locator('#cm-content-home article.cm-row').filter({ hasText: '新作品选题' }).getByRole('button', { name: '查看与制作' }).click();
    await openProduction();
    if (await page.locator('[data-page-templates] img').count() !== 3)
        throw Error('image page previews lost during navigation');
    await productionPanel('script');
    await page.locator('[name=production-shots]').first().fill('第一页：先写需求\n第二页：测量尺寸\n第三页：比较材料');
    if (await page.locator('[data-page-templates] img').count() !== 0)
        throw Error('stale image previews were retained');
    await productionPanel('cover');
    await page.locator('[data-growth-action=image-pages]').first().click();
    await page.locator('[name=production-playPackId]').first().selectOption('douyin-image');
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-growth-action=production-save]')?.dataset.version === '1');
    await openProduction();
    await productionPanel('delivery');
    await page.locator('[data-production-record-play]').first().check();
    await page.locator('[data-growth-action=production-apply]').first().click();
    await page.waitForFunction(() => [...document.querySelectorAll('.line-text')].some(e => e.textContent.includes('先量尺寸，再比较材料。')));
    const appliedPack = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.title === '新作品选题');
    if (appliedPack?.appliedContentJobs?.['抖音|0']?.creatorPack?.attribution !== 'user-confirmed') throw Error('explicitly confirmed play pack was not recorded');
    await openProduction();
    await productionPanel('cover');
    await page.locator('[data-growth-action=assets-save]').first().click();
    await page.locator('[data-saved-production-assets]').first().waitFor({ timeout: 12000 });
    if (await page.locator('[data-saved-production-assets] img').count() !== 3)
        throw Error('saved image bundle missing pages');
    const partialPackId = await page.locator('[data-growth-action=assets-save]').first().evaluate(el => el.closest('[data-growth-pack]').dataset.growthPack), partialBefore = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.id === partialPackId).productionAssets['抖音|0'];
    const partialResponse = await context.request.post(origin + '/api/production-assets', { data: { customerId: 'c1', packId: partialPackId, platform: '抖音', index: 0, version: partialBefore.version, expectedBundleId: partialBefore.id, images: [{ name: 'page-01.png', data: 'data:image/png;base64,' + fs.readFileSync(await slide.path()).toString('base64') }] } });
    if (partialResponse.status() !== 400 || !(await partialResponse.json()).error.includes('图文页不完整'))
        throw Error('incomplete page set was not rejected');
    if (readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.id === partialPackId).productionAssets['抖音|0'].id !== partialBefore.id)
        throw Error('incomplete page save replaced existing bundle');
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.waitForFunction(() => document.querySelector('#cm-content-home')?.textContent.includes('内容与直播排期'));
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.locator('#cm-content-home article.cm-row').filter({ hasText: '新作品选题' }).getByRole('button', { name: '查看与制作' }).click();
    await openProduction();
    await productionPanel('cover');
    await page.locator('[data-saved-production-assets] img').first().waitFor();
    if (await page.locator('[data-saved-production-assets] img').count() !== 3)
        throw Error('saved images lost on reload');
    console.log('CHECKPOINT: script, live, topic and saved image setup passed');
    const oldPageText = await page.locator('[name=production-shots]').first().inputValue();
    await productionPanel('script');
    await page.locator('[name=production-shots]').first().fill(oldPageText + '\n增加一页');
    await productionPanel('cover');
    await page.locator('[data-growth-action=pages-reuse]').first().click();
    await page.getByText('逐页内容已变化，请重新制作图文页').first().waitFor();
    await productionPanel('script');
    await page.locator('[name=production-shots]').first().fill(oldPageText);
    // Adopting the saved draft also advances its version. Wait for this save,
    // not a hard-coded version which may already be visible before it starts.
    const imageVersionBeforeSave = Number(await page.locator('[data-growth-action=production-save]').first().getAttribute('data-version'));
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForFunction(version => Number(document.querySelector('[data-growth-action=production-save]')?.dataset.version) === version + 1, imageVersionBeforeSave);
    await openProduction();
    await productionPanel('cover');
    await page.locator('[data-growth-action=pages-reuse]').first().click();
    await page.getByText('已沿用原图文页，请逐页核对后保存到当前素材包。').first().waitFor().catch(async (error) => { console.error('PAGE REUSE STATE', await page.locator('[data-production-status]').allTextContents(), await page.locator('[name=production-live]').evaluateAll(items => items.map(x => ({ value: x.value, visible: !!x.getClientRects().length })))); throw error; });
    if (await page.locator('[data-page-templates] img').count() !== 3)
        throw Error('reused image pages missing previews');
    console.log('CHECKPOINT: saved image pages reused after the next draft version');
    const reusedPagesSaved = page.waitForResponse(r => r.url().endsWith('/api/production-assets') && r.request().method() === 'POST');
    await productionPanel('cover');
    await page.locator('[data-growth-action=assets-save]').first().click();
    if (!(await reusedPagesSaved).ok())
        throw Error('reused image pages save failed');
    await productionPanel('cover');
    await page.locator('[data-saved-production-assets] img').first().waitFor();
    if (await page.locator('[data-saved-production-assets] img').count() !== 3)
        throw Error('reused image pages missing from new bundle');
    await productionPanel('cover');
    await Promise.all([page.waitForEvent('download'), page.locator('[data-growth-action=cover-download]').first().click()]);
    await productionPanel('cover');
    await page.locator('[name=cover-template]').first().selectOption('paper');
    if (await page.locator('[data-ai-cover-preview]:visible').count())
        throw Error('old template cover remained after changing template');
    await page.locator('[data-cover-background]').first().setInputFiles({ name: '自己的图片.png', mimeType: 'image/png', buffer: imageBytes });
    await productionPanel('cover');
    await page.locator('[data-growth-action=cover-photo]').first().click();
    await page.getByText('图片封面已制作，请核对裁切和文字后保存素材包。').first().waitFor();
    await page.locator('[data-cover-background]').first().setInputFiles({ name: '替换.png', mimeType: 'image/png', buffer: imageBytes });
    if (await page.locator('[data-ai-cover-preview]:visible').count())
        throw Error('old image cover remained after background changed');
    await productionPanel('cover');
    await page.locator('[data-growth-action=cover-photo]').first().click();
    await page.getByText('图片封面已制作，请核对裁切和文字后保存素材包。').first().waitFor();
    const replaceRequest = page.waitForResponse(r => r.url().endsWith('/api/production-assets') && r.request().method() === 'POST');
    await productionPanel('cover');
    await page.locator('[data-growth-action=assets-save]').first().click();
    if (!(await replaceRequest).ok())
        throw Error('replacement cover save failed');
    await productionPanel('cover');
    await page.locator('[data-saved-production-assets] img').first().waitFor();
    if (await page.locator('[data-saved-production-assets] img').count() !== 4)
        throw Error('updating cover removed saved pages');
    const imageResponse = await page.request.get(origin + await page.locator('[data-saved-production-assets] img').first().getAttribute('src'));
    if (!imageResponse.ok())
        throw Error('saved preview unavailable');
    const savedCoverBytes = await imageResponse.body();
    if (savedCoverBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw Error('saved preview unavailable');
    const savedCoverPixel = await require('sharp')(savedCoverBytes).extract({ left: 5, top: 5, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    if (!savedCoverPixel.subarray(0, 3).equals(Buffer.from([135, 144, 144])))
        throw Error('personal photo was not used as cover background');
    const privateAsset = origin + await page.locator('[data-saved-production-assets] img').first().getAttribute('src');
    if ((await fetch(privateAsset)).status !== 401)
        throw Error('saved asset accessible without login');
    const [bundleDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '下载素材与脚本 ZIP' }).click()]);
    const zip = await require('jszip').loadAsync(fs.readFileSync(await bundleDownload.path()));
    const bundleText = await zip.file('脚本与制作说明.txt').async('string');
    if (!zip.file('page-03.png') || !bundleText.includes('先量尺寸') || !bundleText.includes('画面：厨房'))
        throw Error('bundle contents missing');
    const account = await page.request.post(origin + '/api/openfind/workbench/c1/accounts', { data: { id: 'test-douyin', name: '测试账号', platform: 'douyin' } });
    if (!account.ok())
        throw Error('fixture account failed ' + await account.text());
    await productionPanel('delivery');
    await page.locator('[data-growth-action=production-to-studio]').first().click();
    const studio = page.frameLocator('#cm-openfind iframe');
    await studio.locator('#draft-title').waitFor({ timeout: 20000 });
    if (await studio.locator('#draft-title').inputValue() !== '新作品选题' || !(await studio.locator('#draft-body').inputValue()).includes('先量尺寸'))
        throw Error('production text not handed off');
    const imageNotes = studio.locator('[aria-label="制作说明"]');
    await imageNotes.locator('summary').click();
    await imageNotes.getByText('画面：厨房', { exact: false }).waitFor();
    if ((await studio.locator('#draft-body').inputValue()).includes('画面：厨房'))
        throw Error('production notes entered publish body');
    await studio.locator('.editor-image-grid img').first().waitFor();
    if (await studio.locator('.editor-image-grid img').count() !== 4)
        throw Error('saved production images not handed off');
    await studio.locator('input[type=file][multiple]').setInputFiles({ name: 'personal.png', mimeType: 'image/png', buffer: fs.readFileSync(await slide.path()) });
    await studio.locator('.editor-image-grid img').nth(4).waitFor();
    await studio.locator('#draft-account').selectOption('test-douyin');
    await studio.getByRole('button', { name: '保存草稿', exact: true }).click();
    await studio.getByText('图文草稿已保存到内容工作室').waitFor();
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.locator('summary').filter({ hasText: '新建脚本或直播场次' }).click();
    await page.locator('[data-cm-form=production-create] [name=title]').fill('视频选题验收');
    await page.locator('[data-cm-form=production-create] [name=platform]').selectOption('抖音');
    await page.locator('[data-cm-form=production-create] button[type=submit]').click();
    await page.getByText('脚本、直播与封面制作', { exact: true }).first().waitFor();
    await openProduction();
    await page.locator('[name=production-live]').first().selectOption('video');
    await productionPanel('script');
    await page.locator('[name=production-script]').first().fill('视频开场，核对尺寸。');
    await productionPanel('cover');
    await page.locator('[name=production-cover]').first().fill('先核对尺寸');
    await productionPanel('cover');
    await page.locator('[name=production-coverLayout]').first().fill('主标题居中');
    await productionPanel('script');
    await page.locator('[name=production-hook]').first().fill('开场提出尺寸问题');
    await productionPanel('script');
    await page.locator('[name=production-shots]').first().fill('镜头一：查看厨房\n镜头二：测量尺寸\n镜头三：记录结果');
    await productionPanel('script');
    await page.locator('[name=production-cta]').first().fill('把尺寸整理给设计人员核对');
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-growth-action=production-save]')?.dataset.version === '1');
    await openProduction();
    const changedBasis = readWorkspace('66445039@qq.com');
    changedBasis.customers.find(c => c.id === 'c1').pitch = '更新后的厨房服务说明';
    writeWorkspace('66445039@qq.com', changedBasis);
    const rejectedApply = page.waitForResponse(r => r.url().endsWith('/api/production-apply'));
    await productionPanel('delivery');
    await page.locator('[data-growth-action=production-apply]').first().click();
    const rejectedApplyResponse = await rejectedApply;
    if (rejectedApplyResponse.ok() || !(await rejectedApplyResponse.json()).error.includes('业务资料已变化'))
        throw Error('stale production draft was accepted');
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('#cm-workbench h1').waitFor({ state: 'attached' });
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.locator('#cm-content-home article.cm-row').filter({ hasText: '视频选题验收' }).getByRole('button', { name: '查看与制作' }).click({ timeout: 12000 }).catch(async (error) => { throw Error(error.message + '; content home: ' + (await page.locator('#cm-content-home').innerText()).slice(0, 2000)); });
    await openProduction();
    await page.locator('[data-growth-action=production-save]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-growth-action=production-save]')?.dataset.version === '2');
    await openProduction();
    await productionPanel('delivery');
    await page.locator('[data-growth-action=production-apply]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-growth-action=production-save]')?.dataset.version === '3');
    await openProduction();
    await productionPanel('cover');
    const [videoCover] = await Promise.all([page.waitForEvent('download'), page.locator('[data-growth-action=cover-download]').first().click()]);
    const savedVideoCover = page.waitForResponse(r => r.url().endsWith('/api/production-assets') && r.request().method() === 'POST');
    await productionPanel('cover');
    await page.locator('[data-growth-action=assets-save]').first().click();
    if (!(await savedVideoCover).ok())
        throw Error('video cover asset save failed');
    await productionPanel('cover');
    await page.locator('[data-saved-production-assets]').first().waitFor();
    const videoPackId = await page.locator('[data-growth-action=production-to-studio]').first().evaluate(el => el.closest('[data-growth-pack]').dataset.growthPack);
    await productionPanel('delivery');
    await page.locator('[data-growth-action=production-to-studio]').first().click();
    await studio.locator('#draft-title').waitFor({ timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#cm-openfind iframe')?.contentDocument?.querySelector('#draft-title')?.value === '视频选题验收', { timeout: 20000 });
    if (await studio.locator('#draft-title').inputValue() !== '视频选题验收' || await studio.locator('#draft-kind').inputValue() !== 'video' || !(await studio.locator('#draft-body').inputValue()).includes('视频开场'))
        throw Error('video production handoff failed');
    await studio.getByRole('heading', { name: '视频封面与图片素材' }).waitFor();
    await studio.locator('.editor-image-grid img').first().waitFor();
    if (await studio.locator('.editor-image-grid img').count() !== 1)
        throw Error('video cover was not handed off');
    const videoNotes = studio.locator('[aria-label="制作说明"]');
    await videoNotes.locator('summary').click();
    await videoNotes.getByText('镜头一：查看厨房', { exact: false }).waitFor();
    await videoNotes.getByText('把尺寸整理给设计人员核对', { exact: false }).waitFor();
    const videoBytes = fs.readFileSync(root + '/scripts/fixtures/test-video.mp4');
    await studio.locator('input[accept="video/mp4,video/webm,video/quicktime"]').setInputFiles({ name: 'test-video.mp4', mimeType: 'video/mp4', buffer: videoBytes });
    await studio.locator('.video-uploader video').waitFor({ timeout: 20000 });
    await studio.locator('#draft-account').selectOption('test-douyin');
    await studio.locator('#draft-title').fill('最终视频标题');
    await studio.locator('#draft-body').fill('视频实际文案第一段\n\n第二段记录尺寸');
    await studio.locator('#draft-tags').fill('厨房 #翻新');
    await studio.getByRole('button', { name: '保存草稿', exact: true }).click();
    await studio.getByText('视频草稿已保存到内容工作室').waitFor();
    const [videoArchive] = await Promise.all([page.waitForEvent('download'), studio.getByTitle('保存并下载当前草稿包').click()]);
    const videoZip = await require('jszip').loadAsync(fs.readFileSync(await videoArchive.path()));
    if (!videoZip.file('video.mp4') || !(await videoZip.file('video.mp4').async('nodebuffer')).equals(videoBytes))
        throw Error('video missing or changed in archive');
    if (!videoZip.file('images/1.png'))
        throw Error('video cover missing from archive');
    const originalCoverPixels = await require('sharp')(fs.readFileSync(await videoCover.path())).ensureAlpha().raw().toBuffer(), archivedCoverPixels = await require('sharp')(await videoZip.file('images/1.png').async('nodebuffer')).ensureAlpha().raw().toBuffer();
    if (!originalCoverPixels.equals(archivedCoverPixels))
        throw Error('video cover pixels changed in archive');
    if (!videoZip.file('制作说明.txt') || !(await videoZip.file('制作说明.txt').async('string')).includes('镜头一：查看厨房'))
        throw Error('production notes missing from studio archive');
    await studio.getByRole('button', { name: '返回作品列表' }).click();
    const savedVideo = studio.locator('.draft-card').filter({ hasText: '最终视频标题' });
    await savedVideo.getByRole('button', { name: '继续编辑' }).click();
    await studio.locator('[aria-label="制作说明"] summary').click();
    await studio.locator('[aria-label="制作说明"]').getByText('镜头一：查看厨房', { exact: false }).waitFor();
    await studio.getByRole('button', { name: '送回 Harta 核对' }).click();
    await studio.getByText('已送回原作品，请核对并采用；尚未登记发布').waitFor();
    const staged = readWorkspace('66445039@qq.com').customers[0].drops.find(p => p.id === videoPackId);
    if (staged.edits?.['抖音|0|title']?.now === '最终视频标题')
        throw Error('studio return overwrote source before review');
    await studio.getByRole('button', { name: '返回原作品核对' }).click();
    await page.locator('[data-studio-return-review]').waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: '核对后采用工作室文案' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.line-text')].some(e => e.textContent.includes('最终视频标题')));
    const { packAsSent } = await import(root + '/lib/pack-edits.mjs');
    const returned = readWorkspace('66445039@qq.com').customers[0].drops.find(p => p.id === videoPackId), finalPost = packAsSent(returned).shells.抖音[0];
    if (finalPost.title !== '最终视频标题' || finalPost.body !== '视频实际文案第一段\n\n第二段记录尺寸\n\n#厨房 #翻新')
        throw Error('approved studio text differs from final copy');
    const acqPost = async (action, body) => { const r = await fetch(origin + '/api/acquisition/' + action, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }), result = await r.json(); if (!r.ok)
        throw Error(action + ': ' + result.error); return result.workspace; };
    let registered = await acqPost('account', { customerId: 'c1', platform: '抖音', name: '验收发布账号' });
    const pubAccount = registered.acquisition.accounts.find(a => a.name === '验收发布账号').id;
    const packEvidenceSpace = readWorkspace('66445039@qq.com');
    const evidencePack = packEvidenceSpace.customers.find(c => c.id === 'c1').drops.find(p => p.id === videoPackId);
    evidencePack.appliedContentJobs ||= {};
    evidencePack.appliedContentJobs['抖音|0'] = {job:'',contentSnapshot:finalPost,contentHash:createHash('sha256').update(JSON.stringify(finalPost)).digest('hex'),creatorPack:{ id: 'qa-pack', name: '验收问答打法', version: 2, instruction: '先回答问题', attribution:'user-confirmed' }};
    writeWorkspace('66445039@qq.com', packEvidenceSpace);
    registered = await acqPost('prepare-publication', { customerId: 'c1', packId: videoPackId, platform: '抖音', index: 0, accountId: pubAccount });
    const publication = registered.acquisition.publications.find(p => p.packId === videoPackId);
    if (publication.content.body !== finalPost.body || publication.content.title !== finalPost.title)
        throw Error('publication snapshot is not the approved studio copy');
    registered = await acqPost('publication', { publicationId: publication.id, url: 'https://www.douyin.com/video/12345', publishedAt: new Date().toISOString(), confirmed: true });
    registered = await acqPost('inquiry', { customerId: 'c1', platform: '抖音', accountId: pubAccount, publicationId: publication.id, authorId: 'video-viewer', authorName: '视频咨询者', text: '我想了解厨房翻新的报价', evidence: '测试评论原文', receivedAt: new Date().toISOString(), channel: '评论' });
    const lead = registered.acquisition.leads.find(l => l.authorId === 'video-viewer');
    if (!lead?.sourcePaths.includes('content') || lead.messages[0].publicationId !== publication.id)
        throw Error('inquiry not linked to publication');
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.waitForFunction(() => document.querySelector('#cm-content-home')?.textContent.includes('内容与直播排期'));
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.locator('#cm-content-home article.cm-row').filter({ hasText: '视频选题验收' }).getByRole('button', { name: '查看与制作' }).click();
    let outcomeBox = page.locator('[data-growth-pack]').filter({ has: page.locator('[data-outcome-form]') }).first();
    await outcomeBox.locator('summary').filter({ hasText: '更多选项' }).click();
    await outcomeBox.locator('summary').filter({ hasText: '记录发布效果' }).click();
    const outcomeForm = outcomeBox.locator('[data-outcome-form]');
    await outcomeForm.locator('[name=publicationId]').selectOption(publication.id);
    if (await outcomeForm.locator('[name=accountId]').inputValue() !== pubAccount)
        throw Error('publication account not selected');
    const metricDay = new Date().toISOString().slice(0, 10);
    await outcomeForm.locator('[name=start]').fill(metricDay);
    await outcomeForm.locator('[name=end]').fill(metricDay);
    await outcomeForm.locator('summary').filter({ hasText: '补充其他效果指标' }).click();
    await outcomeForm.locator('[name=views]').fill('42');
    await outcomeForm.locator('[name=qualifiedLeads]').fill('2');
    await outcomeForm.locator('[name=criteria]').fill('同一联系人去重');
    await outcomeForm.locator('[name=source]').fill('模拟平台后台记录');
    await outcomeForm.getByRole('button', { name: '保存记录' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('summary')].some(e => e.textContent.includes('记录发布效果') && e.textContent.includes('已有记录')));
    const measured = readWorkspace('66445039@qq.com').customers[0].drops.find(p => p.id === videoPackId).outcomes['抖音|0'][0];
    if (measured.publicationId !== publication.id || measured.accountId !== pubAccount || measured.content.body !== finalPost.body || measured.metrics.views !== 42)
        throw Error('outcome not tied to published snapshot');
    outcomeBox = page.locator('[data-growth-pack]').filter({ has: page.locator('[data-outcome-form]') }).first();
    await outcomeBox.locator('summary').filter({ hasText: '更多选项' }).click();
    await outcomeBox.locator('summary').filter({ hasText: '记录发布效果' }).click();
    await outcomeBox.locator('summary').filter({ hasText: '查看 1 次记录' }).click();
    await outcomeBox.getByText(/累计已登记咨询 1 条 \/ 1 个联系人记录/).waitFor();
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=review]').click();
    const reviewPanel = page.locator('#cm-content-home [aria-label="账号复盘"]');
    await reviewPanel.locator('summary').filter({ hasText: '登记自己已发布的作品' }).click();
    let ownForm = reviewPanel.locator('[data-cm-form=owned-publication]');
    await ownForm.locator('[name=accountId]').selectOption(pubAccount);
    await ownForm.locator('[name=title]').fill('历史作品验收');
    await ownForm.locator('[name=url]').fill('https://www.douyin.com/note/88888?share=original');
    await ownForm.locator('[name=publishedAt]').fill('2026-01-01T12:00');
    await ownForm.locator('[name=confirmed]').check();
    const ownSaved = page.waitForResponse(response => response.url().endsWith('/api/owned-publication'));
    await ownForm.getByRole('button', { name: '登记作品' }).click();
    if (!(await ownSaved).ok())
        throw Error('own publication save failed');
    await page.locator('#cm-content-home [aria-label="发布后回看评论"] summary').filter({ hasText: '历史作品验收' }).waitFor();
    const reviewPubId = readWorkspace('66445039@qq.com').acquisition.publications.find(p => p.content?.title === '历史作品验收').id;
    await page.locator('[data-nav=workbench]').click();
    await page.locator(`[data-cm=open-publication-review][data-id="${reviewPubId}"]`).first().click();
    const reviewSection = page.locator('#cm-content-home [aria-label="发布后回看评论"]');
    const pendingReview = reviewSection.locator('details').filter({ hasText: '历史作品验收' }).first();
    await pendingReview.getByText('待回看', { exact: false }).waitFor();
    if (!(await pendingReview.evaluate(el => el.open)))
        throw Error('workbench reminder did not open the publication');
    const commentForm = pendingReview.locator('[data-cm-form=publication-review]');
    const leadsBeforeReview = readWorkspace('66445039@qq.com').acquisition.leads.length;
    await commentForm.locator('[name=note]').fill('已打开原作品查看评论');
    await commentForm.locator('[name=confirmed]').check();
    await commentForm.getByRole('button', { name: '记录本次回看' }).click();
    await reviewSection.locator('details').filter({ hasText: '历史作品验收' }).getByText('已记录回看', { exact: false }).first().waitFor();
    const reviewedPublication = readWorkspace('66445039@qq.com').acquisition.publications.find(p => p.content?.title === '历史作品验收');
    if (reviewedPublication?.commentReview?.note !== '已打开原作品查看评论' || readWorkspace('66445039@qq.com').acquisition.leads.length !== leadsBeforeReview)
        throw Error('publication review not saved correctly');
    const reviewedPanel = reviewSection.locator('details').filter({ hasText: '历史作品验收' }).first();
    if (!(await reviewedPanel.evaluate(el => el.open)))
        await reviewedPanel.locator('summary').click();
    await reviewedPanel.getByRole('button', { name: '登记这篇作品收到的咨询' }).click();
    const linkedInquiry = page.locator('#acq-inquiry [data-acq-form=inquiry]');
    await linkedInquiry.waitFor();
    if (await linkedInquiry.locator('[name=publicationId]').inputValue() !== reviewPubId || await linkedInquiry.locator('[name=accountId]').inputValue() !== reviewedPublication.accountId || await linkedInquiry.locator('[name=platform]').inputValue() !== reviewedPublication.platform || await linkedInquiry.locator('[name=channel]').inputValue() !== '评论')
        throw Error('publication inquiry source not preselected');
    await linkedInquiry.locator('[name=authorName]').fill('作品回看咨询者');
    await linkedInquiry.locator('[name=text]').fill('请问厨房收纳怎么规划？');
    await linkedInquiry.locator('[name=evidence]').fill('在原作品评论区核对');
    const inquirySaved = page.waitForResponse(response => response.url().endsWith('/api/acquisition/inquiry'));
    await linkedInquiry.locator('button[type=submit]').click();
    if (!(await inquirySaved).ok())
        throw Error('publication inquiry failed');
    const linkedLead = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.authorName === '作品回看咨询者');
    if (!linkedLead?.sourcePaths.includes('content') || linkedLead.messages[0]?.publicationId !== reviewPubId)
        throw Error('publication inquiry attribution missing');
    await page.locator('[data-nav=conversations]').click();
    await page.getByRole('button', { name: /作品回看咨询者/ }).first().click();
    const inquirySource = page.locator('#cm-conversations [aria-label="线索核实与跟进"] .cm-inquiry-source').first();
    await inquirySource.getByText(/人工关联作品：/).waitFor();
    await inquirySource.getByRole('button', { name: '查看作品回看' }).click();
    const sourceReview = page.locator('#cm-content-home [data-cm-detail]').filter({ has: page.locator('[data-cm-form=publication-review]') }).filter({ has: page.locator(`[data-cm-form=publication-review][data-id="${reviewPubId}"]`) });
    await sourceReview.locator('summary').first().waitFor();
    if (!await sourceReview.evaluate(el => el.open))
        throw Error('source review was not opened');
    await page.locator('[data-nav=conversations]').click();
    await page.getByRole('button', { name: /作品回看咨询者/ }).first().click();
    const sourceDetails = page.locator('#cm-conversations [data-cm-detail]').filter({ hasText: '更正作品来源' }).first();
    await sourceDetails.locator('summary').click();
    let sourceForm = sourceDetails.locator('[data-cm-form=publication-source]');
    await sourceForm.locator('[name=publicationId]').selectOption('');
    await sourceForm.locator('[name=note]').fill('来源重新核对');
    await sourceForm.locator('[name=confirmed]').check();
    let sourceSaved = page.waitForResponse(response => response.url().endsWith('/api/acquisition/publication-source'));
    await sourceForm.getByRole('button', { name: '保存作品来源更正' }).click();
    if (!(await sourceSaved).ok())
        throw Error('publication unlink failed');
    await page.getByText('作品来源更正记录（1）').waitFor();
    let correctedPubLead = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.id === linkedLead.id);
    if (correctedPubLead.messages[0].publicationId || !correctedPubLead.sourcePaths.includes('unknown'))
        throw Error('publication source unlink not applied');
    await sourceDetails.locator('summary').click();
    sourceForm = sourceDetails.locator('[data-cm-form=publication-source]');
    await sourceForm.locator('[name=publicationId]').selectOption(reviewPubId);
    await sourceForm.locator('[name=note]').fill('已再次核对原作品');
    await sourceForm.locator('[name=confirmed]').check();
    sourceSaved = page.waitForResponse(response => response.url().endsWith('/api/acquisition/publication-source'));
    await sourceForm.getByRole('button', { name: '保存作品来源更正' }).click();
    if (!(await sourceSaved).ok())
        throw Error('publication relink failed');
    await page.getByText('作品来源更正记录（2）').waitFor();
    correctedPubLead = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.id === linkedLead.id);
    if (correctedPubLead.messages[0].publicationId !== reviewPubId || !correctedPubLead.sourcePaths.includes('content'))
        throw Error('publication source relink not applied');
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=review]').click();
    let ownCard = reviewPanel.locator('details[data-cm-detail]').filter({ has: page.locator('[data-cm-form=owned-outcome]') }).filter({ hasText: '历史作品验收' }).first();
    await ownCard.locator('summary').first().click();
    await ownCard.getByText('当前已登记咨询 1 条 / 1 个联系人记录', { exact: false }).waitFor();
    await ownCard.getByText('已人工关联评论 0 条 / 0 个联系人记录', { exact: false }).waitFor();
    await ownCard.locator('summary').filter({ hasText: '记录 / 更新效果' }).click();
    let ownStats = ownCard.locator('[data-cm-form=owned-outcome]');
    await ownStats.locator('[name=start]').fill(metricDay);
    await ownStats.locator('[name=end]').fill(metricDay);
    await ownStats.locator('[name=source]').fill('历史作品后台截图');
    await ownStats.locator('[name=metric-views]').fill('100');
    await ownStats.locator('[name=metric-completionRate]').fill('36.75');
    await ownStats.locator('[name=metric-qualifiedLeads]').fill('0');
    await ownStats.locator('[name=criteria]').fill('同一联系人去重');
    await ownStats.getByRole('button', { name: '保存效果记录' }).click();
    await reviewPanel.getByText(/历史作品验收：100 阅读.*36\.75% 平台完播率/).waitFor();
    if (readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').accountReviewOutcomes.find(r => r.publicationId === reviewPubId)?.metrics.completionRate !== 36.75)
        throw Error('owned publication completion rate was not saved');
    if (!(await ownCard.locator('details[data-cm-detail*=owned-metrics]').evaluate(el => el.open)))
        await ownCard.locator('summary').filter({ hasText: '记录 / 更新效果' }).click();
    ownStats = ownCard.locator('[data-cm-form=owned-outcome]');
    await ownStats.getByRole('button', { name: '沿用上次记录' }).click();
    if (await ownStats.locator('[name=metric-views]').inputValue() !== '100' || await ownStats.locator('[name=metric-completionRate]').inputValue() !== '36.75')
        throw Error('owned metrics carry-forward failed');
    await ownStats.locator('[name=metric-likes]').fill('8');
    const copiedOwned = page.waitForResponse(r => r.url().endsWith('/api/owned-publication-outcome'));
    await ownStats.getByRole('button', { name: '保存效果记录' }).click();
    if (!(await copiedOwned).ok())
        throw Error('carried owned metrics were not saved');
    const copiedMetrics = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').accountReviewOutcomes.find(r => r.publicationId === reviewPubId).metrics;
    if (copiedMetrics.views !== 100 || copiedMetrics.completionRate !== 36.75 || copiedMetrics.likes !== 8)
        throw Error('carried owned metrics lost existing values');
    await reviewPanel.getByText(/最终视频标题：42 阅读/).waitFor();
    const comparison = reviewPanel.locator('article').filter({ hasText: '历史作品验收：100' }).first();
    await comparison.getByText('0 有效客资（口径：同一联系人去重）', { exact: false }).waitFor();
    await comparison.getByText('2 有效客资（口径：同一联系人去重）', { exact: false }).waitFor();
    await comparison.getByText('打法：验收问答打法 v2', { exact: false }).waitFor();
    await comparison.getByText('打法：未记录打法', { exact: false }).waitFor();
    await comparison.locator('summary').filter({ hasText: '写下复盘假设' }).click();
    const memoryForm = comparison.locator('[data-cm-form=account-review-memory]');
    await memoryForm.locator('[name=text]').fill('下次对照厨房开头，记录投流与发布时间');
    const memorySaved = Promise.race([page.waitForResponse(r => r.url().endsWith('/api/account-review-memory')).then(async (r) => { if (!r.ok())
            throw Error('memory save rejected: ' + await r.text()); return true; }), memoryForm.locator('.cm-error').filter({ hasText: /对照数据已变化|保存失败|无法校验/ }).waitFor().then(async () => { throw Error('memory UI rejected: ' + await memoryForm.locator('.cm-error').textContent()); })]);
    await memoryForm.getByRole('button', { name: '采用为创作记忆' }).click();
    await memorySaved;
    await page.getByText('已采用为创作记忆，可查看依据或停用', { exact: true }).waitFor();
    const memoryHistory = reviewPanel.locator('[data-cm-detail$=account-review-memories]');
    if (!(await memoryHistory.evaluate(el => el.open)))
        await memoryHistory.locator('summary').first().click();
    await memoryHistory.getByText(/当前证据可用/).waitFor();
    const { profileBrief } = await import(root + '/js/creator-profile.js');
    if (!profileBrief(readWorkspace('66445039@qq.com').customers[0]).includes('下次对照厨房开头'))
        throw Error('account memory not available to creation');
    ownCard = reviewPanel.locator('details[data-cm-detail]').filter({ has: page.locator('[data-cm-form=owned-outcome]') }).filter({ hasText: '历史作品验收' }).first();
    await ownCard.locator('summary').filter({ hasText: '更正作品信息' }).click();
    let correct = ownCard.locator('[data-cm-form=owned-correct]');
    await correct.locator('[name=title]').fill('更正后的历史作品');
    await correct.locator('[name=confirmed]').check();
    await correct.locator('[name=url]').fill('https://www.douyin.com/video/99999');
    const wrongLinkResponse = page.waitForResponse(response => response.url().endsWith('/api/owned-publication-correct'));
    await correct.getByRole('button', { name: '保存更正' }).click();
    if ((await wrongLinkResponse).ok())
        throw Error('linked inquiry allowed another work URL');
    await correct.getByText('该作品已关联咨询或评论，不能更换为另一篇作品的链接；请先核对并更正来源').waitFor();
    await correct.locator('[name=url]').fill('https://www.douyin.com/note/88888?share=updated');
    await correct.getByRole('button', { name: '保存更正' }).click();
    await reviewPanel.getByText(/最新记录：.*阅读 \/ 播放 100.*基于更正前的作品信息/).waitFor();
    ownCard = reviewPanel.locator('details[data-cm-detail]').filter({ has: page.locator('[data-cm-form=owned-outcome]') }).filter({ hasText: '更正后的历史作品' }).first();
    await ownCard.locator('summary').filter({ hasText: '记录 / 更新效果' }).click();
    ownStats = ownCard.locator('[data-cm-form=owned-outcome]');
    await ownStats.locator('[name=start]').fill(metricDay);
    await ownStats.locator('[name=end]').fill(metricDay);
    await ownStats.locator('[name=source]').fill('更新后的后台截图');
    await ownStats.locator('[name=metric-views]').fill('75');
    await ownStats.getByRole('button', { name: '保存效果记录' }).click();
    await reviewPanel.getByText(/更正后的历史作品：75 阅读/).waitFor();
    await reviewPanel.getByText(/对照已变化，暂停用于创作/).waitFor();
    if (profileBrief(readWorkspace('66445039@qq.com').customers[0]).includes('下次对照厨房开头'))
        throw Error('stale account memory still used');
    await reviewPanel.locator('[data-cm-form=retire-account-memory]').getByRole('button', { name: '停用记忆' }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('#cm-content-home [aria-label="账号复盘"] strong')].some(e => e.textContent.includes('下次对照厨房开头')));
    const ownHistory = readWorkspace('66445039@qq.com').customers[0].accountReviewOutcomes;
    if (ownHistory.length !== 3 || ownHistory[0].content.title !== '更正后的历史作品' || ownHistory[1].content.title !== '历史作品验收' || ownHistory[2].content.title !== '历史作品验收')
        throw Error('own work snapshot history lost');
    const [reviewExport] = await Promise.all([page.waitForEvent('download'), reviewPanel.getByRole('button', { name: '导出自有作品与效果记录' }).click()]);
    const exported = JSON.parse(fs.readFileSync(await reviewExport.path(), 'utf8'));
    if (exported.outcomes.length !== 3 || !exported.publications.some(p => p.content.title === '更正后的历史作品'))
        throw Error('own review export incomplete');
    await page.locator('[data-content-tab=schedule]').click();
    await page.locator('summary').filter({ hasText: '待排期内容' }).click();
    let postCard = page.locator('.cm-calendar-card').filter({ hasText: '新作品选题' });
    await postCard.locator('summary').click();
    await postCard.locator('[name=time]').fill(weekDates[3]);
    await postCard.getByRole('button', { name: '保存排期' }).click();
    await page.waitForFunction(date => [...document.querySelectorAll('.cm-calendar-day')].some(e => e.querySelector('h3')?.textContent.includes(date.slice(5)) && e.textContent.includes('新作品选题')), weekDates[3]);
    await page.getByRole('button', { name: '下一周', exact: true }).click();
    await page.getByRole('button', { name: '本周', exact: true }).click();
    await page.locator('[aria-label="本周平台与形式"] p').filter({ hasText: /抖音.*图文 1/ }).waitFor();
    postCard = page.locator('.cm-calendar-day .cm-calendar-card').filter({ hasText: '新作品选题' });
    await postCard.locator('summary').click();
    await postCard.locator('[name=time]').fill('');
    await postCard.getByRole('button', { name: '保存排期' }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.cm-calendar-day')].some(e => e.textContent.includes('新作品选题')));
    await page.getByRole('button', { name: '创作新内容' }).click();
    const creation = page.locator('#cm-content-scope [data-cm-form="generate"]');
    await creation.waitFor({ state: 'visible' });
    await creation.locator('[name=creationEntry]').selectOption('feed');
    await creation.locator('[name=distributionIntent]').selectOption('paid');
    await creation.locator('[name=creationPlatform]').selectOption('抖音');
    await creation.locator('[name=creationFormat]').selectOption('image');
    const workspaceResponse = await (await fetch(origin + '/api/workspace', { headers: { cookie } })).json();
    let requestPayload;
    await page.route('**/api/today', async (route) => { requestPayload = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspaceResponse) }); });
    await creation.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-cm-form=generate]')?.dataset.busy !== 'true');
    if (requestPayload?.creationEntry !== 'feed' || requestPayload?.distributionIntent !== 'paid' || requestPayload?.creationPlatform !== '抖音' || requestPayload?.creationFormat !== 'image')
        throw Error('creation preferences missing from request');
    const xhsAccounts = await acqPost('account', { customerId: 'c1', platform: '小红书', name: '自有小红书账号' }), xhsAccount = xhsAccounts.acquisition.accounts.find(a => a.name === '自有小红书账号').id;
    const ownPubResponse = await fetch(origin + '/api/owned-publication', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ customerId: 'c1', accountId: xhsAccount, title: '自有作品来源', url: 'https://example.com/work', publishedAt: '2026-01-01T12:00:00Z', confirmed: true }) });
    if (!ownPubResponse.ok)
        throw Error('own publication fixture failed ' + await ownPubResponse.text());
    const xhsPub = (await ownPubResponse.json()).acquisition.publications.find(p => p.content.title === '自有作品来源');
    const incoming = await fetch(origin + '/api/acquisition/import', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ customerId: 'c1', workId: 'w1', source: '测试导入的真实原文', rows: [{ platform: '小红书', text: '最近想找厨房翻新，杭州怎么报价？', url: 'https://example.com/work', authorName: '测试咨询者', authorId: 'test-person', recordId: 'test-comment', publishedAt: new Date(Date.now() - 120000).toISOString() }] }) });
    if (!incoming.ok)
        throw Error('import failed ' + await incoming.text());
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.waitForFunction(() => document.querySelector('#cm-content-home')?.textContent.includes('内容与直播排期'));
    await page.locator('[data-nav="prospecting"]').click();
    await page.locator('#cm-openfind summary').filter({ hasText: '更多操作' }).click();
    await page.getByRole('button', { name: '历史资料与目标账号' }).click();
    await page.locator('[data-cm=discovery-tab][data-id=needs]').click();
    const signal = page.locator('.cm-comment').filter({ hasText: '最近想找厨房翻新' }).first();
    await signal.waitFor();
    await signal.locator('summary').filter({ hasText: '提炼为内容选题' }).click();
    const commentTopic = signal.locator('[data-cm-form=demand-topic]');
    await commentTopic.locator('[name=topic]').fill('厨房改造之前如何准备');
    await commentTopic.locator('[name=confirmed]').check();
    const topicResponse = page.waitForResponse(r => r.url().endsWith('/api/acquisition/demand-topic'));
    await commentTopic.getByRole('button', { name: '保存到需求选题' }).click();
    if (!(await topicResponse).ok())
        throw Error('comment topic save failed');
    const commentTopicSpace = readWorkspace('66445039@qq.com');
    if (commentTopicSpace.acquisition.leads.some(l => l.authorId === 'test-person') || !commentTopicSpace.customers[0].demandTopics.some(t => t.kind === 'comment' && t.title === '厨房改造之前如何准备'))
        throw Error('comment topic incorrectly created a lead or was lost');
    const topicPoolResponse = await page.evaluate(async () => { const r = await fetch('/api/topic-pool', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerId: 'c1' }) }); return r.json(); });
    if (!topicPoolResponse.pool?.topics.some(t => t.source === '评论灵感' && t.angle === '厨房改造之前如何准备'))
        throw Error('comment idea did not reach topic pool');
    await signal.locator('summary').filter({ hasText: '核实或排除' }).click();
    await signal.locator('[data-cm-form=review] [name=note]').fill('已核对原文，地点和实际需求仍需沟通');
    await signal.locator('[data-cm-form=review] [name=publicationId]').selectOption(xhsPub.id);
    await signal.locator('[data-cm-form=review] button[type=submit]').click();
    await signal.getByText(/已人工关联发布：自有作品来源/).waitFor();
    let attributed = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.authorId === 'test-person');
    if (!attributed?.sourcePaths.includes('content') || attributed.sourcePaths.includes('active') || attributed.messages.length)
        throw Error('review attribution misclassified or invented message');
    await signal.locator('summary').filter({ hasText: '撤销内容来源关联' }).click();
    let attributionForm = signal.locator('[data-cm-form=signal-publication]');
    await attributionForm.locator('[name=note]').fill('需重新核对来源');
    await attributionForm.locator('[name=confirmed]').check();
    await attributionForm.getByRole('button', { name: '撤销关联' }).click();
    await signal.locator('summary').filter({ hasText: '关联自己的已发布作品' }).waitFor();
    attributed = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.authorId === 'test-person');
    if (attributed.sourcePaths.includes('content'))
        throw Error('unlinked comment still counted as content');
    await signal.locator('summary').filter({ hasText: '关联自己的已发布作品' }).click();
    attributionForm = signal.locator('[data-cm-form=signal-publication]');
    await attributionForm.locator('[name=publicationId]').selectOption(xhsPub.id);
    await attributionForm.locator('[name=note]').fill('重新核对评论和发布链接');
    await attributionForm.locator('[name=confirmed]').check();
    await attributionForm.getByRole('button', { name: '关联发布记录' }).click();
    await signal.getByText(/已人工关联发布：自有作品来源/).waitFor();
    attributed = readWorkspace('66445039@qq.com').acquisition.leads.find(l => l.authorId === 'test-person');
    if (!attributed.sourcePaths.includes('content') || attributed.messages.length)
        throw Error('relink did not preserve evidence');
    await page.locator('[data-nav="conversations"]').click();
    await page.getByRole('button', { name: /测试咨询者/ }).first().click();
    await page.getByText(/已人工关联作品：自有作品来源/).first().waitFor();
    await page.locator('[data-nav="content-home"]').click();
    await page.locator('[data-content-tab=review]').click();
    const ownSource = page.locator('#cm-content-home [aria-label="账号复盘"] details[data-cm-detail]').filter({ hasText: '自有作品来源' }).first();
    await ownSource.locator('summary').first().click();
    await ownSource.getByText(/已人工关联评论 1 条 \/ 1 个联系人记录/).waitFor();
    const seeded = readWorkspace('66445039@qq.com'), searchTime = new Date().toISOString();
    seeded.acquisition.tasks.push({ id: 'search-fixture', customerId: 'c1', sourceType: 'search_summary', source: '公开搜索摘要', status: 'partial', createdAt: searchTime, finishedAt: searchTime, snapshot: { name: '测试业务' }, platforms: ['小红书'], results: [{ platform: '小红书', provider: 'Brave', status: 'partial', coverage: { read: 0, added: 0, duplicate: 0 }, warning: '4 个搜索引擎无响应，覆盖不完整；零结果不代表没有需求。' }], runs: [] });
    seeded.acquisition.signals.push({ id: 'summary-fixture', customerId: 'c1', taskId: 'search-fixture', sourceType: 'search_summary', platform: '小红书', text: '商家提供厨房翻新服务', url: 'https://www.xiaohongshu.com/explore/example', authorName: '', authorId: '', recordId: '', collectedAt: searchTime, status: 'pending', analysis: { priority: '可能相关', reason: '摘要待核实', method: '规则辅助' } });
    writeWorkspace('66445039@qq.com', seeded);
    await page.reload();
    await page.locator('#cm-workbench h1').waitFor();
    await page.waitForFunction(() => document.querySelector('#cm-content-home')?.textContent.includes('内容与直播排期'));
    await page.locator('[data-nav=prospecting]').click();
    await page.locator('#cm-openfind summary').filter({ hasText: '更多操作' }).click();
    await page.getByRole('button', { name: '历史资料与目标账号' }).click();
    await page.locator('[data-cm=search]:visible').first().click();
    await page.locator('[data-persist=tasks] > summary').click();
    await page.getByText(/4 个搜索引擎无响应，覆盖不完整/).first().waitFor();
    await page.getByText(/小红书 · Brave/).first().waitFor();
    const searchSignal = page.locator('.acq-signal').filter({ hasText: '商家提供厨房翻新服务' });
    await searchSignal.waitFor();
    await searchSignal.locator('summary').filter({ hasText: '核实或排除' }).click();
    const searchReview = searchSignal.locator('[data-acq-form=review]');
    await searchReview.locator('[name=note]').fill('已打开来源并核对');
    await searchReview.getByRole('button', { name: '确认值得跟进' }).click();
    await searchReview.locator('.acq-error').getByText(/搜索摘要不能直接作为线索/).waitFor();
    await searchReview.locator('[name=sourceQuote]').fill('请问厨房翻新怎么报价？');
    await searchReview.locator('[name=sourceAuthorName]').fill('回源访客');
    await searchReview.locator('[name=sourceAuthorId]').fill('verified-person');
    await searchReview.locator('[name=sourceVerified]').check();
    const verifiedResponse = page.waitForResponse(response => response.url().endsWith('/api/acquisition/review') && response.request().method() === 'POST');
    await searchReview.getByRole('button', { name: '确认值得跟进' }).click();
    const verificationResult = await verifiedResponse;
    if (!verificationResult.ok())
        throw Error('source verification failed ' + verificationResult.status() + ': ' + await verificationResult.text());
    const verifiedSearch = readWorkspace('66445039@qq.com').acquisition.signals.find(x => x.id === 'summary-fixture');
    if (verifiedSearch.searchVerification?.summary !== '商家提供厨房翻新服务' || verifiedSearch.authorId !== 'verified-person' || !verifiedSearch.leadId)
        throw Error('search summary was not verified and preserved');
    await page.locator('[data-nav=conversations]').click();
    await page.getByRole('button', { name: /回源访客/ }).first().click();
    await page.locator('#cm-conversations [aria-label="线索核实与跟进"] p').filter({ hasText: '请问厨房翻新怎么报价？' }).waitFor();
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=library]').click();
    await page.locator('#cm-content-home article.cm-row').filter({ hasText: '新作品选题' }).getByRole('button', { name: '查看与制作' }).click();
    await page.locator('[data-workspace-view=research]').click();
    const goalSettings = page.locator('#growth-settings');
    await goalSettings.locator('[name=goal]').selectOption('reach_leads');
    const goalSaved = page.waitForResponse(response => response.url().endsWith('/api/growth-goal'));
    await goalSettings.locator('[data-growth-action=goal]').click();
    if (!(await goalSaved).ok())
        throw Error('combined goal did not save');
    if (readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').growthGoal !== 'reach_leads')
        throw Error('combined goal missing in workspace');
    await page.locator('[data-workspace-view=content]').click();
    const combinedPack = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.title === '新作品选题');
    const outcome = page.locator(`[data-growth-pack="${combinedPack.id}"] [data-outcome-form]`).first();
    await outcome.locator('input[name=views]').waitFor({ state: 'attached' });
    if (await outcome.locator('.growth-fields').first().locator('[name=qualifiedLeads]').count() !== 1 || await outcome.locator('.growth-fields').first().locator('[name=views]').count() !== 1)
        throw Error('combined goal does not show both primary metrics');
    const dualOutcomeBox = page.locator(`[data-growth-pack="${combinedPack.id}"]`).filter({ has: page.locator('[data-outcome-form]') }).first();
    await dualOutcomeBox.locator('summary').filter({ hasText: '更多选项' }).click();
    await dualOutcomeBox.locator('summary').filter({ hasText: '记录发布效果' }).click();
    const dualToday = new Date().toISOString().slice(0, 10);
    await outcome.locator('[name=start]').fill(dualToday);
    await outcome.locator('[name=end]').fill(dualToday);
    await outcome.locator('[name=views]').fill('1000');
    await outcome.locator('summary').filter({ hasText: '补充其他效果指标' }).click();
    await outcome.locator('[name=completionRate]').fill('42.5');
    await outcome.locator('[name=qualifiedLeads]').fill('3');
    await outcome.locator('[name=source]').fill('测试平台后台');
    await outcome.locator('[name=criteria]').fill('同一联系人去重');
    await outcome.locator('[name=baseline]').fill('2');
    await outcome.locator('[name=baselineNote]').fill('相同平台和周期');
    await outcome.locator('[name=baselineViews]').fill('400');
    await outcome.locator('[name=baselineViewsNote]').fill('相同平台和周期的播放');
    const dualOutcomeResponse = page.waitForResponse(response => response.url().endsWith('/api/growth-outcomes'));
    await outcome.getByRole('button', { name: '保存记录' }).click();
    if (!(await dualOutcomeResponse).ok())
        throw Error('dual outcome save failed');
    const dualResult = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.id === combinedPack.id).outcomes['抖音|0'][0];
    if (dualResult.goal !== 'reach_leads' || dualResult.metrics.views !== 1000 || dualResult.metrics.completionRate !== 42.5 || dualResult.metrics.qualifiedLeads !== 3 || dualResult.baselineViews !== 400 || dualResult.baselineViewsNote !== '相同平台和周期的播放')
        throw Error('dual outcome lost a metric');
    await dualOutcomeBox.locator('summary').filter({ hasText: '更多选项' }).click();
    await dualOutcomeBox.locator('summary').filter({ hasText: '记录发布效果' }).click();
    await outcome.getByRole('button', { name: '沿用上次记录' }).click();
    if (await outcome.locator('[name=views]').inputValue() !== '1000' || await outcome.locator('[name=completionRate]').inputValue() !== '42.5')
        throw Error('generated post metrics carry-forward failed');
    await page.getByText('阅读 / 播放相对同口径基线：2.50 倍', { exact: false }).first().waitFor();
    await page.getByText('有效客资相对同口径基线：1.50 倍', { exact: false }).first().waitFor();
    await page.locator('.rail-more > summary').click();
    await page.locator('[data-nav=crew]').click();
    await page.locator('#crew-members').getByText('66445039@qq.com').waitFor();
    await page.locator('#crew-members').getByText('待回复联系人', { exact: false }).waitFor();
    await page.locator('#crew-members').getByText('待回看作品', { exact: false }).waitFor();
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=review]').click();
    const csvPublication = readWorkspace('66445039@qq.com').acquisition.publications.find(p => p.id === reviewPubId), csvGenerated = readWorkspace('66445039@qq.com').acquisition.publications.find(p => p.id === publication.id);
    const csvSection = page.locator('#cm-content-home [aria-label="账号复盘"]'), csvDetails = csvSection.locator('details[data-cm-detail$=owned-csv]');
    await csvDetails.locator('summary').first().click();
    let csvForm = csvDetails.locator('[data-cm-form=owned-csv-preview]');
    await csvForm.locator('[name=start]').fill(metricDay);
    await csvForm.locator('[name=end]').fill(metricDay);
    await csvForm.locator('[name=source]').fill('测试后台导出');
    await csvForm.locator('[name=csv]').fill(`平台,作品链接,播放量,完播率\n${csvPublication.platform},${csvPublication.url}&from=csv,245,17.5%\n抖音,https://example.com/missing,1,20%`);
    await csvForm.getByRole('button', { name: '预览匹配' }).click();
    let csvPreview = page.locator('[aria-label="CSV 导入预览"]');
    await csvPreview.getByText(/没有匹配的已登记发布作品/).waitFor();
    if (await csvPreview.getByRole('button', { name: '确认导入全部记录' }).count())
        throw Error('invalid CSV allowed import');
    await csvDetails.locator('summary').first().click();
    csvForm = csvDetails.locator('[data-cm-form=owned-csv-preview]');
    await csvForm.locator('[name=start]').fill(metricDay);
    await csvForm.locator('[name=end]').fill(metricDay);
    await csvForm.locator('[name=source]').fill('测试后台导出');
    await csvForm.locator('[name=csv]').fill(`平台,作品链接,播放量,完播率\n${csvPublication.platform},${csvPublication.url}&from=csv,245,17.5%\n${csvGenerated.platform},${csvGenerated.url},330,42%`);
    await csvForm.getByRole('button', { name: '预览匹配' }).click();
    csvPreview = page.locator('[aria-label="CSV 导入预览"]');
    await csvPreview.getByText(/平台完播率（%）：17.5/, { exact: false }).waitFor();
    await csvPreview.locator('[name=confirmed]').check();
    const csvSaved = page.waitForResponse(r => r.url().endsWith('/api/owned-outcomes-import'));
    await csvPreview.getByRole('button', { name: '确认导入全部记录' }).click();
    if (!(await csvSaved).ok())
        throw Error('CSV import failed');
    const csvRecord = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').accountReviewOutcomes.find(r => r.publicationId === reviewPubId);
    if (csvRecord.metrics.views !== 245 || csvRecord.metrics.completionRate !== 17.5 || csvRecord.source !== '测试后台导出')
        throw Error('CSV outcome snapshot incorrect');
    const updatedOwnCard = csvSection.locator('details[data-cm-detail]').filter({ has: page.locator('[data-cm-form=owned-outcome]') }).filter({ hasText: '更正后的历史作品' }).first();
    if (!(await updatedOwnCard.evaluate(el => el.open)))
        await updatedOwnCard.locator('summary').first().click();
    await updatedOwnCard.getByText('平台完播率 17.5%', { exact: false }).waitFor();
    await csvSection.getByText('低于 20% 是经验提示', { exact: false }).waitFor();
    const generatedCsv = readWorkspace('66445039@qq.com').customers.find(c => c.id === 'c1').drops.find(p => p.id === videoPackId).outcomes['抖音|0'].find(r => r.publicationId === csvGenerated.id);
    if (generatedCsv?.metrics.views !== 330 || generatedCsv.metrics.completionRate !== 42 || generatedCsv.revision !== csvGenerated.revision)
        throw Error('generated publication CSV snapshot incorrect');
    await csvDetails.locator('summary').first().click();
    csvForm = csvDetails.locator('[data-cm-form=owned-csv-preview]');
    await csvForm.locator('[name=start]').fill(metricDay);
    await csvForm.locator('[name=end]').fill(metricDay);
    await csvForm.locator('[name=source]').fill('独立完播表');
    await csvForm.locator('[name=carryExisting]').check();
    await csvForm.locator('[name=criteria]').fill('按有效联系人去重');
    await csvForm.locator('[name=csv]').fill(`平台,作品链接,完播率,咨询次数,有效线索\n${csvPublication.platform},${csvPublication.url}&from=csv,40%,4,2\n${csvGenerated.platform},${csvGenerated.url},45%,5,3`);
    await csvForm.getByRole('button', { name: '预览匹配' }).click();
    csvPreview = page.locator('[aria-label="CSV 导入预览"]');
    await csvPreview.getByText(/沿用：阅读 \/ 播放：245（来源：测试后台导出）/).waitFor();
    await csvPreview.getByText(/沿用：阅读 \/ 播放：330（来源：测试后台导出）/).waitFor();
    await csvPreview.locator('[name=confirmed]').check();
    const carryCsvSaved = page.waitForResponse(r => r.url().endsWith('/api/owned-outcomes-import'));
    await csvPreview.getByRole('button', { name: '确认导入全部记录' }).click();
    if (!(await carryCsvSaved).ok())
        throw Error('CSV partial merge failed');
    const mergedState = readWorkspace('66445039@qq.com'), mergedExternal = mergedState.customers[0].accountReviewOutcomes.find(r => r.publicationId === reviewPubId), mergedGenerated = mergedState.customers[0].drops.find(p => p.id === videoPackId).outcomes['抖音|0'].find(r => r.publicationId === csvGenerated.id);
    if (mergedExternal.metrics.views !== 245 || mergedExternal.metrics.completionRate !== 40 || mergedExternal.metrics.inquiries !== 4 || mergedExternal.metrics.qualifiedLeads !== 2 || mergedExternal.criteria !== '按有效联系人去重' || mergedExternal.metricSources.views !== '测试后台导出' || mergedExternal.metricSources.completionRate !== '独立完播表' || mergedGenerated.metrics.views !== 330 || mergedGenerated.metrics.completionRate !== 45 || mergedGenerated.metrics.qualifiedLeads !== 3 || mergedGenerated.criteria !== '按有效联系人去重')
        throw Error('CSV partial merge lost values or sources');
    console.log('CHECKPOINT: publication and account review CSV flows passed');
    const librarySpace = readWorkspace('66445039@qq.com');
    librarySpace.customers.find(c => c.id === 'c1').drops = Array.from({ length: 10 }, (_, i) => ({ id: 'library-' + i, title: '测试内容批次' + i, tier: '今日', origin: { mode: 'legacy', goal: 'reach' }, copies: { A: ['批次正文' + i] }, shells: { '小红书': [{ title: '批次标题' + i, body: '批次正文' + i, cover: '封面' + i }] } }));
    writeWorkspace('66445039@qq.com', librarySpace);
    await page.goto(origin + '/');
    await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav=content-home]').click();
    await page.locator('[data-content-tab=library]').click();
    const library = page.locator('#cm-content-home section').filter({ has: page.getByRole('heading', { name: '内容库', exact: true }) });
    await library.getByText('共 10 个批次 · 第 1 / 2 页').waitFor({ timeout: 12000 }).catch(async (error) => { const current = readWorkspace('66445039@qq.com'); console.error('分页诊断', JSON.stringify({ counts: current.customers.map(c => ({ id: c.id, drops: c.drops?.length })), visible: (await page.locator('#cm-content-home').innerText()).slice(0, 1200) })); throw error; });
    await library.getByRole('button', { name: '下一页' }).click();
    await library.getByText('共 10 个批次 · 第 2 / 2 页').waitFor();
    const libraryOpen = page.waitForResponse(r => r.url().endsWith('/api/using') && r.request().method() === 'POST');
    await library.locator('article').filter({ hasText: '测试内容批次9' }).getByRole('button', { name: '查看与制作' }).click();
    const libraryOpened = await libraryOpen;
    if (!libraryOpened.ok())
        throw Error('library open failed ' + libraryOpened.status() + ': ' + await libraryOpened.text());
    const laterProduction = page.locator('[data-growth-pack=library-9][data-growth-platform=小红书]');
    await laterProduction.getByText('脚本、直播与封面制作', { exact: true }).first().waitFor();
    console.log('PASS: personal photo cover persisted and handed off, Douyin image-note URL matching, dual-goal CSV metrics and partial merge with per-metric sources and mixed publication atomic import, outcome carry-forward, platform completion rate recorded for owned and generated posts, content library pagination and production handoff, studio handoff, reviewed return and own published work review and evidence-bound creator memory, publication-to-inquiry and outcome attribution, personal image and video upload, video archive, complete, persistent and reusable image bundle and script export, independent live and video drafts and persistent and reusable live cover including unsaved switches and in-flight saves, weekly post and live schedule, unscheduled review, manually recorded inquiries and live-to-lead attribution, correction history and anonymized inquiry-to-topic handoff, correction and removal, pasted sample to creation, script production with current draft, missing-shot repair, stale-result rejection and fact-review invalidation, separated image text and visual plans, three real image templates, mocked AI cover, platform and format selection, partial search outage shown, combined traffic and lead goal and saved independent outcomes, search summary verified against source and preserved, imported comment verified, attributed, unlinked and relinked to owned publication');
}
catch (error) {
    console.error('Production E2E failed:', error.message, JSON.stringify(failedRequests));
    throw error;
}
finally {
    if (context)
        await context.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => { });
    if (browser)
        await bounded(browser.close(), 'browser shutdown').catch(e => console.error(e.message));
    if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill();
        const timer = setTimeout(() => proc.kill('SIGKILL'), 5000);
        await exited.catch(() => { });
        clearTimeout(timer);
    }
    process.chdir(root);
    fs.rmSync(dir, { recursive: true, force: true });
}
