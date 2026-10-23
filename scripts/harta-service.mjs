// Offline backups run only after the server acknowledges that it is idle.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { acquireDataLock } from '../lib/data-lock.mjs';
import { readSecretConfig } from '../lib/secret-config.mjs';
import { createBackup, restoreBackup } from '../lib/backup.mjs';
const root = path.resolve(fileURLToPath(new URL('..',import.meta.url)));
process.chdir(root);
const data = path.join(root,'data');
const backupRoot = path.resolve(process.env.HARTA_BACKUP_DIR || path.join(os.homedir(),'.harta-backups',path.basename(root)));
if (backupRoot === data || backupRoot.startsWith(data+path.sep)) throw new Error('备份目录不能位于data内');
const statusFile = path.join(backupRoot,'status.json');
const supervisorLock = path.join(root,'.harta-service.pid');
try {
  const pid = Number(fs.readFileSync(supervisorLock,'utf8'));
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('托管服务锁无效，请核对进程状态');
  try { process.kill(pid,0); throw new Error('托管服务已在运行'); }
  catch(e) { if(e.code !== 'ESRCH') throw e; fs.unlinkSync(supervisorLock); }
} catch(e) { if(e.code !== 'ENOENT') throw e; }
fs.writeFileSync(supervisorLock,String(process.pid),{flag:'wx',mode:0o600});
process.once('exit',()=>{try{if(fs.readFileSync(supervisorLock,'utf8')===String(process.pid))fs.unlinkSync(supervisorLock);}catch{}});
let child, stopping=false, maintenance=false, restartTimer, lastAttempt=0;
const alive = () => child && child.exitCode===null && child.signalCode===null;
function scheduleRestart() {
  clearTimeout(restartTimer);
  if(!stopping&&!maintenance) restartTimer=setTimeout(launch,5000);
}
function launch() {
  clearTimeout(restartTimer);
  if(stopping||maintenance||alive())return;
  child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:process.env,stdio:['inherit','inherit','inherit','ipc']});
  child.once('error',error=>{console.error('Harta 启动失败：'+error.message);scheduleRestart();});
  child.once('exit',()=>{if(!stopping&&!maintenance){console.error('Harta 已退出，5秒后重启');scheduleRestart();}});
}
async function stopChild() {
  if(!alive())return;
  const exiting=child, exited=once(exiting,'exit');exiting.kill('SIGTERM');
  const timeout=setTimeout(()=>exiting.kill('SIGKILL'),20000);
  try { await exited; } finally { clearTimeout(timeout); }
}
async function prepareBackup() {
  if(!alive())return true;
  const target=child,id=randomUUID();
  return new Promise(resolve=>{
    const finish=ready=>{clearTimeout(timeout);target.off('message',receive);target.off('exit',exited);resolve(ready);};
    const receive=message=>{if(message?.type==='backup-ready'&&message.id===id)finish(message.ready===true);};
    const exited=()=>finish(false);
    const timeout=setTimeout(()=>finish(false),10000);
    target.on('message',receive);target.once('exit',exited);
    target.send({type:'prepare-backup',id},error=>{if(error)finish(false);});
  });
}
function status(){try{return JSON.parse(fs.readFileSync(statusFile,'utf8'));}catch{return {};}}
function writeStatus(value){
  try { const tmp=statusFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,statusFile); }
  catch(error) { console.error('备份状态写入失败：'+error.message); }
}
async function backup() {
  if(maintenance||stopping)return;maintenance=true;clearTimeout(restartTimer);
  const previous=status(),stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const destination=path.join(backupRoot,'snapshot-'+stamp),restored=path.join(backupRoot,'.verify-'+stamp);
  try {
    fs.mkdirSync(backupRoot,{recursive:true,mode:0o700});
    if (fs.realpathSync(backupRoot) === fs.realpathSync(data) || fs.realpathSync(backupRoot).startsWith(fs.realpathSync(data)+path.sep)) throw new Error('备份目录不能指向data内部');
    if(!await prepareBackup()) {
      writeStatus({...previous,deferredAt:new Date().toISOString(),deferredReason:'任务或请求仍在处理，稍后自动重试'});
      return;
    }
    lastAttempt=Date.now();await stopChild();
    const releaseMigration=acquireDataLock(data,'maintenance');
    try {if(fs.existsSync(path.join(data,'llm.json')))readSecretConfig(path.join(data,'llm.json'),()=>({providers:{}}));}finally{releaseMigration();}
    await createBackup(data,destination,{offline:true});restoreBackup(destination,restored);
    fs.rmSync(restored,{recursive:true,force:true});
    writeStatus({lastSuccess:new Date().toISOString(),lastAttempt:new Date().toISOString(),destination,restoreVerified:true,lastError:null});
    console.log('Harta 备份及恢复校验完成：'+destination);
    const snapshots=fs.readdirSync(backupRoot).filter(n=>/^snapshot-\d{4}-/.test(n)&&fs.existsSync(path.join(backupRoot,n,'manifest.json'))).sort();
    for(const name of snapshots.slice(0,-7))fs.rmSync(path.join(backupRoot,name),{recursive:true,force:true});
  } catch(error) {
    lastAttempt=Date.now();writeStatus({...previous,lastAttempt:new Date().toISOString(),lastError:String(error.message)});
    console.error('Harta 备份失败，服务将继续运行：'+error.message);
  } finally {
    try { fs.rmSync(restored,{recursive:true,force:true}); } catch(error) {console.error('备份校验目录清理失败：'+error.message);}
    maintenance=false;
    if(alive()&&child.connected)child.send({type:'resume-after-backup'},()=>{});
    launch();
    if(stopping)process.exit(0);
  }
}
function due(){const s=status();return Date.now()-Date.parse(s.lastSuccess||'1970-01-01')>=86400000&&Date.now()-Math.max(lastAttempt,Date.parse(s.lastAttempt||'1970-01-01'))>=3600000;}
const timer=setInterval(()=>{if(due())void backup();},60000);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{stopping=true;clearInterval(timer);clearTimeout(restartTimer);await stopChild();if(!maintenance)process.exit(0);});
// Local parent-process control only; no public HTTP maintenance endpoint.
process.on('message',message=>{if(message?.type==='backup-now')void backup();});
fs.mkdirSync(data,{recursive:true,mode:0o700});
if(due())await backup();else launch();
