import net from 'node:net';
// Only the fixed official host is contacted. Never relay raw upstream messages.
const API='https://api.weixin.qq.com';
export class WechatError extends Error{constructor(code,upstreamMessage='',secrets=[]){const candidate=code===40164&&typeof upstreamMessage==='string'?/^invalid ip\s+([^\s,]+)/i.exec(upstreamMessage)?.[1]:'';const ip=candidate&&net.isIP(candidate)&&!secrets.some(secret=>typeof secret==='string'&&secret.includes(candidate))?candidate:'';super((code===40164&&ip?`公众号接口拒绝了本次出口 IP ${ip}，请在公众平台加入 IP 白名单后重新连接`:({40164:'公众号接口拒绝了当前服务器 IP，请在公众平台核对白名单',40013:'公众号 AppID 无效，请核对开发者配置',40001:'公众号调用凭证无效，请核对配置或重新连接',40125:'公众号 AppSecret 无效或已重置',42001:'公众号调用凭证已过期',48001:'公众号未获得此接口权限，可检查权限或改为同步素材库',45009:'公众号接口调用额度已用完，请稍后再试'}[code]))||`公众号接口未完成请求（错误码 ${code}）`);this.code=code;}}
export function createWechatClient(fetcher=globalThis.fetch){
 async function call(route,body,token,signal){
  const url=new URL(route,API);if(token)url.searchParams.set('access_token',token);
  let response;
  try{response=await fetcher(url.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])});}
  catch{throw new Error(signal?.aborted?'公众号操作已取消':'公众号接口暂时无法连接，请稍后重试');}
  if(!response.ok)throw new Error('公众号接口暂时不可用，请稍后重试');
  let data;
  try{let size=0,parts=[];for await(const chunk of response.body){size+=chunk.length;if(size>5*1024*1024)throw new Error();parts.push(Buffer.from(chunk));}data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new Error('公众号接口返回的数据不完整或过大，本次未导入');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('公众号接口返回格式不正确');
  if(data.errcode&&data.errcode!==0)throw new WechatError(Number(data.errcode),data.errmsg,[body.secret,token]);
  return data;
 }
 return {
  async token(appId,appSecret,signal){
   // Stable token avoids unnecessarily invalidating tokens held by other tools.
   const data=await call('/cgi-bin/stable_token',{grant_type:'client_credential',appid:appId,secret:appSecret,force_refresh:false},null,signal);
   if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new Error('公众号未返回有效调用凭证');
   return {token:data.access_token,expiresAt:Date.now()+Math.max(1,data.expires_in-200)*1000};
  },
  async page(token,source,offset,signal){
   const data=await call(source==='published'?'/cgi-bin/freepublish/batchget':'/cgi-bin/material/batchget_material',source==='published'?{offset,count:20,no_content:0}:{type:'news',offset,count:20},token,signal);
   if(!Array.isArray(data.item)||!Number.isSafeInteger(data.total_count)||data.total_count<offset+data.item.length||data.item.length>20)throw new Error('公众号列表返回格式不正确，本次未导入');
   return {items:data.item,total:data.total_count};
  }
 };
}
export function wechatPlainText(value){
 if(typeof value!=='string')return '';
 return value.replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<br\s*\/?>|<\/(?:p|div|section|li|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos|#39);/gi,(match,code)=>{if(code[0]==='#'){const n=code[1]?.toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';}return {nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[code.toLowerCase()]||match;}).replace(/\n{3,}/g,'\n\n').trim();
}
export function wechatArticleUrl(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.hostname!=='mp.weixin.qq.com'||u.username||u.password||u.port)return '';u.protocol='https:';return u.href;}catch{return '';}}
export function wechatTime(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)return '';const ms=n>1e12?n:n*1000;return ms>Date.now()+86400000||ms<946684800000?'':new Date(ms).toISOString();}
