import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {writeWorkspace,readWorkspace} from './workspace.mjs';
import {createOpenFindService} from './openfind-live.mjs';
const original=process.cwd(),email='worker@example.test';let dir,service;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-worker-check-'));process.chdir(dir);writeWorkspace(email,{customers:[{id:'c1',name:'测试',packs:[],drops:[]}]});service=createOpenFindService();});
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
