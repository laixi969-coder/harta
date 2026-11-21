// Exercise real grade, policy, intent and follow-up writes in a disposable Harta workspace.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {ADMIN_EMAIL} from '../lib/auth.mjs';
import {readWorkspace,writeWorkspace} from '../lib/workspace.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),original=process.cwd();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-grades-'));
const at=new Date(Date.now()-300000).toISOString();
const quote='孩子七岁，约好了周六到校试听钢琴。';
function lead(id,customerId,name,extra={}) {
  return {id,customerId,authorId:id,authorName:name,platform:'抖音',stage:'待核实',messages:[],events:[],sourcePaths:['unknown'],signalIds:[],...extra};
}
const need=(id,title,stage)=>({id,title,stage,customerId:'shop',leadId:'buyer',revision:1,events:[],signalIds:[],productIds:[],skuIds:[]});
let browser,server;
try {
  for(const item of ['index.html','login.html','register.html','css','js','images','vendor'])fs.cpSync(path.join(root,item),path.join(dir,item),{recursive:true});
  process.chdir(dir);
  const customers=[['music','音乐教育'],['kitchen','厨房收纳'],['shop','电商采购']].map(([id,name])=>({id,name,hunt:name,pitch:name,track:'存量',packs:[],drops:[]}));
  writeWorkspace(ADMIN_EMAIL,{seedVersion:999,usingId:'music',customers,acquisition:{
    leads:[lead('parent','music','试听家长',{messages:[{id:'in',direction:'inbound',channel:'私信',text:quote,receivedAt:at,createdAt:at,evidence:'本次实际来信'},
      {id:'out',direction:'outbound',channel:'私信',text:'已登记',status:'sent_manual',sentAt:at,replyTo:'in'}]}),
      lead('spare','music','尚未咨询'),lead('measure','kitchen','异地量尺'),lead('later','kitchen','未来装修'),
      lead('buyer','shop','采购联系人',{stage:'已成交'}),lead('service','shop','售后客户')],
    opportunities:[need('closed','之前的订单','已成交'),need('repeat','本次采购','了解需求')]}});
  const probe=http.createServer().listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(r=>probe.close(r));
  const origin='http://127.0.0.1:'+port,password='local-qualification-acceptance';
  server=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:dir,env:{...process.env,TZ:'UTC',PORT:String(port),HARTA_SETUP_PASSWORD:password,HARTA_PUBLIC_ORIGIN:'',HARTA_TRUST_PROXY:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw new Error('服务未启动');})]);
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const context=await browser.newContext({extraHTTPHeaders:{origin},viewport:{width:1280,height:840},timezoneId:'Asia/Shanghai'});
  assert.equal((await context.request.post(origin+'/api/login',{data:{email:ADMIN_EMAIL,password}})).status(),200);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(15000);await page.route('https://**/*',r=>r.abort());
  const crm=page.locator('#cm-conversations'),home=page.locator('#cm-workbench');
  async function openCRM(){
    await home.locator('h1').waitFor({state:'attached'});
    if (!await crm.isVisible()) await home.getByRole('button',{name:'查看客户跟进',exact:true}).click();
    await crm.getByRole('heading',{name:'客户跟进',exact:true}).waitFor();
  }
  async function selectBusiness(id){await crm.locator('[data-cm-business]').selectOption(id);}
  async function save(form,route,action) {
    const wait=page.waitForResponse(r=>r.url().endsWith('/api/acquisition/'+route) && r.request().postDataJSON()?.action===action);
    await form.locator('button[type=submit]').click();const response=await wait;
    assert.equal(response.status(),200,(await response.json()).error);
    await form.waitFor({state:'hidden'});
  }
  async function qualify(fit,need,commitment,note,code,verifySource=false) {
    await crm.getByText('评定线索',{exact:true}).click();
    const f=crm.locator('[data-cm-form=qualify-lead]');
    await f.getByLabel('业务适配').selectOption(fit);await f.getByLabel('客户需求').selectOption(need);
    await f.getByLabel('客户已同意的下一步').selectOption(commitment);
    if(await f.getByLabel('实际沟通时间').isVisible()){
      const actual=await page.evaluate(()=>{const d=new Date(Date.now()-300000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);});
      await f.getByLabel('实际沟通时间').fill(actual);
    }
    if(verifySource){
      assert.equal(await f.getByLabel('评定来源').inputValue(),'message:in');assert.equal(await f.locator('[data-grade-quote]').innerText(),quote);
      assert.equal(await f.getByLabel('实际沟通时间').isVisible(),false);
    }
    await f.getByLabel('本次判断依据').fill(note);
    assert.ok((await f.locator('output').innerText()).includes(code));
    await save(f,'commerce','qualify-lead');
    await crm.locator('[data-grade-code]').filter({hasText:code}).first().waitFor();
  }
  await page.goto(origin,{waitUntil:'domcontentloaded'});await openCRM();
  await qualify('yes','specific','appointment','校区可承接该年龄，家长已约周六试听','A 级',true);
  await crm.getByText('查看评定依据',{exact:true}).click();
  assert.ok((await crm.getByRole('region',{name:'线索分级'}).innerText()).includes(quote));
  await page.locator('[data-nav=workbench]').click();
  await home.getByText('A 级待排期',{exact:true}).waitFor();
  await home.locator('[aria-label=今天值得处理] [data-cm=open-contact][data-id=parent]').click();
  await crm.getByRole('button',{name:'安排下一步'}).click();
  const follow=crm.locator('[data-cm-form=contact-followup]');
  assert.equal(await follow.getByLabel('下一步',{exact:true}).evaluate(el=>document.activeElement===el),true);
  await follow.getByLabel('实际进展或阶段变化依据').fill('与家长约好试听');
  await follow.getByLabel('下一步',{exact:true}).fill('准备试听教室');
  const tomorrow=new Date(Date.now()+86400000);
  await follow.getByLabel('下次跟进时间').fill(new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000).toISOString().slice(0,16));
  const expectedNextAt=await follow.getByLabel('下次跟进时间').evaluate(el=>new Date(el.value).toISOString());
  await save(follow,'lead','update');
  await crm.locator('[data-contact-filter=grade]').selectOption('A');
  assert.equal(await crm.locator('aside [data-cm=open-contact]').count(),1);
  await crm.locator('summary').filter({hasText:'本业务分级标准'}).click();
  await crm.getByText('调整标准',{exact:true}).click();
  const policy=crm.locator('[data-cm-form=qualification-policy]');
  await policy.getByLabel('本业务的适配条件').fill('本校可承接该年龄和课程');
  await policy.getByLabel('确认预约或试听').uncheck();
  await save(policy,'commerce','qualification-policy');
  await crm.getByRole('heading',{name:'没有匹配的联系人'}).waitFor();
  await crm.locator('[data-contact-filter=grade]').selectOption('review');
  await crm.getByText('B 级 · 待复核',{exact:true}).waitFor();
  await crm.getByText('撤销评定',{exact:true}).click();const clear=crm.locator('[data-cm-form=clear-qualification]');
  await clear.getByLabel('撤销原因').fill('核对后发现原约定属于另一门课');await save(clear,'commerce','clear-qualification');
  await crm.locator('[data-contact-filter=grade]').selectOption('pending');
  await crm.locator('aside [data-id=parent]').click();await crm.getByText('分级记录（2）',{exact:true}).click();
  assert.ok((await crm.getByRole('region',{name:'线索分级'}).innerText()).includes('核对后发现原约定属于另一门课'));
  await selectBusiness('kitchen');await qualify('no','specific','appointment','不在本次上门量尺覆盖区','不适配');
  await crm.locator('aside [data-id=later]').click();await qualify('unknown','exploring','none','半年后才装修，目前只收集尺寸信息','C 级');
  await selectBusiness('shop');await crm.locator('[data-cm=select-op][data-id=repeat]').click();
  await qualify('yes','specific','order','确认数量与供货条件，约定下周打样','A 级');
  await crm.locator('[data-cm=select-op][data-id=closed]').click();await crm.locator('[data-grade-code=won]').waitFor();
  await crm.locator('aside [data-id=service]').click();await crm.getByText('咨询类型与进展',{exact:true}).click();
  await crm.locator('[data-cm-detail="shop:intent-track-service-service"] > summary').click();
  const track=crm.locator('[data-cm-form=intent-track]').filter({has:page.locator('input[value=service]')});
  await track.getByLabel('实际情况或依据').fill('已核实售后维修单');await save(track,'lead','intent-track');
  await crm.locator('[data-grade-code=service]').waitFor();
  await crm.locator('[data-contact-filter=intent]').selectOption('service');assert.equal(await crm.locator('aside [data-cm=open-contact]').count(),1);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.reload();await openCRM();await selectBusiness('shop');await crm.locator('aside [data-id=buyer]').click();
  await crm.locator('[data-grade-code=A]').waitFor();
  assert.equal(readWorkspace(ADMIN_EMAIL).acquisition.opportunities.find(o=>o.id==='repeat').stage,'了解需求');
  await crm.getByText('更新阶段、产品与下一步',{exact:true}).click();
  const closeNeed=crm.locator('[data-cm-form=opportunity][data-id=repeat]');
  await closeNeed.getByLabel('本次需求阶段').selectOption('已成交');
  await closeNeed.getByLabel('本次判断或跟进依据').fill('核对了本次采购订单');
  await save(closeNeed,'commerce','opportunity');
  await page.setViewportSize({width:1280,height:840});await page.locator('[data-nav=workbench]').click();
  await home.getByText('全部业务结果',{exact:true}).click();
  await home.getByText('按结束前的等级看购买需求',{exact:true}).click();
  assert.deepEqual(await home.locator('.cm-grade-outcomes tbody tr').allTextContents(),['A 级10','无有效评定10']);
  const saved=readWorkspace(ADMIN_EMAIL).acquisition;
  assert.equal(saved.leads.find(l=>l.id==='parent').qualification.cleared,true);
  assert.equal(saved.leads.find(l=>l.id==='parent').nextAt,expectedNextAt);
  assert.equal(saved.opportunities.find(o=>o.id==='repeat').gradeAtClose.code,'A');
  assert.equal(saved.qualificationPolicies.length,1);assert.deepEqual(errors,[]);
  console.log('通过：音乐教育 A → 标准变化 B → 撤销，厨房不适配 / C，电商成交与复购 A 并存，售后分类，工作台排期，成交前分级复盘，手机筛选和刷新持久化。');
} finally {
  if(browser)await browser.close();
  if(server && server.exitCode===null){server.kill();await once(server,'exit');}
  process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});
}
