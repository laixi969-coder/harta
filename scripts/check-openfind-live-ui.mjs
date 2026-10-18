// UI acceptance with an isolated real Harta server and deterministic upstream-store fixtures.
// No real platform collection or account login is claimed by this test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {writeWorkspace} from '../lib/workspace.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-live-ui-'));
const output=process.env.HARTA_UI_OUTPUT||path.join(os.tmpdir(),'harta-live-previews');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
try{
 for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
 const previous=process.cwd();process.chdir(dir);writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'实时获客验收',hunt:'家装',pitch:'杭州厨房翻新',track:'存量',packs:[],drops:[]},{id:'c2',name:'第二业务',hunt:'家装',packs:[],drops:[]}],usingId:'c1'});process.chdir(previous);
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'browser-only-fixture-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Server exited');})]);
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),origin=`http://127.0.0.1:${port}`;
 const login=await context.request.post(`${origin}/api/login`,{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}});assert.equal(login.status(),200);
 const unauth=await browser.newContext();assert.equal((await unauth.request.get(`${origin}/api/openfind?customerId=c1`)).status(),401);await unauth.close();
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('[data-nav=prospecting]').click();await page.getByRole('heading',{name:'实时搜索与自动获客'}).waitFor();
 // Actual Harta action starts the private worker; no manual JSON import is used.
 await page.locator('[data-of=sync]').click();
 await page.locator('.of-panel').getByText(/最近同步/).waitFor();
 const scopeDir=path.join(dir,'data/openfind',fs.readdirSync(path.join(dir,'data/openfind'))[0]);
 const db=new DatabaseSync(path.join(scopeDir,'engine/openfind.sqlite'));
 const put=(kind,row)=>db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,row.id,JSON.stringify(row));
 const at=new Date(Date.now()-60000).toISOString();
 const note={id:'dy:123',nativeId:'123',platform:'douyin',source:'live',url:'https://www.douyin.com/video/123',title:'厨房翻新先考虑什么',body:'从预算和生活习惯开始',author:'公开作者',authorId:'MS4author',type:'video',likes:10,comments:2,saves:4,publishedAt:at};
 const comment={id:'dy:c1',noteId:note.id,platform:'douyin',source:'live',author:'咨询者',authorId:'MS4buyer',body:'想找杭州厨房翻新，多少钱？',createdAt:at,parentId:null};
 let workflowRequest;
 await page.route('**/api/openfind',async route=>{
  const req=route.request();if(req.method()!=='POST'){await route.continue();return;}
  const body=req.postDataJSON();
  if(body.action==='workflow'){
   workflowRequest=body;put('notes',note);put('comments',comment);put('workflows',{id:'workflow-fixture',input:{keyword:body.keyword,platform:'douyin',mode:'live'},status:'paused',stage:'comments',selectedNoteIds:[note.id],completedNoteIds:[],logs:[{at,message:'隔离夹具：平台验证暂停'}],message:'需要本人完成验证，已保存取得的数据'});
   const synced=await context.request.get(`${origin}/api/openfind?customerId=c1`);await route.fulfill({response:synced});return;
  }
  if(body.action==='resume'){const w=JSON.parse(db.prepare("SELECT value FROM entities WHERE kind='workflows' AND id='workflow-fixture'").get().value);w.status='completed';w.completedNoteIds=[note.id];w.message='隔离夹具流程完成';put('workflows',w);const synced=await context.request.get(`${origin}/api/openfind?customerId=c1`);await route.fulfill({response:synced});return;}
  await route.continue();
 });
 const form=page.locator('[data-of-form=search]');await form.locator('[name=keyword]').fill('杭州厨房翻新');await form.locator('[name=platform]').selectOption('douyin');await form.getByRole('button',{name:'一键搜索并采集评论',exact:true}).click();
 await page.locator('.cm-discovery-card').waitFor();assert.equal(workflowRequest.customerId,'c1');assert.equal(workflowRequest.searchLimit,20);
 assert.match(await page.locator('.cm-discovery-card').textContent(),/已读评论 1/);
 await page.getByRole('button',{name:'继续流程',exact:true}).click();await page.getByText(/隔离夹具流程完成/).waitFor();
 const countBefore=await context.request.get(`${origin}/api/acquisition`);const before=(await countBefore.json()).workspace.acquisition.tasks.length;
 await page.locator('[data-of=sync]').click();const countAfter=await context.request.get(`${origin}/api/acquisition`);assert.equal((await countAfter.json()).workspace.acquisition.tasks.length,before);
 await page.getByText('定时采集',{exact:true}).click();const schedule=page.locator('[data-of-form=schedule]');await schedule.locator('[name=keyword]').fill('厨房翻新');await schedule.locator('[name=platform]').selectOption('douyin');await schedule.getByRole('button',{name:'开启定时采集'}).click();
 await page.getByRole('button',{name:'停止定时采集'}).waitFor();await page.getByRole('button',{name:'停止定时采集'}).click();
 await page.locator('.cm-discovery-card [data-cm=open-source]').click();await page.locator('#cm-prospecting').getByText('想找杭州厨房翻新，多少钱？',{exact:true}).waitFor();
 assert.match(await page.locator('#cm-prospecting').textContent(),/平台实时采集/);
 await page.getByRole('button',{name:'返回视频列表',exact:true}).click();
 await page.locator('#cm-prospecting [data-cm-business]').selectOption('c2');assert.equal(await page.locator('.cm-discovery-card').count(),0);
 await page.locator('#cm-prospecting [data-cm-business]').selectOption('c1');
 for(const theme of ['light','dark']){await page.evaluate(v=>document.documentElement.dataset.theme=v,theme);for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} ${width} overflow`);}await page.locator('.of-panel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`live-${theme}.png`)});}
 db.close();await page.getByRole('button',{name:'关闭当前业务引擎'}).click();assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'passed',flows:['authenticated private worker','one-click UI dispatch with scoped upstream-store fixture','automatic synchronization without JSON import','checkpoint resume UI','idempotent synchronization','schedule enable/disable','original comment evidence','business isolation','responsive light/dark'],previews:output},null,2));
}catch(error){if(page){console.log(await page.locator('.cm-error').allTextContents());await page.screenshot({path:path.join(output,'failure.png')});}throw error;}
finally{if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true});}
