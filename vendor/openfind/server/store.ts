import { resolve } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { openScopedStore } from '../../../lib/scoped-store.mjs';
export const dataDir = resolve(process.env.OPENFIND_DATA_DIR || 'data');
const store = openScopedStore(dataDir);
const key = store.key;
export const db = store.db;
export const all = <T>(kind: string): T[] =>
  db
    .prepare('SELECT value FROM entities WHERE kind=? ORDER BY rowid DESC')
    .all(kind)
    .map((r) => JSON.parse(r.value as string));
export const get = <T>(kind: string, id: string): T | undefined => {
  const r = db.prepare('SELECT value FROM entities WHERE kind=? AND id=?').get(kind, id);
  return r ? JSON.parse(r.value as string) : undefined;
};
export const put = <T extends { id: string }>(kind: string, item: T) =>
  db
    .prepare(
      'INSERT INTO entities(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value',
    )
    .run(kind, item.id, JSON.stringify(item));
export const remove = (kind: string, id: string) =>
  db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run(kind, id);
export const configGet = (name: string, fallback = ''): string =>
  (db.prepare('SELECT value FROM config WHERE key=?').get(name)?.value as string) || fallback;
export const configSet = (name: string, value: string) =>
  db
    .prepare('INSERT INTO config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(name, value);
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(value), c.final(), c.getAuthTag()]).toString('base64');
}
export function decrypt(value: string) {
  if (!value) return '';
  const b = Buffer.from(value, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString();
}
