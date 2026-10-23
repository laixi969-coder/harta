import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { modelAccount } from './model-spend.mjs';
export function parseMaterial(file, storedPath, tempDir, {timeoutMs=180000} = {}) {
  return new Promise((resolve,reject) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ['PATH','HOME','TMPDIR','SYSTEMROOT'].includes(k) || k.startsWith('HARTA_MODEL_') || k === 'HARTA_WHISPER_MODEL'));
    env.HARTA_MODEL_ACCOUNT = modelAccount();
    const worker = fileURLToPath(new URL('./material-parser-worker.mjs',import.meta.url));
    const unix = process.platform !== 'win32';
    const args = ['--max-old-space-size=256',worker];
    // Inherit CPU/file-size limits in native converters. This is resource isolation,
    // not a security sandbox against parser RCE; deploy under a restricted OS user.
    const child = spawn(unix ? '/bin/sh' : process.execPath, unix ? ['-c','ulimit -t 90; ulimit -f 131072; exec "$@"','harta-parser',process.execPath,...args] : args,
      {env,detached:unix,stdio:['ignore','ignore','ignore','ipc']});
    let result, failure;
    const kill = () => { try { if(unix) process.kill(-child.pid,'SIGKILL'); else child.kill('SIGKILL'); } catch {} };
    const timer = setTimeout(()=>{failure=new Error('资料解析超过3分钟，已停止；请拆分文件后重试');kill();},timeoutMs);
    child.once('error',error=>{failure=error;});
    child.on('message',message=>{
      if (message.error) failure = new Error(message.error);
      else result = message.result;
      kill();
    });
    child.once('close',()=>{clearTimeout(timer);kill();if(failure)reject(failure);else if(result)resolve(result);else reject(new Error('资料解析进程退出，文件可能损坏或超过资源限制'));});
    child.send({file:{originalFilename:file.originalFilename},storedPath,tempDir},error=>{if(error){failure=error;kill();}});
  });
}
