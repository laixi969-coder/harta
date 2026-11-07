// Isolated acceptance of the public hero, login and production entry navigation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {writeWorkspace} from '../lib/workspace.mjs';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-design-ui-'));
const output=path.join(root,'output/axon-ui');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
async function contrastCheck(page,label){
  const results=await page.evaluate(()=>{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=canvas.height=1;
    const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x);};
    const lum=color=>color.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('#cm-content-home h1,#content-library h2,#content-library .meta,.cm-content-toolbar .btn,.cm-content-tabs [role=tab],#mast-date')].filter(el=>el.getClientRects().length).map(el=>{
      const layers=[];let parent=el;while(parent){layers.unshift(rgba(getComputedStyle(parent).backgroundColor));parent=parent.parentElement;}
      const bg=layers.reduce((under,c)=>c.slice(0,3).map((v,i)=>v*c[3]+under[i]*(1-c[3])),[255,255,255]);
      const color=rgba(getComputedStyle(el).color),ink=color.slice(0,3).map((v,i)=>v*color[3]+bg[i]*(1-color[3]));
      const a=lum(ink),b=lum(bg);return {text:el.textContent.trim().slice(0,25),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  });
  assert.ok(results.length>5);assert.deepEqual(results.filter(r=>r.ratio<4.5),[],label+' visible text contrast');
}

