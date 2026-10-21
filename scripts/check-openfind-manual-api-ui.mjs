// Isolated Harta UI acceptance. Never logs into a platform or invokes paid APIs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { writeWorkspace } from '../lib/workspace.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-manual-api-ui-'));
const output=process.env.HARTA_UI_OUTPUT||path.join(os.tmpdir(),'harta-manual-api-previews');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
try {
 for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
 const old=process.cwd();process.chdir(dir);writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'采集回归',hunt:'其他行业',packs:[],drops:[]},{id:'c2',name:'隔离业务',packs:[],drops:[]}],usingId:'c1'});process.chdir(old);
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'browser-only-fixture-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Server exited');})]);
 const origin=`http://127.0.0.1:${port}`;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 assert.equal((await context.request.post(origin+'/api/login',{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}})).status(),200);
 assert.equal((await context.request.post(origin+'/api/openfind',{data:{customerId:'c1',action:'sync'}})).status(),200);
 const scopeDir=path.join(dir,'data/openfind',fs.readdirSync(path.join(dir,'data/openfind'))[0]);
 const db=new DatabaseSync(path.join(scopeDir,'engine/openfind.sqlite'));
 const put=(kind,row)=>db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,row.id,JSON.stringify(row));
 for(const [id,keyword,platform] of [['a','家具','xiaohongshu'],['b','装修','xiaohongshu'],['c','家具','douyin']]){
  put('notes',{id:platform+':'+id,nativeId:id,platform,source:'live',title:keyword+'作品',body:'公开作品夹具',author:'测试作者',authorId:'fixture',type:'image',images:[],cover:'',likes:1,comments:1,saves:0,publishedAt:'',tags:[],url:'https://www.'+(platform==='douyin'?'douyin.com/video/':'xiaohongshu.com/explore/')+id});
  put('jobs',{id:'job-'+id,type:'search',status:'completed',source:'live',platform,keyword,resultIds:[platform+':'+id],count:1,pages:1,logs:[],createdAt:new Date().toISOString()});
 }
 db.close();
 page=await context.newPage();const view=page.frameLocator('#cm-openfind iframe');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/openfind?customerId=c1#settings');
 await view.getByRole('heading',{name:'小红书 API 数据源'}).waitFor();
 await view.getByRole('heading',{name:'抖音数据源',exact:true}).waitFor();
 assert.equal(await view.getByRole('button',{name:'打开小红书'}).count(),0);
 await page.goto(origin+'/openfind?customerId=c1#acquisition');
 await view.getByRole('button',{name:'关键词搜索',exact:true}).click();
 for(const label of ['每次搜索作品数','最多采样作品数','每篇评论上限']){
  const input=view.getByRole('spinbutton',{name:label,exact:true});await input.fill('100');assert.equal(await input.getAttribute('max'),'100');assert.equal(await input.evaluate(el=>el.checkValidity()),true);
 }
 await page.goto(origin+'/openfind?customerId=c1#comments');
 const picker=view.locator('.collected-work-picker');await picker.getByLabel('采集主题').selectOption('家具');
 assert.equal(await picker.locator('#comment-note optgroup option').count(),1);
 assert.match(await picker.locator('#comment-note').textContent(),/家具作品/);
 await picker.getByLabel('作品平台').selectOption('douyin');
 assert.equal(await picker.locator('#comment-note optgroup option').count(),1);
 await page.goto(origin+'/openfind?customerId=c1#settings');
 for(const width of [375,1440]){
  await page.setViewportSize({width,height:1000});
  await view.locator('body').evaluate(el=>new Promise(resolve=>el.ownerDocument.defaultView.requestAnimationFrame(()=>el.ownerDocument.defaultView.requestAnimationFrame(resolve))));
  await view.getByRole('heading',{name:'小红书 API 数据源'}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px overflow`);
  const bounds=await view.locator('body').evaluate(el=>{const d=el.ownerDocument,w=d.defaultView.innerWidth;return {width:w,scroll:d.documentElement.scrollWidth,overflow:[...d.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>w+1).slice(0,8).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right}))};});
  assert.ok(bounds.scroll<=bounds.width,JSON.stringify(bounds));
  await page.screenshot({path:path.join(output,`settings-${width}.png`),fullPage:true});
 }
 await page.goto(origin+'/openfind?customerId=c2#comments');
 await view.locator('.collected-work-picker').waitFor();
 assert.equal(await view.locator('#comment-note optgroup option').count(),0);
 await page.goto(origin+'/openfind?customerId=c1#settings');
 await view.getByRole('heading',{name:'小红书 API 数据源'}).waitFor();
 for(const route of ['acquisition','discover','comments','leads','followup','inbox','studio','history','settings']) {
  console.log('Branding page:',route);
  await page.evaluate(async route=>(await import('/js/openfind-workbench.js')).openAcquisitionPage(route),route);
  await page.waitForFunction(route=>new URLSearchParams(location.search).get('acqPage')===route,route);
  await view.locator('body').evaluate(el=>new Promise(resolve=>el.ownerDocument.defaultView.requestAnimationFrame(()=>el.ownerDocument.defaultView.requestAnimationFrame(resolve))));
  await view.locator('main').waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(),/openfind/i,`Harta shell: ${route}`);
  assert.doesNotMatch(await view.locator('body').innerText(),/openfind/i,`Harta workspace: ${route}`);
  assert.doesNotMatch(await view.locator('body').evaluate(el=>[...el.querySelectorAll('[title],[aria-label],[placeholder],img')].map(e=>[e.title,e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.getAttribute('alt')].join(' ')).join('\n')),/openfind/i,`Accessible text: ${route}`);
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'passed',checks:['API settings','1–100 inputs','platform/topic grouping','business isolation','375/1440px layout'],platformRequests:0,output},null,2));
} catch(error) { if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error; }
finally { await browser?.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
