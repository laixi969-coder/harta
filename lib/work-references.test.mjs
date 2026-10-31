import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('./generate.mjs', () => ({ generateTodayDrop: generate, generatePack: vi.fn(), generateBoards: vi.fn(), collectRepairs: vi.fn(), sentenceRepairCount: vi.fn() }));
import { workReferences } from './work-references.mjs';
import { dropToday, readWorkspace, writeWorkspace } from './workspace.mjs';
const root = process.cwd(), email = 'reference-generation@example.test';
let dir;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-reference-')); fs.symlinkSync(path.join(root, 'vendor'), path.join(dir, 'vendor')); process.chdir(dir); });
afterAll(() => { process.chdir(root); fs.rmSync(dir, { recursive: true, force: true }); });
it('passes selected reference to generation and saves immutable provenance despite concurrent work changes', async () => {
  writeWorkspace(email, { customers: [{ id: 'c', name: '业务', hunt: '家装', pitch: '厨房服务', track: '存量', packs: [], drops: [] }], acquisition: { works: [{ id: 'w', customerId: 'c', title: '参考标题', description: '原始参考', platform: '抖音', url: 'https://www.douyin.com/video/123', source: 'openfind_import', createdAt: '2026-01-01' }] } });
  let finish;
  generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  expect(dropToday(email,'c',{creationFormat:'video'}).error).toContain('先选择');
  expect(dropToday(email,'c',{creationPlatform:'其他',creationFormat:'image'}).error).toContain('平台');
  const started = dropToday(email, 'c', { referenceWorkIds: ['w'],creationPlatform:'抖音',creationFormat:'image' });
  expect(started.error).toBeUndefined();
  expect(generate.mock.calls[0][0].workReferences[0].description).toBe('原始参考');
  expect(generate.mock.calls[0][0]).toMatchObject({requestedPlatform:'抖音',requestedFormat:'image'});
  const latest = readWorkspace(email); latest.acquisition.works[0].description = '后续修改'; writeWorkspace(email, latest);
  finish({ id: 'batch', tier: '今日', title: '成品', shells: {}, copies: {}, origin: { mode: 'organic' } });
  await vi.waitFor(() => expect(readWorkspace(email).customers[0].drops).toHaveLength(1));
  const saved = readWorkspace(email);
  expect(saved.customers[0].drops[0].workReferences[0].description).toBe('原始参考');
  expect(saved.acquisition.works[0].description).toBe('后续修改');
  expect(saved.customers[0].drops[0].productScope).toBeDefined();
});

it('rejects every historical demo marker in reference selection',()=>{
 const base={id:'w',customerId:'c',platform:'抖音',title:'样本'};
 for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}])expect(()=>workReferences({customers:[{id:'c'}],acquisition:{works:[{...base,...marker}]}},'c',['w'])).toThrow('真实参考');
});
