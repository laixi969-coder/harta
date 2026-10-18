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
import { readWorkspace, writeWorkspace } from '../lib/workspace.mjs';
const { chromium } = await import(process.env.HARTA_PLAYWRIGHT_MODULE || 'playwright-core');
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-openfind-browser-'));
const output=process.env.HARTA_UI_OUTPUT || path.join(os.tmpdir(),'harta-openfind-previews');fs.mkdirSync(output,{recursive:true});
let server,browser,currentPage;
try {
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'浏览器验收业务',hunt:'家装',city:'杭州',pitch:'厨房翻新',salesMaterial:'仅提供杭州地区的厨房翻新服务。',track:'存量',stage:'cooperating',packs:[],drops:[{id:'p1',tier:'今日',title:'厨房翻新需求',date:'2026-10-08',battlefields:['小红书'],copies:{},shells:{小红书:[{title:'厨房翻新先问什么',cover:'先核对使用需求',body:'厨房翻新前，先记录日常做饭习惯和收纳需求，再与服务方核对可改动范围、施工安排和报价项目。不要只比较一个总价。'}]},origin:{mode:'organic',goal:'leads'},execution:[]}]}],ledger:[],contentStates:{},feedback:{},usingId:'c1'});
  const seeded=readWorkspace('66445039@qq.com');seeded.customers.push({id:'c2',name:'第二个验收业务',hunt:'家装',city:'上海',pitch:'整体设计',track:'',stage:'cooperating',packs:[],drops:[]});writeWorkspace('66445039@qq.com',seeded);
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
  await page.goto(origin);await page.locator('#cm-workbench h1').waitFor();
  assert.equal(await page.locator('[data-view=workbench]').isVisible(),true);
  await page.screenshot({path:path.join(output,'workbench-desktop.png'),fullPage:true});

  await page.locator('[data-nav=prospecting]').click();
  await page.getByText('导入 OpenFind 作品与评论',{exact:true}).click();
  const intake=page.locator('[data-cm-form=openfind-import]');
  const fixture={notes:[{id:'dy:123',nativeId:'123',platform:'douyin',source:'live',url:'https://www.douyin.com/video/123',title:'厨房翻新需要先问什么',body:'先明确自己的需求与使用场景',author:'公开作者',authorId:'MS4author',type:'video',likes:100,comments:8,saves:20,publishedAt:new Date(Date.now()-86400000).toISOString()}],comments:[{id:'dy:c1',noteId:'dy:123',platform:'douyin',source:'live',author:'装修咨询者',authorId:'MS4buyer',body:'想找杭州厨房翻新，怎么收费？',createdAt:new Date(Date.now()-3600000).toISOString(),parentId:null,region:'浙江'},{id:'dy:c2',noteId:'dy:123',platform:'douyin',source:'live',author:'公开作者',authorId:'MS4author',body:'先确认你的需求',createdAt:new Date(Date.now()-1800000).toISOString(),parentId:'dy:c1'}]};
  await intake.locator('[name=kind]').selectOption('snapshot');
  await intake.locator('[name=file]').setInputFiles({name:'openfind-snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await intake.locator('[name=source]').fill('隔离验收导出');
  await intake.locator('[type=submit]').click();
  await page.locator('.cm-discovery-card').waitFor();
  assert.match(await page.locator('.cm-import-result').textContent(),/新增 1 条作品、2 条评论/);
  assert.match(await page.locator('.cm-discovery-card').textContent(),/近期需求表达 1/);
  const filter=page.locator('[data-cm-form=discovery-filter]');
  await filter.locator('[name=sort]').selectOption('demand');await filter.locator('[type=submit]').click();
  assert.equal(await page.locator('.cm-discovery-card').count(),1);
  await page.locator('.cm-discovery-card [data-cm=reference-work]').click();
  const generate=page.locator('#cm-content-scope [data-cm-form=generate]');
  await generate.waitFor({state:'visible'});
  assert.equal(await generate.locator('[name=referenceWorkIds]').isChecked(),true);
  let generationBody;
  await page.route('**/api/today',async route=>{generationBody=route.request().postDataJSON();await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'验收：已收到创作请求，未调用模型'})});});
  await generate.locator('[type=submit]').click();
  await generate.locator('.cm-error').filter({hasText:'未调用模型'}).waitFor();
  assert.equal(generationBody.referenceWorkIds.length,1);
  assert.equal(generationBody.customerId,'c1');
  await page.screenshot({path:path.join(output,'reference-content.png'),fullPage:true});
  await page.locator('[data-nav=prospecting]').click();
  await page.locator('.cm-discovery-card [data-cm=open-source]').click();
  await page.locator('.cm-reply').waitFor();
  const buyer=page.locator('.cm-comment').filter({has:page.locator('[data-cm-form=review]')}).first();
  await buyer.locator('summary').first().click();
  const review=buyer.locator('[data-cm-form=review]').first();
  await review.locator('[name=note]').fill('核对原评论，服务范围吻合');await review.locator('[type=submit]').click();
  await page.getByRole('button',{name:'查看跟进',exact:true}).click();
  await page.getByRole('heading',{name:'客户跟进',exact:true}).waitFor();
  assert.ok((await page.locator('#cm-conversations').textContent()).includes('装修咨询者'));
  await page.locator('[data-nav=prospecting]').click();
  await page.getByRole('button',{name:'返回视频列表',exact:true}).click();
  // Same import is idempotent; a different business has no references or comments.
  const repeated=await context.request.post(`${origin}/api/acquisition/openfind-import`,{data:{customerId:'c1',source:'重复验收',kind:'snapshot',data:fixture}});
  assert.equal(repeated.status(),200);
  const saved=(await repeated.json()).workspace.acquisition;
  assert.equal(saved.works.length,1);assert.equal(saved.leads.length,1);assert.equal(saved.signals.length,2);
  assert.equal(saved.tasks.at(-1).importReport.commentsDuplicate,2);
  await page.locator('#cm-prospecting [data-cm-business]').selectOption('c2');
  assert.equal(await page.locator('.cm-discovery-card').count(),0);
  await page.locator('#cm-prospecting [data-cm-business]').selectOption('c1');
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const width of [320,375,768,1440]){
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} ${width}px overflow`);
    }
    await page.locator('.cm-discovery').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`discovery-${theme}.png`),fullPage:false});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'passed',flows:['OpenFind JSON file import','recent demand filter','reference to content generation payload','nested comment verification to existing customer followup','idempotent import','business isolation','responsive light/dark'],previews:output},null,2));
} catch(error) { if(currentPage){console.log('Visible errors',await currentPage.locator('.cm-error,.acq-error').allTextContents());await currentPage.screenshot({path:path.join(output,'failure.png'),fullPage:true});}throw error; } finally { if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
