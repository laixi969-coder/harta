import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {createBackup,restoreBackup} from './backup.mjs';import {acquireDataLock} from './data-lock.mjs';
it('restores WAL data, encrypted credentials and media; clears sessions and disables schedules',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harta-backup-')),data=path.join(root,'data'),engine=path.join(data,'openfind/scope/engine');fs.mkdirSync(engine,{recursive:true});
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([iv,c.update('dummy-secret'),c.final(),c.getAuthTag()]).toString('base64');
 fs.writeFileSync(path.join(engine,'.credential-key'),key);fs.writeFileSync(path.join(data,'sessions.json'),'sensitive-session');fs.writeFileSync(path.join(data,'openfind/scope/harta.json'),JSON.stringify({enabled:true,schedule:{enabled:true}}));fs.writeFileSync(path.join(data,'asset.txt'),'fixture media');
 const db=new DatabaseSync(path.join(engine,'openfind.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT);');db.prepare('INSERT INTO config VALUES(?,?)').run('xhs.key.tikhub',encrypted);db.prepare('INSERT INTO config VALUES(?,?)').run('cookie:xiaohongshu',encrypted);
 try{
  const dest=path.join(root,'backup'),restored=path.join(root,'restored');await createBackup(data,dest,{offline:true});restoreBackup(dest,restored);
  expect(fs.readFileSync(path.join(restored,'asset.txt'),'utf8')).toBe('fixture media');expect(JSON.parse(fs.readFileSync(path.join(restored,'sessions.json')))).toEqual({});expect(JSON.parse(fs.readFileSync(path.join(restored,'openfind/scope/harta.json'))).schedule.enabled).toBe(false);
  const restoredDb=new DatabaseSync(path.join(restored,'openfind/scope/engine/openfind.sqlite'));expect(restoredDb.prepare("SELECT value FROM config WHERE key='xhs.key.tikhub'").get().value).toBe(encrypted);expect(restoredDb.prepare("SELECT value FROM config WHERE key='cookie:xiaohongshu'").get().value).toBe('');restoredDb.close();
  expect(()=>restoreBackup(dest,restored)).toThrow(/覆盖/);
  fs.appendFileSync(path.join(dest,'data/asset.txt'),'tampered');expect(()=>restoreBackup(dest,path.join(root,'bad'))).toThrow(/校验/);expect(fs.existsSync(path.join(root,'bad'))).toBe(false);
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
});
it('rejects active data, missing key, traversal and symlinks without partial restore',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harta-backup-negative-')),data=path.join(root,'data');fs.mkdirSync(data);
 try{
  const release=acquireDataLock(data,'runtime');await expect(createBackup(data,path.join(root,'b'),{offline:true})).rejects.toThrow(/正在运行/);release();
  fs.symlinkSync('/etc/hosts',path.join(data,'link'));await expect(createBackup(data,path.join(root,'b'),{offline:true})).rejects.toThrow(/符号链接/);fs.unlinkSync(path.join(data,'link'));
  await createBackup(data,path.join(root,'b'),{offline:true});fs.writeFileSync(path.join(root,'b/manifest.json'),JSON.stringify({version:1,files:[{name:'../../escape'}]}));expect(()=>restoreBackup(path.join(root,'b'),path.join(root,'out'))).toThrow(/路径/);
  const engine=path.join(data,'engine');fs.mkdirSync(engine);const db=new DatabaseSync(path.join(engine,'openfind.sqlite'));db.exec('CREATE TABLE config(key TEXT,value TEXT)');db.close();await expect(createBackup(data,path.join(root,'missing-key'),{offline:true})).rejects.toThrow(/密钥/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
