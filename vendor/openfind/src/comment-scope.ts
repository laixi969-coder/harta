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
