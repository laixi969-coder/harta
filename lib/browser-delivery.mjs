import { manualPlatformOnly } from './platform-execution-policy.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {IncomingForm} from 'formidable';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {leadAction} from './acquisition-workspace.mjs';
import {connections,platformUrl} from './platform-connector.mjs';
const now=()=>new Date().toISOString(),uid=()=>crypto.randomUUID(),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=m=>{throw new Error(m);};
const load=email=>{const s=readWorkspace(email);s.acquisition||={};for(const key of ['deliveryJobs','deliveryAssets','replyRules','inboundEvents','accounts','leads','signals','publications'])s.acquisition[key]||=[];return s;};
function connection(email,id){return connections(email).find(c=>c.id===id&&c.status==='paired')||fail('请使用有效的浏览器连接');}
const mediaDir=email=>path.join(process.cwd(),'data','delivery-media',hash(email));
export async function uploadDeliveryAsset(email,req){
 const dir=mediaDir(email);fs.mkdirSync(dir,{recursive:true,mode:0o700});let uploads=[];
 try{const [fields,files]=await new IncomingForm({uploadDir:dir,maxFiles:1,maxFileSize:80*1024*1024,maxTotalFileSize:80*1024*1024,maxFieldsSize:2048,allowEmptyFiles:false}).parse(req);uploads=Object.values(files).flat();const f=uploads[0],customerId=fields.customerId?.[0],s=load(email);if(!s.customers.some(c=>c.id===customerId))fail('业务不存在');if(!f)fail('请选择图片或 MP4 视频');
 const fd=fs.openSync(f.filepath,'r'),buf=Buffer.alloc(16);fs.readSync(fd,buf,0,16,0);fs.closeSync(fd);let mime,ext;
 if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){mime='image/png';ext='png';}else if(buf[0]===255&&buf[1]===216&&buf[2]===255){mime='image/jpeg';ext='jpg';}else if(buf.toString('ascii',4,8)==='ftyp'){mime='video/mp4';ext='mp4';}else fail('文件内容不是支持的 PNG、JPEG 或 MP4');
 const id=uid(),name=id+'.'+ext;fs.renameSync(f.filepath,path.join(dir,name));const asset={id,customerId,name,mime,size:f.size,originalName:String(f.originalFilename||name).slice(0,200),createdAt:now()};s.acquisition.deliveryAssets.push(asset);writeWorkspace(email,s);return asset;
 }finally{for(const f of uploads)if(fs.existsSync(f.filepath))fs.rmSync(f.filepath);}
}
export function deliveryAsset(r,input){const s=load(r.email),j=s.acquisition.deliveryJobs.find(j=>j.id===input.jobId&&j.connectionId===r.id&&j.lease===input.lease&&j.status==='preparing');if(!j||!j.assetIds?.includes(input.assetId))fail('素材不属于当前发布任务');const a=s.acquisition.deliveryAssets.find(a=>a.id===input.assetId&&a.customerId===r.customerId);if(!a)fail('找不到素材');return {...a,buffer:fs.readFileSync(path.join(mediaDir(r.email),a.name))};}
export function bindDeliveryIdentity(email,input){
 const c=connection(email,input.connectionId),s=load(email),a=s.acquisition.accounts.find(a=>a.id===c.accountId);if(input.confirmed!==true)fail('请核对自己的完整主页链接');
 const url=platformUrl(input.profileUrl,c.platform,'profile'),id=new URL(url).pathname.split('/').filter(Boolean).at(-1);a.platformUserId=id;a.profileUrl=url;a.deliveryIdentityConfirmedAt=now();writeWorkspace(email,s);return a;
}
export function queueDelivery(_email,_input){ return manualPlatformOnly(); }
function expire(s){for(const j of s.acquisition.deliveryJobs)if(['preparing','submitting'].includes(j.status)&&Date.parse(j.startedAt)<Date.now()-10*60_000){j.status=j.status==='submitting'?'unknown':'failed';j.error=j.status==='unknown'?'提交后未收到回执，请先到平台核对；禁止自动重试':'浏览器准备超时，未获得提交许可';j.finishedAt=now();if(j.status==='unknown'&&j.ruleId){const rule=s.acquisition.replyRules.find(r=>r.id===j.ruleId);if(rule){rule.enabled=false;rule.revision++;rule.pauseReason='提交后未收到回执，先核对平台';}}}}
export function deliveryState(email){const s=load(email);expire(s);
 for(const j of s.acquisition.deliveryJobs){if(['queued','preparing'].includes(j.status)){j.status='cancelled';j.finishedAt=now();j.error='平台自动执行已停用，未发出新提交许可';}else if(j.status==='submitting'){j.status='unknown';j.error='平台自动执行已停用，请人工核对原提交结果';}}
 for(const r of s.acquisition.replyRules){if(r.enabled){r.enabled=false;r.revision++;r.pauseReason='平台自动回复已停用';}}
 writeWorkspace(email,s);return {jobs:s.acquisition.deliveryJobs.slice(-100).reverse(),assets:s.acquisition.deliveryAssets,rules:s.acquisition.replyRules,events:s.acquisition.inboundEvents.slice(-100).reverse()};}
