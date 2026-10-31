// End-to-end review suggestions, explicit adoption, and stale-draft protection.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {writeWorkspace,readWorkspace} from '../lib/workspace.mjs';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-review-ui-'));
const output=path.join(root,'output/axon-ui');fs.mkdirSync(output,{recursive:true});
let server,browser,page;
try{
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  const previous=process.cwd();process.chdir(dir);writeWorkspace('66445039@qq.com',{seedVersion:999,customers:[{id:'c1',name:'复盘建议验收',pitch:'厨房设计',hunt:'家装',drops:[],packs:[]}],usingId:'c1'});process.chdir(previous);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));const origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'isolated-review-password',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server exited');})]);
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const post=async(url,data)=>{const r=await context.request.post(origin+url,{data});assert.ok(r.ok(),await r.text());return r.json();};
  const workspace=async()=>{const r=await context.request.get(origin+'/api/acquisition');return (await r.json()).workspace;};
  await post('/api/login',{email:'66445039@qq.com',password:'isolated-review-password'});
  await post('/api/acquisition/account',{customerId:'c1',name:'厨房账号',platform:'抖音'});const accountId=(await workspace()).acquisition.accounts[0].id;
  for(const [index,title,views,leads] of [[1,'高流量作品',1000,1],[2,'高客资作品',200,5]]){
    await post('/api/owned-publication',{customerId:'c1',accountId,title,body:'仅提供厨房设计建议',url:`https://www.douyin.com/video/1234500${index}`,publishedAt:'2026-01-01T12:00:00Z',confirmed:true});
    const publication=(await workspace()).acquisition.publications.find(p=>p.content.title===title);
    await post('/api/owned-publication-outcome',{customerId:'c1',publicationId:publication.id,start:'2026-01-01',end:'2026-01-07',source:'隔离后台样本',criteria:'按联系人去重',metrics:{views,qualifiedLeads:leads}});
  }
  process.chdir(dir);const evidenceSpace=readWorkspace('66445039@qq.com'),reviewCustomer=evidenceSpace.customers.find(c=>c.id==='c1'),tagged=reviewCustomer.accountReviewOutcomes.find(r=>r.content.title==='高流量作品');tagged.contentJob='divert';tagged.creatorPack={id:'confirmed-play',name:'人工确认打法',version:1,attribution:'user-confirmed'};writeWorkspace('66445039@qq.com',evidenceSpace);process.chdir(previous);
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#cm-workbench h1').waitFor();await page.locator('[data-nav=content-home]').click();await page.getByRole('tab',{name:'账号复盘',exact:true}).click();
  await page.getByText(/内容任务：引流/).first().waitFor();
  await page.getByText(/打法：人工确认打法 v1（人工确认）/).first().waitFor();
  const memory=page.locator('[data-cm-form=account-review-memory]');await memory.locator('..').locator('summary').first().click();
  // A pristine form must follow refreshed evidence; hidden input .value also
  // changes its defaultValue, so that attribute cannot restore the new basis.
  {
    const p=(await workspace()).acquisition.publications.find(p=>p.content.title==='高流量作品');
    const card=page.locator(`[data-cm-detail="c1:owned-${p.id}"]`);await card.locator('summary').first().click();await card.getByText('记录 / 更新效果',{exact:true}).click();
    const f=card.locator('[data-cm-form=owned-outcome]');await f.locator('[name=start]').fill('2026-01-01');await f.locator('[name=end]').fill('2026-01-07');await f.locator('[name=source]').fill('空白表单期间更新');await f.locator('[name=criteria]').fill('按联系人去重');await f.locator('[name=metric-views]').fill('1100');await f.locator('[name=metric-qualifiedLeads]').fill('1');
    const updated=page.waitForResponse(r=>r.url().endsWith('/api/owned-publication-outcome'));await f.locator('[type=submit]').click();assert.ok((await updated).ok());await card.getByText(/最新记录：.*阅读 \/ 播放 1100/).waitFor();
    assert.equal(await memory.locator('[name=text]').inputValue(),'');assert.equal(JSON.parse(await memory.locator('[name=basis]').inputValue())[4].find(r=>r[0]===p.id)[2],1100,'Pristine form uses the refreshed comparison');
    await card.locator('summary').first().click();
  }
  await memory.locator('.cm-review-suggestions summary').click();
  const dual=memory.locator('article').filter({has:page.getByRole('heading',{name:'流量与客资分开看'})});
  await dual.getByRole('button',{name:'填入此建议（替换输入框）'}).click();
  const proposed=await memory.locator('[name=text]').inputValue();assert.ok(proposed.includes('不用总播放量代替获客效果'));
  assert.equal(((await workspace()).customers[0].creatorMemories||[]).length,0,'Choosing a suggestion is not adoption');
  const basis=await memory.locator('[name=basis]').inputValue();
  // Saving another outcome refreshes the workspace while preserving the unsaved hypothesis.
  const publication=(await workspace()).acquisition.publications.find(p=>p.content.title==='高流量作品');
  const card=page.locator(`[data-cm-detail="c1:owned-${publication.id}"]`);await card.locator('summary').first().click();
  await card.getByText('记录 / 更新效果',{exact:true}).click();const outcome=card.locator('[data-cm-form=owned-outcome]');
  await outcome.locator('[name=start]').fill('2026-01-01');await outcome.locator('[name=end]').fill('2026-01-07');await outcome.locator('[name=source]').fill('更新后台样本');await outcome.locator('[name=criteria]').fill('按联系人去重');await outcome.locator('[name=metric-views]').fill('1200');await outcome.locator('[name=metric-qualifiedLeads]').fill('1');
  const changed=page.waitForResponse(r=>r.url().endsWith('/api/owned-publication-outcome'));await outcome.locator('[type=submit]').click();assert.ok((await changed).ok());await card.getByText(/最新记录：.*阅读 \/ 播放 1200/).waitFor();
  assert.equal(await memory.locator('[name=text]').inputValue(),proposed);assert.equal(await memory.locator('[name=basis]').inputValue(),basis);
  await memory.getByRole('button',{name:'采用为创作记忆',exact:true}).click();await memory.getByRole('alert').filter({hasText:'对照数据已变化'}).waitFor();assert.equal(((await workspace()).customers[0].creatorMemories||[]).length,0);
  await memory.getByRole('button',{name:'我已重新核对当前对照'}).click();assert.notEqual(await memory.locator('[name=basis]').inputValue(),basis);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/account-review-memory'));await memory.getByRole('button',{name:'采用为创作记忆',exact:true}).click();assert.ok((await saved).ok());
  const adopted=(await workspace()).customers[0].creatorMemories[0];assert.equal(adopted.text,proposed);assert.equal(adopted.evidence.rows.find(r=>r.publicationId===publication.id).views,1200);
  await page.locator('[data-cm-detail="c1:account-review-memories"] > summary').click();await page.getByText(/当前证据可用/).waitFor();
  if(!await memory.locator('..').evaluate(el=>el.open))await memory.locator('..').locator('summary').first().click();if(!await memory.locator('.cm-review-suggestions').evaluate(el=>el.open))await memory.locator('.cm-review-suggestions > summary').click();await memory.locator('.cm-review-suggestions').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'account-review-suggestions.png')});
  await post('/api/owned-publication-outcome',{customerId:'c1',publicationId:publication.id,start:'2026-01-01',end:'2026-01-07',source:'再次更新',criteria:'按联系人去重',metrics:{views:1300,qualifiedLeads:1}});
  await page.reload();await page.locator('[data-nav=content-home]').click();await page.getByRole('tab',{name:'账号复盘',exact:true}).click();await page.locator('[data-cm-detail="c1:account-review-memories"] > summary').click();await page.locator('#content-review').getByText(/对照已变化，暂停用于创作/).waitFor();
  const channelsAccount=page.locator('[data-cm-detail="c1:owned-account"]');if(!await channelsAccount.evaluate(el=>el.open))await channelsAccount.locator('summary').click();const channelsForm=channelsAccount.locator('[data-cm-form=review-account]');await channelsForm.locator('[name=platform]').selectOption('视频号');await channelsForm.locator('[name=name]').fill('验收视频号');const channelsSaved=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/account'));await channelsForm.getByRole('button',{name:'登记账号'}).click();assert.ok((await channelsSaved).ok());
  const channelsImport=page.locator('[data-cm-detail="c1:owned-import"]');if(!await channelsImport.evaluate(el=>el.open))await channelsImport.locator('summary').click();const channelsPost=channelsImport.locator('[data-cm-form=owned-publication]');await channelsPost.locator('[name=accountId]').selectOption({label:'视频号 · 验收视频号'});await channelsPost.locator('[name=title]').fill('验收视频号作品');await channelsPost.locator('[name=url]').fill('https://example.com/channels/post');await channelsPost.locator('[name=publishedAt]').fill('2026-01-01T12:00');await channelsPost.locator('[name=confirmed]').check();const channelsPublished=page.waitForResponse(r=>r.url().endsWith('/api/owned-publication'));await channelsPost.getByRole('button',{name:'登记作品'}).click();assert.ok((await channelsPublished).ok());const channelsPub=(await workspace()).acquisition.publications.find(p=>p.content?.title==='验收视频号作品');assert.equal(channelsPub.platform,'视频号');
  const channelsCard=page.locator(`[data-cm-detail="c1:owned-${channelsPub.id}"]`);if(!await channelsCard.evaluate(el=>el.open))await channelsCard.locator('summary').first().click();await channelsCard.getByText('记录 / 更新效果',{exact:true}).click();const channelsOutcome=channelsCard.locator('[data-cm-form=owned-outcome]');await channelsOutcome.locator('[name=start]').fill('2026-01-01');await channelsOutcome.locator('[name=end]').fill('2026-01-07');await channelsOutcome.locator('[name=source]').fill('隔离后台样本');await channelsOutcome.locator('[name=metric-views]').fill('23');const channelsMeasured=page.waitForResponse(r=>r.url().endsWith('/api/owned-publication-outcome'));await channelsOutcome.getByRole('button',{name:'保存效果记录'}).click();assert.ok((await channelsMeasured).ok());await channelsCard.getByText(/阅读 \/ 播放 23/).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: distinct reach/lead suggestions, explicit adoption, stale unsaved evidence rejection, reconfirmation, and later memory invalidation');
}catch(error){console.error(error.message);if(page)await page.screenshot({path:path.join(output,'review-failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{server?.kill('SIGTERM');await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
