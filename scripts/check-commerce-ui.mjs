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
const { chromium } = await import(process.env.HARTA_PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-commerce-browser-'));
const output=process.env.HARTA_UI_OUTPUT || path.join(os.tmpdir(),'harta-commerce-previews');fs.mkdirSync(output,{recursive:true});
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
  await page.locator('[data-nav=content-home]').click();await page.getByRole('heading',{name:'内容获客',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'content-home-desktop.png'),fullPage:true});
  await page.locator('[data-nav=products]').click();
  await page.screenshot({path:path.join(output,'products-empty-desktop.png'),fullPage:true});
  const product=page.locator('#cm-products [data-cm-form=product]');
  await product.locator('[name=name]').fill('阅读灯');await product.locator('[name=facts]').fill('适合书桌，使用插座');await product.locator('[name=source]').fill('产品说明书');await product.locator('[type=submit]').click();
  await page.locator('[data-cm=select-product]').getByText('阅读灯',{exact:true}).waitFor();
  await product.locator('[name=name]').fill('壁灯');await product.locator('[name=facts]').fill('需要固定安装');await product.locator('[name=source]').fill('壁灯说明书');await product.locator('[type=submit]').click();
  await page.getByRole('button',{name:'壁灯',exact:true}).waitFor();
  const first=page.locator('.cm-product').first();await first.locator('summary').click();await first.getByRole('button',{name:'添加规格',exact:true}).click();
  const sku=page.locator('#cm-products [data-cm-form=sku]');await sku.locator('[name=name]').fill('白色款');await sku.locator('summary').click();await sku.locator('[name=priceTerms]').fill('门店确认 199 元/台');await sku.locator('[name=source]').fill('报价单');await sku.locator('[type=submit]').click();
  let result=await (await context.request.get(`${origin}/api/acquisition`)).json();assert.equal(result.workspace.acquisition.skus.length,1);assert.equal(result.workspace.acquisition.products.length,2);
  const p=result.workspace.acquisition.products[0];
  await page.getByText('常见问题与销售资料（选填）',{exact:true}).click();await page.getByText('添加销售资料',{exact:true}).click();
  const documentForm=page.locator('[data-cm-form=sales-document][data-id=""]');
  await documentForm.locator('[name=title]').fill('阅读灯安装 FAQ');await documentForm.locator('[name=productId]').selectOption(p.id);
  await documentForm.locator('[name=body]').fill('阅读灯放在书桌上，使用前先核对插座位置。');await documentForm.locator('[name=source]').fill('产品说明书第3页');
  await documentForm.locator('[name=status]').selectOption('approved');await documentForm.locator('[name=confirmed]').check();await documentForm.locator('[type=submit]').click();
  await page.getByText('阅读灯安装 FAQ · 可用于沟通',{exact:true}).waitFor();

  await page.getByRole('button',{name:'添加另一款产品',exact:true}).click();await product.locator('[name=name]').fill('仅业务一的未保存草稿');
  await page.locator('#cm-products [data-cm-business]').selectOption('c2');assert.equal(await product.locator('[name=name]').inputValue(),'');
  await page.locator('#cm-products [data-cm-business]').selectOption('c1');assert.equal(await product.locator('[name=name]').inputValue(),'仅业务一的未保存草稿');
  await page.screenshot({path:path.join(output,'products-desktop.png'),fullPage:true});
  await page.locator('[data-nav=prospecting]').click();await page.getByText('添加目标账号',{exact:true}).click();
  const target=page.locator('[data-cm-form=target]');await target.locator('[name=name]').fill('其他账号小林');await target.locator('[name=url]').fill('https://www.douyin.com/user/source1');await target.locator('[name=recordId]').fill('source1');await target.locator('[type=submit]').click();
  await page.getByText('添加这个账号的视频',{exact:true}).click();const work=page.locator('[data-cm-form=work]');await work.locator('[name=title]').fill('书桌照明怎么选');await work.locator('[name=url]').fill('https://www.douyin.com/video/123');await work.locator('[name=recordId]').fill('123');await work.locator('[type=submit]').click();
  await page.getByRole('button',{name:'查看评论',exact:true}).click();await page.getByText('导入真实评论',{exact:true}).click();
  const comments=page.locator('[data-cm-form=comments]');await comments.locator('[name=json]').fill(JSON.stringify([{recordId:'c1',authorId:'buyer1',authorName:'林小夏',text:'想买不用打孔的阅读灯，怎么选？',url:'https://www.douyin.com/video/123?comment=c1'},{recordId:'c2',parentRecordId:'c1',authorId:'source1',authorName:'其他账号小林',text:'视频这一款需要打孔',url:'https://www.douyin.com/video/123?comment=c2'},{recordId:'c3',authorId:'buyer2',authorName:'<img src=x onerror=alert(1)>',text:'<script>throw new Error("injected")</script>',url:'https://www.douyin.com/video/123?comment=c3'}]));await comments.locator('[name=source]').fill('隔离验收夹具');await comments.locator('[type=submit]').click();
  await page.locator('.cm-reply').waitFor();assert.equal(await page.locator('#cm-prospecting img').count(),0);
  const comment=page.locator('.cm-comment').filter({has:page.locator('header strong',{hasText:'林小夏'})}).first();await comment.getByText('核实或排除',{exact:true}).click();const review=comment.locator('[data-cm-form=review]').first();await review.locator('[name=note]').fill('核对原评论明确求推荐');await review.locator('[type=submit]').click();
  await page.getByRole('button',{name:'查看跟进',exact:true}).click();await page.getByText('新增一次购买需求',{exact:true}).click();const opform=page.locator('[data-cm-form=opportunity]').first();await opform.locator('[name=title]').fill('书桌照明');await opform.locator('[name=productIds]').first().check();await opform.locator('[name=stage]').selectOption('比较中');await opform.locator('[name=note]').fill('依据已核实原文');await opform.locator('[type=submit]').click();
  await page.getByRole('heading',{name:/书桌照明/}).waitFor();
  // Set up a real saved agent version and completed limited trial through authenticated APIs.
  const api=async(route,data)=>{const r=await context.request.post(`${origin}/api/acquisition/${route}`,{data});assert.ok(r.ok(),await r.text());return r.json();};
  result=await api('account',{customerId:'c1',platform:'抖音',name:'回复工作账号'});const acc=result.workspace.acquisition.accounts[0];
  result=await api('agent-create',{customerId:'c1'});let agent=result.workspace.acquisition.agents[0];
  result=await api('agent-save',{agentId:agent.id,baseVersion:1,config:{...agent.versions[0].config,criteria:'明确表达照明需求',bindings:[{accountId:acc.id,enabled:true}]}});
  const lead=result.workspace.acquisition.leads[0],op=result.workspace.acquisition.opportunities[0];
  await api('agent-trial',{agentId:agent.id,signalId:lead.signalIds[0]});
  for(let i=0;i<30;i++){result=await (await context.request.get(`${origin}/api/acquisition`)).json();if(result.workspace.acquisition.agentRuns[0].status!=='running')break;await new Promise(r=>setTimeout(r,100));}
  await api('agent-action',{agentId:agent.id,action:'enable'});
  await page.reload();await page.locator('#cm-workbench h1').waitFor();await page.locator('[data-nav=conversations]').click();
  const outreach=page.locator('[data-cm-form=outreach]');await outreach.locator('[name=agentId]').selectOption(agent.id);await outreach.locator('[name=accountId]').selectOption(acc.id);await outreach.locator('[name=signalId]').selectOption(lead.signalIds[0]);await outreach.locator('[type=submit]').click();
  await page.getByRole('button',{name:'复制草稿',exact:true}).waitFor();assert.ok((await page.locator('.cm-run').innerText()).includes('澄清模板'));
  assert.equal(await page.getByRole('button',{name:'配置自动回复',exact:true}).isEnabled(),true);
  await page.locator('.cm-sales-plan summary').click();assert.ok((await page.locator('.cm-sales-plan').innerText()).includes('阅读灯安装 FAQ'));await page.screenshot({path:path.join(output,'sales-strategy-desktop.png'),fullPage:true});
  await page.locator('[data-nav=workbench]').click();await page.getByRole('button',{name:'继续跟进',exact:true}).click();
  await page.getByRole('heading',{name:/书桌照明/}).waitFor();

  // Actual recording is separate from copying; one message does not implicitly mark a sale.
  await page.getByText('登记实际发送',{exact:true}).click();const sent=page.locator('[data-cm-form=sent]');await sent.locator('[name=sentAt]').fill('2026-01-01T10:30');await sent.locator('[name=note]').fill('隔离测试中模拟平台记录');await sent.locator('[name=confirmed]').check();await sent.locator('[type=submit]').click();await page.locator('#cm-conversations').getByText(/已发送 · 人工登记/).waitFor();
  result=await (await context.request.get(`${origin}/api/acquisition`)).json();assert.equal(result.workspace.acquisition.opportunities[0].stage,'比较中');
  await page.locator('#cm-conversations [data-cm-detail^="c1:new-op-"]').evaluate(el=>{el.open=true});const second=page.locator(`[data-cm-form=opportunity][data-id="${lead.id}"]`);await second.locator('[name=title]').fill('客厅吊灯');await second.locator('[name=stage]').selectOption('已成交');await second.locator('[name=note]').fill('历史成交记录');await second.locator('[type=submit]').click();
  await page.locator('.cm-op-tabs').getByText('客厅吊灯',{exact:true}).waitFor();
  assert.equal(await page.locator('.cm-op-tabs').getByText('比较中',{exact:true}).count(),1);assert.equal(await page.locator('.cm-op-tabs').getByText('已成交',{exact:true}).count(),1);
  await page.screenshot({path:path.join(output,'conversation-desktop.png'),fullPage:true});
  await page.locator('[data-nav=products]').click();await page.locator(`[data-cm=write-product][data-id="${p.id}"]`).click();await page.locator('#cm-content-scope [name=productIds]').first().waitFor();assert.equal(await page.locator(`#cm-content-scope [name=productIds][value="${p.id}"]`).isChecked(),true);
  async function contrastCheck(label) {
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const failures=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;return [p[0],p[1],p[2],p[3]/255];};
      const over=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
      const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      const failures=[];
      for(const el of document.querySelectorAll('.cm-root p,.cm-root label,.cm-root button,.cm-root input,.cm-root textarea,.cm-root select,.cm-root summary')){
        if(!el.getClientRects().length||el.disabled||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true}))continue;
        if([...document.querySelectorAll('details:not([open])')].some(d=>d.contains(el)&&!d.querySelector(':scope > summary')?.contains(el)))continue;
        const style=getComputedStyle(el);let bg=[255,255,255];const chain=[];for(let node=el;node;node=node.parentElement)chain.unshift(node);
        for(const node of chain)bg=over(rgba(getComputedStyle(node).backgroundColor),bg);
        const fg=over(rgba(style.color),bg),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        const size=parseFloat(style.fontSize),large=size>=24||(size>=18.66&&parseInt(style.fontWeight)>=700);
        if(ratio<(large?3:4.5))failures.push({text:(el.textContent||el.value||el.name).slice(0,60),ratio:Math.round(ratio*100)/100,color:style.color,bg});
      }
      return failures;
    });assert.deepEqual(failures,[],label+' contrast');
  }
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const view of ['workbench','content-home','products','prospecting','conversations']){
      await page.locator(`[data-nav=${view}]`).click();await contrastCheck(view+' '+theme);for(const width of [320,375,414,768]){
        await page.setViewportSize({width,height:844});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} ${theme} ${width}px overflow`);
      }
      await page.setViewportSize({width:375,height:844});
      await page.screenshot({path:path.join(output,`${view}-${theme}-mobile.png`),fullPage:false});
      await page.setViewportSize({width:1440,height:1100});
    }
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',flows:['sales knowledge approval and retrieval','strategy evidence','followup queue','products and SKU','business draft isolation','other account videos','nested comments and XSS','independent purchasing needs','agent bound context','limited draft','manual send evidence','content scope','responsive light/dark'],previews:output},null,2));
} catch(error) { if(currentPage){console.log('Visible errors',await currentPage.locator('.cm-error,.acq-error').allTextContents());await currentPage.screenshot({path:path.join(output,'failure.png'),fullPage:true});}throw error; } finally { if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}fs.rmSync(dir,{recursive:true,force:true}); }
