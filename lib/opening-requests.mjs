import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {monthlyEstimate,PRICING_VERSION} from '../js/pricing-model.js';

const file=()=>path.join(process.cwd(),'data','opening-requests.json');
export function openingRequests(){
  try{return JSON.parse(fs.readFileSync(file(),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
}
function store(rows){
  fs.mkdirSync(path.dirname(file()),{recursive:true,mode:0o700});
  const tmp=file()+'.'+crypto.randomUUID();
  try{fs.writeFileSync(tmp,JSON.stringify(rows),{mode:0o600});fs.renameSync(tmp,file());}finally{fs.rmSync(tmp,{force:true});}
}
export function requestOpening(input){
  const email=String(input.email||'').trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('请填写可联系的邮箱');
  const {plan,costs,totalCents}=monthlyEstimate(input.plan,input.budgets||{});
  const rows=openingRequests(),version=PRICING_VERSION;
  if(rows.some(r=>r.email===email && r.plan===plan.id && r.version===version && JSON.stringify(r.costs)===JSON.stringify(costs)))return;
  if(rows.length>=5000)throw new Error('暂时无法接收新申请，请稍后重试');
  store([{id:crypto.randomUUID(),email,plan:plan.id,planName:plan.name,costs,totalCents,version,at:new Date().toISOString()},...rows]);
}
export function resolveOpening(id,email){
  const rows=openingRequests();
  if(rows.some(r=>r.id===id&&r.email===email))store(rows.filter(r=>r.id!==id||r.email!==email));
}