try{
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'ui-business',name:'厨房设计 · 界面验收',hunt:'家装',city:'杭州',pitch:'厨房设计与翻新',salesMaterial:'提供厨房设计和收纳建议。',track:'存量',stage:'cooperating',packs:[],drops:[{id:'ui-pack',tier:'今日',title:'厨房翻新，从需求开始',date:'2026-10-31',battlefields:['小红书'],copies:{},shells:{小红书:[{title:'厨房翻新先问什么',cover:'先核对使用需求',body:'先记录做饭习惯、收纳需求与预算，再与服务方核对方案。'}]},origin:{mode:'organic',goal:'leads'},execution:[]}]}],ledger:[],contentStates:{},feedback:{},usingId:'ui-business'});
  process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'isolated-design-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server exited');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...fs.existsSync(chrome)?{executablePath:chrome}:{}});
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let mediaRequests=0;page.on('request',r=>{if(r.url().endsWith('.mp4'))mediaRequests++;});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:/让好内容/ }).waitFor();
  assert.equal(await page.locator('video[src]').count(),0,'Reduced motion must not load video');
  assert.equal(mediaRequests,0);
  await page.screenshot({path:path.join(output,'landing-desktop.png')});
  await page.locator('.landing-cta').click();
  await page.waitForFunction(()=>document.activeElement===document.querySelector('#email'));
  await page.locator('#email').fill('66445039@qq.com');await page.locator('#password').fill('isolated-design-password');
  await page.getByRole('button',{name:'显示密码'}).click();assert.equal(await page.locator('#password').getAttribute('type'),'text');
  await page.getByRole('button',{name:'隐藏密码'}).click();
  await page.route('**/api/login',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'验收：密码不正确'})}));
  await page.getByRole('button',{name:'进入',exact:true}).click();await page.getByRole('alert').filter({hasText:'验收：密码不正确'}).waitFor();
  assert.equal(await page.locator('#password').evaluate(el=>el===document.activeElement),true);
  await page.unroute('**/api/login');
  await page.getByRole('button',{name:'进入',exact:true}).click();
  await page.locator('#cm-workbench h1').waitFor();
  await page.locator('[data-nav=content-home]').click();
  const library=page.locator('#content-library');await library.getByRole('heading',{name:'内容库',exact:true}).waitFor();
  assert.ok((await library.boundingBox()).y<700,'Library entry should be visible in the first desktop viewport');
  await contrastCheck(page,'light');await page.screenshot({path:path.join(output,'content-desktop.png')});
  const tabs=page.getByRole('tablist',{name:'内容工作区'});
  for(const [name,id] of [['排期与直播','schedule'],['账号复盘','review'],['选题与雷达','ideas'],['内容库','library']]){
    await tabs.getByRole('tab',{name,exact:true}).click();assert.equal(await page.locator('#content-panel-'+id).isVisible(),true);assert.equal(await page.locator('#cm-content-home [role=tabpanel]:visible').count(),1);
  }
  await tabs.getByRole('tab',{name:'选题与雷达',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await tabs.getByRole('tab',{name:'内容库',exact:true}).click();assert.ok((await library.boundingBox()).y>=0,'Switching away from a scrolled task returns to the beginning');
  await tabs.getByRole('tab',{name:'内容库',exact:true}).press('ArrowRight');assert.equal(await page.locator('#content-tab-schedule').getAttribute('aria-selected'),'true');
  await page.locator('#content-tab-schedule').press('Home');assert.equal(await page.locator('#content-tab-library').getAttribute('aria-selected'),'true');
  await page.locator('#content-production > summary').click();await page.locator('[data-cm-form=production-create] [name=title]').fill('未保存的脚本主题');
  await tabs.getByRole('tab',{name:'账号复盘',exact:true}).click();await tabs.getByRole('tab',{name:'内容库',exact:true}).click();
  assert.equal(await page.locator('[data-cm-form=production-create] [name=title]').inputValue(),'未保存的脚本主题','Switching tasks must preserve unsaved inputs');
  await library.getByRole('button',{name:'查看与制作'}).click();await page.getByText('脚本、直播与封面制作',{exact:true}).first().waitFor();
  await page.locator('[data-nav=content-home]').click();
  await page.getByRole('button',{name:'创作新内容',exact:true}).click();
  await page.locator('#cm-content-scope [data-cm-form=generate]').waitFor({state:'visible'});
  assert.equal(await page.locator('#cm-content-scope [data-cm-form=generate] select').first().evaluate(el=>el===document.activeElement),true);
  await page.locator('#cm-content-scope [name=creationEntry]').selectOption('feed');
  await page.locator('#cm-content-scope [name=distributionIntent]').selectOption('mixed');
  assert.equal(await page.locator('#cm-content-scope [name=creationEntry]').inputValue(),'feed');
  assert.equal(await page.locator('#cm-content-scope [name=distributionIntent]').inputValue(),'mixed');
  const priorWorkspace=await (await context.request.get(origin+'/api/workspace')).json();let intentRequest;
  await page.route('**/api/today',async route=>{intentRequest=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(priorWorkspace)});});
  const intentSubmitted=page.waitForResponse(r=>r.url().endsWith('/api/today'));
  await page.locator('#cm-content-scope [data-cm-form=generate] button[type=submit]').click();await intentSubmitted;
  assert.equal(intentRequest.creationEntry,'feed');assert.equal(intentRequest.distributionIntent,'mixed');
  await page.waitForFunction(()=>!document.querySelector('#cm-content-scope [data-cm-form=generate]')?.dataset.busy);
  await page.unroute('**/api/today');

  await page.locator('[data-nav=content-home]').click();
  await page.setViewportSize({width:390,height:844});
  await tabs.getByRole('tab',{name:'排期与直播',exact:true}).click();assert.equal(await page.locator('#content-live').isVisible(),true);await tabs.getByRole('tab',{name:'内容库',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile content must not overflow');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'content-mobile.png')});
  await page.locator('[data-theme-toggle]').click();await contrastCheck(page,'dark');await page.screenshot({path:path.join(output,'content-mobile-dark.png')});
  await page.locator('#mobile-menu-toggle').click();await page.locator('#harta-navigation [data-nav=workbench]').click();
  await page.locator('#cm-workbench h1').waitFor();assert.equal(await page.locator('#harta-navigation').evaluate(el=>el.open),false);
  await page.goto(origin+'/login.html',{waitUntil:'domcontentloaded'});
  await page.screenshot({path:path.join(output,'landing-mobile.png')});
  await page.locator('.landing-cta').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'login-mobile.png')});
  await page.getByRole('link',{name:'返回首页'}).click();
  assert.equal(await page.locator('.landscape-toggle').isDisabled(),true);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'播放背景动效',exact:true}).click();
  assert.equal(await page.locator('.landscape-toggle').getAttribute('aria-pressed'),'false');
  await page.getByRole('button',{name:'暂停背景动效',exact:true}).click();
  assert.equal(await page.locator('.landscape-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.landing-cta').isVisible(),true);
  await page.goto(origin+'/register.html',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'注册账号',exact:true}).waitFor();
  await page.locator('#email').fill('design-registration@example.invalid');
  await page.locator('#activation-code').fill('invalid-isolated-code');
  await page.locator('#password').fill('isolated-design-password');
  await page.locator('#password2').fill('different-design-password');
  await page.getByRole('button',{name:'完成注册'}).click();await page.getByRole('alert').filter({hasText:'两次密码不一致'}).waitFor();
  assert.equal(await page.locator('#password2').evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'register-mobile.png')});
  await page.getByRole('link',{name:'返回登录'}).click();await page.locator('#email').waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['reduced motion','login focus and error recovery','password visibility','real isolated login','content library and production navigation','mobile navigation','dark mode and text contrast','background motion controls','registration validation and return'],output}));
} catch(error){console.error(error);if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{server?.kill('SIGTERM');await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
