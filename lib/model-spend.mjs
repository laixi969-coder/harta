import { RequestBudgetError } from './request-budget-core.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { contentRunId, contentStage, markRequestSent, markRequestRejected } from './content-checkpoints.mjs';
import { createHash, randomUUID } from 'node:crypto';
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
  if (body?.__hartaImageGeneration === true) return setting('HARTA_MODEL_IMAGE_GENERATION_CENTS',100);
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
// Measured usage and elapsed time are separate from conservative reservations.
// Store no prompts, responses, credentials, customer text or provider error bodies.
const callSchema = `CREATE TABLE IF NOT EXISTS model_calls(
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, day TEXT NOT NULL, flow TEXT, stage TEXT, model TEXT,
  reserved_cents INTEGER NOT NULL, state TEXT NOT NULL, elapsed_ms INTEGER,
  input_tokens INTEGER, output_tokens INTEGER, cache_read INTEGER, cache_write INTEGER,
  estimated_usd REAL, status INTEGER);
  CREATE INDEX IF NOT EXISTS model_calls_owner_day ON model_calls(owner,day);
  CREATE INDEX IF NOT EXISTS model_calls_flow ON model_calls(owner,flow);`;
function withSpendDb(file,fn) {
  const db=new DatabaseSync(file);
  try {db.exec('PRAGMA busy_timeout=5000');return fn(db);} finally {db.close();}
}
function usageEstimate(host,model,usage) {
  if (!usage || usage.input===null || usage.output===null || usage.cacheRead || usage.cacheWrite) return null;
  let rate;
  try {rate=JSON.parse(process.env.HARTA_USAGE_RATES_JSON || '{}')[host+'/'+model];} catch {return null;}
  if (!rate || ![rate.inputUsdPerMillion,rate.outputUsdPerMillion].every(n=>Number.isFinite(n)&&n>=0)) return null;
  return (usage.input*rate.inputUsdPerMillion+usage.output*rate.outputUsdPerMillion)/1e6;
}
function measuredUsage(usage) {
  if(!usage || typeof usage!=='object')return null;
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  return {input:count(usage.prompt_tokens??usage.input_tokens),output:count(usage.completion_tokens??usage.output_tokens),
    cacheRead:count(usage.prompt_tokens_details?.cached_tokens??usage.cache_read_input_tokens),
    cacheWrite:count(usage.cache_creation_input_tokens)};
}
export async function modelFetch(url, options = {}) {
  options.signal?.throwIfAborted();
  const { spendBody, transportFetch, ...transport } = options;
  const send=transportFetch || fetch;
  if (transport.method !== 'POST') return send(url,{...transport,redirect:'error'});
  const body=spendBody || JSON.parse(transport.body);
  const cents=reserveSpend(body), id=randomUUID(), started=Date.now(), model=String(body.model || '').slice(0,200);
  const file=path.join(process.cwd(),'data','model-spend.sqlite');
  const owner=createHash('sha256').update(modelAccount().toLowerCase()).digest('hex');
  const day=new Date(started).toISOString().slice(0,10);
  withSpendDb(file,db=>{
    db.exec(callSchema);
    db.prepare("INSERT INTO model_calls(id,owner,day,flow,stage,model,reserved_cents,state) VALUES(?,?,?,?,?,?,?,'sent')").run(id,owner,day,contentRunId(),contentStage(),model,cents);
  });
  let status=null;
  const finish=(state,rawUsage)=>{
    const usage=measuredUsage(rawUsage);
    withSpendDb(file,db=>db.prepare('UPDATE model_calls SET state=?,elapsed_ms=?,input_tokens=?,output_tokens=?,cache_read=?,cache_write=?,estimated_usd=?,status=? WHERE id=?').run(
      state,Date.now()-started,usage?.input??null,usage?.output??null,usage?.cacheRead??null,usage?.cacheWrite??null,
      usageEstimate(new URL(url).host,model,usage),status,id));
  };
  markRequestSent();
  let response;
  try {response=await send(url,{...transport,redirect:'error'});}
  catch(error){finish('unknown');throw error;}
  status=Number.isInteger(response.status)?response.status:null;
  if(!response.ok && [400,401,403,404,413,422,429].includes(status))markRequestRejected();
  finish(response.ok?'responded':'http_error');
  return new Proxy(response,{get(target,key) {
    const member=Reflect.get(target,key,target);
    if(typeof member!=='function')return member;
    if(key!=='text' && key!=='json')return member.bind(target);
    return async (...args)=>{
      let result;
      try { result=await member.apply(target,args); }
      catch(error){finish('read_error');throw error;}
      let usage;
      if(key==='json')usage=result?.usage;
      else if(typeof result==='string' && result.length<8e6) {try{usage=JSON.parse(result)?.usage;}catch{}}
      finish(response.ok?'completed':'http_error',usage);
      return result;
    };
  }});
}

