import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {IncomingForm} from 'formidable';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {leadAction,recordInquiry} from './acquisition-workspace.mjs';
import {connections,platformUrl} from './platform-connector.mjs';
import {checkRedline,checkSensitiveFields} from './check.mjs';
import {isScopeCurrent} from './product-scope.mjs';
const now=()=>new Date().toISOString(),uid=()=>crypto.randomUUID(),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=m=>{throw new Error(m);};
const text=(s,max=3000)=>typeof s==='string'&&s.trim()&&s.length<=max?s.trim():fail('内容不能为空或超过长度限制');
const load=email=>{const s=readWorkspace(email);s.acquisition||={};for(const key of ['deliveryJobs','deliveryAssets','replyRules','inboundEvents','accounts','leads','signals','publications'])s.acquisition[key]||=[];return s;};
function connection(email,id){return connections(email).find(c=>c.id===id&&c.status==='paired')||fail('请使用有效的浏览器连接');}
function safeText(s,customer){const v=text(s);if(checkRedline(v,customer.hunt).length||checkSensitiveFields([v],customer.hunt).length)fail('内容命中行业或敏感信息限制，请修改');return v;}
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
function validateCurrent(email,s,j){
 const c=connection(email,j.connectionId);if(c.accountId!==j.accountId||c.customerId!==j.customerId)fail('账号连接已变化');
 if(j.ruleId){const rule=s.acquisition.replyRules.find(r=>r.id===j.ruleId);if(!rule?.enabled||rule.revision!==j.ruleRevision||rule.connectionId!==j.connectionId)fail('自动回复规则已暂停或变化');}
 if(j.kind!=='publish'){
  leadAction(email,{leadId:j.leadId,messageId:j.messageId,action:'check-copy'});
  const l=s.acquisition.leads.find(l=>l.id===j.leadId),m=l?.messages.find(m=>m.id===j.messageId);if(!m||m.text!==j.text||m.accountId!==j.accountId||m.channel!==(j.kind==='dm'?'私信':'评论'))fail('发送内容或账号已变化');
  if(j.ruleId&&l.manualTakeover)fail('联系人已人工接管');
 }else if(j.publicationId){const pub=s.acquisition.publications.find(p=>p.id===j.publicationId);if(!pub||pub.status!=='pending_confirmation'||pub.revision!==j.revision||!isScopeCurrent(s,j.customerId,pub.productScope))fail('发布版本或产品资料已变化');}
 if(s.acquisition.accounts.find(a=>a.id===j.accountId)?.platformUserId!==j.expectedActorId)fail('账号绑定身份已变化，请重新创建任务');
 if(!j.expectedActorId)fail('请先核对并绑定实际登录的平台用户 ID');
}
export function bindDeliveryIdentity(email,input){
 const c=connection(email,input.connectionId),s=load(email),a=s.acquisition.accounts.find(a=>a.id===c.accountId);if(input.confirmed!==true)fail('请核对自己的完整主页链接');
 const url=platformUrl(input.profileUrl,c.platform,'profile'),id=new URL(url).pathname.split('/').filter(Boolean).at(-1);a.platformUserId=id;a.profileUrl=url;a.deliveryIdentityConfirmedAt=now();writeWorkspace(email,s);return a;
}
export function queueDelivery(email,input){
 const s=load(email),a=s.acquisition,c=connection(email,input.connectionId),account=a.accounts.find(a=>a.id===c.accountId),customer=s.customers.find(v=>v.id===c.customerId);
 if(input.confirmed!==true)fail('请核对发送对象、内容、账号与可见范围后确认执行');
 if(!account?.platformUserId)fail('请先绑定当前账号的真实主页');
 const j={id:uid(),connectionId:c.id,customerId:c.customerId,accountId:c.accountId,platform:c.platform,expectedActorId:account.platformUserId,actorProfileUrl:account.profileUrl,kind:input.kind,status:'queued',createdAt:now(),attempts:0};
 if(['reply','dm'].includes(input.kind)){
  const l=a.leads.find(l=>l.id===input.leadId&&l.customerId===c.customerId&&l.platform===c.platform);if(!l)fail('联系人与账号不属于同一业务和平台');
  const m=l.messages.find(m=>m.id===input.messageId);if(!m||m.accountId!==c.accountId)fail('请选择当前账号的联系内容');
  leadAction(email,{leadId:l.id,messageId:m.id,action:'check-copy'});
  if(m.channel!==(input.kind==='dm'?'私信':'评论'))fail('内容渠道与发送方式不匹配');
  const sig=a.signals.find(v=>v.leadId===l.id&&(m.signalId?v.id===m.signalId:input.signalId?v.id===input.signalId:input.kind==='reply'?v.url===m.recipient:true));
  if(input.kind==='reply'&&(!sig||sig.identitySource==='dom_fingerprint'||!sig.recordId||sig.recordId.startsWith('dom-')))fail('自动回复原评论需要真实平台评论 ID，请重新采集');
  const target=input.kind==='reply'?sig?.url:(sig?.authorUrl||l.profileUrl);if(!target)fail('缺少接收对象的可核对主页或原评论');
  Object.assign(j,{leadId:l.id,messageId:m.id,text:m.text,targetUrl:platformUrl(target,c.platform,input.kind==='reply'?'work':'profile'),targetUserId:l.authorId,targetName:l.authorName,commentId:sig?.recordId||'',originalText:sig?.text||'',replyTo:m.replyTo||'',ruleId:input.ruleId||'',ruleRevision:input.ruleRevision});
  if(!j.targetUserId)fail('缺少稳定的平台用户 ID，不能按昵称发送');
  j.key=hash([c.accountId,l.id,m.id]);
 }else if(input.kind==='publish'){
  const pub=input.publicationId?a.publications.find(p=>p.id===input.publicationId&&p.customerId===c.customerId&&p.accountId===c.accountId):null;if(input.publicationId&&!pub)fail('发布记录不属于当前账号');
  const title=safeText(pub?.content?.title||input.title,customer),body=safeText(pub?.content?.body||input.body,customer);
  if(!['private','public'].includes(input.visibility))fail('请选择明确的发布可见范围');
  const assetIds=input.assetIds;if(!Array.isArray(assetIds)||!assetIds.length||assetIds.length>9||new Set(assetIds).size!==assetIds.length)fail('请选择 1–9 份发布素材');
  const assets=assetIds.map(id=>a.deliveryAssets.find(v=>v.id===id&&v.customerId===c.customerId)||fail('素材不属于当前业务'));
  if(assets.reduce((n,a)=>n+a.size,0)>80*1024*1024)fail('本次素材总大小不能超过 80 MB');
  if(c.platform==='抖音'&&(assets.length!==1||assets[0].mime!=='video/mp4'))fail('抖音发布目前需要一份 MP4 成片，脚本不能代替视频');
  if(c.platform==='小红书'&&assets.some(v=>!v.mime.startsWith('image/')))fail('小红书发布目前支持图文笔记');
  Object.assign(j,{title,body,assetIds,assets:assets.map(({id,name,mime,size})=>({id,name,mime,size})),visibility:input.visibility,publicationId:pub?.id||'',revision:pub?.revision||hash([title,body]),targetUrl:c.platform==='抖音'?'https://creator.douyin.com/creator-micro/content/upload':'https://creator.xiaohongshu.com/publish/publish?source=official'});j.key=hash([c.accountId,j.kind,title,body,assetIds,j.visibility]);
 }else fail('执行任务类型无效');
 const old=a.deliveryJobs.find(v=>v.key===j.key&&!['failed','cancelled','unsupported','login_required','challenge'].includes(v.status));if(old)return old;
 validateCurrent(email,s,j);a.deliveryJobs.push(j);writeWorkspace(email,s);return j;
}
function expire(s){for(const j of s.acquisition.deliveryJobs)if(['preparing','submitting'].includes(j.status)&&Date.parse(j.startedAt)<Date.now()-10*60_000){j.status=j.status==='submitting'?'unknown':'failed';j.error=j.status==='unknown'?'提交后未收到回执，请先到平台核对；禁止自动重试':'浏览器准备超时，未获得提交许可';j.finishedAt=now();if(j.status==='unknown'&&j.ruleId){const rule=s.acquisition.replyRules.find(r=>r.id===j.ruleId);if(rule){rule.enabled=false;rule.revision++;rule.pauseReason='提交后未收到回执，先核对平台';}}}}
export function deliveryState(email){const s=load(email);expire(s);writeWorkspace(email,s);return {jobs:s.acquisition.deliveryJobs.slice(-100).reverse(),assets:s.acquisition.deliveryAssets,rules:s.acquisition.replyRules,events:s.acquisition.inboundEvents.slice(-100).reverse()};}
export function cancelDelivery(email,input){const s=load(email),j=s.acquisition.deliveryJobs.find(v=>v.id===input.jobId);if(!j)fail('任务不存在');if(['submitting','unknown','submitted','succeeded'].includes(j.status))fail('任务可能已提交，不能当作取消；请核对平台结果');j.status='cancelled';j.finishedAt=now();writeWorkspace(email,s);return j;}
export function claimDelivery(r){const s=load(r.email);expire(s);if(s.acquisition.deliveryJobs.some(j=>j.connectionId===r.id&&['preparing','submitting'].includes(j.status)))return null;const j=s.acquisition.deliveryJobs.find(j=>j.connectionId===r.id&&j.status==='queued');if(j){try{validateCurrent(r.email,s,j);j.status='preparing';j.startedAt=now();j.lease=uid();}catch(e){j.status='failed';j.error=e.message;j.finishedAt=now();}}writeWorkspace(r.email,s);return j?.status==='preparing'?j:null;}
function ownedJob(s,r,input){return s.acquisition.deliveryJobs.find(j=>j.id===input.jobId&&j.connectionId===r.id&&j.lease===input.lease)||fail('执行凭证无效');}
export function authorizeDelivery(r,input){const s=load(r.email),j=ownedJob(s,r,input);if(j.status!=='preparing')fail('该提交许可已经使用或任务已取消');if(Date.parse(j.startedAt)<Date.now()-10*60_000)fail('页面准备已超时，请重新创建任务');validateCurrent(r.email,s,j);const e=input.evidence||{};if(e.actorId!==j.expectedActorId||e.text!==(j.kind==='publish'?j.body:j.text))fail('浏览器登录账号或实际输入内容不匹配');if(j.kind==='publish'){if(e.visibility!==j.visibility||e.title!==j.title||e.assetCount!==j.assetIds.length)fail('发布标题、素材或可见范围未核对一致');}else if(e.targetUserId!==j.targetUserId||(j.kind==='reply'&&e.commentId!==j.commentId))fail('接收对象或原评论不匹配');
 // Reserve before any external click. Ambiguous outcomes never re-enter the queue.
 j.status='submitting';j.attempts++;j.submitAuthorizedAt=now();j.preflight=e;writeWorkspace(r.email,s);return {allowed:true,jobId:j.id};}
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
 const s=load(email),c=connection(email,input.connectionId),customer=s.customers.find(v=>v.id===c.customerId);let rule=s.acquisition.replyRules.find(v=>v.id===input.id&&v.customerId===c.customerId);if(input.id&&!rule)fail('规则不存在');
 if(input.action==='pause'){rule.enabled=false;rule.revision++;writeWorkspace(email,s);return rule;}
 if(input.confirmed!==true)fail('开启前需确认自动发送的内容和范围');if(!['评论','私信'].includes(input.channel))fail('回复渠道无效');
 const scopeUrl=platformUrl(input.scopeUrl,c.platform,input.channel==='评论'?'work':'profile'),keyword=text(input.keyword,100),response=safeText(input.response,customer),hourly=Number(input.hourly||5);if(!Number.isInteger(hourly)||hourly<1||hourly>20)fail('每小时上限为 1–20');
 const account=s.acquisition.accounts.find(a=>a.id===c.accountId);if(!account?.platformUserId)fail('先绑定真实账号主页');
 const value={id:rule?.id||uid(),customerId:c.customerId,connectionId:c.id,accountId:c.accountId,platform:c.platform,channel:input.channel,scopeUrl,keyword,response,hourly,enabled:true,revision:(rule?.revision||0)+1,createdAt:rule?.createdAt||now(),enabledAt:now(),baselineEstablished:false,expectedActorId:account.platformUserId};if(rule)Object.assign(rule,value);else s.acquisition.replyRules.push(value);writeWorkspace(email,s);return value;
}
export function replyMonitors(r){const s=load(r.email);return s.acquisition.replyRules.filter(v=>v.connectionId===r.id&&v.enabled).map(v=>({...v}));}
export function receiveBrowserEvents(r,input){
 let s=load(r.email);const rule=s.acquisition.replyRules.find(v=>v.id===input.ruleId&&v.connectionId===r.id&&v.enabled);if(!rule||rule.revision!==input.revision||input.actorId!==rule.expectedActorId)fail('规则版本或登录账号不匹配');
 if(!Array.isArray(input.rows)||input.rows.length>100)fail('消息读取范围无效');if(platformUrl(input.pageUrl,r.platform,rule.channel==='评论'?'work':'profile')!==rule.scopeUrl)fail('消息来源与监控范围不一致');
 const baseline=!rule.baselineEstablished;const jobs=[];
 for(const raw of input.rows){
  if(raw.direction!=='inbound'||!raw.platformId||!raw.authorId||raw.authorId===rule.expectedActorId)continue;
  const original=text(raw.text,6000),authorUrl=platformUrl(raw.authorUrl,r.platform,'profile');if(new URL(authorUrl).pathname.split('/').filter(Boolean).at(-1)!==raw.authorId)fail('消息作者与主页不一致');
  const key=hash([r.accountId,rule.channel,raw.platformId]);if(s.acquisition.inboundEvents.some(e=>e.key===key))continue;
  const event={id:uid(),key,ruleId:rule.id,accountId:r.accountId,customerId:r.customerId,platformId:String(raw.platformId).slice(0,200),authorId:raw.authorId,authorUrl,authorName:String(raw.authorName||raw.authorId).slice(0,100),text:original,channel:rule.channel,observedAt:now(),status:baseline?'baseline':'received'};
  s.acquisition.inboundEvents.push(event);writeWorkspace(r.email,s);
  if(baseline)continue;const matched=original.includes(rule.keyword);
  const recent=s.acquisition.deliveryJobs.filter(j=>j.ruleId===rule.id&&Date.parse(j.createdAt)>Date.now()-3600_000&&!['cancelled','failed'].includes(j.status));const limited=recent.length>=rule.hourly;
  const existing=s.acquisition.leads.find(l=>l.customerId===r.customerId&&l.platform===r.platform&&l.authorId===raw.authorId);const suppressed=existing?.doNotContact||existing?.manualTakeover;
  // Only new inbound messages in the user-selected scope trigger the exact configured reply.
  s=recordInquiry(r.email,{customerId:r.customerId,platform:r.platform,accountId:r.accountId,authorId:raw.authorId,authorName:event.authorName,channel:rule.channel,text:original,messageId:event.platformId,receivedAt:now(),evidence:'浏览器回读 '+rule.scopeUrl});
  const lead=s.acquisition.leads.find(l=>l.customerId===r.customerId&&l.platform===r.platform&&l.authorId===raw.authorId);lead.profileUrl=authorUrl;const inbound=lead.messages.find(m=>m.platformMessageId===event.platformId&&m.direction==='inbound');if(inbound)inbound.source='browser_inbound';
  let sig;if(rule.channel==='评论'){sig={id:uid(),customerId:r.customerId,platform:r.platform,leadId:lead.id,authorId:raw.authorId,authorName:event.authorName,authorUrl,url:rule.scopeUrl,recordId:event.platformId,text:original,status:'confirmed',sourceType:'browser_inbound',identitySource:'platform_dom',collectedAt:now(),analysis:{reason:'自动回复监控收到的评论',method:'指定作品监控'}};s.acquisition.signals.push(sig);lead.signalIds.push(sig.id);}
  writeWorkspace(r.email,s);if(!matched||limited||suppressed){const ev=s.acquisition.inboundEvents.find(e=>e.key===key);ev.status=suppressed?'suppressed':limited?'rate_limited':'received';writeWorkspace(r.email,s);continue;}s=leadAction(r.email,{leadId:lead.id,action:'draft',accountId:r.accountId,channel:rule.channel,recipient:rule.channel==='评论'?rule.scopeUrl:raw.authorId,text:rule.response});const m=s.acquisition.leads.find(l=>l.id===lead.id).messages.at(-1);if(sig)m.signalId=sig.id;m.source='rule_reply';writeWorkspace(r.email,s);
  try{jobs.push(queueDelivery(r.email,{connectionId:r.id,kind:rule.channel==='评论'?'reply':'dm',leadId:lead.id,messageId:m.id,signalId:sig?.id,ruleId:rule.id,ruleRevision:rule.revision,confirmed:true}));}catch(e){s=load(r.email);const ev=s.acquisition.inboundEvents.find(e=>e.key===key);ev.status='blocked';ev.error=e.message;writeWorkspace(r.email,s);}
  s=load(r.email);
 }
 const current=s.acquisition.replyRules.find(v=>v.id===rule.id);current.baselineEstablished=true;current.lastReadAt=now();current.lastError='';writeWorkspace(r.email,s);return {baseline,queued:jobs.length};
}

export function monitorError(r,input){const s=load(r.email),rule=s.acquisition.replyRules.find(v=>v.id===input.ruleId&&v.connectionId===r.id);if(!rule)fail('规则不存在');rule.lastAttemptAt=now();rule.lastError=String(input.error||'读取失败').slice(0,500);writeWorkspace(r.email,s);return {saved:true};}
