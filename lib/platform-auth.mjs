import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { readWorkspace, writeWorkspace } from './workspace.mjs';

const names = { douyin: '抖音', xiaohongshu: '小红书' };
const root = () => path.join(process.cwd(), 'data', 'platform-auth');
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const active = new Set();
function config(platform) {
  if (!names[platform]) throw fail('不支持的平台');
  const prefix = platform === 'douyin' ? 'HARTA_DOUYIN_' : 'HARTA_XHS_';
  const appId = process.env[prefix + 'APP_ID'] || '', secret = process.env[prefix + 'APP_SECRET'] || '';
  const origin = process.env.HARTA_PUBLIC_ORIGIN || '';
  let validOrigin = false;
  try { const u = new URL(origin); validOrigin = u.protocol === 'https:' && u.origin === origin && !u.username && !u.password; } catch {}
  return { appId, secret, origin, ready: Boolean(appId && secret && (platform !== 'douyin' || validOrigin)) };
}
function key() {
  fs.mkdirSync(root(), { recursive: true, mode: 0o700 });
  const file = path.join(root(), 'key');
  try { fs.writeFileSync(file, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  return fs.readFileSync(file);
}
function file(id) { if (!/^[a-f0-9-]{36}$/.test(id || '')) throw fail('连接记录无效'); return path.join(root(), id + '.json'); }
function save(row) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const value = Buffer.concat([cipher.update(JSON.stringify(row)), cipher.final()]);
  const target = file(row.id), temp = target + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), value: value.toString('base64') }), { mode: 0o600 });
  fs.renameSync(temp, target);
}
function read(id) {
  try { const r = JSON.parse(fs.readFileSync(file(id), 'utf8')); const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(r.iv, 'base64')); decipher.setAuthTag(Buffer.from(r.tag, 'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(r.value, 'base64')), decipher.final()]).toString()); }
  catch { throw fail('连接记录不存在或已失效', 404); }
}
function all(email) {
  if (!fs.existsSync(root())) return [];
  return fs.readdirSync(root()).filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).map(f => read(f.slice(0, -5))).filter(r => r.email === email);
}
function owned(email, id, session) {
  const r = read(id);
  if (r.email !== email || (session !== undefined && r.sessionHash !== hash(session))) throw fail('连接不属于当前登录会话', 403);
  if (!readWorkspace(email).customers.some(c => c.id === r.customerId)) throw fail('业务已不存在', 404);
  return r;
}
function publicRow(r) {
  return { id: r.id, customerId: r.customerId, platform: r.platform, name: r.name || names[r.platform], accountId: r.accountId,
    status: ['pending', 'scanned'].includes(r.status) && r.expiresAt < Date.now() ? 'expired' : r.status === 'authorized' && r.tokenExpiresAt < Date.now() ? 'expired' : r.status,
    expiresAt: r.expiresAt, tokenExpiresAt: r.tokenExpiresAt, interval: r.interval || 3, error: r.error || '',
    scopes: r.scopes || [], capabilities: [],
    // Authorization does not enable the DOM execution channel or undocumented APIs.
    executionStatus: 'not_connected' };
}
export function platformAuthState(email) {
  return { providers: Object.keys(names).map(platform => ({ platform, name: names[platform], ready: config(platform).ready })), connections: all(email).map(publicRow) };
}
async function request(url, body, form = false) {
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body) : JSON.stringify(body) });
    if (!response.ok) throw fail('平台授权服务暂时不可用，请稍后重试', 502);
    return await response.json();
  } catch { throw fail('平台授权服务暂时不可用，请稍后重试', 502); }
}
const xhs = (route, body) => request('https://openaccount.xiaohongshu.com/api/sns/v1/oauth2/' + route, body);
function positive(v) { return Number.isFinite(Number(v)) && Number(v) > 0; }
export async function startPlatformAuth(email, input, session) {
  const { platform, customerId } = input, cfg = config(platform);
  if (!session) throw fail('请先登录', 401);
  if (!readWorkspace(email).customers.some(c => c.id === customerId)) throw fail('请先选择自己的业务');
  if (!cfg.ready) throw fail('Harta 尚未开通该平台扫码授权，请由管理员完成应用接入配置', 503);
  const lock = email + ':' + customerId + ':' + platform;
  if (active.has(lock)) throw fail('正在创建授权，请稍候', 409);
  active.add(lock);
  try {
    // Replacing a QR invalidates the previous local flow. Never reuse another browser's flow.
    for (const previous of all(email)) if (previous.customerId === customerId && previous.platform === platform && ['pending', 'scanned'].includes(previous.status)) { previous.status = 'cancelled'; delete previous.deviceCode; save(previous); }
    const row = { id: crypto.randomUUID(), email, customerId, platform, appId: cfg.appId, sessionHash: hash(session), status: 'pending', expiresAt: Date.now() + 600000 };
    let authorizeUrl, qrDataUrl, userCode;
    if (platform === 'douyin') {
      const state = crypto.randomBytes(32).toString('base64url'); row.stateHash = hash(state);
      authorizeUrl = 'https://open.douyin.com/platform/oauth/connect/?' + new URLSearchParams({ client_key: cfg.appId, response_type: 'code', scope: 'user_info', redirect_uri: cfg.origin + '/api/platform-auth/callback/douyin', state: row.id + '.' + state });
    } else {
      const result = await xhs('device/code', { app_id: cfg.appId, app_secret: cfg.secret, scopes: ['basic_info'], client_name: 'Harta 平台账号连接', device_id: row.id, scene: 'web' });
      const d = result.data;
      if (Number(result.code) !== 0 || !d?.device_code || !positive(d.expires_in) || !positive(d.interval)) throw fail('小红书未能创建扫码授权，请检查应用接入资格', 502);
      let u; try { u = new URL(d.verification_uri_complete); } catch { throw fail('平台返回的扫码地址无效', 502); }
      if (u.origin !== 'https://openaccount.xiaohongshu.com' || u.pathname !== '/device' || u.username || u.password || !d.user_code || u.searchParams.get('user_code') !== d.user_code) throw fail('平台返回的扫码地址无效', 502);
      row.deviceCode = d.device_code; row.expiresAt = Date.now() + Math.min(Number(d.expires_in), 1800) * 1000; row.interval = Math.max(3, Number(d.interval));
      authorizeUrl = 'https://openaccount.xiaohongshu.com/device?' + new URLSearchParams({user_code:d.user_code}); userCode = d.user_code;
      qrDataUrl = await QRCode.toDataURL(authorizeUrl, { width: 256, margin: 2 });
    }
    save(row); return { ...publicRow(row), authorizeUrl, qrDataUrl, userCode };
  } finally { active.delete(lock); }
}
function finish(row, token) {
  const expiresAt = row.platform === 'douyin' ? Date.now() + Number(token.expires_in) * 1000 : Number(token.expire_time) * 1000;
  if (typeof token.access_token !== 'string' || !token.access_token || typeof token.open_id !== 'string' || !token.open_id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw fail('平台未返回有效授权，请重新连接', 502);
  // Re-read after network awaits so cancelling a flow cannot be undone by a late response.
  const current = read(row.id);
  if (!['pending', 'scanned', 'exchanging'].includes(current.status) || current.expiresAt < Date.now()) throw fail('本次连接已取消或过期', 409);
  const workspace = readWorkspace(row.email);
  if (!workspace.customers.some(c => c.id === row.customerId)) throw fail('业务已不存在');
  workspace.acquisition ||= {}; workspace.acquisition.accounts ||= [];
  let account = workspace.acquisition.accounts.find(a => a.customerId === row.customerId && a.platform === names[row.platform] && a.oauthOpenId === token.open_id && a.oauthAppId === row.appId);
  if (!account) { account = { id: crypto.randomUUID(), customerId: row.customerId, platform: names[row.platform], name: names[row.platform] + '账号 · ' + token.open_id.slice(-6), mode: 'oauth', createdAt: new Date().toISOString(), oauthOpenId: token.open_id, oauthAppId: row.appId }; workspace.acquisition.accounts.push(account); }
  // Do not interpret app-scoped open_id as a public profile ID for browser sends.
  account.status = 'authorized'; account.capabilities = [];
  Object.assign(row, { status: 'authorized', accountId: account.id, name: account.name, tokenExpiresAt: expiresAt, token, scopes: Array.isArray(token.scope) ? token.scope : String(token.scope || '').split(',').filter(Boolean) });
  delete row.deviceCode; delete row.stateHash;
  for (const old of all(row.email)) if (old.id !== row.id && old.accountId === account.id && old.status === 'authorized') { old.status = 'superseded'; delete old.token; save(old); }
  save(row); writeWorkspace(row.email, workspace); return publicRow(row);
}
export async function completeDouyinAuth(email, input, session) {
  const [id, state, ...rest] = String(input.state || '').split('.');
  const row = owned(email, id, session);
  if (rest.length || row.platform !== 'douyin' || row.status !== 'pending' || row.expiresAt < Date.now() || row.stateHash !== hash(state || '')) throw fail('授权请求已失效，请重新连接');
  if (input.error || !input.code) { row.status = 'cancelled'; save(row); return publicRow(row); }
  const cfg = config('douyin');
  if (cfg.appId !== row.appId || !cfg.ready) throw fail('应用配置已变化，请重新连接');
  row.status = 'exchanging'; save(row); // One-use state is consumed before exchanging the code.
  try {
    const result = await request('https://open.douyin.com/oauth/access_token/', { client_key: cfg.appId, client_secret: cfg.secret, code: input.code, grant_type: 'authorization_code' }, true);
    if (Number(result.data?.error_code) !== 0) throw fail('抖音授权失败，请重新连接', 502);
    return finish(row, result.data);
  } catch (e) { const latest = read(row.id); if (latest.status === 'exchanging') { latest.status = 'failed'; latest.error = '授权未完成，请重新连接'; save(latest); } throw e; }
}
export async function pollPlatformAuth(email, input, session) {
  const row = owned(email, input.id, session);
  if (!['pending', 'scanned'].includes(row.status) || row.platform !== 'xiaohongshu' || row.expiresAt < Date.now()) return publicRow(row);
  if (active.has(row.id) || (row.nextPollAt || 0) > Date.now()) return publicRow(row);
  active.add(row.id);
  try {
    const cfg = config(row.platform); if (!cfg.ready || cfg.appId !== row.appId) throw fail('应用配置已变化，请重新连接');
    row.nextPollAt = Date.now() + row.interval * 1000; save(row);
    const result = await xhs('device/token', { app_id: cfg.appId, app_secret: cfg.secret, device_code: row.deviceCode });
    const latest = read(row.id); if (!['pending', 'scanned'].includes(latest.status)) return publicRow(latest);
    if (Number(result.code) === 0) return finish(row, result.data);
    if ([37002, 37009].includes(Number(result.code))) row.status = Number(result.code) === 37009 ? 'scanned' : row.status;
    else { row.status = 'failed'; row.error = '扫码授权未完成，请重新连接'; delete row.deviceCode; }
    save(row); return publicRow(row);
  } finally { active.delete(row.id); }
}
export function cancelPlatformAuth(email, input, session) {
  const row = owned(email, input.id, session);
  if (['pending', 'scanned', 'exchanging'].includes(row.status)) { row.status = 'cancelled'; delete row.deviceCode; delete row.stateHash; save(row); }
  return publicRow(row);
}
export function removePlatformAuth(email, input) {
  const row = owned(email, input.id); row.status = 'disconnected'; delete row.token; delete row.deviceCode; delete row.stateHash; save(row);
  return publicRow(row);
}
