import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createHostedService} from './hosted-browser.mjs';
import {readHosted,saveHosted} from './hosted-browser-store.mjs';
import {platformPage,allowedResource} from './hosted-browser-runtime.mjs';
import {readWorkspace,writeWorkspace,publicWorkspace} from './workspace.mjs';
import {commerceAction} from './commerce-workspace.mjs';
import {queueCollection,hostedConnection} from './platform-connector.mjs';
import {importSignals,reviewSignal,leadAction} from './acquisition-workspace.mjs';
import {queueDelivery} from './browser-delivery.mjs';
const email='hosted@example.test',cwd=process.cwd();let dir,svc,rt,loggedIn;
const get=()=>readWorkspace(email).acquisition;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-hosted-test-'));process.chdir(dir);});
afterAll(()=>{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{fs.rmSync(path.join(dir,'data'),{recursive:true,force:true});writeWorkspace(email,{customers:[{id:'biz',name:'台灯',pitch:'台灯',hunt:'其他行业',packs:[],drops:[]}],ledger:[],contentStates:{},feedback:{}});loggedIn=false;rt={open:vi.fn(async()=>{}),actor:vi.fn(async()=>{if(!loggedIn)throw Object.assign(new Error('请登录'),{status:'login_required'});return {actorId:'self',profileUrl:'https://www.douyin.com/user/self'};}),state:vi.fn(async()=>({cookies:[{name:'fixture',value:'SECRET_SESSION',domain:'.douyin.com',path:'/'}],origins:[]})),frame:vi.fn(async()=>({image:'fixture',width:1280,height:900,url:'https://www.douyin.com/'})),click:vi.fn(async()=>{}),close:vi.fn(async()=>{}),collect:vi.fn(),prepare:vi.fn(async j=>({actorId:'self',text:j.text,targetUserId:j.targetUserId,commentId:j.commentId})),submit:vi.fn(async j=>({status:'succeeded',receipt:{platformId:'new-reply',actorId:'self',targetUserId:j.targetUserId,text:j.text,evidence:'fixture receipt'}})),inbox:vi.fn(async()=>[])};svc=createHostedService({makeRuntime:async()=>rt,available:()=>true,canRun:()=>true});});
afterEach(async()=>{await svc.stop();});

it('managed hosting cannot start, retry or enable execution',async()=>{
 expect(svc.list(email).available).toBe(false);
 await expect(svc.start(email,{customerId:'biz',platform:'抖音'})).rejects.toMatchObject({statusCode:410});
 await expect(svc.retry(email,{id:'legacy'})).rejects.toMatchObject({statusCode:410});
 expect(()=>svc.enable(email,{id:'legacy',enabled:true})).toThrow('已关闭');
 expect(rt.open).not.toHaveBeenCalled();
});
it('old enabled sessions never run or leak stored cookies and remain removable',async()=>{
 const id='00000000-0000-0000-0000-000000000001';
 saveHosted({id,email,customerId:'biz',platform:'抖音',status:'connected',executionEnabled:true,expiresAt:Date.now()+60000,storageState:{cookies:['SECRET']}});
 svc.startWorker();await svc.run(id);
 expect(rt.open).not.toHaveBeenCalled();expect(rt.submit).not.toHaveBeenCalled();expect(rt.inbox).not.toHaveBeenCalled();
 expect(svc.list(email).connections[0].executionEnabled).toBe(false);
 expect(JSON.stringify(svc.list(email))).not.toContain('SECRET');
 await expect(svc.disconnect('other@example.test',{id})).rejects.toThrow();
 await svc.disconnect(email,{id});expect(readHosted(id,email).storageState).toBeUndefined();
});
it('does not accept arbitrary browser destinations or internal resources',()=>{
 for(const u of ['http://www.douyin.com/','https://localhost/','https://www.douyin.com.evil.test/','https://user:pass@www.douyin.com/'])expect(()=>platformPage(u,'抖音')).toThrow();
 expect(allowedResource('http://127.0.0.1:5173/api/me','抖音')).toBe(false);
});
