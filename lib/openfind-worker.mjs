// Private child process: one SQLite store and Chrome profile set per Harta business.
import express from 'express';
import crypto from 'node:crypto';
process.env.OPENFIND_EMBEDDED = '1';
process.env.OPENFIND_DEMO = '0';
process.env.NODE_ENV = 'production';
const { app } = await import('../vendor/openfind/server/index.ts');
const { all, get, put, configSet, db } = await import('../vendor/openfind/server/store.ts');
const browser = await import('../vendor/openfind/server/platforms/browser.ts');
const { protectionStatus } = await import('../vendor/openfind/server/protection.ts');
configSet('mode', 'live'); configSet('connectionType', 'browser');
const secret = crypto.randomBytes(32).toString('hex');
const privateApp = express();
privateApp.use((req, res, next) => req.get('authorization') === `Bearer ${secret}` ? next() : res.sendStatus(403));
privateApp.use(app);
const server = privateApp.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
let closing = false;
async function close() {
  if (closing) return; closing = true;
  const timeout = setTimeout(() => process.exit(0), 3000); timeout.unref();
  await browser.closeBrowsers().catch(() => {});
  server.close(); db.close(); process.exit(0);
}
process.on('SIGTERM', close); process.on('SIGINT', close); process.on('disconnect', close);
function platform(value) { if (!['douyin', 'xiaohongshu'].includes(value)) throw new Error('请选择抖音或小红书'); return value; }
function key(value) { if (typeof value !== 'string' || !/^[\w:.-]{1,200}$/.test(value)) throw new Error('任务或作品标识无效'); return encodeURIComponent(value); }
function state() {
  return { notes: all('notes').filter(n => n.source === 'live'), comments: all('comments').filter(c => c.source === 'live'), jobs: all('jobs').filter(j => j.source === 'live'), workflows: all('workflows').filter(w => w.input?.mode === 'live'), connections: ['douyin', 'xiaohongshu'].map(p => browser.connection(p)), protection: Object.fromEntries(['douyin', 'xiaohongshu'].map(p => [p, protectionStatus(p)])) };
}
async function command(action, input = {}) {
  if (action === 'state') return state();
  if (action === 'seed-note') {
    const note = input.note; platform(note?.platform); key(note?.id);
    const existing = get('notes', note.id);
    if (existing && (existing.platform !== note.platform || new URL(existing.url).pathname !== new URL(note.url).pathname)) throw new Error('作品标识与原始链接冲突');
    if (!existing) put('notes', note);
    return { ok: true };
  }
  if (action === 'frame') return { image: (await browser.loginScreenshot(platform(input.platform))).toString('base64'), width: 1280, height: 860 };
  if (action === 'pointer') {
    const coords = [input.x, input.y, ...(input.toX === undefined ? [] : [input.toX, input.toY])];
    if (coords.some((v, i) => !Number.isFinite(v) || v < 0 || v >= (i % 2 ? 860 : 1280))) throw new Error('点击位置无效');
    await browser.loginPointer(platform(input.platform), input.x, input.y, input.toX, input.toY); return { ok: true };
  }
  let route, body = {};
  if (action === 'search') { route = '/api/jobs'; body = { keyword: input.keyword, platform: platform(input.platform), limit: input.limit ?? 20, sort: input.sort || 'latest', noteType: input.noteType || 'all', interval: 15000, forceRefresh: input.forceRefresh === true, mode: 'live' }; }
  else if (action === 'network') { if (!['system', 'direct'].includes(input.mode)) throw new Error('网络模式无效'); route = `/api/platforms/${platform(input.platform)}/network`; body = { mode: input.mode }; }
  else if (action === 'workflow') { route = '/api/workflows'; body = { keyword: input.keyword, platform: platform(input.platform), searchLimit: input.searchLimit ?? 20, maxNotes: input.maxNotes ?? 3, commentLimit: input.commentLimit ?? 20, supplement: input.supplement !== false, mode: 'live' }; }
  else if (action === 'comments') { route = '/api/comments/collect'; body = { noteId: input.noteId, limit: input.limit ?? 30, interval: 15000 }; }
  else if (['pause', 'resume'].includes(action)) route = `/api/workflows/${key(input.id)}/${action}`;
  else if (action === 'stop-job') route = `/api/jobs/${key(input.id)}/stop`;
  else if (action === 'detail') route = `/api/notes/${key(input.noteId)}/detail`;
  else if (['login', 'status', 'resume-platform'].includes(action)) route = `/api/platforms/${platform(input.platform)}/${action === 'resume-platform' ? 'resume' : action}`;
  else throw new Error('不支持的获客引擎操作');
  const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '平台操作未完成');
  if (action === 'detail' && data.detailState === 'complete') { delete data.hartaSeed; put('notes', data); }
  return data;
}
process.on('message', async message => {
  if (!message || typeof message.id !== 'string') return;
  try { const result = await command(message.action, message.input); if (process.connected) process.send({ id: message.id, result }); }
  catch (error) { if (process.connected) process.send({ id: message.id, error: String(error.message).slice(0, 1000) }); }
});
process.send({ ready: true });
