// Opt-in paid UI acceptance. An isolated server and synthetic workspace use the
// configured image provider; the normal shared spend ledger records the call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { publicImageConfig } from '../lib/image-generation.mjs';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),require=createRequire(root+'/package.json'),{chromium}=require('playwright-core');
const config=publicImageConfig();if(!config.baseUrl || !config.model || !config.hasKey)throw new Error('请先配置出图接口、模型和密钥');
const spendFile=path.join(root,'data','model-spend.sqlite');if(!fs.existsSync(spendFile))throw new Error('找不到费用账本，不能执行真实出图验收');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-image-live-ui-'));let proc,browser;
try {
  for(const name of ['js','css','images','fonts'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
  fs.copyFileSync(path.join(root,'index.html'),path.join(dir,'index.html'));fs.writeFileSync(path.join(dir,'login.html'),'<!doctype html><title>Test</title>');
  fs.mkdirSync(path.join(dir,'data'),{mode:0o700});
  for(const name of ['.model-key','image-model.json'])fs.copyFileSync(path.join(root,'data',name),path.join(dir,'data',name));
  fs.symlinkSync(spendFile,path.join(dir,'data','model-spend.sqlite'));
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  proc=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_PUBLIC_ORIGIN:'',HARTA_SETUP_PASSWORD:'synthetic-fixture-password'},stdio:['ignore','pipe','pipe']});
  proc.stdout.resume();proc.stderr.resume();await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('测试服务未启动');})]);
  const origin=`http://127.0.0.1:${port}`,login=await fetch(origin+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'66445039@qq.com',password:'synthetic-fixture-password'})});
  if(!login.ok)throw Error('测试账号登录失败');const cookie=login.headers.get('set-cookie').split(';')[0];
  process.chdir(dir);const {writeWorkspace,readWorkspace}=await import('../lib/workspace.mjs');
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'synthetic',name:'合成厨房示例',hunt:'厨房规划',drops:[{id:'cover-pack',tier:'今日',title:'合成封面测试',origin:{mode:'manual'},copies:{},shells:{小红书:[{title:'厨房先量尺寸',body:'这是合成测试内容。',cover:'厨房先量尺寸',coverLayout:'温暖明亮的厨房'}]}}]}]});
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,executablePath:process.env.HARTA_E2E_CHROME || (fs.existsSync(chrome)?chrome:chromium.executablePath())});
  const context=await browser.newContext({acceptDownloads:true});await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin}]);const page=await context.newPage();
  await page.goto(origin+'/');await page.locator('[data-nav=content-home]').click();
  await page.locator('#cm-content-home article').filter({hasText:'合成封面测试'}).getByRole('button',{name:'查看与制作'}).click();
  const box=page.locator('[data-growth-pack=cover-pack][data-growth-platform=小红书]').first();await box.getByText('脚本、直播与封面制作',{exact:true}).click();
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/production-draft')&&r.request().method()==='POST');await box.locator('[data-growth-action=production-save]').click();if(!(await saved).ok())throw Error('制作草稿保存失败');
  await page.waitForFunction(()=>document.querySelector('[data-growth-pack="cover-pack"] [data-growth-action="production-save"]')?.dataset.version==='1');
  const details=box.locator('details').first();if(!(await details.evaluate(el=>el.open)))await details.locator('summary').first().click();
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/production-cover')&&r.request().method()==='POST',{timeout:150000}),box.locator('[data-growth-action=cover-ai]').click()]);
  if(!response.ok())throw Error(`真实封面请求失败：HTTP ${response.status()}`);
  await page.locator('[data-growth-pack=cover-pack] [data-ai-cover-preview]:visible').waitFor({timeout:30000});
  const assetResponse=page.waitForResponse(r=>r.url().endsWith('/api/production-assets')&&r.request().method()==='POST');await page.locator('[data-growth-pack=cover-pack] [data-growth-action=assets-save]').first().click();if(!(await assetResponse).ok())throw Error('封面素材保存失败');
  const pack=readWorkspace('66445039@qq.com').customers[0].drops[0],bundle=pack.productionAssets?.['小红书|0'];if(!bundle?.images?.some(i=>i.name==='cover.png'))throw Error('封面没有进入素材包');
  const url=new URL('/api/production-assets',origin);for(const [key,value] of Object.entries({customerId:'synthetic',packId:'cover-pack',platform:'小红书',index:'0',bundleId:bundle.id,name:'cover.png'}))url.searchParams.set(key,value);
  const asset=await context.request.get(url.href);if(!asset.ok() || (await asset.body()).subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('保存后的封面无法读取');
  process.stdout.write('真实百炼出图、浏览器叠字、保存素材包及读取 PNG 均通过。\n');
} finally {
  if(browser)await browser.close();if(proc && proc.exitCode===null && proc.signalCode===null){proc.kill('SIGTERM');await Promise.race([once(proc,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);if(proc.exitCode===null && proc.signalCode===null)proc.kill('SIGKILL');}
  process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});
}
