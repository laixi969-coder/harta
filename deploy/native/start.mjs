import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const nativeConfigPath = path.join(root, 'data/native.json');
const nativeConfig = fs.existsSync(nativeConfigPath) ? JSON.parse(fs.readFileSync(nativeConfigPath, 'utf8')) : {};
const service = path.join(root, 'data/services/searxng');
const settings = path.join(root, 'data/searxng/native-settings.yml');
fs.mkdirSync(path.dirname(settings), { recursive: true });
fs.mkdirSync(path.join(root, 'data/logs'), { recursive: true });
if (!fs.existsSync(settings)) fs.writeFileSync(settings, `use_default_settings:\n  engines:\n    keep_only: [google, bing, brave, duckduckgo]\nserver:\n  secret_key: "${crypto.randomBytes(32).toString('hex')}"\n  limiter: false\n  bind_address: "127.0.0.1"\nsearch:\n  formats: [html, json]\noutgoing:\n  request_timeout: 8.0\n  max_request_timeout: 10.0\nengines:\n  - name: google\n    disabled: false\n  - name: bing\n    disabled: false\n`, { mode: 0o600 });
const xml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const jobs = [
  { name: 'harta.search', cwd: service, args: [path.join(service, '.venv/bin/granian'), '--interface', 'wsgi', '--host', '127.0.0.1', '--port', '8080', 'searx.webapp:app'], env: { SEARXNG_SETTINGS_PATH: settings } },
  { name: 'harta.rsshub', cwd: root, args: [path.join(root, 'data/services/rsshub/node_modules/node/bin/node'), path.join(root, 'deploy/native/rsshub.mjs')], env: {} },
  { name: 'harta.app', cwd: root, args: [process.execPath, path.join(root, 'server.mjs')], env: { PORT: '5173', ...(nativeConfig.proxyFakeIp ? { HARTA_PROXY_FAKE_IP: '1' } : {}) } },
];
for (const job of jobs) {
  const label = `local.${job.name}`;
  const plist = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  const contents = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${job.args.map(a => `<string>${xml(a)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(job.cwd)}</string><key>EnvironmentVariables</key><dict>${Object.entries(job.env).map(([k,v]) => `<key>${xml(k)}</key><string>${xml(v)}</string>`).join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${xml(path.join(root, 'data/logs', `${job.name}.log`))}</string><key>StandardErrorPath</key><string>${xml(path.join(root, 'data/logs', `${job.name}.error.log`))}</string></dict></plist>`;
  if (fs.existsSync(plist) && fs.readFileSync(plist, 'utf8') !== contents && !fs.readFileSync(plist, 'utf8').includes(xml(root))) throw new Error(`已有其他工作区服务：${label}`);
  fs.writeFileSync(plist, contents);
  let loaded = false;
  try { execFileSync('launchctl', ['print', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' }); loaded = true; } catch {}
  if (loaded) execFileSync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${label}`]);
  else execFileSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plist]);
  console.log(`已启动 ${label}`);
}
