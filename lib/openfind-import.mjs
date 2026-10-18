import crypto from 'node:crypto';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { importSignalsIntoWorkspace } from './acquisition-workspace.mjs';
import { platformUrl } from './platform-connector.mjs';

const platforms = { xiaohongshu: '小红书', douyin: '抖音' };
const id = () => crypto.randomUUID();
function text(value, label, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}需为${required ? '非空' : ''}文字，最多 ${max} 字`);
  return value.trim();
}
function date(value, label) {
  if (!value) return '';
  const result = text(value, label, 100);
  if (!Number.isFinite(Date.parse(result)) || Date.parse(result) > Date.now() + 60000) throw new Error(`${label}无效或在未来`);
  return new Date(result).toISOString();
}
const native = (value, platform) => {
  const prefix = platform === '抖音' ? 'dy:' : 'xhs:';
  const result = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (value && !/^[a-zA-Z0-9_-]+$/.test(result)) throw new Error('评论 ID 与平台不一致或格式无效');
  return result;
};
function metric(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('互动指标需为非负整数或留空');
  return value;
}
function profile(authorId, platform) {
  if (!authorId) return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(authorId)) throw new Error('平台用户 ID 格式无效');
  // Douyin numeric uid is not a verified sec_uid and cannot form a profile URL.
  if (platform === '抖音' && /^\d+$/.test(authorId)) return '';
  return platform === '抖音' ? `https://www.douyin.com/user/${authorId}` : `https://www.xiaohongshu.com/user/profile/${authorId}`;
}
function arrays(input) {
  if (input.kind === 'notes') return { notes: input.data, comments: [] };
  if (input.kind === 'comments') return { notes: [], comments: input.data };
  if (input.kind === 'snapshot' && input.data && !Array.isArray(input.data)) return { notes: input.data.notes, comments: input.data.comments || [] };
  throw new Error('请选择作品 JSON、评论 JSON 或包含 notes/comments 的快照');
}

