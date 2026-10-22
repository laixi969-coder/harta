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
 const chrome=process.env.HARTA_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 assert.equal((await context.request.post(origin+'/api/login',{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}})).status(),200);
 assert.equal((await context.request.post(origin+'/api/openfind',{data:{customerId:'c1',action:'sync'}})).status(),200);
 const scopeDir=path.join(dir,'data/openfind',fs.readdirSync(path.join(dir,'data/openfind'))[0]);
 const db=new DatabaseSync(path.join(scopeDir,'engine/openfind.sqlite'));
 const put=(kind,row)=>db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,row.id,JSON.stringify(row));
 for(const [id,keyword,platform] of [['a','家具','xiaohongshu'],['b','装修','xiaohongshu'],['123','家具','douyin']]){
  put('notes',{id:platform+':'+id,nativeId:id,platform,source:'live',title:keyword+'作品',body:'公开作品夹具',author:'测试作者',authorId:'fixture',type:platform==='douyin'?'video':'image',images:[],cover:'',likes:1,comments:1,saves:0,publishedAt:'',tags:[],url:'https://www.'+(platform==='douyin'?'douyin.com/video/':'xiaohongshu.com/explore/')+id});
  put('jobs',{id:'job-'+id,type:'search',status:'completed',source:'live',platform,keyword,resultIds:[platform+':'+id],count:1,pages:1,logs:[],createdAt:new Date().toISOString()});
 }
 db.close();
 page=await context.newPage();const view=page.frameLocator('#cm-openfind iframe');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/openfind?customerId=c1#settings');
 await view.getByRole('heading',{name:'小红书 API 数据源'}).waitFor();
 await view.getByRole('heading',{name:'抖音数据源',exact:true}).waitFor();
 await view.getByRole('heading',{name:'业务请求预算',exact:true}).waitFor();
 const budget=view.getByRole('region',{name:'业务请求预算'});
 await budget.getByRole('spinbutton',{name:'每流程数据源请求上限',exact:true}).fill('25');
 await budget.getByRole('spinbutton',{name:'每日模型请求上限',exact:true}).fill('2');
 await budget.getByRole('button',{name:'保存预算',exact:true}).click();
 await budget.getByText('预算已保存，已用请求不会清零',{exact:true}).waitFor();
 await budget.getByRole('button',{name:'刷新用量',exact:true}).click();
 await budget.getByText('已刷新当前业务用量',{exact:true}).waitFor();
 assert.match(await budget.innerText(),/销售草稿 0 次/);
 assert.equal(await view.getByRole('button',{name:'打开小红书'}).count(),0);
 await page.goto(origin+'/openfind?customerId=c1#acquisition');
 await view.getByRole('button',{name:'关键词搜索',exact:true}).click();
 for(const label of ['每次搜索作品数','最多采样作品数','每篇评论上限']){
  const input=view.getByRole('spinbutton',{name:label,exact:true});await input.fill('100');assert.equal(await input.getAttribute('max'),'100');assert.equal(await input.evaluate(el=>el.checkValidity()),true);
 }
 const base=origin+'/api/openfind/workbench/c1';
 const changed=await context.request.put(base+'/library/organize',{data:{items:[{id:'xiaohongshu:a',revision:0}],change:{category:'询价',archived:true}}});assert.equal(changed.status(),200);const undoId=(await changed.json()).undoId;
 assert.equal((await context.request.post(base+'/library/undo',{data:{id:undoId}})).status(),200);
 // Real classification UI: partial edits must not erase other labels, and hidden selections cannot be mutated.
 await page.goto(origin+'/openfind?customerId=c1#discover');
 await view.getByLabel('作品范围',{exact:true}).selectOption('library');
 await view.getByText('分类、归档与常用筛选',{exact:true}).click();
 const library=view.locator('details').filter({hasText:'分类、归档与常用筛选'});
 const card=view.locator('.note-card').filter({hasText:'家具作品'});
 await card.locator('input[type="checkbox"]').check();
 const saveLabels=async()=>{const done=page.waitForResponse(r=>r.url().endsWith('/library/organize')&&r.request().method()==='PUT');await library.getByRole('button',{name:'保存选中分类',exact:true}).click();assert.equal((await done).status(),200);await library.getByRole('button',{name:'保存选中分类',exact:true}).waitFor({state:'visible'});};
 await library.getByRole('textbox',{name:'产品标签',exact:true}).fill('保留产品');await saveLabels();
 await library.getByRole('textbox',{name:'需求分类',exact:true}).fill('询价');await saveLabels();
 let classified=await(await context.request.get(base+'/state')).json();
 assert.equal(classified.notes.find(n=>n.id==='xiaohongshu:a').organization.product,'保留产品');
 await view.getByRole('textbox',{name:'筛选作品',exact:true}).fill('装修');
 await library.getByText('已选 0 条；每批最多 100 条。归档保留原文与线索。',{exact:true}).waitFor();
 assert.equal(await library.getByRole('button',{name:'归档选中',exact:true}).isDisabled(),true);
 await view.getByRole('textbox',{name:'筛选作品',exact:true}).fill('');await card.locator('input[type="checkbox"]').check();
 const archiveDone=page.waitForResponse(r=>r.url().endsWith('/library/organize')&&r.request().method()==='PUT');await library.getByRole('button',{name:'归档选中',exact:true}).click();assert.equal((await archiveDone).status(),200);
 await card.waitFor({state:'detached'});
 const undoDone=page.waitForResponse(r=>r.url().endsWith('/library/undo'));await library.getByRole('button',{name:'撤销上次分类操作',exact:true}).click();assert.equal((await undoDone).status(),200);await card.waitFor();
 await library.getByRole('combobox',{name:'归档范围',exact:true}).selectOption('archived');
 await view.getByRole('button',{name:'清除筛选',exact:true}).click();await card.waitFor();
 assert.equal(await library.getByRole('combobox',{name:'归档范围',exact:true}).inputValue(),'active');
 await view.getByLabel('数据平台',{exact:true}).selectOption('douyin');
 await view.getByRole('checkbox',{name:'选择 家具作品',exact:true}).check();
 assert.equal(await library.getByRole('button',{name:'标记已核实',exact:true}).isEnabled(),true);
 await view.getByLabel('数据平台',{exact:true}).selectOption('xiaohongshu');
 const synced=await context.request.post(origin+'/api/openfind',{data:{customerId:'c1',action:'sync'}});assert.equal(synced.status(),200);const syncedBody=await synced.json();assert.equal(syncedBody.workspace.acquisition.works.find(w=>w.openfindIds?.includes('xiaohongshu:a')).organization.product,'保留产品');
 classified=await(await context.request.get(base+'/state')).json();assert.equal(classified.notes.find(n=>n.id==='xiaohongshu:a').organization.archived,false);
 assert.equal((await context.request.post(origin+'/api/openfind',{data:{customerId:'c2',action:'sync'}})).status(),200);
 assert.equal((await context.request.get(origin+'/api/openfind/workbench/c2/request-budget')).status(),200);
 const otherBudget=await(await context.request.get(origin+'/api/openfind/workbench/c2/request-budget')).json();
 assert.equal(otherBudget.policy.flowLimit,60);assert.equal(otherBudget.policy.modelDailyLimit,100);
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
 console.log(JSON.stringify({result:'passed',checks:['API settings','1–100 inputs','platform/topic grouping','partial classification edits','hidden selection clearing','archive undo','business budget isolation','business isolation','375/1440px layout'],platformRequests:0,output},null,2));
} catch(error) { if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error; }
finally { await browser?.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
