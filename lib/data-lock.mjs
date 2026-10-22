import fs from 'node:fs';
import path from 'node:path';
const alive = pid => { if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';} };
export function acquireDataLock(dataDir, kind) {
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const runtime=path.join(dataDir,'.runtime-owner'),maintenance=path.join(dataDir,'.maintenance');
 for(const file of [runtime,maintenance])if(fs.existsSync(file)){
  let pid;try{pid=JSON.parse(fs.readFileSync(file,'utf8')).pid;}catch{throw new Error('数据锁无效，请核对服务状态');}
  if(alive(pid))throw new Error('Harta 正在运行或维护，请完全停止服务后操作');
  fs.unlinkSync(file);
 }
 const file=kind==='runtime'?runtime:maintenance;
 fs.writeFileSync(file,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});
 // Two processes racing for different locks must not both proceed.
 const other=kind==='runtime'?maintenance:runtime;
 if(fs.existsSync(other)){fs.unlinkSync(file);throw new Error('另一个服务或维护操作刚刚启动，请重试');}
 return ()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).pid===process.pid)fs.unlinkSync(file);}catch{}};
}
