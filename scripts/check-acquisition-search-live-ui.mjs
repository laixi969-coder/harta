// Read-only public search acceptance with an isolated synthetic business.
// The search returns snippets, not verified platform comments or contacts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readResearchConfig} from '../lib/research.mjs';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),require=createRequire(root+'/package.json'),{chromium}=require('playwright-core');
const searchUrl=readResearchConfig().searxngUrl;if(!searchUrl)throw new Error('请先配置公开搜索数据源');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-search-live-ui-'));let proc,browser;
try {
  for(const name of ['js','css','images','fonts'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
  fs.copyFileSync(path.join(root,'index.html'),path.join(dir,'index.html'));fs.writeFileSync(path.join(dir,'login.html'),'<!doctype html><title>Test</title>');
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  proc=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_PUBLIC_ORIGIN:'',HARTA_SETUP_PASSWORD:'synthetic-search-fixture',HARTA_SEARXNG_URL:searchUrl,HARTA_BRAVE_API_KEY:''},stdio:['ignore','pipe','pipe']});
  proc.stdout.resume();proc.stderr.resume();await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('测试服务未启动');})]);
  const origin=`http://127.0.0.1:${port}`,login=await fetch(origin+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'66445039@qq.com',password:'synthetic-search-fixture'})});
  if(!login.ok)throw Error('测试登录失败');const cookie=login.headers.get('set-cookie').split(';')[0];
  process.chdir(dir);const {writeWorkspace,readWorkspace}=await import('../lib/workspace.mjs');
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'synthetic',name:'合成厨房业务',hunt:'厨房收纳',pitch:'合成样例，仅用于搜索验收',drops:[]}],ledger:[],feedback:{},contentStates:{}});
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:process.env.HARTA_E2E_CHROME || (fs.existsSync(chrome)?chrome:chromium.executablePath())});
  const context=await browser.newContext();await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin}]);const page=await context.newPage();
  await page.goto(origin+'/');await page.locator('[data-nav=prospecting]').click();await page.locator('#cm-openfind [data-cm=public-search]').click();
  const search=page.locator('[data-acq-form=search]');await search.locator('summary').filter({hasText:'更多搜索设置'}).click();await search.locator('[name=query]').fill('厨房收纳');await search.locator('[name=platform]').selectOption('both');
  const started=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/search')&&r.request().method()==='POST');await search.getByRole('button',{name:'开始查找需求'}).click();if(!(await started).ok())throw Error('搜索任务未启动');
  let task;const deadline=Date.now()+60000;while(Date.now()<deadline){task=readWorkspace('66445039@qq.com').acquisition.tasks.at(-1);if(task && task.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,400));}
  if(!task || task.status==='running')throw Error('搜索任务尚未完成');
  const state=readWorkspace('66445039@qq.com').acquisition;if(state.leads.length)throw Error('搜索摘要不应自动创建联系人');
  if(task.results.length!==2 || state.signals.some(s=>s.sourceType!=='search_summary' || s.status!=='pending'))throw Error('平台结果或待核实状态不正确');
  const summary=task.results.map(r=>({platform:r.platform,status:r.status,added:r.coverage?.added??null,warning:!!r.warning,provider:r.provider}));
  await page.locator('[data-persist=tasks] > summary').click();await page.locator('.acq-task').first().getByRole('button',{name:'查看任务详情'}).click();await page.getByText('搜索摘要，未读取站内评论',{exact:false}).first().waitFor({timeout:20000});
  process.stdout.write(JSON.stringify({result:task.status,platforms:summary,snippets:state.signals.length,contacts:state.leads.length})+'\n');
} finally {
  if(browser)await browser.close();if(proc && proc.exitCode===null && proc.signalCode===null){proc.kill('SIGTERM');await Promise.race([once(proc,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);if(proc.exitCode===null && proc.signalCode===null)proc.kill('SIGKILL');}
  process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});
}
