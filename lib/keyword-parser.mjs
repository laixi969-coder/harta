import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* 关键词文件里的 xlsx/docx/pdf 解析跑在 fork 的子进程里，与 materials
 * 同一套 ulimit 限制（CPU 60 秒、写盘 128MB、256MB 堆）。
 * 这是资源隔离，不是安全沙箱；公网部署应使用受限 OS 用户。 */
export function readKeywordFileIsolated(file, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT'].includes(k)));
    const worker = fileURLToPath(new URL('./keyword-file-reader-worker.mjs', import.meta.url));
    const unix = process.platform !== 'win32';
    const args = ['--max-old-space-size=256', worker];
    const child = spawn(unix ? '/bin/sh' : process.execPath, unix ? ['-c', 'ulimit -t 60; ulimit -f 131072; exec "$@"', 'harta-keyword-parser', process.execPath, ...args] : args,
      { env, detached: unix, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let result, failure;
    const kill = () => { try { if (unix) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} };
    const timer = setTimeout(() => { failure = new Error('文件解析超时，已停止；请拆分文件后重试'); kill(); }, timeoutMs);
    child.once('error', error => { failure = error; });
    child.on('message', message => {
      if (message.error) failure = new Error(message.error);
      else result = message.result;
      kill();
    });
    child.once('close', () => { clearTimeout(timer); kill(); if (failure) reject(failure); else if (result) resolve(result); else reject(new Error('文件解析进程退出，文件可能损坏或超过资源限制')); });
    child.send({ name: file.name || file.originalFilename, path: file.path || file.filepath }, error => { if (error) { failure = error; kill(); } });
  });
}
