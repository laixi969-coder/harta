// Isolated browser acceptance. Uses only temporary data; never edits a real workspace.
// HARTA_PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { SEED_VERSION } from '../lib/pitch-seed.mjs';
import { readWorkspace, writeWorkspace } from '../lib/workspace.mjs';
const { chromium } = await import(process.env.HARTA_PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-journey-browser-'));
const output=process.env.HARTA_UI_OUTPUT || path.join(os.tmpdir(),'harta-commerce-previews');fs.mkdirSync(output,{recursive:true});
let server,browser,currentPage;
try {
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor','browser-extension'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);
  writeWorkspace('66445039@qq.com',{seedVersion:SEED_VERSION,customers:[],ledger:[],contentStates:{},feedback:{}});
  process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'browser-only-fixture-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:'',HARTA_BRAVE_API_KEY:'',HARTA_SEARXNG_URL:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Server exited');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];currentPage=page;page.on('response',async response=>{if(response.url().includes('/api/acquisition')&&response.status()>=400)console.log('Acquisition error',await response.text());});page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.stack);});
  assert.equal((await context.request.get(`${origin}/api/acquisition`)).status(),401);
  const login=await context.request.post(`${origin}/api/login`,{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}});assert.equal(login.status(),200);
  await page.goto(origin);


  const post=async(url,data,headers={})=>{const r=await context.request.post(origin+url,{data,headers});const v=await r.json();assert.ok(r.ok(),JSON.stringify(v));return v;};
  let result=await post('/api/acquisition/commerce',{action:'business',name:'抖音执行验收',pitch:'台灯销售'});const cId=result.workspace.usingId;
  result=await post('/api/acquisition/account',{customerId:cId,platform:'抖音',name:'测试发送账号'});const account=result.workspace.acquisition.accounts[0];
  const {code}=await post('/api/browser-connections/pair',{accountId:account.id});const headers={Origin:'chrome-extension://'+'a'.repeat(32)};const paired=await post('/api/connector/pair',{code,deviceName:'隔离验收'},headers);headers.Authorization='Bearer '+paired.token;
  await page.reload();await page.locator('[data-nav=delivery]').click();await page.locator('#cm-delivery summary').first().click();
  let form=page.locator('#cm-delivery [data-cm-form=delivery-identity]');await form.locator('[name=profileUrl]').fill('https://www.douyin.com/user/me123');await form.locator('[name=confirmed]').check();await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#cm-delivery [data-cm-form=delivery-identity]')?.dataset.busy);
  result=await post('/api/acquisition/commerce',{action:'target',customerId:cId,platform:'抖音',name:'自己的作品来源',url:'https://www.douyin.com/user/me123'});const target=result.workspace.acquisition.targets[0];
  result=await post('/api/acquisition/commerce',{action:'work',customerId:cId,targetId:target.id,title:'台灯',url:'https://www.douyin.com/video/123'});const work=result.workspace.acquisition.works[0];
  result=await post('/api/acquisition/import',{customerId:cId,workId:work.id,source:'模拟平台原文',rows:[{platform:'抖音',recordId:'comment01',authorId:'buyer1',authorName:'测试买家',authorUrl:'https://www.douyin.com/user/buyer1',url:work.url,text:'台灯多少钱'}]});const signal=result.workspace.acquisition.signals[0];
  result=await post('/api/acquisition/review',{signalId:signal.id,action:'confirm',note:'测试数据核对'});const lead=result.workspace.acquisition.leads[0];
  await post('/api/acquisition/lead',{action:'draft',leadId:lead.id,accountId:account.id,channel:'评论',recipient:work.url,text:'请问您需要哪种台灯？'});
  await page.locator('#cm-delivery [data-cm=browser-refresh]').click();await page.locator('#cm-delivery [data-cm=execution-messages]').click();form=page.locator('#cm-delivery [data-cm-form=delivery-send]');await form.locator('[name=confirmed]').check();await form.locator('button[type=submit]').click();
  await page.locator('#cm-delivery').getByText('回复评论 · 等待浏览器执行',{exact:true}).waitFor();
  const {job}=await post('/api/connector/delivery-claim',{},headers);assert.equal(job.targetUserId,'buyer1');
  const fixture=await context.newPage();await fixture.route('https://www.douyin.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<a href="/user/me123">我</a><div data-e2e="comment-item" data-comment-id="comment01"><a href="/user/buyer1">测试买家</a><div data-e2e="comment-item-content">台灯多少钱</div><button data-e2e="comment-reply">回复</button></div><div data-e2e="comment-input"><div contenteditable="true"></div></div><button id="send">发送</button><script>window.clicks=0;document.querySelector('#send').onclick=()=>{window.clicks++;const el=document.createElement('div');el.dataset.commentId='reply02';el.innerHTML='<a href="/user/me123">我</a><div data-e2e="comment-item-content"></div>';el.lastElementChild.textContent=document.querySelector('[contenteditable]').innerText;document.body.append(el);};</script>`}));
  await fixture.goto(work.url);await fixture.addScriptTag({path:path.join(root,'browser-extension/harta-connector/delivery.js')});
  const actor=await fixture.evaluate(()=>hartaDelivery.actor());assert.equal(actor.actorId,'me123');
  const evidence=await fixture.evaluate(j=>hartaDelivery.prepare(j,'me123',[]),job);await post('/api/connector/delivery-authorize',{jobId:job.id,lease:job.lease,evidence},headers);
  const receipt=await fixture.evaluate(j=>hartaDelivery.submit(j),job);assert.equal(receipt.status,'succeeded');assert.equal(await fixture.evaluate(()=>window.clicks),1);
  assert.ok(await fixture.evaluate(async j=>{try{await hartaDelivery.submit(j);return false;}catch{return true;}},job));assert.equal(await fixture.evaluate(()=>window.clicks),1);
  await post('/api/connector/delivery-complete',{jobId:job.id,lease:job.lease,...receipt},headers);await page.locator('#cm-delivery [data-cm=browser-refresh]').click();await page.locator('#cm-delivery').getByText('回复评论 · 平台回读成功',{exact:true}).waitFor();
  // Upload stays in a disposable workspace; this is a container-signature fixture, never sent to a platform.
  const uploaded=await context.request.post(origin+'/api/delivery/asset',{multipart:{customerId:cId,file:{name:'fixture.mp4',mimeType:'video/mp4',buffer:Buffer.from('0000ftypisom0000fixture')}}});assert.equal(uploaded.status(),200);const asset=(await uploaded.json()).asset;
  await page.locator('#cm-delivery [data-cm=browser-refresh]').click();await page.locator('#cm-delivery [data-cm=execution-publish]').click();form=page.locator('#cm-delivery [data-cm-form=delivery-publish]');await form.locator('[name=title]').fill('Harta 功能测试');await form.locator('[name=body]').fill('这是一条仅自己可见的功能测试。');await form.locator('[name=assetIds]').check();assert.equal(await form.locator('[name=visibility]').inputValue(),'private');await form.locator('[name=confirmed]').check();await form.locator('button[type=submit]').click();
  await page.locator('#cm-delivery').getByText('发布 · 等待浏览器执行',{exact:true}).waitFor();const {job:publish}=await post('/api/connector/delivery-claim',{},headers);assert.equal(publish.assetIds[0],asset.id);
  const bad=await context.request.post(origin+'/api/connector/delivery-authorize',{headers,data:{jobId:publish.id,lease:publish.lease,evidence:{actorId:'me123',text:publish.body,title:publish.title,visibility:'public',assetCount:1}}});assert.equal(bad.status(),400);
  await post('/api/connector/delivery-complete',{jobId:publish.id,lease:publish.lease,status:'unsupported',error:'验收模拟：未核对到平台可见范围'},headers);
  await page.locator('#cm-delivery [data-cm=execution-rules]').click();form=page.locator('#cm-delivery [data-cm-form=delivery-rule]');await form.locator('[name=scopeUrl]').fill(work.url);await form.locator('[name=keyword]').fill('台灯');await form.locator('[name=response]').fill('请问您的使用场景？');await form.locator('[name=confirmed]').check();await form.locator('button[type=submit]').click();
  await page.locator('#cm-delivery [data-cm=delivery-pause]').waitFor();await page.locator('#cm-delivery [data-cm=delivery-pause]').click();await page.locator('#cm-delivery').getByText('已暂停 · 评论 · 台灯',{exact:true}).waitFor();

  // Exercise the actual submit adapters against disposable platform-shaped DOM.
  await fixture.goto('https://www.douyin.com/user/buyer1');
  await fixture.setContent(`<button id="open">私信</button><script>window.clicks=0;document.querySelector('#open').onclick=()=>{const panel=document.createElement('div');panel.setAttribute('role','dialog');panel.innerHTML='<a href="https://www.douyin.com/user/buyer1">买家</a><div contenteditable="true"></div><button id="sendDm">发送</button><div data-message-id="incoming1" data-sender-id="buyer1"><div class="message-text">台灯还有吗</div></div><div data-message-id="self0" data-sender-id="me123"><div class="message-text">自己发的消息</div></div>';document.body.append(panel);document.querySelector('#sendDm').onclick=()=>{window.clicks++;const m=document.createElement('div');m.dataset.messageId='dm02';m.dataset.senderId='me123';m.innerHTML='<div class="message-text"></div>';m.firstChild.textContent=panel.querySelector('[contenteditable]').innerText;panel.append(m);};};</script>`);
  await fixture.addScriptTag({path:path.join(root,'browser-extension/harta-connector/delivery.js')});
  const dm={...job,id:'dm-fixture',kind:'dm',targetUrl:'https://www.douyin.com/user/buyer1'};
  await fixture.evaluate(j=>hartaDelivery.prepare(j,'me123',[]),dm);const dmResult=await fixture.evaluate(j=>hartaDelivery.submit(j),dm);assert.equal(dmResult.status,'succeeded');assert.equal(await fixture.evaluate(()=>window.clicks),1);
  const inbox=await fixture.evaluate(()=>hartaDelivery.inbox({channel:'私信',scopeUrl:'https://www.douyin.com/user/buyer1',expectedActorId:'me123'}));assert.equal(inbox.length,1);assert.equal(inbox[0].platformId,'incoming1');
  await fixture.route('https://creator.douyin.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<input type="file"><input placeholder="填写作品标题"><div class="zone-container" contenteditable="true"></div><label><input type="radio" value="仅自己可见" checked>仅自己可见</label><button id="publish">发布</button><script>window.clicks=0;document.querySelector('#publish').onclick=()=>{window.clicks++;const done=document.createElement('div');done.innerHTML='发布成功 <a href="https://www.douyin.com/video/456">查看作品</a>';document.body.append(done);};</script>`}));
  await fixture.goto('https://creator.douyin.com/creator-micro/content/upload');await fixture.addScriptTag({path:path.join(root,'browser-extension/harta-connector/delivery.js')});
  const publishFixture={...publish,id:'publish-fixture'};const publishEvidence=await fixture.evaluate(async j=>{const meta={id:'asset-fixture',name:'fixture.mp4',mime:'video/mp4'};hartaDelivery.assetChunk(meta,btoa('0000ftypisom0000fixture'),0,1);return hartaDelivery.prepare(j,'me123',[meta]);},publishFixture);assert.equal(publishEvidence.visibility,'private');
  // If the page changes privacy after preview, no publish click is allowed.
  await fixture.locator('input[type=radio]').evaluate(e=>e.checked=false);assert.ok(await fixture.evaluate(async j=>{try{await hartaDelivery.submit(j);return false;}catch{return true;}},publishFixture));assert.equal(await fixture.evaluate(()=>window.clicks),0);
  await fixture.locator('input[type=radio]').check();const publishResult=await fixture.evaluate(j=>hartaDelivery.submit(j),publishFixture);assert.equal(publishResult.status,'succeeded');assert.equal(publishResult.receipt.platformId,'456');assert.equal(await fixture.evaluate(()=>window.clicks),1);
  await page.screenshot({path:path.join(output,'delivery-center-desktop.png'),fullPage:true});await page.setViewportSize({width:375,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'delivery-center-mobile.png'),fullPage:false});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',flows:['bind actor identity','actual DOM reply click and new platform ID readback in isolated fixture','one-shot submission','platform sent state','upload media and private publish queue','reject changed visibility','enable and pause auto replies','responsive execution UI','private message DOM submission and inbound-only reading','publication DOM submission with privacy recheck']},null,2));
} catch(error) { if(currentPage){console.log('Visible errors',await currentPage.locator('.cm-error,.acq-error').allTextContents());await currentPage.screenshot({path:path.join(output,'failure.png'),fullPage:true});}throw error; } finally { if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
