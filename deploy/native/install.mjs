import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { saveResearchConfig } from '../../lib/research.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const base = path.join(root, 'data/services');
fs.mkdirSync(base, { recursive: true });
const search = path.join(base, 'searxng');
const revision = '2e624bed40eb97b46faa98094a0b74d3ececd93d';
if (!fs.existsSync(search)) {
  run('git', ['clone', '--depth', '1', 'https://github.com/searxng/searxng.git', search]);
  run('git', ['-C', search, 'fetch', '--depth', '1', 'origin', revision]);
  run('git', ['-C', search, 'checkout', '--detach', revision]);
}
if (!fs.existsSync(path.join(search, '.venv'))) run('uv', ['venv', '--python', '3.12', path.join(search, '.venv')]);
run('uv', ['pip', 'install', '--python', path.join(search, '.venv/bin/python'), '-r', path.join(search, 'requirements.txt'), '-r', path.join(search, 'requirements-server.txt')]);
const crawl = path.join(base, 'crawl4ai');
if (!fs.existsSync(crawl)) run('uv', ['venv', '--python', '3.12', crawl]);
run('uv', ['pip', 'install', '--python', path.join(crawl, 'bin/python'), 'crawl4ai==0.9.3']);
run('npm', ['install', '--prefix', path.join(base, 'rsshub'), '--ignore-scripts', 'rsshub@1.0.0-master.f99e982']);
run('npm', ['install', '--prefix', path.join(base, 'rsshub'), 'node@24.21.0']);
saveResearchConfig({ searxngUrl: 'http://127.0.0.1:8080', rsshubUrl: 'http://127.0.0.1:1200' });
console.log('依赖已安装并配置。macOS 运行 node deploy/native/start.mjs 启动。网页读取需本机 Google Chrome。');
