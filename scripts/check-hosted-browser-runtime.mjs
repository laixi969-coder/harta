// Isolated DOM fixtures only. No real accounts, network access, posts or messages.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createRuntime,browserExecutable} from '../lib/hosted-browser-runtime.mjs';
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true});let context,rt;
try{
 rt=await createRuntime({platform:'抖音'},{getBrowser:async()=>({newContext:async opts=>context=await browser.newContext(opts)})});
 const self='<a href="https://www.douyin.com/user/self">我</a>';
 await context.route('https://www.douyin.com/**',async route=>{const path=new URL(route.request().url()).pathname;let body=self;
 if(path==='/')body+='<h1>隔离测试页面，不是真实抖音</h1>';
 else if(path==='/user/target')body+='<div data-e2e="user-post-list"><a href="https://www.douyin.com/video/123">测试作品</a></div>';
 else if(path==='/video/123')body+=`<div data-e2e="comment-item" data-comment-id="comment01"><a data-e2e="comment-user-name" href="https://www.douyin.com/user/buyer">测试买家</a><div data-e2e="comment-item-content">测试评论</div><button data-e2e="comment-reply">回复</button></div><div data-e2e="comment-input" contenteditable="true"></div><button id="send">发送</button><script>window.clicks=0;document.querySelector('#send').onclick=()=>{window.clicks++;const el=document.createElement('div');el.dataset.commentId='reply01';el.dataset.senderId='self';el.innerHTML='<span data-e2e="comment-item-content">Harta 测试回复</span>';document.body.append(el);};</script>`;
 else if(path==='/user/buyer')body+=`<button>私信</button><div data-e2e="im-chat-panel"><a href="https://www.douyin.com/user/buyer">测试买家</a><div contenteditable="true"></div><button id="send">发送</button></div><script>window.clicks=0;document.querySelector('#send').onclick=()=>{window.clicks++;const el=document.createElement('div');el.dataset.messageId='message01';el.dataset.senderId='self';el.innerHTML='<span data-e2e="message-text">Harta 测试私信</span>';document.querySelector('[data-e2e=im-chat-panel]').append(el);};</script>`;
 await route.fulfill({contentType:'text/html; charset=utf-8',body});});
 await context.route('https://creator.douyin.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<input type="file"><input placeholder="标题"><div class="zone-container" contenteditable="true"></div><label><input type="radio" checked value="仅自己可见">仅自己可见</label><button id="pub">发布</button><script>document.querySelector('#pub').onclick=()=>{const el=document.createElement('div');el.innerHTML='发布成功 <a href="https://www.douyin.com/video/999">查看作品</a>';document.body.append(el);};</script>`}));
 await rt.open();assert.equal((await rt.actor()).actorId,'self');assert.ok((await rt.frame()).image.length>100);await rt.click(500,500);await rt.drag(500,500,510,510);
 const works=await rt.collect({targetUrl:'https://www.douyin.com/user/target',kind:'works',limit:1});assert.equal(works.rows.length,1);
 const comments=await rt.collect({targetUrl:'https://www.douyin.com/video/123',kind:'comments',limit:1});assert.equal(comments.rows[0].recordId,'comment01');
 const reply={id:'reply',kind:'reply',targetUrl:'https://www.douyin.com/video/123',expectedActorId:'self',targetUserId:'buyer',commentId:'comment01',originalText:'测试评论',text:'Harta 测试回复'};
 await rt.prepare(reply,{actorId:'self'},[]);assert.equal((await rt.submit(reply)).status,'succeeded');await assert.rejects(()=>rt.submit(reply));
 const dm={id:'dm',kind:'dm',targetUrl:'https://www.douyin.com/user/buyer',expectedActorId:'self',targetUserId:'buyer',text:'Harta 测试私信'};
 await rt.prepare(dm,{actorId:'self'},[]);assert.equal((await rt.submit(dm)).receipt.platformId,'message01');
 const publish={id:'publish',kind:'publish',targetUrl:'https://creator.douyin.com/creator-micro/content/upload',expectedActorId:'self',assetIds:['asset'],title:'测试标题',body:'测试内容',visibility:'private'};
 const e=await rt.prepare(publish,{actorId:'self'},[{id:'asset',name:'fixture.mp4',mime:'video/mp4',buffer:Buffer.from('0000ftypisom0000fixture')}]);assert.equal(e.visibility,'private');assert.equal((await rt.submit(publish)).receipt.platformId,'999');
 assert.ok((await rt.state()).origins);console.log('Hosted runtime passed: isolated session, frame, click/drag, works, comments, reply, DM, private publish, one-shot submit. Fixtures only.');
}finally{await rt?.close();await browser.close();}
