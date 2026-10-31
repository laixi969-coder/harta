// Isolated acceptance of acquisition state refresh and server backoff.
// HARTA_PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readWorkspace, writeWorkspace } from '../lib/workspace.mjs';
const { chromium } = await import(process.env.HARTA_PLAYWRIGHT_MODULE || 'playwright-core');
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-refresh-browser-'));
const output=process.env.HARTA_UI_OUTPUT || path.join(os.tmpdir(),'harta-acquisition-previews');fs.mkdirSync(output,{recursive:true});
let server,browser,currentPage;
try {
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'浏览器验收业务',hunt:'家装',city:'杭州',pitch:'厨房翻新',salesMaterial:'仅提供杭州地区的厨房翻新服务。',track:'存量',stage:'cooperating',packs:[],drops:[{id:'p1',tier:'今日',title:'厨房翻新需求',date:'2026-10-08',battlefields:['小红书'],copies:{},shells:{小红书:[{title:'厨房翻新先问什么',cover:'先核对使用需求',body:'厨房翻新前，先记录日常做饭习惯和收纳需求，再与服务方核对可改动范围、施工安排和报价项目。不要只比较一个总价。'}]},origin:{mode:'organic',goal:'leads'},execution:[]}]}],ledger:[],contentStates:{},feedback:{},usingId:'c1'});
  const seeded=readWorkspace('66445039@qq.com');seeded.customers.push({id:'c2',name:'第二个验收业务',hunt:'家装',city:'上海',pitch:'整体设计',track:'',stage:'cooperating',packs:[],drops:[]});writeWorkspace('66445039@qq.com',seeded);
  process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'browser-only-fixture-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:'',HARTA_BRAVE_API_KEY:'',HARTA_SEARXNG_URL:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Server exited');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];currentPage=page;page.on('response',async response=>{if(response.url().includes('/api/acquisition')&&response.status()>=400)console.log('Acquisition error',await response.text());});page.on('pageerror',error=>errors.push(error.message));
  assert.equal((await context.request.get(`${origin}/api/acquisition`)).status(),401);
  const login=await context.request.post(`${origin}/api/login`,{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}});assert.equal(login.status(),200);
  let reads=0;
  await page.route('**/api/openfind/workbench/c1/state',async route=>{
    reads++;
    if(reads===2)await route.fulfill({status:429,headers:{'retry-after':'7'},contentType:'application/json',body:JSON.stringify({error:'验收：请稍后刷新'})});
    else await route.continue();
  });
  await page.goto(origin);await page.locator('#cm-workbench h1').waitFor();
  const limited=page.waitForResponse(r=>r.url().endsWith('/workbench/c1/state')&&r.status()===429);
  await page.locator('[data-nav=prospecting]').click();
  await limited;
  assert.equal(reads,2);
  await page.waitForTimeout(6500);assert.equal(reads,2,'State refresh must respect Retry-After');
  await page.waitForResponse(r=>r.url().endsWith('/workbench/c1/state')&&r.ok(),{timeout:10000});
  assert.equal(reads,3);
  await page.locator('[data-nav=content-home]').click();
  await page.waitForTimeout(3500);const hiddenReads=reads;
  await page.waitForTimeout(6500);assert.equal(reads,hiddenReads,'Hidden workbench must not poll');
  const resumed=page.waitForResponse(r=>r.url().endsWith('/workbench/c1/state')&&r.ok());
  await page.locator('[data-nav=prospecting]').click();await resumed;
  assert.ok(reads>hiddenReads);assert.deepEqual(errors,[]);
  console.log('PASS: state refresh respects server backoff, pauses while hidden, and resumes when reopened');
} finally {
  await browser?.close();
  if(server && server.exitCode===null){server.kill();await once(server,'exit');}
  fs.rmSync(dir,{recursive:true,force:true});
}
