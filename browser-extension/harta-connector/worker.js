import {runDelivery,runMonitors,flushReceipts} from './delivery-worker.js';
const busy=new Set();
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
export function validOrigin(raw){const u=new URL(raw);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))))throw new Error('Harta 地址必须是 HTTPS 域名或本机 localhost 地址');return u.origin;}
async function request(c,action,body={}){const r=await fetch(`${c.origin}/api/connector/${action}`,{method:'POST',headers:{'content-type':'application/json',...(c.token?{authorization:`Bearer ${c.token}`}:{})},body:JSON.stringify(body),credentials:'omit',signal:AbortSignal.timeout(action==='delivery-asset'?120000:20000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Harta 连接失败');return data;}
async function update(id,patch){const {connections=[]}=await chrome.storage.local.get('connections');await chrome.storage.local.set({connections:connections.map(c=>c.id===id?{...c,...patch}:c)});}
function allowedUrl(raw,platform){const u=new URL(raw),host=platform==='抖音'?'www.douyin.com':'www.xiaohongshu.com';if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password||u.port)throw new Error('任务中的平台地址无效');return u.href;}
async function loaded(tabId){for(let n=0;n<40;n++){const t=await chrome.tabs.get(tabId);if(t.status==='complete')return;await new Promise(r=>setTimeout(r,500));}throw new Error('平台页面加载超时');}
async function run(c){
 if(busy.has(c.id))return;busy.add(c.id);let job;
 try{
  const result=await request(c,'claim');job=result.job;if(!job){const {executeDelivery=false}=await chrome.storage.local.get('executeDelivery');if(executeDelivery){await flushReceipts(c,request);await runDelivery(c,request);await runMonitors(c,request);}await update(c.id,{lastChecked:new Date().toISOString(),error:''});return;}
  const targetUrl=allowedUrl(job.targetUrl,c.platform);
  // Reuse an already-open matching page so the user can expand replies or solve a challenge.
  const tabs=await chrome.tabs.query({url:c.platform==='抖音'?'https://www.douyin.com/*':'https://www.xiaohongshu.com/*'});
  let tab=tabs.find(t=>{try{return new URL(t.url).pathname===new URL(targetUrl).pathname;}catch{return false;}});
  if(!tab)tab=await chrome.tabs.create({url:targetUrl,active:false});
  await loaded(tab.id);await new Promise(r=>setTimeout(r,2000));
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js']});
  const resultRows=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async options=>globalThis.hartaReadPage(options),args:[{kind:job.kind,limit:job.limit,scrollRounds:3}]});
  const captured=resultRows[0]?.result;if(!captured)throw new Error('平台未返回可识别内容');
  await request(c,'complete',{jobId:job.id,lease:job.lease,...captured});await update(c.id,{lastChecked:new Date().toISOString(),lastResult:captured.status,error:captured.error||''});
 }catch(error){await update(c.id,{error:error.message});if(job)try{await request(c,'complete',{jobId:job.id,lease:job.lease,status:'failed',rows:[],pageUrl:job.targetUrl,error:error.message});}catch{}}
 finally{busy.delete(c.id);}
}
chrome.alarms.create('harta-jobs',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(async alarm=>{if(alarm.name!=='harta-jobs')return;const {connections=[],autoRead=false}=await chrome.storage.local.get(['connections','autoRead']);if(autoRead)for(const c of connections)await run(c);});
chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
 (async()=>{
  if(message.action==='pair'){
   const origin=validOrigin(message.origin),result=await request({origin},'pair',{code:message.code,deviceName:message.deviceName});
   const {connections=[]}=await chrome.storage.local.get('connections'),entry={...result.connection,origin,token:result.token};
   await chrome.storage.local.set({connections:[...connections.filter(c=>!(c.origin===origin&&c.accountId===entry.accountId)),entry]});return {ok:true};
  }
  if(message.action==='run'){const {connections=[]}=await chrome.storage.local.get('connections');for(const c of connections.filter(c=>!message.id||c.id===message.id))await run(c);return {ok:true};}
  if(message.action==='forget'){const {connections=[]}=await chrome.storage.local.get('connections');await chrome.storage.local.set({connections:connections.filter(c=>c.id!==message.id)});return {ok:true};}
  throw new Error('操作无效');
 })().then(reply,error=>reply({error:error.message}));return true;
});
