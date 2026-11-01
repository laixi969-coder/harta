import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace,publicWorkspace} from './workspace.mjs';import {benchmarkGroupAction} from './benchmark-groups.mjs';
import {benchmarkObservation} from './benchmark-observations.mjs';
const root=process.cwd(),email='benchmark-groups@example.test';let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-groups-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{seedVersion:999,customers:[{id:'a',name:'甲',packs:[],drops:[]},{id:'b',name:'乙',packs:[],drops:[]}],acquisition:{works:[{id:'w1',customerId:'a',platform:'抖音',title:'样本一',source:'manual_paste'},{id:'w2',customerId:'b',platform:'抖音',title:'其他业务'},{id:'w3',customerId:'a',platform:'小红书',title:'其他平台'},{id:'demo',customerId:'a',platform:'抖音',demo:true}]}}));
const act=input=>benchmarkGroupAction(email,{customerId:'a',...input});const group=()=>readWorkspace(email).customers[0].benchmarkGroups[0];
it('按业务手工管理对标账号和样本，归档与恢复不删除原作品',()=>{
 act({action:'create',name:'对标',platform:'抖音',handle:'账号标识'});let g=group();expect(g).toMatchObject({name:'对标',workIds:[],version:1,archived:false});
 for(const workId of ['w2','w3','demo'])expect(()=>act({action:'attach',id:g.id,version:1,workId})).toThrow('同平台');
 act({action:'attach',id:g.id,version:1,workId:'w1'});g=group();expect(g.workIds).toEqual(['w1']);expect(()=>act({action:'attach',id:g.id,version:2,workId:'w1'})).toThrow('已关联');expect(()=>act({action:'detach',id:g.id,version:1,workId:'w1'})).toThrow('已变化');
 act({action:'archive',id:g.id,version:2});g=group();expect(g.archived).toBe(true);expect(()=>act({action:'attach',id:g.id,version:3,workId:'w1'})).toThrow('恢复');act({action:'restore',id:g.id,version:3});act({action:'detach',id:g.id,version:4,workId:'w1'});expect(group().workIds).toEqual([]);expect(readWorkspace(email).acquisition.works).toHaveLength(4);
 expect(()=>benchmarkGroupAction('another@example.test',{customerId:'a',action:'archive',id:g.id,version:5})).toThrow('找不到');
});
it('每个业务最多12个活动对标账号，归档后可新增但不能超额恢复',()=>{
 for(let i=0;i<12;i++)act({action:'create',name:`账号${i}`,platform:'公众号',handle:''});expect(()=>act({action:'create',name:'超额',platform:'公众号',handle:''})).toThrow('12');const g=group();act({action:'archive',id:g.id,version:1});act({action:'create',name:'补充',platform:'公众号',handle:''});expect(()=>act({action:'restore',id:g.id,version:2})).toThrow('12');
});
it('批量关联同平台样本，任何无效项或版本冲突均不产生部分结果',()=>{
 const space=readWorkspace(email);space.acquisition.works.push({id:'w4',customerId:'a',platform:'抖音',title:'第二篇'});writeWorkspace(email,space);
 act({action:'create',name:'对标',platform:'抖音',handle:''});const id=group().id;
 for(const workIds of [[],['w1','w2'],['w1','w3'],['w1','demo'],['w1','w1']]){expect(()=>act({action:'attach-many',id,version:1,workIds})).toThrow();expect(group().workIds).toEqual([]);}
 act({action:'attach-many',id,version:1,workIds:['w1','w4']});expect(group()).toMatchObject({version:2,workIds:['w1','w4']});
 expect(()=>act({action:'attach-many',id,version:1,workIds:['w1']})).toThrow('已变化');expect(()=>act({action:'attach-many',id,version:2,workIds:['w1']})).toThrow('已关联');expect(group().workIds).toEqual(['w1','w4']);
 const added=readWorkspace(email);added.acquisition.works.push(...Array.from({length:99},(_,i)=>({id:`extra-${i}`,customerId:'a',platform:'抖音',title:'样本'})));writeWorkspace(email,added);expect(()=>act({action:'attach-many',id,version:2,workIds:added.acquisition.works.filter(w=>w.id.startsWith('extra-')).map(w=>w.id)})).toThrow('100');expect(group().workIds).toEqual(['w1','w4']);
});
it('规则观察仅计入当前业务可用样本，缺失正文和指标不当作零',()=>{
 act({action:'create',name:'参考',platform:'抖音',handle:''});const g=group();act({action:'attach',id:g.id,version:1,workId:'w1'});
 const s=readWorkspace(email);s.acquisition.works[0].tags='旧记录中的异常标签';s.acquisition.works[0].metrics={likes:''};let observation=publicWorkspace(s).customers[0].benchmarkGroups[0].observation;expect(observation).toMatchObject({works:1,likesCoverage:0,likesSum:null,medianLikes:null,bodyCoverage:0,numberedShare:null,topTags:[]});
 s.acquisition.works[0].metrics.likes='12';observation=publicWorkspace(s).customers[0].benchmarkGroups[0].observation;expect(observation).toMatchObject({likesCoverage:1,likesSum:12,medianLikes:12});
 s.acquisition.works[0].demo=true;observation=publicWorkspace(s).customers[0].benchmarkGroups[0].observation;expect(observation).toMatchObject({works:0,missing:1,likesCoverage:0});
});
it('只在至少两个已知值且均值大于零时提供同组相对均值',()=>{
 const group={platform:'抖音',workIds:['w1','w4','w5']},base=readWorkspace(email).acquisition;
 base.works[0].metrics={likes:10};base.works.push({id:'w4',customerId:'a',platform:'抖音',title:'第二篇',metrics:{likes:30}},{id:'w5',customerId:'a',platform:'抖音',title:'未知指标',metrics:{likes:''}});
 const observation=benchmarkObservation(group,'a',base);expect(observation).toMatchObject({likesCoverage:2,likesMean:20,likesComparison:[{workId:'w1',ratio:0.5},{workId:'w4',ratio:1.5}]});
 base.works[0].metrics.likes=0;base.works.find(w=>w.id==='w4').metrics.likes=0;expect(benchmarkObservation(group,'a',base).likesComparison).toEqual([]);
});
