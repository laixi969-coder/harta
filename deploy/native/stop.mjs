import { execFileSync } from 'node:child_process';
for (const name of ['app', 'search', 'rsshub']) {
  try { execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/local.harta.${name}`], { stdio: 'ignore' }); console.log(`已停止 harta.${name}`); }
  catch { console.log(`harta.${name} 未运行`); }
}
