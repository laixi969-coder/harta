import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const script=name=>fs.readFileSync(fileURLToPath(new URL('../browser-extension/harta-connector/'+name,import.meta.url)),'utf8');
const domains={抖音:['douyin.com','douyinstatic.com','douyincdn.com','bytecdn.cn','bytedance.com','byteimg.com','bytednsdoc.com','pstatp.com','snssdk.com','amemv.com','ixigua.com','zijieapi.com','bytedance.net','bytegecko.com','bytedapm.com','volccdn.com'],小红书:['xiaohongshu.com','xhscdn.com','xhslink.com']};
export function browserExecutable(){return [process.env.HARTA_BROWSER_EXECUTABLE,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&fs.existsSync(p))||'';}
export function platformPage(raw,platform){const u=new URL(raw),domain=platform==='抖音'?'douyin.com':platform==='小红书'?'xiaohongshu.com':'';if(!domain||u.protocol!=='https:'||u.port||u.username||u.password||![`www.${domain}`,`creator.${domain}`].includes(u.hostname))throw new Error('页面不属于当前平台');return u.href;}
export function allowedResource(raw,platform){try{const u=new URL(raw);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(domains[platform]||[]).some(d=>u.hostname===d||u.hostname.endsWith('.'+d));}catch{return false;}}
export const home=platform=>platform==='抖音'?'https://www.douyin.com/':'https://www.xiaohongshu.com/explore';
let browserPromise;
async function browser(){if(!browserPromise)browserPromise=chromium.launch({executablePath:browserExecutable()||undefined,headless:true,chromiumSandbox:true}).then(b=>{b.on('disconnected',()=>{browserPromise=null;});return b;}).catch(e=>{browserPromise=null;throw e;});return browserPromise;}
export async function createRuntime(row,{getBrowser=browser}={}){
 const b=await getBrowser(),context=await b.newContext({viewport:{width:1280,height:900},locale:'zh-CN',acceptDownloads:false,serviceWorkers:'block',storageState:row.storageState});
 await context.route('**/*',route=>{const req=route.request();let allowed=allowedResource(req.url(),row.platform);if(req.isNavigationRequest()&&req.frame()===req.frame().page().mainFrame()){try{platformPage(req.url(),row.platform);}catch{allowed=false;}}return allowed?route.continue():route.abort('blockedbyclient');});
 const login=await context.newPage();context.on('page',p=>{if(p!==login)p.on('dialog',d=>d.dismiss());});login.on('dialog',d=>d.dismiss());
 const pages=new Map();pages.set(home(row.platform),login);
 async function page(url){url=platformPage(url,row.platform);let p=pages.get(url);if(!p||p.isClosed()){p=await context.newPage();pages.set(url,p);}if(p.url()!==url)await p.goto(url,{waitUntil:'domcontentloaded',timeout:25000});return p;}
 async function inject(p,name){await p.evaluate(script(name));}
 async function execute(p,op,args=[]){platformPage(p.url(),row.platform);return p.evaluate(async({op,args})=>{try{return {value:await globalThis.hartaDelivery[op](...args)};}catch(e){return {error:e.message,status:e.status||'unsupported'};}},{op,args}).then(r=>{if(r.error)throw Object.assign(new Error(r.error),{status:r.status});return r.value;});}
 return {
  async open(){await login.goto(home(row.platform),{waitUntil:'domcontentloaded',timeout:25000});const button=login.getByRole('button',{name:/^(登录|登录\/注册)$/});if(await button.count()===1)await button.click({timeout:3000}).catch(()=>{});},
  async actor(){const p=await page(home(row.platform));await inject(p,'delivery.js');return execute(p,'actor');},
  async frame(){platformPage(login.url(),row.platform);return {image:(await login.screenshot({type:'jpeg',quality:85})).toString('base64'),width:1280,height:900,url:login.url()};},
  async click(x,y){platformPage(login.url(),row.platform);await login.mouse.click(x,y);},
  async drag(x,y,toX,toY){platformPage(login.url(),row.platform);await login.mouse.move(x,y);await login.mouse.down();try{await login.mouse.move(toX,toY,{steps:20});}finally{await login.mouse.up();}},
  async state(){return context.storageState({indexedDB:true});},
  async collect(job){const p=await page(job.targetUrl);await inject(p,'collector.js');return p.evaluate(options=>globalThis.hartaReadPage(options),{kind:job.kind,limit:job.limit,scrollRounds:3});},
  async prepare(job,actor,assets){const p=await page(job.targetUrl);await inject(p,'delivery.js');for(const asset of assets){const base64=asset.buffer.toString('base64'),size=4*1024*1024,total=Math.ceil(base64.length/size),meta={id:asset.id,name:asset.name,mime:asset.mime};for(let i=0;i<total;i++)await execute(p,'assetChunk',[meta,base64.slice(i*size,(i+1)*size),i,total]);}return execute(p,'prepare',[job,actor.actorId,assets.map(a=>({id:a.id,name:a.name,mime:a.mime}))]);},
  async submit(job){const p=pages.get(platformPage(job.targetUrl,row.platform));if(!p)throw new Error('已准备的页面不存在');return execute(p,'submit',[job]);},
  async inbox(rule){const p=await page(rule.scopeUrl);await inject(p,'delivery.js');return execute(p,'inbox',[rule]);},
  async close(){await context.close();}
 };
}
