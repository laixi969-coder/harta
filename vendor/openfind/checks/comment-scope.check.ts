import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentJob, scopedComments } from '../src/comment-scope.ts';
import type { Comment, Job } from '../shared/types.ts';
const comments = [
  { id: 'a1', noteId: 'a' },
  { id: 'a2', noteId: 'a' },
  { id: 'b1', noteId: 'b' },
] as Comment[];
const jobs = [
  {
    id: 'old',
    type: 'comments',
    noteId: 'a',
    createdAt: '2026-10-01',
    resultIds: ['a1', 'b1'],
  },
  {
    id: 'new',
    type: 'comments',
    noteId: 'a',
    createdAt: '2026-10-02',
    resultIds: ['a2'],
  },
  {
    id: 'other',
    type: 'comments',
    noteId: 'b',
    createdAt: '2026-10-03',
    resultIds: ['b1'],
  },
] as Job[];
test('switching target cannot display an unrelated task; saved scope includes earlier collections', () => {
  assert.equal(commentJob(jobs, 'a', '')?.id, 'new');
  assert.equal(commentJob(jobs, 'a', 'other'), undefined);
  assert.deepEqual(
    scopedComments(comments, 'a', 'note').map((c) => c.id),
    ['a1', 'a2'],
  );
  assert.deepEqual(
    scopedComments(comments, 'a', 'job', jobs[0]).map((c) => c.id),
    ['a1'],
  );
  assert.deepEqual(scopedComments(comments, 'a', 'job', jobs[2]), []);
  assert.deepEqual(scopedComments(comments, 'no-task', 'note'), []);
  assert.equal(scopedComments(comments, 'a', 'all').length, 3);
});
