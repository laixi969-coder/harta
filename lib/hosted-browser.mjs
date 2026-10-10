import crypto from 'node:crypto';
import {isWhitelisted,findUser} from './auth.mjs';
import {readWorkspace} from './workspace.mjs';
import {createHostedConnection,hostedConnection,revokeConnection,claimCollection,completeCollection} from './platform-connector.mjs';
import {claimDelivery,authorizeDelivery,completeDelivery,deliveryAsset,replyMonitors,receiveBrowserEvents,monitorError} from './browser-delivery.mjs';
import {readHosted,saveHosted,hostedRows,publicHosted} from './hosted-browser-store.mjs';
import {browserExecutable,createRuntime,home} from './hosted-browser-runtime.mjs';
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const waiting=['starting','login_required','challenge','network_error','expired','identity_mismatch'];
function errorText(e){if(/ERR_CONNECTION_CLOSED/.test(e.message))return '抖音或小红书连接被关闭（ERR_CONNECTION_CLOSED），尚未到登录页面。请检查服务运行电脑的网络后重试。';if(/timeout|ERR_|net::/i.test(e.message))return '平台页面暂时无法加载，请稍后重试连接。';return String(e.message||'浏览器操作失败').split('\n')[0].slice(0,240);}
export function createHostedService({makeRuntime=createRuntime,available=()=>Boolean(browserExecutable()),canRun=email=>isWhitelisted(email)&&Boolean(findUser(email)?.passwordHash)}={}){
 const runtimes=new Map(),locks=new Set(),starting=new Set(),opening=new Set();let timer;
 function owned(email,id){const r=readHosted(id,email);if(!readWorkspace(email).customers.some(c=>c.id===r.customerId))throw fail('业务已不存在',404);return r;}
 function change(id,fn){const row=readHosted(id);fn(row);saveHosted(row);return row;}
 async function runtime(row){let rt=runtimes.get(row.id);if(!rt){if(runtimes.size+opening.size>=4)throw fail('后台浏览器正忙，请先关闭不用的连接',429);opening.add(row.id);try{rt=await makeRuntime(row);runtimes.set(row.id,rt);}finally{opening.delete(row.id);}}return rt;}
 async function close(id){const rt=runtimes.get(id);runtimes.delete(id);if(rt)await rt.close().catch(()=>{});}
 async function inspect(id,rt){
  const row=readHosted(id);if(row.status==='disconnected')return row;
  if(row.expiresAt<Date.now()){await close(id);return change(id,r=>{r.status='expired';r.error='本次登录已超时，请重新打开登录页';});}
  let actor;try{actor=await rt.actor();}catch(e){return change(id,r=>{r.status=e.status==='challenge'?'challenge':'login_required';r.error=e.status==='challenge'?'请在下方平台页面完成验证。':'请在平台页面扫码登录。若已登录仍未连接，说明页面身份暂未识别，不必反复扫码。';});}
  if(row.actorId&&row.actorId!==actor.actorId)return change(id,r=>{r.status='identity_mismatch';r.error='当前登录账号与原连接不同，请断开后连接新账号';});
  const state=await rt.state();if(readHosted(id).status==='disconnected')return readHosted(id);
  let connection;
  if(row.connectionId){try{connection=hostedConnection(row.email,row.connectionId);}catch{throw fail('原连接已过期或断开，请创建新连接');}}
  else connection=createHostedConnection(row.email,{customerId:row.customerId,platform:row.platform,actorId:actor.actorId,profileUrl:actor.profileUrl,name:actor.name});
  return change(id,r=>{r.status='connected';r.error='';r.actorId=actor.actorId;r.profileUrl=actor.profileUrl;r.connectionId=connection.id;r.name=connection.name;r.storageState=state;r.expiresAt=connection.expiresAt;r.lastSeenAt=new Date().toISOString();});
 }
 async function open(id){if(locks.has(id))return;locks.add(id);try{const row=readHosted(id);if(row.status==='disconnected')return;const rt=await runtime(row);if(readHosted(id).status==='disconnected'){await close(id);return;}await rt.open();await inspect(id,rt);}catch(e){change(id,r=>{if(r.status!=='disconnected'){r.status='network_error';r.error=errorText(e);}});}finally{locks.delete(id);}}
 function list(email){return {available:available(),connections:hostedRows(email).map(publicHosted)};}
 async function start(email,input){
  if(!available())throw fail('后台浏览器尚未安装，请由管理员配置浏览器运行环境',503);
  if(!['抖音','小红书'].includes(input.platform))throw fail('请选择抖音或小红书');
  if(!readWorkspace(email).customers.some(c=>c.id===input.customerId))throw fail('请先选择自己的业务');
  const key=email+':'+input.customerId+':'+input.platform;if(starting.has(key))throw fail('正在创建连接，请稍候',409);starting.add(key);
  try{const pending=hostedRows(email).find(r=>r.customerId===input.customerId&&r.platform===input.platform&&waiting.includes(r.status)&&r.expiresAt>Date.now());if(pending)return publicHosted(pending);
   if(hostedRows(email).filter(r=>r.status!=='disconnected'&&r.expiresAt>Date.now()).length>=3)throw fail('最多保留三个后台浏览器连接，请先断开不用的账号');
   const row={id:crypto.randomUUID(),email,platform:input.platform,customerId:input.customerId,status:'starting',createdAt:new Date().toISOString(),expiresAt:Date.now()+10*60_000,executionEnabled:false};saveHosted(row);void open(row.id);return publicHosted(row);
  }finally{starting.delete(key);}
 }
 async function status(email,input){let row=owned(email,input.id);if(['starting','login_required','challenge','identity_mismatch'].includes(row.status)&&!locks.has(row.id)&&!runtimes.has(row.id)){row=change(row.id,r=>{r.status='network_error';r.error='登录浏览器已关闭，请重新打开登录页';});}if(waiting.includes(row.status)&&row.status!=='network_error'&&!locks.has(row.id)&&runtimes.has(row.id)){locks.add(row.id);try{row=await inspect(row.id,runtimes.get(row.id));}finally{locks.delete(row.id);}}return publicHosted(row);}
 async function frame(email,input){const row=owned(email,input.id);if(!['login_required','challenge','identity_mismatch'].includes(row.status)||locks.has(row.id))throw fail('登录画面尚未就绪，或账号已经连接',409);if(row.expiresAt<Date.now())throw fail('登录页面已过期，请重新连接',409);const rt=runtimes.get(row.id);if(!rt)throw fail('登录页面已关闭，请重新连接',409);return rt.frame();}
 async function click(email,input){const row=owned(email,input.id);if(!['login_required','challenge','identity_mismatch'].includes(row.status)||locks.has(row.id)||row.expiresAt<Date.now())throw fail('当前状态不能操作登录页面',409);const {x,y}=input;if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=1280||y<0||y>=900)throw fail('点击位置无效');const rt=runtimes.get(row.id);if(!rt)throw fail('登录页面已关闭');locks.add(row.id);try{if(input.toX!==undefined){if(!Number.isFinite(input.toX)||!Number.isFinite(input.toY)||input.toX<0||input.toX>=1280||input.toY<0||input.toY>=900)throw fail('拖动位置无效');await rt.drag(x,y,input.toX,input.toY);}else await rt.click(x,y);return publicHosted(await inspect(row.id,rt));}finally{locks.delete(row.id);}}
 async function retry(email,input){const row=owned(email,input.id);if(row.status==='disconnected'||locks.has(row.id))throw fail('连接已断开或正在处理',409);change(row.id,r=>{r.status='starting';r.expiresAt=Date.now()+10*60_000;r.error='';});void open(row.id);return publicHosted(readHosted(row.id));}
 async function disconnect(email,input){const row=owned(email,input.id);change(row.id,r=>{r.status='disconnected';r.executionEnabled=false;delete r.storageState;});if(row.connectionId)try{revokeConnection(email,{connectionId:row.connectionId});}catch{}await close(row.id);return publicHosted(readHosted(row.id));}
 function enable(email,input){const row=owned(email,input.id);if(row.status!=='connected')throw fail('请先完成平台登录');if(typeof input.enabled!=='boolean')throw fail('执行开关无效');return publicHosted(change(row.id,r=>{r.executionEnabled=input.enabled;}));}
 async function flush(row,c){for(const receipt of row.receipts||[]){completeDelivery(c,receipt);change(row.id,r=>{r.receipts=(r.receipts||[]).filter(v=>v.jobId!==receipt.jobId);});}}
 async function run(id){
  if(locks.has(id))return;const row=readHosted(id);if(row.status!=='connected'||!canRun(row.email))return;
  locks.add(id);let c,rt;
  try{
   c=hostedConnection(row.email,row.connectionId);await flush(row,c);rt=await runtime(row);
   // A fresh context restores only this connection's encrypted state.
   const actor=await rt.actor();if(actor.actorId!==row.actorId)throw Object.assign(new Error('登录账号已变化，请重新核对'),{status:'identity_mismatch'});
   const collection=claimCollection(c);
   if(collection){try{const result=await rt.collect(collection);completeCollection(c,{jobId:collection.id,lease:collection.lease,...result});if(['completed','partial'].includes(result.status))change(id,r=>{r.capabilities={...r.capabilities,[collection.kind==='comments'?'comments':'works']:'verified'};});else if(['challenge','login_required'].includes(result.status))throw Object.assign(new Error(result.error||'需要登录'),{status:result.status});}catch(e){try{completeCollection(c,{jobId:collection.id,lease:collection.lease,status:'failed',rows:[],pageUrl:collection.targetUrl,error:errorText(e)});}catch{}throw e;}return;}
   if(!readHosted(id).executionEnabled)return;
   const job=claimDelivery(c);
   if(job){let submitted=false,result;
    try{const assets=(job.assetIds||[]).map(assetId=>deliveryAsset(c,{jobId:job.id,lease:job.lease,assetId}));const evidence=await rt.prepare(job,actor,assets);const fresh=await rt.actor();if(fresh.actorId!==row.actorId)throw new Error('提交前登录账号发生变化');const current=readHosted(id);if(current.status!=='connected'||!current.executionEnabled)throw new Error('连接已关闭或实际执行已暂停');authorizeDelivery(c,{jobId:job.id,lease:job.lease,evidence});submitted=true;result=await rt.submit(job);
    }catch(e){result={status:submitted?'unknown':e.status||'unsupported',error:errorText(e)};}
    const receipt={jobId:job.id,lease:job.lease,...result};change(id,r=>{r.receipts=[...(r.receipts||[]),receipt];});await flush(readHosted(id),c);
    if(result.status==='succeeded')change(id,r=>{r.capabilities={...r.capabilities,[job.kind]:'verified'};});
    if(['challenge','login_required'].includes(result.status))throw Object.assign(new Error(result.error),{status:result.status});
    if(result.status==='unknown')change(id,r=>{r.executionEnabled=false;r.error='提交结果不明，实际执行已暂停。请先核对平台，系统不会自动重发。';});
   }
   if(readHosted(id).executionEnabled)for(const rule of replyMonitors(c)){try{const rows=await rt.inbox(rule);receiveBrowserEvents(c,{ruleId:rule.id,revision:rule.revision,actorId:actor.actorId,pageUrl:rule.scopeUrl,rows});}catch(e){monitorError(c,{ruleId:rule.id,error:errorText(e)});}}
   const fresh=readHosted(id);if(fresh.status==='connected'){const state=await rt.state();change(id,r=>{if(r.status==='connected'){r.storageState=state;r.lastSeenAt=new Date().toISOString();}});}
  }catch(e){change(id,r=>{if(r.status!=='disconnected'){r.status=['challenge','login_required','identity_mismatch'].includes(e.status)?e.status:'network_error';r.error=errorText(e);}});}
  finally{locks.delete(id);}
 }
 function startWorker(){if(timer)return;timer=setInterval(()=>{for(const row of hostedRows()){if(row.status==='connected')void run(row.id);else if(row.status!=='disconnected'&&row.expiresAt<Date.now()&&!locks.has(row.id))void close(row.id);}},10000);timer.unref();}
 async function stop(){clearInterval(timer);timer=null;await Promise.all([...runtimes.keys()].map(close));}
 return {list,start,status,frame,click,retry,disconnect,enable,run,startWorker,stop};
}
export const hostedBrowser=createHostedService();
