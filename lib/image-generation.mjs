import path from 'node:path';
import sharp from 'sharp';
import { Agent, fetch as undiciFetch } from 'undici';
import { readSecretConfig, writeSecretConfig } from './secret-config.mjs';
import { assertPublicUrl, publicLookup } from './recon.mjs';
import { modelFetch } from './model-spend.mjs';
import { reserveModelRequest, withBusinessModelBudget } from './model-budget.mjs';
import { readWorkspace } from './workspace.mjs';
import { packAsSent } from './pack-edits.mjs';

const file = () => path.join(process.cwd(), 'data', 'image-model.json');
const empty = () => ({providers:{image:{baseUrl:'',model:'',apiKey:''}}});
const provider = () => readSecretConfig(file(),empty).providers.image;
export function publicImageConfig() {
  const p=provider();return {baseUrl:p.baseUrl,model:p.model,requestMode:p.requestMode || 'auto',hasKey:Boolean(p.apiKey)};
}
export async function saveImageConfig(input) {
  for (const [key,max] of [['baseUrl',2048],['model',200],['apiKey',4096]]) if (input[key]!=null && (typeof input[key]!=='string' || input[key].length>max)) throw new Error('出图配置格式不正确');
  const old=provider(), baseUrl=(input.baseUrl || '').trim().replace(/\/+$/,'');
  if (baseUrl) {const u=await assertPublicUrl(baseUrl);if(u.protocol!=='https:'||u.search||u.hash) throw new Error('出图接口须使用不带查询参数的公网 HTTPS 地址');}
  const requestMode=input.requestMode ?? old.requestMode ?? 'auto';
  if(!['auto','minimal','legacy','dashscope'].includes(requestMode))throw new Error('出图请求参数模式不正确');
  const next={baseUrl,model:(input.model || '').trim(),requestMode,apiKey:input.clearKey===true?'':(input.apiKey || '').trim() || old.apiKey};
  writeSecretConfig(file(),{providers:{image:next}});return publicImageConfig();
}
async function readLimited(response, limit) {
  if (!response.body) throw new Error('出图接口没有返回内容');
  const reader=response.body.getReader(),chunks=[];let total=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new Error('出图响应超过大小限制');}chunks.push(Buffer.from(value));}} finally {reader.releaseLock();}
  return Buffer.concat(chunks);
}
// Compatible image services return images under different OpenAI-style keys.
// Extract a candidate only; decoding, URL validation and download limits are
// applied identically regardless of the provider's response shape.
function imageResult(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const bags=[];
  for (const key of ['data','images','output']) if (Array.isArray(payload[key])) bags.push(...payload[key]);
  const nativeMessage=payload.output && !Array.isArray(payload.output) ? payload.output.choices?.[0]?.message : null;
  if(Array.isArray(nativeMessage?.content)) bags.push(...nativeMessage.content);
  const message=Array.isArray(payload.choices) ? payload.choices[0]?.message : null;
  if (message && typeof message === 'object') {
    if (Array.isArray(message.images)) bags.push(...message.images);
    if (Array.isArray(message.content)) bags.push(...message.content);
    if (typeof message.content === 'string') {
      const data=message.content.match(/data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/i);
      if(data) bags.push({b64_json:data[1]});
      else { const url=message.content.match(/https?:\/\/[^\s<>"']+/i); if(url) bags.push({url:url[0].replace(/[)\].,]+$/,'')}); }
    }
  }
  for (const row of bags) {
    if (!row || typeof row !== 'object') continue;
    const nested=typeof row.image_url==='string' ? row.image_url : row.image_url?.url;
    for (const value of [row.b64_json,row.b64,row.image_base64,row.url,nested,row.image]) {
      if(typeof value!=='string' || !value.trim()) continue;
      const raw=value.trim(), data=raw.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/i);
      if(data) return {encoded:data[1]};
      if(/^https?:\/\//i.test(raw)) return {url:raw};
      if(value===row.b64_json || value===row.b64 || value===row.image_base64) return {encoded:raw};
    }
  }
  return null;
}
export async function generateCover(email, input, deps = {}) {
  const space=readWorkspace(email), customer=space.customers.find(c=>c.id===input.customerId);
  const pack=[...(customer?.drops || []),...(customer?.packs || [])].find(p=>p.id===input.packId);
  if (!pack || !Number.isInteger(input.index) || input.index<0 || !Object.hasOwn(pack.shells || {},input.platform) || !pack.shells[input.platform][input.index]) throw new Error('找不到该业务的作品');
  const line=typeof input.line==='string'?input.line.trim():'';
  if (!line || Array.from(line).length>28) throw new Error('封面文字需为1至28字');
  if (input.layout != null && (typeof input.layout !== 'string' || input.layout.length > 2000)) throw new Error('封面排版说明需为2000字以内的文字');
  const layout=(input.layout || '').trim();
  const source=packAsSent(pack).shells[input.platform][input.index];
  const p=deps.config || provider();if (!p.apiKey || !p.baseUrl || !p.model) throw new Error('请联系管理员在设置中配置出图接口、模型和密钥');
  const run=deps.budget || withBusinessModelBudget, send=deps.send || modelFetch, reserve=deps.reserve || reserveModelRequest;
  return run(email,customer.id,'content-generation',async()=>{
    const base=await (deps.validateUrl || assertPublicUrl)(p.baseUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash) throw new Error('出图接口地址不合法');
    const agent=deps.agent || new Agent({connect:{lookup:publicLookup,timeout:10000}});
    try {
      const signal=AbortSignal.timeout(120000);reserve(signal);
      const prompt=`制作${input.platform}竖版封面背景图。封面主题：${line}。${layout ? `用户提供的画面与排版参考：${layout}。` : ''}只生成背景，不生成任何文字、数字、标识或水印；画面给标题预留清晰留白。仅基于主题和用户参考设计，不暗示未经核实的事实或效果。`;
      // Some providers reject OpenAI's size or response_format parameters.
      // Select once before sending; automatic retries could charge twice.
      const gptImage=/^(?:gpt-image|chatgpt-image)(?:-|$)/i.test(p.model);
      const customPortrait=/^gpt-image-2(?:[.-]|$)/i.test(p.model);
      const mode=p.requestMode || 'auto';
      const minimal=mode==='minimal' || (mode==='auto' && !gptImage && /grok|flux|stable|sdxl|wanx|jimeng|cogview|imagen/i.test(p.model));
      const native=mode==='dashscope';
      const request=native?{model:p.model,input:{messages:[{role:'user',content:[{text:prompt}]}]},parameters:{n:1,size:'1024*1360'}}:{model:p.model,prompt,n:1,...(minimal?{}:mode==='legacy'?{size:'1024x1024',response_format:'b64_json'}:{size:customPortrait?'1024x1360':gptImage?'1024x1536':'1024x1024',...(gptImage?{}:{response_format:'b64_json'})})};
      const endpoint=native?new URL('/api/v1/services/aigc/multimodal-generation/generation',base).href:`${p.baseUrl.replace(/\/+$/,'')}/images/generations`;
      const res=await send(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${p.apiKey}`},body:JSON.stringify(request),spendBody:{__hartaImageGeneration:true},transportFetch:undiciFetch,dispatcher:agent,signal});
      if(!res.ok)throw new Error(`出图服务返回 HTTP ${res.status}`);
      let payload;try{payload=JSON.parse((await readLimited(res,15*1024*1024)).toString('utf8'));}catch(e){if(e.message.includes('大小限制'))throw e;throw new Error('出图服务返回了无效数据');}
      const result=imageResult(payload),encoded=result?.encoded || '';
      let bytes;
      if(encoded){
        if(encoded.length>12*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('出图服务返回的图片格式不正确');
        bytes=Buffer.from(encoded,'base64');
      } else if(result?.url){
        // The provider may return a signed image URL. Never forward its API
        // key, follow redirects, or connect to private addresses.
        if(result.url.length>8192)throw new Error('出图地址过长');
        const imageUrl=await (deps.validateImageUrl || assertPublicUrl)(result.url);
        if(imageUrl.protocol!=='https:' || imageUrl.username || imageUrl.password || imageUrl.hash)throw new Error('出图地址不合法');
        const imageResponse=await (deps.fetchImage || undiciFetch)(imageUrl.href,{method:'GET',redirect:'error',dispatcher:agent,signal});
        if(!imageResponse.ok)throw new Error(`读取出图结果失败 HTTP ${imageResponse.status}`);
        bytes=await readLimited(imageResponse,8*1024*1024);
      } else throw new Error('出图服务未返回可用图片');
      if(bytes.length>8*1024*1024)throw new Error('出图文件超过8MB');
      let png;try{png=await sharp(bytes,{limitInputPixels:25_000_000}).rotate().resize(900,1200,{fit:'cover'}).png().toBuffer();}catch{throw new Error('出图服务返回的图片无法读取');}
      const latest=readWorkspace(email), c=latest.customers.find(c=>c.id===input.customerId), latestPack=[...(c?.drops||[]),...(c?.packs||[])].find(p=>p.id===input.packId);
      if(!latestPack || JSON.stringify(packAsSent(latestPack).shells?.[input.platform]?.[input.index])!==JSON.stringify(source)) throw new Error('出图期间原稿已变化，请重新生成');
      return {image:`data:image/png;base64,${png.toString('base64')}`,line};
    } finally {if(!deps.agent)await agent.destroy();}
  });
}
