import crypto from 'node:crypto';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {createWechatClient,WechatError,wechatPlainText,wechatArticleUrl,wechatTime} from './wechat-client.mjs';
import {wechatScope,readWechatConnection,writeWechatConnection} from './wechat-store.mjs';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const now=()=>new Date().toISOString();
export function createWechatWorkspace(client=createWechatClient()){
 const pending=new Map();
 function owned(email,customerId){const space=readWorkspace(email);if(!space.customers.some(c=>c.id===customerId))throw new Error('找不到当前业务');return space;}
 function state(email){return readWorkspace(email).customers.map(c=>{const scope=wechatScope(email,c.id),r=readWechatConnection(scope);return {customerId:c.id,bound:!!r?.appSecret,busy:pending.has(scope),name:r?.name||'',appIdMasked:r?.appId?`${r.appId.slice(0,4)}…${r.appId.slice(-4)}`:'',lastSync:r?.lastSync||null,continuation:r?.continuation||null};});}
 async function action(email,input){
  const {customerId,action}=input;owned(email,customerId);const scope=wechatScope(email,customerId);
  if(action==='unbind'){
   pending.get(scope)?.abort();pending.delete(scope);writeWechatConnection(scope,{revision:crypto.randomUUID(),disconnectedAt:now()});
   const space=owned(email,customerId);for(const account of space.acquisition?.accounts||[])if(account.customerId===customerId&&account.mode==='wechat_api')account.status='disconnected';writeWorkspace(email,space);return state(email);
  }
  if(!['bind','sync'].includes(action))throw new Error('请选择连接、断开或同步公众号');
  if(pending.has(scope))throw new Error('公众号正在处理，请等待完成或断开后重试');
  const previous=readWechatConnection(scope),revision=previous?.revision,controller=new AbortController();pending.set(scope,controller);
  const guard=()=>{if(controller.signal.aborted||readWechatConnection(scope)?.revision!==revision)throw new Error('公众号连接已变化，本次操作已取消');owned(email,customerId);};
  try{
   if(action==='bind'){
    const appId=String(input.appId||'').trim(),appSecret=String(input.appSecret||'').trim(),name=String(input.name||'').trim();
    if(!/^wx[a-zA-Z0-9]{10,32}$/.test(appId)||appSecret.length<16||appSecret.length>200||!name||name.length>100)throw new Error('请填写账号名称、有效 AppID 和 AppSecret');
    const token=await client.token(appId,appSecret,controller.signal);guard();
    const accountId='wx-'+hash([scope,appId]).slice(0,24),space=owned(email,customerId);space.acquisition||={};space.acquisition.accounts||=[];
    for(const account of space.acquisition.accounts)if(account.customerId===customerId&&account.mode==='wechat_api')account.status='disconnected';
    const account=space.acquisition.accounts.find(a=>a.id===accountId);
    const values={id:accountId,customerId,platform:'公众号',name,mode:'wechat_api',status:'connected',capabilities:['read_articles'],lastSuccessAt:now()};
    if(account)Object.assign(account,values);else space.acquisition.accounts.push({...values,createdAt:now()});
    writeWechatConnection(scope,{appId,appSecret,name,accountId,...token,revision:crypto.randomUUID(),connectedAt:now()});writeWorkspace(email,space);
   }else{
    if(!previous?.appSecret)throw new Error('请先连接当前业务的公众号');
    const mode=input.mode||'auto';if(!['auto','published','material'].includes(mode))throw new Error('请选择已发表文章或素材库');
    if(input.resume&&!previous.continuation)throw new Error('没有待继续的同步，请重新同步');
    let source=input.resume?previous.continuation.source:mode==='material'?'material':'published',offset=input.resume?previous.continuation.offset:0;
    let token={token:previous.token,expiresAt:previous.expiresAt},refreshed=false,fallback='',total=0,groups=0,skipped=0;const imported=[];
    const refresh=async()=>{token=await client.token(previous.appId,previous.appSecret,controller.signal);refreshed=true;guard();};
    if(!token.token||token.expiresAt<=Date.now())await refresh();
    async function page(){try{return await client.page(token.token,source,offset,controller.signal);}catch(e){if(e instanceof WechatError&&[40001,42001].includes(e.code)&&!refreshed){await refresh();return client.page(token.token,source,offset,controller.signal);}throw e;}}
    for(let n=0;n<5;n++){
     let result;try{result=await page();}catch(e){if(mode==='auto'&&!input.resume&&offset===0&&source==='published'&&e instanceof WechatError&&e.code===48001){source='material';fallback='未获得已发表接口权限，已改为同步素材库';result=await page();}else throw e;}
     guard();
     if(mode==='auto'&&!input.resume&&offset===0&&source==='published'&&result.items.length===0){source='material';fallback='已发表列表为空，已改为同步素材库';result=await page();guard();}
     total=result.total;
     for(const group of result.items){
      const groupId=source==='published'?group.article_id:group.media_id,articles=group.content?.news_item;
      if(typeof groupId!=='string'||!groupId||groupId.length>500||!Array.isArray(articles)||articles.length>20){skipped++;continue;}
      articles.forEach((article,index)=>{
       if(!article||typeof article.title!=='string'||typeof article.content!=='string'){skipped++;return;}
       const title=wechatPlainText(article.title).slice(0,500),body=wechatPlainText(article.content);if(!title){skipped++;return;}
       imported.push({id:'wx-work-'+hash([scope,previous.appId,source,groupId,index]).slice(0,32),customerId,accountId:previous.accountId,accountName:previous.name,authorName:typeof article.author==='string'?article.author.slice(0,200):previous.name,platform:'公众号',type:'article',owned:true,source:'wechat_api',title,description:body.slice(0,30000),contentTruncated:body.length>30000,url:source==='published'?wechatArticleUrl(article.url):'',publishedAt:source==='published'?wechatTime(group.publish_time):'',sourceUpdatedAt:wechatTime(group.update_time),wechat:{source,groupId,index},syncedAt:now()});
      });
     }
     groups+=result.items.length;offset+=result.items.length;
     if(!result.items.length&&offset<total)throw new Error('公众号分页结果不完整，请重新同步');
     if(offset>=total)break;
    }
    guard();const space=owned(email,customerId);space.acquisition||={};space.acquisition.works||=[];let added=0,updated=0;
    for(const work of imported){const existing=space.acquisition.works.find(w=>w.id===work.id&&w.customerId===customerId);if(existing){Object.assign(existing,work);updated++;}else{space.acquisition.works.push({...work,importedAt:now()});added++;}}
    const lastSync={at:now(),source,fallback,groups,added,updated,skipped,total,nextOffset:offset<total?offset:null};
    writeWechatConnection(scope,{...previous,...token,lastSync,continuation:offset<total?{source,offset}:null});writeWorkspace(email,space);
   }
  }finally{if(pending.get(scope)===controller)pending.delete(scope);}
  return state(email);
 }
 return {state,action};
}
export const wechatWorkspace=createWechatWorkspace();
