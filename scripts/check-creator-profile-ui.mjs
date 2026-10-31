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
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-profile-ui-'));
const output=path.join(root,'output/future-studio');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
try{
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'人设资料验收',pitch:'厨房设计',hunt:'家装',drops:[],packs:[]}],usingId:'c1'});process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'isolated-review-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server exited');})]);
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const post=async(url,data)=>{const r=await context.request.post(origin+url,{data});assert.ok(r.ok(),await r.text());return r.json();};
  const workspace=async()=>{const r=await context.request.get(origin+'/api/acquisition');return (await r.json()).workspace;};
  await post('/api/login',{email:'66445039@qq.com',password:'isolated-review-password'});
  const openProfile=async()=>{
    await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();
    await page.locator('[data-nav=content-home]').click();await page.locator('#cm-content-home [data-cm=creator-profile]').click();await page.locator('[data-creator-profile] [name=profile-identity]').waitFor();
  };
  await openProfile();const section=page.locator('[data-creator-profile]'),identity=section.locator('[name=profile-identity]'),voice=section.locator('[name=profile-voice]');
  const save=async(action)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/creator-profile') && r.request().method()==='POST');await section.locator(`[data-growth-action="${action}"]`).click();assert.ok((await response).ok());};
  await identity.fill('厨房设计师');await voice.fill('用短句解释');await section.getByRole('button',{name:'评估当前资料'}).click();
  await section.getByText('当前填写 2 / 7 项；已采用 0 项。',{exact:false}).waitFor();assert.equal((await workspace()).customers[0].creatorProfile,undefined);
  await save('profile-save-draft');await page.waitForFunction(()=>document.querySelector('[data-creator-profile]')?.dataset.draftVersion==='1');
  assert.equal((await workspace()).customers[0].creatorProfile,undefined);
  await openProfile();assert.equal(await voice.inputValue(),'用短句解释');
  await voice.fill('另一项未保存的口语');
  const adopted=page.waitForResponse(r=>r.url().endsWith('/api/creator-profile'));await section.locator('[data-profile-key=identity][data-growth-action=profile-adopt-field]').click();assert.ok((await adopted).ok());
  await page.waitForFunction(()=>document.querySelector('[data-creator-profile]')?.dataset.version==='1');
  let c=(await workspace()).customers[0];assert.equal(c.creatorProfile.fields.identity,'厨房设计师');assert.equal(c.creatorProfile.fields.voice,'');assert.equal(c.creatorProfileDraft.fields.voice,'用短句解释');assert.equal(await voice.inputValue(),'另一项未保存的口语');
  // An edit made during this client's save remains a draft against the new version.
  let release,started;const gate=new Promise(r=>release=r),requested=new Promise(r=>started=r);
  await page.route('**/api/creator-profile',async route=>{started();await gate;await route.continue();},{times:1});
  const saving=page.waitForResponse(r=>r.url().endsWith('/api/creator-profile'));await section.locator('[data-growth-action=profile-save-draft]').click();await requested;await voice.fill('保存期间继续输入');release();assert.ok((await saving).ok());
  await page.waitForFunction(()=>document.querySelector('[data-creator-profile]')?.dataset.draftVersion==='3');assert.equal(await voice.inputValue(),'保存期间继续输入');
  await save('profile');await page.waitForFunction(()=>document.querySelector('[data-creator-profile]')?.dataset.version==='2');c=(await workspace()).customers[0];assert.equal(c.creatorProfile.fields.voice,'保存期间继续输入');
  const cleared=page.waitForResponse(r=>r.url().endsWith('/api/creator-profile'));await section.locator('[data-profile-key=identity][data-growth-action=profile-clear-field]').click();assert.ok((await cleared).ok());
  await page.waitForFunction(()=>document.querySelector('[data-creator-profile]')?.dataset.version==='3');c=(await workspace()).customers[0];assert.equal(c.creatorProfile.fields.identity,'');assert.equal(c.creatorProfileDraft.fields.identity,'厨房设计师');assert.equal(c.creatorProfileHistory.at(-1).fields.identity,'厨房设计师');
  // External draft update plus an unrelated refresh must not rebase unsaved text.
  await voice.fill('本地未保存');c=(await workspace()).customers[0];await post('/api/creator-profile',{customerId:'c1',version:c.creatorProfile.version,draftVersion:c.creatorProfileDraft.version,action:'save-draft',fields:{voice:'另一窗口草稿'}});
  const goal=page.waitForResponse(r=>r.url().endsWith('/api/growth-goal'));await page.locator('#growth-settings [data-growth-action=goal]').click();assert.ok((await goal).ok());
  await section.getByRole('alert').filter({hasText:'资料或草稿已更新'}).waitFor();
  const stale=page.waitForResponse(r=>r.url().endsWith('/api/creator-profile'));await section.locator('[data-growth-action=profile]').click();assert.equal((await stale).status(),400);await section.locator('[data-profile-status]').getByText('人设草稿已被修改，请重新载入已保存资料').waitFor();assert.equal(await voice.inputValue(),'本地未保存');
  await section.locator('[data-growth-action=profile-reload]').click();assert.equal(await voice.inputValue(),'另一窗口草稿');assert.equal((await workspace()).customers[0].creatorProfile.fields.voice,'保存期间继续输入');
  // Visible handoff from content home, draft persistence, explicit adoption and withdrawal.
  const openEntry=async()=>{await page.locator('[data-nav=content-home]').click();await page.locator('[data-cm=contact-entry]').click();await section.locator('[name=profile-contactEntry]').waitFor();};
  await openEntry();assert.ok((await section.boundingBox()).width>900,'Creator profile uses the desktop workspace, not one legacy column');const entry=section.locator('[name=profile-contactEntry]'),entryRow=section.locator('[data-profile-field=contactEntry]');
  assert.equal(await entry.evaluate(el=>document.activeElement===el),true);
  await entry.fill('小红书：站内私信说明尺寸；公众号：菜单预约咨询');await save('profile-save-draft');await section.locator('[data-profile-status]').getByText('已保存').waitFor();
  c=(await workspace()).customers[0];assert.equal(c.creatorProfile.fields.contactEntry,'');assert.ok(c.creatorProfileDraft.fields.contactEntry.includes('菜单预约'));
  await openProfile();assert.ok((await entry.inputValue()).includes('菜单预约'));
  const adoptEntry=page.waitForResponse(r=>r.url().endsWith('/api/creator-profile'));await entryRow.locator('[data-growth-action=profile-adopt-field]').click();assert.ok((await adoptEntry).ok());await entryRow.locator('[data-profile-field-status]').getByText('已采用',{exact:true}).waitFor();
  c=(await workspace()).customers[0];assert.ok(c.creatorProfile.fields.contactEntry.includes('菜单预约'));assert.equal(c.creatorProfile.fields.voice,'保存期间继续输入');
  const activeEntry=c.creatorProfile.fields.contactEntry;
  await entry.fill('尚未启用的外部表单');await save('profile-save-draft');await section.locator('[data-profile-status]').getByText('已保存').waitFor();assert.equal((await workspace()).customers[0].creatorProfile.fields.contactEntry,activeEntry);
  await openEntry();await entryRow.evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(output,'contact-entry.png')});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await entryRow.evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(output,'contact-entry-mobile.png')});
  const clearEntry=page.waitForResponse(r=>r.url().endsWith('/api/creator-profile'));await entryRow.locator('[data-growth-action=profile-clear-field]').click();assert.ok((await clearEntry).ok());await entryRow.locator('[data-profile-field-status]').getByText('待采用',{exact:true}).waitFor();
  c=(await workspace()).customers[0];assert.equal(c.creatorProfile.fields.contactEntry,'');assert.equal(c.creatorProfileHistory.at(-1).fields.contactEntry,activeEntry);assert.equal(c.creatorProfileDraft.fields.contactEntry,'尚未启用的外部表单');
  await page.setViewportSize({width:1440,height:1000});
  await section.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'creator-profile.png')});
  assert.deepEqual(errors,[]);console.log('PASS: profile evaluation, persisted inactive drafts, per-field and full adoption, withdrawal, in-flight edits, stale draft rejection and explicit reload, contact-entry direct navigation, draft/adoption/withdrawal and mobile layout');
}catch(error){console.error(error.message);throw error;}
finally{server?.kill('SIGTERM');await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
