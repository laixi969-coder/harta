import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {writeWorkspace,readWorkspace} from './workspace.mjs';
import {createOpenFindService} from './openfind-live.mjs';
import {createServer} from 'node:http';
import {MODEL_SELECTION_VERSION} from './model-selection.mjs';
const original=process.cwd(),email='worker@example.test';let dir,service;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-worker-check-'));process.chdir(dir);writeWorkspace(email,{customers:[{id:'c1',name:'测试',packs:[],drops:[]}]});service=createOpenFindService({canRun:()=>true});});
afterAll(async()=>{await service.action(email,{customerId:'c1',action:'disconnect'});service.stop();process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
it('boots real embedded upstream worker without demo seeds and enforces allowlisted operations',async()=>{
 const state=await service.action(email,{customerId:'c1',action:'sync'});expect(state.connections).toHaveLength(2);expect(state.jobs).toHaveLength(0);expect(readWorkspace(email).acquisition?.works||[]).toHaveLength(0);
 await expect(service.action(email,{customerId:'c1',action:'publish'})).rejects.toThrow('未知');
 await expect(service.action(email,{customerId:'c1',action:'search',platform:'douyin',keyword:'',mode:'demo',limit:20})).rejects.toThrow();
 await expect(service.action(email,{customerId:'c1',action:'network',platform:'douyin',mode:'invalid'})).rejects.toThrow('网络模式');
 await expect(service.action(email,{customerId:'c1',action:'workflow',platform:'douyin',keyword:'厨房',noteType:'unsupported'})).rejects.toThrow();
 expect((await service.state(email,'c1')).jobs).toHaveLength(0);
});
it('restart recovers real upstream checkpoints as paused and synchronizes stored evidence once',async()=>{
 await service.action(email,{customerId:'c1',action:'disconnect'});
 const folder=fs.readdirSync(path.join(dir,'data/openfind'))[0];const db=new DatabaseSync(path.join(dir,'data/openfind',folder,'engine/openfind.sqlite'));
 const put=(kind,item)=>db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?)').run(kind,item.id,JSON.stringify(item));
 put('notes',{id:'xhs:abc',nativeId:'abc',platform:'xiaohongshu',source:'live',url:'https://www.xiaohongshu.com/explore/abc',title:'厨房翻新',body:'公开作品',author:'作者',authorId:'author',type:'image',likes:1,comments:0,saves:0,publishedAt:''});
 put('jobs',{id:'j1',platform:'xiaohongshu',source:'live',type:'search',status:'running',logs:[],resultIds:['xhs:abc'],count:1});
 put('workflows',{id:'wf1',status:'running',stage:'comments',input:{mode:'live',platform:'xiaohongshu',keyword:'厨房'},logs:[],selectedNoteIds:['xhs:abc'],completedNoteIds:[]});db.close();
 const state=await service.action(email,{customerId:'c1',action:'sync'});
 expect(state.jobs[0].status).toBe('stopped');expect(state.workflows[0].status).toBe('paused');expect(state.workflows[0].message).toContain('服务重启');expect(readWorkspace(email).acquisition.works).toHaveLength(1);
 const count=readWorkspace(email).acquisition.tasks.length;await service.state(email,'c1');expect(readWorkspace(email).acquisition.tasks).toHaveLength(count);
});

it('full workbench transports keep credentials private, stream upload/export assets and isolate business data',async()=>{
 const first=await service.endpoint(email,'c1',{activate:true});
 const root=`http://127.0.0.1:${first.port}`;
 const request=(route,body,method='POST')=>fetch(root+'/api'+route,{method,headers:{authorization:'Bearer '+first.secret,'content-type':'application/json'},body:JSON.stringify(body)});
 expect((await fetch(root+'/api/state')).status).toBe(403);
 const rejected=await request('/llm',{enabled:true,baseUrl:'https://example.test/v1',model:'fixture',apiKey:'private-fixture-key',maxComments:20},'PUT');
 expect(rejected.status).toBe(400);
 const saved=await request('/llm',{enabled:false,maxComments:20,requestTimeoutSeconds:120,reviewTimeoutSeconds:900},'PUT');
 expect(saved.status).toBe(200);const settings=await saved.json();expect(settings).toMatchObject({managedBy:'harta',ready:false,baseUrl:'',hasApiKey:false});expect(JSON.stringify(settings)).not.toContain('private-fixture-key');
 const state=await(await fetch(root+'/api/state',{headers:{authorization:'Bearer '+first.secret}})).json();
 expect(JSON.stringify(state)).not.toContain(first.secret);expect(JSON.stringify(state)).not.toContain('private-fixture-key');
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const draftResponse=await request('/drafts',{noteId:'',title:'工作台验收草稿',body:'仅本地验证',tags:['测试'],images:[image],platform:'xiaohongshu',kind:'image',origin:'original',visibility:'private',accountId:'fixture'});
 expect(draftResponse.status).toBe(201);const draft=await draftResponse.json();
 const bundle=await fetch(root+`/api/drafts/${draft.id}/bundle`,{headers:{authorization:'Bearer '+first.secret}});
 expect(bundle.status).toBe(200);const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(await bundle.arrayBuffer());expect(Object.keys(zip.files)).toContain('images/1.png');
 const form=new FormData();const bytes=Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);form.append('file',new Blob([bytes],{type:'video/mp4'}),'fixture.mp4');
 const uploaded=await fetch(root+'/api/media/video',{method:'POST',headers:{authorization:'Bearer '+first.secret},body:form});expect(uploaded.status).toBe(201);const asset=await uploaded.json();
 const video=await fetch(root+asset.url,{headers:{authorization:'Bearer '+first.secret,range:'bytes=4-7'}});expect(video.status).toBe(206);expect(await video.text()).toBe('ftyp');
 writeWorkspace(email,{...readWorkspace(email),customers:[...readWorkspace(email).customers,{id:'c2',name:'隔离业务',packs:[],drops:[]}]});
 const second=await service.endpoint(email,'c2',{activate:true});
 const other=await(await fetch(`http://127.0.0.1:${second.port}/api/state`,{headers:{authorization:'Bearer '+second.secret}})).json();expect(other.drafts).toEqual([]);
 expect((await fetch(`http://127.0.0.1:${second.port}`+asset.url,{headers:{authorization:'Bearer '+second.secret}})).status).toBe(404);
 await service.action(email,{customerId:'c2',action:'disconnect'});
});
it('Harta contact blocks stop the same real identity in the isolated sales workbench',async()=>{
 await service.action(email,{customerId:'c1',action:'disconnect'});
 const folder=fs.readdirSync(path.join(dir,'data/openfind')).find(key=>JSON.parse(fs.readFileSync(path.join(dir,'data/openfind',key,'harta.json'))).customerId==='c1');
 const db=new DatabaseSync(path.join(dir,'data/openfind',folder,'engine/openfind.sqlite'));
 const lead={id:'blocked-case',noteId:'xhs:abc',commentId:'blocked-comment',platform:'xiaohongshu',source:'live',authorId:'blocked-author',name:'测试身份',content:'测试需求',score:60,reason:'fixture',status:'new',memo:'',outreach:'',createdAt:new Date().toISOString()};
 db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?)').run('leads',lead.id,JSON.stringify(lead));db.close();
 const workspace=readWorkspace(email);workspace.acquisition.leads||=[];workspace.acquisition.leads.push({id:'harta-blocked',customerId:'c1',platform:'小红书',authorId:'blocked-author',doNotContact:true});writeWorkspace(email,workspace);
 const endpoint=await service.endpoint(email,'c1',{activate:true});
 const response=await fetch(`http://127.0.0.1:${endpoint.port}/api/leads/blocked-case/sales`,{headers:{authorization:'Bearer '+endpoint.secret}});expect(response.status).toBe(200);const record=await response.json();expect(record).toMatchObject({stopped:true,nextFollowUp:'',stage:'lost'});expect(record.events[0].content).toContain('Harta 禁止联系');
});

