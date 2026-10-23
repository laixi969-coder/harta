import { RequestBudgetError } from './request-budget-core.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const accounts = new AsyncLocalStorage();
export const withModelAccount = (email, run) => accounts.run(email, run);
export const modelAccount = () => accounts.getStore() || process.env.HARTA_MODEL_ACCOUNT || 'administrative';
function setting(name, fallback) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${name} 必须是正整数`);
  return n;
}
// Reserve media by its billing unit, never by base64 character count.
export function estimateSpend(body) {
  let imageTokens = 0, audioCents = 0;
  const cleaned = JSON.stringify(body, (key, value) => {
    if (key === 'image_url' && value?.url?.startsWith('data:image/')) {
      imageTokens += setting('HARTA_MODEL_IMAGE_TOKEN_BOUND',16384);
      return {url:'[image]'};
    }
    if (key === 'source' && value?.type === 'base64' && value.media_type?.startsWith('image/')) {
      imageTokens += setting('HARTA_MODEL_IMAGE_TOKEN_BOUND',16384);
      return {type:'image'};
    }
    if (key === 'input_audio' && typeof value?.data === 'string') {
      // Cloud ASR only receives our own mono 16kHz PCM WAV chunks. Validate its
      // header and bill duration; reject unknown encodings rather than undercount.
      const encoded = value.data.match(/^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/)?.[1];
      if (!encoded) throw new Error('语音费用估算仅支持PCM WAV');
      const wav = Buffer.from(encoded,'base64');
      if (wav.toString('ascii',0,4)!=='RIFF' || wav.toString('ascii',8,12)!=='WAVE') throw new Error('语音WAV格式无效');
      let byteRate=0, dataBytes=0;
      for (let pos=12;pos+8<=wav.length;) {
        const tag=wav.toString('ascii',pos,pos+4),size=wav.readUInt32LE(pos+4),start=pos+8;
        if (start+size>wav.length) throw new Error('语音WAV内容不完整');
        if(tag==='fmt '&&size>=16&&wav.readUInt16LE(start)===1)byteRate=wav.readUInt32LE(start+8);
        if(tag==='data')dataBytes+=size;
        pos=start+size+(size%2);
      }
      if(!byteRate||!dataBytes)throw new Error('语音WAV缺少PCM音轨');
      audioCents += Math.ceil(dataBytes/byteRate/60)*setting('HARTA_MODEL_AUDIO_CENTS_PER_MINUTE',10);
      return {data:'[audio]'};
    }
    return value;
  });
  const output = Number(body.max_tokens ?? 8000);
  if (!Number.isSafeInteger(output) || output < 1 || output > 32000) throw new Error('模型输出上限必须为1–32000 tokens');
  return Math.max(1, Math.ceil(((Buffer.byteLength(cleaned)+imageTokens) * setting('HARTA_MODEL_INPUT_CENTS_PER_MILLION',1000) + output * setting('HARTA_MODEL_OUTPUT_CENTS_PER_MILLION',5000))/1000000)+audioCents);
}
// Reserve conservatively before transport. Failed/retried calls are not refunded.
// Prices are administrator-controlled upper bounds in USD cents per million tokens.
export function reserveSpend(body, email = modelAccount(), now = new Date()) {
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new Error('模型输入超过32MB');
  const cents = estimateSpend(body);
  const accountLimit = setting('HARTA_MODEL_ACCOUNT_DAILY_CENTS',1000), totalLimit = setting('HARTA_MODEL_TOTAL_DAILY_CENTS',10000);
  const dir = path.join(process.cwd(),'data'); fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file = path.join(dir,'model-spend.sqlite'); const db = new DatabaseSync(file); fs.chmodSync(file,0o600);
  try {
    db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS spend(day TEXT,owner TEXT,cents INTEGER NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(day,owner)); BEGIN IMMEDIATE;');
    const day = now.toISOString().slice(0,10), owner = createHash('sha256').update(email.toLowerCase()).digest('hex');
    const get = id => db.prepare('SELECT cents,calls FROM spend WHERE day=? AND owner=?').get(day,id) || {cents:0,calls:0};
    const account = get(owner), total = get('*');
    if (account.cents+cents>accountLimit || total.cents+cents>totalLimit || account.calls>=setting('HARTA_MODEL_ACCOUNT_DAILY_CALLS',100) || total.calls>=setting('HARTA_MODEL_TOTAL_DAILY_CALLS',1000)) throw new RequestBudgetError('模型费用预留或请求总额度已用完；请联系管理员核对预算，UTC零点重置');
    for (const id of [owner,'*']) db.prepare('INSERT INTO spend VALUES(?,?,?,1) ON CONFLICT(day,owner) DO UPDATE SET cents=cents+excluded.cents,calls=calls+1').run(day,id,cents);
    db.exec('COMMIT'); return cents;
  } catch(e) { if(db.isTransaction) db.exec('ROLLBACK'); throw e; }
  finally { db.close(); }
}
export async function modelFetch(url, options = {}) {
  options.signal?.throwIfAborted();
  if (options.method === 'POST') reserveSpend(JSON.parse(options.body));
  return fetch(url, {...options,redirect:'error'});
}
