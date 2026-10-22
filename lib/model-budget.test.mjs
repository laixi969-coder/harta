import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { withBusinessModelBudget, RequestBudgetError } from './model-budget.mjs';
import { openScopedStore } from './scoped-store.mjs';
import { requestBudgetStore } from './request-budget-core.mjs';
import { chat, chatWithImages } from './llm.mjs';
import { hartaModelAdapter } from './openfind-model.mjs';
import { writeWorkspace, readWorkspace, dropToday } from './workspace.mjs';
import { importSignals, reviewSignal, generateContactSuggestion } from './acquisition-workspace.mjs';
import { createAgent, startAgentTrial } from './business-agents.mjs';
import { generateTodayDrop } from './generate.mjs';
import { MODEL_SELECTION_VERSION } from './model-selection.mjs';
const root=process.cwd(),email='budget@example.test';let dir;
const scope=(customerId='c1',owner=email)=>path.join(dir,'data/openfind',createHash('sha256').update(JSON.stringify([owner.toLowerCase(),customerId])).digest('hex'),'engine');
function useStore(fn,customerId='c1',owner=email){const {db}=openScopedStore(scope(customerId,owner));try{return fn(requestBudgetStore(db),db);}finally{db.close();}}
const policy=(n,customerId='c1')=>useStore(b=>b.save({flowLimit:20,dailyLimit:20,modelDailyLimit:n}),customerId);
const status=(customerId='c1',owner=email)=>useStore(b=>b.status(),customerId,owner);
const body=text=>Response.json({choices:[{message:{content:text}}]});
function configure(kind='openai'){
 fs.mkdirSync(path.join(dir,'data'),{recursive:true});
 fs.writeFileSync(path.join(dir,'data/llm.json'),JSON.stringify({active:'custom',providers:{custom:{name:'Mock',kind,baseUrl:'https://model.example.test/v1',model:'fixture',apiKey:'fixture',models:['fixture'],enabled:['fixture'],modelSelectionVersion:MODEL_SELECTION_VERSION}}}));
}
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-model-budget-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);configure();});
afterEach(()=>{vi.unstubAllGlobals();process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
it('content and sales share persisted quota with worker review; nested requests are not double charged',async()=>{
 policy(3);useStore(b=>b.reserve('harta-qualification-model','model','review'));
 const transport=vi.fn(async()=>body('draft'));vi.stubGlobal('fetch',transport);
 await withBusinessModelBudget(email,'c1','content-generation',()=>withBusinessModelBudget(email,'c1','sales-draft',()=>chat({user:'one'})),'content-job');
 await withBusinessModelBudget(email,'c1','sales-draft',()=>chat({user:'two'}),'sales-job');
 await expect(withBusinessModelBudget(email,'c1','content-generation',()=>chat({user:'blocked'}))).rejects.toBeInstanceOf(RequestBudgetError);
 expect(transport).toHaveBeenCalledTimes(2);expect(status().today.model).toBe(3);expect(status().today.providers).toEqual({'harta-qualification-model':1,'content-generation':1,'sales-draft':1});
 policy(4);await withBusinessModelBudget(email,'c1','sales-draft',()=>chat({user:'raised'}));expect(status().today.model).toBe(4);
});
it('concurrent businesses and accounts stay isolated, and aborted or unconfigured calls cost nothing',async()=>{
 policy(1);policy(1,'c2');const transport=vi.fn(async()=>{await new Promise(r=>setTimeout(r,5));return body('ok');});vi.stubGlobal('fetch',transport);
 await Promise.all([withBusinessModelBudget(email,'c1','content-generation',()=>chat({user:'a'})),withBusinessModelBudget(email,'c2','sales-draft',()=>chat({user:'b'})),withBusinessModelBudget('other@example.test','c1','sales-draft',()=>chat({user:'c'}))]);
 for(const [id,owner] of [['c1',email],['c2',email],['c1','other@example.test']])expect(status(id,owner).today.model).toBe(1);
 await expect(withBusinessModelBudget(email,'empty','content-generation',()=>chat({user:'aborted',signal:AbortSignal.abort()}))).rejects.toThrow();expect(status('empty').today.model).toBe(0);
 fs.rmSync(path.join(dir,'data/llm.json'));await expect(withBusinessModelBudget(email,'empty','content-generation',()=>chat({user:'missing key'}))).rejects.toThrow();expect(status('empty').today.model).toBe(0);expect(transport).toHaveBeenCalledTimes(3);
});
it.each(['openai','anthropic'])('failed %s transport consumes one attempt and budget failure never reaches transport',async kind=>{
 configure(kind);policy(1);const transport=vi.fn(async()=>{throw new Error('network');});vi.stubGlobal('fetch',transport);
 await expect(withBusinessModelBudget(email,'c1','sales-draft',()=>chat({user:'draft'}))).rejects.toThrow('network');
 await expect(withBusinessModelBudget(email,'c1','sales-draft',()=>chat({user:'retry'}))).rejects.toThrow('额度');expect(transport).toHaveBeenCalledTimes(1);expect(status().today.model).toBe(1);
});
it('sales generation reserves its review and correction calls, returning no unchecked draft on exhaustion',async()=>{
 writeWorkspace(email,{customers:[{id:'c1',name:'家装服务',hunt:'家装',city:'杭州',pitch:'厨房翻新',track:'存量',packs:[],drops:[]}]});
 importSignals(email,{customerId:'c1',source:'原始评论',rows:[{platform:'小红书',text:'想找杭州厨房翻新服务',url:'https://www.xiaohongshu.com/explore/source',authorId:'buyer',recordId:'comment',authorName:'客户'}]});
 reviewSignal(email,{signalId:readWorkspace(email).acquisition.signals[0].id,action:'confirm',note:'核对需求'});const leadId=readWorkspace(email).acquisition.leads[0].id;
 policy(2);const transport=vi.fn(async()=>body('方便说明厨房的主要使用需求吗？'));vi.stubGlobal('fetch',transport);
 // A review reports an issue after its own model request; the corrective draft
 // must be blocked by the same budget, without returning an unreviewed draft.
 const review=async()=>{await chat({user:'review'});return ['需要修正'];};
 await expect(generateContactSuggestion(email,{leadId},{review})).rejects.toThrow('模型请求额度');expect(transport).toHaveBeenCalledTimes(2);expect(status().today.providers['sales-draft']).toBe(2);expect(readWorkspace(email).acquisition.leads[0].messages).toEqual([]);
 const template=await generateContactSuggestion(email,{leadId},{ready:()=>false});expect(template.method).toBe('template');expect(status().today.model).toBe(2);
});
it('real content generation stops at exhausted planning budget rather than retrying or silently falling back',async()=>{
 policy(1);useStore(b=>b.reserve('sales-draft','model','prior'));
 const transport=vi.fn(async()=>body('{}'));vi.stubGlobal('fetch',transport);
 await expect(withBusinessModelBudget(email,'c1','content-generation',()=>generateTodayDrop({id:'c1',name:'家装',hunt:'家装',city:'杭州',pitch:'厨房翻新',track:'存量',packs:[],drops:[]}))).rejects.toBeInstanceOf(RequestBudgetError);
 expect(transport).not.toHaveBeenCalled();expect(status().today.model).toBe(1);
});
it('visual fallback counts every attempted provider and stops immediately at budget',async()=>{
 const file=path.join(dir,'data/llm.json'),config=JSON.parse(fs.readFileSync(file));config.providers.custom.vision='on';config.providers.second={...config.providers.custom,name:'second'};fs.writeFileSync(file,JSON.stringify(config));policy(1);
 const transport=vi.fn(async()=>{throw new Error('offline');});vi.stubGlobal('fetch',transport);
 await expect(withBusinessModelBudget(email,'c1','content-generation',()=>chatWithImages({user:'read image',images:[]}))).rejects.toBeInstanceOf(RequestBudgetError);expect(transport).toHaveBeenCalledTimes(1);expect(status().today.model).toBe(1);
});
it('managed comment review adapter does not debit a second time',async()=>{
 policy(2);useStore(b=>b.reserve('harta-qualification-model','model','worker'));
 vi.stubGlobal('fetch',vi.fn(async()=>body('{"ok":true}')));await hartaModelAdapter.complete([{role:'user',content:'review'}]);expect(status().today.model).toBe(1);
});
it('independent processes cannot race past the shared daily quota',async()=>{
 policy(1);const storeUrl=pathToFileURL(path.join(root,'lib/scoped-store.mjs')).href,budgetUrl=pathToFileURL(path.join(root,'lib/request-budget-core.mjs')).href;
 const code=`import {openScopedStore} from ${JSON.stringify(storeUrl)};import {requestBudgetStore,RequestBudgetError} from ${JSON.stringify(budgetUrl)};const {db}=openScopedStore(process.argv[1]);try{requestBudgetStore(db).reserve('content-generation','model',String(process.pid));}catch(e){if(e instanceof RequestBudgetError)process.exitCode=2;else throw e;}finally{db.close();}`;
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,scope()],{stdio:'ignore'});child.on('error',reject);child.on('exit',resolve);});
 expect((await Promise.all([run(),run(),run()])).sort()).toEqual([0,2,2]);expect(status().today.model).toBe(1);
});

