import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginationGuard } from '../server/pagination-guard.ts';

test('pagination rejects non-adjacent cycles before another billed request', () => {
  const next = paginationGuard();
  next('A'); next('B');
  assert.throws(() => next('A'), /循环分页/);
  next(null);
  const otherJob = paginationGuard();
  assert.doesNotThrow(() => otherJob('A'));
});
