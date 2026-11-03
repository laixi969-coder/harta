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
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-studio-rules-ui-'));
const output=path.join(root,'output/future-studio');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
try{
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'人设资料验收',pitch:'厨房设计',hunt:'家装',drops:[],packs:[]}],usingId:'c1'});process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'isolated-review-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server exited');})]);
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const context=await browser.newContext({extraHTTPHeaders:{origin},viewport:{width:1440,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const post=async(url,data)=>{const r=await context.request.post(origin+url,{data});assert.ok(r.ok(),await r.text());return r.json();};
  const workspace=async()=>{const r=await context.request.get(origin+'/api/acquisition');return (await r.json()).workspace;};
  await post('/api/login',{email:'66445039@qq.com',password:'isolated-review-password'});
  const manual={id:'rule-proof',title:'业务证据',rule:'核对这份文案的业务事实','mode':'manual',severity:'block'},warning={id:'rule-warning',title:'报价措辞',rule:'报价',mode:'forbid',severity:'warn'};
  await post('/api/creation-standards',{customerId:'c1',version:0,rules:[manual,warning]});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();await page.locator('[data-nav=content-home]').click();await page.locator('#cm-content-home [data-acq-page=studio]').click();
  const studio=page.frameLocator('#cm-openfind iframe');await studio.getByRole('button',{name:'新建内容',exact:true}).click();await studio.locator('#draft-title').fill('厨房翻新');await studio.locator('#draft-body').fill('请核对需求和报价。');
  const review=studio.getByRole('region',{name:'发布文案核对'}),copy=review.getByRole('button',{name:'复制发布文案'});
  await page.evaluate(()=>navigator.clipboard.writeText('untouched'));
  await copy.click();await review.getByText('请逐项核对下方要求，确认后再次复制').waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'untouched');
  await review.getByRole('checkbox').check();await copy.click();await review.getByText('文案已复制。核对记录已保存；复制不代表发布。').waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'厨房翻新\n\n请核对需求和报价。\n\n');
  let s=await workspace();assert.equal(s.customers[0].studioTextReviews.length,1);assert.equal(s.customers[0].studioTextReviews[0].checks[1].status,'issue');
  await studio.locator('#draft-body').fill('请核对新的方案与报价。');await review.getByText('文案已修改，之前的核对不再适用。').waitFor();await copy.click();await review.getByText('请逐项核对下方要求，确认后再次复制').waitFor();assert.equal(await review.getByRole('checkbox').isChecked(),false);
  // A rule change between check and prepare must be rejected by the server.
  await review.getByRole('checkbox').check();let release,started;let gate=new Promise(r=>release=r),requested=new Promise(r=>started=r);
  await page.route('**/harta/standards-review',async route=>{if(route.request().postDataJSON().action==='prepare'){started();await gate;}await route.continue();});
  await copy.click();await requested;await post('/api/creation-standards',{customerId:'c1',version:1,rules:[manual,{...warning,severity:'block'}]});release();await review.getByText('文案尚未通过创作规则：报价措辞（报价）').waitFor();
  assert.equal((await workspace()).customers[0].studioTextReviews.length,1);await page.unroute('**/harta/standards-review');
  await copy.click();await review.getByText('请先修改阻止级别规则指出的词句，再复制发布文案').waitFor();
  await studio.locator('#draft-body').fill('请核对新的方案。');await review.getByRole('button',{name:'检查创作规则'}).click();await review.getByText('已按当前业务的创作标准检查；图片、视频内容及事实仍需人工核对。').waitFor();await review.getByRole('checkbox').check();
  // Local edits during server preparation must not copy the older response.
  gate=new Promise(r=>release=r);requested=new Promise(r=>started=r);
  await page.route('**/harta/standards-review',async route=>{if(route.request().postDataJSON().action==='prepare'){started();await gate;}await route.continue();});
  const previousClipboard=await page.evaluate(()=>navigator.clipboard.readText());await copy.click();await requested;await studio.locator('#draft-body').fill('继续编辑期间的新文案。');release();await review.getByText('准备复制期间文案已变化，未复制旧版本').waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),previousClipboard);await page.unroute('**/harta/standards-review');
  await copy.click();await review.getByText('请逐项核对下方要求，确认后再次复制').waitFor();await review.getByRole('checkbox').check();await copy.click();await review.getByText('文案已复制。核对记录已保存；复制不代表发布。').waitFor();assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes('继续编辑期间的新文案'));
  const countBeforeFailure=(await workspace()).customers[0].studioTextReviews.length;
  await studio.locator('html').evaluate(()=>{window.restoreClipboardWrite=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw new Error('simulated denial');};});
  await copy.click();await review.getByText('剪贴板写入失败；核对记录已保存，请重试或手动复制文案。').waitFor();assert.equal((await workspace()).customers[0].studioTextReviews.length,countBeforeFailure+1);
  await studio.locator('html').evaluate(()=>{navigator.clipboard.writeText=window.restoreClipboardWrite;delete window.restoreClipboardWrite;});await copy.click();await review.getByText('文案已复制。核对记录已保存；复制不代表发布。').waitFor();
  await review.getByText('本业务最近的文案核对记录',{exact:true}).click();await review.getByText('记录表示已准备复制，不表示剪贴板写入成功或已在平台发布。').waitFor();
  await review.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'studio-text-rules.png')});
  await page.setViewportSize({width:390,height:844});await review.scrollIntoViewIfNeeded();assert.equal(await studio.locator('html').evaluate(el=>el.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'studio-text-rules-mobile.png')});
  assert.deepEqual(errors,[]);console.log('PASS: studio text review, warning/block severity, explicit manual confirmation, exact clipboard text, history, stale rule rejection, local edit race, mobile layout');
}catch(error){console.error(error);await page?.screenshot({path:path.join(output,'studio-rule-failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{server?.kill('SIGTERM');await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
