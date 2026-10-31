// Isolated browser acceptance, with synthetic data and no platform requests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readWorkspace,writeWorkspace} from '../lib/workspace.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-identity-ui-'));
const previous=process.cwd(),email='66445039@qq.com';let server,browser;
try {
 for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
 process.chdir(dir);writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'测试业务',hunt:'家装',pitch:'厨房改造',packs:[],drops:[]}],usingId:'c1',acquisition:{accounts:[{id:'xhs',customerId:'c1',platform:'小红书',name:'验收账号'}],publications:[]}});process.chdir(previous);
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'fixture-password-123',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});server.stdout.resume();server.stderr.resume();
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('测试服务启动失败');})]);
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});const context=await browser.newContext(),origin=`http://127.0.0.1:${port}`;
 assert.equal((await context.request.post(origin+'/api/login',{data:{email,password:'fixture-password-123'}})).status(),200);
 const registration={customerId:'c1',accountId:'xhs',title:'小红书主页作品',url:'https://www.xiaohongshu.com/user/profile/user123/abc123?xsec=one',publishedAt:'2026-01-01T10:00:00Z',confirmed:true};
 assert.equal((await context.request.post(origin+'/api/owned-publication',{data:registration})).status(),200);
 const duplicate=await context.request.post(origin+'/api/owned-publication',{data:{...registration,url:'https://www.xiaohongshu.com/explore/abc123?xsec=two'}});assert.equal(duplicate.status(),400);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/');await page.locator('#cm-workbench h1').waitFor();await page.locator('[data-nav=content-home]').click();await page.locator('[data-content-tab=review]').click();
 const review=page.locator('#cm-content-home [aria-label="账号复盘"]');await review.locator('summary').filter({hasText:'批量导入作品效果 CSV'}).click();const form=review.locator('[data-cm-form=owned-csv-preview]');
 await form.locator('[name=start]').fill('2026-01-01');await form.locator('[name=end]').fill('2026-01-02');await form.locator('[name=source]').fill('验收后台');await form.locator('[name=csv]').fill('平台,作品链接,阅读量\n小红书,https://www.xiaohongshu.com/explore/abc123?xsec=three,100');await form.getByRole('button',{name:'预览匹配'}).click();
 const preview=page.locator('[aria-label="CSV 导入预览"]');await preview.getByText('小红书主页作品',{exact:false}).waitFor();await preview.locator('[name=confirmed]').check();const saved=page.waitForResponse(r=>r.url().endsWith('/api/owned-outcomes-import'));await preview.getByRole('button',{name:'确认导入全部记录'}).click();assert.equal((await saved).status(),200);
 process.chdir(dir);const c=readWorkspace(email).customers[0];process.chdir(previous);assert.equal(c.accountReviewOutcomes[0].metrics.views,100);assert.deepEqual(errors,[]);console.log('PASS: XHS profile work link deduplicates and matches review CSV via the detail URL');
} finally {await browser?.close();if(server&&server.exitCode===null&&server.signalCode===null){server.kill();await once(server,'exit').catch(()=>{});}process.chdir(previous);fs.rmSync(dir,{recursive:true,force:true});}
