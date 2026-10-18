import { beforeAll, afterAll, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { MODEL_SELECTION_VERSION } from './model-selection.mjs';
import { hartaModelAdapter, hartaModelState } from './openfind-model.mjs';

const original = process.cwd();
let dir, server, base, mode = 'ok', received = [];
function select(kind = 'openai', model = 'shared-model', key = 'private-test-key') {
  fs.writeFileSync(path.join(dir, 'data/llm.json'), JSON.stringify({active:'custom',providers:{custom:{id:'custom',name:'共享测试渠道',kind,baseUrl:base,model,apiKey:key,models:[model],enabled:[model],modelSelectionVersion:MODEL_SELECTION_VERSION}}}));
}
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-shared-model-')); process.chdir(dir);
  fs.mkdirSync('data');
  server = createServer(async (req,res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const scenario = mode; const body = JSON.parse(text); received.push({url:req.url,headers:req.headers,body});
    if (scenario === 'slow') { await new Promise(r => setTimeout(r,120)); }
    if (scenario === 'switch') select('openai','changed-model');
    res.setHeader('content-type','application/json');
    if (scenario === 'error') { res.statusCode=401; res.end(JSON.stringify({error:{message:'private-test-key'}})); return; }
    res.end(JSON.stringify(req.url.endsWith('/messages') ? {content:[{type:'text',text:'{"ok":true}'}]} : {choices:[{message:{content:'{"ok":true}'}}]}));
  }).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}/v1`; select();
});
afterAll(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
const messages=[{role:'system',content:'Return JSON'},{role:'user',content:'fixed test'}];
it('uses Harta selection directly for both protocols without returning credentials',async()=>{
  select();const first=hartaModelState();expect(first).toMatchObject({model:'shared-model',ready:true,providerName:'共享测试渠道'});
  expect(JSON.stringify(first)).not.toContain('private-test-key');
  expect(await hartaModelAdapter.complete(messages)).toBe('{"ok":true}');
  expect(received.at(-1)).toMatchObject({url:'/v1/chat/completions',headers:{authorization:'Bearer private-test-key'},body:{model:'shared-model',response_format:{type:'json_object'}}});
  select('anthropic','claude-shared');expect(hartaModelState().revision).not.toBe(first.revision);
  expect(await hartaModelAdapter.complete(messages)).toBe('{"ok":true}');
  expect(received.at(-1)).toMatchObject({url:'/v1/messages',headers:{'x-api-key':'private-test-key'},body:{model:'claude-shared',system:'Return JSON'}});
  const revision=hartaModelState().revision;select('anthropic','claude-shared','rotated-key');expect(hartaModelState().revision).not.toBe(revision);
});
it('honors cancellation and refuses results produced while selection changes',async()=>{
  select();mode='slow';await expect(hartaModelAdapter.complete(messages,AbortSignal.timeout(20))).rejects.toThrow();
  mode='switch';await expect(hartaModelAdapter.complete(messages)).rejects.toThrow('切换模型');
  mode='error';await expect(hartaModelAdapter.complete(messages)).rejects.toThrow('HTTP 401');
  try {await hartaModelAdapter.complete(messages);}catch(error){expect(error.message).not.toContain('private-test-key');}
  mode='ok';select('openai','shared-model','');expect(hartaModelState().ready).toBe(false);
  await expect(hartaModelAdapter.complete(messages)).rejects.toThrow('管理员');
});
