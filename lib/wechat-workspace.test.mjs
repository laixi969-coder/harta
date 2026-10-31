import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {createWechatWorkspace} from './wechat-workspace.mjs';
import {WechatError,createWechatClient,wechatPlainText,wechatArticleUrl} from './wechat-client.mjs';
import {wechatScope,readWechatConnection} from './wechat-store.mjs';
import {createBackup,restoreBackup} from './backup.mjs';
import {workReferences} from './work-references.mjs';
const email='wechat@example.test',root=process.cwd();let dir,client,service;
const group=(n=0)=>({article_id:'article-'+n,media_id:'media-'+n,update_time:1780000000,content:{news_item:[{title:'厨房 <b>收纳</b>',content:'<p>先记录需求</p><script>bad()</script><p>核对尺寸</p>',url:'https://mp.weixin.qq.com/s/example',author:'设计师'}]}});
const bind=(extra={})=>service.action(email,{action:'bind',customerId:'c1',appId:'wx1234567890abcd',appSecret:'private-secret-for-tests',name:'厨房工作室',...extra});
const sync=(extra={})=>service.action(email,{action:'sync',customerId:'c1',...extra});
const get=()=>readWorkspace(email);
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-wechat-test-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{fs.rmSync(path.join(dir,'data'),{recursive:true,force:true});writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'厨房设计'},{id:'c2',name:'其他业务'}],contentStates:{}});client={token:vi.fn(async()=>({token:'private-access-token',expiresAt:Date.now()+3600000})),page:vi.fn(async()=>({items:[group()],total:1}))};service=createWechatWorkspace(client);});
it('stores encrypted credentials and exposes only masked public metadata',async()=>{
 const state=await bind();expect(state[0]).toMatchObject({bound:true,name:'厨房工作室',busy:false});expect(JSON.stringify(state)).not.toMatch(/private-|wx1234567890abcd/);
 const raw=fs.readFileSync(path.join(dir,'data/wechat',wechatScope(email,'c1')+'.json'),'utf8');expect(raw).not.toMatch(/private-|wx1234567890abcd/);
 expect(JSON.stringify(get())).not.toMatch(/private-|wx1234567890abcd/);
 expect(readWechatConnection(wechatScope(email,'c1')).token).toBe('private-access-token');
 client.token.mockRejectedValueOnce(new WechatError(40125));await expect(bind({appId:'wxdifferent123456'})).rejects.toThrow('AppSecret');expect(service.state(email)[0].bound).toBe(true);
 await expect(service.action('other@example.test',{action:'unbind',customerId:'c1'})).rejects.toThrow('找不到');
});
it('imports source articles idempotently without invented dates, metrics, leads or publication records',async()=>{
 await bind();await sync();let works=get().acquisition.works;expect(works).toHaveLength(1);expect(works[0]).toMatchObject({title:'厨房 收纳',description:'先记录需求\n核对尺寸',publishedAt:'',wechat:{source:'published'}});expect(works[0].stats).toBeUndefined();
 client.page.mockResolvedValueOnce({items:[{...group(),content:{news_item:[{title:'更新后的文章',content:'新正文'}]}}],total:1});await sync();works=get().acquisition.works;expect(works).toHaveLength(1);expect(works[0].title).toBe('更新后的文章');
 expect(get().acquisition.publications||[]).toHaveLength(0);expect(get().acquisition.leads||[]).toHaveLength(0);
 expect(workReferences(get(),'c1',[works[0].id])[0].sourceState).toBe('已发表文章');expect(()=>workReferences(get(),'c2',[works[0].id])).toThrow();
});
it('falls back only for empty published list or missing permission, preserving material provenance',async()=>{
 await bind();client.page.mockRejectedValueOnce(new WechatError(48001));await sync();const work=get().acquisition.works[0];expect(work.wechat.source).toBe('material');expect(work.url).toBe('');expect(workReferences(get(),'c1',[work.id])[0].sourceState).toContain('不证明已发表');expect(service.state(email)[0].lastSync.fallback).toContain('权限');
 client.page.mockRejectedValueOnce(new WechatError(45009));await expect(sync()).rejects.toThrow('额度');expect(get().acquisition.works).toHaveLength(1);
 client.page.mockResolvedValueOnce({items:[],total:0});await sync();expect(service.state(email)[0].lastSync.fallback).toContain('为空');
});
it('bounds each sync, resumes the actual source offset, and deduplicates fresh resync',async()=>{
 await bind();client.page.mockImplementation(async(token,source,offset)=>({items:Array.from({length:Math.min(20,105-offset)},(_,i)=>group(offset+i)),total:105}));
 await sync();expect(get().acquisition.works).toHaveLength(100);expect(service.state(email)[0].continuation).toEqual({source:'published',offset:100});
 await sync({resume:true});expect(get().acquisition.works).toHaveLength(105);expect(service.state(email)[0].continuation).toBeNull();await sync();expect(get().acquisition.works).toHaveLength(105);
});
it('disconnect cancels in-flight sync and cannot resurrect data or an old binding',async()=>{
 await bind();let release;client.page.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));const job=sync();expect(service.state(email)[0].busy).toBe(true);
 await expect(sync()).rejects.toThrow('正在处理');await service.action(email,{action:'unbind',customerId:'c1'});await bind({appId:'wxnewaccount12345'});release({items:[group()],total:1});await expect(job).rejects.toThrow('已取消');expect(get().acquisition.works||[]).toHaveLength(0);expect(service.state(email)[0].appIdMasked).toBe('wxne…2345');
 await sync();await service.action(email,{action:'unbind',customerId:'c1'});expect(service.state(email)[0].bound).toBe(false);expect(get().acquisition.works).toHaveLength(1);expect(readWechatConnection(wechatScope(email,'c1')).appSecret).toBeUndefined();
});
it('refreshes rejected tokens once and imports nothing after a later page failure',async()=>{
 await bind();client.page.mockRejectedValueOnce(new WechatError(42001));await sync();expect(client.token).toHaveBeenCalledTimes(2);
 client.page.mockResolvedValueOnce({items:Array.from({length:20},(_,i)=>group(i+5)),total:21}).mockRejectedValueOnce(new Error('网络中断'));await expect(sync()).rejects.toThrow('网络中断');expect(get().acquisition.works).toHaveLength(1);
 client.page.mockRejectedValue(new WechatError(40001));await expect(sync()).rejects.toThrow('凭证');expect(client.token).toHaveBeenCalledTimes(3);
});
it('uses fixed official API, safe errors and sanitized text and URLs',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({errcode:40125,errmsg:'SECRET https://host/?secret=x'})));const api=createWechatClient(fetcher);
 await expect(api.token('wx123','secret')).rejects.toThrow('AppSecret');expect(fetcher.mock.calls[0][0]).toBe('https://api.weixin.qq.com/cgi-bin/stable_token');expect(fetcher.mock.calls[0][1].redirect).toBe('error');
 expect(wechatArticleUrl('javascript:bad()')).toBe('');expect(wechatArticleUrl('https://mp.weixin.qq.com.evil.test/s/1')).toBe('');expect(wechatArticleUrl('http://mp.weixin.qq.com/s/1')).toBe('https://mp.weixin.qq.com/s/1');expect(wechatPlainText('<style>secret</style><p>A &amp; B</p>')).toBe('A & B');
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({total_count:1,item:'bad'})));await expect(api.page('token','published',0)).rejects.toThrow('格式');
});

it('includes encrypted connection and matching key in verified backups, rejecting a broken key',async()=>{
 await bind();const backup=path.join(dir,'backup'),restored=path.join(dir,'restored');
 try{await createBackup(path.join(dir,'data'),backup,{offline:true});restoreBackup(backup,restored);expect(fs.existsSync(path.join(restored,'wechat',wechatScope(email,'c1')+'.json'))).toBe(true);expect(fs.readFileSync(path.join(restored,'wechat/key'))).toEqual(fs.readFileSync(path.join(dir,'data/wechat/key')));
 fs.writeFileSync(path.join(dir,'data/wechat/key'),'invalid');await expect(createBackup(path.join(dir,'data'),path.join(dir,'bad'),{offline:true})).rejects.toThrow('公众号凭证');expect(fs.existsSync(path.join(dir,'bad'))).toBe(false);
 }finally{fs.rmSync(backup,{recursive:true,force:true});fs.rmSync(restored,{recursive:true,force:true});}
});
