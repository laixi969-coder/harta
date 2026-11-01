import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';import {recordAccountAudience} from './account-audience.mjs';
const root=process.cwd(),email='audience-test@example.test';let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-audience-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{seedVersion:999,customers:[{id:'a',packs:[],drops:[]},{id:'b',packs:[],drops:[]}],acquisition:{accounts:[{id:'x',customerId:'a',name:'账号甲',platform:'抖音'},{id:'y',customerId:'b',name:'账号乙',platform:'小红书'},{id:'demo',customerId:'a',platform:'抖音',demo:true}]}}));
const input={customerId:'a',accountId:'x',followers:0,observedAt:'2026-10-31',source:'后台人工核对',baseRevision:0};
it('按账号记录有来源的快照，0是明确填写且旧版本不能覆盖',()=>{
 recordAccountAudience(email,input);let s=readWorkspace(email);expect(s.customers[0].accountAudience[0]).toMatchObject({accountId:'x',followers:0,observedAt:'2026-10-31',source:'后台人工核对',revision:1});expect(()=>recordAccountAudience(email,input)).toThrow('已变化');recordAccountAudience(email,{...input,followers:30,baseRevision:1});s=readWorkspace(email);expect(s.customers[0].accountAudience.map(x=>x.followers)).toEqual([0,30]);expect(s.customers[1].accountAudience).toBeUndefined();
});
it('拒绝跨业务、演示账号、非法日期、缺失来源和无效人数',()=>{
 for(const patch of [{accountId:'y'},{accountId:'demo'},{followers:-1},{followers:0.5},{followers:'5'},{observedAt:'2026-02-30'},{source:'  '}])expect(()=>recordAccountAudience(email,{...input,...patch})).toThrow();expect(readWorkspace(email).customers[0].accountAudience).toBeUndefined();expect(()=>recordAccountAudience('other@example.test',input)).toThrow('找不到');
});
