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
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-studio-ui-'));
const output=path.join(root,'output/future-studio');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
const spacingFindings=[];
async function spacingIssues(page,label){
  return page.evaluate((label)=>{
    const visible=el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    const path=el=>{const parts=[];let node=el;while(node&&parts.length<4){parts.unshift(node.tagName.toLowerCase()+(node.id?'#'+node.id:'')+(node.classList.length?'.'+[...node.classList].slice(0,2).join('.'):''));node=node.parentElement;}return parts.join(' > ');};
    const candidate=el=>{
      if(!visible(el)||el.matches('#root,.app-shell,.main-shell,.main-content'))return false;
      const style=getComputedStyle(el);if(style.display==='inline')return false;
      const bordered=(parseFloat(style.borderLeftWidth)||0)>0||(parseFloat(style.borderRightWidth)||0)>0;
      const bg=style.backgroundColor&&!/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor);
      return bordered||bg;
    };
    const issues=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())&&issues.length<60){
      if(!node.textContent.trim()||!visible(node.parentElement)||node.parentElement.closest('.skip'))continue;
      let container=node.parentElement;
      while(container&&container!==document.body&&!candidate(container))container=container.parentElement;
      if(!container||container===document.body)continue;
      const style=getComputedStyle(container),box=container.getBoundingClientRect(),leftBorder=parseFloat(style.borderLeftWidth)||0,rightBorder=parseFloat(style.borderRightWidth)||0;
      const range=document.createRange();range.selectNodeContents(node);
      for(const rect of range.getClientRects()){
        const left=rect.left-box.left-leftBorder,right=box.right-rightBorder-rect.right;
        if(left<3.5||right<3.5)issues.push({label,selector:path(container),text:node.textContent.trim().slice(0,50),left:Math.round(left*10)/10,right:Math.round(right*10)/10,padding:style.padding});
      }
    }
    return issues.slice(0,30);
  },label);
}
async function contrastCheck(page,label,selector){
  const results=await page.evaluate((selector)=>{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=canvas.height=1;
    const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x);};
    const lum=color=>color.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll(selector||'.studio-primary-nav a,.studio-lane h2,.studio-path-result strong,.studio-path-result small,.studio-lane footer .btn,.studio-path-stats dt,.studio-entry strong,.studio-entry small,#cm-content-home h1,#content-library h2,#content-library .meta,.cm-content-toolbar .btn,.cm-content-tabs [role=tab],#mast-date,.studio-week-plan h3,.studio-week-plan p,.studio-week-plan .btn')].filter(el=>el.getClientRects().length).map(el=>{
      const layers=[];let parent=el;while(parent){layers.unshift(rgba(getComputedStyle(parent).backgroundColor));parent=parent.parentElement;}
      const bg=layers.reduce((under,c)=>c.slice(0,3).map((v,i)=>v*c[3]+under[i]*(1-c[3])),[255,255,255]);
      const color=rgba(getComputedStyle(el).color),ink=color.slice(0,3).map((v,i)=>v*color[3]+bg[i]*(1-color[3]));
      const a=lum(ink),b=lum(bg);return {text:el.textContent.trim().slice(0,25),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  },selector);
  assert.ok(results.length>5);assert.deepEqual(results.filter(r=>r.ratio<4.5),[],label+' visible text contrast');
}

