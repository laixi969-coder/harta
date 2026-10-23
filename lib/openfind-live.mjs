import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { importOpenFind } from './openfind-import.mjs';
import { platformUrl } from './platform-connector.mjs';
import { browserExecutable } from './hosted-browser-runtime.mjs';
import { isWhitelisted, findUser } from './auth.mjs';
const upstream = '8532f51ec89fefedb5a9eee53703097629f931ae';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
const root = () => path.join(process.cwd(), 'data', 'openfind');
function owner(email, customerId) {
  if (!readWorkspace(email).customers.some(c => c.id === customerId)) throw new Error('找不到当前业务');
  return hash([email.toLowerCase(), customerId]);
}
function readScope(key) { try { return JSON.parse(fs.readFileSync(path.join(root(), key, 'harta.json'), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
function saveScope(row) {
  const dir = path.join(root(), row.key); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'harta.json'), temp = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(row), { mode: 0o600 }); fs.renameSync(temp, file);
}
function scope(email, customerId) {
  const key = owner(email, customerId);
  return readScope(key) || { key, email, customerId, enabled: false, hashes: {}, createdAt: now(), schedule: { enabled: false } };
}
export function spawnOpenFind(row) {
  const child = fork(fileURLToPath(new URL('./openfind-worker.mjs', import.meta.url)), [], {
    env: { ...process.env, HARTA_MODEL_ACCOUNT: row.email, OPENFIND_DATA_DIR: path.join(root(), row.key, 'engine'), OPENFIND_EMBEDDED: '1', OPENFIND_DEMO: '0', NODE_ENV: 'production' },
    execArgv: ['--experimental-strip-types'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const pending = new Map(); let readyResolve, readyReject, exited = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const bootTimer = setTimeout(() => { readyReject(new Error('获客引擎启动超时')); child.kill(); }, 20000);
  child.stderr.on('data', () => {}); // Platform diagnostics are kept in its scoped store, never streamed into public responses.
  child.on('message', message => {
    if (message.ready) { clearTimeout(bootTimer); readyResolve(); return; }
    const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
    message.error ? p.reject(new Error(message.error)) : p.resolve(message.result);
  });
  function failed() {
    exited = true; clearTimeout(bootTimer); const error = new Error('获客引擎已退出；已保存结果保留，重新连接后可继续暂停的流程'); readyReject(error);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear();
  }
  child.on('error', failed); child.on('exit', failed);
  return {
    get exited() { return exited; },
    async call(action, input = {}) {
      await ready; if (exited) throw new Error('获客引擎已关闭');
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('平台响应超时，已停止引擎；重新连接后核对任务状态')); child.kill(); }, 100000);
        pending.set(id, { resolve, reject, timer }); child.send({ id, action, input }, error => { if (error) { clearTimeout(timer); pending.delete(id); reject(error); } });
      });
    },
    close() {
      if (exited) return Promise.resolve();
      return new Promise(resolve => {
        const timeout = setTimeout(() => child.kill('SIGKILL'), 4000); timeout.unref();
        child.once('exit', () => { clearTimeout(timeout); resolve(); }); child.kill();
      });
    },
  };
}
function publicState(row, state = {}) {
  return { customerId: row.customerId, available: true, browserAvailable: Boolean(browserExecutable()), upstream, enabled: row.enabled, error: row.error || '', syncedAt: row.syncedAt || '', sync: row.sync || {}, schedule: row.schedule,
    connections: (state.connections || row.connections || []).map(({ platform, status, accountName, message, checkedAt, network }) => ({ platform, status, accountName, message, checkedAt, network })),
    jobs: (state.jobs || row.jobs || []).slice(0, 30).map(j => ({ id: j.id, type: j.type, platform: j.platform, status: j.status, keyword: j.keyword, count: j.count, pages: j.pages, error: j.error, createdAt: j.createdAt, logs: (j.logs || []).slice(-8) })),
    workflows: (state.workflows || row.workflows || []).slice(0, 20).map(w => ({ id: w.id, status: w.status, stage: w.stage, keyword: w.input.keyword, platform: w.input.platform, message: w.message, selected: w.selectedNoteIds?.length || 0, completed: w.completedNoteIds?.length || 0, logs: (w.logs || []).slice(-8) })), protection: state.protection || row.protection || {} };
}
// Sales records update only an already verified Harta contact. Candidate scoring never creates CRM contacts.
export function syncOpenFindSales(email, customerId, snapshot, hashes) {
  owner(email, customerId);
  const space = readWorkspace(email), a = space.acquisition || {};
  const labels = { outgoing:'人工登记已发沟通', incoming:'人工登记客户回复', note:'内部备注', quote:'人工登记方案/报价', order:'人工登记订单', optout:'拒绝联系' };
  let changed = 0;
  for (const record of snapshot.salesCases || []) {
    if (!Number.isSafeInteger(record.revision) || record.revision < 1) continue;
    const fingerprint = hash(record), hashKey = 'sales:' + record.id;
    if (hashes[hashKey] === fingerprint) continue;
    const source = (snapshot.leads || []).find(l => l.id === record.id && l.source === 'live');
    if (!source) continue;
    const work = (a.works || []).find(w => w.customerId === customerId && w.openfindIds?.includes(source.noteId));
    if (!work || source.platform && source.platform !== (work.platform === '抖音' ? 'douyin' : 'xiaohongshu')) continue;
    const signal = (a.signals || []).find(s => s.customerId === customerId && s.workId === work?.id && s.recordId === String(source.commentId).replace(/^(dy|xhs):/, ''));
    const lead = (a.leads || []).find(l => l.customerId === customerId && l.id === signal?.leadId) || (record.stopped && source.authorId ? (a.leads || []).find(l => l.customerId === customerId && l.platform === work.platform && l.authorId === source.authorId) : null);
    if (!lead || source.authorId && lead.authorId !== source.authorId) continue;
    const previous = lead.openfindSales;
    const stage = {contacted:'已联系',replied:'沟通中',qualified:'沟通中',quoted:'沟通中',won:'已成交',lost:'暂不跟进'}[record.stage];
    const event = (record.events || []).at(-1);
    const at = Number.isFinite(Date.parse(record.updatedAt)) ? record.updatedAt : now();
    if (!lead.doNotContact && stage) lead.stage = stage;
    if (record.nextAction || previous && previous.nextAction !== record.nextAction) lead.nextStep = record.nextAction || '';
    if (record.nextFollowUp || previous && previous.nextFollowUp !== record.nextFollowUp) lead.nextAt = record.nextFollowUp || '';
    if (record.stopped || lead.doNotContact) {
      lead.doNotContact = true; if (lead.stage !== '已成交') lead.stage = '暂不跟进'; lead.nextAt = ''; lead.nextStep = '已禁止联系，停止主动联系';
      for (const message of lead.messages || []) if (['draft','copied'].includes(message.status)) message.status = 'cancelled';
    }
    lead.openfindSales = {id:record.id,revision:record.revision,stage:record.stage,need:record.need,timing:record.timing,budget:record.budget,objection:record.objection,nextAction:record.nextAction,nextFollowUp:record.nextFollowUp,orderReference:record.orderReference,amount:record.amount,updatedAt:at};
    lead.events ||= [];
    const provenance = event?.platformMessage ? `Harta 平台私信记录同步（平台时间：${String(event.platformMessage.timeLabel || '未知').slice(0,100)}）` : 'Harta 沟通记录同步（人工登记，非平台发送回执）';
    lead.events.push({id:crypto.randomUUID(),at,type:'openfind-sales-sync',stage:lead.stage,...(event?.platformMessage ? {openfindPlatformMessage:{platform:event.platformMessage.platform,threadId:event.platformMessage.threadId,messageId:event.platformMessage.messageId,timeLabel:event.platformMessage.timeLabel}} : {}),note:`${provenance} · ${event ? (event.platformMessage ? ({incoming:'客户来信',outgoing:'已核对发送记录'}[event.kind] || labels[event.kind] || '沟通') : labels[event.kind] || '跟进') + '：' + String(event.content || '').slice(0,3000) : '更新下一步与阶段'}`});
    lead.updatedAt = at; hashes[hashKey] = fingerprint; changed++;
  }
  if (changed) writeWorkspace(email, space);
  return changed;
}
export function syncSnapshot(email, customerId, snapshot, previous = {}) {
  owner(email, customerId);
  const liveNotes = (snapshot.notes || []).filter(n => n.source === 'live');
  const notes = liveNotes.filter(n => previous['n:' + n.id] !== hash(['media-v1', n]));
  const liveComments = (snapshot.comments || []).filter(c => c.source === 'live');
  const skippedComments = liveComments.filter(c => typeof c.body !== 'string' || !c.body.trim()).length;
  const comments = liveComments.filter(c => typeof c.body === 'string' && c.body.trim() && previous['c:' + c.id] !== hash(c));
  let addedWorks = 0, addedComments = 0;
  // Import works before comments; each transaction is atomic. Retrying after interruption is idempotent.
  for (let i = 0; i < notes.length; i += 100) {
    const s = importOpenFind(email, { customerId, kind: 'notes', data: notes.slice(i, i + 100), source: '实时引擎自动同步' }, { liveSync: true });
    addedWorks += s.acquisition.tasks.at(-1).importReport.worksAdded;
  }
  for (let i = 0; i < comments.length; i += 1000) {
    const s = importOpenFind(email, { customerId, kind: 'comments', data: comments.slice(i, i + 1000), source: '实时引擎自动同步' }, { liveSync: true });
    addedComments += s.acquisition.tasks.at(-1).importReport.commentsAdded;
  }
  const hashes = { ...previous };
  for (const n of liveNotes) hashes['n:' + n.id] = hash(['media-v1', n]);
  for (const c of snapshot.comments || []) if (c.source === 'live') hashes['c:' + c.id] = hash(c);
  const semanticSynced = syncOpenFindSemantics(email, customerId, snapshot);
  const salesSynced = syncOpenFindSales(email, customerId, snapshot, hashes);
  return { hashes, addedWorks, addedComments, skippedComments, salesSynced, semanticSynced, changed: notes.length + comments.length + salesSynced + semanticSynced };
}

