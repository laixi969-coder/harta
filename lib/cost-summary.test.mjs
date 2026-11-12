import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readModelSpend } from './model-spend.mjs';
let dir;
const now = new Date('2026-11-12T03:00:00Z');
const owner = email => createHash('sha256').update(email.toLowerCase()).digest('hex');
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-cost-summary-')); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });
it('views an unused account without creating spend records or inferring actual charges', () => {
  const result = readModelSpend('a@test.example', { base: dir, now });
  expect(result.reservedCents).toBe(0); expect(result.actualCharges).toBeNull(); expect(result.currency).toBe('USD');
  expect(result.resetAt).toBe('2026-11-13T00:00:00.000Z');
  expect(fs.existsSync(path.join(dir, 'data'))).toBe(false);
});
it('reads only the requesting account, excludes the global bucket and future records', () => {
  fs.mkdirSync(path.join(dir, 'data'));
  const db = new DatabaseSync(path.join(dir, 'data/model-spend.sqlite'));
  db.exec('CREATE TABLE spend(day TEXT,owner TEXT,cents INTEGER,calls INTEGER,PRIMARY KEY(day,owner))');
  for (const [day, email, cents] of [['2026-11-12', 'A@test.example', 123], ['2026-11-11', 'a@test.example', 40], ['2026-11-13', 'a@test.example', 900], ['2026-11-12', 'b@test.example', 888]]) db.prepare('INSERT INTO spend VALUES(?,?,?,2)').run(day, owner(email), cents);
  db.prepare('INSERT INTO spend VALUES(?,?,?,5)').run('2026-11-12', '*', 9999);
  db.close();
  vi.stubEnv('HARTA_MODEL_ACCOUNT_DAILY_CENTS', '100');
  const result = readModelSpend('a@test.example', { base: dir, now });
  expect(result.reservedCents).toBe(123); expect(result.calls).toBe(2); expect(result.remainingCents).toBe(0);
  expect(result.history).toHaveLength(2); expect(result.history.map(r => r.cents)).toEqual([123, 40]);
  expect(result.actualCharges).toBeNull(); expect(JSON.stringify(result)).not.toContain('888');
  expect(result.history[0]).not.toHaveProperty('owner');
});
it('does not show a broken ledger as a zero bill', () => {
  fs.mkdirSync(path.join(dir, 'data')); fs.writeFileSync(path.join(dir, 'data/model-spend.sqlite'), 'corrupt');
  expect(() => readModelSpend('a@test.example', { base: dir, now })).toThrow();
});
