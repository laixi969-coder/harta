import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import {publicLookup,fetchClientPage} from './recon.mjs';
import {readSecretConfig,writeSecretConfig} from './secret-config.mjs';
import {reserveSpend,estimateSpend,modelFetch} from './model-spend.mjs';
import {writeWorkspace,setReportShare,findShared} from './workspace.mjs';
import {ADMIN_EMAIL,loginOrBootstrap,resetPassword,addToWhitelist,register,removeFromWhitelist} from './auth.mjs';
import {parseMaterial} from './material-parser.mjs';
import {createBackup,restoreBackup} from './backup.mjs';
const root=process.cwd();let dir;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-hardening-'));process.chdir(dir);});
afterEach(()=>{process.chdir(root);vi.restoreAllMocks();vi.unstubAllEnvs();fs.rmSync(dir,{recursive:true,force:true});});
it('checks DNS at the actual socket lookup and never returns private answers',async()=>{
 vi.spyOn(dns,'lookup').mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'127.0.0.1',family:4}]);
 const lookup=()=>new Promise((resolve,reject)=>publicLookup('attacker.test',{all:true},(e,answer)=>e?reject(e):resolve(answer)));
 expect(await lookup()).toEqual([{address:'8.8.8.8',family:4}]);await expect(lookup()).rejects.toThrow('内网');
});
it('migrates plaintext credentials atomically, enforces permissions and fails closed on missing key',()=>{
 const file=path.join(dir,'data/llm.json');fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,JSON.stringify({providers:{x:{apiKey:'unique-secret'}}}));
 expect(readSecretConfig(file,()=>({})).providers.x.apiKey).toBe('unique-secret');expect(fs.readFileSync(file,'utf8')).not.toContain('unique-secret');
 expect(fs.statSync(file).mode&511).toBe(0o600);expect(fs.statSync(path.dirname(file)).mode&511).toBe(0o700);
 fs.unlinkSync(path.join(dir,'data/.model-key'));expect(()=>readSecretConfig(file,()=>({}))).toThrow('密钥缺失');
});
it('reserves account and global costs before attempts and cannot be reset by a different business',()=>{
 vi.stubEnv('HARTA_MODEL_ACCOUNT_DAILY_CENTS','2');vi.stubEnv('HARTA_MODEL_TOTAL_DAILY_CENTS','3');
 const body={messages:[{content:'x'}],max_tokens:1};
 reserveSpend(body,'a');reserveSpend(body,'a');expect(()=>reserveSpend(body,'a')).toThrow('额度');reserveSpend(body,'b');expect(()=>reserveSpend(body,'c')).toThrow('额度');
});
it('shares require explicit creation, rotate, expire and stop after owner revocation',()=>{
 const email='owner@test.example';const invite=addToWhitelist(email);register(email,'test-password',invite.activationCode);
 writeWorkspace(email,{customers:[{id:'c',packs:[{id:'p',shareToken:'a'.repeat(32)}]}]});
 expect(findShared('a'.repeat(32))).toBeNull();
 const one=setReportShare(email,'p',true),token=one.sharePath.slice(3);expect(findShared(token)?.pack.id).toBe('p');
 const two=setReportShare(email,'p',true);expect(findShared(token)).toBeNull();expect(findShared(two.sharePath.slice(3))).not.toBeNull();
 const date=vi.spyOn(Date,'now').mockReturnValue(two.expiresAt+1);expect(findShared(two.sharePath.slice(3))).toBeNull();date.mockRestore();
 setReportShare(email,'p',false);expect(findShared(two.sharePath.slice(3))).toBeNull();
 const three=setReportShare(email,'p',true);removeFromWhitelist(email);expect(findShared(three.sharePath.slice(3))).toBeNull();
 addToWhitelist(email);expect(findShared(three.sharePath.slice(3))).toBeNull();
 const four=setReportShare(email,'p',true);const reset=resetPassword(email);register(email,'replacement-password',reset.activationCode);expect(findShared(four.sharePath.slice(3))).toBeNull();
});
it('invalid public tokens never scan workspaces',()=>{
 const read=vi.spyOn(fs,'readdirSync');expect(findShared('b'.repeat(32))).toBeNull();expect(read).not.toHaveBeenCalled();
});
it('extracts in a separate process and terminates a stalled parser',async()=>{
 const file=path.join(dir,'input.txt');fs.writeFileSync(file,'fixture content');
 expect((await parseMaterial({originalFilename:'input.txt'},file,dir)).text).toBe('fixture content');
 await expect(parseMaterial({originalFilename:'input.txt'},file,dir,{timeoutMs:1})).rejects.toThrow('已停止');
});
it('backups restore encrypted model credentials and reject a mismatched model key',async()=>{
 const data=path.join(dir,'data'),backup=path.join(dir,'backup'),restored=path.join(dir,'restored');
 writeSecretConfig(path.join(data,'llm.json'),{providers:{p:{apiKey:'fixture-secret'}}});
 await createBackup(data,backup,{offline:true});restoreBackup(backup,restored);
 expect(readSecretConfig(path.join(restored,'llm.json'),()=>({})).providers.p.apiKey).toBe('fixture-secret');
 fs.writeFileSync(path.join(data,'.model-key'),Buffer.alloc(32,7));await expect(createBackup(data,path.join(dir,'bad'),{offline:true})).rejects.toThrow('密钥');
});
it('managed launcher backs up and verifies restoration before serving, then stops its child cleanly',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'lib'));
 fs.copyFileSync(path.join(root,'scripts/harta-service.mjs'),path.join(dir,'scripts/harta-service.mjs'));
 for(const name of ['backup.mjs','data-lock.mjs','secret-config.mjs'])fs.copyFileSync(path.join(root,'lib',name),path.join(dir,'lib',name));
 fs.writeFileSync(path.join(dir,'server.mjs'),"import fs from 'node:fs';fs.writeFileSync('ready',String(process.pid));setInterval(()=>{},1000);process.on('SIGTERM',()=>{fs.writeFileSync('stopped','yes');process.exit(0)});");
 const backups=path.join(dir,'backups');
 const child=spawn(process.execPath,[path.join(dir,'scripts/harta-service.mjs')],{env:{...process.env,HARTA_BACKUP_DIR:backups},stdio:'ignore'});
 try {
  for(let i=0;i<100&&!fs.existsSync(path.join(dir,'ready'));i++)await new Promise(r=>setTimeout(r,25));
  expect(fs.existsSync(path.join(dir,'ready'))).toBe(true);
  const status=JSON.parse(fs.readFileSync(path.join(backups,'status.json')));expect(status.restoreVerified).toBe(true);expect(fs.existsSync(path.join(status.destination,'manifest.json'))).toBe(true);
  const exited=once(child,'exit');child.kill('SIGTERM');await exited;expect(fs.readFileSync(path.join(dir,'stopped'),'utf8')).toBe('yes');
 } finally {if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}}
});

