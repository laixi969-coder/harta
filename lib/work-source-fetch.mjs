import {Agent,fetch as undiciFetch} from 'undici';
import {assertPublicUrl,publicLookup} from './recon.mjs';

// User-triggered import only. Reject redirects and resolve public hosts at the
// socket, so credentials cannot be forwarded to a redirected or private host.
export async function fetchWorkSource({url,token=''}={}, {allowLocal=false,fetcher=undiciFetch,validate=assertPublicUrl,dispatcher}={}) {
 if(typeof url!=='string'||url.length>2048||!url.trim())throw new Error('请填写数据接口地址');
 if(typeof token!=='string'||token.length>4096||/[\x00-\x1f\x7f]/.test(token))throw new Error('接口密钥格式不正确');
 let parsed;try{parsed=new URL(url.trim());}catch{throw new Error('数据接口地址无效');}
 if(parsed.username||parsed.password||parsed.hash)throw new Error('地址不能包含账号、密码或片段');
 const loopback=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
 if(loopback){if(!allowLocal||!['http:','https:'].includes(parsed.protocol))throw new Error('仅管理员可读取本机接口');if(parsed.hostname==='localhost'&&parsed.protocol==='http:')parsed.hostname='127.0.0.1';if(parsed.hostname==='localhost')throw new Error('本机 HTTPS 接口请填写明确的回环 IP');}
 else {if(parsed.protocol!=='https:')throw new Error('公网数据接口须使用 HTTPS');parsed=await validate(parsed.href);}
 const agent=dispatcher||(!loopback?new Agent({connect:{lookup:publicLookup,timeout:10000}}):null);
 try{
  const headers={accept:'application/json, application/x-ndjson, text/csv, text/plain'};if(token){headers.authorization='Bearer '+token;headers['x-ingest-token']=token;}
  let res;try{res=await fetcher(parsed.href,{headers,redirect:'manual',signal:AbortSignal.timeout(20000),...(agent?{dispatcher:agent}:{})});}catch{throw new Error('数据接口连接失败，请检查地址和网络');}
  if(res.status>=300&&res.status<400){await res.body?.cancel();throw new Error('数据接口返回跳转，请直接填写最终地址');}
  if(!res.ok){await res.body?.cancel();throw new Error(`数据接口返回 HTTP ${res.status}，请检查权限`);}
  const reader=res.body?.getReader();if(!reader)throw new Error('数据接口没有返回内容');const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000){await reader.cancel();throw new Error('接口数据超过 500 KB，请分批导出');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  const text=Buffer.concat(chunks).toString('utf8');if(!text.trim())throw new Error('数据接口没有返回内容');return text;
 }finally{if(!dispatcher&&agent)await agent.destroy();}
}