it('the running business worker inherits Harta model changes and never stores shared credentials',async()=>{
 const requests=[];
 const mock=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;requests.push({url:req.url,body:JSON.parse(raw),headers:req.headers});
  res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.endsWith('/messages')?{content:[{text:'{"ok":true}'}]}:{choices:[{message:{content:'{"ok":true}'}}]}));
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>mock.once('listening',resolve));
 const select=kind=>fs.writeFileSync(path.join(dir,'data/llm.json'),JSON.stringify({active:'custom',providers:{custom:{name:'Harta 共享渠道',kind,baseUrl:`http://127.0.0.1:${mock.address().port}/v1`,model:kind+'-shared',apiKey:'shared-secret-never-copy',models:[kind+'-shared'],enabled:[kind+'-shared'],modelSelectionVersion:MODEL_SELECTION_VERSION}}}));
 try{
  const endpoint=await service.endpoint(email,'c1',{activate:true});const root=`http://127.0.0.1:${endpoint.port}/api`;
  const headers={authorization:'Bearer '+endpoint.secret,'content-type':'application/json'};
  select('openai');let settings=await(await fetch(root+'/llm',{headers})).json();expect(settings).toMatchObject({managedBy:'harta',ready:true,model:'openai-shared',baseUrl:'',hasApiKey:false});
  expect((await fetch(root+'/llm/test',{method:'POST',headers,body:'{}'})).status).toBe(200);expect(requests.at(-1).url).toBe('/v1/chat/completions');
  select('anthropic');settings=await(await fetch(root+'/llm',{headers})).json();expect(settings.model).toBe('anthropic-shared');expect(settings.testedAt).toBeUndefined();
  const result=await(await fetch(root+'/llm/test',{method:'POST',headers,body:'{}'})).json();expect(result).toMatchObject({ok:true,model:'anthropic-shared'});expect(requests.at(-1).headers['x-api-key']).toBe('shared-secret-never-copy');
  const folder=fs.readdirSync(path.join(dir,'data/openfind')).find(key=>JSON.parse(fs.readFileSync(path.join(dir,'data/openfind',key,'harta.json'))).customerId==='c1');
  const db=new DatabaseSync(path.join(dir,'data/openfind',folder,'engine/openfind.sqlite'));
  expect(db.prepare("SELECT value FROM config WHERE key IN ('llm:key','llm:baseUrl','llm:model')").all()).toEqual([]);db.close();
  expect(JSON.stringify({settings,result})).not.toContain('shared-secret-never-copy');
 }finally{mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));}
});

