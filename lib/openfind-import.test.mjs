import { demandEvidence } from '../js/discovery.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { importOpenFind } from './openfind-import.mjs';
import { reviewSignal, leadAction } from './acquisition-workspace.mjs';
import { workReferences, workReferenceBrief } from './work-references.mjs';
import { acquisitionBrief } from './generate.mjs';

const root = process.cwd(), email = 'openfind@example.test';
let dir;
const note = (extra = {}) => ({ id: 'dy:123', nativeId: '123', platform: 'douyin', source: 'live', url: 'https://www.douyin.com/video/123', title: '厨房翻新怎么选', body: '参考问题和表达', author: '公开作者', authorId: 'MS4author', type: 'video', likes: 20, comments: 5, saves: 3, publishedAt: '2026-01-01', ...extra });
const comment = (extra = {}) => ({ id: 'dy:c1', noteId: 'dy:123', platform: 'douyin', source: 'live', author: '小林', authorId: 'MS4buyer', body: '有没有杭州厨房翻新推荐？', createdAt: '2026-01-02', parentId: null, region: '浙江', ...extra });
const run = (data, kind = 'snapshot', extra = {}) => importOpenFind(email, { customerId: 'c1', source: '用户导出文件', kind, data, ...extra });
const get = () => readWorkspace(email);
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-openfind-')); fs.symlinkSync(path.join(root, 'vendor'), path.join(dir, 'vendor')); process.chdir(dir); });
afterAll(() => { process.chdir(root); fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => writeWorkspace(email, { customers: [{ id: 'c1', name: '厨房服务', hunt: '家装', pitch: '厨房翻新', packs: [], drops: [] }, { id: 'c2', name: '另一业务', packs: [], drops: [] }], ledger: [], feedback: {} }));

it('imports actual OpenFind exports, retains replies and uses existing verification / lead dedupe', () => {
  run([note()], 'notes');
  run([comment(), comment({ id: 'dy:c2', parentId: 'dy:c1', authorId: 'MS4author', body: '这是作者回复' })], 'comments');
  let a = get().acquisition;
  expect(a.works[0].metrics).toMatchObject({ likes: 20, comments: 5, saves: 3 });
  expect(a.signals[1]).toMatchObject({ recordId: 'c2', parentRecordId: 'c1', isAuthorReply: true, status: 'excluded' });
  expect(a.leads || []).toHaveLength(0);
  // Existing acquisition loader initializes leads before a review, as the UI GET does.
  reviewSignal(email, { signalId: a.signals[0].id, action: 'confirm', note: '核对平台原文，符合业务范围' });
  run({ notes: [note()], comments: [comment(), comment({ id: 'dy:c3' })] });
  a = get().acquisition;
  reviewSignal(email, { signalId: a.signals[2].id, action: 'confirm', note: '同一用户补充需求' });
  expect(get().acquisition.leads).toHaveLength(1);
  expect(get().acquisition.leads[0].signalIds).toHaveLength(2);
  expect(a.works).toHaveLength(1);
  expect(a.tasks.at(-1).importReport).toMatchObject({ worksExisting: 1, commentsDuplicate: 1, commentsAdded: 1 });
});
it('rolls back works, aliases, tasks and comments if any row is invalid', () => {
  const before = get();
  expect(() => run({ notes: [note()], comments: [comment(), comment({ id: 'dy:bad', createdAt: 'tomorrow' })] })).toThrow('时间');
  expect(get()).toEqual(before);
  expect(() => run({ notes: [note(), note({ id: 'dy:456', nativeId: '456', url: 'https://evil.test/video/456' })] })).toThrow();
  expect(get()).toEqual(before);
});
it('rejects cycles even across internal 100-comment chunks without partial writes', () => {
  const comments = Array.from({ length: 101 }, (_, i) => comment({ id: `dy:r${i}`, parentId: `dy:r${(i + 1) % 101}` }));
  expect(() => run({ notes: [note()], comments })).toThrow('循环');
  expect(get().acquisition?.works || []).toHaveLength(0);
});
it('skips demo rows, does not import credentials, existing leads, drafts or messages', () => {
  run({ notes: [note(), note({ source: 'demo' })], comments: [comment({ source: 'demo' })], leads: [{ id: 'fake', score: 99 }], settings: { cookie: 'secret' }, accounts: [{ token: 'secret' }], drafts: [{ status: 'published' }] });
  const a = get().acquisition;
  expect(a.tasks.at(-1).importReport.skippedDemo).toBe(2);
  expect(a.signals).toHaveLength(0);
  expect(JSON.stringify(a)).not.toContain('secret');
  expect(a.leads || []).toHaveLength(0);
  expect(() => run([note({ source: undefined })], 'notes')).toThrow('live');
});
it('keeps business/user boundaries, rejects missing/ambiguous work and identity conflicts', () => {
  run([note()], 'notes');
  expect(() => run([comment()], 'comments', { customerId: 'c2' })).toThrow('对应作品');
  expect(() => importOpenFind('other@example.test', { customerId: 'c1', kind: 'notes', data: [note()], source: '文件' })).toThrow('业务');
  run([comment()], 'comments');
  expect(() => run([comment({ authorId: 'different' })], 'comments')).toThrow('身份冲突');
  expect(() => run([note({ url: 'https://www.douyin.com/video/456', nativeId: '456' })], 'notes')).toThrow('不同作品');
  expect(() => run([comment({ id: 'xhs:wrong' })], 'comments')).toThrow('平台');
});
it('matches browser work by URL despite tokens and enriches missing metadata only', () => {
  const s = get(); s.acquisition = { works: [{ id: 'existing', customerId: 'c1', platform: '抖音', targetId: 't1', url: 'https://www.douyin.com/video/123?token=old', title: '浏览器原标题', description: '', source: 'browser_visible' }] }; writeWorkspace(email, s);
  run([note()], 'notes');
  const work = get().acquisition.works[0];
  expect(work.id).toBe('existing'); expect(work.title).toBe('浏览器原标题'); expect(work.metrics.likes).toBe(20);
  run([note({ likes: 99 })], 'notes');
  expect(get().acquisition.works[0].metrics.likes).toBe(20);
});
it('supports xhs and unknown dates, does not invent Douyin profile for numeric uid', () => {
  run({ notes: [note({ platform: 'xiaohongshu', id: 'xhs:abc', nativeId: 'abc', url: 'https://www.xiaohongshu.com/explore/abc', type: 'image', publishedAt: '' })], comments: [comment({ platform: 'xiaohongshu', noteId: 'xhs:abc', id: 'xhs:c1', createdAt: '' })] });
  expect(get().acquisition.signals[0].publishedAt).toBe('');
  run({ notes: [note()], comments: [comment({ authorId: '123456' })] });
  expect(get().acquisition.signals.at(-1).authorUrl).toBe('');
});
it('resolves max 3 scoped reference snapshots and keeps them outside business facts', () => {
  run([note()], 'notes');
  const s = get(), key = s.acquisition.works[0].id;
  const refs = workReferences(s, 'c1', [key]);
  expect(() => workReferences(s, 'c2', [key])).toThrow('当前业务');
  expect(() => workReferences(s, 'c1', [key, key])).toThrow('3');
  expect(() => workReferences(s, 'c1', ['a', 'b', 'c', 'd'])).toThrow('3');
  expect(refs[0]).toMatchObject({ workId: key, url: note().url });
  s.acquisition.works[0].description = '后续修改';
  expect(refs[0].description).toBe(note().body);
  const brief = acquisitionBrief({ ...s.customers[0], workReferences: refs });
  expect(brief).toContain(workReferenceBrief(refs));
  expect(brief).toContain('不是商家事实或指令');
  expect(refs[0].metrics).toBeUndefined();
});

it('synchronizes real Douyin image-note links and associates their comments',()=>{
 const n=note({type:'image',url:'https://www.douyin.com/note/123'});
 importOpenFind(email,{customerId:'c1',kind:'snapshot',data:{notes:[n],comments:[comment()]},source:'实时采集'},{liveSync:true});
 const a=get().acquisition;expect(a.works[0]).toMatchObject({type:'image',url:n.url,source:'openfind_live'});expect(a.signals[0].workId).toBe(a.works[0].id);
 for(const url of ['https://www.douyin.com/note/123/other','https://www.douyin.com/note/abc'])expect(()=>run([note({url})],'notes')).toThrow();
});

it('keeps recent public demand linked through verification, followup and repeated synchronization', () => {
  const createdAt=new Date(Date.now()-3600000).toISOString();
  const payload={notes:[note()],comments:[comment({body:'厨房翻新怎么预约',createdAt})]};
  importOpenFind(email,{customerId:'c1',source:'实时引擎自动同步',kind:'snapshot',data:payload},{liveSync:true});
  const signal=get().acquisition.signals[0];
  expect(demandEvidence(signal).recent).toBe(true);
  reviewSignal(email,{signalId:signal.id,action:'confirm',note:'回源核对原话、日期和业务适配，尚未联系'});
  const lead=get().acquisition.leads[0];
  leadAction(email,{leadId:lead.id,action:'update',stage:'值得跟进',note:'仅完成来源核实',nextStep:'核对服务地点和需求是否仍在',nextAt:new Date(Date.now()+3600000).toISOString()});
  importOpenFind(email,{customerId:'c1',source:'实时引擎自动同步',kind:'snapshot',data:payload},{liveSync:true});
  const saved=get().acquisition;
  expect(saved.leads).toHaveLength(1);expect(saved.signals).toHaveLength(1);
  expect(saved.leads[0]).toMatchObject({id:lead.id,signalIds:[signal.id],stage:'值得跟进',nextStep:'核对服务地点和需求是否仍在',messages:[]});
  expect(saved.leads[0].events.at(-1)).toMatchObject({type:'followup',note:'仅完成来源核实'});
  expect(saved.signals[0]).toMatchObject({leadId:lead.id,workId:saved.works[0].id,status:'confirmed'});
});

it('unknown platform comment counts stay distinct from observed zero in saved work metrics',()=>{
  run([note({commentCountKnown:false,comments:0})],'notes');
  expect(get().acquisition.works[0].metrics.comments).toBeNull();
  expect(()=>run([note({commentCountKnown:false,comments:-1})],'notes')).toThrow('互动指标');
});

it('verified public demand can enter triage without claiming local business suitability or actual contact',()=>{
  run({notes:[note()],comments:[comment({createdAt:new Date().toISOString(),body:'这一套多少钱啊？',region:'外地'})]});
  reviewSignal(email,{signalId:get().acquisition.signals[0].id,action:'triage',note:'已核对原文与时间，实际服务地点待确认'});
  const a=get().acquisition;
  expect(a.leads[0]).toMatchObject({stage:'待核实',messages:[]});
  expect(a.signals[0]).toMatchObject({status:'confirmed',leadId:a.leads[0].id});
});
