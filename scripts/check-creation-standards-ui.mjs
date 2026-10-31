// End-to-end review suggestions, explicit adoption, and stale-draft protection.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {writeWorkspace} from '../lib/workspace.mjs';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-standards-ui-'));
const output=path.join(root,'output/future-studio');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
try{
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'人设资料验收',pitch:'厨房设计',hunt:'家装',drops:[{id:'p1',tier:'今日',title:'厨房翻新先问什么',copies:{},shells:{小红书:[{title:'厨房翻新先问什么',cover:'先核对使用需求',body:'厨房翻新前，记录做饭习惯和收纳需求，再与服务方核对施工安排和报价项目。不要只比较总价。'}]}}],packs:[]}],usingId:'c1'});process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'isolated-review-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server exited');})]);
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const post=async(url,data)=>{const r=await context.request.post(origin+url,{data});assert.ok(r.ok(),await r.text());return r.json();};
  const workspace=async()=>{const r=await context.request.get(origin+'/api/acquisition');return (await r.json()).workspace;};
  await post('/api/login',{email:'66445039@qq.com',password:'isolated-review-password'});
  await post('/api/acquisition/account',{customerId:'c1',platform:'小红书',name:'验收账号'});
  const openStandards=async()=>{await page.locator('[data-nav=content-home]').click();await page.locator('[data-cm=creation-standards]').click();await page.locator('[data-standard-editor]').waitFor();assert.ok((await page.locator('[data-creation-standards]').boundingBox()).width>900,'Standards use the full desktop workspace');};
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();await openStandards();
  const section=page.locator('[data-creation-standards]');
  const add=async(title,rule,mode,severity)=>{await section.locator('[data-growth-action=standard-rule-add]').click();const row=section.locator('[data-standard-rule]').last();await row.locator('[data-rule-field=title]').fill(title);await row.locator('[data-rule-field=rule]').fill(rule);await row.locator('[data-rule-field=mode]').selectOption(mode);await row.locator('[data-rule-field=severity]').selectOption(severity);};
  const save=async(status=200)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/creation-standards')&&r.request().method()==='POST');await section.locator('[data-growth-action=standards]').click();assert.equal((await response).status(),status);};
  await add('报价用词','报价','forbid','warn');await add('业务证据','请核对业务事实有依据','manual','block');await save();await page.waitForFunction(()=>document.querySelector('[data-standard-editor]')?.dataset.version==='1');
  assert.equal((await workspace()).customers[0].creationStandards.rules.length,2);
  const openPublication=async()=>{await page.locator('[data-nav=content-home]').click();await page.locator('#cm-content-home [data-cm=legacy]').click();await page.locator('[data-acq-form=prepare-publication]').waitFor();};
  await openPublication();const form=page.locator('[data-acq-form=prepare-publication]');await form.locator('[name=accountId]').selectOption({label:'小红书 · 验收账号'});
  await form.locator('[data-standard-review]').getByText('报价用词',{exact:true}).waitFor();
  const attempt=async(status)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/prepare-publication'));await form.getByRole('button',{name:'核对并保存发布版本'}).click();assert.equal((await response).status(),status);};
  await attempt(400);await form.getByText('请逐项核对当前内容的人工创作规则',{exact:false}).waitFor();
  await form.locator('[data-standard-confirmation]').check();await attempt(200);
  await page.waitForFunction(()=>!document.querySelector('[data-acq-form=prepare-publication]')?.dataset.busy);
  let saved=await workspace();assert.equal(saved.acquisition.publications[0].standardReview.checks[0].status,'issue');assert.equal(saved.acquisition.publications[0].standardReview.confirmedRuleIds.length,1);
  await openStandards();await section.locator('[data-standard-rule]').first().locator('[data-rule-field=severity]').selectOption('block');await save();await page.waitForFunction(()=>document.querySelector('[data-standard-editor]')?.dataset.version==='2');
  await openPublication();await form.locator('[name=accountId]').selectOption({label:'小红书 · 验收账号'});await form.locator('[data-standard-confirmation]').check();await attempt(400);await form.getByText('创作规则「报价用词」',{exact:false}).waitFor();
  await openStandards();await section.locator('[data-standard-rule]').first().locator('[data-growth-action=standard-rule-remove]').click();await save();await page.waitForFunction(()=>document.querySelector('[data-standard-editor]')?.dataset.version==='3');
  assert.equal((await workspace()).customers[0].creationStandardsHistory.at(-1).rules.length,2);
  // A concurrent change cannot acquire this window's pending edit during refresh.
  await section.locator('[data-rule-field=title]').fill('本地未保存的标题');saved=await workspace();const current=saved.customers[0].creationStandards;
  await post('/api/creation-standards',{customerId:'c1',version:current.version,preferences:'另一窗口',rules:current.rules});
  const goal=page.waitForResponse(r=>r.url().endsWith('/api/growth-goal'));await page.locator('#growth-settings [data-growth-action=goal]').click();assert.ok((await goal).ok());
  await section.getByRole('alert').filter({hasText:'标准已更新'}).waitFor();await save(400);assert.equal(await section.locator('[data-rule-field=title]').inputValue(),'本地未保存的标题');
  await section.locator('[data-growth-action=standards-reload]').click();assert.equal(await section.locator('[data-rule-field=title]').inputValue(),'业务证据');
  // Edits made during our own save survive and use the newly accepted version.
  let release,started;const gate=new Promise(r=>release=r),requested=new Promise(r=>started=r);
  await section.locator('[data-rule-field=title]').fill('提交的标题');
  await page.route('**/api/creation-standards',async route=>{started();await gate;await route.continue();},{times:1});
  const saving=page.waitForResponse(r=>r.url().endsWith('/api/creation-standards'));await section.locator('[data-growth-action=standards]').click();await requested;await section.locator('[data-rule-field=title]').fill('保存期间继续编辑');release();assert.ok((await saving).ok());
  await page.waitForFunction(()=>document.querySelector('[data-standard-editor]')?.dataset.version==='5');assert.equal(await section.locator('[data-rule-field=title]').inputValue(),'保存期间继续编辑');
  await save();await page.waitForFunction(()=>document.querySelector('[data-standard-editor]')?.dataset.version==='6');assert.equal((await workspace()).customers[0].creationStandards.rules[0].title,'保存期间继续编辑');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:1440,height:1000});
  await section.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'creation-standards.png')});assert.deepEqual(errors,[]);
  console.log('PASS: visible standards entry, rule add/delete, severity switch, warning does not block, manual review required, blocking word enforced, version history and stale editing protection');
}catch(error){console.error(error);await page?.screenshot({path:path.join(output,'standards-failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{server?.kill('SIGTERM');await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
