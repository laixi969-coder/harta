import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const prefix = 'harta-secret-v1:';
function keyFor(file, mustExist = false) {
  const dir = path.dirname(file), keyFile = path.join(dir, '.model-key');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  if (!fs.existsSync(keyFile)) {
    if (mustExist) throw new Error('模型凭证密钥缺失，请从完整备份恢复');
    try { fs.writeFileSync(keyFile, crypto.randomBytes(32), {flag:'wx',mode:0o600}); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  fs.chmodSync(keyFile, 0o600);
  const key = fs.readFileSync(keyFile);
  if (key.length !== 32) throw new Error('模型凭证密钥无效');
  return key;
}
function encrypted(value, key) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return prefix + Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
export function writeSecretConfig(file, data) {
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {};
  const encryptedBefore = Object.values(previous.providers || {}).some(p => p.apiKey?.startsWith(prefix));
  const copy = structuredClone(data), key = keyFor(file, encryptedBefore);
  for (const p of Object.values(copy.providers || {})) if (p.apiKey) p.apiKey = encrypted(p.apiKey, key);
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, JSON.stringify(copy, null, 2) + '\n', {mode:0o600}); fs.renameSync(temp,file); }
  finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function readSecretConfig(file, defaults) {
  if (!fs.existsSync(file)) writeSecretConfig(file, defaults());
  fs.chmodSync(file, 0o600);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const values = Object.values(data.providers || {});
  const key = keyFor(file, values.some(p => p.apiKey?.startsWith(prefix)));
  const migrate = values.some(p => p.apiKey && !p.apiKey.startsWith(prefix));
  for (const p of values) if (p.apiKey?.startsWith(prefix)) {
    const bytes = Buffer.from(p.apiKey.slice(prefix.length), 'base64');
    try { const d = crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12)); d.setAuthTag(bytes.subarray(-16)); p.apiKey = Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]).toString('utf8'); }
    catch { throw new Error('模型凭证解密失败，请恢复匹配的配置和密钥'); }
  }
  if (migrate) writeSecretConfig(file,data);
  return data;
}
