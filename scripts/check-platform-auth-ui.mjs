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
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'browser-only-fixture-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:'',HARTA_BRAVE_API_KEY:'',HARTA_SEARXNG_URL:'',HARTA_DOUYIN_APP_ID:'',HARTA_DOUYIN_APP_SECRET:'',HARTA_XHS_APP_ID:'',HARTA_XHS_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Server exited');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];currentPage=page;page.on('response',async response=>{if(response.url().includes('/api/acquisition')&&response.status()>=400)console.log('Acquisition error',await response.text());});page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.stack);});
  assert.equal((await context.request.get(`${origin}/api/acquisition`)).status(),401);
  const login=await context.request.post(`${origin}/api/login`,{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}});assert.equal(login.status(),200);
  await page.goto(origin);

  const post=async(url,data,headers={})=>{const r=await context.request.post(origin+url,{data,headers});const v=await r.json();assert.ok(r.ok(),JSON.stringify(v));return v;};
  await post('/api/acquisition/commerce',{action:'business',name:'连接器验收',pitch:'灯具销售'});
  await page.reload();await page.locator('[data-nav=connections]').click();await page.locator('#cm-connections summary').filter({hasText:'官方应用授权（需要平台应用资质）'}).click();
  assert.equal(await page.locator('#cm-connections [data-cm=platform-connect]').count(),2);
  for(const key of ['douyin','xiaohongshu'])assert.equal(await page.locator(`#cm-connections [data-cm=platform-connect][data-id=${key}]`).isDisabled(),true);
  assert.equal(await page.locator('#cm-connections [data-cm-form=browser-account]').isVisible(),false);
  assert.equal((await context.request.get(origin+'/api/platform-auth')).status(),200);
  const customerId=(await (await context.request.get(origin+'/api/acquisition')).json()).workspace.customers[0].id;
  assert.equal((await context.request.post(origin+'/api/platform-auth/start',{data:{platform:'douyin',customerId}})).status(),503);
  assert.equal((await context.request.post(origin+'/api/platform-auth/start',{headers:{Origin:'https://evil.test'},data:{platform:'douyin',customerId}})).status(),403);
  const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(origin+'/api/platform-auth')).status(),401);await anonymous.close();
  let authorized=false,polls=0;const fixtureId='fixture-auth-flow';
  const flow={id:fixtureId,customerId,platform:'xiaohongshu',name:'小红书测试账号',status:'pending',interval:1,expiresAt:Date.now()+600000};
  await page.route('**/api/platform-auth**',async route=>{
    const url=new URL(route.request().url());let body;
    if(url.pathname==='/api/platform-auth')body={providers:[{platform:'douyin',ready:true},{platform:'xiaohongshu',ready:true}],connections:authorized?[{...flow,status:'authorized',tokenExpiresAt:Date.now()+3600000}]:[]};
    else if(url.pathname.endsWith('/start')){assert.equal(route.request().postDataJSON().platform,'xiaohongshu');body={...flow,authorizeUrl:'https://openaccount.xiaohongshu.com/device?user_code=TEST-CODE',userCode:'TEST-CODE',qrDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII='};}
    else if(url.pathname.endsWith('/poll')){polls++;authorized=polls>1;body={...flow,status:authorized?'authorized':'scanned'};}
    else if(url.pathname.endsWith('/disconnect')){authorized=false;body={...flow,status:'disconnected'};}
    else return route.abort();
    await route.fulfill({json:body});
  });
  await page.reload();await page.locator('[data-nav=connections]').click();await page.locator('#cm-connections summary').filter({hasText:'官方应用授权（需要平台应用资质）'}).click();
  await page.locator('#cm-connections [data-cm=platform-connect][data-id=xiaohongshu]').click();
  await page.locator('.cm-auth-flow img').waitFor();
  await page.getByRole('heading',{name:'已扫码，请在手机上确认',exact:true}).waitFor();
  await page.locator('#cm-connections [data-cm=platform-disconnect]').waitFor();
  assert.equal(await page.locator('#cm-connections [data-cm=platform-disconnect]').count(),1);
  assert.ok((await page.locator('#cm-connections').textContent()).includes('尚未接通官方执行通道'));
  await page.screenshot({path:path.join(output,'platform-auth-desktop.png'),fullPage:true});
  await page.setViewportSize({width:375,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,'platform-auth-mobile.png'),fullPage:true});
  await page.locator('#cm-connections [data-cm=platform-disconnect]').click();await page.waitForFunction(()=>!document.querySelector('#cm-connections [data-cm=platform-disconnect]'));
  assert.deepEqual(errors,[]);console.log('Platform auth UI passed: configuration gating, authenticated endpoints, CSRF, isolated QR states, disconnect, responsive layout. No real platform authorization.');
} catch(error) { if(currentPage){console.log('Visible errors',await currentPage.locator('.cm-error,.acq-error').allTextContents());await currentPage.screenshot({path:path.join(output,'failure.png'),fullPage:true});}throw error; } finally { if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