export function contentUsage(email,flow,{base=process.cwd()}={}) {
  const file=path.join(base,'data','model-spend.sqlite');
  if(!flow || !fs.existsSync(file))return null;
  const owner=createHash('sha256').update(email.toLowerCase()).digest('hex');
  return withSpendDb(file,db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_calls'").get()
    ? usageSummary(db,'owner=? AND flow=?',[owner,flow]) : null);
}
function usageSummary(db,where,values) {
  const row=db.prepare(`SELECT COUNT(*) attempts,COUNT(input_tokens) inputReports,COUNT(output_tokens) outputReports,
    SUM(input_tokens) inputTokens,SUM(output_tokens) outputTokens,SUM(cache_read) cacheReadTokens,SUM(cache_write) cacheWriteTokens,
    COUNT(elapsed_ms) timedCalls,SUM(elapsed_ms) modelElapsedMs,COUNT(estimated_usd) pricedCalls,SUM(estimated_usd) estimatedUsd,
    SUM(reserved_cents) reservedCents FROM model_calls WHERE ${where}`).get(...values);
  const stages=db.prepare(`SELECT stage,COUNT(*) attempts,COUNT(elapsed_ms) timedCalls,SUM(elapsed_ms) elapsedMs,
    SUM(CASE WHEN state IN ('sent','unknown','read_error') THEN 1 ELSE 0 END) unknown,
    SUM(CASE WHEN state='http_error' THEN 1 ELSE 0 END) rejected FROM model_calls
    WHERE ${where} AND stage<>'' GROUP BY stage ORDER BY MIN(rowid)`).all(...values);
  return {...row,stages,actualCharges:null};
}

// A statement is a user-entered reference to a supplier bill for this account.
// It is never allocated automatically to a model call or added to reservations.
export function recordProviderStatement(email,input,{base=process.cwd(),now=new Date()}={}) {
  const provider=typeof input?.provider==='string'?input.provider.trim():'';
  const reference=typeof input?.reference==='string'?input.reference.trim():'';
  const periodEnd=input?.periodEnd,amount=String(input?.amount??''),currency=input?.currency;
  if(!provider || provider.length>100 || !reference || reference.length>150) throw Error('请填写供应商与账单编号');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !Number.isFinite(Date.parse(periodEnd)) || new Date(periodEnd).toISOString().slice(0,10)!==periodEnd || periodEnd>now.toISOString().slice(0,10)) throw Error('请填写已结束的有效账期日期');
  if(!['USD','CNY'].includes(currency) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) throw Error('账单金额应为非负金额，最多两位小数');
  const [whole,fraction='']=amount.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  const owner=createHash('sha256').update(email.toLowerCase()).digest('hex');
  const dir=path.join(base,'data');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,'model-spend.sqlite');
  withSpendDb(file,db=>{
    fs.chmodSync(file,0o600);
    db.exec(`CREATE TABLE IF NOT EXISTS statements(
      owner TEXT NOT NULL,provider TEXT NOT NULL,reference TEXT NOT NULL,periodEnd TEXT NOT NULL,
      currency TEXT NOT NULL,cents INTEGER NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(owner,provider,reference));
      BEGIN IMMEDIATE;`);
    try{
      const prior=db.prepare('SELECT * FROM statements WHERE owner=? AND provider=? AND reference=?').get(owner,provider,reference);
      if(prior && [prior.periodEnd,prior.currency,prior.cents].some((v,i)=>v!==[periodEnd,currency,cents][i])){
        if(input.baseRevision!==prior.revision)throw Error('该编号已有账单，点开已有记录后更正');
        db.prepare('UPDATE statements SET periodEnd=?,currency=?,cents=?,revision=revision+1 WHERE owner=? AND provider=? AND reference=?').run(periodEnd,currency,cents,owner,provider,reference);
      }else if(!prior){
        if(input.baseRevision)throw Error('原账单已变化，请刷新');
        db.prepare('INSERT INTO statements VALUES(?,?,?,?,?,?,1)').run(owner,provider,reference,periodEnd,currency,cents);
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  });
}
export function readModelSpend(email, { now = new Date(), base = process.cwd() } = {}) {
  if (typeof email !== 'string' || !email.trim()) throw new Error('缺少账号');
  const day = now.toISOString().slice(0, 10);
  const owner = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const file = path.join(base, 'data', 'model-spend.sqlite');
  let history = [], measuredUsage=null, providerStatements=[];
  if (fs.existsSync(file)) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout=5000;');
      if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_calls'").get())
        measuredUsage=usageSummary(db,'owner=? AND day=?',[owner,day]);
      if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='statements'").get())
        providerStatements=db.prepare('SELECT provider,reference,periodEnd,currency,cents,revision FROM statements WHERE owner=? AND periodEnd<=? ORDER BY periodEnd DESC,provider,reference LIMIT 100').all(owner,day);
      if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spend'").get())
        history = db.prepare('SELECT day,cents,calls FROM spend WHERE owner=? AND day<=? ORDER BY day DESC LIMIT 30').all(owner, day);
    } finally { db.close(); }
  }
  const today = history.find(row => row.day === day) || { cents: 0, calls: 0 };
  const dailyLimitCents = setting('HARTA_MODEL_ACCOUNT_DAILY_CENTS', 1000);
  return {
    kind: 'protection-reservations', currency: 'USD', day,
    reservedCents: today.cents, calls: today.calls, dailyLimitCents,
    remainingCents: Math.max(0, dailyLimitCents - today.cents),
    dailyCallLimit: setting('HARTA_MODEL_ACCOUNT_DAILY_CALLS', 100),
    resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(),
    history, measuredUsage, providerStatements, actualCharges: null,
  };
}