export function cancelDelivery(email,input){const s=load(email),j=s.acquisition.deliveryJobs.find(v=>v.id===input.jobId);if(!j)fail('任务不存在');if(['submitting','unknown','submitted','succeeded'].includes(j.status))fail('任务可能已提交，不能当作取消；请核对平台结果');j.status='cancelled';j.finishedAt=now();writeWorkspace(email,s);return j;}
export function claimDelivery(r){ deliveryState(r.email); return null; }
function ownedJob(s,r,input){return s.acquisition.deliveryJobs.find(j=>j.id===input.jobId&&j.connectionId===r.id&&j.lease===input.lease)||fail('执行凭证无效');}
export function authorizeDelivery(_r,_input){ return manualPlatformOnly(); }
export function completeDelivery(r,input){const s=load(r.email),j=ownedJob(s,r,input);const lateReceipt=j.status==='unknown'&&input.status==='succeeded'&&j.attempts===1;if(!['preparing','submitting'].includes(j.status)&&!lateReceipt){if(j.receiptKey===hash(input))return j;fail('任务已完成或取消');}
 const sentPhase=j.status==='submitting'||lateReceipt;if(!['failed','unknown','submitted','succeeded','login_required','challenge','unsupported'].includes(input.status))fail('结果状态无效');if(!sentPhase&&['succeeded','submitted','unknown'].includes(input.status))fail('尚未获得提交许可');
 const receipt=input.receipt||{};if(input.status==='succeeded'&&(!receipt.platformId||!receipt.evidence||receipt.actorId!==j.expectedActorId))fail('成功必须有平台回读标识、登录账号与可核对依据');if(input.status==='succeeded'&&j.kind!=='publish'&&(receipt.targetUserId!==j.targetUserId||receipt.text!==j.text))fail('回执对象或消息正文不一致');
 j.status=sentPhase&&['failed','login_required','challenge','unsupported'].includes(input.status)?'unknown':input.status;j.error=String(input.error||'').slice(0,1000);j.receipt={...receipt};j.finishedAt=now();j.receiptKey=hash(input);
 if(j.status==='unknown'&&j.ruleId){const rule=s.acquisition.replyRules.find(v=>v.id===j.ruleId);if(rule){rule.enabled=false;rule.revision++;rule.pauseReason='上一条回复结果不明，先核对平台';}}
 if(j.status==='succeeded'){
  if(j.kind==='publish'){
   const url=platformUrl(receipt.url,j.platform,'work');let pub=s.acquisition.publications.find(p=>p.id===j.publicationId);if(!pub){pub={id:uid(),customerId:j.customerId,accountId:j.accountId,platform:j.platform,content:{title:j.title,body:j.body},createdAt:j.createdAt};s.acquisition.publications.push(pub);j.publicationId=pub.id;}
   Object.assign(pub,{status:'published',url,publishedAt:now(),platformContentId:receipt.platformId,confirmationSource:'browser_receipt',deliveryJobId:j.id,visibility:j.visibility});
  }else{const l=s.acquisition.leads.find(l=>l.id===j.leadId),m=l?.messages.find(m=>m.id===j.messageId);if(m){m.status='sent_platform';m.sentAt=now();m.platformMessageId=receipt.platformId;m.evidence=receipt.evidence;m.deliveryJobId=j.id;}if(l){l.needsReply=l.messages.some(v=>v.direction==='inbound'&&!l.messages.some(m=>['sent_manual','sent_platform'].includes(m.status)&&m.replyTo===v.id));l.updatedAt=now();}}
 }
 writeWorkspace(r.email,s);return j;
}
export function saveReplyRule(email,input){
 if(input.action!=='pause')return manualPlatformOnly();
 const s=load(email),rule=s.acquisition.replyRules.find(r=>r.id===input.id);
 if(!rule)fail('规则不存在');rule.enabled=false;rule.revision++;writeWorkspace(email,s);return rule;
}
export function replyMonitors(r){ deliveryState(r.email); return []; }
export function receiveBrowserEvents(_r,_input){ return manualPlatformOnly(); }
export function monitorError(r,input){const s=load(r.email),rule=s.acquisition.replyRules.find(v=>v.id===input.ruleId&&v.connectionId===r.id);if(!rule)fail('规则不存在');rule.lastAttemptAt=now();rule.lastError=String(input.error||'读取失败').slice(0,500);writeWorkspace(r.email,s);return {saved:true};}
