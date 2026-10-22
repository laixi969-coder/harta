import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { acquireDataLock } from './data-lock.mjs';
const excluded=new Set(['sessions.json','services','logs','browser-profiles','hosted-browser','platform-auth','.runtime-owner','.maintenance']);
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const safe=name=>typeof name==='string'&&name.length<2000&&!name.includes('\\')&&!path.isAbsolute(name)&&name.split('/').every(p=>p&&p!=='.'&&p!=='..');
function files(root,relative='') {
 const result=[];
 for(const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  if(excluded.has(item.name)||item.name.endsWith('-wal')||item.name.endsWith('-shm')||item.name.endsWith('.log'))continue;
  const next=path.posix.join(relative,item.name),stat=fs.lstatSync(path.join(root,next));
  if(stat.isSymbolicLink())throw new Error('备份不接受符号链接：'+next);
  if(stat.isDirectory())result.push(...files(root,next));else if(stat.isFile())result.push(next);
 }
 return result;
}
function validateDatabase(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  if(Object.values(db.prepare('PRAGMA quick_check').get())[0]!=='ok')throw new Error('数据库完整性检查失败');
  if(path.basename(file)==='openfind.sqlite'){
   const keyFile=path.join(path.dirname(file),'.credential-key');
   if(!fs.existsSync(keyFile)||fs.readFileSync(keyFile).length!==32)throw new Error('业务数据库缺少有效凭证密钥');
   const key=fs.readFileSync(keyFile);
   for(const r of db.prepare("SELECT value FROM config WHERE value <> '' AND (key LIKE 'xhs.key.%' OR key LIKE 'douyin.key.%' OR key='llm:key' OR key='token' OR key LIKE 'cookie:%')").all()){
    try{const b=Buffer.from(r.value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));d.update(b.subarray(12,-16));d.final();}catch{throw new Error('业务凭证与密钥不匹配，恢复已停止');}
   }
  }
 }finally{db.close();}
}
export async function createBackup(dataDir,destination,{offline=false}={}) {
 if(!offline)throw new Error('请先停止 Harta，并显式声明 offline');
 dataDir=path.resolve(dataDir);destination=path.resolve(destination);
 if(!fs.existsSync(dataDir)||!fs.lstatSync(dataDir).isDirectory())throw new Error('业务数据目录不存在或不是实际目录');
 dataDir=fs.realpathSync(dataDir);
 destination=path.join(fs.realpathSync(path.dirname(destination)),path.basename(destination));
 if(destination===dataDir||destination.startsWith(dataDir+path.sep))throw new Error('备份目录必须在业务数据目录之外');
 const release=acquireDataLock(dataDir,'maintenance');let created=false;
 try{
  fs.mkdirSync(destination,{mode:0o700});created=true;fs.mkdirSync(path.join(destination,'data'),{mode:0o700});
  const names=files(dataDir);
  for(const name of names){const from=path.join(dataDir,name),to=path.join(destination,'data',name);fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});
   if(name.endsWith('.sqlite')){const db=new DatabaseSync(from,{readOnly:true});try{await sqliteBackup(db,to);}finally{db.close();}}else fs.copyFileSync(from,to);
   fs.chmodSync(to,0o600);
  }
  for(const name of names.filter(n=>n.endsWith('.sqlite')))validateDatabase(path.join(destination,'data',name));
  const manifest={version:1,createdAt:new Date().toISOString(),excluded:[...excluded],files:names.map(name=>{const b=fs.readFileSync(path.join(destination,'data',name));return {name,size:b.length,sha256:hash(b)};})};
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});return {files:names.length,destination};
 }catch(e){if(created)fs.rmSync(destination,{recursive:true,force:true});throw e;}finally{release();}
}
export function restoreBackup(source,destination){
 source=path.resolve(source);destination=path.resolve(destination);
 if(fs.existsSync(destination))throw new Error('恢复仅允许新的空目标路径，不能覆盖现有业务');
 if(fs.lstatSync(source).isSymbolicLink()||fs.lstatSync(path.join(source,'manifest.json')).isSymbolicLink()||fs.lstatSync(path.join(source,'data')).isSymbolicLink())throw new Error('恢复不接受符号链接');
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files)||manifest.files.length>100000)throw new Error('备份清单格式无效');
 const names=new Set();
 for(const row of manifest.files){
  if(!safe(row.name)||names.has(row.name)||row.name.split('/').some(p=>excluded.has(p)))throw new Error('备份清单路径不安全或重复');names.add(row.name);
  let current=path.join(source,'data');for(const part of row.name.split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw new Error('恢复不接受符号链接');}
  if(!fs.statSync(current).isFile())throw new Error('备份条目不是文件');
  const b=fs.readFileSync(current);if(b.length!==row.size||hash(b)!==row.sha256)throw new Error('备份文件校验失败');
 }
 for(const name of files(path.join(source,'data')))if(!names.has(name))throw new Error('备份存在清单以外的文件');
 for(const name of names)if(name.endsWith('.sqlite'))validateDatabase(path.join(source,'data',name));
 fs.mkdirSync(destination,{mode:0o700});
 try{
  for(const name of names){const to=path.join(destination,name);fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});fs.copyFileSync(path.join(source,'data',name),to);fs.chmodSync(to,0o600);
   if(name.endsWith('openfind.sqlite')){const db=new DatabaseSync(to);try{db.exec("UPDATE config SET value='' WHERE key LIKE 'cookie:%' OR key='cookie'");}finally{db.close();}}
   if(name.endsWith('/harta.json')){const r=JSON.parse(fs.readFileSync(to,'utf8'));r.enabled=false;r.schedule={...r.schedule,enabled:false};r.connections=[];fs.writeFileSync(to,JSON.stringify(r),{mode:0o600});}
  }
  fs.writeFileSync(path.join(destination,'sessions.json'),'{}',{mode:0o600});
  return {files:names.size,destination,schedulesEnabled:false};
 }catch(e){fs.rmSync(destination,{recursive:true,force:true});throw e;}
}
