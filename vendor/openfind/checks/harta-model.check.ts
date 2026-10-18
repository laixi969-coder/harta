import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'harta-managed-review-'));
process.env.OPENFIND_DATA_DIR = dir;
const { db, get } = await import('../server/store.ts');
const { installManagedModel, llmSettings, saveLlmSettings, reviewSemantics, semanticFor, testLlm } = await import('../server/llm.ts');
const { demoNotes, demoComments } = await import('../server/demo.ts');
let revision = 'selected-1', model = 'shared-1', mode = 'ok', calls = 0;
installManagedModel({
  state: () => ({revision, model, ready:true, providerName:'Harta 共享模型'}),
  complete: async messages => {
    calls++;
    if (!messages[1].content.startsWith('{')) return '{"ok":true}';
    const input = JSON.parse(messages[1].content);
    if (mode === 'switch') revision = 'changed-during-request';
    const bad = mode === 'bad-quote' || mode === 'repair-once';
    if (mode === 'repair-once') mode = 'ok';
    return JSON.stringify({items:input.untrustedComments.map((c: any) => ({id:c.id,verdict:'purchase',reason:'原文询问购买渠道',quotes:[bad ? '伪造引用' : c.comment],limitations:['购买决定仍待核实']}))});
  },
});
after(() => {db.close();rmSync(dir,{recursive:true,force:true});});
test('managed review uses shared model, validates citations and invalidates cache when Harta changes selection', async () => {
  const settings = {enabled:false,maxComments:20,requestTimeoutSeconds:120,reviewTimeoutSeconds:900};
  saveLlmSettings(settings);
  assert.throws(() => saveLlmSettings({...settings,apiKey:'must-not-copy'}));
  assert.throws(() => saveLlmSettings({...settings,baseUrl:'https://example.test'}));
  assert.throws(() => saveLlmSettings({...settings,requestTimeoutSeconds:300,reviewTimeoutSeconds:60}));
  await testLlm();assert.ok(llmSettings().testedAt);
  const note = {...demoNotes('家居',1)[0],title:'洗手刷',body:'',tags:[]};
  const c = {...demoComments(note.id,1)[0],id:'shared-comment',body:'这个洗手刷在哪里买',createdAt:new Date().toISOString()};
  const excluded = {...c,id:'creator',authorId:note.authorId};
  assert.match(await reviewSemantics([c,excluded],[note],undefined,[c,excluded],true), /本次1条/);
  assert.equal(semanticFor(c,note,[c,excluded])?.model,'shared-1');
  assert.equal(semanticFor(c,note,[c,excluded])?.providerName,'Harta 共享模型');
  assert.equal(semanticFor(excluded,note,[c,excluded]),undefined);
  const count = calls;await reviewSemantics([c,excluded],[note],undefined,[c,excluded],true);assert.equal(calls,count);
  revision='selected-2';model='shared-2';assert.equal(semanticFor(c,note,[c,excluded]),undefined);assert.equal(llmSettings().testedAt,undefined);
  mode='bad-quote';assert.match(await reviewSemantics([c],[note],undefined,[c],true),/引用无法/);assert.equal(semanticFor(c,note,[c]),undefined);
  mode='switch';assert.match(await reviewSemantics([c],[note],undefined,[c],true),/切换模型/);assert.equal(get<any>('semanticReviews',c.id).model,'shared-1');
  mode='ok';assert.match(await reviewSemantics([c],[note],undefined,[c],true),/本次1条/);assert.equal(semanticFor(c,note,[c])?.model,'shared-2');
  const retryComment={...c,id:'citation-retry'};mode='repair-once';const beforeRetry=calls;
  assert.match(await reviewSemantics([retryComment],[note],undefined,[retryComment],true),/本次1条/);assert.equal(calls-beforeRetry,2);assert.deepEqual(semanticFor(retryComment,note,[retryComment])?.quotes,[c.body]);
});
