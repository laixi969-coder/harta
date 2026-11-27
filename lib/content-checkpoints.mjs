import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { RequestBudgetError } from './request-budget-core.mjs';

const scope = new AsyncLocalStorage();
const DAY = 86400000;
const UNKNOWN = '上次供应商请求已发出，响应尚未保存，可能已计费。确认重新请求后可继续。';
export const contentDigest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const contentRunId = () => scope.getStore()?.run || '';
export const contentStage = () => scope.getStore()?.stage || '';
export class UncertainProviderRequest extends RequestBudgetError {
  constructor() {
    super(UNKNOWN);
  }
}

function store(email, customerId) {
  const dir = path.join(process.cwd(), 'data', 'content-jobs');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, contentDigest([email.toLowerCase(), customerId]) + '.sqlite');
  const db = new DatabaseSync(file);
  try {
    fs.chmodSync(file, 0o600);
    db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,basis TEXT NOT NULL,input TEXT NOT NULL,created INTEGER NOT NULL,stage TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS steps(run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,key TEXT NOT NULL,state TEXT NOT NULL,value TEXT,PRIMARY KEY(run,key));`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function useStore(email, customerId, fn) {
  const db = store(email, customerId);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function createContentRun(email, customerId, basis, input, now = Date.now()) {
  return useStore(email, customerId, (db) => {
    const id = randomUUID();
    db.prepare('DELETE FROM runs WHERE created < ?').run(now - DAY);
    db.prepare('INSERT INTO runs(id,basis,input,created) VALUES(?,?,?,?)').run(
      id,
      basis,
      JSON.stringify(input),
      now,
    );
    return id;
  });
}
export function readContentRun(email, customerId, id) {
  return useStore(email, customerId, (db) => {
    const row = db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if (!row) return null;
    const sent = db.prepare("SELECT 1 FROM steps WHERE run=? AND state='sent' LIMIT 1").get(id);
    return { ...row, input: JSON.parse(row.input), uncertain: !!sent };
  });
}
export function deleteContentRun(email, customerId, id) {
  useStore(email, customerId, (db) => db.prepare('DELETE FROM runs WHERE id=?').run(id));
}
export function purgeExpiredContentRuns({ base = process.cwd(), now = Date.now() } = {}) {
  const dir = path.join(base, 'data', 'content-jobs');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!file.isFile() || !/^[0-9a-f]{64}\.sqlite$/.test(file.name)) continue;
    const db = new DatabaseSync(path.join(dir, file.name));
    try {
      db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON');
      db.prepare('DELETE FROM runs WHERE created<=?').run(now - DAY);
    } finally {
      db.close();
    }
  }
}

export function runContentSteps(email, customerId, run, confirmed, fn) {
  const db = store(email, customerId);
  return (async () => {
    try {
      if (confirmed) db.prepare("DELETE FROM steps WHERE run=? AND state='sent'").run(run);
      if (db.prepare("SELECT 1 FROM steps WHERE run=? AND state='sent' LIMIT 1").get(run)) {
        throw new UncertainProviderRequest();
      }
      return await scope.run({ db, run }, fn);
    } finally {
      db.close();
    }
  })();
}
export async function contentStep(stage, key, fn, { retryInvalidResponses = false } = {}) {
  const parent = scope.getStore();
  if (!parent) return fn();
  const { db, run } = parent;
  const saved = db.prepare('SELECT value FROM steps WHERE run=? AND key=? AND state=?').get(run, key, 'done');
  if (saved) return JSON.parse(saved.value);
  db.prepare('UPDATE runs SET stage=? WHERE id=?').run(stage, run);
  const requests = retryInvalidResponses ? new Set() : null;
  let result;
  try {
    result = await scope.run({ db, run, stage, requests }, fn);
  } catch (error) {
    if (requests && !(error instanceof RequestBudgetError)) {
      const remove=db.prepare("DELETE FROM steps WHERE run=? AND key=? AND state='done'");
      for(const request of requests) remove.run(run, request);
    }
    throw error;
  }
  db.prepare("INSERT OR REPLACE INTO steps(run,key,state,value) VALUES(?,?,'done',?)").run(
    run,
    key,
    JSON.stringify(result),
  );
  return result;
}

// A paid response can be complete on the wire while still failing validation.
// Keep earlier attempts as repair context, but allow the last rejected answer
// to be replaced on an explicit resume. Never clear a possibly billed request.
export function discardRejectedContentAnswer(identity, stage, stepKey) {
  const parent=scope.getStore();
  if(!parent) return;
  const remove=parent.db.prepare("DELETE FROM steps WHERE run=? AND key=? AND state='done'");
  remove.run(parent.run,'model:'+contentDigest([stage || parent.stage, identity]));
  if(stepKey) remove.run(parent.run,stepKey);
}

// Replay completed provider requests inside a partially completed stage. The
// transport marks dispatch only after any configured reservations succeed.
export async function checkpointRequest(identity, fn) {
  const parent = scope.getStore();
  if (!parent) return fn();
  const { db, run } = parent;
  const key = 'model:' + contentDigest([parent.stage, identity]);
  parent.requests?.add(key);
  const row = db.prepare('SELECT state,value FROM steps WHERE run=? AND key=?').get(run, key);
  if (row?.state === 'done') return JSON.parse(row.value);
  if (row?.state === 'sent') throw new UncertainProviderRequest();
  const attempt = { ...parent, requestKey: key };
  try {
    const result = await scope.run(attempt, fn);
    db.prepare("INSERT OR REPLACE INTO steps(run,key,state,value) VALUES(?,?,'done',?)").run(
      run,
      key,
      JSON.stringify(result),
    );
    return result;
  } catch (error) {
    if (attempt.sent) throw new UncertainProviderRequest();
    throw error;
  }
}
export function markRequestSent() {
  const ctx = scope.getStore();
  if (!ctx?.requestKey) return;
  ctx.db.prepare("INSERT OR REPLACE INTO steps(run,key,state) VALUES(?,?,'sent')").run(ctx.run, ctx.requestKey);
  ctx.sent = true;
}
export function markRequestRejected() {
  const ctx = scope.getStore();
  if (!ctx?.sent) return;
  ctx.db.prepare("DELETE FROM steps WHERE run=? AND key=? AND state='sent'").run(ctx.run, ctx.requestKey);
  ctx.sent = false;
}
