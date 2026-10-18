import type { Snapshot } from '../shared/types';
export const customerId = new URLSearchParams(location.search).get('customerId') || '';
export const apiUrl = (path: string) => '/api/openfind/workbench/' + encodeURIComponent(customerId) + path;
export function mediaUrl(url: string) {
  if (!url) return undefined;
  if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(url)) return url;
  if (/^\/assets\/[\w.-]+$/.test(url)) return '/js/openfind-app' + url;
  if (/^\/api\/media\/[a-f0-9-]+\.(mp4|webm|mov)$/.test(url)) return apiUrl(url.slice(4));
  if (/^https?:\/\//.test(url)) return apiUrl('/media/remote?url=' + encodeURIComponent(url));
  return undefined;
}
export async function hartaHandoff(noteId: string, commentId = '', intent = 'review') {
  const context = await api<{customerId: string; workId: string; signalId: string; intent: string}>('/harta/handoff', { noteId, commentId, intent });
  if (window.parent !== window) window.parent.postMessage({ type: 'harta-openfind-handoff', ...context }, location.origin);
  else location.assign('/?' + new URLSearchParams({ openfindCustomer: context.customerId, openfindWork: context.workId, openfindSignal: context.signalId, openfindIntent: context.intent }));
}

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const r = await fetch(apiUrl(path), {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `请求失败 (${r.status})`);
  return data as T;
}
export const getState = () => api<Snapshot>('/state');
export const shortNum = (n: number) =>
  n >= 10000 ? (n / 10000).toFixed(1) + '万' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export function exportUrl(kind: string, format = 'json', ids?: string[]) {
  return `${apiUrl(`/export/${kind}`)}?format=${format}${ids?.length ? '&ids=' + encodeURIComponent(ids.join(',')) : ''}`;
}
export function safeUrl(url: string) {
  return /^https?:\/\//.test(url) ? url : undefined;
}

export async function downloadExport(kind: string, format: 'json' | 'csv', ids: string[]) {
  const response = await fetch(apiUrl('/export/' + kind), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, format }),
  });
  if (!response.ok) throw new Error((await response.json()).error || '导出失败');
  saveFile(await response.blob(), `harta-${kind}.${format}`);
}

export async function downloadAsset(path: string, filename: string) {
  const response = await fetch(apiUrl(path));
  if (!response.ok) throw new Error((await response.json()).error || '素材包下载失败');
  saveFile(await response.blob(), filename);
}

export function workbenchLocation(values: Record<string,string>, page: string) {
  const params = new URLSearchParams(location.search);
  for (const [key,value] of Object.entries(values)) params.set(key,value);
  params.set('customerId', customerId);
  return location.pathname + '?' + params + '#' + page;
}

export const downloadDraft = (id: string) => downloadAsset(`/drafts/${encodeURIComponent(id)}/bundle`, `harta-draft-${id}.zip`);
