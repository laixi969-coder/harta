import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),require=createRequire(root+'/package.json'),{chromium}=require('playwright-core');
const bounded=(promise,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${label} timeout`)),20000);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-stop-e2e-'));
for(const name of ['js','css','images','fonts'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
fs.copyFileSync(path.join(root,'index.html'),path.join(dir,'index.html'));fs.writeFileSync(path.join(dir,'login.html'),'<!doctype html><title>Test</title>');
let requestArrived,connectionClosed,calls=0;
const started=new Promise(resolve=>{requestArrived=resolve;}),closed=new Promise(resolve=>{connectionClosed=resolve;});
const mock=http.createServer((req,res)=>{calls++;if(calls===1){requestArrived();res.on('close',()=>{if(!res.writableEnded)connectionClosed();});return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({results:[{title:'外站结果',content:'搜索范围错误',url:'https://example.com/unrelated'},{title:'厨房问题',content:'请问厨房收纳怎么规划',url:'https://www.xiaohongshu.com/explore/real123'}],unresponsive_engines:[]}));});
mock.listen(0,'127.0.0.1');await once(mock,'listening');
const mockUrl=`http://127.0.0.1:${mock.address().port}`;
const portServer=http.createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
const proc=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_PUBLIC_ORIGIN:'',HARTA_SETUP_PASSWORD:'test-password-12345',HARTA_SEARXNG_URL:mockUrl,HARTA_BRAVE_API_KEY:''},stdio:['ignore','pipe','pipe']});
const exited=once(proc,'exit');proc.stdout.resume();proc.stderr.resume();let browser;
try{
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('server exited');})]);
  const origin=`http://127.0.0.1:${port}`,login=await fetch(origin+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'66445039@qq.com',password:'test-password-12345'})});if(!login.ok)throw Error('login failed');
  const cookie=login.headers.get('set-cookie').split(';')[0];process.chdir(dir);const {writeWorkspace,readWorkspace}=await import(root+'/lib/workspace.mjs');
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'测试业务',hunt:'厨房规划',pitch:'厨房规划服务',drops:[]}],ledger:[],feedback:{},contentStates:{}});
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:process.env.HARTA_E2E_CHROME || (fs.existsSync(chrome)?chrome:chromium.executablePath())});
  const context=await bounded(browser.newContext(),'browser context');await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin}]);const page=await context.newPage();
  await page.goto(origin+'/');await page.locator('[data-nav=prospecting]').click();await page.locator('#cm-openfind summary').filter({hasText:'更多操作'}).click();await page.getByRole('button',{name:'历史资料与目标账号'}).click();await page.locator('[data-cm=search]:visible').first().click();
  const search=page.locator('[data-acq-form=search]');await search.locator('summary').filter({hasText:'更多搜索设置'}).click();await search.locator('[name=query]').fill('厨房规划');await search.locator('[name=platform]').selectOption('小红书');await search.getByRole('button',{name:'开始查找需求'}).click();await bounded(started,'search request');
  await page.getByRole('button',{name:'查看进度'}).click();await page.getByRole('button',{name:'停止任务'}).click();await bounded(closed,'cancelled upstream request');
  const task=readWorkspace('66445039@qq.com').acquisition.tasks.at(-1);if(task.status!=='stopped'||calls!==1||readWorkspace('66445039@qq.com').acquisition.signals.length)throw Error('stop did not preserve task state');
  await page.getByText('已停止',{exact:true}).first().waitFor();await page.getByRole('button',{name:'返回需求机会'}).click();const again=page.locator('[data-acq-form=search]');await again.locator('summary').filter({hasText:'更多搜索设置'}).click();await again.locator('[name=query]').fill('厨房收纳');await again.locator('[name=platform]').selectOption('小红书');await again.getByRole('button',{name:'开始查找需求'}).click();await page.locator('[data-persist=tasks] > summary').click();await page.getByText(/1 条搜索结果不属于所选平台或缺少有效链接/).first().waitFor({timeout:20000});const second=readWorkspace('66445039@qq.com').acquisition.tasks.at(-1);if(second.status!=='partial'||second.results[0].coverage.added!==1||readWorkspace('66445039@qq.com').acquisition.signals.length!==1)throw Error('partial platform results were misreported');await page.locator('[data-nav=prospecting]').click();await page.locator('#cm-openfind [data-cm=import-needs]').click();const manual=page.locator('[data-acq-form=single-signal]');await manual.waitFor();await manual.locator('[name=platform]').selectOption('小红书');await manual.locator('[name=text]').fill('请问厨房收纳可以怎么规划？');await manual.locator('[name=url]').fill('https://www.xiaohongshu.com/explore/manual123');await manual.locator('[name=source]').fill('人工查看公开评论');const saved=page.waitForResponse(response=>response.url().endsWith('/api/acquisition/import'));await manual.getByRole('button',{name:'保存需求证据'}).click();if(!(await saved).ok())throw Error('manual evidence failed');const evidence=page.locator('.acq-signal').filter({hasText:'请问厨房收纳可以怎么规划？'}).first();await evidence.waitFor();if(readWorkspace('66445039@qq.com').acquisition.leads.length)throw Error('manual evidence created a lead before review');await evidence.locator('summary').filter({hasText:'核实或排除'}).click();await evidence.locator('[name=note]').fill('已回看原评论，服务地区仍待确认');const reviewed=page.waitForResponse(response=>response.url().endsWith('/api/acquisition/review'));await evidence.getByRole('button',{name:'确认值得跟进'}).click();if(!(await reviewed).ok())throw Error('manual evidence review failed');const contact=readWorkspace('66445039@qq.com').acquisition.leads[0];if(!contact?.sourcePaths.includes('active')||contact.signalIds.length!==1)throw Error('reviewed evidence did not reach active leads');console.log('PASS: stopped search cancels transport; mixed-source results disclose coverage; manually entered evidence requires review before becoming an active lead');
}finally{
  if(browser)await browser.close();if(proc.exitCode===null&&proc.signalCode===null){proc.kill();const timer=setTimeout(()=>proc.kill('SIGKILL'),5000);await exited.catch(()=>{});clearTimeout(timer);}mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});
}
