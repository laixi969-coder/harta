import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordAudit, readAudit, auditMonths } from './audit.mjs';

describe('审计日志', () => {
  it('追加写入、按月读取、最新在前，换行清洗保持一行一条', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-audit-'));
    try {
      recordAudit('a@x.test', 'user.login', 'a@x.test', '', base);
      recordAudit('admin@x.test', 'user.password-reset', 'b@x.test', '会话已全部撤销', base);
      recordAudit('c@x.test', 'pack.delete', 'c1/p1', '第一行\n第二行', base);
      const months = auditMonths(base);
      expect(months).toHaveLength(1);
      const entries = readAudit(months[0], { base });
      expect(entries).toHaveLength(3);
      expect(entries[0].action).toBe('pack.delete');
      expect(entries[0].detail).toBe('第一行 第二行');
      expect(entries[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(() => readAudit('bad-month', { base })).toThrow('月份');
      expect(readAudit('1999-01', { base })).toEqual([]);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
});
