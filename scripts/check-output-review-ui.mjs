// Functional acceptance for the public intake, mobile start and scoped imports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {writeWorkspace} from '../lib/workspace.mjs';
import {ADMIN_EMAIL} from '../lib/auth.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-output-review-'));
const fixture='scoped-opening@example.invalid',password='review-fixture-password';
let server,browser;
try{
  for(const item of ['index.html','login.html','register.html','css','js','images','fonts','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  process.chdir(dir);
  writeWorkspace(ADMIN_EMAIL,{seedVersion:999,usingId:'music',customers:[{id:'music',name:'小提琴工作室',pitch:'小提琴启蒙',hunt:'音乐教育',city:'杭州',track:'存量',drops:[],packs:[]}],
    acquisition:{products:[{id:'vp',customerId:'music',name:'儿童小提琴',status:'active',revision:1}]}});
  process.chdir(root);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));const origin='http://127.0.0.1:'+port;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_PUBLIC_ORIGIN:'',HARTA_SETUP_PASSWORD:password},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server exited');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...fs.existsSync(chrome)?{executablePath:chrome}:{}});
  const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{origin},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);
  await page.goto(origin,{waitUntil:"domcontentloaded"});await page.locator('.hero-copy').getByRole('link',{name:'申请开通'}).click();
  await page.locator('#pricing-plan').selectOption('studio');await page.locator('#opening-email').fill(fixture);
  await page.locator('#opening button').click();await page.locator('#opening-status').getByText(/申请已交给 Harta 管理员/).waitFor();
  assert.notEqual((await context.request.get(origin+'/api/users')).status(),200);
  const login=await context.request.post(origin+'/api/login',{data:{email:ADMIN_EMAIL,password}});assert.equal(login.status(),200);
  const users=async()=>(await(await context.request.get(origin+'/api/users')).json());
  const before=await users();assert.equal(before.openingRequests[0].plan,'studio');assert.equal(before.openingRequests[0].email,fixture);assert.ok(!before.whitelist.includes(fixture));
  await page.goto(origin,{waitUntil:"domcontentloaded"});const overview=page.locator('#cm-workbench');await overview.locator('h1').waitFor();
  const heights={};
  for(const name of ['找第一条需求','做第一篇内容']){
    const rect=await overview.getByRole('button',{name,exact:true}).boundingBox();assert.ok(rect && rect.y>=0 && rect.y+rect.height<=844,name+' must fit the initial viewport');heights[name]=Math.round(rect.y+rect.height);
  }
  await overview.getByRole('button',{name:'做第一篇内容'}).click();
  await page.locator('#cm-content-scope [name=readerQuestion]').waitFor();
  const scope=page.locator('#cm-content-scope [data-cm-form=generate]');assert.equal(await scope.locator('[name=creationPlatform]').isVisible(),false);
  await page.setViewportSize({width:1440,height:980});await page.locator('[data-nav=workbench]').click();
  await overview.locator('summary').filter({hasText:'补充业务资料'}).click();
  await overview.getByRole('button',{name:'品牌关键词'}).click();
  await page.waitForFunction(()=>document.getElementById('keyword-scope-name').value==='小提琴工作室');
  const file={name:'选词.csv',mimeType:'text/csv',buffer:Buffer.from('关键词,来源,流量指数\n小提琴怎么选,业务自有表,0\n无关词,业务自有表,999')};
  const prepare=async()=>{await page.locator('#keyword-files').setInputFiles(file);await page.locator('#import-keywords').click();await page.locator('[data-kw-pick=save]').waitFor();};
  await prepare();await page.locator('[data-kw-pick=discard]').click();await page.locator('#keyword-preview fieldset').waitFor({state:'detached'});
  await prepare();assert.ok(await page.locator('[data-kw-id=K1]').isChecked());assert.equal(await page.locator('[data-kw-id=K2]').isChecked(),false);await page.locator('[data-kw-pick=save]').click();await page.locator('#keyword-preview fieldset').waitFor({state:'detached'});
  const saved=(await(await context.request.get(origin+'/api/acquisition')).json()).workspace.customers[0].keywordLibraries;
  assert.equal(saved.length,1);assert.deepEqual(saved[0].scope,{type:'品牌',name:'小提琴工作室'});assert.deepEqual(saved[0].items.map(r=>r.keyword),['小提琴怎么选']);
  await page.locator('[data-nav=workbench]').click();const info=overview.locator('summary').filter({hasText:'补充业务资料'});if(!await info.evaluate(e=>e.parentElement.open))await info.click();
  await overview.getByRole('button',{name:'维护产品与服务'}).click();await page.getByRole('button',{name:'导入品类关键词'}).click();await page.waitForFunction(()=>document.getElementById('keyword-scope-name').value==='儿童小提琴');
  await page.locator('[data-nav=settings]').first().click();const admin=page.locator('#whitelist-card');if(!await admin.evaluate(e=>e.open))await admin.locator(':scope > summary').click();
  await page.locator('[data-opening]').click();await page.locator('#activation-result input').waitFor();const after=await users();assert.ok(after.whitelist.includes(fixture));assert.equal(after.openingRequests.length,0);
  const code=await page.locator('#activation-result input').inputValue();
  const visitor=await browser.newContext({extraHTTPHeaders:{origin}}),registration=await visitor.newPage();
  await registration.goto(origin+'/register.html');await registration.locator('#email').fill(fixture);await registration.locator('#activation-code').fill(code);
  await registration.locator('#password').fill(password);await registration.locator('#password2').fill(password);
  const registered=registration.waitForResponse(r=>r.url()===origin+'/api/register'&&r.request().method()==='POST');
  await registration.getByRole('button',{name:'完成注册'}).click();assert.equal((await registered).status(),200);
  const session=await(await visitor.request.get(origin+'/api/me')).json();assert.equal(session.email,fixture);assert.equal(session.isAdmin,false);
  await visitor.close();
  assert.deepEqual(errors,[]);console.log('PASS public plan -> administrator -> manual activation -> registered member, scoped keyword preview/selection/discard, cold start. Mobile button bottoms',heights);
}finally{await browser?.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});}
