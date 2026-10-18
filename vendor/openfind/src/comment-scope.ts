import type { Comment, Job } from '../shared/types.ts';
export type CommentScope = 'note' | 'job' | 'all';
export function scopedComments(
  comments: Comment[],
  noteId: string,
  scope: CommentScope,
  job?: Job,
) {
  const ids = new Set(job?.resultIds || []);
  return comments.filter(
    (c) =>
      scope === 'all' ||
      (c.noteId === noteId && (scope !== 'job' || (job?.noteId === noteId && ids.has(c.id)))),
  );
}
export function commentJob(jobs: Job[], noteId: string, selectedId: string) {
  return jobs
    .filter((j) => j.type === 'comments' && j.noteId === noteId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((j, _, all) => (selectedId ? j.id === selectedId : j === all[0]));
}

// Use elapsed time, not the rounded display age, for every date filter.
export function withinCommentWindow(createdAt: string, days: string, now = Date.now()) {
  if (days === 'all') return true;
  const at = Date.parse(createdAt),
    length = Number(days) * 24 * 60 * 60 * 1000;
  return (
    Number.isFinite(at) &&
    Number.isFinite(length) &&
    length > 0 &&
    at <= now &&
    now - at <= length
  );
}