it('real fetch refuses a DNS answer that changed to loopback after URL validation',async()=>{
 const http=await import('node:http');let hits=0;const server=http.createServer((req,res)=>{hits++;res.end('private');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 vi.spyOn(dns,'lookup').mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValue([{address:'127.0.0.1',family:4}]);
 try { expect((await fetchClientPage(`http://rebind.example.test:${server.address().port}/secret`)).ok).toBe(false);expect(hits).toBe(0); }
 finally {await new Promise(resolve=>server.close(resolve));}
});
it('normal three-minute audio and images fit the default budget without counting base64 as tokens',()=>{
 const pcm=Buffer.alloc(44+16000*2*180);pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(16000,24);pcm.writeUInt32LE(32000,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40);
 const body={messages:[{content:[{type:'input_audio',input_audio:{data:'data:audio/wav;base64,'+pcm.toString('base64')}}]}]};
 expect(estimateSpend(body)).toBeLessThan(100);expect(()=>reserveSpend(body,'audio-user')).not.toThrow();
 expect(estimateSpend({max_tokens:3000,messages:[{content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+'a'.repeat(1000000)}}]}]})).toBeLessThan(100);
});
it('aborted requests never reserve money or invoke transport',async()=>{
 const ctl=new AbortController();ctl.abort();const fetch=vi.spyOn(globalThis,'fetch');
 await expect(modelFetch('https://example.test',{method:'POST',body:JSON.stringify({max_tokens:1}),signal:ctl.signal})).rejects.toThrow();
 expect(fetch).not.toHaveBeenCalled();expect(fs.existsSync(path.join(dir,'data/model-spend.sqlite'))).toBe(false);
});
it('credential writer does not replace a missing encryption key and can store prefix-like API keys',()=>{
 const file=path.join(dir,'data/llm.json');writeSecretConfig(file,{providers:{x:{apiKey:'harta-secret-v1:literal-api-key'}}});
 expect(readSecretConfig(file,()=>({})).providers.x.apiKey).toBe('harta-secret-v1:literal-api-key');
 fs.unlinkSync(path.join(dir,'data/.model-key'));expect(()=>writeSecretConfig(file,{providers:{x:{apiKey:'replacement'}}})).toThrow('密钥缺失');
});
it('backup restoration clears share UI state as well as the public index',async()=>{
 const data=path.join(dir,'data');fs.mkdirSync(path.join(data,'workspaces'),{recursive:true});
 fs.writeFileSync(path.join(data,'workspaces','x.json'),JSON.stringify({customers:[{packs:[{id:'p',shareToken:'abc',sharePath:'/p/abc',shareExpiresAt:Date.now()+100000}]}]}));
 const dest=path.join(dir,'backup');await createBackup(data,dest,{offline:true});restoreBackup(dest,path.join(dir,'restore'));
 expect(JSON.parse(fs.readFileSync(path.join(dir,'restore/workspaces/x.json'))).customers[0].packs[0]).toMatchObject({sharePath:'',shareToken:'',shareExpiresAt:0});
});
it('supervisor defers busy work, recovers from backup failure, and never launches duplicate children',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'lib'));
 fs.copyFileSync(path.join(root,'scripts/harta-service.mjs'),path.join(dir,'scripts/harta-service.mjs'));
 for(const name of ['backup.mjs','data-lock.mjs','secret-config.mjs'])fs.copyFileSync(path.join(root,'lib',name),path.join(dir,'lib',name));
 fs.writeFileSync(path.join(dir,'server.mjs'),`import fs from 'node:fs';fs.appendFileSync('starts',process.pid+'\\n');setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));process.on('message',m=>{if(m.type==='prepare-backup')process.send({type:'backup-ready',id:m.id,ready:!fs.existsSync('busy')});});`);
 const backups=path.join(dir,'backups'),child=spawn(process.execPath,[path.join(dir,'scripts/harta-service.mjs')],{env:{...process.env,HARTA_BACKUP_DIR:backups},stdio:['ignore','ignore','ignore','ipc']});
 const status=()=>{try{return JSON.parse(fs.readFileSync(path.join(backups,'status.json')));}catch{return {};}};
 const starts=()=>{try{return fs.readFileSync(path.join(dir,'starts'),'utf8').trim().split('\n').length;}catch{return 0;}};
 const wait=async predicate=>{for(let i=0;i<150&&!predicate();i++)await new Promise(r=>setTimeout(r,20));expect(predicate()).toBeTruthy();};
 try {
  await wait(()=>starts()===1);fs.writeFileSync(path.join(dir,'busy'),'yes');child.send({type:'backup-now'});
  await wait(()=>Boolean(status().deferredAt));expect(starts()).toBe(1);
  fs.unlinkSync(path.join(dir,'busy'));fs.symlinkSync(path.join(dir,'server.mjs'),path.join(dir,'data','unsafe'));child.send({type:'backup-now'});
  await wait(()=>starts()===2&&Boolean(status().lastError));
  fs.unlinkSync(path.join(dir,'data','unsafe'));child.send({type:'backup-now'});
  await wait(()=>starts()===3&&status().lastError===null);await new Promise(r=>setTimeout(r,100));expect(starts()).toBe(3);
 } finally {const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
});
it('an unavailable backup destination does not prevent application startup',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'lib'));
 fs.copyFileSync(path.join(root,'scripts/harta-service.mjs'),path.join(dir,'scripts/harta-service.mjs'));
 for(const name of ['backup.mjs','data-lock.mjs','secret-config.mjs'])fs.copyFileSync(path.join(root,'lib',name),path.join(dir,'lib',name));
 fs.writeFileSync(path.join(dir,'server.mjs'),"import fs from 'node:fs';fs.writeFileSync('ready','yes');setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));");
 const backups=path.join(dir,'backups');fs.writeFileSync(backups,'not a directory');
 const child=spawn(process.execPath,[path.join(dir,'scripts/harta-service.mjs')],{env:{...process.env,HARTA_BACKUP_DIR:backups},stdio:'ignore'});
 try {for(let i=0;i<100&&!fs.existsSync(path.join(dir,'ready'));i++)await new Promise(r=>setTimeout(r,20));expect(fs.existsSync(path.join(dir,'ready'))).toBe(true);}
 finally {const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
});
it('normal image and Word uploads survive process isolation',async()=>{
 const {default:sharp}=await import('sharp');const {default:JSZip}=await import('jszip');
 const image=path.join(dir,'fixture.png');await sharp({create:{width:32,height:32,channels:3,background:'#ffffff'}}).png().toFile(image);
 expect((await parseMaterial({originalFilename:'fixture.png'},image,dir)).images[0].mime).toBe('image/jpeg');
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>原有Word读取功能</w:t></w:r></w:p></w:body></w:document>');
 const word=path.join(dir,'fixture.docx');fs.writeFileSync(word,await zip.generateAsync({type:'nodebuffer'}));
 expect((await parseMaterial({originalFilename:'fixture.docx'},word,dir)).text).toContain('原有Word读取功能');
});
it('independent model workers cannot race past the shared account spend ceiling',async()=>{
 const {spawn}=await import('node:child_process');const {pathToFileURL}=await import('node:url');
 const module=pathToFileURL(path.join(root,'lib/model-spend.mjs')).href;
 const code=`import {reserveSpend} from ${JSON.stringify(module)};try{reserveSpend({max_tokens:1},'same-account');}catch(e){if(e.message.includes('额度'))process.exitCode=2;else throw e;}`;
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:dir,env:{...process.env,HARTA_MODEL_ACCOUNT_DAILY_CENTS:'1'},stdio:'ignore'});child.once('error',reject);child.once('exit',resolve);});
 expect((await Promise.all([run(),run(),run()])).sort()).toEqual([0,2,2]);
});
