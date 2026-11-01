import fs from 'node:fs';import path from 'node:path';
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 const u=new URL(typeof url==='string'?url:url.href||url.url);if(u.hostname!=='topic-model.invalid')return original(url,options);
 const request=JSON.parse(options.body),user=request.messages.find(m=>m.role==='user')?.content||'',system=request.messages.find(m=>m.role==='system')?.content||'';
 fs.appendFileSync(path.join(process.cwd(),'data','topic-model-requests.jsonl'),JSON.stringify({user})+'\n');
 if(fs.existsSync(path.join(process.cwd(),'data','topic-model-fail')))return Response.json({choices:[{message:{content:'invalid fixture JSON'}}]});
 if(system.includes('内容事实核对编辑')||user.includes('逐篇核对输入内容'))return Response.json({choices:[{message:{content:JSON.stringify({approved:false,issues:[{index:1,quote:'先记录收纳需求',reason:'验收用事实提示',fix:'核对需求依据'}]})}}]});
 return Response.json({choices:[{message:{content:JSON.stringify({title:'厨房收纳先看需求',script:'先记录收纳需求，再核对现场尺寸。',shots:user.includes('模式：图文')?'记录收纳需求\n核对厨房尺寸\n逐项比较方案':'0-3秒｜展示清单｜先记录需求\n3-15秒｜量尺｜核对尺寸\n15-30秒｜对比｜比较方案',cover:'先看使用需求',coverLayout:'清晰标题与尺寸示意',hook:'收纳不够用，先看哪里？',cta:'按实际情况核对清单',imagePlan:'纸笔示意与清单'})}}]});
};
