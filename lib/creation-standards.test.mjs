import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {saveCreationStandards} from './growth-workspace.mjs';
import {saveAccount,preparePublication} from './acquisition-workspace.mjs';
import {normalizeStandardRules,standardRuleChecks,automaticStandardBlocks,standardReviewBasis,standardsBrief} from '../js/creation-standards.js';
const email='standards@example.test',root=process.cwd();let dir;
const content={title:'厨房翻新先问什么',cover:'先核对使用需求',body:'厨房翻新前，记录做饭习惯和收纳需求，再与服务方核对施工安排和报价项目。不要只比较总价。'};
const rule=(extra={})=>({id:'rule-one',title:'报价原话',rule:'报价',mode:'forbid',severity:'block',...extra});
const get=()=>readWorkspace(email);
const save=(rules,version=0)=>saveCreationStandards(email,{customerId:'c1',version,rules});
const args=()=>({customerId:'c1',packId:'p1',platform:'小红书',index:0,accountId:get().acquisition.accounts[0].id});
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-standards-test-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'厨房设计',hunt:'家装',pitch:'厨房翻新',drops:[{id:'p1',tier:'今日',shells:{小红书:[content]},copies:{}}]}],contentStates:{}});saveAccount(email,{customerId:'c1',platform:'小红书',name:'工作账号'});});
it('distinguishes exact phrase checks from unverified manual judgments and preserves warnings',()=>{
 const standards={rules:[rule(),rule({id:'rule-two',mode:'require',rule:'尺寸',severity:'warn'}),rule({id:'rule-three',mode:'manual',rule:'请核对证据'})]};
 expect(standardRuleChecks(content,standards).map(r=>r.status)).toEqual(['issue','issue','review']);
 expect(automaticStandardBlocks(content,standards)).toHaveLength(1);
 expect(standardRuleChecks({title:'尺寸'}, {rules:[rule({mode:'require',rule:'尺寸'})]})[0].status).toBe('pass');
 expect(standardsBrief({creationStandards:standards})).toContain('请核对证据');
});
it('rejects malformed rules atomically and does not clear rules through legacy saves',()=>{
 save([rule()]);const before=get().customers[0].creationStandards;
 for(const rules of [[rule(),rule()],[rule({mode:'guess'})],[rule({severity:'pass'})],[rule({rule:''})],Array.from({length:41},(_,i)=>rule({id:'rule-'+i}))])expect(()=>save(rules,1)).toThrow();
 expect(get().customers[0].creationStandards).toEqual(before);
 saveCreationStandards(email,{customerId:'c1',version:1,preferences:'简短'});expect(get().customers[0].creationStandards.rules).toEqual([rule()]);
 expect(()=>save([],1)).toThrow('已被修改');
 expect(()=>saveCreationStandards('another@example.test',{customerId:'c1',version:2,rules:[]})).toThrow('没有这个客户');
});
it('enforces blocking rules server-side; severity changes keep history and allow warning-only preparation',()=>{
 save([rule()]);expect(()=>preparePublication(email,args())).toThrow('报价原话');expect(get().acquisition.publications).toHaveLength(0);
 save([rule({severity:'warn'})],1);preparePublication(email,args());const pub=get().acquisition.publications[0];
 expect(pub.standardReview.checks[0]).toMatchObject({severity:'warn',status:'issue'});expect(pub.standardReview.version).toBe(2);
 expect(get().customers[0].creationStandardsHistory.at(-1).rules[0].severity).toBe('block');
});
it('manual blocking rules require explicit confirmation tied to both content and current standards',()=>{
 save([rule({mode:'manual',rule:'已核实业务事实'})]);let c=get().customers[0];const basis=standardReviewBasis(content,c.creationStandards);
 expect(()=>preparePublication(email,args())).toThrow('人工创作规则');
 expect(()=>preparePublication(email,{...args(),standardReviewBasis:basis,standardConfirmations:['forged']})).toThrow('人工创作规则');
 const reviewed={...args(),standardReviewBasis:basis,standardConfirmations:['rule-one']};preparePublication(email,reviewed);expect(get().acquisition.publications[0].standardReview.confirmedRuleIds).toEqual(['rule-one']);
 save([rule({mode:'manual',rule:'另一个新要求'})],1);expect(()=>preparePublication(email,reviewed)).toThrow('人工创作规则');
 c=get().customers[0];preparePublication(email,{...reviewed,standardReviewBasis:standardReviewBasis(content,c.creationStandards)});expect(get().acquisition.publications).toHaveLength(2);
 const changed=get();changed.customers[0].drops[0].shells.小红书[0].body+='请先测量尺寸。';writeWorkspace(email,changed);
 expect(()=>preparePublication(email,{...reviewed,standardReviewBasis:standardReviewBasis(content,c.creationStandards)})).toThrow('人工创作规则');
});
it('deleting rules affects future checks and preserves earlier publication snapshots',()=>{
 save([rule({severity:'warn'})]);preparePublication(email,args());save([],1);
 expect(get().customers[0].creationStandards.rules).toEqual([]);expect(get().acquisition.publications[0].standardReview.checks[0].title).toBe('报价原话');
});