try{
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);
  writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'ui-business',name:'厨房设计 · 界面验收',hunt:'家装',city:'杭州',pitch:'厨房设计与翻新',salesMaterial:'提供厨房设计和收纳建议。',painClusters:{id:'insight-fixture',generatedAt:'2026-10-31T00:00:00Z',total:2,method:'规则归堆',coverage:{covered:2,total:2},clusters:[{id:'P1',topic:'厨房空间',angle:'厨房空间怎么规划',anxiety:'空间不足',blocker:'需要核对尺寸',count:2,share:1,signalIds:['s1','s2'],quotes:[{signalId:'s1',text:'厨房空间不够怎么办？'}],method:'规则归堆'}]},track:'存量',stage:'cooperating',packs:[],drops:[{id:'ui-pack',tier:'今日',title:'厨房翻新，从需求开始',date:'2026-10-31',battlefields:['小红书'],copies:{},shells:{小红书:[{title:'厨房翻新先问什么',cover:'先核对使用需求',body:'先记录做饭习惯、收纳需求与预算，再与服务方核对方案。'}]},origin:{mode:'organic',goal:'leads'},execution:[]}]}],ledger:[],contentStates:{},feedback:{},usingId:'ui-business'});
  process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'isolated-design-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server exited');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...fs.existsSync(chrome)?{executablePath:chrome}:{}});
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.request.post(origin+'/api/login',{data:{email:'66445039@qq.com',password:'isolated-design-password'}});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('#cm-workbench h1').innerText(),'经营总览');
  assert.equal(await page.locator('.studio-lane:visible').count(),2);
  const nav=await page.locator('.rail').boundingBox();assert.ok(nav.width>1400&&nav.height<90,'Top navigation, no left rail');
  const primary=await page.locator('.studio-primary-nav').boundingBox(),aux=await page.locator('.studio-aux-nav').boundingBox();assert.ok(Math.abs(primary.y-aux.y)<4,'Primary and auxiliary navigation share one row');
  for(const selector of ['.studio-lane-active','.studio-lane-content'])assert.ok((await page.locator(selector).boundingBox()).y<400);
  for(const selector of ['.studio-lane-active footer button','.studio-lane-content footer button']){const rect=await page.locator(selector).first().boundingBox();assert.ok(rect.y+rect.height<=960,'两条主线的主要操作应在桌面首屏可见');}
  await contrastCheck(page,'dark overview');spacingFindings.push(...await spacingIssues(page,'dark overview'));await page.screenshot({path:path.join(output,'overview-dark.png')});
  await page.locator('#cm-workbench [data-cm=calendar-home]').click();await page.locator('#content-panel-schedule').waitFor({state:'visible'});await page.locator('[data-nav=workbench]').click();
  await page.locator('[data-cm=review-home]').click();await page.locator('#content-panel-review').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-nav=account-review]').getAttribute('aria-current'),'page');
  await page.locator('[data-nav=content-home]').click();await page.locator('#content-panel-library').waitFor({state:'visible'});
  await page.locator('[data-cm=content-feed]').click();const entry=page.locator('#cm-content-scope [name=creationEntry]');await entry.waitFor();assert.equal(await entry.inputValue(),'feed');
  const createPlatform=page.locator('#cm-content-scope [name=creationPlatform]');
  await createPlatform.selectOption('视频号');assert.equal(await createPlatform.inputValue(),'视频号');
  const createForm=page.locator('#cm-content-scope [data-cm-form=generate]');
  await createForm.locator('[name=creationFormat]').selectOption('image');await createForm.locator('[type=submit]').click();
  await createForm.locator('.cm-error').getByText('视频号请选择短视频形式').waitFor();
  await createPlatform.selectOption('朋友圈');assert.equal(await createPlatform.inputValue(),'朋友圈');
  await createForm.locator('[type=submit]').click();await createForm.locator('.cm-error').getByText('朋友圈请选择自动形式，生成外层文案与展开内容').waitFor();
  await createForm.locator('[name=creationFormat]').selectOption('');
  await createPlatform.selectOption('');
  await page.locator('#cm-content-scope [name=distributionIntent]').selectOption('mixed');
  await page.locator('[data-nav=content-home]').click();await page.locator('[data-cm=content-platform]').click();await entry.waitFor();assert.equal(await entry.inputValue(),'platform');assert.equal(await page.locator('#cm-content-scope [name=distributionIntent]').inputValue(),'mixed');
  await page.locator('[data-nav=content-home]').click();await contrastCheck(page,'dark content');spacingFindings.push(...await spacingIssues(page,'dark content'));await page.screenshot({path:path.join(output,'content-dark.png')});
  await page.locator('#content-library [data-cm=open-pack]').click();await page.getByText('脚本、直播与封面制作',{exact:true}).first().waitFor();
  await page.screenshot({path:path.join(output,'production-dark.png')});
  const production=page.locator('[data-production-mode]').first();
  assert.equal(await production.locator('[data-production-editor]').evaluate(el=>el.open),true,'Library opens the actual editor');
  await production.locator('[name=production-job]').selectOption('divert');
  await production.locator('[name=production-playPackId]').selectOption('off');
  await production.locator('[data-growth-action=production-generate]').click();
  await production.locator('[data-production-status]').getByText('请先保存内容任务和本篇打法，再生成脚本建议').waitFor();
  await production.locator('[name=production-title]').fill('厨房怎么更好用');
  await production.locator('[name=production-script]').fill('先记录每天使用厨房的习惯。\n再核对收纳与动线。');
  assert.equal(await production.locator('[data-production-preview-title]').innerText(),'厨房怎么更好用');
  assert.equal(await production.locator('[data-production-save-state]').innerText(),'有未保存修改');
  const scriptTab=production.getByRole('tab',{name:'脚本编辑'});
  await scriptTab.focus();await scriptTab.press('ArrowRight');
  assert.equal(await production.getByRole('tab',{name:'封面与图文'}).getAttribute('aria-selected'),'true','Arrow keys switch production tabs');
  assert.equal(await production.locator('[name=production-script]').isVisible(),false);
  await production.locator('[name=production-cover]').fill('厨房从习惯开始');
  await production.locator('[name=production-coverLayout]').fill('清晰标题与留白');
  await production.locator('[data-growth-action=production-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-growth-action=production-save]')?.dataset.version==='1');
  assert.equal(await production.getByRole('tab',{name:'封面与图文'}).getAttribute('aria-selected'),'true','Save retains active panel');
  assert.equal(await production.locator('[data-production-editor]').evaluate(el=>el.open),true,'Save retains open workspace');
  assert.equal(await production.locator('[data-production-save-state]').innerText(),'已保存草稿 v1');
  const productionSpace=await (await context.request.get(origin+'/api/acquisition')).json();
  const saved=productionSpace.workspace.customers.find(c=>c.id==='ui-business').drops.find(p=>p.id==='ui-pack');
  assert.equal(saved.productionDrafts['小红书|0'].job,'divert');assert.equal(saved.productionDrafts['小红书|0'].playPackId,'off');assert.equal(saved.productionDrafts['小红书|0'].fields.script,'先记录每天使用厨房的习惯。\n再核对收纳与动线。');
  assert.equal(saved.shells.小红书[0].title,'厨房翻新先问什么','Draft save does not overwrite original');
  const download=page.waitForEvent('download');await production.locator('[data-growth-action=cover-download]').click();
  const coverFile=await (await download).path();assert.equal(fs.readFileSync(coverFile).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(await production.locator('[data-ai-cover-preview]').isVisible(),true);
  assert.equal(await production.locator('.production-preview-empty').isVisible(),false);
  await production.getByRole('tab',{name:'脚本编辑'}).click();
  await production.locator('[name=production-live]').selectOption('live');
  await production.locator('[name=production-job]').selectOption('lead');
  await production.locator('[name=production-playPackId]').selectOption('xhs-live');
  await production.locator('[name=production-liveOpen]').fill('直播开场先介绍主题');
  assert.match(await production.locator('[data-production-preview-body]').innerText(),/直播开场先介绍主题/);
  await production.locator('[name=production-live]').selectOption('video');
  assert.equal(await production.locator('[name=production-job]').inputValue(),'divert');assert.equal(await production.locator('[name=production-playPackId]').inputValue(),'off');assert.equal(await production.locator('[name=production-script]').inputValue(),'先记录每天使用厨房的习惯。\n再核对收纳与动线。');
  await production.locator('[name=production-live]').selectOption('live');
  assert.equal(await production.locator('[name=production-job]').inputValue(),'lead');assert.equal(await production.locator('[name=production-playPackId]').inputValue(),'xhs-live');assert.equal(await production.locator('[name=production-liveOpen]').inputValue(),'直播开场先介绍主题','Mode switch retains unsaved live draft');
  await production.locator('[name=production-live]').selectOption('video');
  await production.locator('[data-production-editor]').evaluate(el=>el.scrollIntoView({block:'start'}));
  await contrastCheck(page,'dark production','.production-tabs button,.production-context,.production-studio-head h3,.production-save-state span,.production-preview header,.production-preview-copy h4,.production-preview-copy p,.production-preview footer,.production-panel>label');
  const editorRect=await production.locator('.production-edit-area').boundingBox(),previewRect=await production.locator('.production-preview').boundingBox();
  assert.ok(editorRect.width>400 && previewRect.x>editorRect.x+editorRect.width,'Desktop editor and preview share one canvas');
  await page.screenshot({path:path.join(output,'production-workspace-dark.png')});
  await page.locator('[data-theme-toggle]').click();await production.locator('[data-production-editor]').evaluate(el=>el.scrollIntoView({block:'start'}));
  await contrastCheck(page,'light production','.production-tabs button,.production-context,.production-studio-head h3,.production-save-state span,.production-preview header,.production-preview-copy h4,.production-preview-copy p,.production-preview footer,.production-panel>label');spacingFindings.push(...await spacingIssues(page,'light production'));
  await page.screenshot({path:path.join(output,'production-workspace-light.png')});
  await page.setViewportSize({width:375,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Production mobile must not overflow');
  await production.getByRole('tab',{name:'封面与图文'}).click();
  assert.equal(await production.locator('[name=production-cover]').inputValue(),'厨房从习惯开始');
  await production.locator('[data-production-editor]').evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:path.join(output,'production-workspace-mobile.png')});
  await page.setViewportSize({width:1440,height:960});await page.locator('[data-theme-toggle]').click();

  await page.locator('[data-nav=content-home]').click();
  await page.locator('#content-production>summary').click();await page.locator('[data-cm-form=production-create] [name=title]').fill('保留未保存的主题');
  await page.locator('[data-nav=account-review]').click();await page.locator('[data-nav=content-home]').click();assert.equal(await page.locator('[data-cm-form=production-create] [name=title]').inputValue(),'保留未保存的主题');
  await page.locator('[data-theme-toggle]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await contrastCheck(page,'light content');await page.screenshot({path:path.join(output,'content-light.png')});
  await page.locator('[data-nav=workbench]').click();await contrastCheck(page,'light overview');spacingFindings.push(...await spacingIssues(page,'light overview'));await page.screenshot({path:path.join(output,'overview-light.png')});
  const more=page.locator('.rail-more');
  for(const route of ['products','customers','connections','delivery','agents','pack','leads','ledger']){
    await more.locator('summary').click();await more.locator(`[data-nav="${route}"]`).click();await page.locator(`[data-view="${route}"]`).waitFor({state:'visible'});assert.equal(await more.evaluate(el=>el.open),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' desktop overflow');
    await page.locator(`[data-view="${route}"] details`).evaluateAll(els=>els.forEach(el=>el.open=true));await page.waitForTimeout(100);
    spacingFindings.push(...await spacingIssues(page,route+' light'));
    await page.screenshot({path:path.join(output,route+'-light.png'),fullPage:true});
  }
  await page.locator('[data-nav=conversations]').click();await page.locator('[data-view=conversations]').waitFor({state:'visible'});await page.locator('[data-view=conversations] details').evaluateAll(els=>els.forEach(el=>el.open=true));await page.waitForTimeout(100);spacingFindings.push(...await spacingIssues(page,'conversations light'));await page.screenshot({path:path.join(output,'conversations-light.png'),fullPage:true});
  await page.locator('[data-nav=settings]').click();await page.locator('[data-view=settings]').waitFor({state:'visible'});await page.locator('[data-view=settings] details').evaluateAll(els=>els.forEach(el=>el.open=true));await page.waitForTimeout(100);spacingFindings.push(...await spacingIssues(page,'settings light'));await page.screenshot({path:path.join(output,'settings-light.png'),fullPage:true});
  await more.locator('summary').click();await more.locator('summary').press('Escape');assert.equal(await more.evaluate(el=>el.open),false);
  await page.locator('[data-nav=prospecting]').click();await page.locator('[data-view=openfind]').waitFor({state:'visible'});
  const acquisition=page.frameLocator('#cm-openfind iframe');await acquisition.locator('.main-content').waitFor();assert.ok((await page.locator('#cm-openfind iframe').boundingBox()).height>400,'Acquisition must have usable viewport below top navigation');
  spacingFindings.push(...await spacingIssues(page.frames().find(f=>f.url().includes('/openfind?')),'light acquisition find works'));await page.screenshot({path:path.join(output,'acquisition-light.png')});
  await page.locator('[data-acq-page=comments]').click();await acquisition.locator('.comment-inspector').waitFor();assert.equal(await acquisition.getByText('先读原话，再判断需求').count(),1);await contrastCheck(page.frames().find(f=>f.url().includes('/openfind?')),'light comment status','.live-bar>span,.live-bar>b,.live-bar b span,.page-heading h1,.filter-tabs button');await page.screenshot({path:path.join(output,'comments-empty-light.png')});
  await page.locator('[data-cm=comment-insights]').click();await page.locator('#acq-comment-insights').waitFor({state:'visible'});assert.equal(await page.locator('#acq-comment-insights h2').innerText(),'评论区痛点归集');const insightSave=page.waitForResponse(r=>r.url().endsWith('/api/topic-board')&&r.request().method()==='POST');await page.locator('#acq-comment-insights').getByRole('button',{name:'加入选题库'}).click();assert.equal((await insightSave).status(),200);await page.locator('[data-persist=pain-sample-input] summary').click();const sampleForm=page.locator('[data-acq-form=pain-samples]');await sampleForm.locator('[name=samples]').fill(Array(101).fill('厨房报价怎么比较？').join('\n'));await sampleForm.getByRole('button',{name:'分析粘贴样本'}).click();await sampleForm.locator('.acq-error').getByText(/100 条/).waitFor();await sampleForm.locator('[name=samples]').fill('厨房报价怎么比较？\n这个价格怎么算？');const sampleResponse=page.waitForResponse(r=>r.url().endsWith('/api/pain-clusters')&&r.request().method()==='POST');await sampleForm.getByRole('button',{name:'分析粘贴样本'}).click();assert.equal((await sampleResponse).status(),200);const sampleResult=page.locator('[data-persist=pain-samples-results]');await sampleResult.getByText(/来源未核验/).first().waitFor();const sampleTopic=page.waitForResponse(r=>r.url().endsWith('/api/topic-board')&&r.request().method()==='POST');await sampleResult.getByRole('button',{name:'加入选题库'}).first().click();assert.equal((await sampleTopic).status(),200);await sampleResult.getByText('查看全部粘贴原文（2 条）').click();await sampleResult.getByText('厨房报价怎么比较？',{exact:true}).last().waitFor();const sampleRemove=page.waitForResponse(r=>r.url().endsWith('/api/pain-clusters')&&r.request().method()==='POST');await sampleResult.getByRole('button',{name:'移除此样本洞察'}).click();assert.equal((await sampleRemove).status(),200);await page.locator('[data-nav=content-home]').click();await page.locator('[data-content-tab=ideas]').click();await page.locator('[data-cm=topic-board-filter][data-id=parked]').click();await page.locator('.topic-board').getByRole('heading',{name:'厨房空间怎么规划',exact:true}).waitFor();await page.locator('.topic-board').getByText(/粘贴评论样本（来源未核验）/).waitFor();await page.locator('.topic-board').getByText(/来源已变化或不可用/).waitFor();await page.locator('[data-nav=prospecting]').click();await acquisition.locator('.main-content').waitFor();

  await page.locator('[data-nav=workbench]').click();await page.locator('[data-theme-toggle]').click();
  await page.locator('[data-nav=prospecting]').click();await acquisition.locator('.main-content').waitFor();assert.equal(await acquisition.locator('html').getAttribute('data-theme'),'dark');await contrastCheck(page.frames().find(f=>f.url().includes('/openfind?')),'dark acquisition','.btn.primary,.search-panel label,.search-panel .field-label,.page-heading h1,.results-toolbar button,.xhs-icon');spacingFindings.push(...await spacingIssues(page.frames().find(f=>f.url().includes('/openfind?')),'dark acquisition find works'));await page.screenshot({path:path.join(output,'acquisition-dark.png')});await page.locator('[data-acq-page=comments]').click();await acquisition.locator('.comment-inspector').waitFor();await contrastCheck(page.frames().find(f=>f.url().includes('/openfind?')),'dark comment status','.live-bar>span,.live-bar>b,.live-bar b span,.page-heading h1,.filter-tabs button');await page.locator('[data-nav=workbench]').click();
  for(const route of ['products','customers','connections','delivery','agents','pack','leads','ledger']){
    await more.locator('summary').click();await more.locator(`[data-nav="${route}"]`).click();await page.locator(`[data-view="${route}"]`).waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' dark desktop overflow');
    await page.locator(`[data-view="${route}"] details`).evaluateAll(els=>els.forEach(el=>el.open=true));await page.waitForTimeout(100);
    spacingFindings.push(...await spacingIssues(page,route+' dark'));
    await page.screenshot({path:path.join(output,route+'-dark.png'),fullPage:true});
  }
  await page.locator('[data-nav=conversations]').click();await page.locator('[data-view=conversations]').waitFor({state:'visible'});await page.locator('[data-view=conversations] details').evaluateAll(els=>els.forEach(el=>el.open=true));await page.waitForTimeout(100);spacingFindings.push(...await spacingIssues(page,'conversations dark'));await page.screenshot({path:path.join(output,'conversations-dark.png'),fullPage:true});
  await page.locator('[data-nav=settings]').click();await page.locator('[data-view=settings]').waitFor({state:'visible'});await page.locator('[data-view=settings] details').evaluateAll(els=>els.forEach(el=>el.open=true));await page.waitForTimeout(100);spacingFindings.push(...await spacingIssues(page,'settings dark'));await page.screenshot({path:path.join(output,'settings-dark.png'),fullPage:true});
  await page.locator('[data-nav=workbench]').click();
  const spacingRoutes=['workbench','content-home','products','customers','connections','delivery','agents','pack','leads','ledger','settings','conversations'];
  for(const width of [320,375,390,414,768,1024]){
    await page.setViewportSize({width,height:960});
    for(const route of spacingRoutes){
      await page.evaluate(route=>document.querySelector(`[data-nav="${route}"]`)?.click(),route);await page.locator(`[data-view="${route}"]`).waitFor({state:'visible'});
      await page.locator(`[data-view="${route}"] details`).evaluateAll(els=>els.forEach(el=>el.open=true));await page.waitForTimeout(40);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route} overflow at ${width}`);
      spacingFindings.push(...await spacingIssues(page,`${route} at ${width}`));
      if(width===390&&['workbench','products','settings','conversations'].includes(route))await page.screenshot({path:path.join(output,route+'-mobile.png'),fullPage:true});
    }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#mobile-menu-toggle').click();await page.locator('#harta-navigation [data-nav=content-home]').click();assert.equal(await page.locator('#harta-navigation').evaluate(el=>el.open),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'content-mobile.png'),fullPage:true});
  await page.locator('#content-tab-schedule').click();await page.locator('#content-live').waitFor({state:'visible'});await page.locator('#content-calendar').getByText('本周暂无已标注内容任务的排期。').waitFor();await page.locator('#content-calendar').getByRole('button',{name:'去选题库安排内容'}).click();await page.locator('#topic-board').waitFor({state:'visible'});await page.locator('#content-tab-review').click();await page.locator('#content-panel-review').waitFor({state:'visible'});
  await page.locator('#content-tab-library').click();if(!await page.locator('#content-production').evaluate(el=>el.open))await page.locator('#content-production > summary').click();const articleCreate=page.locator('[data-cm-form=production-create]');await articleCreate.locator('[name=platform]').selectOption('公众号');await articleCreate.locator('[name=title]').fill('厨房设计如何比较方案和报价');await articleCreate.getByRole('button',{name:'新建并打开'}).click();
  const article=page.locator('[data-production-mode=article]').first();await article.waitFor();assert.equal(await article.locator('[name=production-live]').inputValue(),'article');
  await page.route('**/api/production-generate',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({fields:{script:'先明确使用需求。\n\n再逐项比较报价。'}})}),{times:1});await article.locator('[data-growth-action=production-generate]').click();await article.locator('[name=production-script]').waitFor();await page.waitForFunction(()=>document.querySelector('[data-production-mode=article] [name=production-script]')?.value.includes('逐项比较'));
  await article.locator('[data-growth-action=production-save]').click();await page.waitForFunction(()=>document.querySelector('[data-production-mode=article] [data-growth-action=production-save]')?.dataset.version==='1');await article.getByRole('tab',{name:'检查与交付'}).click();assert.equal(await article.locator('[data-growth-action=production-to-studio]').count(),0);const checkAlignment=await article.locator('label.cm-check').evaluate(label=>{const range=document.createRange();range.selectNodeContents(label.lastChild);return Math.abs(label.querySelector('input').getBoundingClientRect().top-range.getBoundingClientRect().top);});assert.ok(checkAlignment<10,'Confirmation checkbox should align with its label');const articleDownload=page.waitForEvent('download');await article.locator('[data-growth-action=production-download]').click();const articleText=fs.readFileSync(await (await articleDownload).path(),'utf8');assert.match(articleText,/制作类型：公众号长文/);assert.match(articleText,/逐项比较报价/);await article.locator('[data-growth-action=production-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-production-mode=article] [data-growth-action=production-save]')?.dataset.version==='2');const articleWorkspace=await (await context.request.get(origin+'/api/acquisition')).json(),articlePack=articleWorkspace.workspace.customers.find(c=>c.id==='ui-business').drops.find(p=>p.title==='厨房设计如何比较方案和报价');assert.equal(articlePack.edits['公众号|0|body'].now,'先明确使用需求。\n\n再逐项比较报价。');assert.equal(articlePack.edits['公众号|0|body'].verbatim,true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await article.screenshot({path:path.join(output,'article-workspace-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});await page.locator('[data-nav=content-home]').click();await page.locator('#content-tab-review').click();const accountPanel=page.locator('[data-cm-detail="ui-business:owned-account"]');if(!await accountPanel.evaluate(el=>el.open))await accountPanel.locator('summary').click();const articleAccount=accountPanel.locator('[data-cm-form=review-account]');await articleAccount.locator('[name=platform]').selectOption('公众号');await articleAccount.locator('[name=name]').fill('长文验收公众号');const accountSaved=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/account'));await articleAccount.getByRole('button',{name:'登记账号'}).click();assert.ok((await accountSaved).ok());
  const freshWorkspace=await (await context.request.get(origin+'/api/acquisition')).json(),articleAccountId=freshWorkspace.workspace.acquisition.accounts.find(a=>a.name==='长文验收公众号').id,articleBase={customerId:'ui-business',packId:articlePack.id,platform:'公众号',index:0,accountId:articleAccountId};
  const prepared=await context.request.post(origin+'/api/acquisition/prepare-publication',{data:articleBase});assert.equal(prepared.status(),200);const preparedSpace=(await prepared.json()).workspace,pub=preparedSpace.acquisition.publications.find(p=>p.packId===articlePack.id);assert.equal(pub.content.body,'先明确使用需求。\n\n再逐项比较报价。');
  const confirmed=await context.request.post(origin+'/api/acquisition/publication',{data:{publicationId:pub.id,url:'https://mp.weixin.qq.com/s/article-one',publishedAt:'2026-01-01T12:00:00Z',confirmed:true}});assert.equal(confirmed.status(),200);const measured=await context.request.post(origin+'/api/growth-outcomes',{data:{customerId:'ui-business',packId:articlePack.id,rows:[{platform:'公众号',index:0,publicationId:pub.id,start:'2026-01-01',end:'2026-01-07',source:'隔离后台样本',metrics:{views:21}}]}});assert.equal(measured.status(),200);
  const second=await context.request.post(origin+'/api/owned-publication',{data:{customerId:'ui-business',accountId:articleAccountId,title:'另一篇公众号文章',url:'https://mp.weixin.qq.com/s/article-two',publishedAt:'2026-01-01T12:00:00Z',confirmed:true}});assert.equal(second.status(),200);const secondId=(await second.json()).acquisition.publications.find(p=>p.content.title==='另一篇公众号文章').id;const secondMetric=await context.request.post(origin+'/api/owned-publication-outcome',{data:{customerId:'ui-business',publicationId:secondId,start:'2026-01-01',end:'2026-01-07',source:'隔离后台样本',metrics:{views:30}}});assert.equal(secondMetric.status(),200);
  await page.reload();await page.locator('#cm-workbench h1').waitFor();await page.locator('[data-nav=content-home]').click();await page.locator('#content-tab-review').click();const articleCompare=page.locator('#content-review article').filter({hasText:'长文验收公众号'});await articleCompare.getByText(/厨房设计如何比较方案和报价/).first().waitFor();await articleCompare.getByText(/另一篇公众号文章/).first().waitFor();
  assert.deepEqual(spacingFindings,[],'Text must not touch bordered or filled container edges');assert.deepEqual(errors,[]);console.log('PASS: horizontal navigation, both acquisition paths, real creation intent, preserved drafts, production and live entries, review, legacy pages, dark/light contrast, responsive layouts, text edge spacing and article drafting and review');
}catch(error){console.error(error);await page?.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{server?.kill('SIGTERM');await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
