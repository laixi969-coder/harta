import type { Note } from '../shared/types.ts';
import { get, put } from './store.ts';

// Search cards are partial observations, not replacements for an already-read
// detail. The endpoint determines the observation type: search responses may
// contain a nonempty desc and still be only a preview.
export function saveCollectedNote(incoming: Note, observation: 'search' | 'detail'): Note {
  const previous = get<Note>('notes', incoming.id);
  let note: Note = observation === 'search' ? { ...incoming, detailState: 'summary' } : incoming;
  if (previous?.source === incoming.source && previous.platform === incoming.platform &&
      previous.detailState === 'complete' && (observation === 'search' || incoming.detailState !== 'complete')) {
    note = {
      ...previous,
      ...incoming,
      title: incoming.title && incoming.title !== '未命名作品' ? incoming.title : previous.title,
      body: previous.body || incoming.body,
      images: previous.images?.length ? previous.images : incoming.images,
      videoUrl: previous.videoUrl || incoming.videoUrl,
      tags: previous.tags?.length ? previous.tags : incoming.tags,
      author: incoming.author || previous.author,
      authorId: incoming.authorId || previous.authorId,
      publishedAt: incoming.publishedAt || previous.publishedAt,
      cover: incoming.cover || previous.cover,
      comments: incoming.commentCountKnown === false ? previous.comments : incoming.comments,
      commentCountKnown: incoming.commentCountKnown === false ? previous.commentCountKnown : incoming.commentCountKnown,
      detailState: 'complete',
    };
  }
  put('notes', note);
  return note;
}