it('background content jobs retain their business budget and record actionable failures',async()=>{
 writeWorkspace(email,{customers:[{id:'c1',name:'家装',hunt:'家装',pitch:'厨房翻新',track:'存量',packs:[],drops:[]}]});policy(1);useStore(b=>b.reserve('sales-draft','model','prior'));
 const transport=vi.fn(async()=>body('{}'));vi.stubGlobal('fetch',transport);const result=dropToday(email,'c1');expect(result.error).toBeUndefined();
 for(let i=0;i<100&&readWorkspace(email).customers[0].job;i++)await new Promise(r=>setTimeout(r,5));
 const customer=readWorkspace(email).customers[0];expect(customer.job).toBeNull();expect(customer.lastFail).toContain('模型请求额度');expect(customer.drops).toEqual([]);expect(transport).not.toHaveBeenCalled();
});
it('agent trial shares the budget and preserves a quota error instead of a generic model failure',async()=>{
 writeWorkspace(email,{customers:[{id:'c1',name:'家装',hunt:'家装',pitch:'厨房翻新',track:'存量',packs:[],drops:[]}]});createAgent(email,{customerId:'c1'});const agentId=readWorkspace(email).acquisition.agents[0].id;policy(1);useStore(b=>b.reserve('content-generation','model','prior'));
 const transport=vi.fn(async()=>body('方便说明厨房需求吗？'));vi.stubGlobal('fetch',transport);
 await startAgentTrial(email,{agentId,example:true}).completion;
 const run=readWorkspace(email).acquisition.agentRuns[0];expect(run.status).toBe('failed');expect(run.error).toContain('模型请求额度');expect(run.output).toBeUndefined();expect(transport).not.toHaveBeenCalled();
});