export function importOpenFind(email, input, { liveSync = false } = {}) {
  const space = readWorkspace(email), customer = space.customers.find(c => c.id === input.customerId);
  if (!customer) throw new Error('找不到当前业务');
  const source = text(input.source, '资料来源', 500, true);
  const { notes, comments } = arrays(input);
  if (![notes, comments].every(Array.isArray) || notes.length > 100 || comments.length > 1000 || !notes.length && !comments.length) throw new Error('每次最多导入 100 条作品、1000 条评论，内容不能为空');
  const a = space.acquisition ||= {};
  for (const key of ['targets', 'works', 'signals', 'tasks', 'logs']) a[key] ||= [];
  const at = new Date().toISOString(), report = { worksAdded: 0, worksExisting: 0, commentsAdded: 0, commentsDuplicate: 0, skippedDemo: 0 };
  const ownWorks = () => a.works.filter(w => w.customerId === customer.id);
  for (const note of notes) {
    if (!note || typeof note !== 'object' || Array.isArray(note)) throw new Error('作品格式无效');
    if (note.source === 'demo') { report.skippedDemo++; continue; }
    if (note.source !== 'live' || !platforms[note.platform]) throw new Error('仅接受标记 live 的小红书或抖音作品');
    const platform = platforms[note.platform], externalId = text(note.id, '作品 ID', 200, true);
    const url = platformUrl(text(note.url, '作品链接', 2000, true), platform, 'work');
    const recordId = new URL(url).pathname.split('/').filter(Boolean).at(-1);
    if (note.nativeId && note.nativeId !== recordId) throw new Error('作品 ID 与链接不一致');
    const existing = ownWorks().find(w => w.platform === platform && (w.recordId === recordId || new URL(w.url).pathname === new URL(url).pathname));
    const alias = ownWorks().find(w => w.platform === platform && w.openfindIds?.includes(externalId));
    if (alias && alias !== existing) throw new Error('OpenFind 作品 ID 已关联不同作品');
    const authorId = text(note.authorId, '作者 ID', 200), authorName = text(note.author, '作者昵称', 100);
    const authorUrl = profile(authorId, platform);
    if (!['image', 'video'].includes(note.type)) throw new Error('作品类型需为 image 或 video');
    const commentCount = metric(note.comments);
    const metadata = { title: text(note.title, '作品标题', 300, true), description: text(note.body, '作品正文', 20000), type: note.type, authorName, authorId, publishedAt: date(note.publishedAt, '作品发表时间'), metrics: { likes: metric(note.likes), comments: note.commentCountKnown === false ? null : commentCount, saves: metric(note.saves), observedAt: at }, importedAt: at };
    if (existing) {
      if (existing.authorId && authorId && existing.authorId !== authorId) throw new Error('同一作品作者身份冲突');
      // Re-imports do not silently replace a previously captured snapshot.
      existing.openfindIds = [...new Set([...(existing.openfindIds || []), externalId])];
      for (const [key, value] of Object.entries(metadata)) if (!(liveSync && note.hartaSeed) && (liveSync || existing[key] == null || existing[key] === '')) existing[key] = value;
      report.worksExisting++;
      continue;
    }
    let target = authorId && a.targets.find(t => t.customerId === customer.id && t.platform === platform && t.recordId === authorId);
    if (!target) { target = { id: id(), customerId: customer.id, platform, recordId: authorId, name: authorName || '作者待核实', url: authorUrl, source: 'openfind_import', createdAt: at }; a.targets.push(target); }
    a.works.push({ id: id(), customerId: customer.id, targetId: target.id, platform, url, recordId, ...metadata, source: liveSync ? 'openfind_live' : 'openfind_import', createdAt: at, openfindIds: [externalId] });
    report.worksAdded++;
  }
  const prepared = [];
  for (const comment of comments) {
    if (!comment || typeof comment !== 'object' || Array.isArray(comment)) throw new Error('评论格式无效');
    if (comment.source === 'demo') { report.skippedDemo++; continue; }
    if (comment.source !== 'live') throw new Error('仅接受标记 live 的评论');
    if (comment.platform && !platforms[comment.platform]) throw new Error('评论平台无效');
    const noteId = text(comment.noteId, '评论所属作品 ID', 200, true);
    const matches = ownWorks().filter(w => w.openfindIds?.includes(noteId) && (!comment.platform || w.platform === platforms[comment.platform]));
    if (matches.length !== 1) throw new Error('评论缺少唯一对应作品，请先导入所属作品并核对平台');
    const work = matches[0], authorId = text(comment.authorId, '评论者 ID', 200);
    prepared.push({ platform: work.platform, workId: work.id, recordId: native(text(comment.id, '评论 ID', 200, true), work.platform), parentRecordId: native(text(comment.parentId, '父评论 ID', 200), work.platform), text: text(comment.body, '评论原文', 6000, true), url: work.url, authorId, authorName: text(comment.author, '评论者昵称', 100), authorUrl: profile(authorId, work.platform), ipRegion: text(comment.region, '页面属地', 100), publishedAt: date(comment.createdAt, '评论时间'), isAuthorReply: Boolean(authorId && authorId === work.authorId), identitySource: 'openfind_import' });
  }
  // All validation and insertion happen in memory. A bad row never partially imports a file.
  for (let offset = 0; offset < prepared.length; offset += 100) {
    importSignalsIntoWorkspace(space, { customerId: customer.id, source: `OpenFind · ${source}`, rows: prepared.slice(offset, offset + 100) });
    const task = a.tasks.at(-1); task.sourceType = liveSync ? 'openfind_live' : 'openfind_import';
    for (const signal of a.signals.filter(s => s.taskId === task.id)) signal.sourceType = liveSync ? 'openfind_live' : 'openfind_import';
    report.commentsAdded += task.coverage.added; report.commentsDuplicate += task.coverage.duplicate;
  }
  const task = { id: id(), customerId: customer.id, sourceType: liveSync ? 'openfind_live' : 'openfind_import', source: `OpenFind · ${source}`, status: 'completed', createdAt: at, finishedAt: at, platforms: [...new Set(ownWorks().map(w => w.platform))], coverage: { read: notes.length + comments.length, added: report.worksAdded + report.commentsAdded, duplicate: report.worksExisting + report.commentsDuplicate }, importReport: report, runs: [] };
  a.tasks.push(task); a.logs.push({ id: id(), customerId: customer.id, at, type: 'openfind-import', objectId: task.id, detail: source });
  return writeWorkspace(email, space);
}
