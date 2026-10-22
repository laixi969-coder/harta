import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Both Harta and its collection worker open the same business store. Opening a
// budget must not replace a missing credential key or activate collection jobs.
export function openScopedStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const keyPath = join(dataDir, '.credential-key');
  const databasePath = join(dataDir, 'openfind.sqlite');
  if (!existsSync(keyPath) && existsSync(databasePath))
    throw new Error('业务凭证密钥缺失，请从完整备份恢复，不会生成新密钥覆盖');
  try { writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  chmodSync(keyPath, 0o600);
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error('业务凭证密钥长度异常，请从完整备份恢复');
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
    return { db, key };
  } catch (error) { db.close(); throw error; }
}
