import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { importSignals, leadAction } from './acquisition-workspace.mjs';
const now=()=>new Date().toISOString();
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const root=()=>path.join(process.cwd(),'data','browser-connections');
const id=()=>crypto.randomUUID();
const secret=()=>crypto.randomBytes(32).toString('base64url');
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const clean=(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
function file(key){if(!/^[a-f0-9-]{36}$/.test(key))throw fail('连接凭证无效',401);return path.join(root(),`${key}.json`);}
function read(key){try{return JSON.parse(fs.readFileSync(file(key),'utf8'));}catch{throw fail('连接已失效，请重新配对',401);}}
function save(row){fs.mkdirSync(root(),{recursive:true,mode:0o700});const target=file(row.id),tmp=target+'.tmp';fs.writeFileSync(tmp,JSON.stringify(row),{mode:0o600});fs.renameSync(tmp,target);}
function load(email){const s=readWorkspace(email);s.acquisition||={};for(const key of ['accounts','targets','works','signals','leads','collectionJobs','logs','deliveryJobs','replyRules'])s.acquisition[key]||=[];return s;}
export function platformUrl(value,platform,kind='any'){
 let u;try{u=new URL(value);}catch{throw fail('平台链接无效');}
 const host=platform==='抖音'?'douyin.com':platform==='小红书'?'xiaohongshu.com':'';
 if(!host||u.protocol!=='https:'||!(u.hostname===host||u.hostname===`www.${host}`)||u.port||u.username||u.password)throw fail('请使用该平台完整的 HTTPS 网页链接');
 if(platform==='小红书'){const match=u.pathname.match(/^\/user\/profile\/[^/]+\/([a-zA-Z0-9]+)\/?$/);if(match)u.pathname='/explore/'+match[1];}
 if(kind==='work'&&!(/^\/video\/\d+/.test(u.pathname)&&platform==='抖音')&&!(/^\/(explore|discovery\/item)\/[a-zA-Z0-9]+/.test(u.pathname)&&platform==='小红书'))throw fail('请打开具体视频或笔记后复制完整链接');
 if(kind==='profile'&&!(/^\/user\/[^/]+/.test(u.pathname)&&platform==='抖音')&&!(/^\/user\/profile\/[^/]+/.test(u.pathname)&&platform==='小红书'))throw fail('请填写评论者或目标账号的完整主页链接');
 u.hostname=`www.${host}`;return u.href;
}
export function issuePairing(email,input){
 const s=load(email),a=s.acquisition.accounts.find(a=>a.id===input.accountId);
 if(!a||!['抖音','小红书'].includes(a.platform))throw fail('请选择你名下的抖音或小红书账号');
 const key=id(),code=secret();save({id:key,email,accountId:a.id,customerId:a.customerId,platform:a.platform,name:a.name,pairHash:hash(code),pairExpires:Date.now()+10*60_000,createdAt:now(),status:'pending'});
 return {code:`${key}.${code}`,expiresAt:new Date(Date.now()+10*60_000).toISOString()};
}
export function redeemPairing(input){
 const [key,code,...extra]=clean(input.code,200).split('.'),r=read(key);
 if(extra.length||r.status!=='pending'||Date.now()>r.pairExpires||hash(code||'')!==r.pairHash)throw fail('配对码无效、已使用或已过期',401);
 const token=secret();r.tokenHash=hash(token);delete r.pairHash;r.status='paired';r.deviceName=clean(input.deviceName,100)||'浏览器连接器';r.expiresAt=Date.now()+30*86400_000;r.lastSeenAt=now();save(r);
 return {token:`${key}.${token}`,connection:{id:r.id,accountId:r.accountId,customerId:r.customerId,platform:r.platform,name:r.name,expiresAt:new Date(r.expiresAt).toISOString()}};
}
export function authenticateConnector(token){
 const [key,value,...extra]=clean(token,200).replace(/^Bearer /,'').split('.'),r=read(key);
 if(extra.length||r.status!=='paired'||r.expiresAt<Date.now()||hash(value||'')!==r.tokenHash)throw fail('连接已过期或已断开，请重新配对',401);
 const s=load(r.email);if(!s.acquisition.accounts.some(a=>a.id===r.accountId&&a.customerId===r.customerId&&a.platform===r.platform))throw fail('账号已移除',401);
 return r;
}
export function connections(email){
 if(!fs.existsSync(root()))return [];
 return fs.readdirSync(root()).filter(f=>f.endsWith('.json')).map(f=>{try{return JSON.parse(fs.readFileSync(path.join(root(),f),'utf8'));}catch{return null;}}).filter(r=>r?.email===email&&r.status!=='pending').map(r=>({id:r.id,accountId:r.accountId,customerId:r.customerId,platform:r.platform,name:r.name,deviceName:r.deviceName,transport:r.transport||'extension',status:r.status==='revoked'?'revoked':r.expiresAt<Date.now()?'expired':'paired',lastSeenAt:r.lastSeenAt,expiresAt:new Date(r.expiresAt).toISOString(),lastResultAt:r.lastResultAt||null}));
}
export function revokeConnection(email,input){const r=read(input.connectionId);if(r.email!==email)throw fail('找不到你的连接',404);r.status='revoked';delete r.tokenHash;save(r);const s=load(email);for(const j of s.acquisition.collectionJobs)if(j.connectionId===r.id&&['queued','running'].includes(j.status)){j.status='cancelled';j.finishedAt=now();}for(const j of s.acquisition.deliveryJobs)if(j.connectionId===r.id&&['queued','preparing'].includes(j.status)){j.status='cancelled';j.finishedAt=now();}for(const rule of s.acquisition.replyRules)if(rule.connectionId===r.id)rule.enabled=false;writeWorkspace(email,s);return connections(email);}
export function queueCollection(email,input){
 const s=load(email),a=s.acquisition,r=read(input.connectionId);
 if(r.email!==email||r.customerId!==input.customerId||r.status!=='paired'||r.expiresAt<Date.now())throw fail('请先为当前业务配对有效的浏览器连接器');
 let target,work,targetUrl;
 if(input.kind==='works'){target=a.targets.find(t=>t.id===input.targetId&&t.customerId===r.customerId&&t.platform===r.platform);if(!target)throw fail('找不到当前业务的目标账号');targetUrl=platformUrl(target.url,r.platform,'profile');}
 else if(input.kind==='comments'){work=a.works.find(w=>w.id===input.workId&&w.customerId===r.customerId&&w.platform===r.platform);if(!work)throw fail('找不到当前业务的作品');targetUrl=platformUrl(work.url,r.platform,'work');}
 else throw fail('读取任务类型无效');
 if(a.collectionJobs.some(j=>j.connectionId===r.id&&['queued','running'].includes(j.status)))throw fail('这个浏览器还有待处理任务，请先完成或取消');
 const since=clean(input.since,40);if(since&&(!Number.isFinite(Date.parse(since))||Date.parse(since)>Date.now()))throw fail('起始时间无效');
 const limit=Number(input.limit||50);if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('每次读取 1–100 条');
 const job={id:id(),customerId:r.customerId,connectionId:r.id,accountId:r.accountId,platform:r.platform,kind:input.kind,targetId:target?.id||work?.targetId,workId:work?.id||'',targetUrl,limit,filters:{keyword:clean(input.keyword,100),region:clean(input.region,40),since},status:'queued',createdAt:now(),read:0,added:0,duplicate:0};a.collectionJobs.push(job);writeWorkspace(email,s);return job;
}
export function cancelCollection(email,input){const s=load(email),j=s.acquisition.collectionJobs.find(j=>j.id===input.jobId);if(!j)throw fail('找不到任务');if(['queued','running'].includes(j.status)){j.status='cancelled';j.finishedAt=now();writeWorkspace(email,s);}return s;}
function expireJobs(s){let changed=false;for(const j of s.acquisition.collectionJobs)if(j.status==='running'&&Date.parse(j.startedAt)<Date.now()-5*60_000){j.status='interrupted';j.error='浏览器未回传结果，请查看平台后重新读取';j.finishedAt=now();changed=true;}return changed;}
export function connectorJobs(email){const s=load(email);if(expireJobs(s))writeWorkspace(email,s);return s.acquisition.collectionJobs.slice(-100).reverse();}
export function claimCollection(r){const s=load(r.email);expireJobs(s);r.lastSeenAt=now();save(r);const j=s.acquisition.collectionJobs.find(j=>j.connectionId===r.id&&j.status==='queued');if(j){j.status='running';j.startedAt=now();j.lease=id();}writeWorkspace(r.email,s);return j||null;}
export function completeCollection(r,input){
 const s=load(r.email),a=s.acquisition,j=a.collectionJobs.find(j=>j.id===input.jobId&&j.connectionId===r.id);
 if(!j||j.status!=='running'||j.lease!==input.lease)throw fail('任务已取消、完成或不属于当前连接',409);
 const statuses=['completed','partial','login_required','challenge','unsupported','failed'];if(!statuses.includes(input.status))throw fail('任务结果状态无效');
 const raw=input.rows;if(!Array.isArray(raw)||raw.length>j.limit)throw fail('读取结果超出任务范围');
 const pageUrl=platformUrl(input.pageUrl,r.platform,j.kind==='comments'?'work':'profile');
 // Query tokens may rotate, but a result cannot be attached to another source page.
 if(new URL(pageUrl).pathname!==new URL(j.targetUrl).pathname)throw fail('读取页面与任务来源不一致');
 if(!['completed','partial'].includes(input.status)&&raw.length)throw fail('未完成读取的任务不能提交评论');
 const known=a.works.filter(w=>w.customerId===r.customerId&&w.platform===r.platform);
 const prepared=raw.map(row=>{
   if(j.kind==='works')return {url:platformUrl(row.url,r.platform,'work'),title:clean(row.title,300)||'作品（标题未显示）'};
   const text=clean(row.text,6000);if(!text)throw fail('读取到空评论');
   const authorUrl=row.authorUrl?platformUrl(row.authorUrl,r.platform,'profile'):'';
   const authorId=authorUrl?new URL(authorUrl).pathname.split('/').filter(Boolean).at(-1):'';
   const nativeId=clean(row.recordId,200);if(nativeId&&!/^[a-zA-Z0-9_-]+$/.test(nativeId))throw fail('评论标识无效');
   const publishedAt=clean(row.publishedAt,40);if(publishedAt&&(!Number.isFinite(Date.parse(publishedAt))||Date.parse(publishedAt)>Date.now()+60_000))throw fail('评论时间无效');
   return {platform:r.platform,workId:j.workId,text,url:j.targetUrl,authorUrl,authorId,authorName:clean(row.authorName,100),recordId:nativeId||`dom-${hash([j.workId,authorUrl,row.authorName,text,row.publishedText,row.parentRecordId].join('|'))}`,identitySource:nativeId?'platform_dom':'dom_fingerprint',parentRecordId:clean(row.parentRecordId,200),publishedAt,publishedText:clean(row.publishedText,100),ipRegion:clean(row.ipRegion,100),isAuthorReply:row.isAuthorReply===true};
 });
 const filtered=prepared.filter(row=>j.kind==='works'||((!j.filters.keyword||row.text.includes(j.filters.keyword))&&(!j.filters.region||row.ipRegion.includes(j.filters.region))&&(!j.filters.since||(row.publishedAt&&Date.parse(row.publishedAt)>=Date.parse(j.filters.since)))));
 let added=0,duplicate=0,latest=s;
 if(j.kind==='works'){
   for(const row of filtered){const pathName=new URL(row.url).pathname;if(known.some(w=>{try{return new URL(w.url).pathname===pathName;}catch{return false;}})){duplicate++;continue;}const work={id:id(),customerId:r.customerId,targetId:j.targetId,platform:r.platform,...row,recordId:pathName.split('/').filter(Boolean).at(-1),description:'',source:'browser_visible',createdAt:now()};a.works.push(work);known.push(work);added++;}
 }else if(filtered.length){
   latest=importSignals(r.email,{customerId:r.customerId,workId:j.workId,source:`浏览器实际读取 · ${r.deviceName} · ${pageUrl}`,rows:filtered});
   const task=latest.acquisition.tasks.at(-1);task.sourceType='browser_visible';task.connectionId=r.id;task.collectionJobId=j.id;added=task.coverage.added;duplicate=task.coverage.duplicate;
   for(const signal of latest.acquisition.signals)if(signal.taskId===task.id)signal.sourceType='browser_visible';
 }
 const saved=latest.acquisition.collectionJobs.find(v=>v.id===j.id);Object.assign(saved,{status:input.status,finishedAt:now(),read:raw.length,filtered:raw.length-filtered.length,added,duplicate,pageUrl,error:clean(input.error,500),scope:'仅当前网页实际加载且被识别的内容，不代表全部评论或作品'});delete saved.lease;
 writeWorkspace(r.email,latest);r.lastSeenAt=now();if(['completed','partial'].includes(input.status))r.lastResultAt=now();save(r);return saved;
}
export function contactHandoff(email,input){
 const s=load(email),lead=s.acquisition.leads.find(l=>l.id===input.leadId);if(!lead||lead.doNotContact)throw fail('找不到客户或对方已禁止联系');
 let message;if(input.messageId){leadAction(email,{leadId:lead.id,messageId:input.messageId,action:'check-copy'});message=lead.messages.find(m=>m.id===input.messageId);}
 const signalId=message?.signalId||input.signalId;
 const signal=s.acquisition.signals.find(v=>v.leadId===lead.id&&(!signalId||v.id===signalId)&&(!message||message.channel!=='评论'||message.signalId||v.url===message.recipient));
 const channel=message?.channel||input.channel||'评论';const destination=channel==='私信'?signal?.authorUrl:signal?.url;
 if(!destination)throw fail(channel==='私信'?'还没有可核对的评论者主页，请先读取或补充来源':'还没有原评论链接，请先核实来源');
 return {url:platformUrl(destination,lead.platform,channel==='私信'?'profile':'any'),text:message?.text||'',authorName:lead.authorName,platform:lead.platform,channel,note:channel==='私信'?'在对方主页确认是否可私信；不可私信时返回原评论沟通。':'打开原作品后，核对评论者和原文，再点击该评论的回复。',originalText:signal?.text||'',sent:false};
}

// Internal server-owned channel: no pairing code or extension bearer token is issued.
export function createHostedConnection(email,input){
 const s=load(email);if(!s.customers.some(c=>c.id===input.customerId))throw fail('业务不存在');
 const profileUrl=platformUrl(input.profileUrl,input.platform,'profile'),actorId=new URL(profileUrl).pathname.split('/').filter(Boolean).at(-1);
 if(actorId!==input.actorId)throw fail('登录身份与主页不一致');
 let a=s.acquisition.accounts.find(a=>a.customerId===input.customerId&&a.platform===input.platform&&a.platformUserId===actorId&&a.mode==='hosted_browser');
 if(!a){a={id:id(),customerId:input.customerId,platform:input.platform,mode:'hosted_browser',createdAt:now()};s.acquisition.accounts.push(a);}
 Object.assign(a,{name:clean(input.name,100)||input.platform+'账号 · '+actorId.slice(-6),platformUserId:actorId,profileUrl,deliveryIdentityConfirmedAt:now(),status:'connected',capabilities:[]});writeWorkspace(email,s);
 const r={id:id(),email,accountId:a.id,customerId:a.customerId,platform:a.platform,name:a.name,transport:'hosted',deviceName:'Harta 后台浏览器',status:'paired',createdAt:now(),lastSeenAt:now(),expiresAt:Date.now()+30*86400_000};save(r);return r;
}
export function hostedConnection(email,id){const r=read(id);if(r.email!==email||r.transport!=='hosted'||r.status!=='paired'||r.expiresAt<Date.now())throw fail('后台浏览器连接已失效',401);return r;}
