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
  await post('/api/acquisition/commerce',{action:'business',name:'连接器验收',pitch:'灯具销售'});
  await page.reload();await page.locator('[data-nav=connections]').click();

  assert.equal(await page.locator('#cm-connections [data-hosted=start]').count(),2);
  assert.equal(await page.locator('#cm-connections [data-cm=platform-connect]').first().isVisible(),false);
  assert.equal(await page.locator('#cm-connections [data-cm-form=browser-account]').isVisible(),false);
  const customerId=(await (await context.request.get(origin+'/api/acquisition')).json()).workspace.customers[0].id;
  assert.equal((await context.request.post(origin+'/api/hosted-browser/start',{data:{customerId:'other',platform:'抖音'}})).status(),400);
  assert.equal((await context.request.post(origin+'/api/hosted-browser/start',{headers:{Origin:'https://evil.test'},data:{customerId,platform:'抖音'}})).status(),403);
  const anon=await browser.newContext();assert.equal((await anon.request.get(origin+'/api/hosted-browser')).status(),401);await anon.close();
  let row=null,clicked=0,network=false;
  await page.route('**/api/hosted-browser**',async route=>{
    const url=new URL(route.request().url());let body;
    if(url.pathname==='/api/hosted-browser')body={available:true,connections:row?[row]:[]};
    else if(url.pathname.endsWith('/start')){row={id:'fixture',customerId,platform:'抖音',name:'隔离测试账号',status:network?'network_error':'login_required',error:network?'测试网络故障：未到登录页':'',executionEnabled:false,expiresAt:Date.now()+600000};body=row;}
    else if(url.pathname.endsWith('/status'))body=row;
    else if(url.pathname.endsWith('/frame'))body={url:'https://www.douyin.com/',width:1280,height:900,image:'fixture'};
    else if(url.pathname.endsWith('/click')){clicked++;assert.ok(route.request().postDataJSON().x>=0);row={...row,status:'connected',connectionId:'fixture-connection'};body=row;}
    else if(url.pathname.endsWith('/enable')){row={...row,executionEnabled:route.request().postDataJSON().enabled};body=row;}
    else if(url.pathname.endsWith('/disconnect')){row={...row,status:'disconnected'};body=row;}
    else return route.abort();
    await route.fulfill({json:body});
  });
  await page.reload();await page.locator('[data-nav=connections]').click();
  await page.locator('#cm-connections [data-hosted=start][data-id="抖音"]').click();
  const screen=page.locator('#cm-connections [data-hosted-screen]');await screen.waitFor();
  await screen.click({position:{x:50,y:50}});await page.locator('#cm-connections [data-hosted=enable]').waitFor();assert.equal(clicked,1);
  assert.ok((await page.locator('#cm-connections').textContent()).includes('待真实验证'));
  await page.locator('#cm-connections [data-hosted=enable]').click();await page.locator('#cm-connections [data-hosted=pause]').waitFor();
  await page.screenshot({path:path.join(output,'hosted-ui-fixture-desktop.png'),fullPage:true});
  await page.setViewportSize({width:375,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'hosted-ui-fixture-mobile.png'),fullPage:true});
  await page.locator('#cm-connections [data-hosted=disconnect]').click();await page.waitForFunction(()=>!document.querySelector('#cm-connections [data-hosted=pause]'));
  network=true;await page.locator('#cm-connections [data-hosted=start][data-id="抖音"]').click();await page.getByRole('heading',{name:'暂时无法连接平台'}).waitFor();assert.equal(await page.locator('[data-hosted-screen]').count(),0);
  assert.deepEqual(errors,[]);console.log('Hosted UI passed: plugin-free entry, authenticated ownership and CSRF, isolated login screen, explicit execution switch, disconnect, network failure, responsive layout. Fixtures only.');
} catch(error) { if(currentPage){console.log('Visible errors',await currentPage.locator('.cm-error,.acq-error').allTextContents());await currentPage.screenshot({path:path.join(output,'failure.png'),fullPage:true});}throw error; } finally { if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