// Suggestions remain separate from the human review and contact stage. Only the
// private worker supplies current, citation-checked reviews; JSON imports cannot.
function syncOpenFindSemantics(email, customerId, snapshot) {
  if (!Array.isArray(snapshot.semanticReviews)) return 0;
  const space = readWorkspace(email), a = space.acquisition;
  if (!a) return 0;
  let changed = 0;
  for (const signal of (a.signals || []).filter(s => s.customerId === customerId)) {
    const work = (a.works || []).find(w => w.id === signal.workId && w.customerId === customerId);
    const source = snapshot.semanticReviews.find(r => work?.openfindIds?.includes(r.noteId) && String(r.commentId).replace(/^(dy|xhs):/, '') === signal.recordId);
    const valid = source?.managedBy === 'harta' && ['purchase','service','interest','discussion','resolved'].includes(source.verdict) &&
      Array.isArray(source.quotes) && source.quotes.some(q => typeof q === 'string' && q.length > 0 && signal.text.includes(q));
    const review = valid ? {
      verdict:source.verdict, reason:String(source.reason || '').slice(0,1000),
      quotes:source.quotes.filter(q => typeof q === 'string').slice(0,5).map(q => q.slice(0,500)),
      limitations:(Array.isArray(source.limitations) ? source.limitations : []).filter(q => typeof q === 'string').slice(0,6).map(q => q.slice(0,500)),
      model:String(source.model || '').slice(0,200), providerName:String(source.providerName || '').slice(0,200),
      reviewedAt:source.reviewedAt, inputHash:source.inputHash,
    } : undefined;
    if (hash(signal.openfindSemantic || null) !== hash(review || null)) {
      if (review) signal.openfindSemantic = review; else delete signal.openfindSemantic;
      changed++;
    }
  }
  if (changed) writeWorkspace(email, space);
  return changed;
}
export function createOpenFindService({ spawn = spawnOpenFind, canRun = email => isWhitelisted(email) && Boolean(findUser(email)?.passwordHash), clock = Date.now } = {}) {
  const workerOwners = new Map();
  const workers = new Map(), refreshing = new Map(), blockSync = new Map(), actions = new Set(); let timer, ticking = false, stopped = false;
  function worker(row) {
    if (stopped) throw new Error('获客引擎正在停止');
    let worker = workers.get(row.key);
    if (worker?.exited) { workers.delete(row.key); workerOwners.delete(row.key); blockSync.delete(row.key); worker = null; }
    if (!worker) {
      if ([...workers.keys()].filter(key => workerOwners.get(key) === row.email).length >= 2) throw new Error('每个账号最多同时运行2个获客引擎，请先关闭一个业务');
      if (workers.size >= 3) throw new Error('最多同时运行 3 个业务的获客引擎，请先关闭不用的引擎');
      worker = spawn(row); workers.set(row.key, worker); workerOwners.set(row.key,row.email);
    }
    return worker;
  }
  async function syncBlocks(row, client) {
    const blocked = (readWorkspace(row.email).acquisition?.leads || []).filter(l => l.customerId === row.customerId && l.doNotContact && l.authorId && ['抖音','小红书'].includes(l.platform)).map(l => ({platform:l.platform === '抖音' ? 'douyin' : 'xiaohongshu',authorId:l.authorId}));
    const fingerprint = hash(blocked), old = blockSync.get(row.key);
    if (old?.client === client && old.fingerprint === fingerprint) return;
    await client.call('harta-blocks', {blocked});
    blockSync.set(row.key, {client,fingerprint});
  }
  async function refresh(row) {
    if (refreshing.has(row.key)) return refreshing.get(row.key);
    const promise = (async () => {
      let snapshot;
      try {
        const client = worker(row); await syncBlocks(row, client);
        snapshot = await client.call('state');
        const current = readScope(row.key) || row;
        // Disconnect may have happened while the request was in flight.
        if (!current.enabled) return publicState(current);
        const result = syncSnapshot(current.email, current.customerId, snapshot, current.hashes);
        Object.assign(current, { hashes: result.hashes, sync: { skippedComments: result.skippedComments, addedWorks: (current.sync?.addedWorks || 0) + result.addedWorks, addedComments: (current.sync?.addedComments || 0) + result.addedComments }, syncedAt: now(), error: '', connections: snapshot.connections, jobs: snapshot.jobs?.slice(0, 30), workflows: snapshot.workflows?.slice(0, 20), protection: snapshot.protection });
        saveScope(current); return publicState(current, snapshot);
      } catch (error) { const current = readScope(row.key) || row; current.error = error.message; if (snapshot && current.enabled) Object.assign(current, { connections: snapshot.connections, jobs: snapshot.jobs?.slice(0, 30), workflows: snapshot.workflows?.slice(0, 20), protection: snapshot.protection }); saveScope(current); throw error; }
      finally { refreshing.delete(row.key); }
    })(); refreshing.set(row.key, promise); return promise;
  }
  async function state(email, customerId) {
    const row = scope(email, customerId);
    if (row.enabled) { try { return await refresh(row); } catch {} }
    return publicState(readScope(row.key) || row);
  }
  async function action(email, input) {
    let row = scope(email, input.customerId); const action = input.action;
    row.lastActivityAt = clock(); saveScope(row);
    if (actions.has(row.key)) throw new Error('当前业务正在处理平台操作，请稍候');
    if (action === 'disconnect') {
      actions.add(row.key);
      try {
      row.enabled = false; row.schedule = { ...row.schedule, enabled: false }; row.connections = []; row.error = '';
      row.jobs = (row.jobs || []).map(j => j.status === 'running' ? { ...j, status: 'stopped' } : j);
      row.workflows = (row.workflows || []).map(w => w.status === 'running' ? { ...w, status: 'paused', message: '引擎已关闭，重新连接后可继续' } : w);
      saveScope(row); await workers.get(row.key)?.close(); workers.delete(row.key); workerOwners.delete(row.key); blockSync.delete(row.key); return publicState(row);
      } finally { actions.delete(row.key); }
    }
    if (!['login', 'status', 'frame', 'pointer', 'search', 'workflow', 'comments', 'detail', 'pause', 'resume', 'stop-job', 'resume-platform', 'sync', 'schedule', 'network'].includes(action)) throw new Error('未知获客操作');
    actions.add(row.key);
    try {
      if (action === 'schedule') {
        if (typeof input.enabled !== 'boolean') throw new Error('定时采集开关无效');
        if (input.enabled) {
          const minutes = Number(input.minutes), keyword = String(input.keyword || '').trim();
          if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440 || !keyword || keyword.length > 100 || !['douyin', 'xiaohongshu'].includes(input.platform)) throw new Error('请填写 1–100 字关键词、平台和 15–1440 分钟间隔');
          row.enabled = true; row.schedule = { enabled: true, minutes, keyword, platform: input.platform, nextAt: clock() + minutes * 60000 };
        } else row.schedule = { ...row.schedule, enabled: false };
        saveScope(row); return publicState(row);
      }
      row.enabled = true; row.error = ''; saveScope(row);
      if (action === 'sync') return refresh(row);
      if (action === 'network') {
        if (!['system', 'direct'].includes(input.mode)) throw new Error('网络模式无效');
        const snapshot = await worker(row).call('state');
        if (snapshot.jobs?.some(j => j.platform === input.platform && j.status === 'running') || snapshot.workflows?.some(w => w.input?.platform === input.platform && w.status === 'running')) throw new Error('请先暂停该平台采集，再修复网络');
      }
      if (['comments', 'detail'].includes(action)) {
        const work = (readWorkspace(email).acquisition?.works || []).find(w => w.customerId === row.customerId && w.id === input.workId);
        if (!work || !['抖音','小红书'].includes(work.platform)) throw new Error('找不到当前业务的实时引擎作品');
        const platform = work.platform === '抖音' ? 'douyin' : 'xiaohongshu';
        const url = platformUrl(work.url, work.platform, 'work'), nativeId = new URL(url).pathname.split('/').filter(Boolean).at(-1);
        const noteId = work.openfindIds?.[0] || `${platform === 'douyin' ? 'dy' : 'xhs'}:${nativeId}`;
        await worker(row).call('seed-note', { note: { id: noteId, nativeId, platform, source:'live', hartaSeed:true, organization:work.organization, url, title:work.title, body:work.description||'', author:work.authorName||'', authorId:work.authorId||(readWorkspace(email).acquisition.targets||[]).find(t=>t.id===work.targetId)?.recordId||'', type:work.type||'video', images:work.images||[], cover:work.cover||'', videoUrl:work.videoUrl||'', tags:work.tags||[], likes:work.metrics?.likes??null, comments:work.metrics?.comments??null, saves:work.metrics?.saves??null, publishedAt:work.publishedAt||'', detailState:'summary' } });
        input = { ...input, noteId };
      }
      if (['pause', 'stop-job'].includes(action)) { row.schedule = { ...row.schedule, enabled: false }; saveScope(row); }
      const result = await worker(row).call(action, input);
      if (action === 'frame') return result;
      if (action === 'pointer') return result;
      const current = await refresh(row);
      return { ...current, result };
    } finally { actions.delete(row.key); }
  }
  async function tick() {
    if (stopped || ticking || !fs.existsSync(root())) return;
    ticking = true;
    try {
    for (const key of fs.readdirSync(root()).filter(k => /^[a-f0-9]{64}$/.test(k))) {
      let row = readScope(key); if (!row?.enabled || actions.has(key) || refreshing.has(key)) continue;
      if (!canRun(row.email)) { workers.get(key)?.close(); workers.delete(key); continue; }
      try {
        owner(row.email, row.customerId);
        const busy = row.jobs?.some(j => j.status === 'running') || row.workflows?.some(w => w.status === 'running');
        if (!busy && !row.schedule?.enabled && clock() - (row.lastActivityAt || Date.parse(row.createdAt)) > 10 * 60000) {
          row.enabled = false; saveScope(row); await workers.get(key)?.close(); workers.delete(key); workerOwners.delete(key); continue;
        }
        await refresh(row); row = readScope(key);
        const running = row.jobs?.some(j => j.status === 'running') || row.workflows?.some(w => w.status === 'running');
        const paused = row.workflows?.some(w => w.status === 'paused');
        if (row.schedule?.enabled && row.schedule.nextAt <= clock() && !running && !paused) {
          const { platform, keyword } = row.schedule;
          if (row.protection?.[platform]?.paused) continue;
          // Reserve next tick before dispatch, so overlapping refreshes never launch two workflows.
          row.schedule.nextAt = clock() + row.schedule.minutes * 60000; saveScope(row);
          await action(row.email, { customerId: row.customerId, action: 'workflow', keyword, platform });
        }
      } catch (error) { const latest = readScope(key) || row; latest.error = error.message; saveScope(latest); }
    }
    } finally { ticking = false; }
  }
  function startWorker() { stopped = false; if (!timer) { timer = setInterval(() => { void tick(); }, 4000); timer.unref(); } }
  async function prepareMaintenance() {
    if (ticking || actions.size || refreshing.size) return false;
    clearInterval(timer); timer = null;
    try {
      const states = await Promise.all([...workers.values()].map(w => w.call('state')));
      if (states.some(s => s.jobs?.some(j => j.status === 'running') || s.workflows?.some(w => w.status === 'running'))) { startWorker(); return false; }
      return true;
    } catch { startWorker(); return false; }
  }
  function stop() { stopped = true; clearInterval(timer); timer = null; const closing = [...workers.values()].map(worker => worker.close()); workers.clear(); workerOwners.clear(); return Promise.allSettled(closing); }
  async function endpoint(email, customerId, { activate = false } = {}) {
    if (!canRun(email)) throw new Error('请先登录已授权的 Harta 账号');
    const row = scope(email, customerId);
    if (!row.enabled && !activate) throw new Error('引擎已关闭，请重新打开 Harta 工作台');
    const client = worker(row); await syncBlocks(row, client);
    const endpoint = await client.call('endpoint');
    if (activate) row.enabled = true;
    row.lastActivityAt = clock(); saveScope(row);
    return endpoint;
  }
  async function handoff(email, customerId, input) {
    const row = scope(email, customerId);
    if (!row.enabled) throw new Error('请先连接 Harta');
    await refresh(row);
    const space = readWorkspace(email), a = space.acquisition || {};
    const work = (a.works || []).find(w => w.customerId === customerId && w.openfindIds?.includes(input.noteId));
    if (!work) throw new Error('这篇作品尚未同步到 Harta，请刷新后重试；演示作品不进入真实业务');
    const record = String(input.commentId || '').replace(/^(dy|xhs):/, '');
    const signal = (a.signals || []).find(s => s.customerId === customerId && s.workId === work.id && s.recordId === record);
    return { customerId, workId: work.id, signalId: signal?.id || '', intent: input.intent === 'reference' ? 'reference' : 'review' };
  }
  function suspendSchedule(email, customerId) {
    const row = scope(email, customerId);
    row.schedule = { ...row.schedule, enabled: false }; saveScope(row);
  }
  return { state, action, endpoint, handoff, suspendSchedule, tick, startWorker, stop, prepareMaintenance };
}
export const openFind = createOpenFindService();
