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
import { writeWorkspace, readWorkspace } from '../lib/workspace.mjs';
import { importSignals } from '../lib/acquisition-workspace.mjs';
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
 const context=await browser.newContext({extraHTTPHeaders:{origin},viewport:{width:1440,height:1000}});
 assert.equal((await context.request.post(origin+'/api/login',{data:{email:'66445039@qq.com',password:'browser-only-fixture-password'}})).status(),200);
 assert.equal((await context.request.post(origin+'/api/openfind',{data:{customerId:'c1',action:'sync'}})).status(),200);
 const scopeDir=path.join(dir,'data/openfind',fs.readdirSync(path.join(dir,'data/openfind'))[0]);
 const db=new DatabaseSync(path.join(scopeDir,'engine/openfind.sqlite'));
 const put=(kind,row)=>db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,row.id,JSON.stringify(row));
 for(const [id,keyword,platform] of [['a','家具','xiaohongshu'],['b','装修','xiaohongshu'],['123','家具','douyin']]){
  put('notes',{id:platform+':'+id,nativeId:id,platform,source:'live',title:keyword+'作品',body:'公开作品夹具',author:'测试作者',authorId:'fixture',type:platform==='douyin'?'video':'image',images:[],cover:'',likes:1,comments:1,saves:0,publishedAt:'',tags:[],url:'https://www.'+(platform==='douyin'?'douyin.com/video/':'xiaohongshu.com/explore/')+id});
  put('jobs',{id:'job-'+id,type:'search',status:'completed',source:'live',platform,keyword,resultIds:[platform+':'+id],count:1,pages:1,logs:[],createdAt:new Date().toISOString()});
 }
 put('comments',{id:'xhs:topic-fixture',noteId:'xiaohongshu:a',platform:'xiaohongshu',source:'live',author:'样例访客',authorId:'topic-user',body:'家具尺寸应该怎么测？',createdAt:new Date().toISOString(),region:'',parentId:null,likes:0});
 put('comments',{id:'xhs:unknown-date-fixture',noteId:'xiaohongshu:a',platform:'xiaohongshu',source:'live',author:'样例访客二',authorId:'unknown-date-user',body:'请问在哪里看款式？',createdAt:'',region:'',parentId:null,likes:0});
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
 const beforeSyncCwd=process.cwd();process.chdir(dir);const beforeSync=readWorkspace('66445039@qq.com');beforeSync.acquisition.works ||= [];beforeSync.acquisition.works.unshift({id:'pasted-no-url',customerId:'c1',platform:'小红书',source:'manual_paste',title:'无链接参考',url:''},{id:'demo-same-work',customerId:'c1',platform:'小红书',demo:true,title:'演示参考',url:'https://www.xiaohongshu.com/explore/a',recordId:'a',openfindIds:['xiaohongshu:a']});writeWorkspace('66445039@qq.com',beforeSync);process.chdir(beforeSyncCwd);
 const synced=await context.request.post(origin+'/api/openfind',{data:{customerId:'c1',action:'sync'}});assert.equal(synced.status(),200);const syncedBody=await synced.json();assert.equal(syncedBody.workspace.acquisition.works.find(w=>!w.demo&&w.openfindIds?.includes('xiaohongshu:a')).organization.product,'保留产品');assert.ok(syncedBody.workspace.acquisition.signals.some(s=>s.workId===syncedBody.workspace.acquisition.works.find(w=>!w.demo&&w.openfindIds?.includes('xiaohongshu:a')).id));process.chdir(dir);const afterSync=readWorkspace('66445039@qq.com');afterSync.acquisition.works=afterSync.acquisition.works.filter(w=>!['pasted-no-url','demo-same-work'].includes(w.id));writeWorkspace('66445039@qq.com',afterSync);process.chdir(beforeSyncCwd);
 classified=await(await context.request.get(base+'/state')).json();assert.equal(classified.notes.find(n=>n.id==='xiaohongshu:a').organization.archived,false);
 assert.equal((await context.request.post(origin+'/api/openfind',{data:{customerId:'c2',action:'sync'}})).status(),200);
 assert.equal((await context.request.get(origin+'/api/openfind/workbench/c2/request-budget')).status(),200);
 const otherBudget=await(await context.request.get(origin+'/api/openfind/workbench/c2/request-budget')).json();
 assert.equal(otherBudget.policy.flowLimit,60);assert.equal(otherBudget.policy.modelDailyLimit,100);
 await page.goto(origin+'/openfind?customerId=c1#comments');
 const setup=view.locator('.comment-collection-setup');if(!await setup.evaluate(el=>el.open))await setup.locator(':scope > summary').click();
 const picker=view.locator('.collected-work-picker');await picker.getByLabel('采集主题').selectOption('家具');
 assert.equal(await picker.locator('#comment-note optgroup option').count(),1);
 assert.match(await picker.locator('#comment-note').textContent(),/家具作品/);
 await picker.getByLabel('作品平台').selectOption('douyin');
 assert.equal(await picker.locator('#comment-note optgroup option').count(),1);
 await picker.getByLabel('作品平台').selectOption('xiaohongshu');
 await picker.locator('#comment-note').selectOption('xiaohongshu:a');
 await view.locator('.filter-tabs').getByRole('button',{name:'全部',exact:true}).click();
 await view.getByLabel('评论时间').selectOption('all');
 assert.ok(await view.getByText('评论时间未知',{exact:true}).count());
 assert.equal(await view.getByText('Invalid Date').count(),0);
 await view.getByRole('button',{name:'家具尺寸应该怎么测？'}).click();
 await view.getByRole('button',{name:'提炼为内容选题'}).click();
 const topicEditor=page.locator('#cm-review [data-cm-form=demand-topic]');await topicEditor.locator('[name=topic]').fill('家具尺寸如何测量');await topicEditor.locator('[name=confirmed]').check();
 const topicSaved=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/demand-topic'));await topicEditor.getByRole('button',{name:'保存到需求选题'}).click();assert.equal((await topicSaved).status(),200);
 const pool=await(await context.request.post(origin+'/api/topic-pool',{data:{customerId:'c1'}})).json();assert.ok(pool.pool.topics.some(t=>t.source==='评论灵感'&&t.angle==='家具尺寸如何测量'));
 await page.locator('[data-nav=content-home]').click();await page.locator('[data-content-tab=ideas]').click();const manage=page.locator('#cm-content-home [data-cm-detail]').filter({has:page.getByText('管理评论灵感（1）',{exact:true})}).first();await manage.locator('summary').first().click();await manage.locator('summary').filter({hasText:'家具尺寸如何测量'}).click();let edit=manage.locator('[data-cm-form=demand-topic-revise]');await edit.locator('[name=topic]').fill('家具测量先看哪些尺寸');await edit.locator('[name=confirmed]').check();const updated=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/demand-topic-revise'));await edit.getByRole('button',{name:'保存更正'}).click();assert.equal((await updated).status(),200);await manage.locator('summary').filter({hasText:'家具测量先看哪些尺寸'}).click();edit=manage.locator('[data-cm-form=demand-topic-revise]');await edit.locator('[name=confirmed]').check();const removed=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/demand-topic-revise'));await edit.getByRole('button',{name:'移除选题'}).click();assert.equal((await removed).status(),200);assert.equal((await(await context.request.post(origin+'/api/topic-pool',{data:{customerId:'c1'}})).json()).pool.sources.评论灵感,0);
 const priorCwd=process.cwd();process.chdir(dir);const paginationSpace=readWorkspace('66445039@qq.com');paginationSpace.customers.find(c=>c.id==='c1').demandTopics=Array.from({length:45},(_,i)=>({id:'fixture-topic-'+i,kind:'comment',leadId:'',evidenceId:'fixture',title:'合成问题'+i}));writeWorkspace('66445039@qq.com',paginationSpace);process.chdir(priorCwd);
 await page.reload();await page.locator('[data-nav=content-home]').click();await page.locator('[data-content-tab=ideas]').click();await page.getByRole('button',{name:'查看 / 更新需求选题'}).click();await page.getByRole('button',{name:'下一页',exact:true}).click();const lastTopic=page.locator('#cm-content-home article.cm-row').filter({hasText:'合成问题40'});await lastTopic.waitFor();const used=page.waitForResponse(r=>r.url().endsWith('/api/topic-decide'));await lastTopic.getByRole('button',{name:'采用并创作'}).click();const usedResponse=await used;assert.equal(usedResponse.status(),200);assert.match((await usedResponse.json()).direction,/合成问题40/);
 await page.locator('[data-nav=content-home]').click();await page.locator('[data-content-tab=ideas]').click();await page.getByRole('button',{name:'已用（1）'}).click();const usedTopic=page.locator('#cm-content-home article.cm-row').filter({hasText:'合成问题40'});await usedTopic.waitFor();const restoreUsed=page.waitForResponse(r=>r.url().endsWith('/api/topic-decide'));await usedTopic.getByRole('button',{name:'恢复候选'}).click();assert.equal((await restoreUsed).status(),200);await page.getByRole('button',{name:/候选（/}).click();const candidate=page.locator('#cm-content-home article.cm-row').filter({hasText:'合成问题0'});await candidate.waitFor();const skipped=page.waitForResponse(r=>r.url().endsWith('/api/topic-decide'));await candidate.getByRole('button',{name:'暂时不用'}).click();assert.equal((await skipped).status(),200);await page.getByRole('button',{name:'不用（1）'}).click();const skippedTopic=page.locator('#cm-content-home article.cm-row').filter({hasText:'合成问题0'});await skippedTopic.waitFor();const restoreSkipped=page.waitForResponse(r=>r.url().endsWith('/api/topic-decide'));await skippedTopic.getByRole('button',{name:'恢复候选'}).click();assert.equal((await restoreSkipped).status(),200);
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
 await view.locator('.collected-work-picker').waitFor({state:'attached'});
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
 const beforeQueue=process.cwd();process.chdir(dir);const queueSpace=readWorkspace('66445039@qq.com');queueSpace.acquisition.leads=Array.from({length:14},(_,i)=>({id:'queue-'+i,customerId:'c1',platform:'小红书',authorName:'待回复访客'+i,stage:'值得跟进',needsReply:true,signalIds:[],messages:[],events:[],sourcePaths:['unknown'],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));writeWorkspace('66445039@qq.com',queueSpace);process.chdir(beforeQueue);
 const priorDemandCwd=process.cwd();process.chdir(dir);const demandSpace=readWorkspace('66445039@qq.com'),demandWork=demandSpace.acquisition.works.find(w=>w.customerId==='c1'&&w.platform==='小红书');assert.ok(demandWork,'需要一条已导入作品');demandSpace.acquisition.signals=[];writeWorkspace('66445039@qq.com',demandSpace);importSignals('66445039@qq.com',{customerId:'c1',workId:demandWork.id,source:'分页测试评论',rows:Array.from({length:14},(_,i)=>({platform:'小红书',text:`访客${i}想了解家具多少钱？`,url:demandWork.url,recordId:`page-comment-${i}`,authorId:`page-author-${i}`,authorName:`分页访客${i}`,publishedAt:new Date(Date.now()-86400000-i*1000).toISOString()}))});const withDemo=readWorkspace('66445039@qq.com');withDemo.acquisition.signals.push({...withDemo.acquisition.signals[0],id:'demo-comment',recordId:'demo-comment',demo:true,text:'演示访客想了解家具多少钱？'});withDemo.acquisition.works.push({...demandWork,id:'demo-work',sourceType:'demo',title:'演示参考作品'});withDemo.acquisition.signals.push({...withDemo.acquisition.signals[0],id:'demo-work-comment',recordId:'demo-work-comment',workId:'demo-work',text:'演示作品访客想了解家具多少钱？'});writeWorkspace('66445039@qq.com',withDemo);process.chdir(priorDemandCwd);
 // Start a fresh server for the separate pagination and exclusion scenario; persisted fixture and session remain intact.
 server.kill();await once(server,'exit');
 server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'browser-only-fixture-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('Server exited');})]);
 await page.goto(origin+'/');await page.locator('#cm-workbench h1').waitFor();const pendingCard=page.locator('#cm-workbench .studio-path-stats > div').filter({hasText:'待核实需求'});assert.equal(await pendingCard.locator('dd').innerText(),'14');const queue=page.locator('#cm-workbench [aria-label="今天值得处理"]');await queue.getByText(/共 \d+ 项 · 第 1 \/ 2 页/).waitFor();await queue.getByRole('button',{name:'下一页'}).click();await queue.getByText('14 条需求待核实').waitFor();const laterLead=queue.locator('article').filter({hasText:'待回复访客12'});await laterLead.waitFor();await laterLead.getByRole('button',{name:'处理'}).click();await page.locator('#cm-conversations').getByRole('heading',{name:'待回复访客12'}).waitFor();

 await page.locator('[data-nav=prospecting]').click();await page.locator('.cm-acquisition-more > summary').click();await page.getByRole('button',{name:'历史资料与目标账号'}).click();await page.locator('#cm-prospecting').getByRole('tab',{name:'需求核实'}).click();const demands=page.locator('#cm-prospecting [aria-label="近7天需求核实"]');await demands.getByText('第 1 / 2 页 · 14 条需求').waitFor();const teardownResult=await context.request.post(origin+'/api/benchmark/teardown',{data:{customerId:'c1',workId:demandWork.id}});assert.equal(teardownResult.status(),200);assert.equal(await demands.getByText('演示访客想了解家具多少钱？').count(),0);assert.equal(await demands.getByText('演示作品访客想了解家具多少钱？').count(),0);await demands.getByRole('button',{name:'下一页需求'}).click();const laterDemand=demands.locator('article.cm-comment').filter({hasText:'访客12想了解家具多少钱？'});await laterDemand.waitFor();await laterDemand.locator('summary').filter({hasText:'核实或排除'}).click();await laterDemand.locator('[name=note]').fill('已核对评论与服务适配');const demandReview=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/review'));await laterDemand.getByRole('button',{name:'保存核实结果'}).click();assert.equal((await demandReview).status(),200);process.chdir(dir);const checkedSpace=readWorkspace('66445039@qq.com');process.chdir(priorDemandCwd);assert.ok(checkedSpace.acquisition.leads.some(l=>l.authorId==='page-author-12'),'第二页需求未保存为线索');await laterDemand.getByRole('button',{name:'查看跟进'}).click();const contact=page.locator('#cm-conversations');await contact.getByRole('heading',{name:'分页访客12'}).waitFor();await contact.locator('blockquote.cm-evidence').filter({hasText:'访客12想了解家具多少钱？'}).first().waitFor();await contact.getByText('咨询类型与进展',{exact:true}).click();await contact.getByText(/原话可能涉及：购买咨询/).waitFor();const adTrack=contact.locator('[data-cm-form=intent-track]').filter({has:page.locator('[name=kind][value=ad]')});await adTrack.locator('..').locator('summary').first().click();await adTrack.locator('[name=status]').selectOption('won');await adTrack.locator('[name=note]').fill('已核对商务合作签约记录');let releaseTrack,trackRequested;const trackGate=new Promise(resolve=>{releaseTrack=resolve;}),trackStarted=new Promise(resolve=>{trackRequested=resolve;});await page.route('**/api/acquisition/lead',async route=>{trackRequested();await trackGate;await route.continue();},{times:1});const trackSaved=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/lead')&&r.request().method()==='POST');await adTrack.getByRole('button',{name:'保存咨询进展'}).click();await trackStarted;await adTrack.locator('[name=note]').fill('保存期间补充的合作依据');releaseTrack();assert.equal((await trackSaved).status(),200);await adTrack.locator('[name=note]').waitFor();assert.equal(await adTrack.locator('[name=note]').inputValue(),'保存期间补充的合作依据');const trackAgain=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/lead')&&r.request().method()==='POST');await adTrack.getByRole('button',{name:'保存咨询进展'}).click();assert.equal((await trackAgain).status(),200);await contact.getByText(/保存期间补充的合作依据/).first().waitFor();await contact.getByText(/商务合作.*已签约/).first().waitFor();await contact.locator('.cm-list-item.selected').getByText(/商务合作 · 已签约/).waitFor();const trackHistory=contact.locator('summary').filter({hasText:'咨询进展历史'}).locator('..');await trackHistory.locator('summary').first().click();await trackHistory.getByText(/已核对商务合作签约记录/).waitFor();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'咨询事项手机布局不能横向溢出');await page.setViewportSize({width:1440,height:1000});await page.locator('[data-nav=workbench]').click();await page.locator('#cm-workbench summary').filter({hasText:'全部业务结果'}).click();await page.locator('#cm-workbench').getByText(/商务合作 1 人（标记签约 1）/).waitFor();await page.locator('[data-nav=conversations]').click();await contact.getByText('更新跟进',{exact:true}).click();const followup=contact.locator('[data-cm-form=contact-followup]');await followup.locator('[name=note]').fill('验收：已核实需求，等待确认现场尺寸');await followup.locator('[name=nextStep]').fill('核对家具尺寸');const savedFollowup=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/lead')&&r.request().method()==='POST');await followup.getByRole('button',{name:'保存跟进记录'}).click();assert.equal((await savedFollowup).status(),200);await contact.getByText('核对家具尺寸',{exact:true}).first().waitFor();await contact.getByRole('button',{name:'查看原文与评论'}).first().click();const sourceComment=page.locator('#cm-prospecting [data-signal-id]').filter({hasText:'访客12想了解家具多少钱？'});await sourceComment.waitFor();assert.equal(await sourceComment.evaluate(el=>document.activeElement===el),true,'回查应定位原评论');await page.locator('[data-nav=prospecting]').click();await page.locator('.cm-acquisition-more > summary').click();await page.getByRole('button',{name:'历史资料与目标账号'}).click();const backToWorks=page.locator('#cm-prospecting').getByRole('button',{name:'返回视频列表'});if(await backToWorks.isVisible())await backToWorks.click();await page.locator('#cm-prospecting').getByRole('tab',{name:'需求核实'}).click();if(await demands.getByRole('button',{name:'下一页需求'}).isVisible())await demands.getByRole('button',{name:'下一页需求'}).click();const excludedDemand=demands.locator('article.cm-comment').filter({hasText:'访客13想了解家具多少钱？'});await excludedDemand.waitFor();await excludedDemand.locator('summary').filter({hasText:'核实或排除'}).click();await excludedDemand.locator('[name=note]').fill('当前业务不适用');await excludedDemand.locator('[name=action]').selectOption('exclude');const excludedResponse=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/review'));await excludedDemand.getByRole('button',{name:'保存核实结果'}).click();assert.equal((await excludedResponse).status(),200);process.chdir(dir);const staleTeardown=readWorkspace('66445039@qq.com').customers.find(c=>c.id==='c1').benchmarkTeardowns[0];process.chdir(priorDemandCwd);assert.match(staleTeardown.staleReason,/重新拆解/);await page.locator('#cm-prospecting').getByRole('tab',{name:/作品库/}).click();assert.equal(await page.locator('#cm-prospecting').getByText('演示参考作品',{exact:true}).count(),0);await page.locator('[data-nav=content-home]').click();await page.locator('[data-content-tab=ideas]').click();assert.equal(await page.locator('#cm-content-home').getByText('演示参考作品',{exact:true}).count(),0);await page.locator('#cm-content-home').getByText(/旧拆解已暂停进入选题池/).waitFor();
 const failedPage=await context.newPage();await failedPage.route('**/api/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({email:'fixture@example.com',isAdmin:false})}));await failedPage.route('**/api/workspace',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'请求太频繁'})}));await failedPage.goto(origin+'/');const startupError=failedPage.getByRole('alertdialog');await startupError.getByRole('heading',{name:'工作台暂时无法打开'}).waitFor();await startupError.getByText('请求过于频繁，请稍候再试。').waitFor();assert.equal(await failedPage.locator('#work').getAttribute('inert'),'');await startupError.getByRole('button',{name:'重新加载'}).waitFor();await failedPage.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'passed',checks:['API settings','1–100 inputs','platform/topic grouping','comment to anonymous topic handoff','topic pagination, adoption and status recovery','workbench queue pagination and handoff','fixture comment verification, lead handoff and follow-up update; demo-source isolation in dashboard and queue','startup rate-limit error recovery','stale benchmark warning','partial classification edits','hidden selection clearing','archive undo','business budget isolation','business isolation','sync beside unlinked and demo works','375/1440px layout'],platformRequests:0,output},null,2));
} catch(error) { if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error; }
finally { await browser?.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
