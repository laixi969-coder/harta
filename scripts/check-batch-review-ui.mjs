// Uses an isolated business and recorded sample comments. No platform or model requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { ADMIN_EMAIL } from '../lib/auth.mjs';
import { writeWorkspace } from '../lib/workspace.mjs';
import { openScopedStore } from '../lib/scoped-store.mjs';
import { businessStoreDirectory } from '../lib/model-budget.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)), dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-ranking-ui-'));
const password='sample-only-harta-password';
const createdAt=new Date(Date.now()-3600000).toISOString(),finishedAt=new Date(Date.now()-1800000).toISOString();
let browser,server,currentPage;
try {
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  process.chdir(dir);
  writeWorkspace(ADMIN_EMAIL,{seedVersion:999,usingId:'b',customers:[{id:'b',name:'收纳工作室',pitch:'抽屉收纳',track:'存量',packs:[],drops:[]}],
    acquisition:{leads:[{id:'l',customerId:'b',platform:'抖音',authorId:'buyer',authorName:'合成联系人',signalIds:[],events:[],nextAt:'',nextStep:'',stage:'已联系',sourcePaths:['active'],messages:[{id:'sent',status:'sent_manual',direction:'outbound',channel:'评论',text:'人工联系',sentAt:finishedAt}]}]}});
  const {db}=openScopedStore(businessStoreDirectory(ADMIN_EMAIL,'b'));
  const put=(kind,value)=>db.prepare('INSERT INTO entities VALUES(?,?,?)').run(kind,value.id,JSON.stringify(value));
  const note={id:'dy:n',source:'live',platform:'douyin',author:'店家',authorId:'seller',title:'抽屉收纳',body:'可选尺寸',type:'image',tags:[],images:[],cover:'',likes:0,comments:2,saves:0,publishedAt:createdAt,url:'https://www.douyin.com/video/123456'};
  put('notes',note);
  const comments=['这个哪里买，求链接','路过支持一下'].map((body,i)=>({id:'dy:'+i,noteId:note.id,source:'live',platform:'douyin',authorId:'candidate'+i,author:'合成样本'+i,parentId:null,body,createdAt,likes:0,region:''}));
  comments.forEach(c=>put('comments',c));
  put('workflows',{id:'wf',input:{mode:'live',platform:'douyin',keyword:'收纳',searchLimit:5,maxNotes:1,commentLimit:2,supplement:false},tracksFlowRequests:true,status:'completed',stage:'done',searchIndex:1,searchJobIds:[],noteIds:[note.id],selectedNoteIds:[note.id],completedNoteIds:[note.id],commentIds:comments.map(c=>c.id),leadIds:[],logs:[],message:'检查完成',createdAt,updatedAt:finishedAt,finishedAt});
  put('requestUsage',{id:'flow:wf',api:4,model:0});db.close();
  const listener=net.createServer().listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin='http://127.0.0.1:'+port;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:password,HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('未能启动隔离服务');})]);
  const chrome=process.env.HARTA_E2E_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:800},extraHTTPHeaders:{origin}});
  assert.equal((await context.request.post(origin+'/api/login',{data:{email:ADMIN_EMAIL,password}})).status(),200);
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  await page.goto(origin);
  await page.locator('[data-nav=workbench]').first().click();
  const active=page.locator('.studio-lane-active:visible').first();
  assert.equal(await active.locator('.studio-path-result strong').textContent(),'0');
  await active.getByText('1 位有实际联系记录',{exact:false}).waitFor();
  await page.locator('[data-nav=prospecting]').click();
  await page.locator('.cm-acquisition-more summary').click();
  await page.locator('[data-acq-page=acquisition]').first().click();
  const frame=page.frameLocator('#cm-openfind iframe');
  const entry=frame.getByText('查看批次效率与抽样核对',{exact:true});
  await entry.waitFor();
  await page.setViewportSize({width:390,height:844});
  await entry.click();
  await frame.getByText('本批暂无可归入的新增有效联系人。',{exact:false}).waitFor();
  await frame.getByRole('button',{name:'抽样核对前十与排除项'}).click();
  await frame.getByText('盲核 1 / 2',{exact:true}).waitFor();
  assert.equal(await frame.getByText('导出匿名判断',{exact:true}).count(),0);
  assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  const panel=frame.getByRole('region',{name:'批次复盘'});
  const answer=async()=>{const text=await panel.locator('blockquote').first().textContent();await panel.getByRole('button',{name:text.includes('求链接')?'值得核实':'不匹配',exact:true}).click();};
  await answer();await frame.getByText('盲核 2 / 2',{exact:true}).waitFor();
  await entry.click();await entry.click();await frame.getByText('盲核 2 / 2',{exact:true}).waitFor();
  await answer();await frame.getByText('已完成盲核',{exact:false}).waitFor();
  await panel.getByText('记录整批人工核实用时').click();
  await panel.getByLabel('本批全部人工核实用时（分钟）').fill('8');
  await panel.getByRole('button',{name:'保存用时'}).click();
  await frame.getByText('人工总用时 8 分钟',{exact:false}).waitFor();
  await panel.getByText('查看判断依据与匿名导出').click();
  const downloading=page.waitForEvent('download');await panel.getByRole('button',{name:'导出匿名判断'}).click();
  const download=await downloading;assert.equal(download.suggestedFilename(),'harta-qrels.txt');
  const exported=fs.readFileSync(await download.path(),'utf8');assert.match(exported,/^[a-f0-9-]+ 0 [a-f0-9-]+ [01]/);assert.doesNotMatch(exported,/收纳|求链接|dy:/);
  const handoff=page.waitForResponse(r=>r.url().endsWith('/harta/handoff'));
  await panel.getByRole('button',{name:'打开这条需求'}).first().click();
  const handed=await handoff;assert.equal(handed.status(),200);const target=await handed.json();
  assert.ok(target.workId && target.signalId);await page.getByText('这个哪里买，求链接',{exact:true}).first().waitFor({state:'attached'});
  assert.deepEqual(errors,[]);
  console.log('通过：桌面首页核实与实际联系、从主动获客进入真实批次、390px 盲核与恢复、耗时保存、匿名导出。');
} catch(error) {
  console.error((await currentPage?.locator('body').innerText())?.slice(0,1100));throw error;
} finally {
  await browser?.close();if(server && server.exitCode==null){const closed=once(server,'exit');server.kill('SIGTERM');await closed;}
  process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});
}
