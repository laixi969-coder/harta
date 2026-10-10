import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { readWorkspace, writeWorkspace, publicWorkspace } from './workspace.mjs';
import { platformAuthState, startPlatformAuth, pollPlatformAuth, cancelPlatformAuth, completeDouyinAuth, removePlatformAuth } from './platform-auth.mjs';
const email='auth@example.test', session='harta-test-session', original=process.cwd();let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-platform-auth-'));process.chdir(dir);});
afterAll(()=>{process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{fs.rmSync(path.join(dir,'data'),{recursive:true,force:true});writeWorkspace(email,{customers:[{id:'biz',name:'test'}],ledger:[],feedback:{},contentStates:{}});vi.stubEnv('HARTA_PUBLIC_ORIGIN','https://harta.example');for(const p of ['DOUYIN','XHS']){vi.stubEnv('HARTA_'+p+'_APP_ID',p+'-test-id');vi.stubEnv('HARTA_'+p+'_APP_SECRET','secret-only-on-server');}});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const start=(platform='douyin')=>startPlatformAuth(email,{platform,customerId:'biz'},session);
const ok=data=>({ok:true,json:async()=>data});
const dyToken={error_code:0,access_token:'private-access-token',refresh_token:'private-refresh-token',expires_in:3600,open_id:'app-scoped-user',scope:'user_info'};
const xToken={access_token:'private-xhs-token',refresh_token:'private-xhs-refresh',expire_time:Math.floor(Date.now()/1000)+3600,open_id:'xhs-app-user',scope:['basic_info']};
const qr={code:0,data:{device_code:'private-device-code',user_code:'ABCD-EFGH',verification_uri_complete:'https://openaccount.xiaohongshu.com/device?user_code=ABCD-EFGH',expires_in:600,interval:3}};
it('requires owned business, session and configured application; exposes no secrets',async()=>{
  await expect(startPlatformAuth(email,{platform:'douyin',customerId:'other'},session)).rejects.toThrow('业务');
  await expect(startPlatformAuth(email,{platform:'douyin',customerId:'biz'},'')).rejects.toThrow('登录');
  vi.stubEnv('HARTA_DOUYIN_APP_SECRET','');expect(platformAuthState(email).providers[0].ready).toBe(false);await expect(start()).rejects.toMatchObject({statusCode:503});
  expect(JSON.stringify(platformAuthState(email))).not.toContain('secret-only-on-server');
});
it('uses official Douyin page and consumes session-bound state exactly once',async()=>{
  const mock=vi.fn().mockResolvedValue(ok({data:dyToken}));vi.stubGlobal('fetch',mock);
  const f=await start(),u=new URL(f.authorizeUrl),input={state:u.searchParams.get('state'),code:'one-time-code'};
  expect(u.origin).toBe('https://open.douyin.com');expect(u.pathname).toBe('/platform/oauth/connect/');expect(u.searchParams.get('redirect_uri')).toBe('https://harta.example/api/platform-auth/callback/douyin');
  await expect(completeDouyinAuth(email,input,'other-session')).rejects.toThrow('会话');
  await expect(completeDouyinAuth('other@example.test',input,session)).rejects.toThrow();
  await expect(completeDouyinAuth(email,{...input,state:f.id+'.wrong'},session)).rejects.toThrow();expect(mock).not.toHaveBeenCalled();
  expect((await completeDouyinAuth(email,input,session)).status).toBe('authorized');
  await expect(completeDouyinAuth(email,input,session)).rejects.toThrow();expect(mock).toHaveBeenCalledTimes(1);
  const account=readWorkspace(email).acquisition.accounts[0];expect(account.oauthOpenId).toBe(dyToken.open_id);expect(account.platformUserId).toBeUndefined();expect(account.capabilities).toEqual([]);
  const publicData=JSON.stringify(publicWorkspace(readWorkspace(email)))+JSON.stringify(platformAuthState(email));expect(publicData).not.toContain('private-access-token');
  const disk=fs.readdirSync(path.join(dir,'data/platform-auth')).filter(f=>f.endsWith('.json')).map(f=>fs.readFileSync(path.join(dir,'data/platform-auth',f),'utf8')).join('');expect(disk).not.toContain('private-access-token');expect(disk).not.toContain(session);
});
it('does not create accounts for denial, expired flow or incomplete token',async()=>{
  const f=await start(),state=new URL(f.authorizeUrl).searchParams.get('state');
  expect((await completeDouyinAuth(email,{state,error:'access_denied'},session)).status).toBe('cancelled');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(ok({data:{...dyToken,open_id:''}})));
  const f2=await start();await expect(completeDouyinAuth(email,{state:new URL(f2.authorizeUrl).searchParams.get('state'),code:'code'},session)).rejects.toThrow('有效授权');
  expect(readWorkspace(email).acquisition?.accounts||[]).toHaveLength(0);
});
it('renders only the public verification URL as QR and keeps device credentials private',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(ok(qr)).mockResolvedValueOnce(ok({code:37009}));vi.stubGlobal('fetch',mock);
  const f=await start('xiaohongshu');expect(f.qrDataUrl).toMatch(/^data:image\/png;base64,/);expect(JSON.stringify(f)).not.toContain('private-device-code');
  await expect(pollPlatformAuth(email,{id:f.id},'wrong')).rejects.toThrow();
  expect((await pollPlatformAuth(email,{id:f.id},session)).status).toBe('scanned');
  await pollPlatformAuth(email,{id:f.id},session);expect(mock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(mock.mock.calls[1][1].body).device_code).toBe('private-device-code');
});
it('stores XHS authorization automatically and disconnect removes its credential',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(ok(qr)).mockResolvedValueOnce(ok({code:0,data:xToken})));
  const f=await start('xiaohongshu');const result=await pollPlatformAuth(email,{id:f.id},session);expect(result.status).toBe('authorized');expect(result.capabilities).toEqual([]);
  expect(platformAuthState('other@test').connections).toHaveLength(0);expect(()=>removePlatformAuth('other@test',{id:f.id})).toThrow();
  removePlatformAuth(email,{id:f.id});expect(platformAuthState(email).connections[0].status).toBe('disconnected');
});
it('rejects QR redirect injection and masks upstream failures',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(ok({...qr,data:{...qr.data,verification_uri_complete:'https://evil.test/device?user_code=ABCD-EFGH'}})));
  await expect(start('xiaohongshu')).rejects.toThrow('扫码地址');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('secret-only-on-server')));await expect(start('xiaohongshu')).rejects.toThrow('暂时不可用');
});
it('cancel during token request rejects late success and never creates an account',async()=>{
  let resolve;vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(ok(qr)).mockImplementationOnce(()=>new Promise(r=>resolve=r)));
  const f=await start('xiaohongshu'),pending=pollPlatformAuth(email,{id:f.id},session);cancelPlatformAuth(email,{id:f.id},session);resolve(ok({code:0,data:xToken}));
  expect((await pending).status).toBe('cancelled');expect(readWorkspace(email).acquisition?.accounts||[]).toHaveLength(0);
});
it('reauthorizing the same app identity keeps one account and supersedes old credentials',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(ok({data:dyToken})));
  for(let i=0;i<2;i++){const f=await start();await completeDouyinAuth(email,{state:new URL(f.authorizeUrl).searchParams.get('state'),code:'code'+i},session);}
  expect(readWorkspace(email).acquisition.accounts).toHaveLength(1);expect(platformAuthState(email).connections.filter(c=>c.status==='authorized')).toHaveLength(1);
});
it('expired QR cannot be exchanged and expired grants require reconnect',async()=>{
  const f=await start(),realNow=Date.now;
  const clock=vi.spyOn(Date,'now').mockReturnValue(realNow()+601000);
  expect(platformAuthState(email).connections[0].status).toBe('expired');
  await expect(completeDouyinAuth(email,{state:new URL(f.authorizeUrl).searchParams.get('state'),code:'code'},session)).rejects.toThrow('失效');
  clock.mockRestore();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(ok({data:dyToken})));
  const g=await start();await completeDouyinAuth(email,{state:new URL(g.authorizeUrl).searchParams.get('state'),code:'code2'},session);
  const later=vi.spyOn(Date,'now').mockReturnValue(realNow()+3601000);
  expect(platformAuthState(email).connections.find(c=>c.id===g.id).status).toBe('expired');later.mockRestore();
});
it('cancel during Douyin exchange prevents a late success from reconnecting',async()=>{
  let resolve;vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise(r=>resolve=r)));
  const f=await start(),pending=completeDouyinAuth(email,{state:new URL(f.authorizeUrl).searchParams.get('state'),code:'code'},session);
  cancelPlatformAuth(email,{id:f.id},session);resolve(ok({data:dyToken}));await expect(pending).rejects.toThrow('取消');
  expect(platformAuthState(email).connections[0].status).toBe('cancelled');expect(readWorkspace(email).acquisition?.accounts||[]).toHaveLength(0);
});