it('API provider settings remain business scoped; manual-only endpoints and unsupported comments fail before platform access',async()=>{
 const a=await service.endpoint(email,'c1',{activate:true});
 const req=(endpoint,route,body,method=body===undefined?'GET':'POST')=>fetch(`http://127.0.0.1:${endpoint.port}/api${route}`,{method,headers:{authorization:'Bearer '+endpoint.secret,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const key='isolated-provider-fixture-key';
 const saved=await req(a,'/xhs-data',{provider:'tikhub',apiKey:key,maxRequests:2},'PUT');expect(saved.status).toBe(200);expect(await saved.json()).toMatchObject({hasKeys:{tikhub:true}});
 expect(await(await req(a,'/state')).text()).not.toContain(key);
 await req(a,'/douyin-data',{provider:'redfox',apiKey:'douyin-fixture',maxRequests:2},'PUT');
 const workflow=await req(a,'/workflows',{keyword:'台灯',platform:'douyin',mode:'live',searchLimit:100,maxNotes:100,commentLimit:100});expect(workflow.status).toBe(400);expect((await workflow.json()).error).toContain('RedFox');
 for(const route of ['/drafts/old/publish','/drafts/old/prepare','/drafts/old/reconcile','/inbox/drafts/old/send','/platforms/xiaohongshu/login'])expect((await req(a,route,{})).status,route).toBe(410);
 await expect(service.endpoint('another@example.test','c1',{activate:true})).rejects.toThrow();
 const b=await service.endpoint(email,'c2',{activate:true});
 expect((await(await req(b,'/xhs-data')).json()).hasKeys.tikhub).toBe(false);
 expect((await(await req(b,'/douyin-data')).json()).provider).toBe('browser');
 expect((await fetch(`http://127.0.0.1:${b.port}/api/xhs-data`,{headers:{authorization:'Bearer '+a.secret}})).status).toBe(403);
 await service.action(email,{customerId:'c2',action:'disconnect'});
});
it('corrupt provider credentials fail the job without stranding the worker lock',async()=>{
 const endpoint=await service.endpoint(email,'c1',{activate:true});
 const req=(route,body,method=body===undefined?'GET':'POST')=>fetch(`http://127.0.0.1:${endpoint.port}/api${route}`,{method,headers:{authorization:'Bearer '+endpoint.secret,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const folder=fs.readdirSync(path.join(dir,'data/openfind')).find(key=>JSON.parse(fs.readFileSync(path.join(dir,'data/openfind',key,'harta.json'))).customerId==='c1');
 const db=new DatabaseSync(path.join(dir,'data/openfind',folder,'engine/openfind.sqlite'));
 db.prepare('UPDATE config SET value=? WHERE key=?').run('broken-ciphertext','xhs.key.tikhub');db.close();
 const started=await req('/jobs',{keyword:'只测试初始化',platform:'xiaohongshu',mode:'live',limit:100,sort:'latest',noteType:'all',interval:1000});expect(started.status).toBe(201);
 const id=(await started.json()).id;
 const stateResponse=await req('/state');const state=await stateResponse.json();expect(stateResponse.status,JSON.stringify(state)).toBe(200);expect(state.jobs.find(j=>j.id===id).status).toBe('failed');
 const repaired=await req('/xhs-data',{provider:'tikhub',apiKey:'',maxRequests:2},'PUT');expect(repaired.status).toBe(200);
});
