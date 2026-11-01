// Isolated browser verification; no platform or model requests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {writeWorkspace} from '../lib/workspace.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-reply-ui-'));
const previous=process.cwd(),email='66445039@qq.com';let server,browser;
try {
 for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
 process.chdir(dir);
 const inbound={id:'in',direction:'inbound',accountId:'a',channel:'私信',receivedAt:'2026-01-01T00:00:00Z'},sent={id:'sent',direction:'outbound',status:'sent_manual',replyTo:'in',sentAt:'2026-01-02T00:00:00Z'};
 const lead={customerId:'c1',platform:'抖音',stage:'沟通中',sourcePaths:['active'],signalIds:[],events:[],updatedAt:'2026-01-03T00:00:00Z'};
 writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'测试业务',hunt:'家装',pitch:'厨房改造',packs:[],drops:[]}],usingId:'c1',acquisition:{leads:[{...lead,id:'done',authorName:'已回复访客',needsReply:true,messages:[inbound,sent]},{...lead,id:'pending',authorName:'另一账号待回复',needsReply:false,messages:[inbound,sent,{id:'other',direction:'inbound',accountId:'b',channel:'私信',receivedAt:'2026-01-03T00:00:00Z'}]}]}});
 process.chdir(previous);
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),HARTA_SETUP_PASSWORD:'fixture-password-123',HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});server.stdout.resume();server.stderr.resume();
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('测试服务启动失败');})]);
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});const context=await browser.newContext(),origin=`http://127.0.0.1:${port}`;
 assert.equal((await context.request.post(origin+'/api/login',{data:{email,password:'fixture-password-123'}})).status(),200);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/');await page.locator('#cm-workbench h1').waitFor();
 const today=await page.locator('#acq-today').textContent();assert.match(today,/先处理 另一账号待回复 的咨询/);assert.doesNotMatch(today,/先处理 已回复访客/);const active=page.locator('.studio-lane-active');const pending=active.locator('dl div').filter({has:page.getByText('待回复联系人',{exact:true})});assert.equal((await pending.locator('dd').innerText()).trim(),'1');
 await page.locator('[data-nav=conversations]').click();await page.locator('#cm-conversations .cm-support > summary').click();await page.getByRole('button',{name:'未关联需求的历史会话',exact:true}).click();
 await page.locator('[data-acq-stage]').selectOption('reply');
 const list=await page.locator('#acq-leads').textContent();assert.match(list,/另一账号待回复/);assert.doesNotMatch(list,/已回复访客/);
 assert.deepEqual(errors,[]);console.log('PASS: actual conversation state drives reply summary and filtering across accounts');
} finally {await browser?.close();if(server&&server.exitCode===null&&server.signalCode===null){server.kill();await once(server,'exit').catch(()=>{});}process.chdir(previous);fs.rmSync(dir,{recursive:true,force:true});}
