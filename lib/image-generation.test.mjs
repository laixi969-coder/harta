import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { MockAgent } from 'undici';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateCover, publicImageConfig, saveImageConfig } from './image-generation.mjs';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { estimateSpend } from './model-spend.mjs';
import { modelFetch } from './model-spend.mjs';

const root=process.cwd(), email='cover@example.test';let dir,png;
const input={customerId:'c1',packId:'p1',platform:'小红书',index:0,line:'厨房如何选'};
const deps=send=>({config:{baseUrl:'https://images.example/v1',model:'image-model',apiKey:'secret'},validateUrl:async v=>new URL(v),agent:{},reserve:()=>{},budget:(_e,_c,_p,fn)=>fn(),send});
beforeAll(async()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-cover-'));process.chdir(dir);png=await sharp({create:{width:4,height:4,channels:3,background:'#999'}}).png().toBuffer();});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{customers:[{id:'c1',name:'业务',drops:[{id:'p1',shells:{小红书:[{title:'厨房如何选',body:'比较尺寸'}]},copies:{}}]}],ledger:[],feedback:{},contentStates:{}}));
describe('AI cover generation',()=>{
 it('encrypts the key, preserves it on blank update and refuses private endpoints',async()=>{
  await saveImageConfig({baseUrl:'',model:'image-model',apiKey:'private-key'});
  expect(fs.readFileSync(path.join(dir,'data/image-model.json'),'utf8')).not.toContain('private-key');
  await saveImageConfig({baseUrl:'',model:'image-model',apiKey:''});expect(publicImageConfig().hasKey).toBe(true);
  await saveImageConfig({baseUrl:'',model:'image-model',requestMode:'minimal'});expect(publicImageConfig().requestMode).toBe('minimal');
  await saveImageConfig({baseUrl:'',model:'image-model'});expect(publicImageConfig().requestMode).toBe('minimal');
  await expect(saveImageConfig({baseUrl:'',model:'image-model',requestMode:'unexpected'})).rejects.toThrow('参数模式');expect(publicImageConfig().requestMode).toBe('minimal');
  await expect(saveImageConfig({baseUrl:'http://127.0.0.1:8080',model:'image-model'})).rejects.toThrow();
  await saveImageConfig({baseUrl:'',model:'',clearKey:true});expect(publicImageConfig().hasKey).toBe(false);
 });
 it('validates ownership, produces a real PNG and reserves image pricing',async()=>{
  let sent;const send=async (_url,options)=>{sent=options;return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}),{status:200});};
  await expect(generateCover('other@example.test',input,deps(send))).rejects.toThrow('找不到');
  const out=await generateCover(email,{...input,layout:'暖色厨房，标题区域留白'},deps(send));const bytes=Buffer.from(out.image.split(',')[1],'base64');
  expect((await sharp(bytes).metadata()).width).toBe(900);expect((await sharp(bytes).metadata()).height).toBe(1200);
  expect(sent.spendBody).toEqual({__hartaImageGeneration:true});expect(estimateSpend(sent.spendBody)).toBeGreaterThan(0);
  expect(JSON.parse(sent.body).response_format).toBe('b64_json');expect(JSON.parse(sent.body).size).toBe('1024x1024');
  expect(sent.body).not.toContain('比较尺寸');expect(JSON.parse(sent.body).prompt).toContain('暖色厨房，标题区域留白');
  await expect(generateCover(email,{...input,layout:'长'.repeat(2001)},deps(send))).rejects.toThrow('2000字');
 });
 it('GPT 图片模型不发送不支持的 response_format，只调用一次',async()=>{
  let calls=0,request;const config={baseUrl:'https://images.example/v1',model:'gpt-image-2',apiKey:'secret'};
  const send=async(_url,options)=>{calls++;request=JSON.parse(options.body);return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));};
  await generateCover(email,input,{...deps(send),config});expect(calls).toBe(1);expect(request.model).toBe('gpt-image-2');expect(request.size).toBe('1024x1360');expect(request).not.toHaveProperty('response_format');
 });
 it('竖版背景交付到 3:4 封面时保留画面顶部和底部',async()=>{
  const portrait=await sharp(Buffer.from('<svg width="1024" height="1360" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1360" fill="white"/><rect width="1024" height="180" fill="red"/><rect y="1180" width="1024" height="180" fill="blue"/></svg>')).png().toBuffer();
  const send=async()=>new Response(JSON.stringify({data:[{b64_json:portrait.toString('base64')}]}));
  const out=await generateCover(email,input,{...deps(send),config:{baseUrl:'https://images.example/v1',model:'gpt-image-2',apiKey:'secret'}});
  const result=Buffer.from(out.image.split(',')[1],'base64'),top=await sharp(result).extract({left:450,top:10,width:1,height:1}).removeAlpha().raw().toBuffer(),bottom=await sharp(result).extract({left:450,top:1189,width:1,height:1}).removeAlpha().raw().toBuffer();
  expect(top[0]).toBeGreaterThan(200);expect(top[2]).toBeLessThan(30);expect(bottom[2]).toBeGreaterThan(200);expect(bottom[0]).toBeLessThan(30);
 });
 it('较早 GPT 出图模型使用支持的竖版尺寸',async()=>{
  let request;const send=async(_url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));};
  await generateCover(email,input,{...deps(send),config:{baseUrl:'https://images.example/v1',model:'gpt-image-1',apiKey:'secret'}});
  expect(request.size).toBe('1024x1536');expect(request).not.toHaveProperty('response_format');
 });
 it('按模型自动选择或手动切换请求参数，失败时也只发送一次',async()=>{
  let request,calls=0;const send=async(_url,options)=>{calls++;request=JSON.parse(options.body);return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));};
  for(const model of ['flux-pro','grok-image','stable-diffusion','wanx-v1']){
   await generateCover(email,input,{...deps(send),config:{baseUrl:'https://images.example/v1',model,apiKey:'secret'}});
   expect(request.model).toBe(model);expect(request).not.toHaveProperty('size');expect(request).not.toHaveProperty('response_format');
  }
  await generateCover(email,input,{...deps(send),config:{baseUrl:'https://images.example/v1',model:'custom',apiKey:'secret',requestMode:'minimal'}});expect(request).not.toHaveProperty('size');
  await generateCover(email,input,{...deps(send),config:{baseUrl:'https://images.example/v1',model:'flux-pro',apiKey:'secret',requestMode:'legacy'}});expect(request).toMatchObject({size:'1024x1024',response_format:'b64_json'});
  expect(calls).toBe(6);let errors=0;
  await expect(generateCover(email,input,{...deps(async()=>{errors++;return new Response('',{status:400});}),config:{baseUrl:'https://images.example/v1',model:'flux-pro',apiKey:'secret'}})).rejects.toThrow('HTTP 400');expect(errors).toBe(1);
 });
 it('支持公网 HTTPS 图片结果，不转发密钥、不跟随跳转并限制大小',async()=>{
  let captured;const send=async()=>new Response(JSON.stringify({data:[{url:'https://cdn.example/cover.png?signature=example'}]}));
  const extra={...deps(send),validateImageUrl:async value=>new URL(value),fetchImage:async(url,options)=>{captured={url,options};return new Response(png);}};
  const out=await generateCover(email,input,extra);expect(out.image).toMatch(/^data:image\/png;base64,/);expect(captured.url).toContain('signature=example');expect(captured.options.redirect).toBe('error');expect(captured.options.headers).toBeUndefined();
  await expect(generateCover(email,input,{...deps(async()=>new Response(JSON.stringify({data:[{url:'https://127.0.0.1/private'}]}))),fetchImage:async()=>{throw Error('must not fetch');}})).rejects.toThrow('内网');
  await expect(generateCover(email,input,{...extra,fetchImage:async()=>new Response(Buffer.alloc(8*1024*1024+1))})).rejects.toThrow('大小限制');
  await expect(generateCover(email,input,{...extra,fetchImage:async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/'}})})).rejects.toThrow('HTTP 302');
 });
 it('兼容 Flowso 支持的 output、嵌套图片及聊天格式，并保持相同地址保护',async()=>{
  const data=`data:image/png;base64,${png.toString('base64')}`;
  const payloads=[
   {output:[{image_base64:png.toString('base64')}]},
   {data:[null,{}, {image_url:{url:data}}]},
   {choices:[{message:{images:[{image_url:{url:data}}]}}]},
   {choices:[{message:{content:[{type:'image_url',image_url:{url:data}}]}}]},
   {choices:[{message:{content:`图片：${data}`}}]},
  ];
  for(const payload of payloads){
   const result=await generateCover(email,input,deps(async()=>new Response(JSON.stringify(payload))));
   expect((await sharp(Buffer.from(result.image.split(',')[1],'base64')).metadata()).width).toBe(900);
  }
  let fetched=false;
  const unsafe={choices:[{message:{content:[{image_url:{url:'https://127.0.0.1/private.png'}}]}}]};
  await expect(generateCover(email,input,{...deps(async()=>new Response(JSON.stringify(unsafe))),fetchImage:async()=>{fetched=true;}})).rejects.toThrow('内网');expect(fetched).toBe(false);
  let captured;const remote={choices:[{message:{content:'Result: https://cdn.example/cover.png?signature=example.'}}]};
  await generateCover(email,input,{...deps(async()=>new Response(JSON.stringify(remote))),validateImageUrl:async value=>new URL(value),fetchImage:async(url,options)=>{captured={url,options};return new Response(png);}});
  expect(captured.url).toBe('https://cdn.example/cover.png?signature=example');expect(captured.options.headers).toBeUndefined();expect(captured.options.redirect).toBe('error');
 });
 it('百炼原生接口使用真实 undici 传输，解析原生图片且保留费用预留',async()=>{
  const agent=new MockAgent();agent.disableNetConnect();let request;
  agent.get('https://images.example').intercept({path:'/api/v1/services/aigc/multimodal-generation/generation',method:'POST'}).reply(200,options=>{
   request=JSON.parse(options.body);return {output:{choices:[{message:{content:[{image:`data:image/png;base64,${png.toString('base64')}`} ]}}]}};
  });
  try {
   const config={baseUrl:'https://images.example/compatible-mode/v1',model:'qwen-image-2.1-turbo',apiKey:'secret',requestMode:'dashscope'};
   const result=await generateCover(email,input,{...deps(modelFetch),agent,config});expect(result.image).toMatch(/^data:image\/png;base64,/);expect(request.model).toBe(config.model);expect(request.input.messages[0].content[0].text).toContain(input.line);expect(request.parameters).toEqual({n:1,size:'1024*1360'});
   expect(fs.existsSync(path.join(dir,'data/model-spend.sqlite'))).toBe(true);
  } finally {await agent.close();}
 });
 it('rejects invalid images and a source changed during generation',async()=>{
  await expect(generateCover(email,input,deps(async()=>new Response(JSON.stringify({data:[{b64_json:'bm90YW5pbWFnZQ=='}]}))))).rejects.toThrow('无法读取');
  const send=async()=>{const s=readWorkspace(email);s.customers[0].drops[0].shells.小红书[0].title='新标题';writeWorkspace(email,s);return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));};
  await expect(generateCover(email,input,deps(send))).rejects.toThrow('原稿已变化');
 });
});
