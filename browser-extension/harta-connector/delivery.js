// DOM-only execution. No private endpoints, cookies or challenge bypass.
// Unknown layouts fail closed. A click is never treated as proof of delivery.
(() => {
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),txt=e=>(e?.innerText||e?.textContent||'').trim(),visible=e=>!!e?.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const all=(s,root=document)=>[...root.querySelectorAll(s)].filter(visible);
 const one=(s,root=document)=>{const nodes=all(s,root);if(nodes.length!==1)throw new Error('未找到唯一的页面控件：'+s);return nodes[0];};
 const byText=(name,root=document)=>{const nodes=all('button,[role=button],label,span,div',root).filter(e=>txt(e)===name&&!all('button,[role=button],label,span,div',e).some(v=>txt(v)===name));if(nodes.length!==1)throw new Error('无法唯一核对「'+name+'」控件');return nodes[0];};
 const pageCheck=()=>{if(all('[class*=captcha],[id*=captcha],[class*=verify-dialog]').length)throw Object.assign(new Error('需要在平台完成验证码'),{status:'challenge'});if(/扫码登录|验证码登录/.test(txt(document.body))&&!all('[contenteditable=true],input[type=file]').length)throw Object.assign(new Error('需要先登录平台'),{status:'login_required'});};
 const input=(el,value)=>{el.focus();if(el.isContentEditable){document.execCommand('selectAll',false);document.execCommand('insertText',false,value);}else{const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}if((el.isContentEditable?txt(el):el.value).trim()!==value.trim())throw new Error('输入后内容回读不一致');};
 const profileId=url=>{try{return new URL(url,location.href).pathname.split('/').filter(Boolean).at(-1);}catch{return '';}};
 const isXhs=()=>location.hostname.endsWith('xiaohongshu.com');
 function actor(){pageCheck();const links=all('a[href*="/user/"]').filter(a=>/^(我|我的|个人主页)$/.test(txt(a)));const ids=[...new Set(links.map(a=>profileId(a.href)))];if(ids.length!==1)throw new Error('无法从平台当前登录入口核对账号，请打开登录后的主页');return {actorId:ids[0],profileUrl:links[0].href};}
 function commentNode(j){const selector=isXhs()?'.comment-item':'[data-e2e="comment-item"],[data-comment-id]';const rows=all(selector).filter(e=>(e.getAttribute('data-comment-id')||e.id.replace(/^comment[-_]/,'')||e.getAttribute('data-id'))===j.commentId);if(rows.length!==1)throw new Error('原评论未加载或 ID 不唯一，请展开该评论后重试');const row=rows[0],a=row.querySelector('a[href*="/user/"]'),body=row.querySelector(isXhs()?'.content .note-text,.content':'[data-e2e="comment-item-content"],[data-e2e="comment-content"]');if(profileId(a?.href)!==j.targetUserId||txt(body)!==j.originalText)throw new Error('原评论作者或正文已变化');return row;}
 const active=new Map(),stagedAssets=new Map();
 function assetChunk(meta,chunk,index,total){if(!Number.isInteger(index)||index<0||index>=total||total>40)throw new Error('素材分片无效');if(index===0)stagedAssets.set(meta.id,{meta,parts:[],total});const staged=stagedAssets.get(meta.id);if(!staged||staged.parts.length!==index||staged.total!==total)throw new Error('素材分片顺序不一致');staged.parts.push(Uint8Array.from(atob(chunk),c=>c.charCodeAt(0)));if(index===total-1){staged.file=new File(staged.parts,meta.name,{type:meta.mime});staged.parts=[];}return true;}
 async function prepare(j,actorId,assets){
  pageCheck();if(actorId!==j.expectedActorId)throw new Error('实际登录账号不匹配');
  let editor,send,scope,recheck=()=>{};
  if(j.kind==='reply'){
   const row=commentNode(j);one(isXhs()?'.reply':'[data-e2e="comment-reply"], [data-e2e="comment-item-reply"]',row).click();await sleep(500);pageCheck();
   editor=one(isXhs()?'#content-textarea[contenteditable=true]':'[data-e2e="comment-input"] [contenteditable=true], [data-e2e="comment-input"][contenteditable=true]');input(editor,j.text);
   send=byText('发送');scope=document;recheck=()=>commentNode(j);
  }else if(j.kind==='dm'){
   if(profileId(location.href)!==j.targetUserId)throw new Error('打开的不是指定接收人的主页');
   // The conversation is entered from the exact profile, never by a nickname search.
   byText('私信').click();await sleep(1000);pageCheck();
   const panels=all('[role=dialog],[data-e2e="im-chat-panel"],.chat-container,.chat-panel').filter(p=>p.querySelector('a[href*="/user/"]')&&all('a[href*="/user/"]',p).some(a=>profileId(a.href)===j.targetUserId));
   if(panels.length!==1)throw new Error('私信窗口没有可核对的接收人 ID，暂停发送');scope=panels[0];
   editor=one('[contenteditable=true],textarea',scope);input(editor,j.text);send=byText('发送',scope);recheck=()=>{if(!all('a[href*="/user/"]',scope).some(a=>profileId(a.href)===j.targetUserId))throw new Error('会话接收人发生变化');};
  }else if(j.kind==='publish'){
   if(!location.hostname.startsWith('creator.'))throw new Error('不是平台创作者发布页');
   const files=all('input[type=file]');let fileInput=files[0]||document.querySelector('input[type=file]');if(!fileInput)throw new Error('未找到素材上传入口，请打开图文或视频发布页');
   if(assets.length!==j.assetIds.length)throw new Error('素材数量不匹配');
   const transfer=new DataTransfer();for(const asset of assets){const staged=stagedAssets.get(asset.id);if(staged?.file)transfer.items.add(staged.file);else if(asset.base64){const bytes=Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));transfer.items.add(new File([bytes],asset.name,{type:asset.mime}));}else throw new Error('素材尚未完整传入浏览器');stagedAssets.delete(asset.id);}fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));
   for(let n=0;n<60;n++){pageCheck();if(all('input[placeholder*="标题"],textarea[placeholder*="标题"]').length)break;await sleep(1000);}
   const title=one('input[placeholder*="标题"],textarea[placeholder*="标题"]');input(title,j.title);
   editor=one(isXhs()?'.tiptap[contenteditable=true],.ql-editor[contenteditable=true]':'[data-placeholder*="作品描述"][contenteditable=true], [contenteditable=true][data-placeholder*="简介"],.zone-container[contenteditable=true]');input(editor,j.body);
   // Explicitly set privacy and then require a selected/checked state, not menu text.
   const privacy=j.visibility==='private'?'仅自己可见':'公开';const selectedPrivacy=()=>all('[aria-checked=true],input:checked,[aria-selected=true],.semi-select-selection-text,.el-select__selected-item').some(e=>txt(e)===privacy||e.value===privacy);
   if(!selectedPrivacy()){let option;try{option=byText(privacy);}catch{for(const label of ['谁可以看','设置可见范围','公开']){try{byText(label).click();await sleep(300);option=byText(privacy);break;}catch{}}}if(!option)throw new Error('未识别到可见范围选择器，不能提交');option.click();await sleep(300);}
   if(!selectedPrivacy())throw new Error('未能确认平台实际选中的可见范围');
   const progress=all('[role=progressbar]').some(e=>Number(e.getAttribute('aria-valuenow'))<100);if(progress||/上传失败|上传中|处理中/.test(txt(document.body)))throw new Error('素材仍在上传、处理或已失败，请稍后重试');
   send=byText('发布');scope=document;recheck=()=>{if(title.value!==j.title||!selectedPrivacy()||fileInput.files.length!==j.assetIds.length)throw new Error('发布标题、素材或可见范围发生变化');};
  }else throw new Error('未知操作');
  if(send.disabled||send.getAttribute('aria-disabled')==='true')throw new Error('平台尚未允许提交');
  const evidence={actorId,text:j.kind==='publish'?j.body:j.text,targetUserId:j.targetUserId,commentId:j.commentId,title:j.title,visibility:j.visibility,assetCount:assets?.length};
  const before=new Set(all('[data-message-id],[data-comment-id],[id^="comment-"]').map(e=>e.getAttribute('data-message-id')||e.getAttribute('data-comment-id')||e.id));
  active.set(j.id,{j,editor,send,scope,before,evidence,recheck,used:false});return evidence;
 }
 async function submit(j){
  const p=active.get(j.id);if(!p||p.used)throw new Error('没有有效的页面准备状态，不能重复提交');pageCheck();
  if(!p.send.isConnected||!p.editor.isConnected||txt(p.editor)!==(j.kind==='publish'?j.body:j.text))throw new Error('页面或输入内容在提交前变化');
  p.recheck();
  p.used=true;p.send.click(); // Exactly one externally visible submission per server permit.
  for(let n=0;n<20;n++){
   await sleep(1000);pageCheck();
   if(j.kind==='publish'){
    const links=all('a[href*="/video/"],a[href*="/explore/"]');const link=links.find(a=>/查看作品|查看笔记/.test(txt(a)));
    if(link&&/发布成功/.test(txt(document.body)))return {status:'succeeded',receipt:{platformId:profileId(link.href),url:link.href,actorId:p.evidence.actorId,evidence:'发布成功页面及查看作品链接'}};
    if(/发布成功|审核中|提交成功/.test(txt(document.body)))return {status:'submitted',receipt:{actorId:p.evidence.actorId,evidence:'平台显示提交成功或审核中，尚无可核对作品 ID'}};
   }else{
    const nodes=all('[data-message-id],[data-comment-id],[id^="comment-"]',p.scope);
    const found=nodes.find(e=>{const id=e.getAttribute('data-message-id')||e.getAttribute('data-comment-id')||e.id;if(p.before.has(id))return false;const body=e.querySelector('.note-text,[data-e2e="comment-item-content"],[data-e2e="message-text"],.message-text');const a=e.querySelector('a[href*="/user/"]');return txt(body)===j.text&&(profileId(a?.href)===p.evidence.actorId||e.getAttribute('data-sender-id')===p.evidence.actorId);});
    if(found)return {status:'succeeded',receipt:{platformId:(found.getAttribute('data-message-id')||found.getAttribute('data-comment-id')||found.id).replace(/^comment-/,''),actorId:p.evidence.actorId,targetUserId:j.targetUserId,text:j.text,evidence:'提交后读取到当前账号新增的同文平台消息 ID',url:location.href}};
   }
  }
  return {status:'unknown',error:'已点击提交，但未读取到可信平台回执；请在平台核对，不能自动重发'};
 }
 async function inbox(rule){pageCheck();const rows=[];if(rule.channel==='评论'){
   const owner=document.querySelector(isXhs()?'#noteContainer .author a[href*="/user/"],#noteContainer .author-wrapper a[href*="/user/"]':'[data-e2e="video-author"] a[href*="/user/"]');
   if(profileId(owner?.href)!==rule.expectedActorId)throw new Error('自动回复只监控自己发布的作品，未能核对作品作者');
   for(const el of all(isXhs()?'.comment-item':'[data-e2e="comment-item"],[data-comment-id]')){const a=el.querySelector('a[href*="/user/"]'),body=el.querySelector(isXhs()?'.note-text':'[data-e2e="comment-item-content"],[data-e2e="comment-content"]'),id=el.getAttribute('data-comment-id')||el.id.replace(/^comment-/,''),authorId=profileId(a?.href);if(id&&a&&body&&authorId!==rule.expectedActorId)rows.push({direction:'inbound',platformId:id,authorId,authorName:txt(a),authorUrl:a.href,text:txt(body)});}
  }else{
   const recipient=profileId(rule.scopeUrl);if(profileId(location.href)!==recipient)throw new Error('私信监控来源主页不匹配');if(!all('[role=dialog],[data-e2e="im-chat-panel"],.chat-container,.chat-panel').length){byText('私信').click();await sleep(1000);pageCheck();}const panels=all('[role=dialog],[data-e2e="im-chat-panel"],.chat-container,.chat-panel').filter(p=>all('a[href*="/user/"]',p).some(a=>profileId(a.href)===recipient));
   if(panels.length!==1)throw new Error('请从指定主页打开私信窗口，无法核对当前会话');
   for(const el of all('[data-message-id]',panels[0])){const sender=el.getAttribute('data-sender-id');if(sender!==recipient)continue;const body=el.querySelector('[data-e2e="message-text"],.message-text');if(body)rows.push({direction:'inbound',platformId:el.getAttribute('data-message-id'),authorId:recipient,authorName:recipient,authorUrl:rule.scopeUrl,text:txt(body)});}
  }return rows.slice(-100);
 }
 globalThis.hartaDelivery={actor,prepare,submit,inbox,assetChunk};
})();
