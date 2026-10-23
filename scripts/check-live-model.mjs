// Explicitly opt-in: sends synthetic material to the configured paid model.
// Uses an existing local session; never prints credentials or publishes content.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
if(!args.includes('--allow-paid'))throw new Error('真实付费验收需显式传入 --allow-paid；会创建标记为验收的业务并保留结果');
const root=fileURLToPath(new URL('..',import.meta.url));
const origin=new URL(process.env.HARTA_LIVE_ORIGIN||'http://127.0.0.1:5173');
if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.username||origin.password)throw new Error('只支持本机127.0.0.1服务');
const sessions=JSON.parse(fs.readFileSync(path.join(root,'data/sessions.json'),'utf8'));
const valid=Object.entries(sessions).filter(([,s])=>s.exp>Date.now()&&s.user?.email&&(!process.env.HARTA_LIVE_EMAIL||s.user.email===process.env.HARTA_LIVE_EMAIL));
if(new Set(valid.map(([,s])=>s.user.email)).size>1)throw new Error('多个账号已登录，请用 HARTA_LIVE_EMAIL 明确选择验收账号');
const session=valid.sort((a,b)=>b[1].exp-a[1].exp)[0];
if(!session)throw new Error('请先在本机Harta登录');
const headers={cookie:'harta_sid='+session[0],origin:origin.origin};
async function request(route,body,extra={}) {
 const response=await fetch(new URL(route,origin),{method:body===undefined?'GET':'POST',headers:{...headers,...(body instanceof FormData?{}:{'content-type':'application/json'}),...extra},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(`${route}: HTTP ${response.status} ${error.error||''}`);}
 return response;
}
const startedAt=new Date().toISOString(),name='真实模型验收（合成资料） '+startedAt;
const evidence={startedAt,checks:[],customerId:'',packId:''};
const record=(check,details={})=>{evidence.checks.push({check,...details});console.log(JSON.stringify({check,...details}));};
const output=process.env.HARTA_LIVE_RESULT;
try {
 const form=new FormData();form.append('files',new Blob(['这是软件验收用的合成业务，不是真实客户。杭州厨房收纳咨询，为家庭提供厨房动线与储物布局建议。现有资料只有文字，可制作示意图；无客户案例、品牌授权、收费说明或效果数据。请保留未知项，不编造承诺。'],{type:'text/plain'}),'synthetic-live-check.txt');
 const batch=await(await request('/api/materials/analyze',form,{'x-harta-material-consent':'external-v1'})).json();
 assert.equal(batch.sources[0].kind,'文本');assert.ok(batch.analysis.engine?.model);assert.ok(batch.analysis.overview?.length>30);assert.ok(!batch.analysis.warning,batch.analysis.warning);
 record('paid-material-analysis',{model:batch.analysis.engine.model,sourceCount:batch.sources.length});
 const space=await(await request('/api/customers',{name,city:'杭州',pitch:'合成验收：厨房收纳和动线咨询；无真实业绩或报价',hunt:'家装',track:'存量',materialBatchId:batch.id})).json();
 const customer=space.customers.find(c=>c.name===name);assert.ok(customer);evidence.customerId=customer.id;
 await request('/api/today',{customerId:customer.id,goal:'leads'});record('generation-started',{customerId:customer.id});
 let completed;
 for(let i=0;i<240;i++){
  await delay(3000);const state=await(await request('/api/workspace')).json();const current=state.customers.find(c=>c.id===customer.id);
  assert.ok(current);if(current.lastFail)throw new Error(current.lastFail);
  if(!current.job){completed=current;break;}
  if(i%10===0)console.log(JSON.stringify({progress:current.job.progress,stage:current.job.stage}));
 }
 assert.ok(completed,'内容任务12分钟仍未完成，请检查任务状态，不要重复付费启动');
 const pack=completed.drops[0];assert.ok(pack?.id);evidence.packId=pack.id;
 const items=Object.values(pack.shells||{}).flat();assert.ok(items.length>0);assert.ok(items.some(x=>x.body||x.script||x.title));
 const persisted=await(await request('/api/workspace')).json();assert.equal(persisted.customers.find(c=>c.id===customer.id).drops[0].id,pack.id);
 record('generated-content-persisted',{packId:pack.id,items:items.length});
 for(const format of ['md','xlsx']){
  const response=await request('/api/content/export',{packId:pack.id,format});const bytes=await response.arrayBuffer();assert.ok(bytes.byteLength>100);assert.ok(Number(response.headers.get('x-harta-included'))>0,'导出不能是空批次');
  record('content-export',{format,bytes:bytes.byteLength,included:Number(response.headers.get('x-harta-included'))});
 }
 evidence.result='passed';
} catch(error) { evidence.result='failed';evidence.error=error.message;process.exitCode=1;console.error(error.message); }
finally { evidence.finishedAt=new Date().toISOString();if(output)fs.writeFileSync(output,JSON.stringify(evidence,null,2),{mode:0o600});console.log(JSON.stringify({result:evidence.result,customerId:evidence.customerId,packId:evidence.packId})); }
