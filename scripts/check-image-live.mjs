// Real paid provider check using only a synthetic business and cover prompt.
// Global spend accounting is retained; only the synthetic workspace is removed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ADMIN_EMAIL, workspaceId } from '../lib/auth.mjs';
import { readLlm } from '../lib/llm.mjs';
import { publicImageConfig, saveImageConfig, generateCover } from '../lib/image-generation.mjs';
import { writeWorkspace } from '../lib/workspace.mjs';
import { withModelAccount } from '../lib/model-spend.mjs';

const configure=process.argv.slice(2).includes('--configure');
if(process.argv.slice(2).some(arg=>arg!=='--configure'))throw new Error('仅支持 --configure');
const provider=readLlm().providers.dashscope;
if(!provider?.apiKey || !provider.baseUrl)throw new Error('尚未配置百炼接口和密钥');
const current=publicImageConfig();
if(configure && (current.baseUrl || current.model || current.hasKey))throw new Error('已有出图配置，请在设置中检查，验收不会覆盖');
const email=`harta-image-check-${crypto.randomUUID()}@example.invalid`,customerId='synthetic-business',packId='synthetic-cover';
const workspaceFile=path.join('data','workspaces',`${workspaceId(email)}.json`);
const budgetId=crypto.createHash('sha256').update(JSON.stringify([email.toLowerCase(),customerId])).digest('hex');
const budgetDirectory=path.join('data','openfind',budgetId);
if(fs.existsSync(workspaceFile) || fs.existsSync(budgetDirectory))throw new Error('临时验收标识冲突，请重试');
const config={baseUrl:provider.baseUrl,apiKey:provider.apiKey,model:'qwen-image-2.1-turbo',requestMode:'dashscope'};
try {
  writeWorkspace(email,{seedVersion:999,customers:[{id:customerId,name:'合成厨房示例',drops:[{id:packId,tier:'今日',shells:{小红书:[{title:'厨房收纳先量哪里',body:'合成测试内容。'}]},copies:{}}]}]});
  const output=await withModelAccount(ADMIN_EMAIL,()=>generateCover(email,{customerId,packId,platform:'小红书',index:0,line:'厨房先量尺寸',layout:'温暖明亮的厨房，保留标题区域'}, {config}));
  const bytes=Buffer.from(output.image.split(',')[1]||'','base64'),info=await sharp(bytes).metadata();
  if(info.format!=='png' || info.width!==900 || info.height!==1200 || output.line!=='厨房先量尺寸')throw new Error('生成图片尺寸或格式不正确');
  if(configure){
    const latest=publicImageConfig();if(latest.baseUrl || latest.model || latest.hasKey)throw new Error('验收期间出图配置已变化，未覆盖');
    await saveImageConfig({baseUrl:config.baseUrl,apiKey:config.apiKey,model:config.model,requestMode:config.requestMode});
  }
  process.stdout.write(`百炼真实出图成功，得到 900×1200 PNG；${configure?'已接入封面设置':'未修改出图设置'}。\n`);
} finally {
  fs.rmSync(workspaceFile,{force:true});
  fs.rmSync(budgetDirectory,{recursive:true,force:true});
}
