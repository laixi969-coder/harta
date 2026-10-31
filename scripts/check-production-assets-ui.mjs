import sharp from 'sharp';
import {saveProductionDraft} from '../lib/growth-workspace.mjs';
import {saveProductionAssets} from '../lib/production-assets.mjs';
// Isolated acceptance of saved image reuse and edits made during asset reads.
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
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-assets-browser-'));
let server,browser,currentPage,releaseImages,releaseSave;
try {
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'素材沿用验收',hunt:'家装',track:'存量',drops:[{id:'p1',tier:'今日',origin:{mode:'manual'},shells:{小红书:[{title:'测试',body:'原稿'}]},copies:{}}]}],usingId:'c1'});
  const args={customerId:'c1',packId:'p1',platform:'小红书',index:0};
  saveProductionDraft('66445039@qq.com',{...args,version:0,format:'image',fields:{title:'测试',script:'正文',shots:'第一页\n第二页',cover:'封面',coverLayout:'标题留白'}});
  const png='data:image/png;base64,'+(await sharp({create:{width:900,height:1200,channels:3,background:'white'}}).png().toBuffer()).toString('base64');
  await saveProductionAssets('66445039@qq.com',{...args,version:1,images:[{name:'page-01.png',data:png},{name:'page-02.png',data:png},{name:'cover.png',data:png}]});
  process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'browser-only-fixture-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:'',HARTA_BRAVE_API_KEY:'',HARTA_SEARXNG_URL:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Server exited');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];currentPage=page;page.on('response',async response=>{if(response.url().includes('/api/acquisition')&&response.status()>=400)console.log('Acquisition error',await response.text());});page.on('pageerror',error=>errors.push(error.message));
  assert.equal((await context.request.get(`${origin}/api/acquisition`)).status(),401);
  const login=await context.request.post(`${origin}/api/login`,{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}});assert.equal(login.status(),200);
  let nextRequest=0;await context.route('**/api/**',async route=>{const now=Date.now(),delay=Math.max(0,nextRequest-now);nextRequest=Math.max(nextRequest,now)+350;if(delay)await new Promise(r=>setTimeout(r,delay));await route.fallback();});
  let holdImages=true;const imageGate=new Promise(resolve=>{releaseImages=resolve;});
  await page.route('**/api/production-assets?*',async route=>{if(holdImages && route.request().resourceType()==='image')await imageGate;else await new Promise(r=>setTimeout(r,500));await route.fallback();});
  await page.addInitScript(()=>{window.productionClicks=[];document.addEventListener('click',e=>{window.productionClicks.push({tag:e.target.tagName,action:e.target.closest('[data-growth-action]')?.dataset.growthAction,text:e.target.textContent?.slice(0,60)});},true);});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();await page.locator('[data-nav=content-home]').click();
  await page.getByRole('button',{name:'查看与制作',exact:true}).click();
  const summary=page.getByText('脚本、直播与封面制作',{exact:true}).first();await page.waitForFunction(()=>document.querySelector('[data-production-editor]')?.open);
  const box=page.locator('[data-production-mode]').first(),shots=box.locator('[name=production-shots]'),status=box.locator('[data-production-status]');
  const panel=async key=>{const tab=box.locator(`[data-production-tab=${key}]`);if(await tab.getAttribute('aria-selected')!=='true')await tab.click();};
  await panel('cover');
  const image=box.locator('[data-saved-production-assets] img').first();
  const reserved=await image.boundingBox();assert.ok(reserved.width>0 && Math.abs(reserved.height/reserved.width-4/3)<0.01,'Saved images must reserve their 3:4 size before bytes arrive so action buttons do not move');
  holdImages=false;releaseImages();await image.evaluate(el=>el.decode());
  const loaded=await image.boundingBox();assert.ok(Math.abs(loaded.height-reserved.height)<1,'Loading saved images must not shift the production layout');
  const original=await shots.inputValue();await panel('script');await shots.fill(original+'\n多一页');await panel('cover');await box.locator('[data-growth-action=pages-reuse]').click();await status.getByText('逐页内容已变化，请重新制作图文页').waitFor();
  await panel('script');await shots.fill(original);await panel('cover');
  let saveRequested;const saveStarted=new Promise(resolve=>{saveRequested=resolve;}),saveGate=new Promise(resolve=>{releaseSave=resolve;});
  await page.route('**/api/production-draft',async route=>{saveRequested();await saveGate;await route.fallback();},{times:1});
  await box.locator('[data-growth-action=production-save]').click();await saveStarted;
  await box.locator('[data-growth-action=pages-reuse]').click();await status.getByText('制作草稿正在保存，请保存完成后再沿用素材').waitFor();
  releaseSave();
  await page.waitForFunction(()=>document.querySelector('[data-growth-action=production-save]')?.dataset.version==='2');
  if(!await summary.evaluate(el=>el.closest('details').open))await summary.click();
  await box.locator('[data-growth-action=pages-reuse]').click();
  await status.getByText('已沿用原图文页，请逐页核对后保存到当前素材包。').waitFor();
  assert.equal(await box.locator('[data-page-templates] img').count(),2);
  await box.locator('[data-growth-action=pages-reuse]').click();await status.getByText('正在读取已保存图文页…').waitFor();await panel('script');await shots.fill(original+'\n已修改');
  await status.getByText('读取期间草稿或素材已变化，请重新核对').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: delayed images reserve layout; reuse waits for pending saves; saved pages survive new versions; edits during reads are rejected');
} catch(error){
  console.error('REUSE DIAGNOSTIC',await currentPage?.evaluate(()=>window.productionClicks?.slice(-8)),await currentPage?.locator('[data-production-status]').allTextContents(),await currentPage?.locator('#toast').textContent({timeout:1000}).catch(()=>''));throw error;
} finally {
  releaseImages?.();releaseSave?.();
  await browser?.close();
  if(server && server.exitCode===null){server.kill();await once(server,'exit');}
  fs.rmSync(dir,{recursive:true,force:true});
}
