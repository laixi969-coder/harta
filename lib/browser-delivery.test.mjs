import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {saveAccount,importSignals,reviewSignal,leadAction} from './acquisition-workspace.mjs';
import {commerceAction} from './commerce-workspace.mjs';
import {issuePairing,redeemPairing,authenticateConnector,revokeConnection} from './platform-connector.mjs';
import {bindDeliveryIdentity,queueDelivery,claimDelivery,authorizeDelivery,completeDelivery,cancelDelivery,deliveryState,saveReplyRule,receiveBrowserEvents,replyMonitors} from './browser-delivery.mjs';
const email='send@example.test',cwd=process.cwd();let dir,r,account,lead,message,work;
const get=()=>readWorkspace(email).acquisition;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-delivery-test-'));process.chdir(dir);});
afterAll(()=>{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{fs.rmSync(path.join(dir,'data'),{recursive:true,force:true});writeWorkspace(email,{customers:[{id:'c1',name:'台灯',pitch:'台灯',hunt:'其他行业',packs:[],drops:[]}],contentStates:{},ledger:[],feedback:{}});saveAccount(email,{customerId:'c1',platform:'抖音',name:'自己的账号'});account=get().accounts[0];r=authenticateConnector(redeemPairing({code:issuePairing(email,{accountId:account.id}).code}).token);bindDeliveryIdentity(email,{connectionId:r.id,profileUrl:'https://www.douyin.com/user/me123',confirmed:true});commerceAction(email,{action:'target',customerId:'c1',name:'目标',platform:'抖音',url:'https://www.douyin.com/user/target1'});commerceAction(email,{action:'work',customerId:'c1',targetId:get().targets[0].id,title:'台灯',url:'https://www.douyin.com/video/123'});work=get().works[0];importSignals(email,{customerId:'c1',workId:work.id,source:'测试原文',rows:[{platform:'抖音',recordId:'comment01',authorId:'buyer1',authorUrl:'https://www.douyin.com/user/buyer1',authorName:'买家',url:work.url,text:'台灯多少钱'}]});reviewSignal(email,{signalId:get().signals[0].id,action:'confirm',note:'核对原文'});lead=get().leads[0];leadAction(email,{action:'draft',leadId:lead.id,accountId:account.id,channel:'评论',recipient:work.url,text:'请问您需要哪种台灯？'});message=get().leads[0].messages[0];});

it('rejects platform sends, publication and automatic replies without changing drafts',()=>{
 for(const kind of ['reply','dm','publish'])expect(()=>queueDelivery(email,{connectionId:r.id,kind,leadId:lead.id,messageId:message.id,confirmed:true})).toThrow('已关闭');
 expect(()=>authorizeDelivery(r,{jobId:'old',lease:'old'})).toThrow('已关闭');
 expect(()=>saveReplyRule(email,{connectionId:r.id,confirmed:true})).toThrow('已关闭');
 expect(()=>receiveBrowserEvents(r,{rows:[]})).toThrow('已关闭');
 expect(get().leads[0].messages[0].status).toBe('draft');
});
it('cancels legacy unsubmitted jobs, preserves uncertain results and disables rules',()=>{
 const s=readWorkspace(email);
 s.acquisition.deliveryJobs=['queued','preparing','submitting','succeeded'].map((status,i)=>({id:'j'+i,connectionId:r.id,status,startedAt:new Date().toISOString()}));
 s.acquisition.replyRules=[{id:'rule',connectionId:r.id,enabled:true,revision:1}];writeWorkspace(email,s);
 expect(claimDelivery(r)).toBeNull();expect(replyMonitors(r)).toEqual([]);
 const state=deliveryState(email);expect(state.jobs.map(j=>j.status)).toEqual(['succeeded','unknown','cancelled','cancelled']);
 expect(state.rules[0]).toMatchObject({enabled:false,revision:2});
 expect(()=>authorizeDelivery(r,{jobId:'j1'})).toThrow('已关闭');
});
it('manual copy validation remains available and contact refusal still blocks it',()=>{
 expect(()=>leadAction(email,{leadId:lead.id,messageId:message.id,action:'check-copy'})).not.toThrow();
 leadAction(email,{leadId:lead.id,action:'block',note:'对方拒绝'});
 expect(()=>leadAction(email,{leadId:lead.id,messageId:message.id,action:'check-copy'})).toThrow();
});
it('another user cannot pause a stored legacy rule',()=>{
 const s=readWorkspace(email);s.acquisition.replyRules=[{id:'mine',enabled:true,revision:1}];writeWorkspace(email,s);
 expect(()=>saveReplyRule('other@example.test',{id:'mine',action:'pause'})).toThrow();
 expect(get().replyRules[0].enabled).toBe(true);
 saveReplyRule(email,{id:'mine',action:'pause'});expect(get().replyRules[0].enabled).toBe(false);
});
