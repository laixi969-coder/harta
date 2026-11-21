// Real HTTP and browser events in an isolated workspace. Only the model reply is a fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {ADMIN_EMAIL} from '../lib/auth.mjs';
import {writeWorkspace,readWorkspace} from '../lib/workspace.mjs';
import {prepareKeywordBatch} from '../lib/keyword-library.mjs';
import {saveProvider,addModel,setModelEnabled,useModel,setActive} from '../lib/llm.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-creative-ui-')),original=process.cwd();
let server,model,browser,page;
try {
  for(const name of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
  const realBatch=process.env.HARTA_ACCEPTANCE_KEYWORDS?JSON.parse(fs.readFileSync(process.env.HARTA_ACCEPTANCE_KEYWORDS,'utf8')):null;
  process.chdir(dir);
  fs.writeFileSync('选型.csv','关键词,品类\n收纳盒怎么选,厨房');
  const imported=await prepareKeywordBatch([{name:'选型.csv',path:'选型.csv'}],{type:'产品品类',name:'厨房'},{modelReady:false});
  const library=realBatch?[realBatch,imported]:[imported];
  const products=['矮盒','高盒'].map((name,i)=>({id:'box'+i,name,customerId:'kitchen',source:name+'参数.pdf',facts:'容量：'+(i?'1.8':'1.0')+'升\n高度：'+(i?12:7)+'厘米',status:'active',revision:1}));
  writeWorkspace(ADMIN_EMAIL,{seedVersion:999,usingId:'kitchen',customers:[{id:'kitchen',name:'厨房验收',hunt:'厨房收纳',track:'存量',keywordLibraries:library,drops:[{id:'old',tier:'今日',origin:{mode:'manual'},copies:{},shells:{小红书:[{title:'旧稿',body:'先想想。再看看。'}]}}]}],acquisition:{products,skus:[]}});
  model=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;const prompt=JSON.parse(raw).messages.at(-1).content;
    assert.ok(prompt.includes('replacement')&&prompt.includes('先想想'));
    const issues=[['先想想','打开柜门'],['再看看','找到层板']].map(([quote,replacement])=>({field:'script',quote,replacement,reason:'需要一个可见动作',suggestion:'交代手部动作'}));
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({issues})}}]}));
  }).listen(0,'127.0.0.1');await once(model,'listening');
  saveProvider('custom',{baseUrl:'http://127.0.0.1:'+model.address().port+'/v1',apiKey:'local-fixture'});addModel('custom','review-fixture');setModelEnabled('custom','review-fixture',true);useModel('custom','review-fixture');setActive('custom');
  const portProbe=http.createServer().listen(0,'127.0.0.1');await once(portProbe,'listening');const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
  const origin='http://127.0.0.1:'+port,password='local-creative-acceptance';
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:password,HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('服务未启动');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const context=await browser.newContext({extraHTTPHeaders:{origin},viewport:{width:1280,height:832}});
  assert.equal((await context.request.post(origin+'/api/login',{data:{email:ADMIN_EMAIL,password}})).status(),200);
  page=await context.newPage();page.setDefaultTimeout(18000);page.setDefaultNavigationTimeout(60000);await page.route('https://**/*',r=>r.abort());const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('response',r=>{if(r.status()>=400 && r.url().startsWith(origin))console.error(r.status(),new URL(r.url()).pathname);});
  let next=0;await page.route('**/api/**',async route=>{const now=Date.now(),delay=Math.max(0,next-now);next=Math.max(next,now)+240;if(delay)await new Promise(r=>setTimeout(r,delay));await route.fallback();});
  const openLibrary=async()=>{await page.locator('[data-nav=content-home]').click();await page.getByRole('button',{name:'查看与制作',exact:true}).first().click();};
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();await openLibrary();
  const editor=page.locator('[data-production-mode]').first(),delivery=()=>editor.locator('[data-production-tab=delivery]').click();
  await delivery();await editor.getByRole('button',{name:'AI 内容诊断'}).click();
  const take=editor.getByRole('button',{name:'采用到草稿'}),undo=editor.getByRole('button',{name:'撤回此处'});
  await take.first().waitFor();assert.equal(await take.count(),2);
  let notifySaved,release;const savedOnServer=new Promise(r=>{notifySaved=r;}),allowReply=new Promise(r=>{release=r;});
  await page.route('**/api/production-craft-edit',async route=>{
    const response=await route.fetch();notifySaved();await allowReply;await route.fulfill({response});
  },{times:1});
  await take.last().click();await savedOnServer;
  await editor.locator('[data-production-tab=script]').click();const script=editor.locator('[name=production-script]');
  await script.fill('先想想。再看看。同步旁注');release();
  await page.waitForFunction(()=>document.querySelector('[name=production-script]')?.value==='先想想。找到层板。同步旁注');
  await script.fill('先想想。找到层板。');await delivery();await undo.waitFor();await take.click();
  await page.waitForFunction(()=>document.querySelector('[name=production-script]')?.value==='打开柜门。找到层板。');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();await openLibrary();await delivery();assert.equal(await undo.count(),2);
  await undo.first().click();await page.waitForFunction(()=>document.querySelector('[name=production-script]')?.value==='先想想。找到层板。');
  await editor.locator('[data-production-tab=script]').click();await editor.locator('[name=production-script]').fill('旁注。先想想。找到层板。');await delivery();await undo.click();
  await page.waitForFunction(()=>document.querySelector('[name=production-script]')?.value==='旁注。先想想。再看看。');
  await page.setViewportSize({width:390,height:844});
  const terms=[...(realBatch?['厨房收纳盒']:[]),'收纳盒怎么选'];
  for(const term of terms){
    await page.locator('[data-cm=compare-from-keywords]').click();await page.locator('#keyword-filter').fill(term);
    const table=page.locator('#keyword-library-list tr').filter({has:page.getByRole('rowheader',{name:term,exact:true})});
    await table.getByRole('button',{name:'做选型对照'}).click();
    const dialog=page.getByRole('dialog');await dialog.locator('[data-pair]').first().waitFor();assert.equal(await dialog.locator('[data-pair]:checked').count(),2);
    assert.ok(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));
    await dialog.locator('[data-pairs] summary').first().click();assert.ok(await dialog.getByText('容量：1.0升',{exact:true}).isVisible());
    await dialog.getByRole('button',{name:'生成对照稿'}).click();
    await page.waitForFunction(term=>document.querySelector('[name=production-title]')?.value.includes(term),term);
    const citations=page.locator('.comparison-evidence').first();await citations.locator('summary').first().click();
    await citations.getByText('高度',{exact:true}).click();assert.ok(await citations.getByText('高度：12厘米',{exact:true}).isVisible());
    await delivery();const downloading=page.waitForEvent('download');await editor.getByRole('button',{name:'下载脚本',exact:true}).click();const download=await downloading;
    const exported=fs.readFileSync(await download.path(),'utf8');assert.ok(exported.includes('矮盒参数.pdf')&&exported.includes('高盒参数.pdf')&&exported.includes(term));
  }
  const height=page.locator('.comparison-evidence details').filter({has:page.getByText('高度',{exact:true})});
  await height.getByRole('button',{name:'打开资料原文'}).last().click();
  const facts=page.locator('#cm-products form[data-cm-form=product][data-id=box1] [name=facts]');await facts.waitFor();
  assert.equal(await facts.evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),'高度：12厘米');
  assert.equal(readWorkspace(ADMIN_EMAIL).customers[0].drops.length,1+terms.length);assert.deepEqual(errors,[]);
  console.log('PASS 逐条采用、刷新、撤回、手写旁注、手机词库选型、逐项来源与脚本下载',terms.join(' / '));
} catch(error) {
  if(page)console.error(await page.locator('body').innerText().then(t=>t.slice(-1100)).catch(()=>''));
  throw error;
} finally {
  await browser?.close();server?.kill();model?.close();process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});
}
